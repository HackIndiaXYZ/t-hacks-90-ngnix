import express from 'express';
import crypto from 'node:crypto';
import path from 'node:path';
import { existsSync } from 'node:fs';
import { db, tx } from './db.js';
import { distance, bbox, isLat, isLng, parseTags, anonName, rateLimiter, safetyLevel } from './util.js';
import { sendSms, smsConfigured } from './sms.js';
import { publicKey as pushPublicKey, saveSubscription, removeSubscription, touchLocation, pushNearby } from './push.js';
import { reverse, search, nearbyHelp, walkRoute } from './osm.js';

const DEV = process.argv.includes('--dev');
const PORT = DEV ? Number(process.env.API_PORT) || 8787 : Number(process.env.PORT) || 8787;
const SECRET = process.env.SAKHI_SECRET || 'dev-only-secret-change-me';
const SOS_RADIUS = 200;
const SOS_TTL = 2 * 60 * 60e3;
const FLAIRS = ['Review', 'Alert', 'Tip'];

const app = express();
app.disable('x-powered-by');
app.use(express.json({ limit: '20kb' }));

const ORIGINS = (process.env.CORS_ORIGIN || '*').split(',').map((o) => o.trim().replace(/\/+$/, '')).filter(Boolean);
app.use('/api', (req, res, next) => {
  const origin = req.headers.origin;
  if (origin && (ORIGINS.includes('*') || ORIGINS.includes(origin))) {
    res.setHeader('Access-Control-Allow-Origin', ORIGINS.includes('*') ? '*' : origin);
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Device');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS');
    res.setHeader('Access-Control-Max-Age', '86400');
  }
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});
app.get('/api/health', (req, res) => res.json({ ok: true }));

let lastJourneyCheck = 0;
app.use('/api', (req, res, next) => {
  if (Date.now() - lastJourneyCheck > 5000) {
    lastJourneyCheck = Date.now();
    try { checkJourneys(); } catch (err) { console.error(err); }
  }
  next();
});

function hashDevice(id) {
  id = String(id || '');
  if (!/^[A-Za-z0-9-]{16,64}$/.test(id)) return null;
  return crypto.createHmac('sha256', SECRET).update(id).digest('hex').slice(0, 24);
}
const author = (req) => hashDevice(req.get('x-device'));
function needAuthor(req, res, next) {
  req.author = author(req);
  if (!req.author) return res.status(400).json({ error: 'Missing device id' });
  next();
}
const bad = (res, error, status = 400) => res.status(status).json({ error });

const limits = {
  post: rateLimiter(5, 10 * 60e3),
  comment: rateLimiter(20, 10 * 60e3),
  vote: rateLimiter(120, 60e3),
  sos: rateLimiter(5, 10 * 60e3),
  journey: rateLimiter(10, 10 * 60e3),
};

function point(q) {
  const lat = Number(q.lat), lng = Number(q.lng);
  return isLat(lat) && isLng(lng) ? { lat, lng } : null;
}
const clamp = (v, lo, hi, d) => (v != null && v !== '' && Number.isFinite(Number(v)) ? Math.min(hi, Math.max(lo, Number(v))) : d);

const clients = new Map();

function send(c, event, data) {
  c.res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}
function broadcast(event, data) {
  for (const c of clients.values()) send(c, event, data);
}

function activeSos() {
  return db.prepare('SELECT * FROM sos WHERE resolved_at IS NULL AND updated_at > ?').all(Date.now() - SOS_TTL);
}
function publicSos(s, from) {
  const out = { id: s.id, lat: s.lat, lng: s.lng, accuracy: s.accuracy, startedAt: s.started_at, updatedAt: s.updated_at, resolved: !!s.resolved_at, auto: !!s.auto };
  if (from) out.distance = Math.round(distance(from.lat, from.lng, s.lat, s.lng));
  return out;
}
function alertNearby(s, event = 'sos') {
  for (const c of clients.values()) {
    if (c.author === s.owner || c.lat == null) continue;
    const d = distance(c.lat, c.lng, s.lat, s.lng);
    if (d <= SOS_RADIUS || c.alerted.has(s.id)) {
      c.alerted.add(s.id);
      send(c, event, publicSos(s, c));
    }
  }
}

app.get('/api/stream', (req, res) => {
  const id = String(req.query.client || '');
  if (!/^[A-Za-z0-9-]{8,64}$/.test(id)) return bad(res, 'Missing client id');
  res.set({ 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' });
  res.flushHeaders();
  const prev = clients.get(id);
  const c = { res, author: hashDevice(req.query.device), lat: prev?.lat ?? null, lng: prev?.lng ?? null, alerted: prev?.alerted ?? new Set() };
  clients.set(id, c);
  res.write('retry: 3000\n\n');
  const ping = setInterval(() => res.write('event: ping\ndata: {}\n\n'), 20e3);
  req.on('close', () => { clearInterval(ping); if (clients.get(id) === c) clients.delete(id); });
});

app.post('/api/presence', (req, res) => {
  const c = clients.get(String(req.body?.client || ''));
  const p = point(req.body || {});
  if (!c || !p) return bad(res, 'Unknown client or bad location');
  c.lat = p.lat; c.lng = p.lng;
  if (c.author) touchLocation(c.author, p.lat, p.lng);
  for (const s of activeSos()) {
    if (s.owner !== c.author && !c.alerted.has(s.id) && distance(p.lat, p.lng, s.lat, s.lng) <= SOS_RADIUS) {
      c.alerted.add(s.id);
      send(c, 'sos', publicSos(s, p));
    }
  }
  res.json({ ok: true });
});

app.get('/api/me', needAuthor, (req, res) => res.json({ name: anonName(req.author) }));

function loadPosts({ center, radius, tag, place, ids }, viewer) {
  const where = ['((SELECT COUNT(*) FROM flags f WHERE f.post_id = p.id) < 3 OR p.author = ?)'];
  const args = [viewer || ''];
  if (center) {
    const b = bbox(center.lat, center.lng, radius);
    where.push('p.lat BETWEEN ? AND ? AND p.lng BETWEEN ? AND ?');
    args.push(b.minLat, b.maxLat, b.minLng, b.maxLng);
  }
  if (tag) { where.push('EXISTS (SELECT 1 FROM post_tags t WHERE t.post_id = p.id AND t.tag = ?)'); args.push(tag); }
  if (place) { where.push('p.place = ?'); args.push(place); }
  if (ids) { where.push(`p.id IN (${ids.map(() => '?').join(',')})`); args.push(...ids); }
  const rows = db.prepare(`
    SELECT p.*,
      COALESCE((SELECT SUM(value) FROM votes v WHERE v.post_id = p.id), 0) AS score,
      (SELECT COUNT(*) FROM comments c WHERE c.post_id = p.id) AS comment_count,
      (SELECT value FROM votes v WHERE v.post_id = p.id AND v.voter = ?) AS my_vote
    FROM posts p ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
    ORDER BY p.created_at DESC LIMIT 1000`).all(viewer || '', ...args);

  const list = center
    ? rows.map((r) => ({ r, d: distance(center.lat, center.lng, r.lat, r.lng) })).filter((x) => x.d <= radius)
    : rows.map((r) => ({ r, d: null }));
  if (!list.length) return [];

  const tagRows = db.prepare(`SELECT post_id, tag FROM post_tags WHERE post_id IN (${list.map(() => '?').join(',')})`).all(...list.map((x) => x.r.id));
  const tags = new Map();
  for (const t of tagRows) (tags.get(t.post_id) || tags.set(t.post_id, []).get(t.post_id)).push(t.tag);

  return list.map(({ r, d }) => ({
    id: r.id,
    author: anonName(r.author),
    mine: r.author === viewer,
    lat: Math.round(r.lat * 1e4) / 1e4,
    lng: Math.round(r.lng * 1e4) / 1e4,
    place: r.place,
    flair: r.flair,
    rating: r.rating,
    title: r.title,
    body: r.body,
    tags: tags.get(r.id) || [],
    score: r.score,
    myVote: r.my_vote || 0,
    comments: r.comment_count,
    createdAt: r.created_at,
    distance: d == null ? null : Math.round(d),
  }));
}

const hot = (p) => (p.score + 1) / Math.pow((Date.now() - p.createdAt) / 36e5 + 2, 1.5);

app.get('/api/posts', (req, res) => {
  const center = point(req.query);
  const radius = clamp(req.query.radius, 100, 50000, 5000);
  const tag = req.query.tag ? String(req.query.tag).replace(/^#/, '').slice(0, 30) : null;
  const place = req.query.place ? String(req.query.place).slice(0, 60) : null;
  const sort = ['hot', 'new', 'top', 'near'].includes(req.query.sort) ? req.query.sort : 'hot';
  const posts = loadPosts({ center, radius, tag, place }, author(req));
  const sorters = {
    hot: (a, b) => hot(b) - hot(a),
    new: (a, b) => b.createdAt - a.createdAt,
    top: (a, b) => b.score - a.score || b.createdAt - a.createdAt,
    near: (a, b) => (a.distance ?? 0) - (b.distance ?? 0),
  };
  posts.sort(sorters[sort]);
  res.json({ posts: posts.slice(0, clamp(req.query.limit, 1, 100, 50)) });
});

app.post('/api/posts', needAuthor, (req, res) => {
  const b = req.body || {};
  const p = point(b);
  const flair = FLAIRS.includes(b.flair) ? b.flair : null;
  const rating = Number.isInteger(b.rating) ? b.rating : 0;
  const title = String(b.title || '').trim();
  const body = String(b.body || '').trim();
  const place = String(b.place || '').trim().replace(/\s+/g, ' ');
  if (!p) return bad(res, 'Location is required');
  if (!flair) return bad(res, 'Pick Review, Alert or Tip');
  if (rating < 0 || rating > 5) return bad(res, 'Rating must be 0 to 5');
  if (flair === 'Review' && rating < 1) return bad(res, 'A review needs a star rating');
  if (title.length < 3 || title.length > 120) return bad(res, 'Title must be 3 to 120 characters');
  if (body.length > 2000) return bad(res, 'Keep it under 2000 characters');
  if (place.length < 2 || place.length > 60) return bad(res, 'Name the place (2 to 60 characters)');
  if (!limits.post(req.author)) return bad(res, 'You are posting a lot. Try again in a few minutes.', 429);

  const tags = parseTags(`${title} ${body}`);
  const id = tx(() => {
    const r = db.prepare('INSERT INTO posts (author, lat, lng, place, flair, rating, title, body, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
      .run(req.author, p.lat, p.lng, place, flair, rating, title, body, Date.now());
    const postId = Number(r.lastInsertRowid);
    const addTag = db.prepare('INSERT OR IGNORE INTO post_tags (post_id, tag) VALUES (?, ?)');
    for (const t of tags) addTag.run(postId, t);
    db.prepare('INSERT INTO votes (post_id, voter, value) VALUES (?, ?, 1)').run(postId, req.author);
    return postId;
  });
  const [post] = loadPosts({ ids: [id] }, req.author);
  broadcast('post', { id, lat: post.lat, lng: post.lng });
  res.status(201).json({ post });
});

app.delete('/api/posts/:id', needAuthor, (req, res) => {
  const r = db.prepare('DELETE FROM posts WHERE id = ? AND author = ?').run(Number(req.params.id), req.author);
  if (!r.changes) return bad(res, 'Not found', 404);
  res.json({ ok: true });
});

app.post('/api/posts/:id/vote', needAuthor, (req, res) => {
  const id = Number(req.params.id);
  const value = Number(req.body?.value);
  if (![-1, 0, 1].includes(value)) return bad(res, 'Vote must be -1, 0 or 1');
  if (!db.prepare('SELECT 1 FROM posts WHERE id = ?').get(id)) return bad(res, 'Not found', 404);
  if (!limits.vote(req.author)) return bad(res, 'Slow down', 429);
  if (value === 0) db.prepare('DELETE FROM votes WHERE post_id = ? AND voter = ?').run(id, req.author);
  else db.prepare('INSERT INTO votes (post_id, voter, value) VALUES (?, ?, ?) ON CONFLICT (post_id, voter) DO UPDATE SET value = excluded.value').run(id, req.author, value);
  const { score } = db.prepare('SELECT COALESCE(SUM(value), 0) AS score FROM votes WHERE post_id = ?').get(id);
  res.json({ score, myVote: value });
});

const FLAG_REASONS = ['harassment', 'false', 'personal', 'spam', 'other'];
app.post('/api/posts/:id/flag', needAuthor, (req, res) => {
  const id = Number(req.params.id);
  const reason = FLAG_REASONS.includes(req.body?.reason) ? req.body.reason : null;
  if (!reason) return bad(res, `Reason must be one of: ${FLAG_REASONS.join(', ')}`);
  const post = db.prepare('SELECT author FROM posts WHERE id = ?').get(id);
  if (!post) return bad(res, 'Not found', 404);
  if (post.author === req.author) return bad(res, 'You cannot flag your own post');
  if (!limits.vote(req.author)) return bad(res, 'Slow down', 429);
  db.prepare('INSERT OR IGNORE INTO flags (post_id, flagger, reason, created_at) VALUES (?, ?, ?, ?)').run(id, req.author, reason, Date.now());
  const { n } = db.prepare('SELECT COUNT(*) AS n FROM flags WHERE post_id = ?').get(id);
  res.json({ ok: true, hidden: n >= 3 });
});

app.get('/api/posts/:id/comments', (req, res) => {
  const viewer = author(req);
  const rows = db.prepare('SELECT * FROM comments WHERE post_id = ? ORDER BY created_at ASC LIMIT 200').all(Number(req.params.id));
  res.json({ comments: rows.map((c) => ({ id: c.id, author: anonName(c.author), mine: c.author === viewer, body: c.body, createdAt: c.created_at })) });
});

app.post('/api/posts/:id/comments', needAuthor, (req, res) => {
  const id = Number(req.params.id);
  const body = String(req.body?.body || '').trim();
  if (body.length < 1 || body.length > 500) return bad(res, 'Comments are 1 to 500 characters');
  if (!db.prepare('SELECT 1 FROM posts WHERE id = ?').get(id)) return bad(res, 'Not found', 404);
  if (!limits.comment(req.author)) return bad(res, 'Slow down', 429);
  const now = Date.now();
  const r = db.prepare('INSERT INTO comments (post_id, author, body, created_at) VALUES (?, ?, ?, ?)').run(id, req.author, body, now);
  res.status(201).json({ comment: { id: Number(r.lastInsertRowid), author: anonName(req.author), mine: true, body, createdAt: now } });
});

app.get('/api/tags/trending', (req, res) => {
  const center = point(req.query);
  const radius = clamp(req.query.radius, 100, 50000, 5000);
  const since = Date.now() - 60 * 864e5;
  let rows;
  if (center) {
    const b = bbox(center.lat, center.lng, radius);
    rows = db.prepare(`SELECT t.tag, COUNT(*) AS n FROM post_tags t JOIN posts p ON p.id = t.post_id
      WHERE p.created_at > ? AND p.lat BETWEEN ? AND ? AND p.lng BETWEEN ? AND ?
      GROUP BY t.tag ORDER BY n DESC, MAX(p.created_at) DESC LIMIT 10`).all(since, b.minLat, b.maxLat, b.minLng, b.maxLng);
  } else {
    rows = db.prepare(`SELECT t.tag, COUNT(*) AS n FROM post_tags t JOIN posts p ON p.id = t.post_id
      WHERE p.created_at > ? GROUP BY t.tag ORDER BY n DESC LIMIT 10`).all(since);
  }
  res.json({ tags: rows.map((r) => ({ tag: r.tag, count: r.n })) });
});

app.get('/api/places', (req, res) => {
  const center = point(req.query);
  if (!center) return bad(res, 'lat and lng are required');
  const radius = clamp(req.query.radius, 100, 20000, 2000);
  const b = bbox(center.lat, center.lng, radius);
  const rows = db.prepare(`SELECT place, COUNT(*) AS n, AVG(lat) AS lat, AVG(lng) AS lng FROM posts
    WHERE lat BETWEEN ? AND ? AND lng BETWEEN ? AND ? GROUP BY place ORDER BY n DESC LIMIT 30`)
    .all(b.minLat, b.maxLat, b.minLng, b.maxLng);
  const places = rows
    .map((r) => ({ place: r.place, count: r.n, distance: Math.round(distance(center.lat, center.lng, r.lat, r.lng)) }))
    .sort((a, b2) => a.distance - b2.distance)
    .slice(0, 8);
  res.json({ places });
});

function safetyAt(lat, lng, radius) {
  const b = bbox(lat, lng, radius);
  const rows = db.prepare(`SELECT lat, lng, rating, flair, created_at FROM posts
    WHERE (rating > 0 OR flair = 'Alert') AND lat BETWEEN ? AND ? AND lng BETWEEN ? AND ?`)
    .all(b.minLat, b.maxLat, b.minLng, b.maxLng);
  const now = Date.now();
  let sum = 0, weights = 0, n = 0, alerts = 0;
  for (const r of rows) {
    const d = distance(lat, lng, r.lat, r.lng);
    if (d > radius) continue;
    const ageDays = (now - r.created_at) / 864e5;
    const w = (1 - 0.7 * (d / radius)) * Math.pow(0.5, ageDays / 120);
    sum += w * (r.rating > 0 ? r.rating : 1.5);
    weights += w;
    n += 1;
    if (r.flair === 'Alert' && ageDays < 30) alerts += 1;
  }
  const score = n ? Math.round((sum / weights) * 20) : null;
  return { score, reviews: n, recentAlerts: alerts, radius, ...safetyLevel(score) };
}

app.get('/api/safety', (req, res) => {
  const p = point(req.query);
  if (!p) return bad(res, 'lat and lng are required');
  res.json(safetyAt(p.lat, p.lng, clamp(req.query.radius, 100, 3000, 800)));
});

app.get('/api/points', (req, res) => {
  const p = point(req.query);
  if (!p) return bad(res, 'lat and lng are required');
  const radius = clamp(req.query.radius, 100, 50000, 10000);
  const b = bbox(p.lat, p.lng, radius);
  const rows = db.prepare(`SELECT id, lat, lng, rating, flair, title, place FROM posts
    WHERE lat BETWEEN ? AND ? AND lng BETWEEN ? AND ? ORDER BY created_at DESC LIMIT 2000`)
    .all(b.minLat, b.maxLat, b.minLng, b.maxLng);
  res.json({ points: rows.filter((r) => distance(p.lat, p.lng, r.lat, r.lng) <= radius) });
});

app.post('/api/sos', needAuthor, (req, res) => {
  const p = point(req.body || {});
  if (!p) return bad(res, 'Location is required');
  if (!limits.sos(req.author)) return bad(res, 'Too many SOS requests', 429);
  const accuracy = clamp(req.body.accuracy, 0, 100000, null);
  const now = Date.now();
  db.prepare('UPDATE sos SET resolved_at = ? WHERE owner = ? AND resolved_at IS NULL').run(now, req.author);
  const id = crypto.randomBytes(9).toString('base64url');
  db.prepare('INSERT INTO sos (id, owner, lat, lng, accuracy, started_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .run(id, req.author, p.lat, p.lng, accuracy, now, now);
  const s = db.prepare('SELECT * FROM sos WHERE id = ?').get(id);
  alertNearby(s);
  let notified = 0;
  const reached = new Set();
  for (const c of clients.values()) if (c.alerted.has(id)) { notified += 1; reached.add(c.author); }
  pushNearby(s, { radius: SOS_RADIUS, skipAuthors: reached }).catch((err) => console.error('[push]', err));
  res.status(201).json({ sos: publicSos(s), notified });
});

app.patch('/api/sos/:id', needAuthor, (req, res) => {
  const p = point(req.body || {});
  if (!p) return bad(res, 'Location is required');
  const accuracy = clamp(req.body.accuracy, 0, 100000, null);
  const r = db.prepare('UPDATE sos SET lat = ?, lng = ?, accuracy = ?, updated_at = ? WHERE id = ? AND owner = ? AND resolved_at IS NULL')
    .run(p.lat, p.lng, accuracy, Date.now(), req.params.id, req.author);
  if (!r.changes) return bad(res, 'No live SOS with that id', 404);
  const s = db.prepare('SELECT * FROM sos WHERE id = ?').get(req.params.id);
  alertNearby(s, 'sos-update');
  res.json({ sos: publicSos(s) });
});

app.post('/api/sos/:id/resolve', needAuthor, (req, res) => {
  const now = Date.now();
  const r = db.prepare('UPDATE sos SET resolved_at = ? WHERE id = ? AND owner = ? AND resolved_at IS NULL').run(now, req.params.id, req.author);
  if (!r.changes) return bad(res, 'No live SOS with that id', 404);
  db.prepare('UPDATE journeys SET sos_id = NULL, checkin_at = ?, last_beat = ? WHERE sos_id = ? AND ended_at IS NULL').run(now, now, req.params.id);
  const s = db.prepare('SELECT * FROM sos WHERE id = ?').get(req.params.id);
  for (const c of clients.values()) if (c.alerted.has(s.id)) send(c, 'sos-resolved', publicSos(s));
  res.json({ sos: publicSos(s) });
});

app.get('/api/sos/:id', (req, res) => {
  const s = db.prepare('SELECT * FROM sos WHERE id = ?').get(req.params.id);
  if (!s) return bad(res, 'Not found', 404);
  if (!s.resolved_at && Date.now() - s.updated_at > SOS_TTL) s.resolved_at = s.updated_at;
  res.json({ sos: publicSos(s) });
});

const JOURNEY_TIMEOUT = Number(process.env.SAKHI_JOURNEY_TIMEOUT_MS) || 10 * 60e3;
const JOURNEY_MAX_AGE = 24 * 60 * 60e3;
const PUBLIC_URL = (process.env.PUBLIC_URL || (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : '')).replace(/\/+$/, '');

function publicJourney(j) {
  return {
    id: j.id,
    dest: j.dest,
    startedAt: j.started_at,
    lastBeat: j.last_beat,
    checkinAt: j.checkin_at,
    deadline: j.checkin_at + j.timeout_ms,
    timeoutMs: j.timeout_ms,
    contacts: JSON.parse(j.contacts).length,
    ride: JSON.parse(j.ride || '{}'),
    sosId: j.sos_id,
    status: j.ended_at ? 'ended' : j.sos_id ? 'sos' : 'active',
    serverNow: Date.now(),
  };
}

function cleanContacts(list) {
  if (!Array.isArray(list)) return [];
  return list
    .slice(0, 5)
    .map((c) => ({ name: String(c?.name || '').slice(0, 40), phone: String(c?.phone || '').replace(/[^\d+]/g, '').slice(0, 16) }))
    .filter((c) => c.phone.replace('+', '').length >= 8);
}

function cleanRide(r) {
  if (!r || typeof r !== 'object') return {};
  const vehicle = String(r.vehicle || '').toUpperCase().replace(/[^A-Z0-9 ]/g, '').replace(/\s+/g, ' ').trim().slice(0, 16);
  const driver = String(r.driver || '').replace(/\s+/g, ' ').trim().slice(0, 40);
  const service = String(r.service || '').replace(/\s+/g, ' ').trim().slice(0, 24);
  return Object.fromEntries(Object.entries({ vehicle, driver, service }).filter(([, v]) => v));
}

const ownJourney = (id, owner) => db.prepare('SELECT * FROM journeys WHERE id = ? AND owner = ?').get(String(id), owner);

app.post('/api/journeys', needAuthor, (req, res) => {
  const b = req.body || {};
  const p = point(b);
  const dest = String(b.dest || '').trim().replace(/\s+/g, ' ').slice(0, 80);
  if (!p) return bad(res, 'Location is required to start a journey');
  if (!dest) return bad(res, 'Where are you going?');
  if (!limits.journey(req.author)) return bad(res, 'Too many journeys started. Try again in a few minutes.', 429);
  const now = Date.now();
  db.prepare("UPDATE journeys SET ended_at = ?, contacts = '[]' WHERE owner = ? AND ended_at IS NULL").run(now, req.author);
  const id = crypto.randomBytes(9).toString('base64url');
  db.prepare(`INSERT INTO journeys (id, owner, dest, contacts, ride, lat, lng, accuracy, timeout_ms, started_at, last_beat, checkin_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(id, req.author, dest, JSON.stringify(cleanContacts(b.contacts)), JSON.stringify(cleanRide(b.ride)), p.lat, p.lng, clamp(b.accuracy, 0, 100000, null), JOURNEY_TIMEOUT, now, now, now);
  res.status(201).json({ journey: publicJourney(ownJourney(id, req.author)), serverSms: smsConfigured() });
});

app.get('/api/journeys/active', needAuthor, (req, res) => {
  const j = db.prepare('SELECT * FROM journeys WHERE owner = ? AND ended_at IS NULL ORDER BY started_at DESC LIMIT 1').get(req.author);
  res.json({ journey: j ? publicJourney(j) : null, serverSms: smsConfigured(), timeoutMs: JOURNEY_TIMEOUT });
});

app.post('/api/journeys/:id/beat', needAuthor, (req, res) => {
  const j = ownJourney(req.params.id, req.author);
  if (!j || j.ended_at) return bad(res, 'No active journey with that id', 404);
  const p = point(req.body || {});
  const accuracy = clamp(req.body?.accuracy, 0, 100000, null);
  const now = Date.now();
  const checkin = req.body?.checkin === true && !j.sos_id;
  db.prepare('UPDATE journeys SET last_beat = ?, lat = ?, lng = ?, accuracy = ?, checkin_at = ? WHERE id = ?')
    .run(now, p?.lat ?? j.lat, p?.lng ?? j.lng, p ? accuracy : j.accuracy, checkin ? now : j.checkin_at, j.id);
  if (j.sos_id && p) {
    const r = db.prepare('UPDATE sos SET lat = ?, lng = ?, accuracy = ?, updated_at = ? WHERE id = ? AND resolved_at IS NULL').run(p.lat, p.lng, accuracy, now, j.sos_id);
    if (r.changes) alertNearby(db.prepare('SELECT * FROM sos WHERE id = ?').get(j.sos_id), 'sos-update');
  }
  res.json({ journey: publicJourney(ownJourney(j.id, req.author)) });
});

app.post('/api/journeys/:id/end', needAuthor, (req, res) => {
  const j = ownJourney(req.params.id, req.author);
  if (!j || j.ended_at) return bad(res, 'No active journey with that id', 404);
  const now = Date.now();
  db.prepare("UPDATE journeys SET ended_at = ?, contacts = '[]' WHERE id = ?").run(now, j.id);
  if (j.sos_id) {
    const r = db.prepare('UPDATE sos SET resolved_at = ? WHERE id = ? AND resolved_at IS NULL').run(now, j.sos_id);
    if (r.changes) {
      const s = db.prepare('SELECT * FROM sos WHERE id = ?').get(j.sos_id);
      for (const c of clients.values()) if (c.alerted.has(s.id)) send(c, 'sos-resolved', publicSos(s));
    }
  }
  res.json({ journey: publicJourney(ownJourney(j.id, req.author)) });
});

function autoSosText(j, sosId) {
  const quiet = j.timeout_ms >= 60e3 ? `${Math.round(j.timeout_ms / 60e3)} min` : `${Math.round(j.timeout_ms / 1000)} s`;
  const seen = new Date(j.last_beat).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', timeZone: process.env.TZ || 'Asia/Kolkata' });
  let m = `SOS from Sakhi (automatic): I was travelling to "${j.dest}" and haven't checked in for ${quiet}.`;
  m += ` Last known location at ${seen}: https://maps.google.com/?q=${j.lat.toFixed(5)},${j.lng.toFixed(5)}`;
  const ride = JSON.parse(j.ride || '{}');
  if (ride.vehicle || ride.driver) {
    m += ` I was in ${ride.service ? `a ${ride.service} ` : 'a '}cab${ride.vehicle ? ` ${ride.vehicle}` : ''}${ride.driver ? `, driver ${ride.driver}` : ''}.`;
  }
  if (PUBLIC_URL) m += ` Live: ${PUBLIC_URL}/track/${sosId}`;
  return `${m} Please call me or 112.`;
}

function checkJourneys() {
  const now = Date.now();
  db.prepare("UPDATE journeys SET ended_at = ?, contacts = '[]' WHERE ended_at IS NULL AND started_at < ?").run(now, now - JOURNEY_MAX_AGE);
  const due = db.prepare('SELECT * FROM journeys WHERE ended_at IS NULL AND sos_id IS NULL AND checkin_at + timeout_ms < ?').all(now);
  for (const j of due) {
    const id = crypto.randomBytes(9).toString('base64url');
    tx(() => {
      db.prepare('UPDATE sos SET resolved_at = ? WHERE owner = ? AND resolved_at IS NULL').run(now, j.owner);
      db.prepare('INSERT INTO sos (id, owner, lat, lng, accuracy, started_at, updated_at, auto, journey_id) VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?)')
        .run(id, j.owner, j.lat, j.lng, j.accuracy, now, j.last_beat, j.id);
      db.prepare('UPDATE journeys SET sos_id = ? WHERE id = ?').run(id, j.id);
    });
    console.log(`[journey] ${j.id}: no check-in for ${Math.round((now - j.checkin_at) / 1000)} s, raised auto SOS ${id}`);
    const s = db.prepare('SELECT * FROM sos WHERE id = ?').get(id);
    alertNearby(s);
    const reached = new Set([...clients.values()].filter((c) => c.alerted.has(id)).map((c) => c.author));
    pushNearby(s, { radius: SOS_RADIUS, skipAuthors: reached }).catch((err) => console.error('[push]', err));
    const numbers = JSON.parse(j.contacts).map((c) => c.phone);
    sendSms(numbers, autoSosText(j, id)).catch((err) => console.error('[journey] sms failed', err));
  }
}
setInterval(checkJourneys, Math.min(15000, Math.max(1000, JOURNEY_TIMEOUT / 4))).unref();

app.get('/api/push/key', (req, res) => res.json({ publicKey: pushPublicKey }));

app.post('/api/push/subscribe', needAuthor, (req, res) => {
  const at = point(req.body || {});
  if (!saveSubscription(req.author, req.body?.subscription, at)) return bad(res, 'Invalid push subscription');
  res.json({ ok: true });
});

app.post('/api/push/unsubscribe', needAuthor, (req, res) => {
  removeSubscription(req.author, req.body?.endpoint);
  res.json({ ok: true });
});

const osmLimit = rateLimiter(60, 60e3);
function osmRoute(handler) {
  return async (req, res) => {
    if (!osmLimit(author(req) || req.ip)) return bad(res, 'Too many map requests. Wait a moment.', 429);
    try {
      res.json(await handler(req));
    } catch (err) {
      console.error('[osm]', err.message);
      bad(res, 'Map service is busy. Try again in a moment.', 503);
    }
  };
}

app.get('/api/geo/reverse', osmRoute(async (req) => {
  const p = point(req.query);
  if (!p) throw new Error('lat and lng are required');
  return reverse(p.lat, p.lng);
}));

app.get('/api/geo/search', osmRoute(async (req) => {
  const q = String(req.query.q || '').trim().slice(0, 100);
  if (q.length < 3) return { results: [] };
  const p = point(req.query);
  return { results: await search(q, p?.lat, p?.lng) };
}));

app.get('/api/help/nearby', osmRoute(async (req) => {
  const p = point(req.query);
  if (!p) throw new Error('lat and lng are required');
  return { places: await nearbyHelp(p.lat, p.lng, clamp(req.query.radius, 500, 10000, 4000)) };
}));

app.get('/api/route', osmRoute(async (req) => {
  const [flat, flng] = String(req.query.from || '').split(',').map(Number);
  const [tlat, tlng] = String(req.query.to || '').split(',').map(Number);
  if (![flat, tlat].every(isLat) || ![flng, tlng].every(isLng)) throw new Error('from and to are required');
  if (distance(flat, flng, tlat, tlng) > 30000) throw new Error('Too far to walk');
  return walkRoute({ lat: flat, lng: flng }, { lat: tlat, lng: tlng });
}));

const dist = path.resolve(import.meta.dirname, '../dist');
if (!DEV && existsSync(dist)) {
  app.use(express.static(dist, { index: false, maxAge: '1h' }));
  app.get(/^\/(?!api\/).*/, (req, res) => res.sendFile(path.join(dist, 'index.html')));
}
app.use('/api', (req, res) => bad(res, 'Not found', 404));
app.use((err, req, res, next) => {
  if (err.type === 'entity.parse.failed') return bad(res, 'Invalid JSON');
  console.error(err);
  res.status(500).json({ error: 'Something went wrong' });
});

if (!process.env.VERCEL) app.listen(PORT, () => console.log(`Sakhi API on http://localhost:${PORT}`));

export default app;

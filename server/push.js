import webpush from 'web-push';
import { db } from './db.js';
import { bbox, distance } from './util.js';

function vapidKeys() {
  if (process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) {
    return { publicKey: process.env.VAPID_PUBLIC_KEY, privateKey: process.env.VAPID_PRIVATE_KEY };
  }
  const row = db.prepare("SELECT value FROM settings WHERE key = 'vapid'").get();
  if (row) return JSON.parse(row.value);
  const keys = webpush.generateVAPIDKeys();
  db.prepare("INSERT INTO settings (key, value) VALUES ('vapid', ?)").run(JSON.stringify(keys));
  return keys;
}

const keys = vapidKeys();
webpush.setVapidDetails(process.env.VAPID_SUBJECT || 'mailto:sakhi-admin@example.com', keys.publicKey, keys.privateKey);

export const publicKey = keys.publicKey;

export function saveSubscription(author, sub, at) {
  const endpoint = String(sub?.endpoint || '');
  if (!/^https:\/\//.test(endpoint) || !sub.keys?.p256dh || !sub.keys?.auth) return false;
  db.prepare(`INSERT INTO push_subs (endpoint, author, sub, lat, lng, updated_at) VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT (endpoint) DO UPDATE SET author = excluded.author, sub = excluded.sub,
      lat = COALESCE(excluded.lat, push_subs.lat), lng = COALESCE(excluded.lng, push_subs.lng), updated_at = excluded.updated_at`)
    .run(endpoint, author, JSON.stringify({ endpoint, keys: { p256dh: sub.keys.p256dh, auth: sub.keys.auth } }), at?.lat ?? null, at?.lng ?? null, Date.now());
  return true;
}

export function removeSubscription(author, endpoint) {
  return db.prepare('DELETE FROM push_subs WHERE endpoint = ? AND author = ?').run(String(endpoint), author).changes > 0;
}

export function touchLocation(author, lat, lng) {
  db.prepare('UPDATE push_subs SET lat = ?, lng = ?, updated_at = ? WHERE author = ?').run(lat, lng, Date.now(), author);
}

const FRESH = 6 * 60 * 60e3;

export async function pushNearby(sos, { radius = 200, skipAuthors = new Set() } = {}) {
  const b = bbox(sos.lat, sos.lng, radius);
  const rows = db.prepare(`SELECT * FROM push_subs WHERE updated_at > ? AND lat BETWEEN ? AND ? AND lng BETWEEN ? AND ?`)
    .all(Date.now() - FRESH, b.minLat, b.maxLat, b.minLng, b.maxLng);
  let sent = 0;
  await Promise.all(rows.map(async (r) => {
    if (r.author === sos.owner || skipAuthors.has(r.author)) return;
    const d = distance(r.lat, r.lng, sos.lat, sos.lng);
    if (d > radius) return;
    const payload = JSON.stringify({
      type: 'sos',
      title: 'Someone near you needs help',
      body: `About ${Math.round(d / 10) * 10 || 10} m away. Tap for directions.`,
      sos: { id: sos.id, lat: sos.lat, lng: sos.lng },
    });
    try {
      await webpush.sendNotification(JSON.parse(r.sub), payload, { TTL: 600, urgency: 'high' });
      sent += 1;
    } catch (err) {
      if (err.statusCode === 404 || err.statusCode === 410) db.prepare('DELETE FROM push_subs WHERE endpoint = ?').run(r.endpoint);
      else console.error('[push] send failed:', err.statusCode || err.message);
    }
  }));
  return sent;
}

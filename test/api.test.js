import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const PORT = 18000 + Math.floor(Math.random() * 1000);
const BASE = `http://localhost:${PORT}/api`;
const dataDir = mkdtempSync(path.join(tmpdir(), 'sakhi-test-'));
let server;

const device = (n) => `testdevice-${String(n).padStart(4, '0')}-0000-0000-000000000000`;
const HOME = { lat: 12.9716, lng: 77.5946 };

async function api(p, { method = 'GET', body, as = 1 } = {}) {
  const res = await fetch(BASE + p, {
    method,
    headers: { 'X-Device': device(as), ...(body ? { 'Content-Type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, body: await res.json() };
}

async function listen(as, at) {
  const client = `client-${as}-${Math.random().toString(36).slice(2, 8)}`;
  const ctl = new AbortController();
  const res = await fetch(`${BASE}/stream?client=${client}&device=${device(as)}`, { signal: ctl.signal });
  const events = [];
  (async () => {
    const reader = res.body.getReader();
    const dec = new TextDecoder();
    let buf = '';
    try {
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        let i;
        while ((i = buf.indexOf('\n\n')) >= 0) {
          const chunk = buf.slice(0, i);
          buf = buf.slice(i + 2);
          const ev = /event: (.+)/.exec(chunk)?.[1];
          const data = /data: (.+)/.exec(chunk)?.[1];
          if (ev && ev !== 'ping') events.push({ ev, data: JSON.parse(data) });
        }
      }
    } catch { }
  })();
  await api('/presence', { method: 'POST', body: { client, ...at }, as });
  return { events, close: () => ctl.abort() };
}

const until = async (fn, ms = 4000) => {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (fn()) return true;
    await new Promise((r) => setTimeout(r, 50));
  }
  return false;
};

before(async () => {
  server = spawn(process.execPath, ['server/index.js'], {
    env: { ...process.env, PORT: String(PORT), SAKHI_DATA_DIR: dataDir, SAKHI_JOURNEY_TIMEOUT_MS: '1500', NODE_NO_WARNINGS: '1' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  await new Promise((resolve, reject) => {
    server.stdout.on('data', (d) => String(d).includes('Sakhi API on') && resolve());
    server.on('exit', (code) => reject(new Error(`server exited ${code}`)));
    setTimeout(() => reject(new Error('server did not start')), 10000);
  });
});

after(async () => {
  if (server && server.exitCode === null) {
    const exited = new Promise((r) => server.once('exit', r));
    server.kill();
    await exited;
  }
  for (let i = 0; i < 10; i++) {
    try {
      rmSync(dataDir, { recursive: true, force: true });
      break;
    } catch {
      await new Promise((r) => setTimeout(r, 200));
    }
  }
});

test('posts: create with hashtags, vote, comment, list nearby', async () => {
  const bad = await api('/posts', { method: 'POST', body: { ...HOME, place: 'Lake Park', flair: 'Review', rating: 0, title: 'No stars' } });
  assert.equal(bad.status, 400, 'a review without stars is rejected');

  const created = await api('/posts', {
    method: 'POST',
    body: { ...HOME, place: 'Lake Park', flair: 'Review', rating: 4, title: 'Lit path #WellLit', body: 'Guard at gate #SafeForSolo #safeforsolo' },
  });
  assert.equal(created.status, 201);
  const post = created.body.post;
  assert.deepEqual(post.tags.sort(), ['SafeForSolo', 'WellLit'], 'tags parsed and de-duplicated');
  assert.equal(post.score, 1, 'author upvotes their own post');

  const vote = await api(`/posts/${post.id}/vote`, { method: 'POST', body: { value: 1 }, as: 2 });
  assert.equal(vote.body.score, 2);

  const c = await api(`/posts/${post.id}/comments`, { method: 'POST', body: { body: 'Agree' }, as: 2 });
  assert.equal(c.status, 201);

  const list = await api(`/posts?lat=${HOME.lat}&lng=${HOME.lng}&radius=1000&tag=WellLit`);
  assert.equal(list.body.posts.length, 1);
  assert.equal(list.body.posts[0].comments, 1);

  const far = await api(`/posts?lat=13.5&lng=78.5&radius=1000`);
  assert.equal(far.body.posts.length, 0, 'posts outside the radius are not returned');
});

test('safety score reflects ratings', async () => {
  for (const [i, rating] of [[3, 1], [4, 1]]) {
    await api('/posts', { method: 'POST', as: i, body: { lat: 12.98, lng: 77.6, place: 'Dark Lane', flair: 'Review', rating, title: 'Very dark lane' } });
  }
  const s = await api('/safety?lat=12.98&lng=77.6&radius=300');
  assert.equal(s.body.score, 20);
  assert.equal(s.body.level, 'caution');
});

test('moderation: a post flagged by 3 people is hidden', async () => {
  const { body } = await api('/posts', { method: 'POST', as: 5, body: { ...HOME, place: 'Spam St', flair: 'Tip', title: 'Buy my stuff' } });
  const id = body.post.id;
  assert.equal((await api(`/posts/${id}/flag`, { method: 'POST', as: 5, body: { reason: 'spam' } })).status, 400, 'cannot flag own post');
  for (const as of [6, 7]) await api(`/posts/${id}/flag`, { method: 'POST', as, body: { reason: 'spam' } });
  let seen = await api(`/posts?lat=${HOME.lat}&lng=${HOME.lng}&radius=500`, { as: 9 });
  assert.ok(seen.body.posts.some((p) => p.id === id), 'still visible after 2 flags');
  const third = await api(`/posts/${id}/flag`, { method: 'POST', as: 8, body: { reason: 'spam' } });
  assert.equal(third.body.hidden, true);
  seen = await api(`/posts?lat=${HOME.lat}&lng=${HOME.lng}&radius=500`, { as: 9 });
  assert.ok(!seen.body.posts.some((p) => p.id === id), 'hidden after 3 flags');
  const own = await api(`/posts?lat=${HOME.lat}&lng=${HOME.lng}&radius=500`, { as: 5 });
  assert.ok(own.body.posts.some((p) => p.id === id), 'the author still sees it');
});

test('SOS reaches users within 200 m only, and resolve is broadcast', async () => {
  const near = await listen(20, { lat: HOME.lat + 0.0008, lng: HOME.lng });
  const far = await listen(21, { lat: HOME.lat + 0.01, lng: HOME.lng });
  const sos = await api('/sos', { method: 'POST', as: 22, body: { ...HOME, accuracy: 10 } });
  assert.equal(sos.status, 201);
  assert.equal(sos.body.notified, 1);
  assert.ok(await until(() => near.events.some((e) => e.ev === 'sos')));
  assert.ok(near.events.find((e) => e.ev === 'sos').data.distance < 120);

  const done = await api(`/sos/${sos.body.sos.id}/resolve`, { method: 'POST', as: 22 });
  assert.equal(done.body.sos.resolved, true);
  assert.ok(await until(() => near.events.some((e) => e.ev === 'sos-resolved')));
  assert.equal(far.events.length, 0, 'the far phone heard nothing');
  near.close();
  far.close();

  const other = await api(`/sos/${sos.body.sos.id}/resolve`, { method: 'POST', as: 23 });
  assert.equal(other.status, 404, 'only the owner can resolve');
});

test('journey: missed check-in raises an automatic SOS with ride details kept', async () => {
  const listener = await listen(30, { lat: HOME.lat + 0.0005, lng: HOME.lng });
  const start = await api('/journeys', {
    method: 'POST',
    as: 31,
    body: { ...HOME, dest: 'Home', contacts: [{ name: 'Mom', phone: '+919800000001' }], ride: { vehicle: 'ka 01 ab 1234', driver: 'Ravi', service: 'Uber' } },
  });
  assert.equal(start.status, 201);
  assert.equal(start.body.journey.status, 'active');
  assert.deepEqual(start.body.journey.ride, { vehicle: 'KA 01 AB 1234', driver: 'Ravi', service: 'Uber' });

  await new Promise((r) => setTimeout(r, 2600));
  const active = await api('/journeys/active', { as: 31 });
  assert.equal(active.body.journey.status, 'sos', 'server raised the SOS by itself');
  assert.ok(await until(() => listener.events.some((e) => e.ev === 'sos' && e.data.auto)), 'nearby user got the auto SOS');

  const track = await api(`/sos/${active.body.journey.sosId}`);
  assert.equal(track.body.sos.auto, true);

  await api(`/sos/${active.body.journey.sosId}/resolve`, { method: 'POST', as: 31 });
  const after = await api('/journeys/active', { as: 31 });
  assert.equal(after.body.journey.status, 'active', "I'm safe restarts the journey");

  const end = await api(`/journeys/${start.body.journey.id}/end`, { method: 'POST', as: 31 });
  assert.equal(end.body.journey.status, 'ended');
  assert.equal(end.body.journey.contacts, 0, 'contact numbers deleted at the end');
  listener.close();
});

test('push: key is served and bad subscriptions are rejected', async () => {
  const key = await api('/push/key');
  assert.match(key.body.publicKey, /^[A-Za-z0-9_-]{80,}$/);
  const badSub = await api('/push/subscribe', { method: 'POST', body: { subscription: { endpoint: 'http://evil' } } });
  assert.equal(badSub.status, 400);
  const good = await api('/push/subscribe', {
    method: 'POST',
    body: { ...HOME, subscription: { endpoint: 'https://push.example.com/abc', keys: { p256dh: 'x', auth: 'y' } } },
  });
  assert.equal(good.status, 200);
});

test('input validation: device id required and JSON errors handled', async () => {
  const res = await fetch(`${BASE}/me`);
  assert.equal(res.status, 400);
  const bad = await fetch(`${BASE}/posts`, { method: 'POST', headers: { 'X-Device': device(1), 'Content-Type': 'application/json' }, body: '{nope' });
  assert.equal(bad.status, 400);
});

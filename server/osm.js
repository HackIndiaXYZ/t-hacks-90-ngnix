import { distance } from './util.js';
import { db } from './db.js';

const UA = process.env.OSM_USER_AGENT || 'Sakhi-safety-app/0.2 (beta; contact: set OSM_USER_AGENT)';
const NOMINATIM = (process.env.NOMINATIM_URL || 'https://nominatim.openstreetmap.org').replace(/\/+$/, '');
const OVERPASS = (process.env.OVERPASS_URL || [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://overpass.private.coffee/api/interpreter',
  'https://maps.mail.ru/osm/tools/overpass/api/interpreter',
].join(',')).split(',');
const OSRM_FOOT = (process.env.OSRM_FOOT_URL || 'https://routing.openstreetmap.de/routed-foot').replace(/\/+$/, '');

const cache = new Map();
function cached(key, ttl, fn) {
  const hit = cache.get(key);
  if (hit && hit.until > Date.now()) return hit.value;
  const value = fn().catch((err) => {
    cache.delete(key);
    throw err;
  });
  cache.set(key, { value, until: Date.now() + ttl });
  if (cache.size > 2000) cache.delete(cache.keys().next().value);
  return value;
}

let nominatimChain = Promise.resolve();
function nominatimFetch(url) {
  const run = nominatimChain.then(async () => {
    const res = await fetch(url, { headers: { 'User-Agent': UA, 'Accept-Language': 'en' }, signal: AbortSignal.timeout(10000) });
    await new Promise((r) => setTimeout(r, 1000));
    if (!res.ok) throw new Error(`Nominatim ${res.status}`);
    return res.json();
  });
  nominatimChain = run.catch(() => {});
  return run;
}

const round = (v, d) => Number(v).toFixed(d);

export function reverse(lat, lng) {
  return cached(`rev:${round(lat, 4)},${round(lng, 4)}`, 24 * 3600e3, async () => {
    const j = await nominatimFetch(`${NOMINATIM}/reverse?format=jsonv2&zoom=17&addressdetails=1&lat=${lat}&lon=${lng}`);
    if (!j || j.error) return { name: null, label: null };
    const a = j.address || {};
    const area = a.neighbourhood || a.suburb || a.quarter || a.city_district || a.village || a.town || a.city || '';
    const street = a.road || a.pedestrian || a.footway || '';
    const name = j.name || street || area || null;
    const label = [name, name === area ? '' : area].filter(Boolean).join(', ');
    return { name: name ? name.slice(0, 60) : null, label: label || j.display_name || null };
  });
}

export function search(q, lat, lng) {
  const near = lat != null ? `&viewbox=${lng - 0.3},${lat + 0.3},${lng + 0.3},${lat - 0.3}` : '';
  return cached(`q:${q.toLowerCase()}:${lat != null ? round(lat, 2) + ',' + round(lng, 2) : ''}`, 6 * 3600e3, async () => {
    const j = await nominatimFetch(`${NOMINATIM}/search?format=jsonv2&limit=6&q=${encodeURIComponent(q)}${near}`);
    return (j || []).map((r) => ({
      name: (r.name || r.display_name.split(',')[0]).slice(0, 80),
      label: r.display_name,
      lat: Number(r.lat),
      lng: Number(r.lon),
      distance: lat != null ? Math.round(distance(lat, lng, Number(r.lat), Number(r.lon))) : null,
    }));
  });
}

const WOMEN_DESK = /mahila|women|woman|pink|she team|vanitha|nari/i;

async function overpass(query) {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 45000);
  try {
    return await Promise.any(OVERPASS.map(async (endpoint) => {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'User-Agent': UA, 'Content-Type': 'application/x-www-form-urlencoded' },
        body: `data=${encodeURIComponent(query)}`,
        signal: ctl.signal,
      });
      if (!res.ok) throw new Error(`Overpass ${res.status} at ${new URL(endpoint).host}`);
      const j = await res.json();
      if (!Array.isArray(j.elements)) throw new Error('Overpass returned no elements');
      return j;
    }));
  } catch (err) {
    throw new Error(`All Overpass servers failed: ${err.errors?.map((e) => e.message).join('; ') || err.message}`);
  } finally {
    clearTimeout(timer);
    ctl.abort();
  }
}

const GRID_RADIUS = 5000;
const HELP_TTL = 24 * 3600e3;
db.exec('CREATE TABLE IF NOT EXISTS osm_cache (key TEXT PRIMARY KEY, value TEXT NOT NULL, until INTEGER NOT NULL)');

function helpForCell(cellLat, cellLng) {
  const key = `help:${cellLat},${cellLng}`;
  return cached(key, HELP_TTL, async () => {
    const row = db.prepare('SELECT value FROM osm_cache WHERE key = ? AND until > ?').get(key, Date.now());
    if (row) return JSON.parse(row.value);
    const j = await overpass(`[out:json][timeout:25];
      (nwr["amenity"="police"](around:${GRID_RADIUS},${cellLat},${cellLng});
       nwr["amenity"="hospital"](around:${GRID_RADIUS},${cellLat},${cellLng}););
      out center tags 200;`);
    const places = j.elements.map(toPlace).filter(Boolean);
    db.prepare('INSERT OR REPLACE INTO osm_cache (key, value, until) VALUES (?, ?, ?)').run(key, JSON.stringify(places), Date.now() + HELP_TTL);
    return places;
  });
}

function toPlace(e) {
  const t = e.tags || {};
  const lat = e.lat ?? e.center?.lat;
  const lng = e.lon ?? e.center?.lon;
  if (lat == null) return null;
  const kind = t.amenity === 'police' ? 'police' : 'hospital';
  return {
    id: `${e.type}/${e.id}`,
    kind,
    women: kind === 'police' && WOMEN_DESK.test(`${t.name || ''} ${t['name:en'] || ''} ${t.description || ''}`),
    name: t['name:en'] || t.name || (kind === 'police' ? 'Police station' : 'Hospital'),
    phone: t.phone || t['contact:phone'] || null,
    address: [t['addr:street'], t['addr:suburb'] || t['addr:city']].filter(Boolean).join(', ') || null,
    open24: t.opening_hours === '24/7' || t.emergency === 'yes',
    lat,
    lng,
  };
}

export async function nearbyHelp(lat, lng, radius = 4000) {
  const places = await helpForCell(round(lat, 2), round(lng, 2));
  return places
    .map((p) => ({ ...p, distance: Math.round(distance(lat, lng, p.lat, p.lng)) }))
    .filter((p) => p.distance <= Math.max(radius, 1500))
    .sort((a, b) => a.distance - b.distance)
    .slice(0, 25);
}

export function walkRoute(from, to) {
  const key = `route:${round(from.lat, 4)},${round(from.lng, 4)}>${round(to.lat, 4)},${round(to.lng, 4)}`;
  return cached(key, 3600e3, async () => {
    const url = `${OSRM_FOOT}/route/v1/foot/${from.lng},${from.lat};${to.lng},${to.lat}?overview=full&geometries=geojson&steps=false`;
    const res = await fetch(url, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(15000) });
    if (!res.ok) throw new Error(`OSRM ${res.status}`);
    const j = await res.json();
    const r = j.routes?.[0];
    if (!r) throw new Error('No route found');
    return {
      distance: Math.round(r.distance),
      duration: Math.round(r.duration),
      line: r.geometry.coordinates.map(([x, y]) => [y, x]),
    };
  });
}

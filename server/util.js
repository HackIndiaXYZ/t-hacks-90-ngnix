const R = 6371000;
const rad = (d) => (d * Math.PI) / 180;

export function distance(lat1, lng1, lat2, lng2) {
  const dLat = rad(lat2 - lat1);
  const dLng = rad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

export function bbox(lat, lng, radius) {
  const dLat = (radius / R) * (180 / Math.PI);
  const dLng = dLat / Math.max(Math.cos(rad(lat)), 0.01);
  return { minLat: lat - dLat, maxLat: lat + dLat, minLng: lng - dLng, maxLng: lng + dLng };
}

export function isLat(v) { return typeof v === 'number' && Number.isFinite(v) && v >= -90 && v <= 90; }
export function isLng(v) { return typeof v === 'number' && Number.isFinite(v) && v >= -180 && v <= 180; }

export function parseTags(text, max = 10) {
  const seen = new Set();
  const out = [];
  for (const m of String(text).matchAll(/#([\p{L}\p{N}_]{2,30})/gu)) {
    const key = m[1].toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(m[1]);
    if (out.length >= max) break;
  }
  return out;
}

const ADJ = ['silent', 'brave', 'night', 'calm', 'swift', 'quiet', 'bright', 'gentle', 'bold', 'wild', 'misty', 'golden'];
const ANI = ['heron', 'lynx', 'sparrow', 'otter', 'koel', 'fox', 'myna', 'tigress', 'dove', 'kite', 'panda', 'lotus'];

export function anonName(hash) {
  const n = parseInt(hash.slice(0, 8), 16);
  return `u/${ADJ[n % ADJ.length]}_${ANI[Math.floor(n / ADJ.length) % ANI.length]}${n % 97}`;
}

export function rateLimiter(max, windowMs) {
  const hits = new Map();
  return (key) => {
    const now = Date.now();
    const list = (hits.get(key) || []).filter((t) => now - t < windowMs);
    if (list.length >= max) { hits.set(key, list); return false; }
    list.push(now);
    hits.set(key, list);
    return true;
  };
}

export function safetyLevel(score) {
  if (score == null) return { level: 'unknown', label: 'No reviews yet' };
  if (score >= 70) return { level: 'safe', label: 'Mostly safe' };
  if (score >= 50) return { level: 'moderate', label: 'Stay alert' };
  return { level: 'caution', label: 'Use caution' };
}

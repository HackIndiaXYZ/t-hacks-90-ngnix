export function metersBetween(a, b) {
  const r = (d) => (d * Math.PI) / 180;
  const h = Math.sin(r(b.lat - a.lat) / 2) ** 2 + Math.cos(r(a.lat)) * Math.cos(r(b.lat)) * Math.sin(r(b.lng - a.lng) / 2) ** 2;
  return 2 * 6371000 * Math.asin(Math.sqrt(h));
}

export function durationLabel(s) {
  const m = Math.max(1, Math.round(s / 60));
  return m < 60 ? `${m} min` : `${Math.floor(m / 60)} h ${m % 60} min`;
}

export function distanceLabel(m) {
  if (m == null) return '';
  return m < 1000 ? `${Math.max(10, Math.round(m / 10) * 10)} m` : `${(m / 1000).toFixed(m < 10000 ? 1 : 0)} km`;
}

export function timeAgo(ts) {
  const s = Math.max(0, (Date.now() - ts) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  if (s < 86400 * 30) return `${Math.floor(s / 86400)}d ago`;
  return new Date(ts).toLocaleDateString();
}

export const placeSub = (place) => `r/${place.replace(/[^\p{L}\p{N}]+/gu, '')}`;

export function tagsIn(text) {
  const seen = new Set();
  const out = [];
  for (const m of String(text).matchAll(/#([\p{L}\p{N}_]{2,30})/gu)) {
    if (seen.has(m[1].toLowerCase())) continue;
    seen.add(m[1].toLowerCase());
    out.push(m[1]);
  }
  return out;
}

const AVATAR = ['#3B1F5C', '#14365E', '#0A6650', '#8A4F00', '#A1262B', '#5A1E3A'];
export const avatarColor = (name) => AVATAR[[...name].reduce((t, c) => t + c.charCodeAt(0), 0) % AVATAR.length];

export const LEVEL = {
  safe: { color: 'var(--safe)', soft: 'var(--safe-soft)', hex: '#0B7A5E' },
  moderate: { color: 'var(--mod)', soft: 'var(--mod-soft)', hex: '#A35F00' },
  caution: { color: 'var(--caution)', soft: 'var(--caution-soft)', hex: '#C62E33' },
  unknown: { color: 'var(--muted)', soft: 'var(--brand-soft)', hex: '#6B6478' },
};

export function ratingHex(rating, flair) {
  if (!rating) return flair === 'Alert' ? '#C62E33' : '#6B4FA0';
  if (rating >= 4) return '#0B7A5E';
  if (rating === 3) return '#D08A10';
  return '#C62E33';
}

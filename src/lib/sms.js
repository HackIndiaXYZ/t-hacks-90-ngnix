export function sosMessage({ lat, lng, accuracy, id }, ride) {
  const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  let m = 'SOS from Sakhi: I need help.';
  if (lat != null) {
    m += ` I am here: https://maps.google.com/?q=${lat.toFixed(5)},${lng.toFixed(5)}`;
    if (accuracy) m += ` (within ${Math.round(accuracy)} m)`;
    m += ` at ${time}.`;
  }
  if (ride?.vehicle || ride?.driver) {
    m += ` I am in ${ride.service ? `a ${ride.service} ` : 'a '}cab${ride.vehicle ? ` ${ride.vehicle}` : ''}${ride.driver ? `, driver ${ride.driver}` : ''}.`;
  }
  if (id) m += ` Live location: ${location.origin}/track/${id}`;
  return `${m} Please call me or 112.`;
}

const clean = (n) => String(n).replace(/[^\d+]/g, '');

export function smsHref(numbers, body) {
  const to = numbers.map(clean).filter(Boolean).join(',');
  const ios = /iPad|iPhone|iPod/.test(navigator.userAgent);
  return ios ? `sms:/open?addresses=${to}&body=${encodeURIComponent(body)}` : `sms:${to}?body=${encodeURIComponent(body)}`;
}

export const mapsLink = (lat, lng) => `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`;

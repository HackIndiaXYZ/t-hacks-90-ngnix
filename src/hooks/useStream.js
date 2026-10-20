import { useEffect, useRef, useState } from 'react';
import { API_BASE, api, qs } from '../lib/api.js';
import { clientId, deviceId } from '../lib/device.js';

const moved = (a, b) => {
  if (!a || !b) return true;
  const dy = (a.lat - b.lat) * 111320;
  const dx = (a.lng - b.lng) * 111320 * Math.cos((a.lat * Math.PI) / 180);
  return Math.hypot(dx, dy) > 25;
};

export function useStream(loc, onEvent) {
  const handler = useRef(onEvent);
  handler.current = onEvent;
  const [opens, setOpens] = useState(0);
  const sent = useRef({ opens: -1, loc: null });

  useEffect(() => {
    let es;
    let retry;
    let watchdog;
    let delay = 1000;

    const alive = () => {
      clearTimeout(watchdog);
      watchdog = setTimeout(reconnect, 45000);
    };
    const on = (type) => (e) => {
      alive();
      try {
        handler.current(type, JSON.parse(e.data));
      } catch {
      }
    };
    const connect = () => {
      es = new EventSource(`${API_BASE}/stream?${qs({ client: clientId, device: deviceId() })}`);
      for (const t of ['sos', 'sos-update', 'sos-resolved', 'post']) es.addEventListener(t, on(t));
      es.addEventListener('ping', alive);
      es.onopen = () => {
        delay = 1000;
        alive();
        setOpens((n) => n + 1);
      };
      es.onerror = () => {
        if (es.readyState !== EventSource.CLOSED) return;
        clearTimeout(retry);
        retry = setTimeout(connect, delay);
        delay = Math.min(delay * 2, 30000);
      };
    };
    function reconnect() {
      clearTimeout(retry);
      clearTimeout(watchdog);
      es?.close();
      connect();
    }
    const onVisible = () => document.visibilityState === 'visible' && reconnect();

    connect();
    window.addEventListener('online', reconnect);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      clearTimeout(retry);
      clearTimeout(watchdog);
      window.removeEventListener('online', reconnect);
      document.removeEventListener('visibilitychange', onVisible);
      es.close();
    };
  }, []);

  useEffect(() => {
    if (!loc || opens === 0) return;
    if (sent.current.opens === opens && !moved(sent.current.loc, loc)) return;
    sent.current = { opens, loc };
    api('/presence', { method: 'POST', body: { client: clientId, lat: loc.lat, lng: loc.lng } }).catch(() => {});
  }, [opens, loc]);

  return opens > 0;
}

import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../lib/api.js';
import { load, save } from '../lib/device.js';
import { smsHref, sosMessage } from '../lib/sms.js';

const COUNTDOWN = 5;
const UPDATE_EVERY = 15000;

export function useSos({ loc, getFix, contacts, ride, onToast }) {
  const [sos, setSos] = useState(() => load('sakhi.sos'));
  const [phase, setPhase] = useState(() => (load('sakhi.sos') ? 'active' : 'idle'));
  const [count, setCount] = useState(COUNTDOWN);
  const lastPatch = useRef(0);
  const drill = useRef(false);

  const persist = (v) => {
    setSos(v);
    save('sakhi.sos', v);
  };

  const start = useCallback((opts = {}) => {
    if (phase !== 'idle') return;
    drill.current = !!opts.drill;
    setCount(COUNTDOWN);
    setPhase('countdown');
    navigator.vibrate?.(80);
  }, [phase]);

  const cancel = useCallback(() => {
    setPhase('idle');
    onToast('SOS cancelled');
  }, [onToast]);

  const fire = useCallback(async () => {
    setPhase('sending');
    navigator.vibrate?.([250, 120, 250]);
    const fix = await getFix();
    if (drill.current) {
      setSos({ id: null, drill: true, lat: fix?.lat ?? null, lng: fix?.lng ?? null, accuracy: fix?.accuracy ?? null, startedAt: Date.now(), online: navigator.onLine, notified: 0, sms: smsHref(contacts.map((c) => c.phone), sosMessage({ lat: fix?.lat ?? null, lng: fix?.lng, accuracy: fix?.accuracy }, ride)) });
      setPhase('active');
      return;
    }
    const s = {
      id: null,
      lat: fix?.lat ?? null,
      lng: fix?.lng ?? null,
      accuracy: fix?.accuracy ?? null,
      startedAt: Date.now(),
      online: false,
      notified: 0,
      error: null,
    };
    if (fix && navigator.onLine) {
      try {
        const r = await api('/sos', { method: 'POST', body: { lat: fix.lat, lng: fix.lng, accuracy: fix.accuracy } });
        s.id = r.sos.id;
        s.online = true;
        s.notified = r.notified;
      } catch (e) {
        s.error = e.message;
      }
    }
    s.sms = smsHref(contacts.map((c) => c.phone), sosMessage(s, ride));
    persist(s);
    lastPatch.current = Date.now();
    setPhase('active');
    if (contacts.length) window.location.href = s.sms;
  }, [contacts, getFix, ride]);

  useEffect(() => {
    if (phase !== 'countdown') return;
    if (count <= 0) {
      fire();
      return;
    }
    const t = setTimeout(() => setCount((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [phase, count, fire]);

  useEffect(() => {
    if (phase !== 'active' || !sos?.id || sos.drill || !loc) return;
    if (Date.now() - lastPatch.current < UPDATE_EVERY) return;
    lastPatch.current = Date.now();
    api(`/sos/${sos.id}`, { method: 'PATCH', body: { lat: loc.lat, lng: loc.lng, accuracy: loc.accuracy } })
      .then(() => persist({ ...sos, lat: loc.lat, lng: loc.lng, accuracy: loc.accuracy }))
      .catch(() => {});
  }, [phase, sos, loc]);

  const resolve = useCallback(async () => {
    if (sos?.drill) {
      setSos(null);
      setPhase('idle');
      onToast('Practice done. You know how SOS works.');
      return;
    }
    if (sos?.id) await api(`/sos/${sos.id}/resolve`, { method: 'POST' }).catch(() => {});
    persist(null);
    setPhase('idle');
    onToast('Glad you are safe. SOS ended.');
  }, [sos, onToast]);

  const adopt = useCallback(
    async (id) => {
      if (sos?.id === id) return;
      let data = {};
      try {
        data = (await api(`/sos/${id}`)).sos;
      } catch {
      }
      const s = { id, lat: data.lat ?? null, lng: data.lng ?? null, accuracy: data.accuracy ?? null, startedAt: data.startedAt || Date.now(), online: true, notified: null, auto: true, error: null };
      s.sms = smsHref(contacts.map((c) => c.phone), sosMessage(s, ride));
      persist(s);
      setPhase('active');
      navigator.vibrate?.([500, 200, 500, 200, 500]);
    },
    [sos, contacts, ride],
  );

  return { phase, count, sos, start, cancel, resolve, adopt, practice: drill.current };
}

import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../lib/api.js';
import { load, save } from '../lib/device.js';

const BEAT_EVERY = 60000;
const OVERDUE_POLL = 5000;
const WARN_AT = 60000;

export function useJourney({ loc, contacts, onToast, onAutoSos }) {
  const [journey, setJourneyState] = useState(() => load('sakhi.journey'));
  const [now, setNow] = useState(Date.now());
  const [busy, setBusy] = useState(false);
  const [lastSync, setLastSync] = useState(null);
  const [serverSms, setServerSms] = useState(false);
  const skew = useRef(0);
  const warned = useRef(false);
  const adopted = useRef(null);
  const locRef = useRef(loc);
  locRef.current = loc;
  const autoRef = useRef(onAutoSos);
  autoRef.current = onAutoSos;

  const apply = useCallback((j, sms) => {
    if (sms !== undefined) setServerSms(sms);
    if (!j || j.status === 'ended') {
      setJourneyState(null);
      save('sakhi.journey', null);
      return;
    }
    skew.current = j.serverNow - Date.now();
    setJourneyState(j);
    save('sakhi.journey', j);
    setLastSync(Date.now());
    if (j.status === 'sos' && adopted.current !== j.sosId) {
      adopted.current = j.sosId;
      autoRef.current?.(j.sosId);
    }
    if (j.status === 'active') adopted.current = null;
  }, []);

  const [timeoutMs, setTimeoutMs] = useState(10 * 60000);
  useEffect(() => {
    api('/journeys/active')
      .then((r) => {
        setTimeoutMs(r.timeoutMs);
        if (load('sakhi.journey') || r.journey) apply(r.journey, r.serverSms);
        else setServerSms(r.serverSms);
      })
      .catch(() => {});
  }, [apply]);

  const beat = useCallback(
    async (checkin = false) => {
      const j = load('sakhi.journey');
      if (!j) return;
      const l = locRef.current;
      try {
        const r = await api(`/journeys/${j.id}/beat`, {
          method: 'POST',
          body: { checkin, ...(l ? { lat: l.lat, lng: l.lng, accuracy: l.accuracy } : {}) },
        });
        apply(r.journey);
        return true;
      } catch (e) {
        if (/No active journey/.test(e.message)) apply(null);
        return false;
      }
    },
    [apply],
  );

  const active = !!journey;
  const deadline = journey ? journey.deadline - skew.current : null;
  const left = deadline ? deadline - now : null;
  const overdue = journey?.status === 'active' && left <= 0;

  useEffect(() => {
    if (!active) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [active]);

  useEffect(() => {
    if (!active) return;
    const t = setInterval(() => beat(false), overdue ? OVERDUE_POLL : BEAT_EVERY);
    return () => clearInterval(t);
  }, [active, overdue, beat]);

  useEffect(() => {
    if (!active) return;
    const sync = () => document.visibilityState === 'visible' && beat(false);
    document.addEventListener('visibilitychange', sync);
    window.addEventListener('online', sync);
    return () => {
      document.removeEventListener('visibilitychange', sync);
      window.removeEventListener('online', sync);
    };
  }, [active, beat]);

  useEffect(() => {
    if (journey?.status !== 'active' || left == null) return;
    if (left > WARN_AT) {
      warned.current = false;
      return;
    }
    if (warned.current || left <= 0) return;
    warned.current = true;
    navigator.vibrate?.([400, 200, 400, 200, 400]);
    if (typeof Notification !== 'undefined' && Notification.permission === 'granted' && document.hidden) {
      new Notification('Are you OK?', { body: 'Tap "I\'m safe" in Sakhi within a minute, or your contacts get an SOS.', tag: 'sakhi-checkin', requireInteraction: true });
    }
  }, [journey?.status, left]);

  const start = useCallback(
    async (dest, ride) => {
      if (!loc) {
        onToast('We need your location first');
        return false;
      }
      setBusy(true);
      try {
        const r = await api('/journeys', {
          method: 'POST',
          body: { dest, ride, lat: loc.lat, lng: loc.lng, accuracy: loc.accuracy, contacts },
        });
        warned.current = false;
        adopted.current = null;
        apply(r.journey, r.serverSms);
        onToast('Journey started. Check in when we ask, and you are covered.');
        return true;
      } catch (e) {
        onToast(e.message);
        return false;
      } finally {
        setBusy(false);
      }
    },
    [loc, contacts, apply, onToast],
  );

  const checkIn = useCallback(async () => {
    const ok = await beat(true);
    onToast(ok ? 'Checked in. Timer restarted.' : 'Could not reach Sakhi. Check your connection.');
  }, [beat, onToast]);

  const end = useCallback(async () => {
    const j = load('sakhi.journey');
    if (!j) return;
    setBusy(true);
    try {
      await api(`/journeys/${j.id}/end`, { method: 'POST' });
    } catch {
    }
    apply(null);
    setBusy(false);
    onToast('Journey ended. Glad you made it.');
  }, [apply, onToast]);

  return { journey, left, overdue, busy, lastSync, serverSms, timeoutMs, start, checkIn, end, refresh: () => beat(false) };
}

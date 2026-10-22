import { useCallback, useEffect, useRef, useState } from 'react';
import { load, save } from '../lib/device.js';

const fromPosition = (p) => ({
  lat: p.coords.latitude,
  lng: p.coords.longitude,
  accuracy: Math.round(p.coords.accuracy),
  source: 'gps',
  at: Date.now(),
});

const PRECISE = { enableHighAccuracy: true, maximumAge: 15000, timeout: 30000 };
const COARSE = { enableHighAccuracy: false, maximumAge: 120000, timeout: 15000 };

export function useLocation() {
  const [loc, setLoc] = useState(() => load('sakhi.loc'));
  const [status, setStatus] = useState('locating');
  const watches = useRef([]);
  const gotFix = useRef(false);
  const manual = useRef(load('sakhi.loc')?.source === 'manual');

  const stop = () => {
    for (const id of watches.current) navigator.geolocation.clearWatch(id);
    watches.current = [];
  };

  const startGps = useCallback(() => {
    if (!('geolocation' in navigator)) return setStatus('unavailable');
    if (!window.isSecureContext) return setStatus('unavailable');
    stop();
    manual.current = false;
    gotFix.current = false;
    setStatus((s) => (s === 'gps' ? s : 'locating'));

    const onFix = (p) => {
      if (manual.current) return;
      const v = fromPosition(p);
      const prev = load('sakhi.loc');
      if (gotFix.current && prev?.source === 'gps' && v.accuracy > prev.accuracy * 3 && Date.now() - prev.at < 60000) return;
      gotFix.current = true;
      setLoc(v);
      save('sakhi.loc', v);
      setStatus('gps');
    };
    const onError = (err) => {
      if (manual.current || gotFix.current) return;
      if (err.code === 1) {
        stop();
        setStatus(load('sakhi.loc')?.source === 'manual' ? 'manual' : 'denied');
        return;
      }
      if (watches.current.length < 2) watches.current.push(navigator.geolocation.watchPosition(onFix, onError, COARSE));
      else setStatus(load('sakhi.loc')?.source === 'manual' ? 'manual' : 'unavailable');
    };

    navigator.geolocation.getCurrentPosition(onFix, () => {}, COARSE);
    watches.current.push(navigator.geolocation.watchPosition(onFix, onError, PRECISE));
  }, []);

  useEffect(() => {
    startGps();
    const wake = () => {
      if (document.visibilityState === 'visible' && !manual.current) startGps();
    };
    document.addEventListener('visibilitychange', wake);
    window.addEventListener('online', wake);
    return () => {
      stop();
      document.removeEventListener('visibilitychange', wake);
      window.removeEventListener('online', wake);
    };
  }, [startGps]);

  const setManual = useCallback((lat, lng) => {
    stop();
    manual.current = true;
    const v = { lat, lng, accuracy: null, source: 'manual', at: Date.now() };
    setLoc(v);
    save('sakhi.loc', v);
    setStatus('manual');
  }, []);

  const getFix = useCallback(
    () =>
      new Promise((resolve) => {
        if (!('geolocation' in navigator) || manual.current) return resolve(loc);
        let done = false;
        const finish = (v) => {
          if (done) return;
          done = true;
          resolve(v);
        };
        navigator.geolocation.getCurrentPosition((p) => finish(fromPosition(p)), () => {}, { enableHighAccuracy: true, maximumAge: 10000, timeout: 6000 });
        navigator.geolocation.getCurrentPosition((p) => setTimeout(() => finish(fromPosition(p)), 2500), () => {}, { enableHighAccuracy: false, maximumAge: 30000, timeout: 6000 });
        setTimeout(() => finish(loc), 6500);
      }),
    [loc],
  );

  return { loc, status, setManual, retryGps: startGps, getFix };
}

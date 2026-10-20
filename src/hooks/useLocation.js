import { useCallback, useEffect, useRef, useState } from 'react';
import { load, save } from '../lib/device.js';

const fromPosition = (p) => ({
  lat: p.coords.latitude,
  lng: p.coords.longitude,
  accuracy: Math.round(p.coords.accuracy),
  source: 'gps',
  at: Date.now(),
});

export function useLocation() {
  const [loc, setLoc] = useState(() => load('sakhi.loc'));
  const [status, setStatus] = useState('locating');
  const watchId = useRef(null);

  const stop = () => {
    if (watchId.current != null) navigator.geolocation.clearWatch(watchId.current);
    watchId.current = null;
  };

  const startGps = useCallback(() => {
    if (!('geolocation' in navigator)) return setStatus('unavailable');
    stop();
    setStatus('locating');
    watchId.current = navigator.geolocation.watchPosition(
      (p) => {
        const v = fromPosition(p);
        setLoc(v);
        save('sakhi.loc', v);
        setStatus('gps');
      },
      (err) => setStatus(load('sakhi.loc')?.source === 'manual' ? 'manual' : err.code === 1 ? 'denied' : 'unavailable'),
      { enableHighAccuracy: true, maximumAge: 15000, timeout: 20000 },
    );
  }, []);

  useEffect(() => {
    startGps();
    return stop;
  }, [startGps]);

  const setManual = useCallback((lat, lng) => {
    stop();
    const v = { lat, lng, accuracy: null, source: 'manual', at: Date.now() };
    setLoc(v);
    save('sakhi.loc', v);
    setStatus('manual');
  }, []);

  const getFix = useCallback(
    () =>
      new Promise((resolve) => {
        if (!('geolocation' in navigator)) return resolve(loc);
        navigator.geolocation.getCurrentPosition(
          (p) => resolve(fromPosition(p)),
          () => resolve(loc),
          { enableHighAccuracy: true, maximumAge: 10000, timeout: 6000 },
        );
      }),
    [loc],
  );

  return { loc, status, setManual, retryGps: startGps, getFix };
}

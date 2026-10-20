import { useCallback, useEffect, useState } from 'react';
import { api } from '../lib/api.js';

const supported = () => 'serviceWorker' in navigator && 'PushManager' in window && typeof Notification !== 'undefined';

function keyBytes(base64) {
  const pad = '='.repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + pad).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

export function usePush(loc) {
  const [state, setState] = useState(() => (supported() ? 'working' : 'unsupported'));

  useEffect(() => {
    if (!supported()) return;
    if (Notification.permission === 'denied') return setState('denied');
    navigator.serviceWorker.ready
      .then((reg) => reg.pushManager.getSubscription())
      .then((sub) => setState(sub ? 'on' : 'off'))
      .catch(() => setState('off'));
  }, []);

  const enable = useCallback(async () => {
    if (!supported()) return 'unsupported';
    setState('working');
    try {
      const perm = await Notification.requestPermission();
      if (perm !== 'granted') {
        setState(perm === 'denied' ? 'denied' : 'off');
        return perm;
      }
      const reg = await navigator.serviceWorker.ready;
      const { publicKey } = await api('/push/key');
      const sub = (await reg.pushManager.getSubscription()) || (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(publicKey) }));
      await api('/push/subscribe', { method: 'POST', body: { subscription: sub.toJSON(), ...(loc ? { lat: loc.lat, lng: loc.lng } : {}) } });
      setState('on');
      return 'on';
    } catch (e) {
      console.warn('push subscribe failed', e);
      setState('off');
      return 'error';
    }
  }, [loc]);

  const disable = useCallback(async () => {
    setState('working');
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        await api('/push/unsubscribe', { method: 'POST', body: { endpoint: sub.endpoint } }).catch(() => {});
        await sub.unsubscribe();
      }
    } finally {
      setState('off');
    }
  }, []);

  return { state, enable, disable };
}

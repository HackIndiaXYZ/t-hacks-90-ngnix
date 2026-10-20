import { precacheAndRoute, cleanupOutdatedCaches, createHandlerBoundToURL } from 'workbox-precaching';
import { NavigationRoute, registerRoute } from 'workbox-routing';
import { StaleWhileRevalidate, CacheFirst } from 'workbox-strategies';
import { ExpirationPlugin } from 'workbox-expiration';
import { clientsClaim } from 'workbox-core';

self.skipWaiting();
clientsClaim();
cleanupOutdatedCaches();
precacheAndRoute(self.__WB_MANIFEST);

registerRoute(new NavigationRoute(createHandlerBoundToURL('/index.html'), { denylist: [/^\/api\//] }));

registerRoute(
  ({ url }) => url.hostname.endsWith('tile.openstreetmap.org'),
  new StaleWhileRevalidate({ cacheName: 'osm-tiles', plugins: [new ExpirationPlugin({ maxEntries: 400, maxAgeSeconds: 7 * 24 * 3600 })] }),
);
registerRoute(
  ({ url }) => url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com',
  new CacheFirst({ cacheName: 'fonts', plugins: [new ExpirationPlugin({ maxEntries: 30, maxAgeSeconds: 365 * 24 * 3600 })] }),
);

self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data?.json() || {};
  } catch {
    data = { title: 'Sakhi', body: event.data?.text() };
  }
  event.waitUntil((async () => {
    const wins = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const visible = wins.find((w) => w.visibilityState === 'visible');
    if (visible && data.type === 'sos') {
      visible.postMessage({ type: 'sos-push', sos: data.sos });
      return;
    }
    const s = data.sos;
    await self.registration.showNotification(data.title || 'Sakhi', {
      body: data.body || '',
      icon: '/icon.svg',
      badge: '/icon.svg',
      tag: s ? `sos-${s.id}` : 'sakhi',
      renotify: true,
      requireInteraction: data.type === 'sos',
      vibrate: [300, 150, 300, 150, 300],
      data: { url: s ? `/?sos=${encodeURIComponent(s.id)}` : '/', sos: s },
      actions: s ? [{ action: 'directions', title: 'Directions' }, { action: 'open', title: 'Open Sakhi' }] : [],
    });
  })());
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const { url, sos } = event.notification.data || {};
  if (event.action === 'directions' && sos) {
    event.waitUntil(self.clients.openWindow(`https://www.google.com/maps/dir/?api=1&destination=${sos.lat},${sos.lng}&travelmode=walking`));
    return;
  }
  event.waitUntil((async () => {
    const wins = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const win = wins[0];
    if (win) {
      await win.focus();
      win.postMessage({ type: 'sos-push', sos });
    } else {
      await self.clients.openWindow(url || '/');
    }
  })());
});

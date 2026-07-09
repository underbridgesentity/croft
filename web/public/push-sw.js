// Web-push handlers, imported into the generated Workbox service worker.
self.addEventListener('push', (event) => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch (e) { data = {}; }
  const title = data.title || 'Croft';
  const options = {
    body: data.body || '',
    icon: '/icons/icon-192.png',
    badge: '/icons/icon-192.png',
    data: { url: data.url || '/' },
  };
  event.waitUntil(
    Promise.all([
      self.registration.showNotification(title, options),
      // A push means the household changed - nudge any open tab to re-fetch so
      // the app already shows the new thing when the user switches back.
      self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
        for (const client of list) client.postMessage({ type: 'croft:refresh' });
      }),
    ])
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || '/';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      for (const client of list) {
        if ('focus' in client) {
          // Land on the screen the push is about, with fresh data - not a
          // stale tab showing something else.
          client.postMessage({ type: 'croft:refresh' });
          if ('navigate' in client && url !== '/') client.navigate(url).catch(() => {});
          return client.focus();
        }
      }
      if (self.clients.openWindow) return self.clients.openWindow(url);
    })
  );
});

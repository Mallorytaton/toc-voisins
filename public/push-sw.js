// Notifications, chargé par le service worker de l'app : affichées même app fermée ;
// un toucher ramène l'app (ou l'ouvre) au bon endroit : salle, tournoi, amis.
self.addEventListener('push', (e) => {
  let d = {};
  try {
    d = e.data ? e.data.json() : {};
  } catch {
    d = { body: e.data ? e.data.text() : '' };
  }
  e.waitUntil(self.registration.showNotification(d.title || 'TOC', {
    body: d.body || '',
    icon: 'icon-192.png',
    tag: d.tag || undefined,
    renotify: !!(d.tag && d.renotify),
    data: { url: d.url || './' },
  }));
});

self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const url = new URL((e.notification.data && e.notification.data.url) || './', self.registration.scope).href;
  e.waitUntil((async () => {
    const wins = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const w of wins) {
      if (!w.url.startsWith(self.registration.scope)) continue;
      const moved = await w.navigate(url).catch(() => null);
      return (moved || w).focus();
    }
    return self.clients.openWindow(url);
  })());
});

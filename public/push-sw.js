// Notifications, chargé par le service worker de l'app : affichées même app fermée ;
// un toucher ramène l'app (ou l'ouvre) au bon endroit : salle, tournoi, amis.
// « À toi de jouer » d'une partie à ton rythme : la partie s'ajoute à la pastille de l'icône
// (même liste que src/net/badge.ts, rangée dans le cache « toc-badge »).

/** Ajoute une partie à la pastille de l'icône (une seule fois par partie) ; renvoie le nouveau nombre. */
self.tocBadgeAdd = async (code) => {
  const cache = await caches.open('toc-badge');
  const res = await cache.match('badge');
  const codes = res ? await res.json().catch(() => []) : [];
  if (!codes.includes(code)) codes.push(code);
  await cache.put('badge', new Response(JSON.stringify(codes)));
  if (self.navigator.setAppBadge) await self.navigator.setAppBadge(codes.length).catch(() => undefined);
  return codes.length;
};

self.addEventListener('push', (e) => {
  let d = {};
  try {
    d = e.data ? e.data.json() : {};
  } catch {
    d = { body: e.data ? e.data.text() : '' };
  }
  e.waitUntil(Promise.all([
    self.registration.showNotification(d.title || 'TOC', {
      body: d.body || '',
      icon: 'icon-192.png',
      tag: d.tag || undefined,
      renotify: !!(d.tag && d.renotify),
      data: { url: d.url || './' },
    }),
    d.badge ? self.tocBadgeAdd(String(d.badge)).catch(() => undefined) : null,
  ]));
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

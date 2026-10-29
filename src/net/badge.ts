// Pastille sur l'icône de l'app : le nombre de parties à ton rythme où c'est ton tour.
// La liste des parties est rangée dans un petit cache partagé avec le service worker, qui l'augmente
// quand une notification « À toi de jouer » arrive app fermée (public/push-sw.js).
// Nombre affiché sur iPhone (app installée, iOS 16.4+) et sur ordinateur ; Android ne le permet pas.

const CACHE = 'toc-badge';
const KEY = 'badge';

type BadgeNavigator = Navigator & { setAppBadge?(n?: number): Promise<void>; clearAppBadge?(): Promise<void> };

/** Les parties où c'est ton tour, d'après l'app : elles remplacent la liste tenue par le service worker. */
export async function setBadge(codes: string[]) {
  try {
    const c = await caches.open(CACHE);
    await c.put(KEY, new Response(JSON.stringify(codes)));
  } catch { /* pas de cache : la pastille suit quand même l'app */ }
  const nav = navigator as BadgeNavigator;
  try {
    if (codes.length) await nav.setAppBadge?.(codes.length);
    else await nav.clearAppBadge?.();
  } catch { /* app non installée, ou pastilles non permises : rien à faire */ }
}

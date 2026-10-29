/** Navigation par hash : go('/accueil'). */
export function go(path: string) {
  if (location.hash === '#' + path) window.dispatchEvent(new HashChangeEvent('hashchange'));
  else location.hash = path;
}

const PENDING = 'toc.lien';

/** Lien partagé ouvert par quelqu'un qui n'a pas encore de perso : on y retourne après l'inscription. */
export function rememberLink(path: string) {
  try { sessionStorage.setItem(PENDING, path); } catch { /* stockage indisponible */ }
}

/** La destination mise de côté (une seule fois), sinon null. */
export function takeLink(): string | null {
  try {
    const p = sessionStorage.getItem(PENDING);
    sessionStorage.removeItem(PENDING);
    return p;
  } catch {
    return null;
  }
}

export const ROUTES = {
  splash: '/',
  onboard: '/bienvenue',
  pick: '/perso',
  home: '/accueil',
  friends: '/amis',
  ranking: '/classement',
} as const;

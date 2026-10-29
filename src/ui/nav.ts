/** Navigation par hash : go('/accueil'). */
export function go(path: string) {
  if (location.hash === '#' + path) window.dispatchEvent(new HashChangeEvent('hashchange'));
  else location.hash = path;
}

export const ROUTES = {
  splash: '/',
  onboard: '/bienvenue',
  pick: '/perso',
  home: '/accueil',
  friends: '/gang',
  ranking: '/classement',
} as const;

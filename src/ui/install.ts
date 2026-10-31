// Proposer d'installer l'app sur le téléphone (écran d'accueil), à chaque ouverture tant qu'elle n'est pas installée.
// Android (Chrome, Samsung…) : l'invite d'installation du navigateur, gardée pour notre bouton ; sans elle,
// on explique le geste du menu. iPhone : pas d'invite possible, on explique « Partager » puis « Sur l'écran d'accueil ».
import { h } from './dom';
import { button } from './kit/kit';

interface InstallPrompt extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

let deferred: InstallPrompt | null = null;
let shownThisVisit = false;

export const isInstalled = () =>
  matchMedia('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;

const isPhone = () => matchMedia('(pointer: coarse)').matches && Math.min(screen.width, screen.height) < 600;
const isIOS = () => /iPhone|iPad|iPod/.test(navigator.userAgent);

/** Navigateur piloté par un outil de test : pas de proposition (elle gênerait les vérifications). */
const automated = () => navigator.webdriver === true;

/** L'invite d'Android peut arriver un peu après l'ouverture : on l'attend quelques secondes. */
function waitPrompt(ms: number): Promise<void> {
  if (deferred) return Promise.resolve();
  return new Promise((resolve) => {
    const done = () => { window.removeEventListener('beforeinstallprompt', done); resolve(); };
    window.addEventListener('beforeinstallprompt', done);
    setTimeout(done, ms);
  });
}

/** À appeler au démarrage : garde l'invite d'installation d'Android pour plus tard. */
export function watchInstall() {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferred = e as InstallPrompt;
  });
  window.addEventListener('appinstalled', () => { deferred = null; });
}

/** Petite icône « Partager » d'iOS (carré et flèche vers le haut), dessinée en CSS. */
const shareIcon = () => h('span', { class: 'ios-share', 'aria-label': 'Partager' }, h('i'));

/**
 * Propose l'installation à chaque ouverture, sur un téléphone, tant que l'app tourne dans le navigateur.
 * Renvoie true si la proposition va s'afficher (une seule fois par ouverture).
 */
export function maybeOfferInstall(): boolean {
  if (shownThisVisit || isInstalled() || !isPhone() || automated()) return false;
  shownThisVisit = true;
  void (isIOS() ? Promise.resolve() : waitPrompt(2500)).then(showOffer);
  return true;
}

function showOffer() {
  if (isInstalled()) return;
  const ios = isIOS();
  const close = () => wrap.remove();
  const actions = ios
    ? [
      h('ol', { class: 'install-steps' },
        h('li', null, 'Touche ', shareIcon(), ' en bas de Safari'),
        h('li', null, 'Choisis « Sur l’écran d’accueil »')),
      button('J’ai compris', 'primary', close, { size: 'md', block: true }),
    ]
    : deferred
      ? [
        button('Installer', 'primary', async () => {
          const p = deferred;
          deferred = null;
          close();
          if (!p) return;
          await p.prompt().catch(() => undefined);
          await p.userChoice.catch(() => undefined);
        }, { size: 'md', block: true }),
        button('Plus tard', 'text', close),
      ]
      // Pas d'invite du navigateur (déjà refusée, autre navigateur…) : le geste à faire soi-même.
      : [
        h('ol', { class: 'install-steps' },
          h('li', null, 'Touche le menu ', h('b', null, '⋮'), ' de ton navigateur'),
          h('li', null, 'Choisis « Installer l’application » ou « Ajouter à l’écran d’accueil »')),
        button('J’ai compris', 'primary', close, { size: 'md', block: true }),
      ];
  const wrap = h('div', { class: 'sheet-wrap', onclick: (e: Event) => { if (e.target === wrap) close(); } },
    h('div', { class: 'sheet', role: 'dialog', 'aria-label': 'Installer TOC' },
      h('div', { style: { display: 'flex', alignItems: 'center', gap: 14 } },
        h('img', { src: import.meta.env.BASE_URL + 'icon-192.png', alt: '', width: 56, height: 56, style: { borderRadius: 16 } }),
        h('div', { style: { display: 'flex', flexDirection: 'column', gap: 2 } },
          h('span', { class: 'sheet__title' }, 'Installe TOC'),
          h('span', { class: 't-mini' }, 'Sur ton écran d’accueil'))),
      h('span', { class: 'sheet__text' }, 'Le jeu s’ouvre en plein écran comme une vraie app, sans la barre du navigateur.'),
      ...actions));
  (document.getElementById('app') ?? document.body).append(wrap);
}

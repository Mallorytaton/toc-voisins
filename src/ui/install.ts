// Proposer d'installer l'app sur le téléphone (écran d'accueil), une fois de temps en temps.
// Android (Chrome, Samsung…) : l'invite d'installation du navigateur, gardée pour notre bouton.
// iPhone : pas d'invite possible, on explique le geste « Partager » puis « Sur l'écran d'accueil ».
import { h } from './dom';
import { button } from './kit/kit';

interface InstallPrompt extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

const LATER_KEY = 'toc.install.later';
const WAIT_DAYS = 7;
let deferred: InstallPrompt | null = null;
let shownThisVisit = false;

export const isInstalled = () =>
  matchMedia('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;

const isPhone = () => matchMedia('(pointer: coarse)').matches && Math.min(screen.width, screen.height) < 600;
const isIOS = () => /iPhone|iPad|iPod/.test(navigator.userAgent);

function snoozed() {
  try {
    return Date.now() - Number(localStorage.getItem(LATER_KEY) ?? 0) < WAIT_DAYS * 86_400_000;
  } catch {
    return false;
  }
}
function snooze() {
  try { localStorage.setItem(LATER_KEY, String(Date.now())); } catch { /* sans stockage, on reproposera */ }
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

/** Propose l'installation si on est sur un téléphone, dans le navigateur, et pas récemment refusé. */
export function maybeOfferInstall() {
  if (shownThisVisit || isInstalled() || !isPhone() || snoozed()) return;
  const ios = isIOS();
  if (!ios && !deferred) return;
  shownThisVisit = true;
  const close = () => wrap.remove();
  const later = () => { snooze(); close(); };
  const actions = ios
    ? [
      h('ol', { class: 'install-steps' },
        h('li', null, 'Touche ', shareIcon(), ' en bas de Safari'),
        h('li', null, 'Choisis « Sur l’écran d’accueil »')),
      button('J’ai compris', 'primary', later, { size: 'md', block: true }),
    ]
    : [
      button('Installer', 'primary', async () => {
        const p = deferred;
        deferred = null;
        close();
        if (!p) return;
        await p.prompt().catch(() => undefined);
        const { outcome } = await p.userChoice.catch(() => ({ outcome: 'dismissed' as const }));
        if (outcome === 'dismissed') snooze();
      }, { size: 'md', block: true }),
      button('Plus tard', 'text', later),
    ];
  const wrap = h('div', { class: 'sheet-wrap', onclick: (e: Event) => { if (e.target === wrap) later(); } },
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

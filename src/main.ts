import { registerSW } from 'virtual:pwa-register';
import { LocalController, loadLocal } from './local/local';
import { isFirebaseConfigured } from './net/firebase-config';
import { OnlineSession, createGame, ensureAuth, gameExists } from './net/online';
import { h } from './ui/dom';
import { mountGame } from './ui/game-view';
import {
  createScreen, go, homeScreen, lobbyScreen, localSetupScreen, reclaimScreen, rulesScreen, share,
} from './ui/screens';
import './style.css';
import { botMove, cryptoRng, legalMoves } from './engine';

/** Accès de test automatisé (?debug dans l'URL). */
const DEBUG = new URLSearchParams(location.search).has('debug');

registerSW({ immediate: true });

const app = document.getElementById('app')!;
let cleanup: (() => void) | null = null;
let session: OnlineSession | null = null;
let routeUnsub: (() => void) | null = null;

function setView(el: HTMLElement, onLeave?: () => void) {
  cleanup?.();
  cleanup = onLeave ?? (el as HTMLElement & { cleanup?: () => void }).cleanup ?? null;
  app.replaceChildren(el);
  window.scrollTo(0, 0);
}

function message(title: string, text: string) {
  setView(
    h('div', { class: 'page' },
      h('main', { class: 'page-body center' },
        h('h2', null, title), h('p', null, text), h('button', { class: 'btn', onclick: () => go('/') }, 'Accueil'))),
  );
}

function endSession() {
  session?.stop();
  session = null;
}

/** Page d'une partie en ligne : salon, partie, ou reprise de place selon l'état. */
async function openOnline(code: string) {
  if (!isFirebaseConfigured()) return message('Jeu en ligne indisponible', 'Firebase n’est pas encore configuré.');
  setView(h('div', { class: 'page' }, h('main', { class: 'page-body center' }, h('p', null, 'Connexion à la partie…'))));
  let uid: string;
  try {
    uid = await ensureAuth();
    if (!(await gameExists(code))) return message('Partie introuvable', `Aucune partie TOC-${code} en cours. Vérifie le code.`);
  } catch (e) {
    console.error(e);
    return message('Connexion impossible', 'Vérifie ta connexion internet puis réessaie.');
  }
  if (session?.code !== code) {
    endSession();
    session = new OnlineSession(code, uid);
    await session.start();
  }
  const sess = session!;
  let shown = '';
  const route = () => {
    if (location.hash !== `#/g/${code}`) return;
    const g = sess.game;
    if (!g) return message('Partie introuvable', sess.error || 'Cette partie a été supprimée.');
    const inGame = g.meta.status === 'playing' && !!g.state;
    const kind = !inGame ? 'lobby' : sess.mySeat >= 0 ? 'game' : 'reclaim';
    if (kind === shown && kind !== 'reclaim') return;
    shown = kind;
    if (kind === 'lobby') setView(lobbyScreen(sess));
    else if (kind === 'reclaim') setView(reclaimScreen(sess));
    else {
      const el = h('div');
      const ctl = sess.controller();
      if (DEBUG) Object.assign(window, { __toc: { ctl, legalMoves, botMove, cryptoRng } });
      const unmount = mountGame(el, ctl, { onQuit: () => { endSession(); go('/'); }, onShare: () => share(code) });
      setView(el, unmount);
    }
  };
  routeUnsub?.();
  routeUnsub = sess.subscribe(route);
  route();
}

function openLocalGame() {
  const saved = loadLocal();
  if (!saved) return go('/local');
  const ctl = new LocalController(saved.setup, saved.state);
  const el = h('div');
  const unmount = mountGame(el, ctl, { onQuit: () => go('/') });
  setView(el, () => {
    unmount();
    ctl.leave();
  });
}

async function router() {
  // Lien partagé de la forme ?g=4821
  const q = new URLSearchParams(location.search).get('g');
  if (q && !location.hash) {
    history.replaceState(null, '', location.pathname);
    location.hash = `#/g/${q}`;
    return;
  }
  const path = location.hash.replace(/^#/, '') || '/';
  routeUnsub?.();
  routeUnsub = null;
  const m = /^\/g\/(\d{4})$/.exec(path);
  if (m) return openOnline(m[1]);
  if (session) endSession();
  switch (path) {
    case '/creer':
      return setView(createScreen(async (n, v) => { go('/g/' + (await createGame(n, v))); }));
    case '/local':
      return setView(localSetupScreen((setup) => {
        const ctl = new LocalController(setup);
        ctl.leave(); // sauvegarde initiale faite, la partie est rouverte par la route
        go('/local/jeu');
      }));
    case '/local/jeu':
      return openLocalGame();
    case '/regles':
      return setView(rulesScreen());
    default:
      return setView(homeScreen());
  }
}

window.addEventListener('hashchange', router);
router();
// Prépare la connexion anonyme en arrière-plan pour accélérer la création.
if (isFirebaseConfigured()) ensureAuth().catch(() => undefined);

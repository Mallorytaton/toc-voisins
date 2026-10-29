import { registerSW } from 'virtual:pwa-register';
import '@fontsource-variable/baloo-2';
import '@fontsource-variable/nunito';
import './ui/kit/tokens.css';
import './ui/kit/kit.css';
import './ui/screens/screens.css';
import { getProfile } from './app/profile';
import { type GameSource, LocalGame } from './app/game-source';
import { LocalRoom, type RoomSnapshot } from './app/room';
import { RoomSession } from './net/session';
import { inviteFriend, setInGame, startPresence, syncProfile, watchInvites } from './net/social';
import { DEMO } from './ui/demo';
import { h } from './ui/dom';
import { fitScreen } from './ui/fit';
import { blockZoom, lockPortrait } from './ui/orientation';
import { button } from './ui/kit/kit';
import { ROUTES, go } from './ui/nav';
import { gameScreen } from './ui/screens/game';
import './ui/screens/game.css';
import { homeScreen, savedMode } from './ui/screens/home';
import { onboardScreen, pickScreen, splashScreen } from './ui/screens/intro';
import { roomScreen } from './ui/screens/room';
import { friendsScreen, rankingScreen } from './ui/screens/social';
import { vitrineScreen } from './ui/screens/vitrine';

registerSW({ immediate: true });
lockPortrait();
blockZoom();

/** Partie en cours (une seule à la fois) et salle en ligne associée. */
let currentGame: GameSource | null = null;
let currentSession: RoomSession | null = null;

/** Profil en ligne, présence et invitations : lancés une fois, dès qu'il y a un perso. */
let socialStarted = false;
function startSocial() {
  if (socialStarted || DEMO || !navigator.onLine || !getProfile()) return;
  socialStarted = true;
  syncProfile().catch((e) => console.warn('profil', e));
  startPresence().catch((e) => console.warn('présence', e));
  watchInvites((inv) => {
    if (location.hash === '#/salle/' + inv.code || location.hash === '#/partie') return;
    document.querySelector('.invite-banner')?.remove();
    const banner = h('div', { class: 'invite-banner', role: 'alert' },
      h('span', null, `${inv.name} t’invite dans sa salle !`),
      button('Rejoindre', 'primary', () => { banner.remove(); go('/salle/' + inv.code); }, { size: 'xs' }),
      h('button', { class: 'btn btn--text', type: 'button', 'aria-label': 'Fermer', onclick: () => banner.remove() }, '✕'));
    app.append(banner);
    setTimeout(() => banner.remove(), 20_000);
  });
}

function quitSession() {
  currentSession?.quit();
  currentSession = null;
}

// Accès de test automatisé (?debug dans l'adresse).
if (new URLSearchParams(location.search).has('debug')) Object.assign(window, { __toc: { game: () => currentGame } });

function startLocalGame(s: RoomSnapshot) {
  const p = getProfile()!;
  currentGame = new LocalGame(s.code, s.seats.map((x, k) => k === s.mySeat
    ? { name: p.nick, char: p.char, color: p.color, bot: false, online: true }
    : { name: x!.name, char: x!.char, color: x!.color, bot: true, online: false }));
  go('/partie');
}

const app = document.getElementById('app')!;
let cleanup: (() => void) | null = null;

type View = HTMLElement | { el: HTMLElement; cleanup: () => void };

function setView(v: View) {
  cleanup?.();
  const { el, cleanup: c } = v instanceof HTMLElement ? { el: v, cleanup: null } : v;
  // Les écrans de la maquette tiennent dans le téléphone (la vitrine, elle, défile).
  if (el.classList.contains('screen') && el.dataset.fit !== 'scroll') {
    const f = fitScreen(el, el.dataset.fit === 'tabs' ? 'tabs' : 'fit');
    cleanup = () => { f.dispose(); c?.(); };
    app.replaceChildren(f.el);
  } else {
    cleanup = c;
    app.replaceChildren(el);
  }
  window.scrollTo(0, 0);
}

function router() {
  // Lien d'invitation de la forme ?g=4821
  const q = new URLSearchParams(location.search).get('g');
  if (q && /^\d{4}$/.test(q)) {
    history.replaceState(null, '', location.pathname);
    return go('/salle/' + q);
  }
  const [path, query = ''] = (location.hash.replace(/^#/, '') || '/').split('?');
  const params = new URLSearchParams(query);
  const hasProfile = !!getProfile();
  startSocial();

  // En quittant la salle et la partie, on quitte la salle en ligne.
  const inRoom = currentSession && (path === '/partie' || path === '/salle/' + currentSession.code);
  if (currentSession && !inRoom) {
    quitSession();
    if (currentGame && !currentGame.local) currentGame = null;
  }
  if (path === '/vitrine') return setView(vitrineScreen());
  if (path === '/splash') return setView(splashScreen());
  if (path === ROUTES.onboard) return setView(onboardScreen());
  if (path === ROUTES.pick) return setView(pickScreen());
  // Sans perso, on commence par l'accueil du jeu.
  if (!hasProfile) return path === '/' ? setView(splashScreen()) : go('/');

  const room = /^\/salle\/(nouvelle|\d{4})$/.exec(path);
  if (room) {
    const n = room[1] === 'nouvelle' ? (params.get('n') === '6' ? 6 : params.get('n') === '4' ? 4 : savedMode()) : savedMode();
    // Hors ligne (ou en démo), la salle reste sur l'appareil, avec des robots.
    if (DEMO || !navigator.onLine) {
      const r = new LocalRoom(n, room[1] === 'nouvelle' ? undefined : room[1]);
      return setView(roomScreen(r, () => startLocalGame(r.snapshot())));
    }
    return void openOnlineRoom(room[1], n);
  }
  if (path === '/partie') {
    if (!currentGame) return go(ROUTES.home);
    const game = currentGame;
    const v = gameScreen(game, { onQuit: () => { currentGame = null; quitSession(); go(ROUTES.home); } });
    if (!game.local) void setInGame(true);
    return setView({ el: v.el, cleanup: () => { v.cleanup(); if (!game.local) void setInGame(false); } });
  }
  switch (path) {
    case ROUTES.friends:
      return setView(friendsScreen());
    case ROUTES.ranking:
      return setView(rankingScreen());
    case ROUTES.home:
      return setView(homeScreen());
    default:
      return go(ROUTES.home);
  }
}

function message(title: string, text: string) {
  setView(h('div', { class: 'screen', style: { justifyContent: 'center', textAlign: 'center' } },
    h('span', { class: 't-title' }, title),
    h('p', { class: 't-body' }, text),
    button('Retour à l’accueil', 'primary', () => go(ROUTES.home), { block: true })));
}

/** Salle en ligne : création (« nouvelle ») ou arrivée par code. */
async function openOnlineRoom(code: string, n: 4 | 6) {
  const hash = location.hash;
  if (currentSession?.code !== code) {
    quitSession();
    setView(h('div', { class: 'screen', style: { justifyContent: 'center', alignItems: 'center' } },
      h('span', { class: 't-body' }, code === 'nouvelle' ? 'On prépare ta salle…' : `Connexion à la salle TOC-${code}…`)));
    try {
      currentSession = code === 'nouvelle' ? await RoomSession.create(n) : await RoomSession.join(code);
    } catch (e) {
      console.error(e);
      return message('Salle introuvable', e instanceof Error ? e.message : 'Vérifie ta connexion puis réessaie.');
    }
    if (location.hash !== hash) return;
    // L'adresse montre le vrai code : on peut la partager ou y revenir.
    if (code === 'nouvelle') {
      history.replaceState(null, '', '#/salle/' + currentSession.code);
      // « Inviter » depuis Ta gang : la salle est créée, l'ami reçoit l'invitation.
      const friend = new URLSearchParams(hash.split('?')[1] ?? '').get('invite');
      if (friend) inviteFriend(friend, currentSession.code).catch((e) => console.warn('invitation', e));
    }
  }
  const s = currentSession!;
  setView(roomScreen(s, async () => {
    await s.whenPlaying();
    if (currentSession !== s) return;
    s.rememberPartner();
    currentGame = s.game();
    go('/partie');
  }));
}

window.addEventListener('hashchange', router);
router();

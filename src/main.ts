import { registerSW } from 'virtual:pwa-register';
import '@fontsource-variable/baloo-2';
import '@fontsource-variable/nunito';
import './ui/kit/tokens.css';
import './ui/kit/kit.css';
import './ui/screens/screens.css';
import { getProfile } from './app/profile';
import { type GameSource, LocalGame } from './app/game-source';
import { LocalRoom, type RoomSnapshot } from './app/room';
import { ROUTES, go } from './ui/nav';
import { gameScreen } from './ui/screens/game';
import './ui/screens/game.css';
import { homeScreen, savedMode } from './ui/screens/home';
import { onboardScreen, pickScreen, splashScreen } from './ui/screens/intro';
import { roomScreen } from './ui/screens/room';
import { friendsScreen, rankingScreen } from './ui/screens/social';
import { vitrineScreen } from './ui/screens/vitrine';

registerSW({ immediate: true });

/** Partie en cours (une seule à la fois). */
let currentGame: GameSource | null = null;

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
  cleanup = c;
  app.replaceChildren(el);
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

  if (path === '/vitrine') return setView(vitrineScreen());
  if (path === '/splash') return setView(splashScreen());
  if (path === ROUTES.onboard) return setView(onboardScreen());
  if (path === ROUTES.pick) return setView(pickScreen());
  // Sans perso, on commence par l'accueil du jeu.
  if (!hasProfile) return path === '/' ? setView(splashScreen()) : go('/');

  const room = /^\/salle\/(nouvelle|\d{4})$/.exec(path);
  if (room) {
    const n = room[1] === 'nouvelle' ? (params.get('n') === '6' ? 6 : params.get('n') === '4' ? 4 : savedMode()) : savedMode();
    const r = new LocalRoom(n, room[1] === 'nouvelle' ? undefined : room[1]);
    return setView(roomScreen(r, () => startLocalGame(r.snapshot())));
  }
  if (path === '/partie') {
    if (!currentGame) return go(ROUTES.home);
    const game = currentGame;
    return setView(gameScreen(game, { onQuit: () => { currentGame = null; go(ROUTES.home); } }));
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

window.addEventListener('hashchange', router);
router();

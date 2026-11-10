import { registerSW } from 'virtual:pwa-register';
import '@fontsource/bangers';
import '@fontsource-variable/rubik';
import '@fontsource-variable/rubik/wght-italic.css';
import './ui/kit/tokens.css';
import './ui/kit/kit.css';
import './ui/screens/screens.css';
import { getProfile } from './app/profile';
import { type GameSource, LocalGame } from './app/game-source';
import { LocalRoom, type RoomSnapshot } from './app/room';
import { RoomSession } from './net/session';
import { announceLeagueGame, getLeagueOnce, recordLeagueGame, watchMyLeagues } from './net/league';
import { ensureAuth } from './net/firebase';
import { inviteFriend, setInGame, startPresence, syncProfile, watchInvites } from './net/social';
import { DEMO } from './ui/demo';
import { h, toast } from './ui/dom';
import { fitScreen } from './ui/fit';
import { blockZoom, lockPortrait } from './ui/orientation';
import { maybeOfferInstall, watchInstall } from './ui/install';
import { button } from './ui/kit/kit';
import { ROUTES, go, rememberLink } from './ui/nav';
import { gameScreen } from './ui/screens/game';
import './ui/screens/game.css';
import { homeScreen, savedMode } from './ui/screens/home';
import { albumsScreen, leagueScreen, newLeagueScreen } from './ui/screens/league';
import { onboardScreen, pickScreen, splashScreen } from './ui/screens/intro';
import { roomScreen } from './ui/screens/room';
import { friendsScreen, rankingScreen } from './ui/screens/social';
import { vitrineScreen } from './ui/screens/vitrine';
import { maybeOfferPush } from './ui/push-offer';
import { refreshPush } from './net/push';
import { setBadge } from './net/badge';
import { watchMyGames } from './net/slow';
import { unlockAudio } from './ui/sound';
import { DEFAULT_VARIANTS } from './engine';
import { mascot } from './ui/mascot';
import { playerScreen } from './ui/screens/player';
import { shopScreen } from './ui/screens/shop';
import { tableScreen } from './ui/screens/table';

registerSW({ immediate: true });
// Son : l'iPhone ne le (re)lance que pendant un vrai toucher (fin du toucher, clic), d'où plusieurs écoutes.
for (const ev of ['pointerdown', 'touchend', 'click']) document.addEventListener(ev, unlockAudio, { passive: true, capture: true });
lockPortrait();
blockZoom();
watchInstall();

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
  refreshPush().catch((e) => console.warn('notifications', e));
  // Pastille de l'icône : les parties à ton rythme où c'est ton tour.
  watchMyGames((list) => void setBadge(list.filter((g) => g.status === 'mine').map((g) => g.code)));
  watchInvites((inv) => {
    const target = (inv.league ? '/tournoi/' : '/salle/') + inv.code;
    if (location.hash === '#' + target || location.hash === '#/partie') return;
    document.querySelector('.invite-banner')?.remove();
    const banner = h('div', { class: 'invite-banner', role: 'alert' },
      h('span', null, inv.league ? `${inv.name} t’invite dans l’album « ${inv.league} » !` : `${inv.name} t’invite dans sa salle !`),
      button(inv.league ? 'Voir' : 'Rejoindre', 'primary', () => { banner.remove(); go(target); }, { size: 'xs' }),
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
if (new URLSearchParams(location.search).has('debug')) Object.assign(window, { __toc: { game: () => currentGame, recordLeagueGame } });

function startLocalGame(s: RoomSnapshot, initiation = false) {
  const p = getProfile()!;
  currentGame = new LocalGame(s.code, s.seats.map((x, k) => k === s.mySeat
    ? { name: p.nick, char: p.char, color: p.color, bot: false, online: true }
    : { name: x!.name, char: x!.char, color: x!.color, bot: true, online: false }), initiation ? DEFAULT_VARIANTS : s.variants, initiation);
  go('/partie');
}

const app = document.getElementById('app')!;
let cleanup: (() => void) | null = null;

type View = HTMLElement | { el: HTMLElement; cleanup: () => void };

// ---------- Pliant ouvert : la liste à gauche, le détail à droite ----------
/** Pliant ouvert, à moitié plié en livre, ou tablette : deux colonnes. Les téléphones gardent un seul écran. */
function wideFold() {
  if (matchMedia('(horizontal-viewport-segments: 2)').matches) return true;
  const W = innerWidth, H = innerHeight;
  return matchMedia('(pointer: coarse)').matches && Math.min(W, H) >= 560 && W / H >= 0.6 && W / H <= 1.8;
}
type ListKind = 'home' | 'friends' | 'ranking';
let lastList: ListKind = 'home';
let split: { el: HTMLElement; kind: ListKind; rightPane: HTMLElement; rightOff: () => void } | null = null;

/** Un écran prêt à poser (mis à l'échelle de son conteneur s'il le demande). */
function mount(v: View): { el: HTMLElement; off: () => void } {
  const { el, cleanup: c } = v instanceof HTMLElement ? { el: v, cleanup: null } : v;
  if (el.classList.contains('screen') && el.dataset.fit !== 'scroll') {
    // Un volet est souvent plus étroit qu'un téléphone : le contenu s'y réorganise, à taille normale.
    const f = fitScreen(el, el.dataset.fit === 'tabs' ? 'tabs' : 'fit', { minW: 320 });
    return { el: f.el, off: () => { f.dispose(); c?.(); } };
  }
  return { el, off: () => c?.() };
}

/** Deux volets : la liste (gardée telle quelle si elle ne change pas) et le détail. */
function setSplit(kind: ListKind, list: () => View, detail: View) {
  lastList = kind;
  const right = mount(detail);
  if (split && split.kind === kind && app.firstChild === split.el) {
    split.rightOff();
    split.rightPane.replaceChildren(right.el);
    split.rightOff = right.off;
    return;
  }
  cleanup?.();
  const left = mount(list());
  const rightPane = h('div', { class: 'split__pane split__pane--detail' }, right.el);
  const el = h('div', { class: 'split' }, h('div', { class: 'split__pane' }, left.el), rightPane);
  const s = { el, kind, rightPane, rightOff: right.off };
  split = s;
  cleanup = () => { left.off(); s.rightOff(); if (split === s) split = null; };
  app.replaceChildren(el);
}

/** Volet de droite vide : on dit quoi toucher à gauche. */
const pickHint = (text: string, action?: [string, () => void]) => h('div', { class: 'split__empty' },
  mascot('content', 140), h('span', { class: 't-title' }, 'Le détail s’affiche ici'), h('span', { class: 't-body' }, text),
  action && button(action[0], 'primary', action[1], { size: 'md' }));

/** Volet de droite par défaut : un écran choisi dès que ses données arrivent (l'indication en attendant). */
function lazyPane(hint: HTMLElement, pick: (show: (v: View) => void) => () => void): View {
  const box = h('div', { class: 'split__auto' }, hint);
  let cur: (() => void) | null = null;
  const stop = pick((v) => { cur?.(); const m = mount(v); cur = m.off; box.replaceChildren(m.el); });
  return { el: box, cleanup: () => { stop(); cur?.(); } };
}
/** Ta fiche de joueur (Amis, Classement), en attendant qu'on touche quelqu'un à gauche. */
const myPane = (text: string) => lazyPane(pickHint(text), (show) => {
  let alive = navigator.onLine;
  if (alive) ensureAuth().then((uid) => { if (alive && uid) show(playerScreen(uid)); }).catch(() => undefined);
  return () => { alive = false; };
});
/** Ton tournoi le plus récent (Jouer), sinon de quoi en créer un. */
const leaguePane = () => lazyPane(pickHint('Touche un de tes albums : sa prochaine soirée, son classement et son chat s’affichent ici.',
  ['Créer un album', () => go('/tournoi/nouveau')]), (show) => {
  if (!navigator.onLine) return () => {};
  let done = false;
  return watchMyLeagues((list) => { if (done || !list.length) return; done = true; show(leagueScreen(list[0].code)); });
});

// On plie ou déplie hors partie : l'écran se réorganise (la partie, elle, gère ses propres volets).
let wasWide = wideFold();
const onFold = () => {
  const w = wideFold();
  if (w === wasWide) return;
  wasWide = w;
  if (!/^#\/(partie|salle|table)/.test(location.hash)) router();
};
window.addEventListener('resize', onFold);
matchMedia('(horizontal-viewport-segments: 2)').addEventListener?.('change', onFold);

function setView(v: View) {
  cleanup?.();
  split = null;
  const { el, cleanup: c } = v instanceof HTMLElement ? { el: v, cleanup: null } : v;
  // Les écrans de la maquette tiennent dans le téléphone (la vitrine, elle, défile).
  if (el.classList.contains('screen') && el.dataset.fit !== 'scroll') {
    // Grand écran (pliant ouvert, tablette) : les écrans prévus pour s'élargissent (deux colonnes).
    const big = el.dataset.wide !== undefined && Math.min(innerWidth, innerHeight) >= 560;
    const f = fitScreen(el, el.dataset.fit === 'tabs' ? 'tabs' : 'fit', big ? { maxW: 1000 } : {});
    cleanup = () => { f.dispose(); c?.(); };
    app.replaceChildren(f.el);
  } else {
    cleanup = c;
    app.replaceChildren(el);
  }
  window.scrollTo(0, 0);
}

const SHARED_LINKS: [string, RegExp, (v: string) => string][] = [
  ['g', /^\d{4}$/, (v) => '/salle/' + v],
  ['t', /^\d{4}$/, (v) => '/tournoi/' + v],
  ['ami', /^[A-Za-z]+[#-]\d{4}$/, (v) => '/amis?ajout=' + encodeURIComponent(v)],
  ['table', /^\d{4}$/, (v) => '/table/' + v],
];

function router() {
  // Liens partagés : ?g=4821 (salle), ?t=4821 (tournoi), ?ami=FREDO%232741 (ajouter un ami).
  const search = new URLSearchParams(location.search);
  for (const [k, re, to] of SHARED_LINKS) {
    const v = search.get(k);
    if (v && re.test(v)) {
      history.replaceState(null, '', location.pathname);
      return go(to(v));
    }
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
  // Écran de table (tablette au milieu de la table) : pas besoin de perso.
  const tb = /^\/table\/(\d{4})$/.exec(path);
  if (tb) return setView(tableScreen(tb[1]));
  if (path === ROUTES.pick) return setView(pickScreen());
  // Sans perso, on commence par l'accueil du jeu ; la salle, le tournoi ou l'ami du lien attendent la fin de l'inscription.
  if (!hasProfile) {
    if (/^\/(salle\/\d{4}|tournoi\/\d{4}|amis\?ajout=)/.test(location.hash.slice(1))) rememberLink(location.hash.slice(1));
    return path === '/' ? setView(splashScreen()) : go('/');
  }

  const room = /^\/salle\/(nouvelle|\d{4})$/.exec(path);
  if (room) {
    const n = room[1] === 'nouvelle' ? (params.get('n') === '6' ? 6 : params.get('n') === '4' ? 4 : savedMode()) : savedMode();
    // Hors ligne (ou en démo), la salle reste sur l'appareil, avec des robots.
    if (DEMO || !navigator.onLine) {
      const r = new LocalRoom(n, room[1] === 'nouvelle' ? undefined : room[1]);
      return setView(roomScreen(r, () => startLocalGame(r.snapshot())));
    }
    return void openOnlineRoom(room[1], n, params.get('ligue'));
  }
  if (path === '/tournoi/nouveau') return setView(newLeagueScreen());
  if (path === '/boutique') return setView(shopScreen());
  const pl = /^\/joueur\/([\w-]{6,128})$/.exec(path);
  if (pl) return wideFold() ? setSplit(lastList, () => listView(lastList, params), playerScreen(pl[1])) : setView(playerScreen(pl[1]));
  // Partie d'initiation : à 4, contre des robots, sur l'appareil (aussi hors ligne).
  if (path === '/initiation') {
    const r = new LocalRoom(4);
    r.fillBots();
    return startLocalGame(r.snapshot(), true);
  }
  const lg = /^\/tournoi\/(\d{4})$/.exec(path);
  if (lg) {
    if (!navigator.onLine) return message('Pas de réseau', 'Les albums se jouent en ligne. Réessaie quand tu es connecté.');
    return wideFold() ? setSplit('home', () => listView('home', params), leagueScreen(lg[1])) : setView(leagueScreen(lg[1]));
  }
  if (path === '/partie') {
    if (!currentGame) return go(ROUTES.home);
    const game = currentGame;
    // Partie en ligne : on la retient pour pouvoir la reprendre si l'app est fermée.
    if (!game.local) try { localStorage.setItem('toc.lastRoom', game.code); } catch { /* sans stockage */ }
    const v = gameScreen(game, { onQuit: () => {
      currentGame = null;
      quitSession();
      try { localStorage.removeItem('toc.lastRoom'); } catch { /* sans stockage */ }
      go(ROUTES.home);
    } });
    if (!game.local) void setInGame(true);
    return setView({ el: v.el, cleanup: () => { v.cleanup(); if (!game.local) void setInGame(false); } });
  }
  switch (path) {
    case ROUTES.friends:
      if (wideFold()) return setSplit('friends', () => listView('friends', params), myPane('Touche un ami pour voir sa fiche de joueur.'));
      return setView(friendsScreen(params.get('ajout')));
    case ROUTES.ranking:
      if (wideFold()) return setSplit('ranking', () => listView('ranking', params), myPane('Touche un joueur pour voir sa fiche.'));
      return setView(rankingScreen());
    case ROUTES.albums:
      return setView(albumsScreen());
    case ROUTES.home:
      // Sur un téléphone, dans le navigateur : on propose d'installer l'app.
      // (seulement si on est encore sur l'accueil : jamais au milieu d'une salle ou d'une partie)
      // Sinon (installée, ou déjà proposé), on propose les notifications.
      setTimeout(() => { if (location.hash.startsWith('#' + ROUTES.home) && !maybeOfferInstall()) maybeOfferPush(); }, 1500);
      if (wideFold()) return setSplit('home', () => listView('home', params), leaguePane());
      return setView(homeScreen());
    default:
      return go(ROUTES.home);
  }
}

/** Liste du volet de gauche. */
function listView(kind: ListKind, params: URLSearchParams): View {
  return kind === 'friends' ? friendsScreen(params.get('ajout')) : kind === 'ranking' ? rankingScreen() : homeScreen();
}

function message(title: string, text: string) {
  setView(h('div', { class: 'screen', style: { justifyContent: 'center', textAlign: 'center', alignItems: 'center' } },
    mascot('surpris', 150),
    h('span', { class: 't-title' }, title),
    h('p', { class: 't-body' }, text),
    button('Retour à l’accueil', 'primary', () => go(ROUTES.home), { block: true })));
}

/** La salle disparaît pendant qu'on y est (supprimée par l'hôte, ou par soi) : retour à l'accueil. */
function onRoomGone(s: RoomSession) {
  s.onGone = () => {
    if (currentSession !== s) return;
    const mine = s.deletedByMe;
    currentGame = null;
    quitSession();
    try { localStorage.removeItem('toc.lastRoom'); } catch { /* sans stockage */ }
    go(ROUTES.home);
    setTimeout(() => toast(mine ? 'Partie supprimée.' : 'La partie a été supprimée par l’hôte.', 2600), 400);
  };
}

/** Salle en ligne : création (« nouvelle ») ou arrivée par code. */
async function openOnlineRoom(code: string, n: 4 | 6, ligue: string | null = null) {
  const hash = location.hash;
  if (currentSession?.code !== code) {
    quitSession();
    setView(h('div', { class: 'screen', style: { justifyContent: 'center', alignItems: 'center' } },
      h('span', { class: 't-body' }, code === 'nouvelle' ? 'On prépare ta salle…' : `Connexion à la salle TOC-${code}…`)));
    try {
      if (code !== 'nouvelle') currentSession = await RoomSession.join(code);
      else if (ligue) {
        // Partie de tournoi : places fixes de chaque membre, invitation envoyée aux autres.
        const l = await getLeagueOnce(ligue);
        if (!l) throw new Error('Cet album n’existe plus.');
        currentSession = await RoomSession.create(l.n, l.variants, { league: l.code, title: l.name, reserved: l.seats });
        const me = currentSession.uid;
        // Les membres se connaissent : pas de lien à partager, la partie leur est annoncée (app et notification).
        announceLeagueGame(l.code, currentSession.code, l.seats.filter((u) => u && u !== me)).catch((e) => console.warn('annonce', e));
      } else currentSession = await RoomSession.create(n);
    } catch (e) {
      console.error(e);
      return message('Salle introuvable', e instanceof Error ? e.message : 'Vérifie ta connexion puis réessaie.');
    }
    onRoomGone(currentSession);
    if (location.hash !== hash) return;
    // L'adresse montre le vrai code : on peut la partager ou y revenir.
    if (code === 'nouvelle') {
      history.replaceState(null, '', '#/salle/' + currentSession.code);
      // « Inviter » depuis Amis : la salle est créée, l'ami reçoit l'invitation.
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

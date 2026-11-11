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
import { announceLeagueGame, getLeagueOnce, recordLeagueGame } from './net/league';
import { ensureAuth } from './net/firebase';
import { type Recovered, inviteFriend, setInGame, startPresence, syncProfile, watchInvites } from './net/social';
import { DEMO } from './ui/demo';
import { h, toast } from './ui/dom';
import { fitScreen } from './ui/fit';
import { pose, spread as doublePage, watchFold } from './ui/fold';
import { blockZoom, lockPortrait } from './ui/orientation';
import { maybeOfferInstall, watchInstall } from './ui/install';
import { type Tab, button } from './ui/kit/kit';
import { inPage, signets, spread } from './ui/album/spread';
import { ROUTES, go, rememberLink } from './ui/nav';
import { gameScreen } from './ui/screens/game';
import './ui/screens/game.css';
import './ui/screens/game-fold.css';
import './ui/album/album.css';
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
// Pliants : la tenue en cours (grand ouvert, en livre, en chevalet, à clapet), pour ce qui est commun à tous les écrans.
const markPose = () => {
  const p = pose();
  if (p === 'phone') delete document.documentElement.dataset.pli;
  else document.documentElement.dataset.pli = p;
};
markPose();
watchFold(markPose);

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
  // Essais automatisés (?debug&chat) : la partie contre les robots a un chat de table, comme une partie en ligne.
  const search = new URLSearchParams(location.search);
  if (search.has('debug') && search.has('chat')) (currentGame as LocalGame).testChat();
  go('/partie');
}

const app = document.getElementById('app')!;
let cleanup: (() => void) | null = null;

type View = HTMLElement | { el: HTMLElement; cleanup: () => void };

// ---------- Pliants : la double page (src/ui/album/spread.ts) ----------
// Hors partie, un pliant ouvert (ou une tablette) est un album de BD ouvert : la page de gauche liste, avec les
// marque-pages, et la page de droite répond. La une, le kiosque et l'affiche composent leur double page eux-mêmes ;
// Ta bande et Albums posent deux de leurs écrans côte à côte.
/** Le volet de Ta bande d'où l'on a ouvert une fiche de joueur : sa liste reste sur la page de gauche. */
let lastVolet: 'amis' | 'classement' = 'amis';
const parts = (v: View) => (v instanceof HTMLElement ? { el: v, off: () => {} } : { el: v.el, off: v.cleanup });
/** Deux écrans dans la double page : celui de gauche liste, celui de droite répond. */
function setAlbum(tab: Tab, left: View, right: View) {
  cleanup?.();
  const sp = spread({ tone: 'jaune' });
  const L = parts(left), R = parts(right);
  sp.left.append(inPage(L.el), signets(tab));
  sp.right.append(inPage(R.el));
  cleanup = () => { sp.dispose(); L.off(); R.off(); };
  app.replaceChildren(sp.el);
  window.scrollTo(0, 0);
}
/** Page de droite en attendant un choix à gauche : Toc dit quoi toucher. */
const pickHint = (title: string, text: string, action?: [string, () => void]) => h('div', { class: 'screen livre__attente' },
  mascot('content', 150), h('span', { class: 't-title' }, title), h('span', { class: 't-body' }, text),
  action ? button(action[0], 'primary', action[1], { size: 'md' }) : null);
/** Page de droite qui se remplit dès que ses données arrivent (l'indication en attendant). */
function lazyPage(hint: HTMLElement, pick: (show: (v: View) => void) => () => void): View {
  const box = h('div', { class: 'screen livre__attente-boite' }, hint);
  let cur: (() => void) | null = null;
  const stop = pick((v) => { cur?.(); const m = parts(v); cur = m.off; box.replaceChildren(inPage(m.el)); });
  return { el: box, cleanup: () => { stop(); cur?.(); } };
}
/** Ta fiche de héros, en attendant qu'on touche quelqu'un à gauche. */
const myPage = () => lazyPage(pickHint('Sa fiche s’affiche ici', 'Touche un voisin, à gauche : sa fiche de héros s’ouvre sur cette page.'), (show) => {
  let alive = true;
  if (!navigator.onLine || DEMO) show(playerScreen('moi'));
  else ensureAuth().then((uid) => { if (alive) show(playerScreen(uid || 'moi')); }).catch(() => { if (alive) show(playerScreen('moi')); });
  return () => { alive = false; };
});

// On plie ou on déplie hors partie : l'écran se recompose (la partie suit la pliure toute seule).
let wasDouble = doublePage();
watchFold(() => {
  const d = doublePage();
  if (d === wasDouble) return;
  wasDouble = d;
  if (!/^#\/(partie|table)/.test(location.hash)) router();
});

function setView(v: View) {
  cleanup?.();
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
      return setView(roomScreen(r, () => startLocalGame(r.snapshot()), { wide: doublePage() }));
    }
    return void openOnlineRoom(room[1], n, params.get('ligue'));
  }
  if (path === '/tournoi/nouveau') return setView(newLeagueScreen());
  if (path === '/boutique') return setView(shopScreen({ wide: doublePage() }));
  // Ta fiche de héros (l'avatar de la une) : elle s'ouvre aussi hors ligne, avec ce que le téléphone sait de toi.
  // Double page : la fiche répond sur la page de droite, la bande reste à gauche.
  const pl = path === '/joueur/moi' ? ['', 'moi'] : /^\/joueur\/([\w-]{6,128})$/.exec(path);
  if (pl) return doublePage() ? setAlbum('friends', friendsScreen(null, lastVolet), playerScreen(pl[1])) : setView(playerScreen(pl[1]));
  // Partie d'initiation : à 4, contre des robots, sur l'appareil (aussi hors ligne).
  if (path === '/initiation') {
    const r = new LocalRoom(4);
    r.fillBots();
    return startLocalGame(r.snapshot(), true);
  }
  const lg = /^\/tournoi\/(\d{4})$/.exec(path);
  if (lg) {
    if (!navigator.onLine) return message('Pas de réseau', 'Les albums se jouent en ligne. Réessaie quand tu es connecté.');
    // Double page : tes albums à gauche, celui-ci à droite.
    return doublePage() ? setAlbum('albums', albumsScreen(true), leagueScreen(lg[1])) : setView(leagueScreen(lg[1]));
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
      lastVolet = 'amis';
      if (doublePage()) return setAlbum('friends', friendsScreen(params.get('ajout')), myPage());
      return setView(friendsScreen(params.get('ajout')));
    case ROUTES.ranking:
      lastVolet = 'classement';
      if (doublePage()) return setAlbum('friends', rankingScreen(), myPage());
      return setView(rankingScreen());
    case ROUTES.albums:
      // Double page : la liste à gauche ; à droite, de quoi commencer (un seul album : il s'ouvre aussitôt à droite).
      if (doublePage()) return setAlbum('albums', albumsScreen(params.has('liste')),
        pickHint('Ton album s’ouvre ici', 'Touche un album, à gauche : son score, sa prochaine soirée et ses épisodes s’affichent sur cette page.', ['Créer un album', () => go('/tournoi/nouveau')]));
      return setView(albumsScreen(params.has('liste')));
    case ROUTES.home:
      // Sur un téléphone, dans le navigateur : on propose d'installer l'app.
      // (seulement si on est encore sur l'accueil : jamais au milieu d'une salle ou d'une partie)
      // Sinon (installée, ou déjà proposé), on propose les notifications.
      setTimeout(() => { if (location.hash.startsWith('#' + ROUTES.home) && !maybeOfferInstall()) maybeOfferPush(); }, 1500);
      // Pliant ouvert, tablette : la une en double page.
      return setView(homeScreen({ wide: doublePage() }));
    default:
      return go(ROUTES.home);
  }
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
      // (la une en double page en invite deux d'un coup : leurs identifiants, séparés par une virgule)
      const invited = new URLSearchParams(hash.split('?')[1] ?? '').get('invite');
      for (const friend of invited ? invited.split(',').filter(Boolean) : []) inviteFriend(friend, currentSession.code).catch((e) => console.warn('invitation', e));
    }
  }
  const s = currentSession!;
  setView(roomScreen(s, async () => {
    await s.whenPlaying();
    if (currentSession !== s) return;
    s.rememberPartner();
    currentGame = s.game();
    go('/partie');
  }, { wide: doublePage() }));
}

window.addEventListener('hashchange', router);
// Progression retrouvée en rapprochant le profil du compte en ligne : on le dit, et l'accueil reprend les bons chiffres.
window.addEventListener('toc:progression', (e) => {
  const { xp, tokens } = (e as CustomEvent<Recovered>).detail;
  const parts = [xp > 0 && `${xp.toLocaleString('fr-FR')} XP`, tokens > 0 && `${tokens.toLocaleString('fr-FR')} pièces`].filter(Boolean);
  toast(`Progression retrouvée sur ton compte : ${parts.join(' et ')}.`, 4200);
  if (location.hash.startsWith('#' + ROUTES.home)) router();
});
router();

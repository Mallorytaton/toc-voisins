// L'affiche : la salle d'attente, en pleine page comme l'affiche d'un match. Les équipes se font face de part et
// d'autre d'un éclair (deux éclairs à trois équipes) : toi et ton partenaire en haut, tes adversaires en dessous.
// Autour : le code de la salle, le « Précédemment… », le bouton qui lance la partie et les réglages de la salle.
import { draftProfile } from '../../app/profile';
import { type Rival, rivalOf } from '../../app/rivaux';
import type { Room, RoomSnapshot } from '../../app/room';
import { titreOf } from '../../app/shop';
import { getLeagueOnce } from '../../net/league';
import { confirmSheet } from '../confirm';
import { DEMO } from '../demo';
import { deNom, h, toast } from '../dom';
import { type CharId, type ColorName, TEAM_BG, TEAM_INK, TEAM_NAMES } from '../kit/data';
import { ICONS, avatar, backButton, button, icon, segmented } from '../kit/kit';
import type { Humeur } from '../kit/perso';
import { ROUTES, go } from '../nav';
import { burstEl } from '../planche';
import { openTableSheet } from '../table-invite';
import { type FriendView, inviteFriend, watchFriends } from '../../net/social';
import { spread } from '../album/spread';
import { DEMO_FRIENDS } from '../demo';
import { qrCard } from '../qr';
import { variantsCard, variantsSummary, withDefaults } from './rules';

async function shareInvite(room: Room) {
  const url = room.link();
  const text = `Viens jouer au TOC avec moi ! Code TOC-${room.snapshot().code}`;
  try {
    if (navigator.share) return await navigator.share({ title: 'TOC', text, url });
    await navigator.clipboard.writeText(`${text} : ${url}`);
    toast('Lien copié, envoie-le à ta bande !');
  } catch {
    // Partage annulé : rien à faire.
  }
}

/** Membres de l'album (partie d'album) : nom et perso, pour les places encore vides. */
type Members = Record<string, { name: string; char: CharId; color: ColorName }>;

// ---------- La composition : un cadre de 390 × 444, aux cotes de la maquette ----------
/** Une place sur l'affiche : le perso (coin haut gauche, taille, inclinaison), son étiquette (x, y, inclinaison) et son humeur. */
interface Spot { x: number; y: number; size: number; rot: number; tag: [number, number, number]; right?: boolean; humeur: Humeur; flip?: boolean }
/** Deux équipes. Dans l'ordre : toi, ton partenaire, l'adversaire, le rival (en grand, à droite). */
const SPOTS4: Spot[] = [
  { x: 20, y: 18, size: 136, rot: -5, tag: [24, 156, -4], humeur: 'furieux' },
  { x: 152, y: 56, size: 108, rot: 5, tag: [252, 106, 4], humeur: 'content' },
  { x: 112, y: 298, size: 108, rot: -5, tag: [30, 324, -4], humeur: 'concentre', flip: true },
  { x: 234, y: 272, size: 136, rot: 5, tag: [16, 410, 3], right: true, humeur: 'malin', flip: true },
];
/** Trois équipes : la tienne en haut, puis les deux autres, dans l'ordre du jeu. */
const SPOTS6: Spot[] = [
  { x: 14, y: 20, size: 96, rot: -5, tag: [16, 112, -4], humeur: 'furieux' },
  { x: 118, y: 36, size: 80, rot: 5, tag: [206, 62, 4], humeur: 'content' },
  { x: 22, y: 214, size: 76, rot: -5, tag: [100, 240, -3], humeur: 'concentre', flip: true },
  { x: 268, y: 158, size: 84, rot: 5, tag: [12, 238, 3], right: true, humeur: 'malin', flip: true },
  { x: 104, y: 338, size: 80, rot: -5, tag: [14, 352, -4], humeur: 'malin', flip: true },
  { x: 244, y: 314, size: 96, rot: 5, tag: [12, 408, 3], right: true, humeur: 'furieux', flip: true },
];
/** Le nom de chaque équipe : x, y, inclinaison. */
const LABELS4: [number, number, number][] = [[226, 8, 4], [20, 414, -4]];
const LABELS6: [number, number, number][] = [[232, 6, 4], [14, 186, -6], [16, 416, -4]];
/** Le « VS » : coin haut gauche et taille. */
const VS4: [number, number, number][] = [[137, 168, 116]];
const VS6: [number, number, number][] = [[153, 111, 70], [153, 261, 70]];

type Pt = [number, number];
/** L'éclair qui sépare deux équipes : une ligne brisée, prolongée loin des deux côtés pour traverser aussi les grands écrans. */
const BOLT4: Pt[] = [[-1010, 530], [182, 232], [170, 256], [1400, -172]];
const bolt6 = (c: number): Pt[] => [[-1010, c + 151], [182, c + 2], [170, c + 18], [1400, c - 196]];
/** Le décor déborde largement du cadre : il couvre tout l'écran, quel que soit le téléphone. */
const BG_X = 1000, BG_Y = 900;
const poly = (pts: Pt[]) => `polygon(${pts.map(([x, y]) => `${x + BG_X}px ${y + BG_Y}px`).join(',')})`;
const band = (line: Pt[], t: number): Pt[] => [...line.map(([x, y]): Pt => [x, y - t]), ...line.slice().reverse().map(([x, y]): Pt => [x, y + t])];
const above = (line: Pt[]): Pt[] => [[-BG_X, -BG_Y], [390 + BG_X, -BG_Y], ...line.slice().reverse()];

/** Le fond de l'affiche : une couleur par équipe (de haut en bas), les éclairs entre elles, les rayons et les trames. */
function decor(teams: number[]): HTMLElement {
  const lines = teams.length === 2 ? [BOLT4] : [bolt6(146), bolt6(296)];
  const [white, ink] = teams.length === 2 ? [9, 13] : [6, 9.5];
  const layer = (background: string, clip?: Pt[], cls = '') => h('i', { class: cls, style: { background, clipPath: clip ? poly(clip) : 'none' } });
  return h('div', { class: 'aff-bg', 'aria-hidden': 'true' },
    // La couleur de l'équipe du bas remplit tout ; celles du dessus se posent au-dessus de chaque éclair.
    layer(TEAM_BG[teams[teams.length - 1]]),
    h('i', { class: 'aff-bg__dots aff-bg__dots--bas' }),
    ...lines.map((_, k) => lines.length - 1 - k).map((k) => layer(TEAM_BG[teams[k]], above(lines[k]))),
    h('i', { style: { clipPath: poly(above(lines[0])) } }, h('i', { class: 'aff-bg__dots aff-bg__dots--haut' })),
    h('i', { class: 'aff-bg__rays' }),
    ...lines.flatMap((l) => [layer('var(--ink)', band(l, ink)), layer('#fff', band(l, white))]));
}

/** « Précédemment… » : la rivalité la plus vive entre toi et un adversaire de la table, racontée comme un résumé d'épisode. */
function previously(me: string, foes: string[]): string | null {
  if (DEMO) return `Coco a renvoyé ${me} 12 fois à la réserve. ${me} lui en doit 3.`;
  const r = foes.map((f) => rivalOf(f)).filter((x): x is Rival => !!x && x.on + x.by > 0).sort((a, b) => (b.on + b.by) - (a.on + a.by))[0];
  if (!r) return null;
  if (r.on > r.by) return `${r.name} a renvoyé ${me} ${r.on} fois à la réserve. ${me} lui en doit ${r.on - r.by}.`;
  if (r.by > r.on) return `${me} a renvoyé ${r.name} ${r.by} fois à la réserve. ${r.name} lui en doit ${r.by - r.on}.`;
  return `${me} et ${r.name} se sont renvoyés ${r.on} fois chacun à la réserve. Qui prend l’avantage ?`;
}

/** wide : l'affiche en double page (pliants, tablettes), les équipes à gauche et les coulisses à droite. */
export function roomScreen(room: Room, onStart: () => void, o: { wide?: boolean } = {}): { el: HTMLElement; cleanup: () => void } {
  const s0 = room.snapshot();
  const n = s0.n, half = n / 2;
  const myName = draftProfile().nick || 'Toi';
  const spots = n === 4 ? SPOTS4 : SPOTS6;

  // ---------- En haut : retour, le code de la salle (le toucher copie le lien), inviter ----------
  const codeBtn = h('button', {
    class: 'aff-code', type: 'button', 'aria-label': `Copier le lien de la salle TOC-${s0.code}`,
    onclick: async () => {
      try {
        await navigator.clipboard.writeText(room.link());
      } catch {
        return shareInvite(room);
      }
      toast('Lien copié, envoie-le à ta bande !');
    },
  }, h('span', null, 'Salle'), h('b', null, 'TOC-' + s0.code));
  const kicker = h('span', { class: 'tag aff-kicker' }, s0.title ? 'Album · nouvel épisode' : `Partie privée · ${n} joueurs`);
  const title = h('h1', { class: 'aff-h1' });
  const setTitle = (t: string) => {
    title.textContent = t;
    title.classList.toggle('aff-h1--long', t.length > 17);
    title.classList.toggle('aff-h1--xl', t.length > 23);
  };
  setTitle(s0.title ?? 'La table');

  // ---------- Les équipes ----------
  const ring = h('div', { class: 'aff-ring aff-ring--n' + n });
  // Arrivées : la place qui vient d'être prise fait un petit rebond (on garde l'heure pour ne pas le couper aux mises à jour).
  let taken = s0.seats.map(Boolean);
  const arrived = new Map<number, number>();
  // Partie d'album : les membres se connaissent ; on les prévient (notification), sans lien d'invitation.
  let members: Members = {};
  if (s0.league) getLeagueOnce(s0.league).then((l) => {
    if (!l) return;
    members = l.members;
    kicker.textContent = `Ce soir · épisode ${l.games.length + 1}`;
    draw();
  }).catch(() => undefined);
  let notifiedAt = 0;
  const notify = (to: string[]) => {
    if (!to.length) return;
    if (Date.now() - notifiedAt < 60_000) return toast('Notification déjà envoyée il y a moins d’une minute.');
    notifiedAt = Date.now();
    room.notifyLeague?.(to);
    const names = to.map((u) => members[u]?.name).filter(Boolean);
    toast(names.length ? `Notification envoyée à ${names.join(', ').replace(/, ([^,]*)$/, ' et $1')}.` : 'Notification envoyée.', 2600);
  };
  const waitingFor = () => { const s = room.snapshot(); return (s.reserved ?? []).filter((u, k) => u && !s.seats[k]); };

  /** L'étiquette d'une place : le nom en lettrage, et sa pastille (« Toi », la coche de ceux qui sont prêts…). */
  const nameTag = (spot: Spot, name: string, chip: HTMLElement | null) => h('span', {
    class: 'aff-name' + (name.length > 8 ? ' aff-name--long' : ''),
    style: { [spot.right ? 'right' : 'left']: spot.tag[0], top: spot.tag[1], rotate: spot.tag[2] + 'deg' },
  }, h('b', null, name), chip);
  const check = (label: string) => h('i', { class: 'aff-ok', role: 'img', 'aria-label': label }, icon(ICONS.check, 10, 4.6));
  const chipEl = (text: string, cls = '') => h('i', { class: 'aff-chip' + cls }, text);
  const at = (spot: Spot, el: HTMLElement) => {
    Object.assign(el.style, { left: spot.x + 'px', top: spot.y + 'px', rotate: spot.rot + 'deg' });
    return el;
  };

  /** Une place : le joueur et son étiquette, ou une place libre qui invite. */
  const slot = (s: RoomSnapshot, seat: number, spot: Spot): HTMLElement => {
    const p = s.seats[seat];
    const chair = (inner: HTMLElement | string) => at(spot, h('span', { class: 'aff-chair', style: { width: spot.size, height: spot.size } }, inner));
    // Partie d'album : la place attend un membre précis (équipes fixes) ; on le prévient, pas de lien à partager.
    const want = !p ? s.reserved?.[seat] : '';
    if (want) {
      const m = members[want];
      return h('button', { class: 'aff-slot aff-slot--wanted', type: 'button', 'aria-label': `Prévenir ${m?.name ?? 'ce joueur'}`, onclick: () => notify([want]) },
        m ? at(spot, avatar(m.char, m.color, spot.size, 'content', { flip: spot.flip, ombre: true })) : chair('…'),
        nameTag(spot, m?.name ?? '…', chipEl('Prévenir', ' aff-chip--go')));
    }
    if (!p)
      return h('button', { class: 'aff-slot aff-slot--empty', type: 'button', 'aria-label': 'Place libre : inviter un ami', onclick: () => shareInvite(room) },
        chair(icon(ICONS.plus, Math.round(spot.size * 0.34), 3.6)),
        nameTag(spot, 'Inviter', null));
    const me = seat === s.mySeat;
    // À ton rythme, être absent est normal : pas de « Déconnecté·e », et personne ne prend ta place.
    const away = !p.bot && p.online === false && !s.slow;
    const face = at(spot, avatar(p.char, p.color, spot.size, away ? 'ko' : spot.humeur, { flip: spot.flip, ombre: true }));
    if (s.status === 'playing' && s.mySeat < 0 && away && room.takeSeat)
      return h('button', { class: 'aff-slot', type: 'button', onclick: () => room.takeSeat!(seat) },
        face, nameTag(spot, p.name, chipEl('Prendre sa place', ' aff-chip--go')));
    const titre = titreOf(p.look);
    const tag = nameTag(spot, p.name,
      me ? chipEl('Toi', ' aff-chip--me') : away ? chipEl('Absent·e') : p.host ? chipEl('Hôte') : check(p.bot ? 'robot, prêt' : 'prêt·e'));
    if (titre) tag.append(h('em', { class: 'aff-titre' }, titre));
    return h('div', { class: 'aff-slot' + (away ? ' aff-slot--away' : '') }, face, tag);
  };

  // ---------- En bas : le récitatif, le lancement, les réglages ----------
  const recitK = h('span', { class: 'aff-recit__k' });
  const recitT = h('span', { class: 'aff-recit__t' });
  const recit = h('div', { class: 'aff-recit', role: 'status' }, recitK, recitT);
  const launch = h('button', { class: 'aff-go', type: 'button', onclick: () => room.launch() });
  const bots = h('button', { class: 'aff-mini', type: 'button', onclick: () => room.fillBots?.() }, 'Compléter avec des robots');
  const notifyAll = h('button', { class: 'aff-mini', type: 'button', onclick: () => notify(waitingFor()) }, 'Prévenir tout le monde');

  // Les réglages de la salle : règles, rythme, plateau sur une tablette, suppression. L'hôte les change avant de lancer.
  const isHost = () => { const s = room.snapshot(); return !!s.seats[s.mySeat]?.host; };
  const rulesEditable = () => { const s = room.snapshot(); return isHost() && s.status === 'waiting' && !s.title && !!room.setVariants; };
  const rules = variantsCard(() => room.snapshot().variants, rulesEditable, (v) => room.setVariants?.(v));
  // Rythme : en direct (30 s par coup) ou à ton rythme (sur plusieurs jours).
  const paceSum = h('span', { class: 'variants-card__sum' });
  const paceGo = h('span', { class: 'variants-card__go' });
  const paceEditable = () => isHost() && room.snapshot().status === 'waiting';
  const sheet = (label: string, ...kids: (HTMLElement | null | false)[]) => {
    const close = () => wrap.remove();
    const wrap: HTMLElement = h('div', { class: 'sheet-wrap', onclick: (e: Event) => { if (e.target === wrap) close(); } },
      h('div', { class: 'sheet', role: 'dialog', 'aria-label': label }, ...kids));
    (document.getElementById('app') ?? document.body).append(wrap);
    return close;
  };
  const openPace = () => {
    const s = room.snapshot();
    const text = h('span', { class: 'sheet__text' });
    const tell = (slow: boolean) => { text.textContent = slow ? 'Chacun joue quand il peut, sur plusieurs jours. Tu es prévenu quand c’est ton tour.' : 'Tout le monde joue en même temps, 30 secondes par coup.'; };
    tell(!!s.slow);
    const close = sheet('Rythme de la partie',
      h('span', { class: 'sheet__title' }, 'Rythme'),
      paceEditable()
        ? segmented([{ value: false, label: 'En direct', sub: '30 s par coup' }, { value: true, label: 'À ton rythme', sub: 'sur plusieurs jours' }], !!s.slow, (v) => { room.setSlow?.(v); tell(v); })
        : null,
      text,
      button('OK', 'primary', () => close(), { size: 'md', block: true }));
  };
  const pace = h('button', { class: 'variants-card', type: 'button', hidden: !room.setSlow, onclick: openPace },
    h('span', { class: 'variants-card__title' }, 'Rythme'), paceSum, paceGo);
  // Écran de table : une tablette au milieu de la table montre le plateau (salles en ligne seulement).
  const canTable = !DEMO && navigator.onLine;
  const settingsLink = h('button', { class: 'aff-link', type: 'button' });
  const openSettings = () => {
    // Salle sans autre réglage (hors ligne) : la feuille des règles directement.
    if (!room.setSlow && !canTable && !(isHost() && room.remove)) return rules.el.click();
    const close = sheet('Réglages de la salle',
      h('span', { class: 'sheet__title' }, 'La salle'),
      rules.el, pace,
      canTable && button('Plateau sur une tablette', 'white', () => { close(); openTableSheet(s0.code); }, { size: 'sm', block: true }),
      isHost() && !!room.remove && h('button', {
        class: 'link-btn link-btn--danger', type: 'button',
        onclick: () => { close(); confirmSheet('Supprimer la salle ?', 'Elle disparaît pour tous les joueurs déjà entrés.', 'Supprimer la salle', () => room.remove!()); },
      }, 'Supprimer la salle'),
      button('Fermer', 'text', () => close()));
  };
  settingsLink.addEventListener('click', openSettings);

  const overlay = h('div', { class: 'count-overlay', hidden: true }, h('span', null, 'La partie commence'));
  /** Ce qui porte la couleur de l'équipe du bas : tout l'écran sur téléphone, l'affiche seule sur la double page. */
  let poster: HTMLElement = overlay;
  let counting = false;
  let decorKey = '';

  const draw = () => {
    const s = room.snapshot();
    const me = s.mySeat >= 0 ? s.mySeat : 0;
    const now = Date.now();
    s.seats.forEach((p, k) => { if (p && !taken[k]) arrived.set(k, now); });
    taken = s.seats.map(Boolean);
    // Ton équipe en haut, toi d'abord ; puis les équipes adverses, dans l'ordre du jeu.
    const teams = Array.from({ length: half }, (_, k) => (me + k) % half);
    const order = teams.flatMap((_, k) => [(me + k) % n, (me + k + half) % n]);
    // À deux équipes, ton rival passe en grand : l'adversaire qui a renvoyé le plus de tes billes.
    if (n === 4) {
      const heat = (k: number) => (s.seats[k] ? rivalOf(s.seats[k]!.name)?.on ?? 0 : 0);
      if (heat(order[2]) > heat(order[3])) [order[2], order[3]] = [order[3], order[2]];
    }
    const labels = n === 4 ? LABELS4 : LABELS6;
    const key = teams.join();
    const bg = key === decorKey ? ring.querySelector('.aff-bg') as HTMLElement : decor(teams);
    decorKey = key;
    ring.replaceChildren(
      bg,
      ...teams.map((t, k) => h('span', {
        class: 'aff-team' + (TEAM_INK[t] === '#ffffff' ? ' aff-team--clair' : ''),
        style: { left: labels[k][0], top: labels[k][1], rotate: labels[k][2] + 'deg' },
      }, 'Équipe ' + TEAM_NAMES[t])),
      ...order.map((seat, k) => {
        const el = slot(s, seat, spots[k]);
        const since = now - (arrived.get(seat) ?? 0);
        if (s.seats[seat] && since < 900) {
          el.classList.add('aff-slot--arrive');
          el.style.setProperty('--since', -since + 'ms');
        }
        return el;
      }),
      // Entre deux équipes, à cheval sur l'éclair : le « VS ».
      ...(n === 4 ? VS4 : VS6).map(([x, y, size]) => h('div', { class: 'aff-vs', 'aria-hidden': 'true', style: { left: x, top: y, width: size, height: size, fontSize: Math.round(size * 0.465) } },
        ...burstEl('#fff', 12, 36, 4), h('span', null, 'VS'))));

    const joined = s.seats.filter(Boolean).length;
    const full = joined === s.n;
    const host = !!s.seats[s.mySeat]?.host;
    const bottom = teams[teams.length - 1];
    poster.style.background = TEAM_BG[bottom];
    poster.style.setProperty('--bas', TEAM_INK[bottom]);
    recit.classList.toggle('aff-recit--blanc', bottom === 0);
    if (!s.title) setTitle('La table ' + deNom(s.seats.find((p) => p?.host)?.name ?? myName));
    // Le récitatif : l'état de la salle tant qu'on attend ; une fois tout le monde là, le résumé de vos rivalités.
    const story = full && s.status !== 'playing' ? previously(myName, order.slice(2).map((k) => s.seats[k]?.name ?? '')) : null;
    recitK.textContent = story ? 'Précédemment…' : full ? 'Ce soir…' : 'En coulisses…';
    recitT.textContent = story
      ?? (s.status === 'playing' && s.mySeat < 0 ? (s.slow ? 'Partie à ton rythme déjà commencée.' : 'Partie en cours. Reprends la place d’un joueur déconnecté.')
        : full ? 'Tout le monde est là. On y va ?'
          : s.slow ? `${joined} / ${s.n} joueurs · chacun rejoint quand il veut` : `${joined} / ${s.n} joueurs · on attend les autres…`);
    paceSum.textContent = s.slow ? 'À ton rythme, sur plusieurs jours' : 'En direct, 30 s par coup';
    paceGo.textContent = paceEditable() ? 'Changer ›' : 'Voir ›';
    const ready = full && host;
    launch.textContent = ready ? 'C’est parti !' : full ? 'L’hôte lance la partie…' : 'En attente…';
    // Le nom du bouton reste « Lancer la partie » pour les lecteurs d'écran.
    if (ready) launch.setAttribute('aria-label', 'Lancer la partie');
    else launch.removeAttribute('aria-label');
    launch.classList.toggle('aff-go--off', !ready);
    launch.disabled = !ready;
    launch.hidden = s.status === 'playing';
    bots.hidden = full || !host || !room.fillBots || !!s.league;
    notifyAll.hidden = !s.league || s.status !== 'waiting' || !waitingFor().length;
    rules.refresh();
    settingsLink.textContent = `${variantsSummary(withDefaults(s.variants))} · ${rulesEditable() ? 'Modifier' : 'Voir'}`;
    // Double page : les règles ont déjà leur carte dans les coulisses ; le lien ne reste que pour les autres réglages.
    if (o.wide) {
      settingsLink.textContent = 'Autres réglages de la salle';
      settingsLink.hidden = !room.setSlow && !canTable && !(isHost() && room.remove);
    }
    if (s.status === 'countdown' && !counting) countdown();
    // Partie déjà lancée (retour dans la salle, reconnexion) : direction le plateau.
    if (s.status === 'playing' && s.mySeat >= 0 && !counting) {
      counting = true;
      onStart();
    }
  };

  const countdown = () => {
    counting = true;
    overlay.hidden = false;
    const seq = ['3', '2', '1', 'TOC !'];
    seq.forEach((v, i) => setTimeout(() => {
      overlay.replaceChildren(overlay.firstChild!, h('div', { class: 'count-ball' + (v.length > 1 ? ' count-ball--word' : '') }, ...burstEl('#ffcf1f', 14, 38, 3), h('b', null, v)));
    }, i * 800));
    setTimeout(onStart, seq.length * 800 + 200);
  };

  // ---------- Pliants : l'affiche en double page (maquette « TOC sur pliants ») ----------
  // À gauche, l'affiche : le titre et les équipes face à face. À droite, les coulisses : le QR code et le code de la
  // salle, la bande en ligne à inviter d'un toucher, les règles de la table, et « Lancer la partie ».
  if (o.wide) {
    const sp = spread({ tone: 'nuit', cls: 'affiche2' });
    const panel = h('div', { class: 'aff2__affiche' }, h('div', { class: 'aff-title' }, kicker, title), ring);
    poster = panel;
    sp.left.append(
      h('div', { class: 'aff-head aff2__tete' }, backButton(() => go(ROUTES.home)), codeBtn),
      h('div', { class: 'livre__corps' }, panel, recit));
    // Le QR code : le voisin le scanne avec son téléphone (pas pour une partie d'album, dont les membres sont prévenus).
    const scanCard = s0.league ? null : h('div', { class: 'card aff2__qr' },
      qrCard(room.link(), 132),
      h('div', null, h('span', { class: 'tag tag--dark' }, 'À scanner'), h('b', null, s0.code), h('span', null, 'Montre cette page à ton voisin.'),
        h('button', { class: 'livre__btn livre__btn--jaune', type: 'button', onclick: () => shareInvite(room) }, 'Envoyer le lien')));
    // La bande en ligne : on l'invite d'un toucher, sans quitter l'affiche.
    const invited = new Set<string>();
    const bandCard = h('div', { class: 'card aff2__bande', hidden: !!s0.league });
    const drawBand = (list: (Omit<FriendView, 'uid'> & { uid?: string })[]) => {
      const here = list.filter((f) => f.presence !== 'off').slice(0, 4);
      bandCard.replaceChildren(h('span', { class: 't-label' }, 'La bande en ligne'),
        ...(here.length ? here.map((f) => {
          const key = f.uid ?? f.name;
          return h('div', { class: 'aff2__ami' }, avatar(f.char, f.color, 40, 'content'),
            h('span', null, h('b', null, f.name), ' ', h('em', { class: 'une2__etat une2__etat--' + f.presence }, f.presence === 'game' ? 'en partie' : 'en ligne')),
            f.presence === 'game' ? h('small', null, 'libre dans un instant')
              : h('button', { class: 'livre__btn' + (invited.has(key) ? '' : ' livre__btn--turq'), type: 'button', disabled: invited.has(key), onclick: () => {
                invited.add(key);
                if (f.uid && room.snapshot().code) inviteFriend(f.uid, room.snapshot().code).catch(() => toast('Invitation non envoyée. Réessaie.'));
                toast(`${f.name} est invité·e à ta table.`);
                drawBand(list);
              } }, invited.has(key) ? 'Invité·e' : 'Inviter'));
        }) : [h('span', { class: 'une2__vide' }, 'Personne de ta bande n’est en ligne pour l’instant. Envoie le lien de la salle !')]));
    };
    let stopBand = () => {};
    if (DEMO) drawBand(DEMO_FRIENDS);
    else if (navigator.onLine && !s0.league) stopBand = watchFriends(drawBand);
    else bandCard.hidden = true;
    launch.classList.add('livre__go');
    sp.right.append(
      h('div', { class: 'cabine__tete' }, h('span', { class: 'tag tag--jaune' }, 'Les coulisses')),
      h('div', { class: 'livre__corps' }, scanCard, bandCard, h('div', { class: 'aff2__reglages' }, rules.el, pace)),
      bots, notifyAll, launch, settingsLink);
    sp.el.append(overlay);
    const unsubWide = room.subscribe(draw);
    draw();
    return { el: sp.el, cleanup: () => { unsubWide(); stopBand(); sp.dispose(); room.leave(); } };
  }

  const el: HTMLElement = h('div', { class: 'screen affiche', 'data-tone': 'bleu' },
    h('div', { class: 'aff' },
      h('div', { class: 'aff-head' },
        backButton(() => go(ROUTES.home)),
        codeBtn,
        h('button', { class: 'btn-round aff-invite', type: 'button', 'aria-label': 'Inviter des amis', hidden: !!s0.league, onclick: () => shareInvite(room) }, icon(ICONS.invite, 20, 2.8))),
      h('div', { class: 'aff-title' }, kicker, title),
      ring,
      recit,
      h('div', { class: 'spacer' }),
      bots, notifyAll, launch, settingsLink),
    overlay);
  poster = el;
  const unsub = room.subscribe(draw);
  draw();
  return { el, cleanup: () => { unsub(); room.leave(); } };
}

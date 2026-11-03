// 05 Salle privée : code, équipes et places, lancement avec compte à rebours.
import type { Room, RoomSnapshot } from '../../app/room';
import { h, toast } from '../dom';
import { COL, SEAT_COLORS, TEAM_NAMES } from '../kit/data';
import { avatarRing, backButton, button, duo, segmented } from '../kit/kit';
import { ROUTES, go } from '../nav';
import { variantsCard } from './rules';
import { confirmSheet } from '../confirm';
import { openTableSheet } from '../table-invite';
import { DEMO } from '../demo';
import { titreOf } from '../../app/shop';
import { getLeagueOnce } from '../../net/league';
import type { CharId, ColorName } from '../kit/data';

async function shareInvite(room: Room) {
  const url = room.link();
  const text = `Viens jouer au TOC avec moi ! Code TOC-${room.snapshot().code}`;
  try {
    if (navigator.share) return await navigator.share({ title: 'TOC', text, url });
    await navigator.clipboard.writeText(`${text} : ${url}`);
    toast('Lien copié, envoie-le à tes amis !');
  } catch {
    // Partage annulé : rien à faire.
  }
}

/** Une place autour de la table : joueur assis, ou chaise vide qui invite. */
/** Membres du tournoi (partie de tournoi) : nom et perso, pour les places encore vides. */
type Members = Record<string, { name: string; char: CharId; color: ColorName }>;

function seatView(s: RoomSnapshot, seat: number, room: Room, members: Members, notify: (to: string[]) => void): HTMLElement {
  const p = s.seats[seat];
  const tint = COL[SEAT_COLORS[s.n][seat]];
  // Partie de tournoi : la place attend un membre précis (équipes fixes) ; on le prévient, pas de lien à partager.
  const want = !p ? s.reserved?.[seat] : '';
  if (want) {
    const m = members[want];
    return h('button', { class: 'rt-seat rt-seat--wanted', type: 'button', 'aria-label': `Prévenir ${m?.name ?? 'ce joueur'}`, onclick: () => notify([want]) },
      m ? avatarRing(m.char, m.color, 44, tint.c, 3, 2, null) : h('span', { class: 'rt-seat__chair' }, '…'),
      h('span', { class: 'rt-seat__name' }, m?.name ?? '…'), h('span', { class: 'rt-seat__tag', style: { color: 'var(--primary-bottom)' } }, 'Prévenir'));
  }
  if (!p)
    return h('button', { class: 'rt-seat rt-seat--empty', type: 'button', 'aria-label': 'Place libre : inviter un ami', onclick: () => shareInvite(room) },
      h('span', { class: 'rt-seat__chair' }, '+'), h('span', { class: 'rt-seat__name' }, 'Inviter'));
  const me = seat === s.mySeat;
  // À ton rythme, être absent est normal : pas de « Déconnecté·e », et personne ne prend ta place.
  const away = !p.bot && p.online === false && !s.slow;
  const tag = me ? (p.host ? 'Toi · hôte' : 'Toi') : away ? 'Déconnecté·e' : p.host ? 'Hôte' : p.bot ? 'Robot' : 'Prêt·e';
  if (s.status === 'playing' && s.mySeat < 0 && away && room.takeSeat)
    return h('button', { class: 'rt-seat', type: 'button', onclick: () => room.takeSeat!(seat) },
      avatarRing(p.char, p.color, 44, tint.c, 3, 2, null),
      h('span', { class: 'rt-seat__name' }, p.name), h('span', { class: 'rt-seat__tag', style: { color: 'var(--primary-bottom)' } }, 'Prendre sa place'));
  const titre = titreOf(p.look);
  return h('div', { class: 'rt-seat' + (away ? ' rt-seat--away' : '') },
    avatarRing(p.char, p.color, 44, tint.c, 3, 2, null),
    h('span', { class: 'rt-seat__name' }, p.name), titre && h('span', { class: 'rt-seat__titre' }, titre), h('span', { class: 'rt-seat__tag' }, tag));
}

export function roomScreen(room: Room, onStart: () => void): { el: HTMLElement; cleanup: () => void } {
  const s0 = room.snapshot();
  const half = s0.n / 2;
  // Salle vue de dessus : chacun à sa place autour de la table, son partenaire en face (comme sur le plateau).
  // Le code de la salle est posé au milieu ; le toucher copie le lien.
  const copyHint = h('span', { class: 'rt__copy' }, 'Toucher pour copier');
  const codeCard = h('button', {
    class: 'rt__code', type: 'button', 'aria-label': 'Copier le lien de la salle',
    onclick: async () => {
      try {
        await navigator.clipboard.writeText(room.link());
      } catch {
        return shareInvite(room);
      }
      copyHint.textContent = 'Lien copié !';
      setTimeout(() => { copyHint.textContent = 'Toucher pour copier'; }, 1600);
    },
  }, h('span', { class: 't-mini' }, 'Code de la salle'), h('b', null, 'TOC-' + s0.code), copyHint);
  const table = h('div', { class: 'rt' });
  const legend = h('div', { class: 'rt-legend' });
  // Arrivées : la place qui vient d'être prise fait un petit rebond (on garde l'heure pour ne pas le couper aux mises à jour).
  let taken = s0.seats.map(Boolean);
  const arrived = new Map<number, number>();
  // Règles : l'hôte les choisit avant de lancer (celles d'un tournoi sont fixées à sa création).
  const rules = variantsCard(
    () => room.snapshot().variants,
    () => { const s = room.snapshot(); return !!s.seats[s.mySeat]?.host && s.status === 'waiting' && !s.title && !!room.setVariants; },
    (v) => room.setVariants?.(v));
  // Rythme : en direct (30 s par coup) ou à ton rythme (sur plusieurs jours) ; l'hôte choisit avant de lancer.
  const pace = h('div', { class: 'card pace', hidden: !room.setSlow });
  let paceFor = '';
  const drawPace = (s: ReturnType<Room['snapshot']>) => {
    const editable = !!s.seats[s.mySeat]?.host && s.status === 'waiting';
    const key = `${editable}|${s.slow}`;
    if (key === paceFor) return;
    paceFor = key;
    pace.replaceChildren(
      h('div', { style: { display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8 } },
        h('span', { class: 't-label' }, 'Rythme'),
        !editable && h('span', { class: 'pill' }, s.slow ? 'À ton rythme' : 'En direct')),
      editable
        ? segmented([{ value: false, label: 'En direct', sub: '30 s par coup' }, { value: true, label: 'À ton rythme', sub: 'sur plusieurs jours' }], !!s.slow, (v) => room.setSlow?.(v))
        : h('span', { class: 't-body' }, s.slow ? 'Chacun joue quand il peut, sur plusieurs jours. Tu seras prévenu·e quand c’est ton tour.' : 'Tout le monde joue en même temps, 30 s par coup.'));
  };
  const status = h('span', { class: 'status-line' });
  const launch = button('', 'primary', () => room.launch(), { size: 'lg', block: true });
  const bots = button('Compléter avec des robots', 'text', () => room.fillBots?.());
  // Partie de tournoi : les membres se connaissent ; on les prévient (notification), sans lien d'invitation.
  let members: Members = {};
  if (s0.league) getLeagueOnce(s0.league).then((l) => { if (l) { members = l.members; draw(); } }).catch(() => undefined);
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
  const notifyAll = button('Prévenir tout le monde', 'white', () => notify(waitingFor()), { size: 'md', block: true });
  // Écran de table : une tablette au milieu de la table montre le plateau (salles en ligne seulement).
  const tableBtn = h('button', { class: 'link-btn', type: 'button', hidden: DEMO || !navigator.onLine, onclick: () => openTableSheet(s0.code) },
    'Afficher le plateau sur une tablette');
  const del = h('button', {
    class: 'link-btn link-btn--danger', type: 'button', hidden: true,
    onclick: () => confirmSheet('Supprimer la salle ?', 'Elle disparaît pour tous les joueurs déjà entrés.', 'Supprimer la salle', () => room.remove!()),
  }, 'Supprimer la salle');
  const overlay = h('div', { class: 'count-overlay', hidden: true }, h('span', null, 'La partie commence'));
  let counting = false;

  const draw = () => {
    const s = room.snapshot();
    // Toi en bas ; les places suivantes dans l'ordre du jeu, comme autour du plateau.
    const me = s.mySeat >= 0 ? s.mySeat : 0;
    const now = Date.now();
    s.seats.forEach((p, k) => { if (p && !taken[k]) arrived.set(k, now); });
    taken = s.seats.map(Boolean);
    table.replaceChildren(h('div', { class: 'rt__top' }, codeCard), ...s.seats.map((_, k) => {
      const a = Math.PI / 2 + (((k - me + s.n) % s.n) * 2 * Math.PI) / s.n;
      const el = seatView(s, k, room, members, notify);
      el.style.left = (50 + Math.cos(a) * 41).toFixed(1) + '%';
      el.style.top = (50 + Math.sin(a) * 41).toFixed(1) + '%';
      const since = now - (arrived.get(k) ?? 0);
      if (s.seats[k] && since < 900) {
        el.classList.add('rt-seat--arrive');
        el.style.animationDelay = -since + 'ms';
      }
      return el;
    }));
    legend.replaceChildren(
      ...Array.from({ length: half }, (_, t) => h('span', null, duo(SEAT_COLORS[s.n][t], SEAT_COLORS[s.n][t + half]), 'Équipe ' + TEAM_NAMES[t])),
      h('span', { class: 'rt-legend__hint' }, 'Ton partenaire est assis en face de toi.'));
    const joined = s.seats.filter(Boolean).length;
    const full = joined === s.n;
    const host = !!s.seats[s.mySeat]?.host;
    status.textContent = s.status === 'playing' && s.mySeat < 0 ? (s.slow ? 'Partie à ton rythme déjà commencée.' : 'Partie en cours. Reprends la place d’un joueur déconnecté.')
      : full ? 'Tout le monde est là. On y va ?'
        : s.slow ? `${joined} / ${s.n} joueurs · chacun rejoint quand il veut` : `${joined} / ${s.n} joueurs · on attend les autres…`;
    drawPace(s);
    launch.textContent = full ? (host ? 'Lancer la partie' : 'L’hôte lance la partie…') : 'En attente…';
    launch.className = 'btn btn--lg btn--block ' + (full && host ? 'btn--primary' : 'btn--off');
    launch.disabled = !full || !host;
    bots.hidden = full || !host || !room.fillBots || !!s.league;
    notifyAll.hidden = !s.league || s.status !== 'waiting' || !waitingFor().length;
    del.hidden = !host || !room.remove;
    launch.hidden = s.status === 'playing';
    rules.refresh();
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
      overlay.replaceChildren(overlay.firstChild!, h('div', { class: 'count-ball' + (v.length > 1 ? ' count-ball--word' : '') }, v));
    }, i * 800));
    setTimeout(onStart, seq.length * 800 + 200);
  };

  const unsub = room.subscribe(draw);
  draw();

  const el = h('div', { class: 'screen room', 'data-wide': '', style: { gap: 14, paddingTop: 'calc(var(--safe-top) + 8px)' } },
    h('div', { class: 'screen__head' },
      backButton(() => go(ROUTES.home)),
      // Partie de tournoi : le nom du tournoi remplace « Salle privée ».
      h('span', { style: { flex: 1, minWidth: 0, font: '800 26px/1 var(--display)', paddingTop: 3, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' } }, s0.title ?? 'Salle privée'),
      h('span', { class: 'pill' }, s0.title ? 'Tournoi' : s0.n === 4 ? '4 joueurs · 2 équipes' : '6 joueurs · 3 équipes')),
    // Grand écran : la table à gauche, le reste à droite. Téléphone : les deux colonnes s'effacent (une seule pile).
    h('div', { class: 'room__cols' },
      h('div', { class: 'room__left' }, table, legend),
      h('div', { class: 'room__right' }, pace, rules.el, h('div', { class: 'spacer' }), status, bots, notifyAll, launch, tableBtn, del)),
    overlay);
  return { el, cleanup: () => { unsub(); room.leave(); } };
}

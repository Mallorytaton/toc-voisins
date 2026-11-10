// L'affiche : la salle d'attente, présentée comme l'affiche du match. Les équipes se font face (deux ou trois),
// chacun à sa place à côté de son partenaire ; le code de la salle, le rythme, les règles et le lancement autour.
import type { Room, RoomSnapshot } from '../../app/room';
import { h, toast } from '../dom';
import { SEAT_COLORS, TEAM_NAMES } from '../kit/data';
import { ICONS, avatar, backButton, bille, button, icon, segmented } from '../kit/kit';
import type { Humeur } from '../kit/perso';
import { ROUTES, go } from '../nav';
import { variantsCard } from './rules';
import { confirmSheet } from '../confirm';
import { openTableSheet } from '../table-invite';
import { DEMO } from '../demo';
import { titreOf } from '../../app/shop';
import { getLeagueOnce } from '../../net/league';
import type { CharId, ColorName } from '../kit/data';
import { burstEl } from '../planche';

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

/** Le fond de chaque équipe sur l'affiche, et la couleur du texte posé dessus. */
const TEAM_BG = ['var(--jaune)', 'var(--bleu)', '#ff8fc4'];
const TEAM_INK = ['var(--ink)', '#fff', 'var(--ink)'];

/** Une place sur l'affiche : le joueur et son étiquette, ou une place libre qui invite. */
function slotView(s: RoomSnapshot, seat: number, room: Room, members: Members, notify: (to: string[]) => void, size: number, humeur: Humeur, flip: boolean): HTMLElement {
  const p = s.seats[seat];
  // La pastille rappelle la couleur des billes de cette place.
  const dot = () => bille(SEAT_COLORS[s.n][seat], { size: 13 });
  const chair = (inner: HTMLElement | string) => h('span', { class: 'aff-slot__chair', style: { width: size, height: size } }, inner);
  // Partie d'album : la place attend un membre précis (équipes fixes) ; on le prévient, pas de lien à partager.
  const want = !p ? s.reserved?.[seat] : '';
  if (want) {
    const m = members[want];
    return h('button', { class: 'aff-slot aff-slot--wanted', type: 'button', 'aria-label': `Prévenir ${m?.name ?? 'ce joueur'}`, onclick: () => notify([want]) },
      m ? avatar(m.char, m.color, size, 'content', { flip }) : chair('…'),
      h('span', { class: 'aff-name' }, dot(), h('b', null, m?.name ?? '…'), h('i', { class: 'aff-chip aff-chip--go' }, 'Prévenir')));
  }
  if (!p)
    return h('button', { class: 'aff-slot aff-slot--empty', type: 'button', 'aria-label': 'Place libre : inviter un ami', onclick: () => shareInvite(room) },
      chair(icon(ICONS.plus, Math.round(size * 0.36), 3.6)),
      h('span', { class: 'aff-name' }, dot(), h('b', null, 'Inviter')));
  const me = seat === s.mySeat;
  // À ton rythme, être absent est normal : pas de « Déconnecté·e », et personne ne prend ta place.
  const away = !p.bot && p.online === false && !s.slow;
  const tag = me ? (p.host ? 'Toi · hôte' : 'Toi') : away ? 'Déconnecté·e' : p.host ? 'Hôte' : p.bot ? 'Robot' : 'Prêt·e';
  const face = avatar(p.char, p.color, size, away ? 'ko' : humeur, { flip });
  if (s.status === 'playing' && s.mySeat < 0 && away && room.takeSeat)
    return h('button', { class: 'aff-slot', type: 'button', onclick: () => room.takeSeat!(seat) },
      face, h('span', { class: 'aff-name' }, dot(), h('b', null, p.name), h('i', { class: 'aff-chip aff-chip--go' }, 'Prendre sa place')));
  const titre = titreOf(p.look);
  // « Prêt·e » : une coche suffit (le mot reste lu par les lecteurs d'écran).
  const ready = tag === 'Prêt·e';
  return h('div', { class: 'aff-slot' + (away ? ' aff-slot--away' : '') },
    face,
    h('span', { class: 'aff-name' }, dot(), h('b', null, p.name),
      h('i', { class: 'aff-chip' + (me ? ' aff-chip--me' : ready ? ' aff-chip--ok' : ''), 'aria-label': ready ? tag : undefined }, ready ? icon(ICONS.check, 11, 4.5) : tag)),
    titre && h('span', { class: 'aff-titre' }, titre));
}

export function roomScreen(room: Room, onStart: () => void): { el: HTMLElement; cleanup: () => void } {
  const s0 = room.snapshot();
  const half = s0.n / 2;
  // Le code de la salle, en haut : le toucher copie le lien.
  const copyHint = h('span', { class: 'aff-code__hint' }, 'Toucher pour copier');
  const codeCard = h('button', {
    class: 'aff-code', type: 'button', 'aria-label': 'Copier le lien de la salle',
    onclick: async () => {
      try {
        await navigator.clipboard.writeText(room.link());
      } catch {
        return shareInvite(room);
      }
      copyHint.textContent = 'Lien copié !';
      setTimeout(() => { copyHint.textContent = 'Toucher pour copier'; }, 1600);
    },
  }, h('span', { class: 'aff-code__k' }, 'Salle'), h('b', null, 'TOC-' + s0.code), copyHint);
  const poster = h('div', { class: 'aff-poster aff-poster--n' + s0.n });
  // Arrivées : la place qui vient d'être prise fait un petit rebond (on garde l'heure pour ne pas le couper aux mises à jour).
  let taken = s0.seats.map(Boolean);
  const arrived = new Map<number, number>();
  // Règles : l'hôte les choisit avant de lancer (celles d'un album sont fixées à sa création).
  const rules = variantsCard(
    () => room.snapshot().variants,
    () => { const s = room.snapshot(); return !!s.seats[s.mySeat]?.host && s.status === 'waiting' && !s.title && !!room.setVariants; },
    (v) => room.setVariants?.(v));
  // Rythme : en direct (30 s par coup) ou à ton rythme (sur plusieurs jours) ; l'hôte choisit avant de lancer.
  const paceSum = h('span', { class: 'variants-card__sum' });
  const paceGo = h('span', { class: 'variants-card__go' });
  const paceEditable = () => { const s = room.snapshot(); return !!s.seats[s.mySeat]?.host && s.status === 'waiting'; };
  const openPace = () => {
    const s = room.snapshot();
    const close = () => wrap.remove();
    const text = h('span', { class: 'sheet__text' });
    const tell = (slow: boolean) => { text.textContent = slow ? 'Chacun joue quand il peut, sur plusieurs jours. Tu es prévenu quand c’est ton tour.' : 'Tout le monde joue en même temps, 30 secondes par coup.'; };
    tell(!!s.slow);
    const wrap: HTMLElement = h('div', { class: 'sheet-wrap', onclick: (e: Event) => { if (e.target === wrap) close(); } },
      h('div', { class: 'sheet', role: 'dialog', 'aria-label': 'Rythme de la partie' },
        h('span', { class: 'sheet__title' }, 'Rythme'),
        paceEditable()
          ? segmented([{ value: false, label: 'En direct', sub: '30 s par coup' }, { value: true, label: 'À ton rythme', sub: 'sur plusieurs jours' }], !!s.slow, (v) => { room.setSlow?.(v); tell(v); })
          : null,
        text,
        button('OK', 'primary', close, { size: 'md', block: true })));
    (document.getElementById('app') ?? document.body).append(wrap);
  };
  const pace = h('button', { class: 'variants-card', type: 'button', hidden: !room.setSlow, onclick: openPace },
    h('span', { class: 'variants-card__title' }, 'Rythme'), paceSum, paceGo);
  const status = h('div', { class: 'aff-note', role: 'status' });
  const launch = button('', 'primary', () => room.launch(), { size: 'lg', block: true });
  const bots = button('Compléter avec des robots', 'text', () => room.fillBots?.());
  // Partie d'album : les membres se connaissent ; on les prévient (notification), sans lien d'invitation.
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
    'Plateau sur une tablette');
  const del = h('button', {
    class: 'link-btn link-btn--danger', type: 'button', hidden: true,
    onclick: () => confirmSheet('Supprimer la salle ?', 'Elle disparaît pour tous les joueurs déjà entrés.', 'Supprimer la salle', () => room.remove!()),
  }, 'Supprimer la salle');
  const overlay = h('div', { class: 'count-overlay', hidden: true }, h('span', null, 'La partie commence'));
  let counting = false;

  const draw = () => {
    const s = room.snapshot();
    const me = s.mySeat >= 0 ? s.mySeat : 0;
    const now = Date.now();
    s.seats.forEach((p, k) => { if (p && !taken[k]) arrived.set(k, now); });
    taken = s.seats.map(Boolean);
    // Ton équipe en haut, toi d'abord ; puis les équipes adverses, dans l'ordre du jeu.
    const big = s.n === 4 ? 82 : 52;
    const teams = Array.from({ length: half }, (_, k) => (me + k) % half);
    poster.replaceChildren(
      ...teams.map((t, row) => {
        const seats = t === me % half && me >= half ? [t + half, t] : [t, t + half];
        return h('div', { class: 'aff-team', style: { '--tc': TEAM_BG[t], '--tk': TEAM_INK[t] } },
          h('span', { class: 'aff-team__name' }, 'Équipe ' + TEAM_NAMES[t]),
          ...seats.map((k, j) => {
            const el = slotView(s, k, room, members, notify, big, k === s.mySeat ? 'malin' : row === 0 ? 'joie' : j ? 'malin' : 'furieux', j === 1);
            const since = now - (arrived.get(k) ?? 0);
            if (s.seats[k] && since < 900) {
              el.classList.add('aff-slot--arrive');
              el.style.animationDelay = -since + 'ms';
            }
            return el;
          }));
      }),
      // Entre deux équipes : le « VS » de l'affiche.
      ...teams.slice(1).map((_, k) => h('div', { class: 'aff-vs', style: { top: `${((k + 1) * 100) / half}%` }, 'aria-hidden': 'true' }, ...burstEl('#fff', 12, 36, 6), h('span', null, 'VS'))));
    const joined = s.seats.filter(Boolean).length;
    const full = joined === s.n;
    const host = !!s.seats[s.mySeat]?.host;
    status.textContent = s.status === 'playing' && s.mySeat < 0 ? (s.slow ? 'Partie à ton rythme déjà commencée.' : 'Partie en cours. Reprends la place d’un joueur déconnecté.')
      : full ? 'Tout le monde est là. On y va ?'
        : s.slow ? `${joined} / ${s.n} joueurs · chacun rejoint quand il veut` : `${joined} / ${s.n} joueurs · on attend les autres…`;
    paceSum.textContent = s.slow ? 'À ton rythme, sur plusieurs jours' : 'En direct, 30 s par coup';
    paceGo.textContent = paceEditable() ? 'Changer ›' : 'Voir ›';
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
      overlay.replaceChildren(overlay.firstChild!, h('div', { class: 'count-ball' + (v.length > 1 ? ' count-ball--word' : '') }, ...burstEl('#ffcf1f', 14, 38, 3), h('b', null, v)));
    }, i * 800));
    setTimeout(onStart, seq.length * 800 + 200);
  };

  const unsub = room.subscribe(draw);
  draw();

  const el = h('div', { class: 'screen room affiche', 'data-wide': '', 'data-tone': 'jaune', style: { gap: 10, paddingTop: 'calc(var(--safe-top) + 8px)' } },
    h('div', { class: 'screen__head aff-head' },
      backButton(() => go(ROUTES.home)),
      codeCard,
      h('button', { class: 'btn-round aff-invite', type: 'button', 'aria-label': 'Inviter un ami', hidden: !!s0.league, onclick: () => shareInvite(room) }, icon(ICONS.invite, 22, 2.8))),
    // Grand écran : l'affiche à gauche, le reste à droite. Téléphone : les deux colonnes s'effacent (une seule pile).
    h('div', { class: 'room__cols' },
      h('div', { class: 'room__left' },
        h('div', { class: 'aff-title' },
          // Partie d'album : le nom de l'album est le titre de l'affiche.
          h('span', { class: 'tag' }, s0.title ? 'Album · nouvel épisode' : `Partie privée · ${s0.n} joueurs`),
          h('span', { class: 't-screen' }, s0.title ?? 'L’affiche')),
        poster),
      h('div', { class: 'room__right' },
        status,
        h('div', { class: 'aff-opts' }, pace, rules.el),
        h('div', { class: 'spacer' }),
        bots, notifyAll, launch,
        h('div', { class: 'aff-links' }, tableBtn, del))),
    overlay);
  return { el, cleanup: () => { unsub(); room.leave(); } };
}

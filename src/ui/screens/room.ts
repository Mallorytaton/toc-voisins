// 05 Salle privée : code, équipes et places, lancement avec compte à rebours.
import type { Room, RoomSnapshot } from '../../app/room';
import { h, toast } from '../dom';
import { COL, SEAT_COLORS, TEAM_NAMES } from '../kit/data';
import { avatarRing, backButton, button, duo } from '../kit/kit';
import { ROUTES, go } from '../nav';
import { variantsCard } from './rules';

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

function seatView(s: RoomSnapshot, seat: number, room: Room): HTMLElement {
  const p = s.seats[seat];
  const tint = COL[SEAT_COLORS[s.n][seat]];
  if (!p)
    return h('div', { class: 'seat' },
      h('div', { class: 'seat__wait' }),
      h('button', { class: 'seat__invite', type: 'button', onclick: () => shareInvite(room) },
        h('span', null, 'En attente…'), h('span', null, 'Inviter')));
  const me = seat === s.mySeat;
  const away = !p.bot && p.online === false;
  const tag = me ? (p.host ? 'Toi · hôte' : 'Toi') : away ? 'Déconnecté·e' : p.host ? 'Hôte' : p.bot ? 'Robot' : 'Prêt·e';
  if (s.status === 'playing' && s.mySeat < 0 && away && room.takeSeat)
    return h('button', { class: 'seat seat__invite', type: 'button', style: { background: tint.l }, onclick: () => room.takeSeat!(seat) },
      avatarRing(p.char, p.color, 38, tint.c, 3, 2, null),
      h('div', { style: { minWidth: 0, display: 'flex', flexDirection: 'column', gap: 1 } },
        h('span', { class: 'seat__name' }, p.name), h('span', null, 'Prendre sa place')));
  return h('div', { class: 'seat', style: { background: tint.l, opacity: away ? 0.6 : 1 } },
    avatarRing(p.char, p.color, 38, tint.c, 3, 2, null),
    h('div', { style: { minWidth: 0, display: 'flex', flexDirection: 'column', gap: 1 } },
      h('span', { class: 'seat__name' }, p.name), h('span', { class: 'seat__tag' }, tag)));
}

export function roomScreen(room: Room, onStart: () => void): { el: HTMLElement; cleanup: () => void } {
  const s0 = room.snapshot();
  const half = s0.n / 2;
  const copyBtn = button('Copier', 'dark', async () => {
    try {
      await navigator.clipboard.writeText(room.link());
    } catch {
      return shareInvite(room);
    }
    copyBtn.textContent = 'Copié !';
    copyBtn.className = 'btn btn--ok btn--sm';
    setTimeout(() => { copyBtn.textContent = 'Copier'; copyBtn.className = 'btn btn--dark btn--sm'; }, 1600);
  }, { size: 'sm' });

  const teams = h('div', { style: { display: 'flex', flexDirection: 'column', gap: 12 } });
  // Règles : l'hôte les choisit avant de lancer (celles d'un tournoi sont fixées à sa création).
  const rules = variantsCard(
    () => room.snapshot().variants,
    () => { const s = room.snapshot(); return !!s.seats[s.mySeat]?.host && s.status === 'waiting' && !s.title && !!room.setVariants; },
    (v) => room.setVariants?.(v));
  const status = h('span', { class: 'status-line' });
  const launch = button('', 'primary', () => room.launch(), { size: 'lg', block: true });
  const bots = button('Compléter avec des robots', 'text', () => room.fillBots?.());
  const overlay = h('div', { class: 'count-overlay', hidden: true }, h('span', null, 'La partie commence'));
  let counting = false;

  const draw = () => {
    const s = room.snapshot();
    // L'équipe du joueur d'abord, lui en premier.
    const myTeam = s.mySeat >= 0 ? s.mySeat % half : 0;
    const order = [myTeam, ...Array.from({ length: half }, (_, t) => t).filter((t) => t !== myTeam)];
    teams.replaceChildren(...order.map((t) => {
      const seats = [t, t + half];
      if (seats[1] === s.mySeat) seats.reverse();
      return h('div', { class: 'card card--lg', style: { display: 'flex', flexDirection: 'column', gap: 10 } },
        h('div', { style: { display: 'flex', alignItems: 'center', gap: 8 } },
          duo(SEAT_COLORS[s.n][seats[0]], SEAT_COLORS[s.n][seats[1]]),
          h('span', { style: { font: '800 17px/1 var(--display)', paddingTop: 2 } }, 'Équipe ' + TEAM_NAMES[t])),
        h('div', { class: 'seat-grid' }, ...seats.map((k) => seatView(s, k, room))));
    }));
    const joined = s.seats.filter(Boolean).length;
    const full = joined === s.n;
    const host = !!s.seats[s.mySeat]?.host;
    status.textContent = s.status === 'playing' && s.mySeat < 0 ? 'Partie en cours. Reprends la place d’un joueur déconnecté.'
      : full ? 'Tout le monde est là. On y va ?' : `${joined} / ${s.n} joueurs · on attend les autres…`;
    launch.textContent = full ? (host ? 'Lancer la partie' : 'L’hôte lance la partie…') : 'En attente…';
    launch.className = 'btn btn--lg btn--block ' + (full && host ? 'btn--primary' : 'btn--off');
    launch.disabled = !full || !host;
    bots.hidden = full || !host || !room.fillBots;
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

  const el = h('div', { class: 'screen', style: { gap: 14, paddingTop: 'calc(var(--safe-top) + 8px)' } },
    h('div', { class: 'screen__head' },
      backButton(() => go(ROUTES.home)),
      // Partie de tournoi : le nom du tournoi remplace « Salle privée ».
      h('span', { style: { flex: 1, minWidth: 0, font: '800 26px/1 var(--display)', paddingTop: 3, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' } }, s0.title ?? 'Salle privée'),
      h('span', { class: 'pill' }, s0.title ? 'Tournoi' : s0.n === 4 ? '4 joueurs · 2 équipes' : '6 joueurs · 3 équipes')),
    h('div', { class: 'card', style: { display: 'flex', alignItems: 'center', gap: 12, padding: '14px 14px 14px 18px' } },
      h('div', { style: { flex: 1, display: 'flex', flexDirection: 'column', gap: 2 } },
        h('span', { class: 't-mini' }, 'Code de la salle'),
        h('span', { style: { font: '800 28px/1.05 var(--display)', letterSpacing: '.06em' } }, 'TOC-' + s0.code)),
      copyBtn),
    teams,
    rules.el,
    h('div', { class: 'spacer' }),
    status,
    bots,
    launch,
    overlay);
  return { el, cleanup: () => { unsub(); room.leave(); } };
}

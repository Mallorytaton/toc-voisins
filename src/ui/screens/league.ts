// Albums (les tournois) : la liste de tes albums, la création, et la page d'un album
// (équipes fixes, victoires cumulées, soirées, épisodes).
import {
  type League, type OfflineClaim, type Rsvp, answerSoiree, cancelSoiree, claimApproved, createLeague, deleteLeague, dropOffline, liveGame,
  type LeagueMsg, leagueLink, leaveLeague, parseLeagueCode, proposeOffline, proposeSoiree, refusedBy, sendLeagueMsg, settleOffline, takeLeagueSeat,
  voteOffline, watchLeague, watchLeagueChat, watchMyLeagues,
} from '../../net/league';
import { type FriendView, currentUid, inviteToLeague, watchFriends } from '../../net/social';
import { DEMO, DEMO_LEAGUE, DEMO_UID } from '../demo';
import { deNom, h, toast } from '../dom';
import { COL, SEAT_COLORS, TEAM_BG, TEAM_NAMES } from '../kit/data';
import { ICONS, avatar, avatarRing, backButton, button, duo, icon, segmented, tabbar } from '../kit/kit';
import { ROUTES, go } from '../nav';
import { savedMode } from './home';
import { soireeReminderHint } from '../push-offer';
import { variantsCard } from './rules';
import { DEFAULT_VARIANTS, type Variants } from '../../engine';
import { tocSays } from '../mascot';
import { confirmSheet } from '../confirm';
import { recapCard } from './recap';

type View = { el: HTMLElement; cleanup: () => void };

const dateFmt = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short' });

const dayFmt = new Intl.DateTimeFormat('fr-FR', { weekday: 'long', day: 'numeric', month: 'short' });
const weekDay = new Intl.DateTimeFormat('fr-FR', { weekday: 'long' });
const calMonth = new Intl.DateTimeFormat('fr-FR', { month: 'short' });
const sameDay = (a: Date, b: Date) => a.toDateString() === b.toDateString();

/** « Ce soir · 20 h 30 », « Demain · 20 h », « Jeudi 31 oct. · 20 h 30 ». */
export function soireeLabel(at: number): string {
  const d = new Date(at), now = new Date(), tomorrow = new Date(now.getTime() + 86_400_000);
  const day = sameDay(d, now) ? (d.getHours() >= 17 ? 'Ce soir' : 'Aujourd’hui') : sameDay(d, tomorrow) ? 'Demain' : dayFmt.format(d);
  const m = d.getMinutes();
  return `${day.charAt(0).toUpperCase() + day.slice(1)} · ${d.getHours()} h${m ? ' ' + String(m).padStart(2, '0') : ''}`;
}

const ANSWERS: [Rsvp, string][] = [['oui', 'Je viens'], ['peut', 'Peut-être'], ['non', 'Pas dispo']];
/** Pastilles de réponse : aplats francs, lisibles sur la carte jaune de la soirée. */
const PILLS: Record<Rsvp | 'none', [string, string, string]> = {
  oui: ['Vient', 'var(--turq)', 'var(--ink)'], peut: ['Peut-être', '#fff', 'var(--ink)'],
  non: ['Pas dispo', 'var(--rouge)', 'var(--ink)'], none: ['Sans réponse', 'var(--muted-bg)', 'var(--ink-2)'],
};

/** Formulaire « Proposer une soirée » : date, heure, lieu. */
function openSoireeSheet(code: string) {
  const d = new Date(Date.now() + 86_400_000);
  const p2 = (v: number) => String(v).padStart(2, '0');
  const date = h('input', { class: 'field', type: 'date', id: 'soiree-date', value: `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`, 'aria-label': 'Date' });
  const time = h('input', { class: 'field', type: 'time', id: 'soiree-heure', value: '20:30', 'aria-label': 'Heure' });
  const place = h('input', { class: 'field', id: 'soiree-lieu', placeholder: 'Ex. chez Mallo', maxlength: 40, 'aria-label': 'Lieu (facultatif)' });
  const close = () => wrap.remove();
  const send = button('Proposer la soirée', 'primary', async () => {
    const at = new Date(`${date.value}T${time.value || '20:30'}`).getTime();
    if (!date.value || Number.isNaN(at)) return toast('Choisis une date.');
    if (at < Date.now() - 3600_000) return toast('Cette date est déjà passée.');
    send.disabled = true;
    try {
      await proposeSoiree(code, at, place.value);
      close();
      toast('Soirée proposée !');
    } catch {
      send.disabled = false;
      toast('Soirée non enregistrée. Réessaie.');
    }
  }, { size: 'md', block: true });
  const wrap = h('div', { class: 'sheet-wrap', onclick: (e: Event) => { if (e.target === wrap) close(); } },
    h('div', { class: 'sheet', role: 'dialog', 'aria-label': 'Proposer une soirée' },
      h('span', { class: 'sheet__title' }, 'Proposer une soirée'),
      h('span', { class: 'sheet__text' }, 'Les autres joueurs de l’album la verront et pourront répondre.'),
      h('div', { style: { display: 'flex', gap: 8 } }, h('label', { style: { flex: 1.4, display: 'flex', flexDirection: 'column', gap: 6 } }, h('span', { class: 't-label' }, 'Date'), date),
        h('label', { style: { flex: 1, display: 'flex', flexDirection: 'column', gap: 6 } }, h('span', { class: 't-label' }, 'Heure'), time)),
      h('label', { style: { display: 'flex', flexDirection: 'column', gap: 6 } }, h('span', { class: 't-label' }, 'Lieu (facultatif)'), place),
      send,
      button('Annuler', 'text', close)));
  (document.getElementById('app') ?? document.body).append(wrap);
}

/** « Je viens », « Pas dispo »… : enregistre ta réponse, et dit quand arrivera le rappel. */
function answer(l: League, me: string, v: Rsvp, then?: () => void) {
  const s = l.soiree;
  if (!s) return;
  const before = s.rsvp[me];
  answerSoiree(l.code, s.id, v)
    // Nouvelle réponse « Je viens » ou « Peut-être » : on dit quand arrivera le rappel.
    .then(() => { if (v !== 'non' && before !== v) soireeReminderHint(new Date(s.at).toDateString() === new Date().toDateString()); then?.(); })
    .catch(() => toast('Réponse non enregistrée. Réessaie.'));
}

/** Le détail de la soirée : où, proposée par qui, la réponse de chacun, « Peut-être », changer la date, annuler. */
function openSoireeDetails(l: League, me: string) {
  const s = l.soiree;
  if (!s) return;
  const member = !!l.members[me];
  const people = l.seats.filter(Boolean);
  const mine = s.rsvp[me];
  const close = () => wrap.remove();
  const wrap: HTMLElement = h('div', { class: 'sheet-wrap', onclick: (e: Event) => { if (e.target === wrap) close(); } },
    h('div', { class: 'sheet', role: 'dialog', 'aria-label': 'La prochaine soirée' },
      h('span', { class: 'sheet__title' }, soireeLabel(s.at)),
      h('span', { class: 'sheet__text', style: { marginBottom: 0 } },
        [s.place, l.members[s.by] ? `Proposée par ${s.by === me ? 'toi' : l.members[s.by].name}` : ''].filter(Boolean).join(' · ') || 'La prochaine soirée de l’album.'),
      h('div', { class: 'soiree__list' }, ...people.map((u) => {
        const m = l.members[u];
        const [label, bg, fg] = PILLS[s.rsvp[u] ?? 'none'];
        return h('div', { class: 'soiree__row' },
          avatarRing(m.char, m.color, 26, 'transparent', 2, 0, null),
          h('span', { class: 'soiree__name' }, u === me ? 'Toi' : m.name),
          h('span', { class: 'soiree__pill', style: { background: bg, color: fg } }, label));
      })),
      member && h('div', { class: 'rsvp', role: 'group', 'aria-label': 'Ta réponse' }, ...ANSWERS.map(([v, label]) =>
        h('button', { type: 'button', 'aria-pressed': String(mine === v), onclick: () => answer(l, me, v, close) }, label))),
      member && h('div', { style: { display: 'flex', justifyContent: 'center', gap: 6 } },
        h('button', { class: 'soiree__link', type: 'button', onclick: () => { close(); openSoireeSheet(l.code); } }, 'Changer la date'),
        (s.by === me || l.host === me) && h('button', {
          class: 'soiree__link', type: 'button',
          onclick: () => cancelSoiree(l.code).then(() => { close(); toast('Soirée annulée.'); }).catch(() => toast('Annulation impossible.')),
        }, 'Annuler la soirée')),
      button('Fermer', 'text', close)));
  (document.getElementById('app') ?? document.body).append(wrap);
}

/**
 * Carte « Prochaine soirée », compacte comme sur la maquette : le feuillet du calendrier, le jour et l'heure,
 * « Je viens » et « Pas dispo », et ceux qui viennent. Le reste (lieu, réponses de chacun, « Peut-être », changer la
 * date) s'ouvre au toucher du calendrier ou des persos.
 */
function soireeCard(l: League, me: string): HTMLElement {
  const member = !!l.members[me];
  const s = l.soiree;
  if (!s)
    return h('div', { class: 'soiree soiree--vide' },
      h('div', { class: 'soiree__cal', 'aria-hidden': 'true' }, h('i', null, 'Bientôt'), h('b', null, '?'), h('span', null, '…')),
      h('span', { class: 'soiree__k' }, 'Prochaine soirée'),
      h('span', { class: 'soiree__when' }, 'Rien de prévu'),
      member ? h('div', { class: 'soiree__btns' }, h('button', { class: 'soiree__btn soiree__btn--on', type: 'button', onclick: () => openSoireeSheet(l.code) }, 'Proposer une date'))
        : h('span', { class: 'soiree__note' }, 'Les joueurs de l’album proposent la date.'));
  const people = l.seats.filter(Boolean);
  const mine = s.rsvp[me];
  const coming = people.filter((u) => s.rsvp[u] === 'oui');
  const when = new Date(s.at);
  const details = () => openSoireeDetails(l, me);
  const m0 = when.getMinutes();
  // « Jeudi, 20 h 30 » : le jour en toutes lettres, le feuillet donne déjà la date.
  const day = sameDay(when, new Date()) ? (when.getHours() >= 17 ? 'Ce soir' : 'Aujourd’hui') : sameDay(when, new Date(Date.now() + 86_400_000)) ? 'Demain' : weekDay.format(when);
  const label = `${day.charAt(0).toUpperCase() + day.slice(1)}, ${when.getHours()} h${m0 ? ' ' + String(m0).padStart(2, '0') : ''}`;
  return h('div', { class: 'soiree' },
    // Le feuillet du calendrier : le jour, la date, le mois.
    h('button', { class: 'soiree__cal', type: 'button', 'aria-label': 'Détails de la soirée', onclick: details },
      h('i', null, weekDay.format(when)), h('b', null, when.getDate()), h('span', null, calMonth.format(when))),
    h('span', { class: 'soiree__k' }, 'Prochaine soirée'),
    h('span', { class: 'soiree__when' }, label),
    member
      ? h('div', { class: 'soiree__btns', role: 'group', 'aria-label': 'Ta réponse' },
        h('button', { class: 'soiree__btn' + (mine !== 'non' ? ' soiree__btn--on' : ''), type: 'button', 'aria-pressed': String(mine === 'oui'), onclick: () => answer(l, me, 'oui') }, mine === 'oui' ? 'Je viens ✓' : 'Je viens'),
        h('button', { class: 'soiree__btn' + (mine === 'non' ? ' soiree__btn--on' : ''), type: 'button', 'aria-pressed': String(mine === 'non'), onclick: () => answer(l, me, 'non') }, 'Pas dispo'))
      : h('span', { class: 'soiree__note' }, s.place || 'Soirée de l’album'),
    h('button', { class: 'soiree__who', type: 'button', 'aria-label': `${coming.length} sur ${people.length} viennent : voir les réponses`, onclick: details },
      h('span', null, `${coming.length} sur ${people.length}`),
      h('span', { class: 'soiree__faces' }, ...coming.slice(0, 4).map((u) => avatar(l.members[u].char, l.members[u].color, 28)))));
}

// ---------- Statistiques et trophées ----------

const WEEK_MS = 7 * 86_400_000;
const shortDate = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short' });
const minutes = (ms: number) => `${Math.max(1, Math.round(ms / 60_000))} min`;

/** Lundi 0 h de la semaine de `t`. */
function weekStart(t: number) {
  const d = new Date(t);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return d.getTime();
}

interface Trophy { label: string; value: string; color: string }

function leagueStats(l: League) {
  const teams = l.n / 2;
  const chrono = [...l.games].sort((a, b) => a.at - b.at);
  // Séries : victoires d'affilée de la même équipe
  let best: { team: number; n: number } | null = null, run = { team: -1, n: 0 };
  for (const g of chrono) {
    run = g.winner === run.team ? { team: run.team, n: run.n + 1 } : { team: g.winner, n: 1 };
    if (!best || run.n > best.n) best = { ...run };
  }
  const current = chrono.length ? run : null;
  // Par joueur (places fixes du tournoi) : captures et sorties cumulées
  const sum = (field: 'captures' | 'exits') => l.seats.map((_, k) => chrono.reduce((a, g) => a + (g[field][k] ?? 0), 0));
  const top = (vals: number[]) => {
    const k = vals.indexOf(Math.max(...vals));
    return vals[k] > 0 && l.seats[k] ? { name: l.members[l.seats[k]]?.name ?? '…', n: vals[k], k } : null;
  };
  const durations = chrono.map((g) => g.duration).filter((d) => d > 0);
  // Victoires par semaine, sur les 6 dernières semaines
  const now = weekStart(Date.now());
  const weeks = Array.from({ length: 6 }, (_, i) => {
    const start = now - (5 - i) * WEEK_MS;
    const wins = Array(teams).fill(0);
    for (const g of chrono) if (g.at >= start && g.at < start + WEEK_MS) wins[g.winner]++;
    return { start, wins };
  });
  return { played: chrono.length, current, best, boom: top(sum('captures')), out: top(sum('exits')), durations, weeks };
}

const teamColor = (l: League, t: number) => COL[SEAT_COLORS[l.n][t]];

function statsCard(l: League): HTMLElement {
  const s = leagueStats(l);
  const card = h('div', { class: 'card', style: { padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 12 } },
    h('span', { class: 't-label' }, 'Statistiques'));
  if (!s.played) {
    card.append(h('span', { class: 't-body' }, 'Les statistiques apparaîtront après votre première partie.'));
    return card;
  }
  const teams = l.n / 2;
  // Légende : équipes et total des victoires (l'identité ne repose pas que sur la couleur)
  card.append(h('div', { class: 'stats-legend' }, ...Array.from({ length: teams }, (_, t) =>
    h('span', { class: 'stats-legend__item' },
      h('i', { style: { background: teamColor(l, t).c } }), `${TEAM_NAMES[t]} `, h('b', null, l.wins[t])))));
  // Victoires par semaine : barres groupées, une échelle, le détail d'une semaine au toucher
  const max = Math.max(1, ...s.weeks.flatMap((w) => w.wins));
  const readout = h('span', { class: 'stats-readout', 'aria-live': 'polite' });
  const show = (i: number) => {
    const w = s.weeks[i];
    readout.textContent = `Semaine du ${shortDate.format(new Date(w.start))} : ` +
      (w.wins.some(Boolean) ? w.wins.map((n, t) => `${TEAM_NAMES[t]} ${n}`).join(' · ') : 'pas de partie');
  };
  const chart = h('div', { class: 'stats-chart', role: 'img', 'aria-label': 'Victoires par semaine sur les 6 dernières semaines' },
    ...s.weeks.map((w, i) => h('button', {
      class: 'stats-week', type: 'button', 'aria-label': `Semaine du ${shortDate.format(new Date(w.start))}`, onclick: () => show(i),
    },
      h('span', { class: 'stats-bars' }, ...w.wins.map((n, t) => h('span', {
        class: 'stats-bar', title: `${TEAM_NAMES[t]} : ${n}`,
        style: { height: `${(n / max) * 100}%`, minHeight: n ? '6px' : '0', background: teamColor(l, t).c },
      }))),
      h('span', { class: 'stats-week__label' }, i === 5 ? 'Cette sem.' : shortDate.format(new Date(w.start))))));
  show(5);
  card.append(chart, readout);
  // Trophées
  const trophies: Trophy[] = [];
  if (s.current) trophies.push({ label: 'Série en cours', value: `${TEAM_NAMES[s.current.team]} · ${s.current.n} victoire${s.current.n > 1 ? 's' : ''} d’affilée`, color: teamColor(l, s.current.team).c });
  if (s.best && s.best.n > 1) trophies.push({ label: 'Plus longue série', value: `${TEAM_NAMES[s.best.team]} · ${s.best.n} victoires`, color: teamColor(l, s.best.team).c });
  if (s.boom) trophies.push({ label: 'Roi du BOUM', value: `${s.boom.name} · ${s.boom.n} capture${s.boom.n > 1 ? 's' : ''}`, color: COL[SEAT_COLORS[l.n][s.boom.k]].c });
  if (s.out) trophies.push({ label: 'Le plus de billes sorties', value: `${s.out.name} · ${s.out.n}`, color: COL[SEAT_COLORS[l.n][s.out.k]].c });
  if (s.durations.length) {
    trophies.push({ label: 'Partie la plus longue', value: minutes(Math.max(...s.durations)), color: 'var(--ink-3)' });
    trophies.push({ label: 'Durée moyenne', value: minutes(s.durations.reduce((a, b) => a + b, 0) / s.durations.length), color: 'var(--ink-3)' });
  }
  trophies.push({ label: 'Parties jouées', value: String(s.played), color: 'var(--ink-3)' });
  card.append(h('div', { class: 'trophies' }, ...trophies.map((t) =>
    h('div', { class: 'trophy' }, h('i', { style: { background: t.color } }),
      h('span', { class: 'trophy__label' }, t.label), h('span', { class: 'trophy__value' }, t.value)))));
  return card;
}

// ---------- Parties jouées hors de l'app ----------

const p2 = (v: number) => String(v).padStart(2, '0');
const isoDay = (d: Date) => `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`;

/** « aujourd'hui », « hier », « le 27 oct. » */
function dayLabel(t: number) {
  const d = new Date(t), now = new Date();
  if (d.toDateString() === now.toDateString()) return 'aujourd’hui';
  if (d.toDateString() === new Date(now.getTime() - 86_400_000).toDateString()) return 'hier';
  return 'le ' + dateFmt.format(d);
}

/** Formulaire « Partie jouée hors de l'app » : l'équipe gagnante et le jour. */
function openOfflineSheet(l: League) {
  let winner: number | null = null;
  const today = isoDay(new Date());
  const date = h('input', { class: 'field', type: 'date', value: today, max: today, 'aria-label': 'Jour de la partie' });
  const picks: HTMLElement[] = Array.from({ length: l.n / 2 }, (_, t) => {
    const seats = teamSeats(l.n, t);
    const names = seats.map((k) => l.members[l.seats[k]]?.name).filter(Boolean).join(' et ');
    return h('button', {
      class: 'team-pick', type: 'button', 'aria-pressed': 'false',
      onclick: () => { winner = t; picks.forEach((b, i) => b.setAttribute('aria-pressed', String(i === t))); },
    },
      duo(SEAT_COLORS[l.n][seats[0]], SEAT_COLORS[l.n][seats[1]]),
      h('span', { class: 'team-pick__name' }, 'Équipe ' + TEAM_NAMES[t], names && h('small', null, names)));
  });
  const close = () => wrap.remove();
  const send = button('Envoyer aux joueurs', 'primary', async () => {
    if (winner === null) return toast('Choisis l’équipe gagnante.');
    if (date.value > today) return toast('Ce jour n’est pas encore arrivé.');
    // Aujourd'hui : l'heure de la déclaration ; un autre jour : le soir même.
    const playedAt = !date.value || date.value === today ? Date.now() : new Date(`${date.value}T20:00`).getTime();
    send.disabled = true;
    try {
      await proposeOffline(l.code, winner, playedAt);
      close();
      toast('Envoyé ! Chaque joueur doit accepter.');
    } catch {
      send.disabled = false;
      toast('Non enregistré. Réessaie.');
    }
  }, { size: 'md', block: true });
  const wrap = h('div', { class: 'sheet-wrap', onclick: (e: Event) => { if (e.target === wrap) close(); } },
    h('div', { class: 'sheet', role: 'dialog', 'aria-label': 'Partie jouée hors de l’app' },
      h('span', { class: 'sheet__title' }, 'Partie hors de l’app'),
      h('span', { class: 'sheet__text' }, 'Vous avez joué sur un vrai plateau ? La victoire comptera quand tous les joueurs de l’album l’auront acceptée.'),
      h('span', { class: 't-label' }, 'Qui a gagné ?'),
      h('div', { style: { display: 'flex', flexDirection: 'column', gap: 8 } }, ...picks),
      h('label', { style: { display: 'flex', flexDirection: 'column', gap: 6 } }, h('span', { class: 't-label' }, 'Quel jour ?'), date),
      send,
      button('Annuler', 'text', close)));
  (document.getElementById('app') ?? document.body).append(wrap);
}

const VOTE_PILLS: Record<'oui' | 'non' | 'none', [string, string, string]> = {
  oui: ['A accepté', '#d4f4eb', '#16705a'], non: ['A refusé', '#ffe3da', '#c9401f'], none: ['En attente', 'var(--app)', 'var(--ink-2)'],
};

/** Une partie hors de l'app à valider : l'avis de chaque joueur, et ses boutons pour répondre. */
function offlineCard(l: League, o: OfflineClaim, me: string): HTMLElement {
  const seats = teamSeats(l.n, o.winner);
  const voters = l.seats.filter(Boolean);
  const refused = refusedBy(o);
  const yes = voters.filter((u) => o.votes[u] === 'oui').length;
  const name = (u: string) => (u === me ? 'toi' : l.members[u]?.name ?? '…');
  const seated = voters.includes(me);
  const drop = (msg: string) => () => dropOffline(l.code, o.id).then(() => toast(msg)).catch(() => toast('Impossible pour l’instant. Réessaie.'));
  const vote = (v: 'oui' | 'non') => () => voteOffline(l.code, o.id, v).catch(() => toast('Réponse non enregistrée. Réessaie.'));
  return h('div', { class: 'card claim' + (refused.length ? ' claim--refused' : '') },
    h('span', { class: 't-label' }, refused.length ? 'Partie hors app refusée' : 'Partie hors app à valider'),
    h('div', { style: { display: 'flex', alignItems: 'center', gap: 8 } },
      duo(SEAT_COLORS[l.n][seats[0]], SEAT_COLORS[l.n][seats[1]]),
      h('span', { style: { flex: 1, font: '800 18px/1.1 var(--display)', paddingTop: 2 } }, `Victoire ${TEAM_NAMES[o.winner]}`),
      !refused.length && h('span', { class: 'claim__count' }, `${yes} / ${voters.length}`)),
    h('span', { class: 't-body' }, `Jouée ${dayLabel(o.playedAt)}, déclarée par ${name(o.by)}.`),
    refused.length
      ? h('span', { class: 't-body', style: { color: 'var(--coral-d)' } }, `Refusée par ${refused.map(name).join(' et ')} : la victoire n’est pas comptée.`)
      : h('div', { class: 'claim__list' }, ...voters.map((u) => {
        const m = l.members[u];
        const [label, bg, fg] = VOTE_PILLS[o.votes[u] ?? 'none'];
        return h('div', { class: 'claim__row' },
          m && avatarRing(m.char, m.color, 26, 'transparent', 2, 0, null),
          h('span', { class: 'claim__name' }, u === me ? `${m?.name ?? 'Toi'} (toi)` : m?.name ?? '…'),
          h('span', { class: 'claim__pill', style: { background: bg, color: fg } }, label));
      })),
    !refused.length && seated && !o.votes[me] && h('div', { style: { display: 'flex', gap: 8 } },
      button('J’accepte', 'ok', vote('oui'), { size: 'sm', block: true }),
      button('Je refuse', 'danger', vote('non'), { size: 'sm', block: true })),
    !refused.length && o.by === me && h('button', { class: 'link-btn', type: 'button', onclick: drop('Déclaration annulée.') }, 'Annuler la déclaration'),
    refused.length > 0 && seated && h('button', { class: 'link-btn', type: 'button', onclick: drop('Déclaration retirée.') }, 'Retirer'));
}

/** Équipe t : places t et t + n/2. */
const teamSeats = (n: number, t: number) => [t, t + n / 2];

export function newLeagueScreen(): View {
  let n = savedMode();
  let variants: Variants = { ...DEFAULT_VARIANTS };
  const rules = variantsCard(() => variants, () => true, (v) => { variants = v; rules.refresh(); });
  const name = h('input', { class: 'field field--big', placeholder: 'Ex. Les voisins du 12', 'aria-label': 'Nom de l’album', maxlength: 30, enterkeyhint: 'done' });
  const create = button('Créer l’album', 'primary', async () => {
    if (!navigator.onLine) return toast('Il faut du réseau pour créer un album.');
    create.disabled = true;
    try {
      const code = await createLeague(name.value, n, variants);
      history.replaceState(null, '', '#/tournoi/' + code);
      window.dispatchEvent(new HashChangeEvent('hashchange'));
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Création impossible.');
      create.disabled = false;
    }
  }, { block: true });
  const el = h('div', { class: 'screen new-league', 'data-wide': '', 'data-tone': 'turq', style: { gap: 16, paddingTop: 'calc(var(--safe-top) + 8px)' } },
    h('div', { class: 'screen__head' },
      backButton(() => go(ROUTES.albums)),
      h('span', { class: 't-title', style: { paddingTop: 3 } }, 'Nouvel album')),
    h('p', { class: 't-body new-league__desc', style: { margin: 0 } },
      'Toujours les mêmes équipes, et les victoires s’additionnent de partie en partie. Idéal pour jouer entre voisins.'),
    h('label', { class: 'new-league__name', style: { display: 'flex', flexDirection: 'column', gap: 8 } }, h('span', { class: 't-label' }, 'Nom de l’album'), name),
    h('div', { class: 'new-league__players', style: { display: 'flex', flexDirection: 'column', gap: 8 } }, h('span', { class: 't-label' }, 'Joueurs'),
      segmented<4 | 6>([{ value: 4, label: '4 joueurs', sub: '2 équipes de 2' }, { value: 6, label: '6 joueurs', sub: '3 équipes de 2' }], n, (v) => { n = v; })),
    rules.el,
    h('div', { class: 'spacer' }),
    create);
  return { el, cleanup: () => {} };
}

// ---------- Discussion du tournoi ----------

const READ_KEY = (code: string) => 'toc.discussion.' + code;
const lastRead = (code: string) => { try { return Number(localStorage.getItem(READ_KEY(code)) ?? 0); } catch { return 0; } };
const markRead = (code: string, at: number) => { try { localStorage.setItem(READ_KEY(code), String(at)); } catch { /* sans stockage */ } };
const timeFmt = new Intl.DateTimeFormat('fr-FR', { hour: 'numeric', minute: '2-digit' });
/** « 20:31 » aujourd'hui, « 29 oct. » avant */
const msgTime = (t: number) => (new Date(t).toDateString() === new Date().toDateString() ? timeFmt.format(t) : dateFmt.format(t));

/** Aperçu dans la page : les deux derniers messages et le nombre de nouveaux. */
function chatCard(l: League, me: string, msgs: LeagueMsg[], open: () => void): HTMLElement {
  const seen = lastRead(l.code);
  const unread = msgs.filter((m) => m.from !== me && m.at > seen).length;
  return h('div', { class: 'card lchat-card' },
    h('div', { style: { display: 'flex', alignItems: 'center', gap: 8 } },
      h('span', { class: 't-label', style: { flex: 1 } }, 'Discussion'),
      unread > 0 && h('span', { class: 'lchat-new' }, unread > 1 ? `${unread} nouveaux` : '1 nouveau')),
    msgs.length
      ? h('div', { class: 'lchat-preview' }, ...msgs.slice(-2).map((m) =>
        h('div', { class: 'lchat-line' }, h('b', null, m.from === me ? 'Toi' : m.name), ` ${m.t}`)))
      : h('span', { class: 't-body' }, 'Personne n’a encore écrit. Lance la discussion !'),
    button(msgs.length ? 'Ouvrir la discussion' : 'Écrire à la bande', 'white', open, { size: 'sm', block: true }));
}

/** La discussion complète, avec le champ de saisie en bas. */
function openChatSheet(l: League, me: string, onClose: () => void) {
  const list = h('div', { class: 'chat lchat-list' });
  const scroller = h('div', { class: 'scroll-y', style: { maxHeight: '52vh', paddingBottom: 4 } }, list);
  const input = h('input', { class: 'field', id: 'lchat-input', placeholder: 'Écris à la bande…', 'aria-label': 'Message', enterkeyhint: 'send', maxlength: 300, style: { flex: 1, height: 50 } }) as HTMLInputElement;
  const send = async () => {
    const t = input.value.trim();
    if (!t) return;
    input.value = '';
    try {
      await sendLeagueMsg(l, t);
    } catch {
      input.value = t;
      toast('Message non envoyé. Réessaie.');
    }
  };
  input.addEventListener('keydown', (e) => e.key === 'Enter' && send());
  const stop = watchLeagueChat(l.code, (msgs) => {
    if (!msgs) return;
    list.replaceChildren(...(msgs.length
      ? msgs.map((m, i) => {
        const mine = m.from === me;
        const showName = !mine && msgs[i - 1]?.from !== m.from;
        return h('div', { class: 'lchat-msg ' + (mine ? 'lchat-msg--me' : '') },
          showName && h('span', { class: 'lchat-msg__who' }, m.name),
          h('div', { class: 'bubble bubble--old ' + (mine ? 'bubble--me' : 'bubble--them') }, m.t),
          h('span', { class: 'lchat-msg__at' }, msgTime(m.at)));
      })
      : [tocSays('Personne n’a encore écrit. Lance la discussion !', 'content')]));
    const last = msgs[msgs.length - 1];
    if (last) markRead(l.code, last.at);
    requestAnimationFrame(() => { scroller.scrollTop = scroller.scrollHeight; });
  });
  const close = () => { stop(); wrap.remove(); onClose(); };
  const wrap = h('div', { class: 'sheet-wrap', onclick: (e: Event) => { if (e.target === wrap) close(); } },
    h('div', { class: 'sheet', role: 'dialog', 'aria-label': 'Discussion de l’album' },
      h('div', { style: { display: 'flex', alignItems: 'center', gap: 8 } },
        h('span', { class: 'sheet__title', style: { flex: 1, minWidth: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' } }, l.name),
        button('Fermer', 'text', close)),
      scroller,
      h('div', { style: { display: 'flex', gap: 8 } }, input,
        h('button', { class: 'send', type: 'button', 'aria-label': 'Envoyer', onclick: () => send() }, h('i')))));
  (document.getElementById('app') ?? document.body).append(wrap);
}

/** En bas de la page : quitter le tournoi (joueur), le supprimer (créateur). */
function exitLinks(l: League, me: string): HTMLElement {
  const seated = l.seats.includes(me);
  const host = l.host === me;
  const alone = !l.seats.some((u) => u && u !== me);
  return h('div', { class: 'league-exit' },
    seated && !(host && alone) && h('button', {
      class: 'link-btn link-btn--danger', type: 'button',
      onclick: () => confirmSheet(`Quitter « ${l.name} » ?`,
        host ? 'Ta place se libère et un autre joueur devient le créateur de l’album. Les victoires de ton équipe restent.'
          : 'Ta place se libère pour quelqu’un d’autre. Les victoires de ton équipe restent.',
        'Quitter l’album', async () => { await leaveLeague(l.code); go(ROUTES.home); toast('Tu as quitté l’album.'); }),
    }, 'Quitter l’album'),
    host && h('button', {
      class: 'link-btn link-btn--danger', type: 'button',
      onclick: () => confirmSheet(`Supprimer « ${l.name} » ?`,
        'L’album disparaît pour tout le monde : scores, historique des parties et prochaine soirée. C’est définitif.',
        'Supprimer l’album', async () => { await deleteLeague(l.code); go(ROUTES.home); toast('Album supprimé.'); }),
    }, 'Supprimer l’album'));
}

/** « Inviter » : le lien à partager, ou directement un ami de l'app. */
function openInviteSheet(l: League) {
  const full = l.seats.every(Boolean);
  const sent = new Set<string>();
  const list = h('div', { class: 'invite-list' });
  const draw = (friends: FriendView[]) => {
    const others = friends.filter((f) => !l.members[f.uid] || !l.seats.includes(f.uid));
    list.replaceChildren(...(others.length
      ? others.map((f) => {
        const b = button(sent.has(f.uid) ? 'Invité·e' : 'Inviter', sent.has(f.uid) ? 'ok' : 'primary', async () => {
          if (sent.has(f.uid)) return;
          b.disabled = true;
          try {
            await inviteToLeague(f.uid, l.code, l.name);
            sent.add(f.uid);
            b.textContent = 'Invité·e';
            b.className = 'btn btn--xs btn--ok';
          } catch {
            toast('Invitation non envoyée. Réessaie.');
          }
          b.disabled = false;
        }, { size: 'xs' });
        return h('div', { class: 'invite-row' },
          avatarRing(f.char, f.color, 34, 'transparent', 2, 0, null),
          h('div', { style: { flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 1 } },
            h('span', { class: 'invite-row__name' }, f.name), h('span', { class: 'invite-row__status' }, f.status)),
          b);
      })
      : [h('span', { class: 't-body' }, friends.length ? 'Tous tes amis sont déjà dans cet album.' : 'Ajoute des amis depuis l’onglet Ta bande : tu pourras les inviter d’ici.')]));
  };
  draw([]);
  const stop = full ? () => {} : watchFriends(draw);
  const close = () => { stop(); wrap.remove(); };
  const wrap = h('div', { class: 'sheet-wrap', onclick: (e: Event) => { if (e.target === wrap) close(); } },
    h('div', { class: 'sheet', role: 'dialog', 'aria-label': 'Inviter dans l’album' },
      h('span', { class: 'sheet__title' }, 'Inviter dans l’album'),
      h('span', { class: 'sheet__text' }, full ? 'L’album est complet : le lien permet seulement de le suivre.' : 'Envoie le lien à qui tu veux, ou invite directement un ami de l’app.'),
      button('Partager le lien', 'primary', () => shareLeague(l), { size: 'md', block: true }),
      !full && h('span', { class: 't-label' }, 'Tes amis'),
      !full && h('div', { class: 'scroll-y', style: { maxHeight: '40vh' } }, list),
      button('Fermer', 'text', close)));
  (document.getElementById('app') ?? document.body).append(wrap);
}

async function shareLeague(l: League) {
  const url = leagueLink(l.code);
  const text = `Rejoins l’album « ${l.name} » sur TOC (code T-${l.code})`;
  try {
    if (navigator.share) return await navigator.share({ title: 'TOC', text, url });
    await navigator.clipboard.writeText(`${text} : ${url}`);
    toast('Lien copié, envoie-le aux joueurs !');
  } catch { /* partage annulé */ }
}

// ---------- L'album : sa page, et la liste de tes albums ----------

/** Toi, dans les données de l'album (un joueur fictif en démonstration). */
const myUid = () => (DEMO ? DEMO_UID : currentUid());


/** Le chiffre d'une équipe sur fond blanc : sa couleur (le jaune du Soleil, illisible sur blanc, passe au rouge comme sur la maquette). */
const scoreInk = (t: number) => (t === 0 ? '#ff5433' : TEAM_BG[t]);

/** « En tête » : les équipes face à face et leurs victoires en gros chiffres (ton équipe à gauche). */
function scoreCard(l: League, me: string): HTMLElement {
  const half = l.n / 2;
  const best = Math.max(...l.wins), leaders = l.wins.filter((w) => w === best).length;
  const state = (t: number) => ({ ahead: best > 0 && l.wins[t] === best && leaders === 1, behind: best > 0 && l.wins[t] < best });
  const score = (t: number) => h('b', { class: 'alb-score__n', style: { '--c': scoreInk(t) }, 'aria-label': `${TEAM_NAMES[t]} : ${l.wins[t]} victoire${l.wins[t] > 1 ? 's' : ''}` }, l.wins[t]);
  const foot = h('span', { class: 'alb-score__foot' }, 'Victoires depuis le début de l’album');
  const label = !best ? 'Tout reste à écrire' : leaders > 1 ? 'Égalité' : 'En tête';
  if (half === 2) {
    // Ton équipe à gauche, l'autre à droite : les persos se font face, le plus grand au bord de la case.
    const mine = Math.max(0, l.seats.indexOf(me)) % 2, order = [mine, 1 - mine];
    const lead = leaders === 1 && best > 0 ? order.indexOf(l.wins.indexOf(best)) : -1;
    const duoOf = (t: number, right: boolean) => {
      const { ahead, behind } = state(t);
      const seats = teamSeats(l.n, t);
      return h('div', { class: 'alb-duo' + (right ? ' alb-duo--d' : '') },
        ...seats.map((k, j) => {
          const m = l.members[l.seats[k]];
          const big = right ? j === 1 : j === 0;
          return m ? avatar(m.char, m.color, big ? 62 : 56, ahead ? 'joie' : behind ? (big ? 'furieux' : 'concentre') : 'content', { flip: right })
            : h('span', { class: 'alb-team__free', style: { width: big ? 62 : 56, height: big ? 62 : 56 } });
        }),
        h('span', { class: 'alb-duo__name' }, TEAM_NAMES[t]));
    };
    return h('div', { class: 'alb-score alb-score--duel' + (Math.max(...l.wins) > 9 ? ' alb-score--grand' : '') },
      h('span', { class: 'alb-score__tag' + (lead === 1 ? ' alb-score__tag--d' : lead < 0 ? ' alb-score__tag--mi' : '') }, label),
      duoOf(order[0], false),
      h('div', { class: 'alb-score__mid' }, score(order[0]), h('i', { 'aria-hidden': 'true' }), score(order[1])),
      duoOf(order[1], true),
      foot);
  }
  const team = (t: number) => {
    const seats = teamSeats(l.n, t);
    const { ahead, behind } = state(t);
    return h('div', { class: 'alb-team' },
      h('div', { class: 'alb-team__duo' }, ...seats.map((k, j) => {
        const m = l.members[l.seats[k]];
        return m ? avatar(m.char, m.color, 40, ahead ? 'joie' : behind ? (j ? 'furieux' : 'concentre') : 'content', { flip: j === 1 }) : h('span', { class: 'alb-team__free' });
      })),
      h('span', { class: 'alb-team__name' }, TEAM_NAMES[t]));
  };
  return h('div', { class: 'card alb-score alb-score--n6' },
    h('span', { class: 'tag tag--jaune alb-score__tag6' }, leaders === 1 && best > 0 ? 'En tête : ' + TEAM_NAMES[l.wins.indexOf(best)] : label),
    h('div', { class: 'alb-score__row' }, ...[0, 1, 2].map((t) => h('div', { class: 'alb-score__col' }, score(t), team(t)))),
    foot);
}

/** Le fond des vignettes d'épisode : jamais la couleur du perso qui y figure, et pas le turquoise de la page. */
const EP_BG: [string, string][] = [['#ff8fc4', 'rose'], ['#3b5bff', 'blue'], ['#ffcf1f', 'yellow'], ['#ff5433', 'coral'], ['#9b6bff', 'violet']];

interface Episode { no: number; fx: string; title: string; star: number; winner: number; at: number; duration: number; booms: number; offline: boolean }

/**
 * Chaque partie de l'album devient un épisode titré, d'après ce que l'album en a gardé (qui a gagné, les billes
 * renvoyées par chacun, la durée, le score d'avant) : « La remontada », « Le doublé de Mimi », « Coco contre-attaque »…
 * Du plus récent au plus ancien.
 */
function episodesOf(l: League): Episode[] {
  const teams = l.n / 2;
  const chrono = [...l.games].map((g, i) => ({ g, i })).sort((a, b) => a.g.at - b.g.at || b.i - a.i);
  const wins = Array<number>(teams).fill(0);
  let run = { team: -1, n: 0 };
  const out: Episode[] = [];
  chrono.forEach(({ g }, k) => {
    const w = g.winner, seats = teamSeats(l.n, w);
    // La vedette de l'épisode : le gagnant qui a renvoyé le plus de billes.
    const star = seats.reduce((a, s) => ((g.captures[s] ?? 0) > (g.captures[a] ?? 0) ? s : a), seats[0]);
    const name = l.members[l.seats[star]]?.name ?? TEAM_NAMES[w];
    const mine = g.captures[star] ?? 0, booms = g.captures.reduce((a, v) => a + (v ?? 0), 0);
    const others = Math.max(0, ...wins.filter((_, t) => t !== w));
    const trailing = wins[w] < others;
    run = run.team === w ? { team: w, n: run.n + 1 } : { team: w, n: 1 };
    wins[w]++;
    const min = g.duration / 60_000;
    const [fx, title] = g.offline ? ['TOC !', 'Sur le vrai plateau']
      : trailing && wins[w] >= others ? ['BOUM !', 'La remontada']
        : run.n === 2 ? ['DOUBLÉ !', `Le doublé ${deNom(name)}`]
          : run.n === 3 ? ['TRIPLÉ !', `Le triplé ${deNom(name)}`]
            : run.n > 3 ? ['ENCORE !', `${TEAM_NAMES[w]} intouchable`]
              : trailing && mine > 0 ? ['PAF !', `${name} contre-attaque`]
                : mine >= 4 ? ['BOUM !', `${name} fait le ménage`]
                  : min > 0 && min < 15 ? ['ZOU !', 'Victoire éclair']
                    : min > 40 ? ['OUF !', 'Au bout du suspense']
                      : mine > 0 ? ['PAF !', `Le coup ${deNom(name)}`] : ['TOC !', `Victoire ${TEAM_NAMES[w]}`];
    out.push({ no: k + 1, fx, title, star, winner: w, at: g.at, duration: g.duration, booms, offline: !!g.offline });
  });
  return out.reverse();
}

/** Tous les épisodes de l'album, dans une feuille : le titre, le jour, l'équipe gagnante, les BOUM, la durée. */
function openEpisodesSheet(l: League, canDeclare: boolean) {
  const eps = episodesOf(l);
  const close = () => wrap.remove();
  const wrap: HTMLElement = h('div', { class: 'sheet-wrap', onclick: (e: Event) => { if (e.target === wrap) close(); } },
    h('div', { class: 'sheet sheet--tall', role: 'dialog', 'aria-label': 'Tous les épisodes' },
      h('span', { class: 'sheet__title' }, eps.length > 1 ? `Les ${eps.length} épisodes` : 'Les épisodes'),
      eps.length
        ? h('div', { class: 'scroll-y', style: { maxHeight: '52vh', display: 'flex', flexDirection: 'column', gap: 8 } }, ...eps.map((e) => {
          const m = l.members[l.seats[e.star]];
          return h('div', { class: 'ep-row' },
            m ? avatar(m.char, m.color, 38, 'joie') : h('span', { style: { width: 38 } }),
            h('div', { class: 'ep-row__t' },
              h('b', null, `N° ${e.no} · ${e.title}`),
              h('span', null, [`Victoire ${TEAM_NAMES[e.winner]}`, e.at ? dateFmt.format(new Date(e.at)) : '', e.offline ? 'hors app' : `${e.booms} BOUM`,
                e.duration > 0 ? `${Math.max(1, Math.round(e.duration / 60_000))} min` : ''].filter(Boolean).join(' · '))));
        }))
        : h('span', { class: 'sheet__text' }, 'Aucun épisode pour l’instant. Le premier se joue ce soir ?'),
      // Une partie jouée sur un vrai plateau compte aussi, une fois acceptée par tous les joueurs.
      canDeclare && button('Ajouter une partie jouée hors de l’app', 'white', () => { close(); openOfflineSheet(l); }, { size: 'sm', block: true }),
      button('Fermer', 'text', close)));
  (document.getElementById('app') ?? document.body).append(wrap);
}

/** Les derniers épisodes : une vignette par partie (son numéro, son mot, sa vedette, son titre), de la plus récente à la plus ancienne. */
function episodes(l: League, canDeclare: boolean): HTMLElement {
  const eps = episodesOf(l);
  const open = () => openEpisodesSheet(l, canDeclare);
  return h('div', { class: 'alb-eps' },
    h('div', { class: 'alb-eps__head' }, h('span', { class: 'alb-eps__title' }, 'Les derniers épisodes'),
      (eps.length > 0 || canDeclare) && h('button', { class: 'alb-eps__all', type: 'button', onclick: open }, eps.length ? 'Tout voir' : '+ Partie hors app')),
    eps.length
      ? h('div', { class: 'alb-eps__strip' }, ...eps.slice(0, 6).map((e, i) => {
        const m = l.members[l.seats[e.star]];
        const bg = (EP_BG.map((_, k) => EP_BG[(i + k) % EP_BG.length]).find(([, name]) => name !== m?.color) ?? EP_BG[i % EP_BG.length])[0];
        return h('button', { class: 'alb-ep', type: 'button', 'aria-label': `Épisode ${e.no} : ${e.title}`, style: { '--c': bg, rotate: `${[-2, 1.5, -1, 2][i % 4]}deg` }, onclick: open },
          h('span', { class: 'alb-ep__no' }, `N° ${e.no}`),
          h('span', { class: 'alb-ep__fx' }, e.fx),
          m ? avatar(m.char, m.color, 46, e.fx === 'PAF !' ? 'malin' : 'joie') : null,
          h('span', { class: 'alb-ep__cap' }, e.title));
      }))
      : h('div', { class: 'card card--flat alb-eps__none' }, 'Aucun épisode pour l’instant. Le premier se joue ce soir ?'));
}

export function leagueScreen(code: string): View {
  const kicker = h('span', { class: 'tag alb-kicker' }, 'Album');
  const title = h('h1', { class: 'alb-title' }, 'Album');
  const codeVal = h('span', { style: { font: '900 24px/1.05 var(--display)', letterSpacing: '.06em' } }, 'T-' + code);
  const top = h('div', { style: { display: 'flex', flexDirection: 'column', gap: 12 } });
  const soiree = h('div');
  const recap = h('div');
  const claims = h('div', { style: { display: 'flex', flexDirection: 'column', gap: 12 } });
  // Discussion : écoutée dès l'ouverture de la page (lecture refusée si on n'est pas membre : carte cachée).
  const chat = h('div');
  let msgs: LeagueMsg[] | null = null;
  const drawChat = () => {
    const l = league;
    const member = !!l?.members[myUid()];
    // Devenu membre page ouverte : la lecture, refusée jusque-là, est relancée.
    if (member && msgs === null && !retried && !DEMO) {
      retried = true;
      stopChat();
      stopChat = watchLeagueChat(code, onMsgs);
    }
    chat.replaceChildren(...(l && msgs && member ? [chatCard(l, myUid(), msgs, () => openChatSheet(l, myUid(), drawChat))] : []));
  };
  let retried = false;
  const onMsgs = (m: LeagueMsg[] | null) => { msgs = m; drawChat(); };
  let stopChat = DEMO ? () => {} : watchLeagueChat(code, onMsgs);
  const stats = h('div');
  const exit = h('div');
  // Déclarations acceptées par tous, en cours d'enregistrement (une seule fois par téléphone)
  const settling = new Set<string>();
  const hist = h('div');
  // Déclaré avant la carte « Règles », qui lit l'album dès sa création.
  let league: League | null = null;
  const rules = variantsCard(() => league?.variants ?? DEFAULT_VARIANTS, () => false, () => undefined);
  const status = h('span', { class: 'status-line' });
  const play = button('Jouer une partie', 'primary', () => undefined, { size: 'md', block: true });
  const invite = h('button', { class: 'btn-round alb-invite', type: 'button', 'aria-label': 'Inviter dans l’album', onclick: () => league && openInviteSheet(league) }, icon(ICONS.invite, 20, 2.8));
  // Plusieurs albums, en créer un, en rejoindre un : la liste reste à un toucher, en bas de la page.
  const allLink = h('button', { class: 'link-btn alb-all', type: 'button', onclick: () => go(ROUTES.albums + '?liste') }, 'Tous tes albums · créer ou rejoindre');
  const codeCard = h('div', { class: 'card alb-code' },
    h('div', { style: { flex: 1, display: 'flex', flexDirection: 'column', gap: 2 } }, h('span', { class: 't-mini' }, 'Code de l’album'), codeVal),
    button('Inviter', 'dark', () => league && openInviteSheet(league), { size: 'sm' }));

  const draw = (l: League | null) => {
    league = l;
    if (!l) {
      title.textContent = 'Album introuvable';
      top.replaceChildren(tocSays(`Aucun album T-${code}. Vérifie le code.`, 'surpris'));
      hist.hidden = codeCard.hidden = invite.hidden = play.hidden = true;
      return;
    }
    const me = myUid();
    const seated = l.seats.includes(me);
    const full = l.seats.every(Boolean);
    title.textContent = l.name;
    title.classList.toggle('alb-title--long', l.name.length > 17);
    title.classList.toggle('alb-title--xl', l.name.length > 23);
    kicker.textContent = l.games.length ? `Album · ${l.games.length} épisode${l.games.length > 1 ? 's' : ''}` : `Album · ${l.n} joueurs`;
    // Album complet : le score en tête. Sinon, les équipes et leurs places à prendre.
    top.replaceChildren(...(full ? [scoreCard(l, me)] : Array.from({ length: l.n / 2 }, (_, t) => {
      const seats = teamSeats(l.n, t);
      return h('div', { class: 'card card--lg', style: { display: 'flex', flexDirection: 'column', gap: 10 } },
        h('div', { style: { display: 'flex', alignItems: 'center', gap: 8 } },
          duo(SEAT_COLORS[l.n][seats[0]], SEAT_COLORS[l.n][seats[1]]),
          h('span', { style: { flex: 1, font: '400 22px/1 var(--fx)', letterSpacing: '.03em', paddingTop: 3 } }, 'Équipe ' + TEAM_NAMES[t]),
          h('span', { style: { font: '400 32px/1 var(--fx)', paddingTop: 3 }, 'aria-label': `${l.wins[t]} victoires` }, l.wins[t]),
          h('span', { style: { font: '800 12px var(--text)', color: 'var(--ink-2)', paddingTop: 6 } }, l.wins[t] > 1 ? 'victoires' : 'victoire')),
        h('div', { class: 'seat-grid' }, ...seats.map((k) => {
          const uid = l.seats[k], tint = COL[SEAT_COLORS[l.n][k]];
          const m = uid ? l.members[uid] : null;
          if (m)
            return h('div', { class: 'seat', style: { background: tint.l } },
              avatar(m.char, m.color, 40),
              h('div', { style: { minWidth: 0, display: 'flex', flexDirection: 'column', gap: 1 } },
                h('span', { class: 'seat__name' }, m.name), h('span', { class: 'seat__tag' }, uid === me ? 'Toi' : uid === l.host ? 'Créateur' : 'Joueur')));
          // Place libre : on la prend (rejoindre, ou choisir son duo tant que l'album n'est pas complet).
          return h('button', {
            class: 'seat', type: 'button', style: { width: '100%', textAlign: 'left', cursor: 'pointer' },
            onclick: () => takeLeagueSeat(code, k).catch((e) => toast(e instanceof Error ? e.message : 'Place indisponible.')),
          },
            h('div', { class: 'seat__wait' }),
            h('div', { class: 'seat__invite' }, h('span', null, 'Place libre'), h('span', null, seated ? 'Changer de place' : 'Prendre la place')));
        })));
    })));
    hist.hidden = codeCard.hidden = invite.hidden = false;
    soiree.replaceChildren(soireeCard(l, me));
    const rc = recapCard(l);
    recap.replaceChildren(...(rc ? [rc] : []));
    stats.replaceChildren(statsCard(l));
    exit.replaceChildren(exitLinks(l, me));
    drawChat();
    // Une déclaration acceptée par tous devient une victoire ; n'importe quel joueur l'enregistre (sans doublon).
    if (!DEMO)
      for (const o of l.offline)
        if (seated && claimApproved(l, o) && !settling.has(o.id)) {
          settling.add(o.id);
          void settleOffline(code, o).catch(() => settling.delete(o.id));
        }
    claims.replaceChildren(...l.offline.filter((o) => !claimApproved(l, o)).map((o) => offlineCard(l, o, me)));
    rules.refresh();
    hist.replaceChildren(episodes(l, seated && l.seats.filter(Boolean).length >= 2));
    const filled = l.seats.filter(Boolean).length;
    // Album complet et toi dedans : le bouton suffit, pas besoin d'une phrase de plus.
    status.textContent = !full ? `${filled} / ${l.n} joueurs · partage le lien pour compléter` : seated ? '' : 'Cet album est complet.';
    status.hidden = !status.textContent;
    play.hidden = !seated && full;
    play.disabled = !full || !seated;
    play.className = 'btn btn--md btn--block ' + (full && seated ? 'btn--primary' : 'btn--off');
    // Un autre membre a lancé une partie : on la rejoint (sa place est gardée), au lieu d'en créer une autre.
    const live = seated ? liveGame(l, me) : null;
    play.textContent = live ? `Rejoindre la partie ${deNom(live.by)}` : full ? `Jouer l’épisode ${l.games.length + 1}` : 'En attente des joueurs…';
    play.onclick = () => go(live ? '/salle/' + live.code : `/salle/nouvelle?n=${l.n}&ligue=${code}`);
  };

  // Comme sur la maquette : l'en-tête, puis le score, la soirée et les derniers épisodes tiennent dans l'écran, au-dessus de
  // « Jouer l'épisode » et des onglets. Le reste (discussion, statistiques, code, règles) suit en faisant défiler.
  const el = h('div', { class: 'screen screen--tabs album', 'data-fit': 'tabs', 'data-tone': 'turq', style: { gap: 0, paddingTop: 'calc(var(--safe-top) + 6px)' } },
    h('div', { class: 'alb-head' }, kicker, invite, title),
    h('div', { class: 'scroll-y alb-body' },
      top,
      claims,
      soiree,
      hist,
      recap,
      chat,
      stats,
      codeCard,
      rules.el,
      exit,
      allLink),
    status,
    play,
    tabbar('albums'));
  if (DEMO) {
    draw(demoLeague());
    return { el, cleanup: () => {} };
  }
  const stop = watchLeague(code, draw);
  return { el, cleanup: () => { stop(); stopChat(); } };
}

/** L'album de démonstration ; « ?demo=libre » lui retire un joueur pour montrer les places à prendre. */
function demoLeague(): League {
  if (new URLSearchParams(location.search).get('demo') !== 'libre') return DEMO_LEAGUE;
  const out = DEMO_LEAGUE.seats[3];
  return { ...DEMO_LEAGUE, seats: DEMO_LEAGUE.seats.map((u) => (u === out ? '' : u)), members: Object.fromEntries(Object.entries(DEMO_LEAGUE.members).filter(([u]) => u !== out)) };
}

/** Les couvertures des albums, une couleur chacune. */
const COVER_BG = ['var(--rouge)', 'var(--bleu)', 'var(--violet)', '#ff8fc4'];

/** Tes albums : un album, c'est ta bande et ses soirées (mêmes équipes à chaque partie, victoires qui s'additionnent). */
export function albumsScreen(showList = false): View {
  const me = myUid();
  const list = h('div', { class: 'alb-list' });
  const note = (l: League) => {
    const live = liveGame(l, me);
    if (live) return h('span', { class: 'alb-cover__note alb-cover__note--live' }, `${live.by} lance une partie · touche pour rejoindre`);
    if (l.seats.includes(me) && l.offline.some((o) => !o.votes[me] && !refusedBy(o).length))
      return h('span', { class: 'alb-cover__note alb-cover__note--live' }, 'Une partie hors app à valider');
    if (l.soiree) return h('span', { class: 'alb-cover__note' }, 'Soirée : ' + soireeLabel(l.soiree.at));
    return h('span', { class: 'alb-cover__note' }, l.games.length && l.games[0].at ? `Dernier épisode le ${dateFmt.format(new Date(l.games[0].at))}` : 'Aucun épisode pour l’instant');
  };
  const create = () => go('/tournoi/nouveau');
  const draw = (all: League[] | null) => {
    list.replaceChildren(...(all === null ? [h('div', { class: 'card card--flat alb-eps__none' }, 'Les albums se jouent en ligne. Reviens quand tu es connecté.')]
      : all.length ? all.map((l, i) => {
        const live = liveGame(l, me);
        const cast = l.seats.filter(Boolean).map((u) => l.members[u]).filter(Boolean);
        return h('button', { class: 'alb-cover', type: 'button', style: { '--c': COVER_BG[i % COVER_BG.length] }, onclick: () => go(live ? '/salle/' + live.code : '/tournoi/' + l.code) },
          h('i', { class: 'rays' }),
          h('span', { class: 'tag' }, `${l.games.length} épisode${l.games.length > 1 ? 's' : ''} · ${l.n} joueurs`),
          h('span', { class: 'alb-cover__title' + (l.name.length > 16 ? ' alb-cover__title--long' : '') }, l.name),
          h('div', { class: 'alb-cover__cast' }, ...cast.map((m, k) => avatar(m.char, m.color, l.n === 4 ? 44 : 36, 'content', { flip: k % 2 === 1 }))),
          h('div', { class: 'alb-cover__score', 'aria-label': 'Victoires : ' + l.wins.map((w, t) => `${TEAM_NAMES[t]} ${w}`).join(', ') },
            ...l.wins.flatMap((w, t) => [...(t ? [h('i', null, '-')] : []), h('b', { style: { '--c': TEAM_BG[t] } }, w)])),
          note(l));
      })
        : [h('div', { class: 'card alb-empty' },
          tocSays('Un album, c’est ta bande et ses soirées : mêmes équipes à chaque partie, et les victoires s’additionnent.', 'content', 96),
          button('Créer un album', 'primary', create, { size: 'md', block: true }))]));
  };
  const code = h('input', {
    class: 'field', placeholder: 'Code (ex. T-4821)', 'aria-label': 'Code d’album',
    inputmode: 'text', autocapitalize: 'characters', enterkeyhint: 'go', style: { flex: 1, minWidth: 0 },
  }) as HTMLInputElement;
  const join = () => {
    const t = parseLeagueCode(code.value) ?? (/^\s*\d{4}\s*$/.test(code.value) ? code.value.trim() : null);
    if (!t) return toast('Le code d’un album ressemble à T-4821');
    go('/tournoi/' + t);
  };
  code.addEventListener('keydown', (e) => e.key === 'Enter' && join());
  // Un seul album : l'onglet l'ouvre directement, comme sur la maquette (sa liste reste accessible depuis sa page).
  let got = false;
  const first = (all: League[]) => {
    got = true;
    if (!showList && all.length === 1) {
      // Une fois cet écran posé (jamais pendant sa construction), et seulement si on est toujours sur l'onglet.
      const here = location.hash;
      setTimeout(() => {
        if (location.hash !== here) return;
        history.replaceState(null, '', '#/tournoi/' + all[0].code);
        window.dispatchEvent(new HashChangeEvent('hashchange'));
      }, 0);
    } else draw(all);
  };
  const stop = DEMO ? (first([DEMO_LEAGUE]), () => {}) : navigator.onLine ? watchMyLeagues((all) => (got ? draw(all) : first(all))) : (draw(null), () => {});
  // Sans réponse du réseau au bout d'un instant, on montre de quoi créer ou rejoindre un album.
  const wait = !DEMO && navigator.onLine ? window.setTimeout(() => { if (!got) draw([]); }, 700) : 0;
  const el = h('div', { class: 'screen screen--tabs albums', 'data-fit': 'tabs', 'data-tone': 'turq', style: { gap: 10, paddingTop: 'calc(var(--safe-top) + 6px)' } },
    h('div', { class: 'screen__head' }, h('span', { class: 't-screen', style: { marginRight: 'auto' } }, 'Tes albums'), button('Créer', 'dark', create, { size: 'xs' })),
    h('div', { class: 'scroll-y', style: { display: 'flex', flexDirection: 'column', gap: 14, margin: '0 -20px', padding: '6px 20px 12px' } },
      list,
      h('div', { class: 'alb-join' }, code, button('Rejoindre', 'dark', join, { size: 'md' }))),
    tabbar('albums'));
  return { el, cleanup: () => { clearTimeout(wait); stop(); } };
}

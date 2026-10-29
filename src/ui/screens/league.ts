// Tournois : création, page du tournoi (équipes fixes, score cumulé, dernières parties).
import {
  type League, type OfflineClaim, type Rsvp, answerSoiree, cancelSoiree, claimApproved, createLeague, deleteLeague, dropOffline,
  type LeagueMsg, leagueLink, leaveLeague, proposeOffline, proposeSoiree, refusedBy, sendLeagueMsg, settleOffline, takeLeagueSeat,
  voteOffline, watchLeague, watchLeagueChat,
} from '../../net/league';
import { type FriendView, currentUid, inviteToLeague, watchFriends } from '../../net/social';
import { h, toast } from '../dom';
import { COL, SEAT_COLORS, TEAM_NAMES } from '../kit/data';
import { avatarRing, backButton, button, duo, segmented } from '../kit/kit';
import { ROUTES, go } from '../nav';
import { savedMode } from './home';
import { variantsCard } from './rules';
import { DEFAULT_VARIANTS, type Variants } from '../../engine';

type View = { el: HTMLElement; cleanup: () => void };

const dateFmt = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short' });

const dayFmt = new Intl.DateTimeFormat('fr-FR', { weekday: 'long', day: 'numeric', month: 'short' });
const sameDay = (a: Date, b: Date) => a.toDateString() === b.toDateString();

/** « Ce soir · 20 h 30 », « Demain · 20 h », « Jeudi 31 oct. · 20 h 30 ». */
export function soireeLabel(at: number): string {
  const d = new Date(at), now = new Date(), tomorrow = new Date(now.getTime() + 86_400_000);
  const day = sameDay(d, now) ? (d.getHours() >= 17 ? 'Ce soir' : 'Aujourd’hui') : sameDay(d, tomorrow) ? 'Demain' : dayFmt.format(d);
  const m = d.getMinutes();
  return `${day.charAt(0).toUpperCase() + day.slice(1)} · ${d.getHours()} h${m ? ' ' + String(m).padStart(2, '0') : ''}`;
}

const ANSWERS: [Rsvp, string][] = [['oui', 'Je viens'], ['peut', 'Peut-être'], ['non', 'Je ne peux pas']];
const PILLS: Record<Rsvp | 'none', [string, string, string]> = {
  oui: ['Présent·e', '#d4f4eb', '#16705a'], peut: ['Peut-être', '#fff1c9', '#7a5600'],
  non: ['Absent·e', '#ffe3da', '#c9401f'], none: ['Pas encore répondu', 'rgba(255,255,255,.22)', '#fff'],
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
      h('span', { class: 'sheet__text' }, 'Les autres joueurs du tournoi la verront et pourront répondre.'),
      h('div', { style: { display: 'flex', gap: 8 } }, h('label', { style: { flex: 1.4, display: 'flex', flexDirection: 'column', gap: 6 } }, h('span', { class: 't-label' }, 'Date'), date),
        h('label', { style: { flex: 1, display: 'flex', flexDirection: 'column', gap: 6 } }, h('span', { class: 't-label' }, 'Heure'), time)),
      h('label', { style: { display: 'flex', flexDirection: 'column', gap: 6 } }, h('span', { class: 't-label' }, 'Lieu (facultatif)'), place),
      send,
      button('Annuler', 'text', close)));
  (document.getElementById('app') ?? document.body).append(wrap);
}

/** Carte « Prochaine soirée » du tournoi. */
function soireeCard(l: League, me: string): HTMLElement {
  const member = !!l.members[me];
  const s = l.soiree;
  if (!s)
    return h('div', { class: 'card', style: { padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 12 } },
      h('div', { style: { flex: 1, display: 'flex', flexDirection: 'column', gap: 2 } },
        h('span', { class: 't-label' }, 'Prochaine soirée'),
        h('span', { class: 't-body' }, 'Aucune soirée prévue.')),
      member && button('Proposer', 'primary', () => openSoireeSheet(l.code), { size: 'xs' }));
  const people = l.seats.filter(Boolean);
  const mine = s.rsvp[me];
  const yes = people.filter((u) => s.rsvp[u] === 'oui').length;
  return h('div', { class: 'hero hero--blue soiree' },
    h('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 } },
      h('span', { class: 'tag' }, 'PROCHAINE SOIRÉE'),
      h('span', { style: { font: '800 13px var(--text)' } }, `${yes} / ${people.length} présents`)),
    h('div', { style: { display: 'flex', flexDirection: 'column', gap: 2 } },
      h('span', { class: 'soiree__when' }, soireeLabel(s.at)),
      h('span', { style: { font: '700 13px var(--text)', opacity: 0.9 } },
        [s.place, l.members[s.by] ? `proposée par ${s.by === me ? 'toi' : l.members[s.by].name}` : ''].filter(Boolean).join(' · '))),
    h('div', { class: 'soiree__list' }, ...people.map((u) => {
      const m = l.members[u];
      const [label, bg, fg] = PILLS[s.rsvp[u] ?? 'none'];
      return h('div', { class: 'soiree__row' },
        avatarRing(m.char, m.color, 26, 'transparent', 2, 0, null),
        h('span', { class: 'soiree__name' }, u === me ? `${m.name} (toi)` : m.name),
        h('span', { class: 'soiree__pill', style: { background: bg, color: fg } }, label));
    })),
    member && h('div', { class: 'rsvp', role: 'group', 'aria-label': 'Ta réponse' }, ...ANSWERS.map(([v, label]) =>
      h('button', {
        type: 'button', 'aria-pressed': String(mine === v),
        onclick: () => answerSoiree(l.code, s.id, v).catch(() => toast('Réponse non enregistrée. Réessaie.')),
      }, label))),
    member && h('div', { style: { display: 'flex', justifyContent: 'center', gap: 6 } },
      h('button', { class: 'soiree__link', type: 'button', onclick: () => openSoireeSheet(l.code) }, 'Changer la date'),
      (s.by === me || l.host === me) && h('button', {
        class: 'soiree__link', type: 'button',
        onclick: () => cancelSoiree(l.code).then(() => toast('Soirée annulée.')).catch(() => toast('Annulation impossible.')),
      }, 'Annuler la soirée')));
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
      h('span', { class: 'sheet__text' }, 'Vous avez joué sur un vrai plateau ? La victoire comptera quand tous les joueurs du tournoi l’auront acceptée.'),
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
  const name = h('input', { class: 'field field--big', placeholder: 'Ex. Les voisins du 12', 'aria-label': 'Nom du tournoi', maxlength: 30, enterkeyhint: 'done' });
  const create = button('Créer le tournoi', 'primary', async () => {
    if (!navigator.onLine) return toast('Il faut du réseau pour créer un tournoi.');
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
  const el = h('div', { class: 'screen', style: { gap: 16, paddingTop: 'calc(var(--safe-top) + 8px)' } },
    h('div', { class: 'screen__head' },
      backButton(() => go(ROUTES.home)),
      h('span', { class: 't-title', style: { paddingTop: 3 } }, 'Nouveau tournoi')),
    h('p', { class: 't-body', style: { margin: 0 } },
      'Toujours les mêmes équipes, et les victoires s’additionnent de partie en partie. Idéal pour jouer entre voisins.'),
    h('label', { style: { display: 'flex', flexDirection: 'column', gap: 8 } }, h('span', { class: 't-label' }, 'Nom du tournoi'), name),
    h('div', { style: { display: 'flex', flexDirection: 'column', gap: 8 } }, h('span', { class: 't-label' }, 'Joueurs'),
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
      : [h('p', { class: 'empty' }, 'Personne n’a encore écrit. Lance la discussion !')]));
    const last = msgs[msgs.length - 1];
    if (last) markRead(l.code, last.at);
    requestAnimationFrame(() => { scroller.scrollTop = scroller.scrollHeight; });
  });
  const close = () => { stop(); wrap.remove(); onClose(); };
  const wrap = h('div', { class: 'sheet-wrap', onclick: (e: Event) => { if (e.target === wrap) close(); } },
    h('div', { class: 'sheet', role: 'dialog', 'aria-label': 'Discussion du tournoi' },
      h('div', { style: { display: 'flex', alignItems: 'center', gap: 8 } },
        h('span', { class: 'sheet__title', style: { flex: 1, minWidth: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' } }, l.name),
        button('Fermer', 'text', close)),
      scroller,
      h('div', { style: { display: 'flex', gap: 8 } }, input,
        h('button', { class: 'send', type: 'button', 'aria-label': 'Envoyer', onclick: () => send() }, h('i')))));
  (document.getElementById('app') ?? document.body).append(wrap);
}

/** Demande confirmation avant une action définitive (quitter, supprimer). */
function confirmSheet(title: string, text: string, label: string, action: () => Promise<void>) {
  const close = () => wrap.remove();
  const ok = button(label, 'danger', async () => {
    ok.disabled = true;
    try {
      await action();
      close();
    } catch {
      ok.disabled = false;
      toast('Impossible pour l’instant. Réessaie.');
    }
  }, { size: 'md', block: true });
  const wrap = h('div', { class: 'sheet-wrap', onclick: (e: Event) => { if (e.target === wrap) close(); } },
    h('div', { class: 'sheet', role: 'dialog', 'aria-label': title },
      h('span', { class: 'sheet__title' }, title),
      h('span', { class: 'sheet__text' }, text),
      ok,
      button('Annuler', 'text', close)));
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
        host ? 'Ta place se libère et un autre joueur devient le créateur du tournoi. Les victoires de ton équipe restent.'
          : 'Ta place se libère pour quelqu’un d’autre. Les victoires de ton équipe restent.',
        'Quitter le tournoi', async () => { await leaveLeague(l.code); go(ROUTES.home); toast('Tu as quitté le tournoi.'); }),
    }, 'Quitter le tournoi'),
    host && h('button', {
      class: 'link-btn link-btn--danger', type: 'button',
      onclick: () => confirmSheet(`Supprimer « ${l.name} » ?`,
        'Le tournoi disparaît pour tout le monde : scores, historique des parties et prochaine soirée. C’est définitif.',
        'Supprimer le tournoi', async () => { await deleteLeague(l.code); go(ROUTES.home); toast('Tournoi supprimé.'); }),
    }, 'Supprimer le tournoi'));
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
      : [h('span', { class: 't-body' }, friends.length ? 'Tous tes amis sont déjà dans ce tournoi.' : 'Ajoute des amis depuis l’onglet Amis : tu pourras les inviter d’ici.')]));
  };
  draw([]);
  const stop = full ? () => {} : watchFriends(draw);
  const close = () => { stop(); wrap.remove(); };
  const wrap = h('div', { class: 'sheet-wrap', onclick: (e: Event) => { if (e.target === wrap) close(); } },
    h('div', { class: 'sheet', role: 'dialog', 'aria-label': 'Inviter dans le tournoi' },
      h('span', { class: 'sheet__title' }, 'Inviter dans le tournoi'),
      h('span', { class: 'sheet__text' }, full ? 'Le tournoi est complet : le lien permet seulement de le suivre.' : 'Envoie le lien à qui tu veux, ou invite directement un ami de l’app.'),
      button('Partager le lien', 'primary', () => shareLeague(l), { size: 'md', block: true }),
      !full && h('span', { class: 't-label' }, 'Tes amis'),
      !full && h('div', { class: 'scroll-y', style: { maxHeight: '40vh' } }, list),
      button('Fermer', 'text', close)));
  (document.getElementById('app') ?? document.body).append(wrap);
}

async function shareLeague(l: League) {
  const url = leagueLink(l.code);
  const text = `Rejoins le tournoi « ${l.name} » sur TOC (code T-${l.code})`;
  try {
    if (navigator.share) return await navigator.share({ title: 'TOC', text, url });
    await navigator.clipboard.writeText(`${text} : ${url}`);
    toast('Lien copié, envoie-le aux joueurs !');
  } catch { /* partage annulé */ }
}

export function leagueScreen(code: string): View {
  const title = h('span', { class: 't-title', style: { flex: 1, minWidth: 0, paddingTop: 3, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' } }, 'Tournoi');
  const pill = h('span', { class: 'pill' });
  const codeVal = h('span', { style: { font: '800 26px/1.05 var(--display)', letterSpacing: '.06em' } }, 'T-' + code);
  const teams = h('div', { style: { display: 'flex', flexDirection: 'column', gap: 12 } });
  const soiree = h('div');
  const claims = h('div', { style: { display: 'flex', flexDirection: 'column', gap: 12 } });
  // Discussion : écoutée dès l'ouverture de la page (lecture refusée si on n'est pas membre : carte cachée).
  const chat = h('div');
  let msgs: LeagueMsg[] | null = null;
  const drawChat = () => {
    const l = league;
    const member = !!l?.members[currentUid()];
    // Devenu membre page ouverte : la lecture, refusée jusque-là, est relancée.
    if (member && msgs === null && !retried) {
      retried = true;
      stopChat();
      stopChat = watchLeagueChat(code, onMsgs);
    }
    chat.replaceChildren(...(l && msgs && member ? [chatCard(l, currentUid(), msgs, () => openChatSheet(l, currentUid(), drawChat))] : []));
  };
  let retried = false;
  const onMsgs = (m: LeagueMsg[] | null) => { msgs = m; drawChat(); };
  let stopChat = watchLeagueChat(code, onMsgs);
  const stats = h('div');
  const exit = h('div');
  // Déclarations acceptées par tous, en cours d'enregistrement (une seule fois par téléphone)
  const settling = new Set<string>();
  const hist = h('div', { class: 'card', style: { padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 8 } });
  // Déclaré avant la carte « Règles », qui lit le tournoi dès sa création.
  let league: League | null = null;
  const rules = variantsCard(() => league?.variants ?? DEFAULT_VARIANTS, () => false, () => undefined);
  const status = h('span', { class: 'status-line' });
  const play = button('Jouer une partie', 'primary', () => undefined, { size: 'lg', block: true });
  const invite = button('Inviter', 'dark', () => league && openInviteSheet(league), { size: 'sm' });

  const draw = (l: League | null) => {
    league = l;
    if (!l) {
      title.textContent = 'Tournoi introuvable';
      teams.replaceChildren(h('p', { class: 'empty' }, `Aucun tournoi T-${code}. Vérifie le code.`));
      hist.hidden = true;
      play.hidden = true;
      return;
    }
    const me = currentUid();
    const seated = l.seats.includes(me);
    const full = l.seats.every(Boolean);
    title.textContent = l.name;
    pill.textContent = `${l.n} joueurs`;
    teams.replaceChildren(...Array.from({ length: l.n / 2 }, (_, t) => {
      const seats = teamSeats(l.n, t);
      return h('div', { class: 'card card--lg', style: { display: 'flex', flexDirection: 'column', gap: 10 } },
        h('div', { style: { display: 'flex', alignItems: 'center', gap: 8 } },
          duo(SEAT_COLORS[l.n][seats[0]], SEAT_COLORS[l.n][seats[1]]),
          h('span', { style: { flex: 1, font: '800 17px/1 var(--display)', paddingTop: 2 } }, 'Équipe ' + TEAM_NAMES[t]),
          h('span', { style: { font: '800 30px/1 var(--display)', color: COL[SEAT_COLORS[l.n][seats[0]]].d }, 'aria-label': `${l.wins[t]} victoires` }, l.wins[t]),
          h('span', { style: { font: '800 12px var(--text)', color: 'var(--ink-2)', paddingTop: 6 } }, l.wins[t] > 1 ? 'victoires' : 'victoire')),
        h('div', { class: 'seat-grid' }, ...seats.map((k) => {
          const uid = l.seats[k], tint = COL[SEAT_COLORS[l.n][k]];
          const m = uid ? l.members[uid] : null;
          if (m)
            return h('div', { class: 'seat', style: { background: tint.l } },
              avatarRing(m.char, m.color, 38, tint.c, 3, 2, null),
              h('div', { style: { minWidth: 0, display: 'flex', flexDirection: 'column', gap: 1 } },
                h('span', { class: 'seat__name' }, m.name), h('span', { class: 'seat__tag' }, uid === me ? 'Toi' : uid === l.host ? 'Créateur' : 'Joueur')));
          // Place libre : on la prend (rejoindre, ou choisir son duo tant que le tournoi n'est pas complet).
          return h('button', {
            class: 'seat', type: 'button', style: { border: 'none', width: '100%', textAlign: 'left', cursor: 'pointer' },
            onclick: () => takeLeagueSeat(code, k).catch((e) => toast(e instanceof Error ? e.message : 'Place indisponible.')),
          },
            h('div', { class: 'seat__wait' }),
            h('div', { class: 'seat__invite' }, h('span', null, 'Place libre'), h('span', null, seated ? 'Changer de place' : 'Prendre la place')));
        })));
    }));
    hist.hidden = false;
    soiree.replaceChildren(soireeCard(l, me));
    stats.replaceChildren(statsCard(l));
    exit.replaceChildren(exitLinks(l, me));
    drawChat();
    // Une déclaration acceptée par tous devient une victoire ; n'importe quel joueur l'enregistre (sans doublon).
    for (const o of l.offline)
      if (seated && claimApproved(l, o) && !settling.has(o.id)) {
        settling.add(o.id);
        void settleOffline(code, o).catch(() => settling.delete(o.id));
      }
    claims.replaceChildren(...l.offline.filter((o) => !claimApproved(l, o)).map((o) => offlineCard(l, o, me)));
    rules.refresh();
    const canDeclare = seated && l.seats.filter(Boolean).length >= 2;
    hist.replaceChildren(
      h('div', { style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 } },
        h('span', { class: 't-label' }, 'Dernières parties'),
        canDeclare && h('button', { class: 'link-btn', type: 'button', onclick: () => openOfflineSheet(l) }, '+ Partie hors app')),
      ...(l.games.length
        ? l.games.slice(0, 4).map((g) => {
          const seats = teamSeats(l.n, g.winner);
          return h('div', { style: { display: 'flex', alignItems: 'center', gap: 10, font: '700 14px var(--text)' } },
            duo(SEAT_COLORS[l.n][seats[0]], SEAT_COLORS[l.n][seats[1]], 12),
            h('span', { style: { flex: 1 } }, `Victoire ${TEAM_NAMES[g.winner]}`, g.offline && h('span', { class: 'hist-tag' }, 'hors app')),
            h('span', { style: { color: 'var(--ink-3)', font: '800 12px var(--text)' } }, g.at ? dateFmt.format(new Date(g.at)) : ''));
        })
        : [h('span', { class: 't-body' }, 'Aucune partie pour l’instant.')]));
    const filled = l.seats.filter(Boolean).length;
    status.textContent = !full ? `${filled} / ${l.n} joueurs · partage le lien pour compléter`
      : seated ? 'Les équipes sont fixes. Bonne partie !' : 'Ce tournoi est complet.';
    play.hidden = !seated && full;
    play.disabled = !full || !seated;
    play.className = 'btn btn--lg btn--block ' + (full && seated ? 'btn--primary' : 'btn--off');
    play.textContent = full ? 'Jouer une partie' : 'En attente des joueurs…';
    play.onclick = () => go(`/salle/nouvelle?n=${l.n}&ligue=${code}`);
  };

  const stop = watchLeague(code, draw);
  // Le milieu (soirée, équipes, parties, règles) défile ; le bouton « Jouer une partie » reste en bas.
  const el = h('div', { class: 'screen', 'data-fit': 'tabs', style: { gap: 14, paddingTop: 'calc(var(--safe-top) + 8px)' } },
    h('div', { class: 'screen__head' }, backButton(() => go(ROUTES.home)), title, pill),
    h('div', { class: 'scroll-y', style: { display: 'flex', flexDirection: 'column', gap: 14, margin: '0 -20px', padding: '4px 20px 10px' } },
      h('div', { class: 'card', style: { display: 'flex', alignItems: 'center', gap: 12, padding: '14px 14px 14px 18px' } },
        h('div', { style: { flex: 1, display: 'flex', flexDirection: 'column', gap: 2 } }, h('span', { class: 't-mini' }, 'Code du tournoi'), codeVal),
        invite),
      soiree,
      claims,
      chat,
      teams,
      stats,
      hist,
      rules.el,
      exit),
    status,
    play);
  return { el, cleanup: () => { stop(); stopChat(); } };
}

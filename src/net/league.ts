// Tournois : une série de parties entre les mêmes joueurs, équipes fixes, victoires cumulées.
//   leagues/<code>          name, n, host, createdAt, seats/<place> = uid, members/<uid> = { name, char, color },
//                           wins/<équipe> = nombre de victoires, games/<partie> = { winner, at }
//                           soiree = { id, at, place, by } (prochaine soirée), rsvp/<soirée>/<uid> = oui | peut | non
//                           offline/<id> = { winner, by, at, playedAt, votes/<uid> = oui | non } (partie hors de l'app à valider)
//   myLeagues/<uid>/<code>  true (tournois dont on fait partie)
// L'équipe t réunit les places t et t + n/2, comme au jeu : les duos restent les mêmes de partie en partie.
import { get, onValue, ref, runTransaction, serverTimestamp, set, update } from 'firebase/database';
import { draftProfile } from '../app/profile';
import { DEFAULT_VARIANTS, type Variants, cryptoRng } from '../engine';
import type { CharId, ColorName } from '../ui/kit/data';
import { arr, database, ensureAuth, node } from './firebase';
import { notifyPlayers } from './push';

export interface LeagueMember {
  name: string;
  char: CharId;
  color: ColorName;
}

export interface LeagueGame {
  key: string;
  winner: number;
  at: number;
  /** Durée (ms), 0 si inconnue */
  duration: number;
  /** Par place du tournoi : billes adverses renvoyées, billes sorties */
  captures: number[];
  exits: number[];
  /** Partie jouée hors de l'app, validée par tous les joueurs */
  offline: boolean;
}

export type Vote = 'oui' | 'non';

/** Partie jouée hors de l'app : la victoire compte quand tous les joueurs du tournoi l'ont acceptée. */
export interface OfflineClaim {
  id: string;
  winner: number;
  by: string;
  /** Date de la déclaration et date de la partie (ms) */
  at: number;
  playedAt: number;
  votes: Record<string, Vote>;
}

export interface GameExtras {
  duration: number;
  captures: number[];
  exits: number[];
}

export interface League {
  code: string;
  name: string;
  n: 4 | 6;
  host: string;
  /** Une entrée par place ; '' = libre. */
  seats: string[];
  members: Record<string, LeagueMember>;
  /** Victoires par équipe */
  wins: number[];
  /** Parties, de la plus récente à la plus ancienne */
  games: LeagueGame[];
  /** Règles de toutes les parties du tournoi */
  variants: Variants;
  /** Prochaine soirée prévue (null s'il n'y en a pas, ou si elle est passée) */
  soiree: Soiree | null;
  /** Parties hors de l'app en attente de validation, de la plus ancienne à la plus récente */
  offline: OfflineClaim[];
}

export type Rsvp = 'oui' | 'peut' | 'non';

export interface Soiree {
  id: string;
  /** Date et heure (ms) */
  at: number;
  place: string;
  by: string;
  /** Réponse de chaque membre */
  rsvp: Record<string, Rsvp>;
}

/** Une soirée reste affichée jusqu'à 4 h après son début. */
const SOIREE_GRACE_MS = 4 * 3600_000;

const me = (): LeagueMember => {
  const p = draftProfile();
  return { name: (p.nick || 'Toi').slice(0, 20), char: p.char, color: p.color };
};

function normalize(code: string, raw: Record<string, unknown> | null): League | null {
  if (!raw?.name) return null;
  const n = (raw.n as number) === 6 ? 6 : 4;
  const games = Object.entries((raw.games ?? {}) as Record<string, { winner: number; at: number; duration?: number; captures?: unknown; exits?: unknown; offline?: boolean }>)
    .map(([key, g]) => ({
      key, winner: g.winner, at: g.at ?? 0, duration: g.duration ?? 0,
      captures: arr<number>(g.captures, n, () => 0), exits: arr<number>(g.exits, n, () => 0), offline: !!g.offline,
    }))
    .sort((a, b) => b.at - a.at);
  return {
    code, name: raw.name as string, n, host: raw.host as string,
    seats: arr<string>(raw.seats, n, () => ''),
    members: (raw.members ?? {}) as Record<string, LeagueMember>,
    wins: arr<number>(raw.wins, n / 2, () => 0),
    games,
    variants: { ...DEFAULT_VARIANTS, ...(raw.variants as Partial<Variants>) },
    soiree: normalizeSoiree(raw),
    offline: normalizeOffline(raw),
  };
}

/** Une déclaration refusée reste affichée 2 jours, le temps que chacun le voie. */
const REFUSED_SHOWN_MS = 2 * 86_400_000;

function normalizeOffline(raw: Record<string, unknown>): OfflineClaim[] {
  return Object.entries((raw.offline ?? {}) as Record<string, Partial<OfflineClaim>>)
    .filter(([, o]) => typeof o.winner === 'number' && !!o.by)
    .map(([id, o]) => ({ id, winner: o.winner!, by: o.by!, at: o.at ?? 0, playedAt: o.playedAt ?? o.at ?? 0, votes: o.votes ?? {} }))
    .filter((o) => !refusedBy(o).length || o.at > Date.now() - REFUSED_SHOWN_MS)
    .sort((a, b) => a.at - b.at);
}

/** Joueurs qui ont refusé la déclaration (un seul suffit à l'annuler). */
export const refusedBy = (o: OfflineClaim) => Object.keys(o.votes).filter((u) => o.votes[u] === 'non');

/** Tous les joueurs assis dans le tournoi ont accepté. */
export function claimApproved(l: League, o: OfflineClaim) {
  const voters = l.seats.filter(Boolean);
  return voters.length >= 2 && voters.every((u) => o.votes[u] === 'oui');
}

/** Déclare une partie jouée hors de l'app ; son auteur l'accepte d'office. */
export async function proposeOffline(code: string, winner: number, playedAt: number) {
  const uid = await ensureAuth();
  const id = 'o' + Date.now().toString(36);
  await set(node('leagues', code, 'offline', id), { winner, by: uid, at: Date.now(), playedAt, votes: { [uid]: 'oui' } });
  void notifyOthers(code, uid, 'offline');
}

export async function voteOffline(code: string, id: string, vote: Vote) {
  const uid = await ensureAuth();
  await set(node('leagues', code, 'offline', id, 'votes', uid), vote);
}

/** Annule une déclaration en attente, ou retire une déclaration refusée. */
export async function dropOffline(code: string, id: string) {
  await set(node('leagues', code, 'offline', id), null);
}

/** Tout le monde a accepté : la victoire entre dans le tournoi (une seule fois), puis la déclaration disparaît. */
export async function settleOffline(code: string, o: OfflineClaim) {
  await recordLeagueGame(code, 'hors-' + o.id, o.winner, { at: o.playedAt, offline: true });
  await set(node('leagues', code, 'offline', o.id), null);
}

function normalizeSoiree(raw: Record<string, unknown>): Soiree | null {
  const s = raw.soiree as { id?: string; at?: number; place?: string; by?: string } | undefined;
  if (!s?.id || !s.at || s.at < Date.now() - SOIREE_GRACE_MS) return null;
  const rsvp = ((raw.rsvp as Record<string, Record<string, Rsvp>> | undefined)?.[s.id] ?? {});
  return { id: s.id, at: s.at, place: s.place ?? '', by: s.by ?? '', rsvp };
}

/** Propose la prochaine soirée du tournoi (remplace la précédente). Son auteur y va, forcément. */
export async function proposeSoiree(code: string, at: number, place: string) {
  const uid = await ensureAuth();
  const id = 's' + Date.now().toString(36);
  await update(node('leagues', code), {
    soiree: { id, at, place: place.trim().slice(0, 40), by: uid },
    [`rsvp/${id}/${uid}`]: 'oui',
  });
  void notifyOthers(code, uid, 'soiree');
}

/** Prévient les autres joueurs du tournoi (le service n'envoie qu'à ceux qui n'ont pas l'app sous les yeux). */
async function notifyOthers(code: string, uid: string, kind: 'soiree' | 'offline') {
  const l = await getLeagueOnce(code).catch(() => null);
  if (l) notifyPlayers(l.seats.filter((u) => u && u !== uid), kind, { code });
}

export async function cancelSoiree(code: string) {
  await set(node('leagues', code, 'soiree'), null);
}

export async function answerSoiree(code: string, id: string, answer: Rsvp) {
  const uid = await ensureAuth();
  await set(node('leagues', code, 'rsvp', id, uid), answer);
}

/** Code du tournoi saisi (« T-4821 », « t4821 ») ramené à ses 4 chiffres. */
export function parseLeagueCode(raw: string): string | null {
  const m = /^\s*t[\s-]*(\d{4})\s*$/i.exec(raw);
  return m ? m[1] : null;
}

export const leagueLink = (code: string) => `${location.origin}${location.pathname}?t=${code}`;

/** Crée un tournoi : l'auteur prend la première place. */
export async function createLeague(name: string, n: 4 | 6, variants: Variants = DEFAULT_VARIANTS): Promise<string> {
  const uid = await ensureAuth();
  for (let k = 0; k < 20; k++) {
    const code = String(1000 + Math.floor(cryptoRng() * 9000));
    const res = await runTransaction(node('leagues', code, 'name'), (cur) => (cur ? undefined : name.trim().slice(0, 30) || 'Notre tournoi'));
    if (!res.committed) continue;
    await update(node('leagues', code), { n, host: uid, createdAt: serverTimestamp(), variants, [`members/${uid}`]: me(), 'seats/0': uid });
    await set(node('myLeagues', uid, code), true);
    return code;
  }
  throw new Error('Impossible de créer le tournoi, réessaie.');
}

/** Prend une place libre (rejoindre le tournoi, ou changer de place tant qu'il n'est pas complet). */
export async function takeLeagueSeat(code: string, seat: number) {
  const uid = await ensureAuth();
  const l = normalize(code, (await get(node('leagues', code))).val());
  if (!l) throw new Error('Ce tournoi n’existe plus.');
  if (l.seats.every(Boolean) && !l.seats.includes(uid)) throw new Error('Ce tournoi est complet.');
  await set(node('leagues', code, 'members', uid), me());
  const res = await runTransaction(node('leagues', code, 'seats', seat), (cur) => (cur ? undefined : uid));
  if (!res.committed) throw new Error('Cette place vient d’être prise.');
  const old = l.seats.indexOf(uid);
  if (old >= 0 && old !== seat) await set(node('leagues', code, 'seats', old), null);
  // Les membres d'un tournoi deviennent amis : invitations et chat possibles.
  const friends: Record<string, boolean> = {};
  for (const other of Object.keys(l.members)) if (other !== uid) Object.assign(friends, { [`${uid}/${other}`]: true, [`${other}/${uid}`]: true });
  if (Object.keys(friends).length) await update(node('friends'), friends).catch(() => undefined);
  await set(node('myLeagues', uid, code), true);
}

/**
 * Quitte le tournoi : ta place se libère (les victoires de ton équipe restent).
 * Le créateur qui s'en va passe la main au premier autre joueur ; seul, il supprime le tournoi.
 */
export async function leaveLeague(code: string) {
  const uid = await ensureAuth();
  const l = await getLeagueOnce(code);
  if (!l) return;
  const others = l.seats.filter((u) => u && u !== uid);
  if (l.host === uid) {
    if (!others.length) return deleteLeague(code);
    await set(node('leagues', code, 'host'), others[0]);
  }
  const seat = l.seats.indexOf(uid);
  await update(ref(database()), {
    [`v2/leagues/${code}/members/${uid}`]: null,
    [`v2/myLeagues/${uid}/${code}`]: null,
    ...(seat >= 0 ? { [`v2/leagues/${code}/seats/${seat}`]: null } : {}),
  });
}

/** Supprime le tournoi pour tout le monde (son créateur seulement) : scores, historique, soirée. */
export async function deleteLeague(code: string) {
  const uid = await ensureAuth();
  await update(ref(database()), { [`v2/leagues/${code}`]: null, [`v2/myLeagues/${uid}/${code}`]: null });
}

export async function getLeagueOnce(code: string): Promise<League | null> {
  return normalize(code, (await get(node('leagues', code))).val());
}

export function watchLeague(code: string, cb: (l: League | null) => void): () => void {
  // On attend la connexion : sans elle, la lecture est refusée (nouveau joueur arrivé par le lien).
  let off = () => {};
  let stopped = false;
  void ensureAuth().then(() => {
    if (!stopped) off = onValue(node('leagues', code), (s) => cb(normalize(code, s.val())), () => cb(null));
  }).catch(() => cb(null));
  return () => { stopped = true; off(); };
}

/** Mes tournois (mis à jour en direct). */
export function watchMyLeagues(cb: (list: League[]) => void): () => void {
  const per = new Map<string, () => void>();
  const data = new Map<string, League>();
  let off = () => {};
  const emit = () => cb([...data.values()].sort((a, b) => (b.games[0]?.at ?? 0) - (a.games[0]?.at ?? 0)));
  void ensureAuth().catch(() => '').then((uid) => {
    if (!uid) return;
    off = onValue(node('myLeagues', uid), (s) => {
      const codes = Object.keys(s.val() ?? {});
      for (const c of codes) {
        if (per.has(c)) continue;
        per.set(c, watchLeague(c, (l) => { if (l) data.set(c, l); else data.delete(c); emit(); }));
      }
      emit();
    });
  });
  return () => { off(); per.forEach((f) => f()); };
}

/** Résultat d'une partie du tournoi : compté une seule fois, même si tous les téléphones l'envoient. */
export async function recordLeagueGame(code: string, key: string, winner: number, extras?: GameExtras | { at: number; offline: true }) {
  const res = await runTransaction(node('leagues', code, 'games', key), (cur) => (cur ? undefined : { winner, at: Date.now(), ...extras }));
  if (!res.committed) return;
  await runTransaction(node('leagues', code, 'wins', winner), (cur) => (Number(cur) || 0) + 1);
}

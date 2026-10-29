// Social en ligne (sous v2/) : profil public, code ami, amis, présence, invitations, chat d'équipe,
// classement et inscription au tournoi. Chaque joueur n'écrit que ses propres données.
//   users/<uid>            profil public (surnom, perso, couleur, XP, jetons, points, ville, au Québec)
//   codes/<CODE>           uid du propriétaire du code ami
//   friends/<uid>/<ami>    true (les deux côtés sont écrits à l'ajout)
//   status/<uid>           { state: online | game | offline, at }
//   invites/<uid>/<de>     { code, name, at }
//   chats/<a_b>/msgs/<id>  { from, t, at } ; chats/<a_b>/typing/<uid> = true
//   cups/<semaine>/<uid>   true
import {
  get, limitToLast, onDisconnect, onValue, orderByChild, push, query, ref, remove, serverTimestamp, set, update,
} from 'firebase/database';
import { type Profile, draftProfile, getProfile, saveProfile } from '../app/profile';
import type { CharId, ColorName } from '../ui/kit/data';
import { database, ensureAuth, node, serverNow } from './firebase';

export interface PublicProfile {
  nick: string;
  char: CharId;
  color: ColorName;
  xp: number;
  tokens: number;
  points: number;
  city: string;
  qc: boolean;
  code: string;
}

export type Presence = 'on' | 'game' | 'off';

export interface FriendView {
  uid: string;
  name: string;
  char: CharId;
  color: ColorName;
  presence: Presence;
  status: string;
}

export interface ChatLine {
  from: string;
  t: string;
  at: number;
}

let myUid = '';
const uid = async () => (myUid ||= await ensureAuth());
export const currentUid = () => myUid;

const codeKey = (code: string) => code.replace('#', '-');

/** Envoie le profil public et réserve le code ami (une seule fois). */
export async function syncProfile(p: Profile = draftProfile()) {
  const me = await uid();
  // Profil créé avant les codes amis : on lui en donne un.
  if (!p.friendCode && getProfile()) p = saveProfile(p);
  if (p.friendCode) {
    const k = codeKey(p.friendCode);
    const owner = (await get(node('codes', k))).val();
    if (owner && owner !== me) {
      // Code déjà pris par quelqu'un d'autre : on en tire un nouveau.
      p = saveProfile({ ...p, friendCode: undefined });
      return syncProfile(p);
    }
    if (!owner) await set(node('codes', k), me);
  }
  await update(node('users', me), {
    nick: p.nick, char: p.char, color: p.color, xp: p.xp, tokens: p.tokens, points: p.points ?? 0,
    city: p.city ?? '', qc: !!p.qc, code: p.friendCode ?? '', updatedAt: serverTimestamp(),
  });
}

/** Présence globale : en ligne tant que l'app est ouverte, « en partie » pendant une partie. */
export async function startPresence() {
  const me = await uid();
  const mine = node('status', me);
  onValue(ref(database(), '.info/connected'), (s) => {
    if (s.val() !== true) return;
    onDisconnect(mine).set({ state: 'offline', at: serverTimestamp() });
    set(mine, { state: inGame ? 'game' : 'online', at: serverTimestamp() });
  });
}
let inGame = false;
export async function setInGame(on: boolean) {
  inGame = on;
  const me = await uid();
  await set(node('status', me), { state: on ? 'game' : 'online', at: serverTimestamp() }).catch(() => undefined);
}

function ago(at: number) {
  const m = Math.max(0, Math.round((serverNow() - at) / 60000));
  if (m < 2) return 'Vu·e à l’instant';
  if (m < 60) return `Vu·e il y a ${m} min`;
  const h = Math.round(m / 60);
  if (h < 24) return `Vu·e il y a ${h} h`;
  const d = Math.round(h / 24);
  return d === 1 ? 'Vu·e hier' : `Vu·e il y a ${d} jours`;
}

/** Ajoute un ami par son code (ex. FREDO#2741). Renvoie son surnom. */
export async function addFriend(raw: string): Promise<string> {
  const me = await uid();
  const code = raw.trim().toUpperCase().replace(/\s+/g, '');
  if (!/^[A-Z]+[#-]\d{4}$/.test(code)) throw new Error('Un code ami ressemble à FREDO#2741.');
  const other = (await get(node('codes', codeKey(code)))).val() as string | null;
  if (!other) throw new Error('Aucun joueur avec ce code.');
  if (other === me) throw new Error('C’est ton propre code !');
  await update(node('friends'), { [`${me}/${other}`]: true, [`${other}/${me}`]: true });
  const p = (await get(node('users', other))).val() as PublicProfile | null;
  return p?.nick ?? 'Ton ami';
}

/** Liste d'amis avec leur présence, mise à jour en direct. */
export function watchFriends(cb: (list: FriendView[]) => void): () => void {
  const offs: (() => void)[] = [];
  const per = new Map<string, () => void>();
  const profiles = new Map<string, PublicProfile>();
  const statuses = new Map<string, { state: string; at: number }>();
  let ids: string[] = [];
  const emit = () => cb(ids.filter((f) => profiles.has(f)).map((f) => {
    const p = profiles.get(f)!, s = statuses.get(f);
    const presence: Presence = s?.state === 'game' ? 'game' : s?.state === 'online' ? 'on' : 'off';
    return {
      uid: f, name: p.nick, char: p.char, color: p.color, presence,
      status: presence === 'game' ? 'En partie' : presence === 'on' ? 'En ligne' : s ? ago(s.at) : 'Hors ligne',
    };
  }).sort((a, b) => a.name.localeCompare(b.name, 'fr')));
  void uid().catch(() => '').then((me) => {
    if (!me) return;
    offs.push(onValue(node('friends', me), (snap) => {
      ids = Object.keys(snap.val() ?? {});
      for (const f of ids) {
        if (per.has(f)) continue;
        const a = onValue(node('users', f), (s) => { if (s.val()) profiles.set(f, s.val()); emit(); });
        const b = onValue(node('status', f), (s) => { if (s.val()) statuses.set(f, s.val()); emit(); });
        per.set(f, () => { a(); b(); });
      }
      emit();
    }));
  });
  return () => { offs.forEach((f) => f()); per.forEach((f) => f()); };
}

/** Invite un ami dans sa salle. */
export async function inviteFriend(friend: string, code: string) {
  const me = await uid();
  await set(node('invites', friend, me), { code, name: draftProfile().nick || 'Un ami', at: serverTimestamp() });
}

/** Invitations reçues (les plus récentes, de moins de 10 minutes). */
export function watchInvites(cb: (inv: { from: string; name: string; code: string }) => void): () => void {
  let off = () => {};
  void uid().catch(() => '').then((me) => {
    if (!me) return;
    off = onValue(node('invites', me), (snap) => {
      const all = (snap.val() ?? {}) as Record<string, { code: string; name: string; at: number }>;
      for (const [from, v] of Object.entries(all)) {
        remove(node('invites', me, from)).catch(() => undefined);
        if (serverNow() - v.at < 10 * 60_000) cb({ from, name: v.name, code: v.code });
      }
    });
  });
  return () => off();
}

// ---------- Chat d'équipe ----------

export const chatKey = (a: string, b: string) => [a, b].sort().join('_');

export function watchChat(other: string, cb: (lines: ChatLine[], typing: boolean) => void): () => void {
  let offs: (() => void)[] = [];
  let lines: ChatLine[] = [];
  let typing = false;
  void uid().catch(() => '').then((me) => {
    if (!me) return;
    const k = chatKey(me, other);
    offs = [
      onValue(query(node('chats', k, 'msgs'), limitToLast(60)), (s) => {
        lines = Object.values((s.val() ?? {}) as Record<string, ChatLine>).sort((x, y) => x.at - y.at);
        cb(lines, typing);
      }),
      onValue(node('chats', k, 'typing', other), (s) => { typing = s.val() === true; cb(lines, typing); }),
    ];
  });
  return () => offs.forEach((f) => f());
}

export async function sendChat(other: string, t: string) {
  const me = await uid();
  const k = chatKey(me, other);
  await push(node('chats', k, 'msgs'), { from: me, t: t.slice(0, 300), at: serverTimestamp() });
  await set(node('chats', k, 'typing', me), false).catch(() => undefined);
}

export async function setTyping(other: string, on: boolean) {
  const me = await uid();
  const r = node('chats', chatKey(me, other), 'typing', me);
  if (on) onDisconnect(r).set(false);
  await set(r, on).catch(() => undefined);
}

// ---------- Classement ----------

export interface RankEntry extends PublicProfile {
  uid: string;
}

/** Meilleurs joueurs (points), du plus fort au plus faible. */
export async function topPlayers(limit = 100): Promise<RankEntry[]> {
  const snap = await get(query(node('users'), orderByChild('points'), limitToLast(limit)));
  const out: RankEntry[] = [];
  snap.forEach((c) => { out.push({ uid: c.key!, ...(c.val() as PublicProfile) }); });
  return out.filter((p) => (p.points ?? 0) > 0).sort((a, b) => b.points - a.points);
}

export async function friendIds(): Promise<string[]> {
  const me = await uid();
  return Object.keys((await get(node('friends', me))).val() ?? {});
}

/** Gains de fin de partie en ligne (une fois par partie). */
export async function awardGame(key: string, won: boolean) {
  const p = getProfile();
  if (!p) return;
  try {
    if (localStorage.getItem('toc.awarded') === key) return;
    localStorage.setItem('toc.awarded', key);
  } catch { /* sans stockage, on accorde quand même */ }
  saveProfile({
    xp: p.xp + (won ? 150 : 60),
    tokens: p.tokens + (won ? 100 : 20),
    points: Math.max(0, (p.points ?? 0) + (won ? 30 : 5)),
  });
  await syncProfile().catch(() => undefined);
}

// ---------- Tournoi ----------

/** Clé de la Coupe du Vendredi visée (date du vendredi). */
export function cupKey(friday: Date) {
  return friday.toISOString().slice(0, 10);
}

export function watchCup(key: string, cb: (count: number, mine: boolean) => void): () => void {
  let off = () => {};
  void uid().catch(() => '').then((me) => {
    if (!me) return;
    off = onValue(node('cups', key), (s) => {
      const v = (s.val() ?? {}) as Record<string, boolean>;
      cb(Object.keys(v).length, !!v[me]);
    });
  });
  return () => off();
}

export async function setCup(key: string, on: boolean) {
  const me = await uid();
  await set(node('cups', key, me), on ? true : null);
}

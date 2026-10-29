// Notifications de TOC : un Worker Cloudflare (offre gratuite).
//   POST /subscribe    { sub }             garde l'abonnement Web Push de ce téléphone (KV « s:<uid> »)
//   POST /unsubscribe  { endpoint }        l'oublie
//   POST /notify       { to, kind, code?, text? }  prévient des joueurs
// Chaque appel porte le jeton Firebase du joueur : le Worker lit la base avec ses droits à lui, et
// n'envoie qu'entre amis ou membres d'une même salle ou d'un même tournoi, à quelqu'un qui n'a pas
// l'app sous les yeux. Les textes sont écrits ici (seul le chat transmet le message tapé).
import { type PushSub, type Vapid, b64u, sendPush } from './webpush';

interface KV {
  get(key: string): Promise<string | null>;
  put(key: string, value: string): Promise<void>;
  delete(key: string): Promise<void>;
}

interface Env {
  SUBS: KV;
  VAPID_PUBLIC: string;
  VAPID_PRIVATE: string;
  SUBJECT: string;
  DB_URL: string;
  APP_URL: string;
}

type Kind = 'invite' | 'league' | 'turn' | 'chat' | 'soiree' | 'offline';
const KINDS: Kind[] = ['invite', 'league', 'turn', 'chat', 'soiree', 'offline'];
const ORIGINS = ['https://mallorytaton.github.io', 'http://localhost:5180', 'http://localhost:4173'];
const TEAM_NAMES = ['Soleil', 'Myrtilles', 'Framboises'];
const MAX_DEVICES = 5;

const cors = (origin: string | null) => ({
  'Access-Control-Allow-Origin': origin && ORIGINS.includes(origin) ? origin : ORIGINS[0],
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Authorization, Content-Type',
  'Access-Control-Max-Age': '86400',
  Vary: 'Origin',
});

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const origin = req.headers.get('Origin');
    const reply = (status: number, body: unknown = { ok: status < 300 }) =>
      new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...cors(origin) } });
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors(origin) });
    if (req.method !== 'POST') return reply(405);
    const db = new Db(env.DB_URL, (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, ''));
    const me = await db.whoAmI();
    if (!me) return reply(401);
    let body: Record<string, unknown>;
    try {
      body = await req.json();
    } catch {
      return reply(400);
    }
    switch (new URL(req.url).pathname) {
      case '/subscribe': return reply(await subscribe(env, me, body.sub as PushSub));
      case '/unsubscribe': return reply(await unsubscribe(env, me, String(body.endpoint ?? '')));
      case '/notify': return reply(200, await notify(env, db, me, body));
      default: return reply(404);
    }
  },
};

/** Lecture de la base Firebase avec les droits du joueur qui appelle (son jeton). */
class Db {
  constructor(private url: string, private token: string) {}

  /** undefined : lecture refusée (jeton invalide ou pas le droit) ; null : rien à cet endroit. */
  async get<T>(path: string, shallow = false): Promise<T | null | undefined> {
    const r = await fetch(`${this.url}/v2/${path}.json?auth=${encodeURIComponent(this.token)}${shallow ? '&shallow=true' : ''}`);
    if (!r.ok) return undefined;
    return (await r.json()) as T | null;
  }

  /** Le joueur du jeton : l'uid lu dans le jeton, confirmé par une lecture que lui seul a le droit de faire. */
  async whoAmI(): Promise<string | null> {
    let uid = '';
    try {
      const claims = JSON.parse(new TextDecoder().decode(b64u.decode(this.token.split('.')[1] ?? '')));
      uid = String(claims.user_id ?? claims.sub ?? '');
    } catch {
      return null;
    }
    if (!/^[\w-]{6,128}$/.test(uid)) return null;
    return (await this.get(`friends/${uid}`, true)) === undefined ? null : uid;
  }
}

// ---------- Abonnements ----------

const subsOf = async (env: Env, uid: string): Promise<PushSub[]> => JSON.parse((await env.SUBS.get('s:' + uid)) ?? '[]');

const endpointKey = async (endpoint: string) =>
  'e:' + b64u.encode(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(endpoint)));

async function subscribe(env: Env, me: string, s: PushSub | undefined) {
  if (typeof s?.endpoint !== 'string' || !s.endpoint.startsWith('https://') || s.endpoint.length > 800) return 400;
  if (typeof s.keys?.p256dh !== 'string' || typeof s.keys?.auth !== 'string') return 400;
  const sub: PushSub = { endpoint: s.endpoint, keys: { p256dh: s.keys.p256dh, auth: s.keys.auth } };
  // Un téléphone ne reçoit que les messages de son joueur actuel (changement de compte Google).
  const ek = await endpointKey(sub.endpoint);
  const before = await env.SUBS.get(ek);
  if (before && before !== me) {
    const old = (await subsOf(env, before)).filter((x) => x.endpoint !== sub.endpoint);
    await env.SUBS.put('s:' + before, JSON.stringify(old));
  }
  const list = (await subsOf(env, me)).filter((x) => x.endpoint !== sub.endpoint);
  await env.SUBS.put('s:' + me, JSON.stringify([sub, ...list].slice(0, MAX_DEVICES)));
  if (before !== me) await env.SUBS.put(ek, me);
  return 200;
}

async function unsubscribe(env: Env, me: string, endpoint: string) {
  const list = await subsOf(env, me);
  const next = list.filter((x) => x.endpoint !== endpoint);
  if (next.length !== list.length) await env.SUBS.put('s:' + me, JSON.stringify(next));
  if ((await env.SUBS.get(await endpointKey(endpoint))) === me) await env.SUBS.delete(await endpointKey(endpoint));
  return 200;
}

// ---------- Envoi ----------

interface Message {
  title: string;
  body: string;
  url: string;
  tag: string;
  /** Faire sonner à nouveau quand un message du même sujet remplace le précédent */
  renotify: boolean;
  ttl: number;
  urgency: 'normal' | 'high';
}

interface League {
  name?: string;
  members?: Record<string, unknown>;
  soiree?: { at?: number; place?: string; by?: string };
  offline?: Record<string, { winner?: number; by?: string; at?: number }>;
}

const whenFmt = new Intl.DateTimeFormat('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', hour: 'numeric', minute: '2-digit', timeZone: 'Europe/Paris' });

async function notify(env: Env, db: Db, me: string, b: Record<string, unknown>) {
  const kind = b.kind as Kind;
  const to = [...new Set((Array.isArray(b.to) ? b.to : []).filter((u): u is string => typeof u === 'string' && /^[\w-]{6,128}$/.test(u) && u !== me))].slice(0, 8);
  const code = typeof b.code === 'string' && /^\d{4}$/.test(b.code) ? b.code : '';
  if (!to.length || !KINDS.includes(kind)) return { sent: 0 };
  const name = ((await db.get<string>(`users/${me}/nick`)) || 'Un ami').slice(0, 20);
  const app = env.APP_URL;
  let allowed: (u: string) => Promise<boolean> | boolean;
  let msg: Message;
  if (kind === 'invite' || kind === 'chat') {
    allowed = async (u) => (await db.get(`friends/${me}/${u}`)) === true;
    if (kind === 'invite') {
      if (!code) return { sent: 0 };
      msg = { title: `${name} t’invite à jouer`, body: `Touche pour rejoindre la salle TOC-${code}.`, url: `${app}?g=${code}`, tag: `invite-${code}`, renotify: true, ttl: 900, urgency: 'high' };
    } else {
      const text = String(b.text ?? '').trim().slice(0, 140);
      if (!text) return { sent: 0 };
      msg = { title: name, body: text, url: `${app}#/amis`, tag: `chat-${me}`, renotify: true, ttl: 43_200, urgency: 'normal' };
    }
  } else if (kind === 'turn') {
    if (!code) return { sent: 0 };
    const seats = Object.values((await db.get<Record<string, string>>(`rooms/${code}/seats`)) ?? {});
    if (!seats.includes(me)) return { sent: 0 };
    allowed = (u) => seats.includes(u);
    msg = { title: 'C’est ton tour !', body: `Ta partie TOC-${code} t’attend.`, url: `${app}?g=${code}`, tag: `turn-${code}`, renotify: false, ttl: 120, urgency: 'high' };
  } else {
    if (!code) return { sent: 0 };
    const l = await db.get<League>(`leagues/${code}`);
    if (!l?.members?.[me]) return { sent: 0 };
    const league = (l.name ?? 'votre tournoi').slice(0, 30);
    // Inviter dans un tournoi : un ami, pas encore membre ; sinon, entre membres du tournoi.
    allowed = kind === 'league' ? async (u) => (await db.get(`friends/${me}/${u}`)) === true : (u) => !!l.members?.[u];
    if (kind === 'league') {
      msg = {
        title: `${name} t’invite dans un tournoi`, body: `Rejoins « ${league} » : mêmes équipes à chaque partie, et les victoires s’additionnent.`,
        url: `${app}?t=${code}`, tag: `league-${code}`, renotify: true, ttl: 7 * 86_400, urgency: 'normal',
      };
    } else if (kind === 'soiree') {
      if (!l.soiree?.at) return { sent: 0 };
      const place = (l.soiree.place ?? '').slice(0, 40);
      msg = {
        title: `Soirée TOC · ${league}`, body: `${name} propose ${whenFmt.format(new Date(l.soiree.at))}${place ? ', ' + place : ''}. Tu viens ?`,
        url: `${app}?t=${code}`, tag: `soiree-${code}`, renotify: true, ttl: 86_400, urgency: 'normal',
      };
    } else {
      const claim = Object.values(l.offline ?? {}).filter((o) => o.by === me).sort((x, y) => (y.at ?? 0) - (x.at ?? 0))[0];
      if (!claim) return { sent: 0 };
      msg = {
        title: 'Partie hors app à valider', body: `${name} déclare une victoire ${TEAM_NAMES[claim.winner ?? 0] ?? ''} dans « ${league} ». Tu confirmes ?`,
        url: `${app}?t=${code}`, tag: `offline-${code}`, renotify: true, ttl: 3 * 86_400, urgency: 'normal',
      };
    }
  }
  const vapid: Vapid = { publicKey: env.VAPID_PUBLIC, privateKey: env.VAPID_PRIVATE, subject: env.SUBJECT };
  let sent = 0, tried = 0;
  for (const u of to) {
    // Journal (visible avec « wrangler tail ») : pourquoi un message part ou non.
    if (!(await allowed(u))) { console.log(kind, 'refusé : pas de lien avec', u); continue; }
    if (await looking(db, u)) { console.log(kind, 'inutile : app ouverte chez', u); continue; }
    const subs = await subsOf(env, u);
    if (!subs.length) console.log(kind, 'aucun téléphone abonné pour', u);
    const dead: string[] = [];
    for (const s of subs) {
      tried++;
      const status = await sendPush(s, { title: msg.title, body: msg.body, url: msg.url, tag: msg.tag, renotify: msg.renotify }, vapid,
        { ttl: msg.ttl, urgency: msg.urgency, topic: msg.tag.replace(/[^\w-]/g, '').slice(0, 32) })
        .catch((e) => { console.log(kind, 'échec d’envoi :', String(e)); return 0; });
      console.log(kind, 'envoyé à', new URL(s.endpoint).host, '→', status);
      if (status === 404 || status === 410) dead.push(s.endpoint);
      else if (status >= 200 && status < 300) sent++;
    }
    if (dead.length) await env.SUBS.put('s:' + u, JSON.stringify(subs.filter((s) => !dead.includes(s.endpoint))));
  }
  return { sent, tried };
}

/** Le joueur a l'app ouverte sous les yeux : pas besoin de notification. */
async function looking(db: Db, uid: string) {
  const s = await db.get<{ state?: string; away?: boolean }>(`status/${uid}`);
  return !!s && s.state !== 'offline' && s.away !== true;
}

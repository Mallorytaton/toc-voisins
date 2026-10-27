import { FirebaseApp, initializeApp } from 'firebase/app';
import { getAuth, onAuthStateChanged, signInAnonymously } from 'firebase/auth';
import {
  Database, endAt, get, getDatabase, limitToFirst, onDisconnect, onValue, orderByValue, query, ref,
  runTransaction, set, update,
} from 'firebase/database';
import {
  Card, DEFAULT_VARIANTS, GameState, Move, Variants, applyMove, cryptoRng, deal, giveCard, newGame, partner,
  rematch,
} from '../engine';
import type { GameController, SeatInfo } from '../ui/controller';
import { firebaseConfig } from './firebase-config';

const WEEK = 7 * 24 * 3600 * 1000;

export interface Meta {
  createdBy: string;
  createdAt: number;
  n: number;
  variants: Variants;
  status: 'lobby' | 'playing';
}
export interface PlayerInfo {
  name: string;
  color: number;
  joinedAt: number;
}
export type PublicState = Omit<GameState, 'hands' | 'deck'> & { handCounts: number[] };

export interface GameNode {
  meta: Meta;
  players: Record<string, PlayerInfo>;
  seats: (string | '')[];
  presence: Record<string, boolean>;
  state: PublicState | null;
}

let app: FirebaseApp | null = null;
let db: Database;
let uidPromise: Promise<string> | null = null;

export function firebase() {
  if (!app) {
    app = initializeApp(firebaseConfig);
    db = getDatabase(app);
  }
  return db;
}

/** Connexion anonyme (persistante sur l'appareil). */
export function ensureAuth(): Promise<string> {
  if (!uidPromise) {
    firebase();
    const auth = getAuth(app!);
    uidPromise = new Promise((resolve, reject) => {
      const off = onAuthStateChanged(auth, (u) => {
        if (u) {
          off();
          resolve(u.uid);
        }
      });
      signInAnonymously(auth).catch((e) => {
        uidPromise = null;
        reject(e);
      });
    });
  }
  return uidPromise;
}

// ---- Conversion état complet <-> état public (sans les mains) ----

function arr<T>(x: unknown, len: number, def: (i: number) => T): T[] {
  const o = (x ?? {}) as Record<number, T>;
  return Array.from({ length: len }, (_, i) => (o[i] === undefined || o[i] === null ? def(i) : o[i]));
}
function list<T>(x: unknown): T[] {
  if (!x) return [];
  return Array.isArray(x) ? x.filter((v) => v !== undefined && v !== null) : Object.values(x as Record<string, T>);
}

/** Firebase supprime les tableaux vides et les valeurs nulles : on reconstruit un état complet. */
export function normalizePublic(raw: Record<string, unknown>): PublicState {
  const n = raw.n as number;
  return {
    n,
    variants: { ...DEFAULT_VARIANTS, ...(raw.variants as Variants) },
    pawns: arr(raw.pawns, n, () => [] as never).map((row) =>
      arr(row, 4, () => ({ p: -1, fresh: false })).map((p) => ({ p: p.p ?? -1, fresh: !!p.fresh })),
    ),
    handCounts: arr(raw.handCounts, n, () => 0),
    dealNo: (raw.dealNo as number) ?? 0,
    dealer: (raw.dealer as number) ?? 0,
    turn: (raw.turn as number) ?? 0,
    phase: (raw.phase as GameState['phase']) ?? 'deal',
    exchange: arr(raw.exchange, n, () => ''),
    passed: arr(raw.passed, n, () => false),
    winner: (raw.winner as number) ?? -1,
    log: list(raw.log),
    lastCard: (raw.lastCard as string) ?? '',
    lastCaptures: list(raw.lastCaptures),
    v: (raw.v as number) ?? 0,
  };
}

export function toPublic(st: GameState): PublicState {
  const { hands, deck: _deck, ...rest } = st;
  return { ...rest, handCounts: hands.map((h) => h.length) };
}

export function toFull(pub: PublicState, mySeat: number, myCards: Card[], deck: Card[] = []): GameState {
  const { handCounts, ...rest } = pub;
  return {
    ...rest,
    hands: handCounts.map((c, s) => (s === mySeat ? myCards.slice() : Array(c).fill('?'))),
    deck,
  };
}

// ---- Création et accès aux parties ----

async function purge(code: string) {
  await update(ref(firebase()), {
    [`games/${code}`]: null,
    [`hands/${code}`]: null,
    [`decks/${code}`]: null,
    [`index/${code}`]: null,
  });
}

/** Supprime quelques parties de plus de 7 jours (nettoyage au fil de l'eau). */
async function purgeExpired() {
  const q = query(ref(firebase(), 'index'), orderByValue(), endAt(Date.now() - WEEK), limitToFirst(10));
  const snap = await get(q);
  const codes = Object.keys(snap.val() ?? {});
  await Promise.all(codes.map((c) => purge(c).catch(() => undefined)));
}

export async function createGame(n: number, variants: Variants): Promise<string> {
  const uid = await ensureAuth();
  await purgeExpired().catch((e) => console.warn('purge', e));
  for (let attempt = 0; attempt < 20; attempt++) {
    const code = String(1000 + Math.floor(cryptoRng() * 9000));
    const metaRef = ref(firebase(), `games/${code}/meta`);
    const existing = (await get(metaRef)).val() as Meta | null;
    if (existing) {
      if (existing.createdAt > Date.now() - WEEK) continue;
      await purge(code);
    }
    const meta: Meta = { createdBy: uid, createdAt: Date.now(), n, variants, status: 'lobby' };
    const res = await runTransaction(metaRef, (cur) => (cur ? undefined : meta));
    if (!res.committed) continue;
    await set(ref(firebase(), `index/${code}`), meta.createdAt);
    return code;
  }
  throw new Error('Impossible de trouver un code libre, réessaie.');
}

export async function gameExists(code: string): Promise<Meta | null> {
  await ensureAuth();
  const meta = (await get(ref(firebase(), `games/${code}/meta`))).val() as Meta | null;
  if (!meta || meta.createdAt < Date.now() - WEEK) return null;
  return meta;
}

const store = {
  get(k: string) {
    try {
      return localStorage.getItem(k);
    } catch {
      return null;
    }
  },
  set(k: string, v: string) {
    try {
      localStorage.setItem(k, v);
    } catch {
      /* indisponible */
    }
  },
};
export const prefs = {
  get name() {
    return store.get('toc.name') ?? '';
  },
  set name(v: string) {
    store.set('toc.name', v);
  },
  get color() {
    return Number(store.get('toc.color') ?? -1);
  },
  set color(v: number) {
    store.set('toc.color', String(v));
  },
  get lastGame() {
    return store.get('toc.lastGame') ?? '';
  },
  set lastGame(v: string) {
    store.set('toc.lastGame', v);
  },
};

// ---- Session en ligne ----

export class OnlineSession {
  game: GameNode | null = null;
  myCards: Card[] = [];
  received: Card = '';
  error = '';
  private offs: (() => void)[] = [];
  private listeners = new Set<() => void>();
  private handOff: (() => void) | null = null;
  private handSeat = -1;
  private dealingV = -1;

  constructor(public code: string, public uid: string) {}

  /** S'inscrit dans la partie puis écoute toutes ses données. */
  async start() {
    const d = firebase();
    const pRef = ref(d, `games/${this.code}/players/${this.uid}`);
    const mine = await get(pRef).catch(() => null);
    if (!mine?.exists()) {
      await set(pRef, { name: prefs.name, color: -1, joinedAt: Date.now() });
    }
    prefs.lastGame = this.code;
    const presRef = ref(d, `games/${this.code}/presence/${this.uid}`);
    this.offs.push(
      onValue(ref(d, '.info/connected'), (s) => {
        if (s.val() === true) {
          onDisconnect(presRef).set(false);
          set(presRef, true);
        }
      }),
    );
    this.offs.push(
      onValue(
        ref(d, `games/${this.code}`),
        (snap) => {
          const raw = snap.val();
          if (!raw?.meta) {
            this.game = null;
            this.error = "Cette partie n'existe plus.";
          } else {
            this.game = {
              meta: { ...raw.meta, variants: { ...DEFAULT_VARIANTS, ...raw.meta.variants } },
              players: raw.players ?? {},
              seats: arr(raw.seats, raw.meta.n, () => ''),
              presence: raw.presence ?? {},
              state: raw.state ? normalizePublic(raw.state) : null,
            };
          }
          this.watchHand();
          this.emit();
          this.maybeDeal();
        },
        (err) => {
          this.error = 'Accès refusé à la partie (' + err.message + ')';
          this.emit();
        },
      ),
    );
    const onVis = () => {
      if (document.visibilityState === 'visible') set(presRef, true).catch(() => undefined);
    };
    document.addEventListener('visibilitychange', onVis);
    this.offs.push(() => document.removeEventListener('visibilitychange', onVis));
  }

  stop() {
    this.offs.forEach((f) => f());
    this.offs = [];
    this.handOff?.();
    this.handOff = null;
    this.listeners.clear();
    set(ref(firebase(), `games/${this.code}/presence/${this.uid}`), false).catch(() => undefined);
  }

  subscribe(cb: () => void) {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }
  private emit() {
    for (const l of this.listeners) l();
  }

  get mySeat(): number {
    return this.game ? this.game.seats.indexOf(this.uid) : -1;
  }
  get isHost() {
    return this.game?.meta.createdBy === this.uid;
  }

  /** Ma main : cartes + carte reçue du partenaire une fois l'échange terminé. */
  hand(): Card[] {
    const st = this.game?.state;
    if (st && st.phase !== 'exchange' && this.received) return [...this.myCards, this.received];
    return this.myCards.slice();
  }

  private watchHand() {
    const seat = this.mySeat;
    if (seat === this.handSeat) return;
    this.handOff?.();
    this.handOff = null;
    this.handSeat = seat;
    this.myCards = [];
    this.received = '';
    if (seat < 0) return;
    this.handOff = onValue(ref(firebase(), `hands/${this.code}/${seat}`), (snap) => {
      const v = snap.val() ?? {};
      this.myCards = list<Card>(v.cards);
      this.received = v.received ?? '';
      this.emit();
    });
  }

  online(uid: string) {
    return this.game?.presence[uid] === true;
  }

  /** Qui distribue : l'hôte s'il est là, sinon le premier joueur connecté. */
  private dealerUid(): string {
    const g = this.game!;
    if (this.online(g.meta.createdBy) && g.seats.includes(g.meta.createdBy)) return g.meta.createdBy;
    return g.seats.find((u) => u && this.online(u)) ?? '';
  }

  private async maybeDeal() {
    const st = this.game?.state;
    if (!st || st.phase !== 'deal' || this.dealerUid() !== this.uid || this.dealingV === st.v) return;
    this.dealingV = st.v;
    try {
      const d = firebase();
      const deck = list<Card>((await get(ref(d, `decks/${this.code}`))).val());
      const full = toFull(st, -1, [], deck);
      full.hands = full.hands.map(() => []);
      const next = deal(full, cryptoRng);
      const updates: Record<string, unknown> = {
        [`games/${this.code}/state`]: toPublic(next),
        [`decks/${this.code}`]: next.deck,
      };
      next.hands.forEach((h, s) => (updates[`hands/${this.code}/${s}`] = { cards: h }));
      await update(ref(d), updates);
    } catch (e) {
      console.warn('distribution', e);
      this.dealingV = -1;
    }
  }

  // ---- Lobby ----

  async setProfile(name: string, color: number) {
    prefs.name = name;
    if (color >= 0) prefs.color = color;
    await update(ref(firebase(), `games/${this.code}/players/${this.uid}`), { name, color });
  }

  async takeSeat(seat: number) {
    const d = firebase();
    const old = this.mySeat;
    const res = await runTransaction(ref(d, `games/${this.code}/seats/${seat}`), (cur) => (cur ? undefined : this.uid));
    if (!res.committed) throw new Error('Place déjà prise');
    if (old >= 0 && old !== seat) await set(ref(d, `games/${this.code}/seats/${old}`), null);
  }

  /** Reprend la place d'un joueur déconnecté (nouveau téléphone, autre navigateur…). */
  async reclaimSeat(seat: number) {
    const g = this.game!;
    const oldUid = g.seats[seat];
    const info = g.players[oldUid];
    const d = firebase();
    await set(ref(d, `games/${this.code}/seats/${seat}`), this.uid);
    if (info) await update(ref(d, `games/${this.code}/players/${this.uid}`), { name: info.name, color: info.color });
  }

  async startGame() {
    const g = this.game!;
    const st = newGame(g.meta.n, g.meta.variants, Math.floor(cryptoRng() * g.meta.n));
    st.v = (g.state?.v ?? -1) + 1;
    await update(ref(firebase(), `games/${this.code}`), { 'meta/status': 'playing', state: toPublic(st) });
  }

  // ---- Coups ----

  private async writeState(next: GameState, extra: Record<string, unknown>) {
    const updates: Record<string, unknown> = { [`games/${this.code}/state`]: toPublic(next), ...extra };
    try {
      await update(ref(firebase()), updates);
    } catch (e) {
      throw new Error("Le coup n'a pas pu être enregistré (un autre joueur a joué en même temps ?). Réessaie.");
    }
  }

  async play(m: Move) {
    const st = this.game!.state!;
    const seat = this.mySeat;
    const next = applyMove(toFull(st, seat, this.hand()), m);
    await this.writeState(next, {
      [`hands/${this.code}/${seat}`]: { cards: next.hands[seat].filter((c) => c !== '?') },
    });
  }

  async give(card: Card) {
    const st = this.game!.state!;
    const seat = this.mySeat;
    const next = giveCard(toFull(st, seat, this.myCards), seat, card);
    next.exchange = next.exchange.map((c) => (c ? '?' : ''));
    await this.writeState(next, {
      [`hands/${this.code}/${seat}/cards`]: this.myCards.filter((c) => c !== card),
      [`hands/${this.code}/${partner(st.n, seat)}/received`]: card,
    });
  }

  async rematch() {
    const st = this.game!.state!;
    await this.writeState(rematch(toFull(st, -1, [])), {});
  }

  seatInfos(): SeatInfo[] {
    const g = this.game!;
    return g.seats.map((uid) => {
      const p = g.players[uid];
      return { name: p?.name || '…', color: p?.color ?? 0, online: !!uid && this.online(uid) };
    });
  }

  controller(): GameController {
    const self = this;
    return {
      mode: 'online',
      code: this.code,
      get state() {
        const st = self.game!.state!;
        return toFull(st, self.mySeat, self.hand());
      },
      get seats() {
        return self.seatInfos();
      },
      get viewer() {
        return self.mySeat;
      },
      curtain: false,
      get notice() {
        const g = self.game;
        if (g?.state?.phase === 'deal' && !self.dealerUid()) return 'En attente d’un joueur connecté pour distribuer…';
        const st = g?.state;
        if (st && st.phase === 'play') {
          const uid = g!.seats[st.turn];
          if (uid && !self.online(uid)) return `${g!.players[uid]?.name ?? 'Ce joueur'} est déconnecté : la partie reprend à son retour.`;
        }
        return '';
      },
      canRematch: true,
      play: (m) => self.play(m),
      give: (c) => self.give(c),
      reveal: () => undefined,
      rematch: () => self.rematch(),
      subscribe: (cb) => self.subscribe(cb),
      leave: () => self.stop(),
    };
  }
}

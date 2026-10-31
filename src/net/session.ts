// Salle et partie en ligne (Firebase Realtime Database, offre gratuite, sans Cloud Functions).
//
// Données (sous v2/) :
//   rooms/<code>   meta, players/<uid>, seats/<place> (= uid ou "bot"), presence/<uid>, state (public), turnAt, emotes/<place>
//   hands/<code>/<place>   { cards, received, deal } : lisible par le joueur assis, ou par la table si la place
//                          est un robot ou un joueur déconnecté (pour qu'un téléphone joue à sa place)
//   decks/<code>   pioche ; index/<code>   date de création (nettoyage après 7 jours)
//
// Chaque coup est validé par le moteur avant d'être écrit, en une seule mise à jour, et les règles
// refusent toute écriture d'état dont la version n'est pas « version + 1 ».
// Un « meneur » (l'hôte, ou le premier joueur connecté) distribue et joue pour les robots et les absents.
import {
  endAt, get, limitToFirst, onDisconnect, onValue, orderByValue, query, runTransaction, serverTimestamp, set, update,
  ref,
} from 'firebase/database';
import type { GameSource, SeatPlayer } from '../app/game-source';
import { draftProfile, saveProfile } from '../app/profile';
import { type Room, type RoomPlayer, type RoomSnapshot, inviteLink } from '../app/room';
import {
  type Card, DEFAULT_VARIANTS, type GameState, type Move, type Variants, applyMove, botGift, botMove, cryptoRng,
  deal, giveCard, newGame, partner, rematch, teamOf,
} from '../engine';
import { toast } from '../ui/dom';
import { DEMO_GUESTS } from '../ui/demo';
import { type CharId, type ColorName, SEAT_COLORS } from '../ui/kit/data';
import { WEEK, arr, database, ensureAuth, list, node, serverNow } from './firebase';
import { recordLeagueGame } from './league';
import { awardGame, recordPlayerStats } from './social';
import { notifyPlayers } from './push';

type Status = 'waiting' | 'countdown' | 'playing';

interface Meta {
  host: string;
  createdAt: number;
  n: 4 | 6;
  status: Status;
  variants: Variants;
  /** Partie d'un tournoi : son code, son nom, et la place réservée à chaque membre. */
  league?: string;
  title?: string;
  reserved?: Record<string, string>;
  /** Partie à ton rythme : on attend les absents, gardée 30 jours après le dernier coup. */
  slow?: boolean;
}

export interface RoomOptions {
  league: string;
  title: string;
  /** uid par place (places fixes du tournoi) */
  reserved: string[];
}

interface PlayerInfo {
  name: string;
  char: CharId;
  color: ColorName;
  joinedAt: number;
}

interface HandNode {
  cards: Card[];
  received: Card;
  deal: number;
}

export type PublicState = Omit<GameState, 'hands' | 'deck'> & { handCounts: number[] };

interface RoomNode {
  meta: Meta;
  players: Record<string, PlayerInfo>;
  seats: string[];
  presence: Record<string, boolean>;
  state: PublicState | null;
  turnAt: number;
  emotes: Record<string, { t: string; at: number }>;
}

const BOT = 'bot';
const COUNTDOWN_MS = 3400;
const TURN_MS = 30_000;
/** Une partie à ton rythme est gardée 30 jours après son dernier coup (une salle en direct : 7 jours). */
const SLOW_KEEP_MS = 30 * 86_400_000;

/** Salle périmée : 7 jours après sa création, ou 30 jours sans coup pour une partie à ton rythme. */
function expired(meta: Meta, turnAt = 0) {
  return meta.slow ? Math.max(meta.createdAt, turnAt) < Date.now() - SLOW_KEEP_MS : meta.createdAt < Date.now() - WEEK;
}
const turnAtOf = async (code: string) => Number((await get(node('rooms', code, 'turnAt'))).val()) || 0;
const BOT_THINK_MS = 850;
/** Ordre d'arrivée : le partenaire de l'hôte d'abord, puis les adversaires. */
const JOIN_ORDER: Record<4 | 6, number[]> = { 4: [0, 2, 1, 3], 6: [0, 3, 1, 4, 2, 5] };

/** Robot assis à une place : le personnage de la maquette de cette couleur. */
export function botProfile(n: 4 | 6, seat: number) {
  const c = SEAT_COLORS[n][seat];
  return DEMO_GUESTS.find((g) => g.color === c) ?? DEMO_GUESTS[seat % DEMO_GUESTS.length];
}

// ---------- État public <-> état complet ----------

function normMove(m: Move): Move {
  return m.kind === 'seven' ? { ...m, parts: list(m.parts) } : m;
}

export function normalizePublic(raw: Record<string, unknown>): PublicState {
  const n = raw.n as number;
  const lm = raw.lastMove as GameState['lastMove'] | undefined;
  return {
    n,
    variants: { ...DEFAULT_VARIANTS, ...(raw.variants as Variants) },
    pawns: arr(raw.pawns, n, () => [] as never).map((row) =>
      arr(row, 4, () => ({ p: -1, fresh: false })).map((p) => ({ p: p.p ?? -1, fresh: !!p.fresh }))),
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
    lastMove: lm && typeof lm === 'object' ? { seat: lm.seat, move: normMove(lm.move) } : '',
    stats: {
      captures: arr((raw.stats as Record<string, unknown> | undefined)?.captures, n, () => 0),
      exits: arr((raw.stats as Record<string, unknown> | undefined)?.exits, n, () => 0),
      // Firebase efface les objets vides : chaque place retrouve son compteur de cartes.
      cards: arr<Record<string, number> | null>((raw.stats as Record<string, unknown> | undefined)?.cards, n, () => ({})).map((c) => ({ ...(c ?? {}) })),
    },
    startedAt: (raw.startedAt as number) ?? 0,
    v: (raw.v as number) ?? 0,
  };
}

export function toPublic(st: GameState): PublicState {
  const { hands, deck: _deck, ...rest } = st;
  return { ...rest, handCounts: hands.map((h) => h.length) };
}

export function toFull(pub: PublicState, seat: number, cards: Card[], deck: Card[] = []): GameState {
  const { handCounts, ...rest } = pub;
  return { ...rest, hands: handCounts.map((c, s) => (s === seat ? cards.slice() : Array(c).fill('?'))), deck };
}

/** Cartes jouables d'une main pour l'état courant (la carte reçue s'ajoute après l'échange). */
function cardsOf(h: HandNode | null, st: PublicState): Card[] {
  if (!h || h.deal !== st.dealNo) return [];
  return st.phase !== 'exchange' && h.received ? [...h.cards, h.received] : h.cards.slice();
}

const normHand = (v: Record<string, unknown> | null): HandNode | null =>
  v ? { cards: list<Card>(v.cards), received: (v.received as Card) ?? '', deal: (v.deal as number) ?? -1 } : null;

// ---------- Création, arrivée, nettoyage ----------

async function purge(code: string) {
  await update(ref(database()), {
    [`v2/rooms/${code}`]: null,
    [`v2/hands/${code}`]: null,
    [`v2/decks/${code}`]: null,
    [`v2/index/${code}`]: null,
  });
}

/** L'hôte supprime une salle et sa partie (cartes, paquet, index) ; elle quitte aussi sa liste « À ton rythme ». */
export async function deleteRoom(code: string) {
  const uid = await ensureAuth();
  await update(ref(database()), {
    [`v2/rooms/${code}`]: null,
    [`v2/hands/${code}`]: null,
    [`v2/decks/${code}`]: null,
    [`v2/index/${code}`]: null,
    [`v2/myGames/${uid}/${code}`]: null,
  });
}

/** Supprime quelques salles de plus de 7 jours (nettoyage au fil de l'eau). */
async function purgeExpired() {
  const snap = await get(query(node('index'), orderByValue(), endAt(Date.now() - WEEK), limitToFirst(10)));
  await Promise.all(Object.keys(snap.val() ?? {}).map((c) => purge(c).catch(() => undefined)));
}

function me(): PlayerInfo {
  const p = draftProfile();
  return { name: (p.nick || 'Toi').slice(0, 20), char: p.char, color: p.color, joinedAt: Date.now() };
}

export class RoomSession implements Room {
  room: RoomNode | null = null;
  error = '';
  private hand: HandNode | null = null;
  private subs = new Set<() => void>();
  private offs: (() => void)[] = [];
  private handOff: (() => void) | null = null;
  private handSeat = -1;
  private online_: OnlineGame | null = null;
  private startTimer = 0;
  private driveTimer = 0;
  private driving = false;
  private dealtV = -1;

  private constructor(readonly code: string, readonly uid: string) {}

  /** Crée une salle (l'appelant devient l'hôte, assis à la place 0). */
  static async create(n: 4 | 6, variants: Variants = DEFAULT_VARIANTS, opts?: RoomOptions): Promise<RoomSession> {
    const uid = await ensureAuth();
    await purgeExpired().catch((e) => console.warn('nettoyage', e));
    for (let attempt = 0; attempt < 20; attempt++) {
      const code = String(1000 + Math.floor(cryptoRng() * 9000));
      const metaRef = node('rooms', code, 'meta');
      const existing = (await get(metaRef)).val() as Meta | null;
      if (existing) {
        if (!expired(existing, await turnAtOf(code))) continue;
        await purge(code);
      }
      const meta: Meta = { host: uid, createdAt: Date.now(), n, status: 'waiting', variants };
      if (opts) Object.assign(meta, { league: opts.league, title: opts.title, reserved: Object.fromEntries(opts.reserved.map((u, k) => [k, u])) });
      const res = await runTransaction(metaRef, (cur) => (cur ? undefined : meta));
      if (!res.committed) continue;
      await set(node('index', code), meta.createdAt);
      await set(node('rooms', code, 'players', uid), me());
      // Tournoi : l'hôte s'assoit à sa place du tournoi.
      await set(node('rooms', code, 'seats', Math.max(0, opts?.reserved.indexOf(uid) ?? 0)), uid);
      const s = new RoomSession(code, uid);
      await s.start();
      return s;
    }
    throw new Error('Impossible de trouver un code libre, réessaie.');
  }

  /** Rejoint une salle existante ; prend une place libre si la partie n'a pas commencé. */
  static async join(code: string): Promise<RoomSession> {
    const uid = await ensureAuth();
    const meta = (await get(node('rooms', code, 'meta'))).val() as Meta | null;
    if (!meta || expired(meta, await turnAtOf(code))) throw new Error(`Aucune salle TOC-${code}. Vérifie le code.`);
    await set(node('rooms', code, 'players', uid), me());
    const seats = arr<string>((await get(node('rooms', code, 'seats'))).val(), meta.n, () => '');
    if (!seats.includes(uid) && meta.status === 'waiting') {
      // Tournoi : chacun retrouve sa place (donc son duo) ; sinon, l'ordre d'arrivée habituel.
      const mine = Object.entries(meta.reserved ?? {}).find(([, u]) => u === uid);
      const order = mine ? [Number(mine[0])] : JOIN_ORDER[meta.n];
      for (const k of order) {
        if (seats[k]) continue;
        const res = await runTransaction(node('rooms', code, 'seats', k), (cur) => (cur ? undefined : uid));
        if (res.committed) break;
      }
    }
    const s = new RoomSession(code, uid);
    await s.start();
    return s;
  }

  private async start() {
    const presRef = node('rooms', this.code, 'presence', this.uid);
    this.offs.push(onValue(ref(database(), '.info/connected'), (s) => {
      if (s.val() === true) {
        onDisconnect(presRef).set(false);
        set(presRef, true);
      }
    }));
    const onVis = () => { if (document.visibilityState === 'visible') set(presRef, true).catch(() => undefined); };
    document.addEventListener('visibilitychange', onVis);
    this.offs.push(() => document.removeEventListener('visibilitychange', onVis));
    await new Promise<void>((resolve) => {
      this.offs.push(onValue(node('rooms', this.code), (snap) => {
        const raw = snap.val();
        if (!raw?.meta) {
          const had = !!this.room;
          this.room = null;
          this.error = 'Cette salle n’existe plus.';
          // Supprimée pendant qu'on y était : l'app nous ramène à l'accueil (sans redessiner la salle vide).
          if (had && this.onGone) {
            this.onGone();
            resolve();
            return;
          }
        } else {
          const n = raw.meta.n as 4 | 6;
          this.room = {
            meta: { ...raw.meta, variants: { ...DEFAULT_VARIANTS, ...raw.meta.variants } },
            players: raw.players ?? {},
            seats: arr(raw.seats, n, () => ''),
            presence: raw.presence ?? {},
            state: raw.state ? normalizePublic(raw.state) : null,
            turnAt: raw.turnAt ?? 0,
            emotes: raw.emotes ?? {},
          };
        }
        this.watchHand();
        this.afterChange();
        resolve();
      }, (err) => {
        this.error = 'Accès refusé à la salle (' + err.message + ')';
        this.emit();
        resolve();
      }));
    });
  }

  /** Partie en cours où ce joueur est assis (pour « Reprendre » depuis l'accueil) ; null sinon. */
  static async resumable(code: string): Promise<{ host: boolean } | null> {
    const uid = await ensureAuth();
    const meta = (await get(node('rooms', code, 'meta'))).val() as Meta | null;
    // Une partie à ton rythme a sa propre liste sur l'accueil.
    if (!meta || meta.slow || meta.status !== 'playing' || expired(meta, await turnAtOf(code))) return null;
    const seats = arr<string>((await get(node('rooms', code, 'seats'))).val(), meta.n, () => '');
    const st = (await get(node('rooms', code, 'state', 'phase'))).val();
    return seats.includes(uid) && st !== 'over' ? { host: meta.host === uid } : null;
  }

  /** Appelé quand la salle disparaît pendant qu'on y est (supprimée par l'hôte, ou par soi). */
  onGone: (() => void) | null = null;
  private deleting = false;
  get deletedByMe() {
    return this.deleting;
  }

  /** L'hôte supprime la salle (et la partie) pour tout le monde. */
  async remove() {
    if (!this.isHost) throw new Error('Seul l’hôte peut supprimer la partie.');
    this.deleting = true;
    try {
      await deleteRoom(this.code);
    } catch (e) {
      this.deleting = false;
      throw e;
    }
  }

  /** Quitte la salle : libère la place si la partie n'a pas commencé. */
  quit() {
    const r = this.room;
    const seat = this.mySeat;
    // On arrête d'écouter d'abord : sinon l'écran se redessinerait une fois sans notre place.
    this.offs.forEach((f) => f());
    this.offs = [];
    this.handOff?.();
    this.handOff = null;
    this.subs.clear();
    clearTimeout(this.startTimer);
    clearTimeout(this.driveTimer);
    // Une partie à ton rythme garde ta place : tu reviens quand tu veux.
    if (r && r.meta.status === 'waiting' && seat >= 0 && !r.meta.slow) set(node('rooms', this.code, 'seats', seat), null).catch(() => undefined);
    // La présence « absent » posée d'avance pour une coupure est annulée : une salle supprimée ne doit pas renaître.
    const pres = node('rooms', this.code, 'presence', this.uid);
    onDisconnect(pres).cancel().catch(() => undefined);
    if (r) set(pres, false).catch(() => undefined);
  }

  // ---------- Room (écran de la salle) ----------

  get mySeat() {
    return this.room ? this.room.seats.indexOf(this.uid) : -1;
  }
  get isHost() {
    return this.room?.meta.host === this.uid;
  }
  isOnline(uid: string) {
    return this.room?.presence[uid] === true;
  }

  snapshot(): RoomSnapshot {
    const r = this.room!;
    return {
      code: this.code,
      n: r.meta.n,
      seats: r.seats.map((uid, k): RoomPlayer | null => {
        if (!uid) return null;
        if (uid === BOT) return { ...botProfile(r.meta.n, k), host: false, bot: true, online: true };
        const p = r.players[uid];
        return { name: p?.name ?? '…', char: p?.char ?? 'tuque', color: p?.color ?? 'coral', host: uid === r.meta.host, online: this.isOnline(uid) };
      }),
      mySeat: this.mySeat,
      status: r.meta.status,
      title: r.meta.title,
      variants: r.meta.variants,
      slow: !!r.meta.slow,
    };
  }

  subscribe(cb: () => void) {
    this.subs.add(cb);
    return () => this.subs.delete(cb);
  }

  link() {
    return inviteLink(this.code);
  }

  setVariants(v: Variants) {
    const r = this.room;
    if (!r || !this.isHost || r.meta.status !== 'waiting' || r.meta.league) return;
    update(node('rooms', this.code, 'meta'), { variants: v }).catch((e) => toast('Règles non enregistrées : ' + e.message));
  }

  setSlow(on: boolean) {
    const r = this.room;
    if (!r || !this.isHost || r.meta.status !== 'waiting') return;
    update(ref(database()), {
      [`v2/rooms/${this.code}/meta/slow`]: on || null,
      [`v2/rooms/${this.code}/turnAt`]: serverTimestamp(),
      ...(on ? { [`v2/index/${this.code}`]: Date.now() + SLOW_KEEP_MS - WEEK } : {}),
    }).catch((e) => toast('Rythme non enregistré : ' + e.message));
  }

  launch() {
    const r = this.room;
    if (!r || !this.isHost || r.meta.status !== 'waiting' || r.seats.some((x) => !x)) return;
    update(node('rooms', this.code, 'meta'), { status: 'countdown' }).catch((e) => toast('Lancement impossible : ' + e.message));
  }

  fillBots() {
    const r = this.room;
    if (!r || !this.isHost || r.meta.status !== 'waiting') return;
    const updates: Record<string, string> = {};
    r.seats.forEach((uid, k) => { if (!uid) updates[k] = BOT; });
    update(node('rooms', this.code, 'seats'), updates).catch((e) => toast('Impossible d’ajouter les robots : ' + e.message));
  }

  /** Reprend la place d'un joueur déconnecté (nouveau téléphone, autre navigateur…). */
  async takeSeat(seat: number) {
    const r = this.room!;
    const old = r.seats[seat];
    if (!old || old === BOT || this.isOnline(old)) return;
    await set(node('rooms', this.code, 'seats', seat), this.uid);
    const info = r.players[old];
    if (info) await set(node('rooms', this.code, 'players', this.uid), { ...me(), name: info.name, char: info.char, color: info.color });
  }

  /** L'écran de la salle se ferme : la session continue (elle sert la partie). */
  leave() {}

  /** Résout quand la partie a démarré (état écrit par l'hôte). */
  whenPlaying(): Promise<void> {
    return new Promise((resolve) => {
      const check = () => {
        if (this.room?.meta.status === 'playing' && this.room.state && this.mySeat >= 0) {
          off();
          resolve();
        }
      };
      const off = this.subscribe(check);
      check();
    });
  }

  /** Retient le partenaire humain de la partie, pour le chat d'équipe. */
  rememberPartner() {
    const r = this.room;
    if (!r || this.mySeat < 0) return;
    const uid = r.seats[partner(r.meta.n, this.mySeat)];
    const p = r.players[uid];
    if (uid && uid !== BOT && p) saveProfile({ ...draftProfile(), partner: { uid, name: p.name, char: p.char, color: p.color } });
  }

  /** La partie en ligne (une seule par session). */
  game(): OnlineGame {
    if (!this.online_) this.online_ = new OnlineGame(this);
    return this.online_;
  }

  // ---------- Écoute ----------

  private emit() {
    this.subs.forEach((cb) => cb());
    this.online_?.refresh();
  }

  private listed = false;

  private afterChange() {
    const r = this.room;
    // Partie à ton rythme : elle s'ajoute à ta liste de l'accueil (et la quitte si l'hôte repasse en direct).
    const slow = !!r?.meta.slow && this.mySeat >= 0;
    if (slow !== this.listed) {
      this.listed = slow;
      set(node('myGames', this.uid, this.code), slow || null).catch(() => undefined);
    }
    // L'hôte écrit la partie à la fin du compte à rebours.
    if (r && this.isHost && r.meta.status === 'countdown' && !this.startTimer)
      this.startTimer = window.setTimeout(() => this.startGame().catch((e) => toast('Démarrage impossible : ' + e.message)), COUNTDOWN_MS);
    this.emit();
  }

  private watchHand() {
    const seat = this.mySeat;
    if (seat === this.handSeat) return;
    this.handOff?.();
    this.handOff = null;
    this.handSeat = seat;
    this.hand = null;
    if (seat < 0) return;
    this.handOff = onValue(node('hands', this.code, seat), (snap) => {
      this.hand = normHand(snap.val());
      this.emit();
    }, () => {
      // Lecture refusée : la place n'est pas encore confirmée par le serveur. On réessaie.
      this.handOff = null;
      this.handSeat = -1;
      setTimeout(() => this.watchHand(), 800);
    });
  }

  myCards(): Card[] {
    const st = this.room?.state;
    return st ? cardsOf(this.hand, st) : [];
  }
  /** La main affichée correspond-elle à la donne en cours ? */
  handReady() {
    const st = this.room?.state;
    return !!st && (st.phase === 'deal' || st.phase === 'over' || this.mySeat < 0 || this.hand?.deal === st.dealNo);
  }

  // ---------- Écritures ----------

  private async write(next: GameState, extra: Record<string, unknown> = {}) {
    const r = this.room;
    const before = r?.state;
    await update(ref(database()), {
      [`v2/rooms/${this.code}/state`]: toPublic(next),
      [`v2/rooms/${this.code}/turnAt`]: serverTimestamp(),
      // À ton rythme : chaque coup repousse le nettoyage de la salle.
      ...(r?.meta.slow ? { [`v2/index/${this.code}`]: Date.now() + SLOW_KEEP_MS - WEEK } : {}),
      ...extra,
    });
    if (!r) return;
    // Le tour passe à un autre joueur humain, ou une donne commence (chacun donne une carte) :
    // ceux qui n'ont pas l'app sous les yeux sont prévenus par le service.
    const human = (k: number) => { const u = r.seats[k]; return u && u !== BOT && u !== this.uid ? u : ''; };
    const to = next.phase === 'play' && (before?.phase !== 'play' || before.turn !== next.turn) ? [human(next.turn)]
      : next.phase === 'exchange' && before?.phase !== 'exchange' ? r.seats.map((_, k) => human(k)) : [];
    if (to.some(Boolean)) notifyPlayers(to.filter(Boolean), 'turn', { code: this.code });
  }

  private handsUpdate(next: GameState, seats: number[]) {
    const out: Record<string, unknown> = {};
    for (const s of seats) out[`v2/hands/${this.code}/${s}`] = { cards: next.hands[s].filter((c) => c !== '?'), received: '', deal: next.dealNo };
    return out;
  }

  private async startGame() {
    const r = this.room;
    if (!r || r.meta.status !== 'countdown') return;
    const fresh = newGame(r.meta.n, r.meta.variants, r.meta.n - 1);
    fresh.v = (r.state?.v ?? -1) + 1;
    fresh.startedAt = Date.now();
    const dealt = deal(fresh, cryptoRng);
    await update(ref(database()), {
      [`v2/rooms/${this.code}/meta/status`]: 'playing',
      [`v2/rooms/${this.code}/state`]: toPublic(dealt),
      [`v2/rooms/${this.code}/turnAt`]: serverTimestamp(),
      [`v2/decks/${this.code}`]: dealt.deck,
      ...this.handsUpdate(dealt, [...Array(r.meta.n).keys()]),
    });
  }

  async play(m: Move) {
    const st = this.room!.state!;
    const seat = this.mySeat;
    const next = applyMove(toFull(st, seat, this.myCards()), m);
    await this.write(next, this.handsUpdate(next, [seat]));
  }

  async give(card: Card) {
    await this.giveFor(this.mySeat, card, this.hand);
  }

  private async giveFor(seat: number, card: Card, h: HandNode | null) {
    const st = this.room!.state!;
    const cards = h?.deal === st.dealNo ? h.cards : [];
    const next = giveCard(toFull(st, seat, cards), seat, card);
    next.exchange = next.exchange.map((c) => (c ? '?' : ''));
    await this.write(next, {
      [`v2/hands/${this.code}/${seat}/cards`]: cards.filter((c) => c !== card),
      [`v2/hands/${this.code}/${partner(st.n, seat)}/received`]: card,
    });
  }

  async rematch() {
    const st = this.room?.state;
    if (!st || st.phase !== 'over') return;
    const next = rematch(toFull(st, -1, []));
    next.startedAt = Date.now();
    await this.write(next);
  }

  async emote(t: string) {
    if (this.mySeat < 0) return;
    await set(node('rooms', this.code, 'emotes', this.mySeat), { t, at: serverTimestamp() });
  }

  // ---------- Meneur : distribution, robots, joueurs absents ----------

  /** L'hôte s'il est connecté et assis, sinon le premier joueur connecté. */
  private isDriver() {
    const r = this.room;
    if (!r) return false;
    const humans = r.seats.filter((u) => u && u !== BOT && this.isOnline(u));
    const driver = humans.includes(r.meta.host) ? r.meta.host : humans[0];
    return driver === this.uid;
  }

  /** La place est jouée par le meneur : un robot, ou un joueur déconnecté (sauf à ton rythme : on l'attend). */
  private automated(seat: number) {
    const uid = this.room!.seats[seat];
    return uid === BOT || (!this.room!.meta.slow && !this.isOnline(uid));
  }

  /** Appelé quand l'écran a fini d'animer : le meneur fait avancer la partie si besoin. */
  drive() {
    clearTimeout(this.driveTimer);
    const r = this.room;
    const st = r?.state;
    if (!r || !st || r.meta.status !== 'playing' || this.driving || !this.isDriver()) return;
    const run = (f: () => Promise<void>) => {
      this.driving = true;
      f().catch((e) => console.warn('meneur', e)).finally(() => {
        this.driving = false;
        // L'écran a pu finir d'animer pendant l'écriture (et être ignoré) : on relance si besoin.
        if (this.online_?.isIdle) this.drive();
      });
    };
    if (st.phase === 'deal') {
      if (this.dealtV === st.v) return;
      this.dealtV = st.v;
      return run(async () => {
        const deck = list<Card>((await get(node('decks', this.code))).val());
        const full = toFull(st, -1, [], deck);
        full.hands = full.hands.map(() => []);
        const next = deal(full, cryptoRng);
        await this.write(next, { [`v2/decks/${this.code}`]: next.deck, ...this.handsUpdate(next, [...Array(st.n).keys()]) });
      });
    }
    if (st.phase === 'exchange') {
      const seat = st.exchange.findIndex((c, k) => !c && this.automated(k));
      if (seat < 0) return;
      return run(async () => {
        const h = normHand((await get(node('hands', this.code, seat))).val());
        const full = toFull(st, seat, h?.deal === st.dealNo ? h.cards : []);
        if (!full.hands[seat].length) return;
        await this.giveFor(seat, botGift(full, seat), h);
      });
    }
    if (st.phase !== 'play' || !this.automated(st.turn)) return;
    // Un robot réfléchit un peu ; un joueur absent garde ses 30 s.
    const wait = r.seats[st.turn] === BOT ? BOT_THINK_MS : Math.max(0, r.turnAt + TURN_MS - serverNow());
    const v = st.v;
    this.driveTimer = window.setTimeout(() => {
      const now = this.room?.state;
      if (!now || now.v !== v || !this.isDriver()) return;
      run(async () => {
        const seat = now.turn;
        const h = normHand((await get(node('hands', this.code, seat))).val());
        const full = toFull(now, seat, cardsOf(h, now));
        const next = applyMove(full, botMove(full, cryptoRng));
        await this.write(next, this.handsUpdate(next, [seat]));
      });
    }, wait);
  }
}

/** Partie en ligne vue par l'écran du plateau. */
export class OnlineGame implements GameSource {
  readonly local = false;
  get slow() {
    return !!this.s.room?.meta.slow;
  }
  get canDelete() {
    return this.s.isHost;
  }
  deleteGame() {
    return this.s.remove();
  }
  state: GameState;
  private subs = new Set<(prev: GameState, reset: boolean) => void>();
  private emoteSubs = new Set<(seat: number, t: string) => void>();
  private seenEmote: Record<string, number> = {};
  /** L'écran a fini d'animer le dernier état reçu. */
  private idle = false;
  get isIdle() {
    return this.idle;
  }

  constructor(private s: RoomSession) {
    this.state = this.view();
    for (const [k, e] of Object.entries(s.room?.emotes ?? {})) this.seenEmote[k] = e.at;
  }

  get code() {
    return this.s.code;
  }
  get mySeat() {
    return this.s.mySeat;
  }
  get players(): SeatPlayer[] {
    const snap = this.s.snapshot();
    return snap.seats.map((p, k) => ({
      name: p?.name ?? '…', char: p?.char ?? 'tuque', color: p?.color ?? 'coral',
      bot: !!p?.bot, online: k === snap.mySeat || !!p?.online,
    }));
  }

  private view(): GameState {
    return toFull(this.s.room!.state!, this.s.mySeat, this.s.myCards());
  }

  /** Nouvel état ou nouvelle main reçue : on prévient l'écran (une fois la main de la donne arrivée). */
  refresh() {
    const r = this.s.room;
    if (r) for (const [k, e] of Object.entries(r.emotes)) {
      if (e.at > (this.seenEmote[k] ?? 0)) {
        this.seenEmote[k] = e.at;
        if (Number(k) !== this.s.mySeat) this.emoteSubs.forEach((cb) => cb(Number(k), e.t));
      }
    }
    if (!r?.state || !this.s.handReady()) return;
    const next = this.view();
    const prev = this.state;
    if (next.v === prev.v && JSON.stringify(next.hands[this.mySeat]) === JSON.stringify(prev.hands[this.mySeat])) {
      // Rien de neuf à animer (ex. un joueur s'est déconnecté) : le meneur peut devoir agir.
      if (this.idle) this.s.drive();
      return;
    }
    this.idle = false;
    this.state = next;
    const reset = prev.phase === 'over' && next.phase !== 'over';
    // Fin de partie : XP, jetons et points de classement (une fois par partie).
    if (next.phase === 'over' && prev.phase !== 'over' && this.mySeat >= 0) {
      void awardGame(`${this.code}:${next.v}`, teamOf(next.n, this.mySeat) === next.winner);
      const mate = this.s.room?.seats[partner(next.n, this.mySeat)] ?? '';
      void recordPlayerStats(`${this.code}:${next.v}`, {
        won: teamOf(next.n, this.mySeat) === next.winner,
        captures: next.stats.captures[this.mySeat] ?? 0, exits: next.stats.exits[this.mySeat] ?? 0,
        cards: next.stats.cards[this.mySeat] ?? {}, partner: mate && mate !== BOT ? mate : '',
      }).catch((e) => console.warn('fiche', e));
    }
    // Partie d'un tournoi : la victoire de l'équipe s'ajoute au score du tournoi (une seule fois).
    const league = this.s.room?.meta.league;
    if (league && next.phase === 'over' && prev.phase !== 'over')
      void recordLeagueGame(league, `${this.code}-${next.v}`, next.winner, {
        duration: next.startedAt ? Date.now() - next.startedAt : 0, captures: next.stats.captures, exits: next.stats.exits,
      }).catch((e) => console.warn('tournoi', e));
    this.subs.forEach((cb) => cb(prev, reset));
  }

  subscribe(cb: (prev: GameState, reset: boolean) => void) {
    this.subs.add(cb);
    return () => this.subs.delete(cb);
  }
  onEmote(cb: (seat: number, t: string) => void) {
    this.emoteSubs.add(cb);
    return () => this.emoteSubs.delete(cb);
  }

  play(m: Move) {
    this.s.play(m).catch(() => toast('Le coup n’a pas passé (quelqu’un a joué en même temps ?). Réessaie.', 2600));
  }
  give(card: string) {
    // Pendant l'échange, tout le monde donne en même temps : si un autre don passe avant le nôtre,
    // Firebase refuse le nôtre (version déjà prise). On redonne la même carte sur l'état à jour.
    const attempt = (left: number): Promise<void> => this.s.give(card).catch(async (e) => {
      const st = this.s.room?.state;
      const stillToGive = st?.phase === 'exchange' && !st.exchange[this.mySeat];
      if (left <= 0 || !stillToGive) throw e;
      await new Promise((r) => setTimeout(r, 250 + Math.random() * 350));
      return attempt(left - 1);
    });
    attempt(4).catch(() => toast('La carte n’a pas pu être donnée. Réessaie.', 2600));
  }
  emote(t: string) {
    this.s.emote(t).catch(() => undefined);
  }
  settled() {
    this.idle = true;
    this.s.drive();
  }
  restartDeal() {}
  rematch() {
    this.s.rematch().catch(() => undefined);
  }
  leave() {}
}

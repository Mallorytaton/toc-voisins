// Source d'une partie : locale contre des robots, ou en ligne (Firebase).
// L'écran du plateau anime chaque changement d'état, puis appelle settled().
import { applyMove, botGift, botMove, cloneState, cryptoRng, deal, DEFAULT_VARIANTS, type GameState, giveCard, type Move, newGame, type Rank, rankOf, rematch, type Variants } from '../engine';
import type { CharId, ColorName } from '../ui/kit/data';
import type { Look } from './shop';

export interface SeatPlayer {
  name: string;
  char: CharId;
  color: ColorName;
  bot: boolean;
  online: boolean;
  /** Boutique : billes, effet de BOUM, cri */
  look?: Look;
}

export interface GameSource {
  /** Partie en ligne avec un écran de table (tablette) : le téléphone peut passer en mode manette. */
  readonly tableOn?: boolean;
  /** Ce que chaque place prépare (carte, billes possibles « s.i,s.i », bille choisie), pour l'écran de table. */
  readonly aims?: Record<string, { card?: string; n?: string; pick?: string; m?: string; sp?: string }>;
  /** m : le coup prêt (JSON) ; sp : le partage du 7 en cours (« s.i:n,… »), pour l'aperçu sur la tablette. */
  setAim?(a: { card: string; n: string; pick: string; m: string; sp: string } | null): void;
  /** Prévient à chaque changement de la salle (écran de table, visées). */
  onRoom?(cb: () => void): () => void;
  readonly mySeat: number;
  readonly local: boolean;
  readonly code: string;
  /** Partie à ton rythme : pas de minuteur, chacun joue quand il revient. */
  readonly slow?: boolean;
  /** Partie d'album : son nom et le numéro de l'épisode (connu un instant après l'ouverture), pour la planche de fin. */
  readonly album?: { title: string; episode?: number };
  /** Partie d'initiation : première main préparée, robots plus gentils, leçons pendant la partie. */
  readonly initiation?: boolean;
  /** En ligne, pour l'hôte : supprimer la partie pour tout le monde. */
  readonly canDelete?: boolean;
  deleteGame?(): Promise<void>;
  players: SeatPlayer[];
  state: GameState;
  /** cb(prev, reset) : reset = l'état a été remplacé (donne recommencée), sans animation. */
  subscribe(cb: (prev: GameState, reset: boolean) => void): () => void;
  play(m: Move): void;
  give(card: string): void;
  /** L'interface a fini d'animer le dernier changement : les robots peuvent enchaîner. */
  settled(): void;
  restartDeal(): void;
  rematch(): void;
  leave(): void;
  /** En ligne : envoie une émote à la table, et reçoit celles des autres. */
  emote?(t: string): void;
  onEmote?(cb: (seat: number, t: string) => void): () => void;
  /** En ligne : la revanche part quand tous les joueurs (hors robots) sont d'accord. */
  rematchVotes?(): RematchVote[];
  voteRematch?(): void;
  /** En ligne : chat de table, vu par tous les joueurs. cb(tous les messages, nouveaux messages des autres). */
  chat?(t: string): void;
  onChat?(cb: (lines: TableMsg[], fresh: TableMsg[]) => void): () => void;
}

/** Un joueur et sa réponse pour la revanche. */
export interface RematchVote {
  seat: number;
  name: string;
  ok: boolean;
  me: boolean;
}

/** Un message du chat de table. */
export interface TableMsg {
  id: string;
  /** Place de l'auteur (-1 s'il n'est plus assis) */
  seat: number;
  name: string;
  t: string;
  at: number;
  mine: boolean;
}

const BOT_THINK_MS = 850;

/** Donne ces valeurs à la main de `seat`, en échangeant ses autres cartes avec le paquet ou un robot. */
function stackHand(st: GameState, seat: number, ranks: Rank[]) {
  const hand = st.hands[seat];
  for (const r of ranks) {
    if (hand.some((c) => rankOf(c) === r)) continue;
    const spare = hand.findIndex((c) => !ranks.includes(rankOf(c) as Rank));
    if (spare < 0) return;
    let pile = st.deck, k = st.deck.findIndex((c) => rankOf(c) === r);
    for (let s = 0; k < 0 && s < st.hands.length; s++) {
      if (s === seat) continue;
      pile = st.hands[s];
      k = pile.findIndex((c) => rankOf(c) === r);
    }
    if (k >= 0) [hand[spare], pile[k]] = [pile[k], hand[spare]];
  }
}

/** Partie sur l'appareil : le joueur à la place 0, des robots ailleurs. */
export class LocalGame implements GameSource {
  readonly local = true;
  readonly mySeat = 0;
  state: GameState;
  private subs = new Set<(prev: GameState, reset: boolean) => void>();
  private timer = 0;
  private dealStart: GameState | null = null;

  constructor(readonly code: string, public players: SeatPlayer[], variants: Variants = DEFAULT_VARIANTS, readonly initiation = false) {
    const n = players.length;
    // Le donneur est à droite du joueur : c'est lui qui commence.
    this.state = newGame(n, variants, n - 1);
    this.state.startedAt = Date.now();
    setTimeout(() => this.dealNow(), 300);
  }

  subscribe(cb: (prev: GameState, reset: boolean) => void) {
    this.subs.add(cb);
    return () => this.subs.delete(cb);
  }

  play(m: Move) {
    if (this.state.phase !== 'play' || this.state.turn !== this.mySeat) return;
    this.set(applyMove(this.state, m));
  }

  give(card: string) {
    if (this.state.phase !== 'exchange' || this.state.exchange[this.mySeat]) return;
    this.set(giveCard(this.state, this.mySeat, card));
  }

  settled() {
    clearTimeout(this.timer);
    const st = this.state;
    if (st.phase === 'deal') this.timer = window.setTimeout(() => this.dealNow(), 500);
    else if (st.phase === 'exchange') {
      const s = st.exchange.findIndex((c, k) => !c && this.players[k].bot);
      if (s >= 0) this.timer = window.setTimeout(() => this.set(giveCard(this.state, s, botGift(this.state, s))), 250);
    } else if (st.phase === 'play' && this.players[st.turn].bot)
      // En initiation, les robots jouent plus au hasard : on apprend sans se faire écraser.
      this.timer = window.setTimeout(() => this.set(applyMove(this.state, botMove(this.state, cryptoRng, this.initiation ? 14 : undefined))), BOT_THINK_MS);
  }

  restartDeal() {
    if (!this.dealStart) return;
    clearTimeout(this.timer);
    const prev = this.state;
    this.state = { ...cloneState(this.dealStart), v: prev.v + 1 };
    this.subs.forEach((cb) => cb(prev, true));
  }

  rematch() {
    clearTimeout(this.timer);
    const prev = this.state;
    this.state = rematch(prev);
    this.subs.forEach((cb) => cb(prev, true));
    setTimeout(() => this.dealNow(), 300);
  }

  leave() {
    clearTimeout(this.timer);
    this.subs.clear();
    this.talkSubs.clear();
  }

  // Essais (?debug&chat) : un chat de table tenu sur l'appareil, pour voir et essayer le chat sans réseau.
  chat?: (t: string) => void;
  onChat?: (cb: (lines: TableMsg[], fresh: TableMsg[]) => void) => () => void;
  private talk: TableMsg[] = [];
  private talkSubs = new Set<(lines: TableMsg[], fresh: TableMsg[]) => void>();
  /** Active le chat d'essai : tes messages s'y rangent, et un robot te répond. */
  testChat() {
    const say = (seat: number, t: string) => {
      const m: TableMsg = { id: `m${this.talk.length}`, seat, name: this.players[seat].name, t, at: Date.now(), mine: seat === this.mySeat };
      this.talk.push(m);
      this.talkSubs.forEach((cb) => cb(this.talk, m.mine ? [] : [m]));
    };
    this.chat = (t) => {
      say(this.mySeat, t);
      setTimeout(() => say(1 + (this.talk.length % (this.players.length - 1)), ['Ah oui ?', 'On verra bien…', 'Joue, au lieu de causer !'][this.talk.length % 3]), 900);
    };
    this.onChat = (cb) => {
      this.talkSubs.add(cb);
      cb(this.talk, []);
      return () => this.talkSubs.delete(cb);
    };
  }

  private dealNow() {
    if (this.state.phase !== 'deal') return;
    const next = deal(this.state, cryptoRng);
    // Initiation : la première main montre les règles dans l'ordre (sortir, partager le 7, reculer de 4).
    if (this.initiation && next.dealNo === 0) stackHand(next, this.mySeat, ['A', 'K', '7', '4', '9']);
    this.set(next);
    this.dealStart = cloneState(this.state);
  }

  private set(next: GameState) {
    const prev = this.state;
    this.state = next;
    this.subs.forEach((cb) => cb(prev, false));
  }
}

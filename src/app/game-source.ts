// Source d'une partie : locale contre des robots, ou en ligne (Firebase).
// L'écran du plateau anime chaque changement d'état, puis appelle settled().
import { applyMove, botGift, botMove, cloneState, cryptoRng, deal, DEFAULT_VARIANTS, type GameState, giveCard, type Move, newGame, type Rank, rankOf, rematch, type Variants } from '../engine';
import type { CharId, ColorName } from '../ui/kit/data';

export interface SeatPlayer {
  name: string;
  char: CharId;
  color: ColorName;
  bot: boolean;
  online: boolean;
}

export interface GameSource {
  readonly mySeat: number;
  readonly local: boolean;
  readonly code: string;
  /** Partie à ton rythme : pas de minuteur, chacun joue quand il revient. */
  readonly slow?: boolean;
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

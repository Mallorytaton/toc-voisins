import {
  GameState, Move, Variants, applyMove, botGift, botMove, cryptoRng, deal, giveCard, newGame, rematch,
} from '../engine';
import type { GameController, SeatInfo } from '../ui/controller';

export interface LocalSetup {
  n: number;
  variants: Variants;
  players: { name: string; color: number; bot: boolean }[];
}

const KEY = 'toc.local';

export function loadLocal(): { setup: LocalSetup; state: GameState } | null {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function clearLocal() {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* stockage indisponible */
  }
}

/** Table locale : tout le monde joue sur le même appareil, robots possibles, sans réseau. */
export class LocalController implements GameController {
  mode = 'local' as const;
  state: GameState;
  seats: SeatInfo[];
  viewer = -1;
  curtain = false;
  notice = '';
  canRematch = true;
  private revealed = -1;
  private listeners = new Set<() => void>();
  private timer: ReturnType<typeof setTimeout> | undefined;
  private humans: number[];

  constructor(private setup: LocalSetup, saved?: GameState) {
    this.seats = setup.players.map((p) => ({ name: p.name, color: p.color, online: true, bot: p.bot }));
    this.humans = setup.players.map((p, i) => (p.bot ? -1 : i)).filter((i) => i >= 0);
    this.state = saved ?? newGame(setup.n, setup.variants, Math.floor(Math.random() * setup.n));
    this.advance();
  }

  private emit() {
    try {
      localStorage.setItem(KEY, JSON.stringify({ setup: this.setup, state: this.state }));
    } catch {
      /* stockage indisponible : la partie continue en mémoire */
    }
    for (const l of this.listeners) l();
  }

  private later(fn: () => void, ms: number) {
    clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      fn();
      this.advance();
    }, ms);
  }

  /** Décide de la prochaine action : robot, distribution, ou attente d'un humain. */
  private advance() {
    const st = this.state;
    const multi = this.humans.length > 1;
    let awaited = -1;
    if (st.phase === 'deal') this.later(() => (this.state = deal(this.state, cryptoRng)), 500);
    else if (st.phase === 'exchange') {
      const seat = st.exchange.findIndex((c) => !c);
      if (this.seats[seat].bot) this.later(() => (this.state = giveCard(this.state, seat, botGift(this.state, seat))), 250);
      else awaited = seat;
    } else if (st.phase === 'play') {
      const seat = st.turn;
      if (this.seats[seat].bot) this.later(() => (this.state = applyMove(this.state, botMove(this.state, cryptoRng))), 900);
      else awaited = seat;
    }
    if (awaited >= 0) this.viewer = awaited;
    else if (!multi) this.viewer = this.humans[0] ?? -1;
    else this.viewer = -1;
    this.curtain = multi && this.viewer >= 0 && this.viewer !== this.revealed;
    this.emit();
  }

  async play(m: Move) {
    this.state = applyMove(this.state, m);
    this.revealed = -1;
    this.advance();
  }

  async give(card: string) {
    this.state = giveCard(this.state, this.viewer, card);
    this.revealed = -1;
    this.advance();
  }

  reveal() {
    this.revealed = this.viewer;
    this.curtain = false;
    this.emit();
  }

  async rematch() {
    this.state = rematch(this.state);
    this.advance();
  }

  subscribe(cb: () => void) {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }

  leave() {
    clearTimeout(this.timer);
    this.listeners.clear();
    if (this.state.phase === 'over') clearLocal();
  }
}

import { allHome, clonePawns, controlledSeat, initialPawns, partner, teamCount, teamOf } from './board';
import { RANKS, RANK_NAMES, Rng, buildDeck, rankOf, shuffle } from './cards';
import { Ctx, doExit, doSeven, doStep, doSwap, hasPlayableCard } from './moves';
import { DEFAULT_VARIANTS, GameState, Move, PawnRef, Rank, Variants } from './types';

/** Tailles des donnes successives (cycle). Un nouveau paquet est mélangé à chaque cycle. */
export const DEAL_CYCLE = [5, 4, 4];
const LOG_MAX = 30;

export function decksFor(n: number) {
  return n === 6 ? 2 : 1;
}

export function newGame(n: number, variants: Variants = DEFAULT_VARIANTS, dealer = 0): GameState {
  if (n !== 4 && n !== 6) throw new Error('Le Toc se joue à 4 ou 6 joueurs');
  return {
    n,
    variants: { ...variants },
    pawns: initialPawns(n),
    hands: Array.from({ length: n }, () => []),
    deck: [],
    dealNo: 0,
    dealer,
    turn: (dealer + 1) % n,
    phase: 'deal',
    exchange: Array(n).fill(''),
    passed: Array(n).fill(false),
    winner: -1,
    log: [],
    lastCard: '',
    lastCaptures: [],
    lastMove: '',
    stats: { captures: Array(n).fill(0), exits: Array(n).fill(0), cards: Array.from({ length: n }, () => ({})) },
    startedAt: 0,
    v: 0,
  };
}

export function cloneState(st: GameState): GameState {
  return {
    ...st,
    variants: { ...st.variants },
    pawns: clonePawns(st.pawns),
    hands: st.hands.map((h) => h.slice()),
    deck: st.deck.slice(),
    exchange: st.exchange.slice(),
    passed: st.passed.slice(),
    log: st.log.slice(),
    lastCaptures: st.lastCaptures.slice(),
    stats: { captures: st.stats.captures.slice(), exits: st.stats.exits.slice(), cards: st.stats.cards.map((c) => ({ ...c })) },
  };
}

/** Distribue la donne suivante. */
export function deal(st0: GameState, rng: Rng): GameState {
  if (st0.phase !== 'deal') throw new Error('Pas de distribution en cours');
  const st = cloneState(st0);
  const size = DEAL_CYCLE[st.dealNo % DEAL_CYCLE.length];
  if (st.dealNo % DEAL_CYCLE.length === 0 || st.deck.length < size * st.n) {
    st.deck = shuffle(buildDeck(decksFor(st.n), st.variants.jokers), rng);
  }
  st.hands = Array.from({ length: st.n }, () => []);
  for (let r = 0; r < size; r++) {
    for (let k = 1; k <= st.n; k++) st.hands[(st.dealer + k) % st.n].push(st.deck.pop()!);
  }
  st.phase = 'exchange';
  st.exchange = Array(st.n).fill('');
  st.passed = Array(st.n).fill(false);
  st.turn = (st.dealer + 1) % st.n;
  st.lastCard = '';
  st.lastCaptures = [];
  st.lastMove = '';
  st.log = pushLog(st.log, { seat: st.dealer, text: `@${st.dealer} distribue ${size} cartes`, card: '' });
  st.v++;
  return st;
}

/** Un joueur donne une carte face cachée à son partenaire. */
export function giveCard(st0: GameState, seat: number, card: string): GameState {
  if (st0.phase !== 'exchange') throw new Error("Pas d'échange en cours");
  if (st0.exchange[seat]) throw new Error('Carte déjà donnée');
  const idx = st0.hands[seat].indexOf(card);
  if (idx < 0) throw new Error("Carte absente de la main");
  const st = cloneState(st0);
  st.hands[seat].splice(idx, 1);
  st.exchange[seat] = card;
  if (st.exchange.every((c) => c)) {
    for (let s = 0; s < st.n; s++) st.hands[s].push(st.exchange[partner(st.n, s)]);
    st.exchange = Array(st.n).fill('');
    st.phase = 'play';
    st.turn = (st.dealer + 1) % st.n;
  }
  st.v++;
  return st;
}

function pushLog(log: GameState['log'], e: GameState['log'][number]) {
  const out = [...log, e];
  return out.length > LOG_MAX ? out.slice(out.length - LOG_MAX) : out;
}

export function expectedSteps(v: Variants, as: Rank): number {
  const fwd: Partial<Record<Rank, number>> = {
    A: 1, '2': 2, '3': 3, '4': -4, '5': 5, '6': 6, '8': 8, '9': 9, '10': 10, Q: 12, K: 13,
  };
  if (as === 'J') return v.jackEleven ? 11 : 0;
  if (as === 'K') return v.kingThirteen ? 13 : 0;
  return fwd[as] ?? 0;
}

function cardLabel(card: string, as: Rank) {
  const r = rankOf(card);
  return r === 'X' ? `Joker comme ${RANK_NAMES[as]}` : RANK_NAMES[as];
}

function capText(caps: PawnRef[], actor: number) {
  if (!caps.length) return '';
  const seats = [...new Set(caps.map((c) => c.s))];
  return ' et renvoie à la base ' + seats.map((s) => (s === actor ? 'un de ses pions' : `@${s}`)).join(', ');
}

/** Applique un coup après l'avoir validé. Lève une erreur si le coup est illégal. */
export function applyMove(st0: GameState, move: Move): GameState {
  if (st0.phase !== 'play') throw new Error("Ce n'est pas le moment de jouer");
  const seat = st0.turn;
  const st = cloneState(st0);
  const hand = st.hands[seat];
  let text: string;
  let caps: PawnRef[] = [];

  if (move.kind === 'discard') {
    if (hand.length === 0) throw new Error('Main vide');
    if (hasPlayableCard(st0)) throw new Error('Un coup est possible, défausse interdite');
    if (st.variants.discardOne) {
      const idx = hand.indexOf(move.card);
      if (idx < 0) throw new Error('Carte absente de la main');
      hand.splice(idx, 1);
      st.lastCard = move.card;
      text = `@${seat} ne peut pas jouer et défausse une carte`;
    } else {
      if (move.card) throw new Error('Toute la main doit être défaussée');
      st.hands[seat] = [];
      st.passed[seat] = true;
      st.lastCard = '';
      text = `@${seat} ne peut pas jouer et défausse sa main`;
    }
  } else {
    const idx = hand.indexOf(move.card);
    if (idx < 0) throw new Error('Carte absente de la main');
    const r = rankOf(move.card);
    if (!(r === move.as || (r === 'X' && RANKS.includes(move.as)))) throw new Error('Valeur de carte invalide');
    const ctx: Ctx = { n: st.n, v: st.variants, pawns: st.pawns };
    const cs = controlledSeat(st.n, st.pawns, seat);
    const label = cardLabel(move.card, move.as);
    const own = (ref: PawnRef) => (ref.s === seat ? 'un pion' : `un pion de @${ref.s}`);
    let res: PawnRef[] | null = null;
    switch (move.kind) {
      case 'exit':
        if ((move.as !== 'A' && move.as !== 'K') || move.pawn.s !== cs) throw new Error('Sortie invalide');
        res = doExit(ctx, cs, move.pawn.i);
        text = `@${seat} sort ${own(move.pawn)} (${label})`;
        break;
      case 'step': {
        const exp = expectedSteps(st.variants, move.as);
        const other = move.as === '5' && st.variants.fiveOthers;
        if (exp === 0 || move.steps !== exp) throw new Error('Déplacement invalide');
        if (other ? move.pawn.s === seat : move.pawn.s !== cs) throw new Error('Pion non jouable');
        res = doStep(ctx, move.pawn, move.steps);
        const suffix = /^\d+$/.test(label) ? '' : ` (${label})`;
        text =
          move.steps < 0
            ? `@${seat} recule ${own(move.pawn)} de ${-move.steps}${suffix}`
            : `@${seat} avance ${own(move.pawn)} de ${move.steps}${suffix}`;
        break;
      }
      case 'swap':
        if (move.as !== 'J' || st.variants.jackEleven || move.pawn.s !== cs) throw new Error('Échange invalide');
        res = doSwap(ctx, move.pawn, move.target) ? [] : null;
        text = `@${seat} échange ${own(move.pawn)} avec ${move.target.s === seat ? 'un autre de ses pions' : `un pion de @${move.target.s}`} (${label})`;
        break;
      case 'seven':
        if (move.as !== '7') throw new Error('7 invalide');
        if (!st.variants.sevenAnyPawns && new Set(move.parts.map((p) => `${p.pawn.s}.${p.pawn.i}`)).size > 2)
          throw new Error('Le 7 se partage entre deux pions au plus');
        res = doSeven(ctx, seat, move.parts);
        text = `@${seat} répartit le 7 (${move.parts.map((p) => p.steps).join(' + ')})${move.as !== rankOf(move.card) ? ' avec un Joker' : ''}`;
        break;
    }
    if (!res) throw new Error('Coup impossible');
    caps = res;
    text += capText(caps, seat);
    hand.splice(idx, 1);
    st.lastCard = move.card;
  }

  st.lastCaptures = caps;
  st.lastMove = { seat, move };
  if (move.kind === 'exit') st.stats.exits[seat]++;
  if (move.kind !== 'discard') {
    const rk = rankOf(move.card);
    st.stats.cards[seat][rk] = (st.stats.cards[seat][rk] ?? 0) + 1;
  }
  st.stats.captures[seat] += caps.filter((c) => teamOf(st.n, c.s) !== teamOf(st.n, seat)).length;
  st.log = pushLog(st.log, { seat, text, card: move.card });

  // Victoire ?
  for (let t = 0; t < teamCount(st.n); t++) {
    if (allHome(st.n, st.pawns, t) && allHome(st.n, st.pawns, partner(st.n, t))) {
      st.winner = t;
      st.phase = 'over';
      st.log = pushLog(st.log, { seat, text: `L'équipe @${t} et @${partner(st.n, t)} gagne !`, card: '' });
      st.v++;
      return st;
    }
  }
  advanceTurn(st);
  st.v++;
  return st;
}

function advanceTurn(st: GameState) {
  for (let k = 1; k <= st.n; k++) {
    const s = (st.turn + k) % st.n;
    if (st.hands[s].length > 0) {
      st.turn = s;
      return;
    }
  }
  // Plus personne n'a de cartes : donne suivante.
  st.dealNo++;
  st.dealer = (st.dealer + 1) % st.n;
  st.phase = 'deal';
  st.turn = (st.dealer + 1) % st.n;
}

/** Nouvelle partie avec les mêmes réglages (revanche). */
export function rematch(st: GameState): GameState {
  const g = newGame(st.n, st.variants, (st.dealer + 1) % st.n);
  g.v = st.v + 1;
  return g;
}


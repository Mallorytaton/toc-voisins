import { inBase, inHome, partner, teamOf, trackLen } from './board';
import { Rng, rankOf } from './cards';
import { applyMove } from './game';
import { legalMoves } from './moves';
import type { Card, GameState, Move } from './types';

/** Score d'une position du point de vue de l'équipe de `seat` (plus c'est haut, mieux c'est). */
function evaluate(st: GameState, seat: number): number {
  const n = st.n;
  const L = trackLen(n);
  const myTeam = teamOf(n, seat);
  let score = 0;
  for (let s = 0; s < n; s++) {
    const sign = teamOf(n, s) === myTeam ? 1 : -0.7;
    for (const pw of st.pawns[s]) {
      let v = 0;
      if (inBase(pw.p)) v = 0;
      else if (inHome(n, pw.p)) v = L + 40 + pw.p;
      else v = 15 + (pw.p > L - 2 ? 0 : pw.p); // au-delà de son entrée, le pion doit refaire un tour
      score += sign * v;
    }
  }
  if (st.winner >= 0) score += st.winner === myTeam ? 1e6 : -1e6;
  return score;
}

/** Robot simple : choisit le coup qui maximise l'évaluation, avec un peu d'aléa. */
export function botMove(st: GameState, rng: Rng, noise = 4): Move {
  const moves = legalMoves(st);
  if (moves.length === 1) return moves[0];
  let best = moves[0];
  let bestScore = -Infinity;
  for (const m of moves) {
    const after = applyMove(st, m);
    // On garde les Jokers et les 7 si un coup équivalent existe avec une autre carte.
    const keep = m.kind !== 'discard' && rankOf(m.card) === 'X' ? 6 : 0;
    const sc = evaluate(after, st.turn) - keep + rng() * noise;
    if (sc > bestScore) {
      bestScore = sc;
      best = m;
    }
  }
  return best;
}

/** Coup uniformément aléatoire parmi les coups légaux (simulation). */
export function randomMove(st: GameState, rng: Rng): Move {
  const moves = legalMoves(st);
  return moves[Math.floor(rng() * moves.length)];
}

/** Carte que le robot donne à son partenaire : une sortie si le partenaire a des pions à la base. */
export function botGift(st: GameState, seat: number): Card {
  const hand = st.hands[seat];
  const p = partner(st.n, seat);
  const needsExit = st.pawns[p].some((pw) => inBase(pw.p));
  if (needsExit) {
    const exit = hand.find((c) => ['A', 'K'].includes(rankOf(c)));
    if (exit) return exit;
  }
  const order = ['2', '3', '6', '8', '9', '10', '5', 'Q', '4', 'J', 'A', 'K', '7', 'X'];
  return hand.slice().sort((a, b) => order.indexOf(rankOf(a)) - order.indexOf(rankOf(b)))[0];
}

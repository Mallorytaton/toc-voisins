import { describe, expect, it } from 'vitest';
import {
  DEFAULT_VARIANTS, GameState, Rng, Variants, applyMove, deal, giveCard, inHome, legalMoves, newGame,
  onTrack, randomMove, seededRng, squareOf,
} from '../src/engine';

function checkInvariants(st: GameState) {
  const seen = new Set<number>();
  for (let s = 0; s < st.n; s++) {
    expect(st.pawns[s]).toHaveLength(4);
    const homes = new Set<number>();
    for (const pw of st.pawns[s]) {
      if (onTrack(st.n, pw.p)) {
        const sq = squareOf(st.n, s, pw.p);
        expect(seen.has(sq), 'deux pions sur la même case').toBe(false);
        seen.add(sq);
      } else if (inHome(st.n, pw.p)) {
        expect(homes.has(pw.p), 'deux pions dans la même case maison').toBe(false);
        homes.add(pw.p);
      } else expect(pw.p).toBe(-1);
    }
  }
}

/** Joue une partie complète au hasard. Retourne le nombre de coups. */
export function playRandomGame(n: number, rng: Rng, variants: Variants, maxMoves = 20000): GameState {
  let st = newGame(n, variants, Math.floor(rng() * n));
  let moves = 0;
  while (st.phase !== 'over') {
    if (st.phase === 'deal') st = deal(st, rng);
    else if (st.phase === 'exchange') {
      for (let s = 0; s < n; s++) {
        const h = st.hands[s];
        st = giveCard(st, s, h[Math.floor(rng() * h.length)]);
      }
    } else {
      const legal = legalMoves(st);
      expect(legal.length).toBeGreaterThan(0);
      st = applyMove(st, randomMove(st, rng));
      checkInvariants(st);
      if (++moves > maxMoves) throw new Error('partie bloquée');
    }
  }
  return st;
}

const variantSets: Variants[] = [
  DEFAULT_VARIANTS,
  { jackEleven: true, fiveOthers: true, sevenNoPassCapture: true, startBlocks: false, jokers: 0, discardOne: true },
  { ...DEFAULT_VARIANTS, jokers: 4, fiveOthers: true },
];

describe('simulation de parties aléatoires', () => {
  for (const n of [4, 6]) {
    it(`20 parties complètes à ${n} joueurs sans erreur ni blocage`, () => {
      const rng = seededRng(1000 + n);
      let total = 0;
      for (let g = 0; g < 20; g++) {
        const st = playRandomGame(n, rng, variantSets[g % variantSets.length]);
        expect(st.winner).toBeGreaterThanOrEqual(0);
        total += st.dealNo;
      }
      expect(total).toBeGreaterThan(0);
    }, 600_000);
  }
});

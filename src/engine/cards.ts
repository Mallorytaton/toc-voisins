import type { Card, Rank } from './types';

export const RANKS: Rank[] = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
export const SUITS = ['S', 'H', 'D', 'C'] as const;

export const RANK_NAMES: Record<Rank, string> = {
  A: 'As', '2': '2', '3': '3', '4': '4', '5': '5', '6': '6', '7': '7', '8': '8', '9': '9', '10': '10',
  J: 'Valet', Q: 'Dame', K: 'Roi', X: 'Joker',
};

export const SUIT_SYMBOLS: Record<string, string> = { S: '♠', H: '♥', D: '♦', C: '♣', J: '★' };

export function rankOf(c: Card): Rank | '?' {
  if (c === '?') return '?';
  return c.slice(0, -2) as Rank;
}

export function suitOf(c: Card): string {
  return c[c.length - 2];
}

export function isRed(c: Card): boolean {
  const s = suitOf(c);
  return s === 'H' || s === 'D';
}

export function buildDeck(decks: number, jokersPerDeck: number): Card[] {
  const out: Card[] = [];
  for (let d = 0; d < decks; d++) {
    for (const s of SUITS) for (const r of RANKS) out.push(r + s + d);
    for (let j = 0; j < jokersPerDeck; j++) out.push('XJ' + (d * jokersPerDeck + j));
  }
  return out;
}

export type Rng = () => number;

/** Générateur pseudo-aléatoire déterministe (tests, simulation). */
export function seededRng(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Aléa cryptographique pour les vraies parties. */
export const cryptoRng: Rng = () => {
  const b = new Uint32Array(1);
  crypto.getRandomValues(b);
  return b[0] / 4294967296;
};

export function shuffle<T>(arr: T[], rng: Rng): T[] {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

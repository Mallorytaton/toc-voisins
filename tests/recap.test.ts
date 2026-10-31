import { describe, expect, it } from 'vitest';
import { type RecapGame, soireeRecap } from '../src/app/recap';

const H = 3_600_000;
const NOW = Date.UTC(2026, 9, 31, 12);
const game = (hoursAgo: number, winner: number, extra: Partial<RecapGame> = {}): RecapGame =>
  ({ winner, at: NOW - hoursAgo * H, duration: 30 * 60_000, captures: [0, 0, 0, 0], exits: [0, 0, 0, 0], ...extra });

describe('récap de la soirée', () => {
  it('regroupe les parties jouées d’affilée et ignore les plus anciennes', () => {
    const r = soireeRecap([game(14, 0), game(15, 1), game(16, 0), game(40, 1)], 2, 4, NOW)!;
    expect(r.count).toBe(3);
    expect(r.wins).toEqual([2, 1]);
    expect(r.start).toBe(NOW - 16 * H);
    expect(r.end).toBe(NOW - 14 * H);
    expect(r.playMs).toBe(90 * 60_000);
  });

  it('désigne le roi du BOUM et celui qui a sorti le plus de billes', () => {
    const r = soireeRecap([
      game(2, 0, { captures: [1, 0, 2, 0], exits: [3, 1, 2, 0] }),
      game(3, 1, { captures: [0, 1, 2, 0], exits: [2, 4, 0, 0] }),
    ], 2, 4, NOW)!;
    expect(r.boum).toEqual({ seat: 2, n: 4 });
    expect(r.exits).toEqual({ seat: 0, n: 5 });
  });

  it('ne garde pas une soirée de plus de 3 jours', () => {
    expect(soireeRecap([game(80, 0)], 2, 4, NOW)).toBeNull();
    expect(soireeRecap([], 2, 4, NOW)).toBeNull();
  });

  it('accepte les parties hors app (durée inconnue)', () => {
    const r = soireeRecap([game(1, 1, { duration: 0 }), game(2, 1)], 2, 4, NOW)!;
    expect(r.count).toBe(2);
    expect(r.longest).toBe(30 * 60_000);
    expect(r.boum).toBeNull();
  });
});

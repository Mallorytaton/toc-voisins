import { describe, expect, it } from 'vitest';
import { HOME_ENTRY_OFFSET, SQUARES_PER_SEAT, homeEntry, trackLen } from '../src/engine';
import { armOf, geom, pawnXY, seatOfArm } from '../src/ui/board/geom';

const dist = (a: [number, number], b: [number, number]) => Math.hypot(a[0] - b[0], a[1] - b[1]);

describe('géométrie du plateau (maquette)', () => {
  for (const N of [4, 6] as const) {
    it(`${N} joueurs : 16 trous par joueur, sans doublon`, () => {
      const g = geom(N);
      expect(g.T).toBe(trackLen(N));
      expect(g.track).toHaveLength(N * SQUARES_PER_SEAT);
      const keys = new Set(g.track.map(([x, y]) => `${Math.round(x)},${Math.round(y)}`));
      expect(keys.size).toBe(g.T);
      for (const [x, y] of g.track) {
        expect(x).toBeGreaterThan(0);
        expect(x).toBeLessThan(360);
        expect(y).toBeGreaterThan(0);
        expect(y).toBeLessThan(360);
      }
    });

    it(`${N} joueurs : l'entrée de la maison est le trou juste avant le départ, collé à la maison`, () => {
      const g = geom(N);
      const entry = g.track[g.sj - HOME_ENTRY_OFFSET];
      const start = g.track[g.sj];
      const home1 = g.lanes[0][0];
      // La maison commence au plus près du trou d'entrée, et non du départ.
      expect(dist(entry, home1)).toBeLessThan(dist(start, home1));
      // Le pion sur sa case d'entrée est bien dessiné sur ce trou.
      expect(pawnXY(g, 0, seatOfArm(N, 0, 0), 0, homeEntry(N))).toEqual(entry);
    });

    it(`${N} joueurs : le joueur est en bas et son partenaire en face`, () => {
      const g = geom(N);
      const me = 1;
      const [, yMe] = g.avs[armOf(N, me, me)];
      const [, yPartner] = g.avs[armOf(N, me, (me + N / 2) % N)];
      expect(yMe).toBeGreaterThan(180);
      expect(yPartner).toBeLessThan(180);
      for (let s = 0; s < N; s++) expect(seatOfArm(N, me, armOf(N, me, s))).toBe(s);
    });
  }
});

import { describe, expect, it } from 'vitest';
import { HOME_ENTRY_OFFSET, SQUARES_PER_SEAT, homeEntry, trackLen } from '../src/engine';
import { SEATED, type Tilt, armOf, geom, pawnXY, planeShift, projector, seatOfArm, shiftCss, shiftPoint } from '../src/ui/board/geom';

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

describe('plateau en relief : changer de point de vue', () => {
  const look: Tilt = { ...SEATED, deg: SEATED.deg + 4, yaw: 6 };
  const points: [number, number][] = [[0, 0], [360, 0], [180, 180], [40, 300], [333, 71], [360, 360]];

  it('regard droit devant : la projection ne change pas avec le second angle à zéro', () => {
    const a = projector(SEATED), b = projector({ ...SEATED, yaw: 0 });
    for (const [x, y] of points) expect(b.at(x, y)).toEqual(a.at(x, y));
    expect(b.css).toBe(a.css);
    // Le centre du plateau reste le pivot : il ne bouge pas quand le regard tourne.
    const [cx, cy] = projector(look).at(180, 180);
    expect(cx).toBeCloseTo(180, 9);
    expect(cy).toBeCloseTo(180, 9);
  });

  it('vu de la gauche, le bord proche part à droite et le fond à gauche', () => {
    const rest = projector(SEATED), left = projector({ ...SEATED, yaw: 6 });
    expect(left.at(180, 360)[0]).toBeGreaterThan(rest.at(180, 360)[0]);
    expect(left.at(180, 0)[0]).toBeLessThan(rest.at(180, 0)[0]);
    // Ce qui dépasse du bois (une bille, la pioche) bouge un peu plus que ce qui est posé à plat au même endroit.
    expect(left.at(180, 180, 12)[0]).toBeGreaterThan(left.at(180, 180)[0]);
  });

  it('les marques posées à plat suivent exactement le plan (bois, puis sol sous la dalle)', () => {
    const rest = projector(SEATED), now = projector(look);
    for (const z of [0, -19]) {
      const m = planeShift(SEATED, look, z);
      for (const [x, y] of points) {
        const [x0, y0] = rest.at(x, y, z), [x1, y1] = now.at(x, y, z);
        const [u, v] = shiftPoint(m, x0, y0);
        expect(u).toBeCloseTo(x1, 6);
        expect(v).toBeCloseTo(y1, 6);
      }
    }
  });

  it('un calque décalé du cadre du plateau se déforme autour du bon point', () => {
    const o: [number, number] = [8, -11];
    const m = planeShift(SEATED, look, 0, o), plain = planeShift(SEATED, look);
    const [x, y] = shiftPoint(plain, 120, 250), [u, v] = shiftPoint(m, 120 + o[0], 250 + o[1]);
    expect(u).toBeCloseTo(x + o[0], 6);
    expect(v).toBeCloseTo(y + o[1], 6);
    // Sans changement de regard : aucune déformation.
    expect(shiftCss(planeShift(SEATED, SEATED))).toBe('matrix3d(1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1)');
  });
});

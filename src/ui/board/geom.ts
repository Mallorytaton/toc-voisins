// Géométrie du plateau, reprise telle quelle de geom(N) dans la maquette.
// Repère 800 × 800 centré en (400, 400), ramené à un plateau de 360 × 360 par le facteur f.
import { SQUARES_PER_SEAT, inBase, inHome, trackLen } from '../../engine';

export type Pt = [number, number];

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
  r: number;
  rot: number;
}

export interface Geom {
  N: 4 | 6;
  /** Nombre total de trous du circuit */
  T: number;
  /** Index du trou de départ dans un bras (bout du bras, index 3 sur 0–4) */
  sj: number;
  track: Pt[];
  /** lanes[bras][0..3] : maison, du bout du bras vers le centre */
  lanes: Pt[][];
  /** res[bras][0..3] : réserve, entre ce bras et le suivant */
  res: Pt[][];
  /** Centre de l'avatar de chaque bras */
  avs: Pt[];
  /** Fonds teintés : maison (lpad) et réserve (rpad) */
  arms: { lpad: Box; rpad: Box }[];
}

const H = SQUARES_PER_SEAT;
const r1 = (n: number) => Math.round(n * 10) / 10;
const cache = new Map<number, Geom>();

export function geom(N: 4 | 6): Geom {
  const hit = cache.get(N);
  if (hit) return hit;
  const c = 180;
  const P = N === 4
    ? { f: 0.45, w: 92, rin: 226, rout: 410, rg: 4, tg: 4, cg: 4, ls: 45, av: 494 }
    : { f: 0.39, w: 80, rin: 80 * Math.sqrt(3), rout: 360, rg: 6, tg: 4, cg: 0, ls: 37, av: 452 };
  const f = P.f, sj = P.rg + 3, T = N * H, th0 = N === 4 ? -135 : -90, rad = Math.PI / 180;
  const pt = (a: Pt, p: Pt, r: number, t: number): Pt => [c + (a[0] * r + p[0] * t) * f, c + (a[1] * r + p[1] * t) * f];
  const lerp = (A: Pt, B: Pt, t: number): Pt => [A[0] + (B[0] - A[0]) * t, A[1] + (B[1] - A[1]) * t];
  const box = (cx: number, cy: number, w: number, h: number, rot: number, r: number): Box =>
    ({ x: r1(cx - w / 2), y: r1(cy - h / 2), w: r1(w), h: r1(h), r: r1(r), rot: r1(rot) });
  const ax: { th: number; a: Pt; p: Pt }[] = [];
  for (let k = 0; k < N; k++) {
    const th = th0 + (k * 360) / N, a: Pt = [Math.cos(th * rad), Math.sin(th * rad)];
    ax.push({ th, a, p: [-a[1], a[0]] });
  }
  const track: Pt[] = [], lanes: Pt[][] = [], res: Pt[][] = [], avs: Pt[] = [], arms: Geom['arms'] = [];
  for (let k = 0; k < N; k++) {
    const { th, a, p } = ax[k], nx = ax[(k + 1) % N];
    const Li = pt(a, p, P.rin, -P.w), Lo = pt(a, p, P.rout, -P.w), Ro = pt(a, p, P.rout, P.w), Ri = pt(a, p, P.rin, P.w), nL = pt(nx.a, nx.p, P.rin, -P.w);
    ([[Li, Lo, P.rg], [Lo, Ro, P.tg], [Ro, Ri, P.rg], [Ri, nL, P.cg]] as [Pt, Pt, number][]).forEach(([A, B, n]) => {
      for (let i = 0; i < n; i++) track.push(lerp(A, B, i / n));
    });
    lanes.push([1, 2, 3, 4].map((i) => pt(a, p, P.rout - P.ls * i, 0)));
    avs.push(pt(a, p, P.av, 0));
    const bt = th + 180 / N, b: Pt = [Math.cos(bt * rad), Math.sin(bt * rad)], q: Pt = [-b[1], b[0]];
    const rp = N === 4 ? [[-55, 335], [-20, 300], [20, 300], [55, 335]] : [[-20, 310], [20, 310], [-20, 350], [20, 350]];
    res.push(rp.map(([t, r]) => pt(b, q, r, t)));
    const lc = pt(a, p, P.rout - P.ls * 2.5, 0), rc = pt(b, q, N === 4 ? 320 : 330, 0);
    arms.push({
      lpad: box(lc[0], lc[1], (P.ls * 3 + 44) * f, 44 * f, th, 22 * f),
      rpad: N === 4 ? box(rc[0], rc[1], 150 * f, 80 * f, bt + 90, 40 * f) : box(rc[0], rc[1], 84 * f, 84 * f, bt, 26 * f),
    });
  }
  const g: Geom = { N, T, sj, track, lanes, res, avs, arms };
  cache.set(N, g);
  return g;
}

/** Bras du joueur qui regarde : en bas (bras 2 à 4 joueurs, bras 3 à 6). */
export const meArm = (N: 4 | 6) => (N === 4 ? 2 : 3);

/** Bras où est assise la place `seat` du moteur, vue depuis la place `me`. */
export const armOf = (N: 4 | 6, me: number, seat: number) => (((seat - me + meArm(N)) % N) + N) % N;

/** Place du moteur assise sur le bras `arm`. */
export const seatOfArm = (N: 4 | 6, me: number, arm: number) => (((arm - meArm(N) + me) % N) + N) % N;

/** Position à l'écran d'un pion du moteur (place `seat`, pion `i`, progression `p`). */
export function pawnXY(g: Geom, me: number, seat: number, i: number, p: number): Pt {
  const arm = armOf(g.N, me, seat);
  const L = trackLen(g.N);
  if (inBase(p)) return g.res[arm][i];
  if (inHome(g.N, p)) return g.lanes[arm][p - L - 1];
  return g.track[(arm * H + g.sj + p) % g.T];
}

/** Index du trou du circuit pour une progression sur le parcours (pour les points de trajet). */
export const trackIndex = (g: Geom, me: number, seat: number, p: number) => (armOf(g.N, me, seat) * H + g.sj + p) % g.T;

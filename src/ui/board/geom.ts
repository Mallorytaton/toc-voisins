// Géométrie du plateau, dans un repère 360 × 360 centré en (180, 180).
// Les bras sont en croix droite : le joueur qui regarde est en bas, sa maison pointe vers lui, son partenaire est en face
// (comme sur le plateau en bois et le plateau peint de Mallory). À 6, le plateau est une étoile à six bras.
// Le plateau se regarde incliné, depuis sa place : `projector` et `tilted` passent du plan du plateau à l'écran.
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
  /** Centre du perso de chaque bras, là où il ne cache aucun trou */
  avs: Pt[];
  /** Fonds teintés : maison (lpad) et réserve (rpad) */
  arms: { lpad: Box; rpad: Box }[];
}

const H = SQUARES_PER_SEAT;
/** Distance entre le centre d'un perso des côtés et le bord du plateau */
const AV_EDGE = 14;
const r1 = (n: number) => Math.round(n * 10) / 10;
const cache = new Map<number, Geom>();

export function geom(N: 4 | 6): Geom {
  const hit = cache.get(N);
  if (hit) return hit;
  const c = 180;
  const P = N === 4
    ? { f: 0.405, w: 92, rin: 226, rout: 410, rg: 4, tg: 4, cg: 4, ls: 45, av: 0 }
    : { f: 0.39, w: 80, rin: 80 * Math.sqrt(3), rout: 360, rg: 6, tg: 4, cg: 0, ls: 37, av: 452 };
  const f = P.f, sj = P.rg + 3, T = N * H, th0 = -90, rad = Math.PI / 180;
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
    if (N === 6) {
      // Persos : sur l'axe du bras ; ceux des côtés vont jusqu'au bord du plateau, pour ne cacher ni trou ni bille.
      // En bas, un peu plus haut : leur nom (dessous) ne touche pas la consigne sous le plateau.
      const av = Math.abs(a[0]) > 0.3 ? pt(a, p, (c - AV_EDGE) / Math.abs(a[0]) / f, 0) : pt(a, p, P.av, 0);
      if (Math.abs(a[0]) > 0.3) av[1] = Math.min(av[1], 2 * c - AV_EDGE - 8);
      avs.push(av);
    }
    const bt = th + 180 / N, b: Pt = [Math.cos(bt * rad), Math.sin(bt * rad)], q: Pt = [-b[1], b[0]];
    const rp = N === 4 ? [[-55, 335], [-20, 300], [20, 300], [55, 335]] : [[-20, 310], [20, 310], [-20, 350], [20, 350]];
    res.push(rp.map(([t, r]) => pt(b, q, r, t)));
    const lc = pt(a, p, P.rout - P.ls * 2.5, 0), rc = pt(b, q, N === 4 ? 320 : 330, 0);
    arms.push({
      lpad: box(lc[0], lc[1], (P.ls * 3 + 44) * f, 44 * f, th, 22 * f),
      rpad: N === 4 ? box(rc[0], rc[1], 150 * f, 80 * f, bt + 90, 40 * f) : box(rc[0], rc[1], 84 * f, 84 * f, bt, 26 * f),
    });
  }
  // À 4, les bras touchent les bords : vu de dessus, chaque perso se tient dans le coin de sa réserve
  // (en face à droite, à droite en bas, soi en bas à gauche, à gauche en haut), là où le bois est libre.
  if (N === 4) avs.push([334, 26], [334, 334], [26, 334], [26, 26]);
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

/** Position d'un pion du moteur (place `seat`, pion `i`, progression `p`) dans la géométrie `g`. */
export function pawnXY(g: Geom, me: number, seat: number, i: number, p: number): Pt {
  const arm = armOf(g.N, me, seat);
  const L = trackLen(g.N);
  if (inBase(p)) return g.res[arm][i];
  if (inHome(g.N, p)) return g.lanes[arm][p - L - 1];
  return g.track[(arm * H + g.sj + p) % g.T];
}

/** Index du trou du circuit pour une progression sur le parcours (pour les points de trajet). */
export const trackIndex = (g: Geom, me: number, seat: number, p: number) => (armOf(g.N, me, seat) * H + g.sj + p) % g.T;

// ---------- Le plateau vu depuis sa place ----------

/** Inclinaison du plateau : angle (degrés), distance de l'œil (px) et échelle du plateau dans son cadre. */
export interface Tilt {
  deg: number;
  dist: number;
  k: number;
}
/** Vue de dessus (écran de table, réglage « à plat ») */
export const FLAT: Tilt = { deg: 0, dist: 1400, k: 1 };
/** Vue de sa place : le fond du plateau s'éloigne, le bord proche tient dans la largeur du téléphone. */
export const SEATED: Tilt = { deg: 34, dist: 1400, k: 0.955 };

/**
 * Passe du plan du plateau à l'écran, dans le même repère 360 × 360 (centre commun).
 * C'est exactement ce que fait le navigateur avec `css` posé sur le plan : les billes, les persos et les effets,
 * eux, restent debout et sont placés avec `at`.
 */
export function projector(t: Tilt, c = 180) {
  const th = (t.deg * Math.PI) / 180, cos = Math.cos(th), sin = Math.sin(th);
  /** Point du plan → [x, y] à l'écran et grossissement à cet endroit (proche : plus gros). */
  const at = (x: number, y: number): [number, number, number] => {
    const X = (x - c) * t.k, Y = (y - c) * t.k;
    const s = t.dist / (t.dist - Y * sin);
    return [c + X * s, c + Y * cos * s, s * t.k];
  };
  /** Grossissement d'un objet posé sur le plateau à la hauteur d'écran `y`. */
  const scaleAtY = (y: number) => {
    const Yp = y - c;
    const Y = (Yp * t.dist) / (t.dist * cos + Yp * sin);
    return (t.dist / (t.dist - Y * sin)) * t.k;
  };
  return { at, scaleAtY, css: t.deg ? `perspective(${t.dist}px) rotateX(${t.deg}deg) scale(${t.k})` : t.k === 1 ? 'none' : `scale(${t.k})` };
}

/**
 * Où se tiennent les persos quand le plateau est vu de sa place (à 4) : le partenaire en face, au-dessus du bord du fond ;
 * les adversaires dans les deux coins du fond, que la perspective libère ; soi dans le coin proche, à gauche.
 * À 6, les persos gardent leur place au bout des bras.
 */
export const seatedAvs = (g: Geom): Pt[] => (g.N === 4 ? [[180, -32], [362, -2], [30, 352], [-2, -2]] : g.avs);

/** La même géométrie, vue inclinée : toutes les positions sont celles de l'écran (les fonds teintés restent ceux du plan). */
export function tilted(g: Geom, t: Tilt): Geom {
  const { at } = projector(t);
  const P = (p: Pt): Pt => { const [x, y] = at(p[0], p[1]); return [r1(x), r1(y)]; };
  return { ...g, track: g.track.map(P), lanes: g.lanes.map((l) => l.map(P)), res: g.res.map((l) => l.map(P)), avs: g.avs.map(P) };
}

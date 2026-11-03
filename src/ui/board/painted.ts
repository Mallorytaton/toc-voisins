// Plateau peint (boutique, parties à 4) : la photo du plateau de Mallory, bras en croix et réserves dans les coins.
// La photo tourne d'un quart de tour pour que la couleur du joueur soit en bas, comme sur le plateau en bois.
import type { ColorName } from '../kit/data';
import type { Geom, Pt } from './geom';
import { PAINTED } from './painted-data';

/** Bras de la photo pour chaque couleur (sens du jeu) : haut jaune, droite vert, bas rouge, gauche bleu. */
const PHYS: Partial<Record<ColorName, number>> = { yellow: 0, teal: 1, coral: 2, blue: 3 };
const K = 360 / 1200;
/** Coin de la réserve de chaque bras de la photo (haut → coin haut droite…), où se tient le perso. */
const CORNER: Pt[] = [[1170, 30], [1170, 1170], [30, 1170], [30, 30]];

/** Géométrie vue depuis la place de couleur `color` (assise en bas), et le quart de tour de la photo (degrés). */
export function paintedGeom(color: ColorName): { g: Geom; turn: number } {
  const m = PHYS[color] ?? 2;
  const k = (((2 - m) % 4) + 4) % 4;
  const R = (p: readonly number[]): Pt => {
    let [x, y] = p;
    for (let i = 0; i < k; i++) [x, y] = [1200 - y, x];
    return [x * K, y * K];
  };
  // Bras 2 du jeu (le joueur qui regarde, en bas) = bras m de la photo.
  const phys = (a: number) => (a + m - 2 + 4) % 4;
  const arms = [0, 1, 2, 3];
  const track: Pt[] = arms.flatMap((a) => PAINTED.track.slice(phys(a) * 16, phys(a) * 16 + 16).map(R));
  const none = { x: 0, y: 0, w: 0, h: 0, r: 0, rot: 0 };
  return {
    g: {
      N: 4, T: 64, sj: 7, track,
      lanes: arms.map((a) => PAINTED.lanes[phys(a)].map(R)),
      res: arms.map((a) => PAINTED.res[phys(a)].map(R)),
      avs: arms.map((a) => R(CORNER[phys(a)])),
      arms: arms.map(() => ({ lpad: none, rpad: none })),
    },
    turn: k * 90,
  };
}

// Couleurs de pions choisies dans la palette Okabe-Ito (lisible par les daltoniens),
// chacune associée à une forme distincte pour ne jamais dépendre de la seule couleur.

export interface PawnColor {
  name: string;
  fill: string;
  shape: 'circle' | 'square' | 'triangle' | 'diamond' | 'star' | 'hexagon';
  shapeName: string;
}

export const COLORS: PawnColor[] = [
  { name: 'Rouge', fill: '#D55E00', shape: 'circle', shapeName: 'rond' },
  { name: 'Bleu', fill: '#0072B2', shape: 'square', shapeName: 'carré' },
  { name: 'Vert', fill: '#009E73', shape: 'triangle', shapeName: 'triangle' },
  { name: 'Jaune', fill: '#F0E442', shape: 'diamond', shapeName: 'losange' },
  { name: 'Rose', fill: '#CC79A7', shape: 'star', shapeName: 'étoile' },
  { name: 'Ciel', fill: '#56B4E9', shape: 'hexagon', shapeName: 'hexagone' },
];

function poly(points: [number, number][]) {
  return 'M' + points.map(([x, y]) => `${x.toFixed(2)} ${y.toFixed(2)}`).join('L') + 'Z';
}

/** Chemin SVG de la forme, centré en 0,0, de rayon r. */
export function shapePath(shape: PawnColor['shape'], r: number): string {
  const reg = (k: number, rot: number, rr = r) =>
    Array.from({ length: k }, (_, i) => {
      const a = rot + (i * 2 * Math.PI) / k;
      return [Math.cos(a) * rr, Math.sin(a) * rr] as [number, number];
    });
  switch (shape) {
    case 'circle':
      return `M${-r} 0a${r} ${r} 0 1 0 ${2 * r} 0a${r} ${r} 0 1 0 ${-2 * r} 0Z`;
    case 'square':
      return poly(reg(4, Math.PI / 4, r * 1.15));
    case 'triangle':
      return poly(reg(3, -Math.PI / 2, r * 1.3).map(([x, y]) => [x, y + r * 0.18]));
    case 'diamond':
      return poly(reg(4, 0, r * 1.25));
    case 'star': {
      const pts: [number, number][] = [];
      for (let i = 0; i < 10; i++) {
        const a = -Math.PI / 2 + (i * Math.PI) / 5;
        const rr = i % 2 ? r * 0.6 : r * 1.3;
        pts.push([Math.cos(a) * rr, Math.sin(a) * rr]);
      }
      return poly(pts);
    }
    case 'hexagon':
      return poly(reg(6, 0, r * 1.1));
  }
}

/** Petite icône SVG (pour les listes de joueurs, boutons...). */
export function shapeIcon(color: number, size = 22): string {
  const c = COLORS[color] ?? { fill: '#999', shape: 'circle' as const };
  return `<svg width="${size}" height="${size}" viewBox="-14 -14 28 28" aria-hidden="true"><path d="${shapePath(
    c.shape,
    10,
  )}" fill="${c.fill}" stroke="#2b1a0e" stroke-width="2.2" stroke-linejoin="round"/></svg>`;
}

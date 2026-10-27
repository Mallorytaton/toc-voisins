import {
  GameState, HOME_SIZE, PAWNS_PER_SEAT, PawnRef, inBase, inHome, homeIndex, onTrack, sameRef, squareOf,
  trackLen,
} from '../engine';
import { COLORS, shapePath } from './colors';
import { h, s } from './dom';

// Plateau façon Toc traditionnel : carré à 4 joueurs, hexagonal à 6. Chaque joueur a un côté ;
// sa case de départ est au milieu de son côté, sa maison part vers le centre et sa base
// est nichée dans le coin qui précède son départ.

export interface BoardMarks {
  /** Pions jouables avec la carte choisie. */
  highlight: PawnRef[];
  selected: PawnRef | null;
  /** Aperçu de l'arrivée du coup choisi (progressions par pion). */
  ghosts: { ref: PawnRef; p: number }[];
}

type Pt = [number, number];

interface Geometry {
  /** Apothème du parcours (distance centre → milieu d'un côté). */
  track: number;
  /** Rayon des coins arrondis du parcours. */
  corner: number;
  /** Apothème du plateau en bois. */
  board: number;
  boardCorner: number;
  /** Distance du centre au nid de base, dans l'axe d'un coin. */
  nest: number;
  nestR: number;
}

const GEO: Record<number, Geometry> = {
  4: { track: 350, corner: 105, board: 492, boardCorner: 46, nest: 560, nestR: 74 },
  6: { track: 372, corner: 84, board: 488, boardCorner: 38, nest: 487, nestR: 45 },
};

function lighten(hex: string, k: number) {
  const n = parseInt(hex.slice(1), 16);
  const ch = (v: number) => Math.round(v + (k > 0 ? (255 - v) * k : v * k));
  const r = ch(n >> 16), g = ch((n >> 8) & 255), b = ch(n & 255);
  return `rgb(${r},${g},${b})`;
}

/** Chemin SVG d'un polygone régulier aux coins arrondis (côté 0 en bas). */
function roundedPolygon(n: number, apothem: number, rc: number, rot: number): string {
  const inner = (apothem - rc) / Math.cos(Math.PI / n);
  let d = '';
  for (let k = 0; k < n; k++) {
    const nk = rot + (2 * Math.PI * k) / n;
    const nk1 = rot + (2 * Math.PI * (k + 1)) / n;
    const ca = nk + Math.PI / n;
    const cx = Math.cos(ca) * inner, cy = Math.sin(ca) * inner;
    const a: Pt = [cx + Math.cos(nk) * rc, cy + Math.sin(nk) * rc];
    const b: Pt = [cx + Math.cos(nk1) * rc, cy + Math.sin(nk1) * rc];
    d += `${k ? 'L' : 'M'}${a[0].toFixed(1)} ${a[1].toFixed(1)}A${rc} ${rc} 0 0 1 ${b[0].toFixed(1)} ${b[1].toFixed(1)}`;
  }
  return d + 'Z';
}

export class Board {
  readonly el: HTMLElement;
  private top: SVGSVGElement;
  private pawnEls = new Map<string, SVGGElement>();
  private prev = new Map<string, number>();
  private pawnLayer: SVGElement;
  private ghostLayer: SVGElement;
  private fxLayer: SVGElement;
  private tappable: PawnRef[] = [];
  private L: number;
  private g: Geometry;
  /** Longueur d'un côté droit du parcours et d'un arc de coin. */
  private edgeLen: number;
  private arcLen: number;
  readonly spacing: number;
  private rot: number;
  onPawnTap: (ref: PawnRef) => void = () => {};

  constructor(private n: number, viewer: number, private colors: number[], private names: string[] = []) {
    this.L = trackLen(n);
    this.g = GEO[n];
    const { track, corner } = this.g;
    this.edgeLen = 2 * (track - corner) * Math.tan(Math.PI / n);
    this.arcLen = (corner * 2 * Math.PI) / n;
    this.spacing = (n * (this.edgeLen + this.arcLen)) / this.L;
    // Le côté du joueur qui regarde est en bas.
    this.rot = Math.PI / 2 - (2 * Math.PI * Math.max(0, viewer)) / n;

    const R = this.g.board / Math.cos(Math.PI / n);
    const halfW = n === 6 ? R : this.g.board;
    const vb = `${-halfW - 8} ${-this.g.board - 8} ${2 * halfW + 16} ${2 * this.g.board + 16}`;
    const base = s('svg', { viewBox: vb, class: 'board-base', 'aria-hidden': 'true' }) as SVGSVGElement;
    this.drawStatic(base);
    this.top = s('svg', {
      viewBox: vb, class: 'board', role: 'img', 'aria-label': `Plateau de Toc à ${n} joueurs`,
    }) as SVGSVGElement;
    this.ghostLayer = s('g', { class: 'ghosts' });
    this.pawnLayer = s('g', { class: 'pawns' });
    this.fxLayer = s('g', { class: 'fx' });
    this.top.append(this.pawnDefs(), this.ghostLayer, this.pawnLayer, this.fxLayer);
    this.top.addEventListener('click', (e) => this.handleTap(e));
    this.el = h('div', { class: `board-stack n${n}` }, base, this.top);
  }

  /** Normale sortante du côté du joueur `seat`. */
  private normal(seat: number) {
    return this.rot + (2 * Math.PI * seat) / this.n;
  }

  /** Point du parcours à l'abscisse curviligne t (0 = milieu du côté du joueur 0). */
  private trackPoint(t: number): Pt {
    const { n } = this;
    const { track, corner } = this.g;
    const per = this.edgeLen + this.arcLen;
    t = ((t % (n * per)) + n * per) % (n * per);
    // On commence au milieu du côté 0 : décalage d'un demi-côté.
    let u = t + this.edgeLen / 2;
    let k = Math.floor(u / per);
    u -= k * per;
    k %= n;
    const nk = this.normal(k);
    const inner = (track - corner) / Math.cos(Math.PI / n);
    if (u < this.edgeLen) {
      // Côté droit k, parcouru de son début (coin k-1) vers sa fin (coin k).
      const along = u - this.edgeLen / 2;
      const tx = -Math.sin(nk), ty = Math.cos(nk);
      return [Math.cos(nk) * track + tx * along, Math.sin(nk) * track + ty * along];
    }
    const ca = nk + Math.PI / n;
    const a = nk + ((u - this.edgeLen) / this.arcLen) * ((2 * Math.PI) / n);
    return [Math.cos(ca) * inner + Math.cos(a) * corner, Math.sin(ca) * inner + Math.sin(a) * corner];
  }

  private squarePos(sq: number): Pt {
    return this.trackPoint((sq * (this.n * (this.edgeLen + this.arcLen))) / this.L);
  }

  private homePos(seat: number, h: number): Pt {
    const nk = this.normal(seat);
    const r = this.g.track - this.spacing * 1.08 * (h + 1);
    return [Math.cos(nk) * r, Math.sin(nk) * r];
  }

  /** Centre du nid de base : coin qui précède la case de départ. */
  private nestCenter(seat: number): Pt {
    const a = this.normal(seat) - Math.PI / this.n;
    return [Math.cos(a) * this.g.nest, Math.sin(a) * this.g.nest];
  }

  private basePos(seat: number, i: number): Pt {
    const [cx, cy] = this.nestCenter(seat);
    const a = this.normal(seat) - Math.PI / this.n;
    const d = this.g.nestR * 0.42;
    const off: Pt[] = [[-1, -1], [1, -1], [-1, 1], [1, 1]];
    const [ox, oy] = off[i];
    // Grille 2×2 orientée selon la diagonale du coin.
    const c = Math.cos(a + Math.PI / 4), sn = Math.sin(a + Math.PI / 4);
    return [cx + d * (ox * c - oy * sn), cy + d * (ox * sn + oy * c)];
  }

  /** Coordonnées d'un pion selon sa progression. */
  pos(seat: number, p: number, i: number): Pt {
    if (inBase(p)) return this.basePos(seat, i);
    if (inHome(this.n, p)) return this.homePos(seat, homeIndex(this.n, p));
    return this.squarePos(squareOf(this.n, seat, p));
  }

  private drawStatic(svg: SVGElement) {
    const { n, L, spacing: sp, g } = this;
    const holeR = sp * 0.3;
    const defs = s('defs', null,
      s('linearGradient', { id: 'wood-frame', x1: 0, y1: 0, x2: 1, y2: 1 },
        s('stop', { offset: '0', 'stop-color': 'var(--frame-1)' }),
        s('stop', { offset: '1', 'stop-color': 'var(--frame-2)' })),
      s('radialGradient', { id: 'wood-panel', cx: '42%', cy: '38%', r: '75%' },
        s('stop', { offset: '0', 'stop-color': 'var(--wood-1)' }),
        s('stop', { offset: '0.65', 'stop-color': 'var(--wood-2)' }),
        s('stop', { offset: '1', 'stop-color': 'var(--wood-3)' })),
      s('radialGradient', { id: 'hole', cx: '58%', cy: '62%', r: '60%' },
        s('stop', { offset: '0', 'stop-color': 'var(--hole-light)' }),
        s('stop', { offset: '0.55', 'stop-color': 'var(--hole-mid)' }),
        s('stop', { offset: '1', 'stop-color': 'var(--hole-dark)' })),
      s('filter', { id: 'grain', x: '-5%', y: '-5%', width: '110%', height: '110%' },
        s('feTurbulence', { type: 'fractalNoise', baseFrequency: '0.006 0.09', numOctaves: 4, seed: 11, result: 'noise' }),
        s('feColorMatrix', { type: 'matrix', values: '0 0 0 0 0.25  0 0 0 0 0.13  0 0 0 0 0.04  0 0 0 1.4 -0.45' }),
        s('feComposite', { in2: 'SourceGraphic', operator: 'in' })),
      s('filter', { id: 'soft', x: '-20%', y: '-20%', width: '140%', height: '140%' },
        s('feGaussianBlur', { stdDeviation: 6 })),
    );
    svg.append(defs);

    // Cadre et panneau en bois.
    const rotBoard = this.rot;
    const frame = roundedPolygon(n, g.board, g.boardCorner, rotBoard);
    const panel = roundedPolygon(n, g.board - 22, g.boardCorner * 0.7, rotBoard);
    svg.append(
      s('path', { d: roundedPolygon(n, g.board + 4, g.boardCorner, rotBoard), fill: 'rgba(0,0,0,0.35)', filter: 'url(#soft)', transform: 'translate(0 8)' }),
      s('path', { d: frame, fill: 'url(#wood-frame)' }),
      s('path', { d: frame, fill: '#000', filter: 'url(#grain)', opacity: 0.55 }),
      s('path', { d: panel, fill: 'url(#wood-panel)', stroke: 'var(--bevel-dark)', 'stroke-width': 3 }),
      s('path', { d: panel, fill: '#000', filter: 'url(#grain)', opacity: 0.8 }),
      s('path', { d: roundedPolygon(n, g.board - 25, g.boardCorner * 0.7, rotBoard), fill: 'none', stroke: 'var(--bevel-light)', 'stroke-width': 2, opacity: 0.6 }),
    );

    // Bandes colorées de chaque joueur le long de son côté, et gorge du parcours.
    const per = this.edgeLen + this.arcLen;
    for (let seat = 0; seat < n; seat++) {
      const col = COLORS[this.colors[seat]]?.fill ?? '#999';
      const pts: Pt[] = [];
      for (let k = -2; k <= 14; k++) pts.push(this.trackPoint(seat * per + (k * per) / 18));
      svg.append(s('path', {
        d: 'M' + pts.map((p) => p.map((v) => v.toFixed(1)).join(' ')).join('L'),
        fill: 'none', stroke: col, 'stroke-width': sp * 1.25, 'stroke-linecap': 'round', opacity: 0.22,
      }));
    }
    svg.append(
      s('path', { d: roundedPolygon(n, g.track, g.corner, rotBoard), fill: 'none', stroke: 'var(--groove)', 'stroke-width': sp * 0.82, opacity: 0.55 }),
      s('path', { d: roundedPolygon(n, g.track - sp * 0.12, g.corner, rotBoard), fill: 'none', stroke: 'var(--bevel-light)', 'stroke-width': 1.5, opacity: 0.35 }),
    );

    const hole = (x: number, y: number, r: number, extra: Record<string, unknown> = {}) =>
      s('circle', { cx: x.toFixed(1), cy: y.toFixed(1), r, fill: 'url(#hole)', stroke: 'var(--hole-rim)', 'stroke-width': 1.5, ...extra });

    // Rosace centrale.
    const rose = s('g', { class: 'rose' });
    for (let seat = 0; seat < n; seat++) {
      const col = COLORS[this.colors[seat]]?.fill ?? '#999';
      const a = this.normal(seat);
      const r1 = g.track - sp * 1.08 * (HOME_SIZE + 0.6);
      const w = 0.42;
      const tip: Pt = [Math.cos(a) * r1, Math.sin(a) * r1];
      const l: Pt = [Math.cos(a - w) * r1 * 0.32, Math.sin(a - w) * r1 * 0.32];
      const r: Pt = [Math.cos(a + w) * r1 * 0.32, Math.sin(a + w) * r1 * 0.32];
      rose.append(s('path', { d: `M0 0L${l.join(' ')}L${tip.join(' ')}L${r.join(' ')}Z`, fill: col, opacity: 0.75, stroke: 'var(--bevel-dark)', 'stroke-width': 2, 'stroke-linejoin': 'round' }));
    }
    rose.append(
      s('circle', { r: 62, fill: 'url(#wood-panel)', stroke: 'var(--bevel-dark)', 'stroke-width': 3 }),
      s('text', { y: 14, class: 'logo', 'text-anchor': 'middle' }, 'TOC'),
    );
    svg.append(rose);

    for (let seat = 0; seat < n; seat++) {
      const c = COLORS[this.colors[seat]] ?? COLORS[0];
      const col = c.fill;
      const a = this.normal(seat);
      // Couloir de maison incrusté.
      const [sx, sy] = this.homePos(seat, -1);
      const [ex, ey] = this.homePos(seat, HOME_SIZE - 1);
      svg.append(s('line', { x1: sx, y1: sy, x2: ex, y2: ey, stroke: col, 'stroke-width': sp * 0.95, 'stroke-linecap': 'round', opacity: 0.8 }));
      svg.append(s('line', { x1: sx, y1: sy, x2: ex, y2: ey, stroke: lighten(col, 0.35), 'stroke-width': sp * 0.95 - 6, 'stroke-linecap': 'round', opacity: 0.45 }));
      for (let k = 0; k < HOME_SIZE; k++) {
        const [x, y] = this.homePos(seat, k);
        svg.append(hole(x, y, holeR));
      }
      // Nid de base dans le coin.
      const [nx, ny] = this.nestCenter(seat);
      svg.append(
        s('circle', { cx: nx, cy: ny, r: g.nestR, fill: col, opacity: 0.9, stroke: 'var(--bevel-dark)', 'stroke-width': 3 }),
        s('circle', { cx: nx, cy: ny, r: g.nestR - 6, fill: lighten(col, 0.3), opacity: 0.55 }),
      );
      // Motif de forme en filigrane dans le nid (repère daltonien).
      svg.append(s('path', { d: shapePath(c.shape, g.nestR * 0.75), transform: `translate(${nx} ${ny})`, fill: 'none', stroke: 'rgba(255,255,255,0.45)', 'stroke-width': 3 }));
      for (let i = 0; i < PAWNS_PER_SEAT; i++) {
        const [x, y] = this.basePos(seat, i);
        svg.append(hole(x, y, holeR * 1.05));
      }
      const name = this.names[seat];
      if (name && n === 4) {
        // Nom gravé sur le cadre, à côté du nid (à 6 joueurs, les puces de joueurs suffisent).
        const lx = nx + Math.sign(-nx) * (g.nestR + 58);
        const ly = Math.sign(ny) * (g.board - 11);
        svg.append(s('text', { x: lx, y: ly, class: 'seat-name', 'text-anchor': 'middle', 'dominant-baseline': 'middle' }, name.slice(0, 12)));
      }
      // Flèche d'entrée en maison.
      const [ax, ay] = this.homePos(seat, -1);
      svg.append(s('path', {
        d: `M${-sp * 0.32} 0L0 ${sp * 0.32}L${sp * 0.32} 0`,
        transform: `translate(${(ax - Math.cos(a) * sp * 0.58).toFixed(1)} ${(ay - Math.sin(a) * sp * 0.58).toFixed(1)}) rotate(${((a * 180) / Math.PI + 90).toFixed(1)})`,
        fill: 'none', stroke: col, 'stroke-width': 4, 'stroke-linecap': 'round', 'stroke-linejoin': 'round',
      }));
    }

    // Trous du parcours ; la case de départ est cerclée de la couleur du joueur.
    for (let sq = 0; sq < L; sq++) {
      const [x, y] = this.squarePos(sq);
      if (sq % 18 === 0) {
        const col = COLORS[this.colors[sq / 18]]?.fill ?? '#999';
        svg.append(s('circle', { cx: x, cy: y, r: holeR * 1.75, fill: col, stroke: 'var(--bevel-dark)', 'stroke-width': 2.5 }));
        svg.append(hole(x, y, holeR * 1.05));
      } else svg.append(hole(x, y, holeR));
    }
  }

  private pawnDefs() {
    return s('defs', null,
      s('radialGradient', { id: 'pawn-shine', cx: '35%', cy: '30%', r: '70%' },
        s('stop', { offset: '0', 'stop-color': '#fff', 'stop-opacity': 0.75 }),
        s('stop', { offset: '0.45', 'stop-color': '#fff', 'stop-opacity': 0.08 }),
        s('stop', { offset: '1', 'stop-color': '#000', 'stop-opacity': 0.28 })));
  }

  private pawnEl(ref: PawnRef): SVGGElement {
    const key = `${ref.s}.${ref.i}`;
    let el = this.pawnEls.get(key);
    if (!el) {
      const c = COLORS[this.colors[ref.s]] ?? COLORS[0];
      const r = this.spacing * 0.36;
      const d = shapePath(c.shape, r);
      el = s('g', { class: 'pawn', 'data-key': key },
        s('circle', { r: r * 1.9, class: 'halo' }),
        s('ellipse', { cx: r * 0.18, cy: r * 0.55, rx: r * 1.05, ry: r * 0.7, class: 'shadow' }),
        s('path', { d, fill: c.fill, class: 'body' }),
        s('path', { d, fill: 'url(#pawn-shine)', class: 'shine' }),
      ) as SVGGElement;
      this.pawnLayer.append(el);
      this.pawnEls.set(key, el);
    }
    return el;
  }

  /** Chemin case par case d'un déplacement (pour l'animation). */
  private path(ref: PawnRef, from: number, to: number): Pt[] {
    const L = this.L;
    if (from >= 0 && to >= 0) {
      const fwd = to - from;
      if (fwd > 0 && fwd <= 13) return Array.from({ length: fwd + 1 }, (_, k) => this.pos(ref.s, from + k, ref.i));
      if (onTrack(this.n, from) && onTrack(this.n, to)) {
        const back = (from - to + L) % L;
        if (back > 0 && back <= 4) return Array.from({ length: back + 1 }, (_, k) => this.pos(ref.s, (from - k + L) % L, ref.i));
      }
    }
    return [this.pos(ref.s, from, ref.i), this.pos(ref.s, to, ref.i)];
  }

  /** Met à jour les pions. Retourne un résumé du mouvement (pour les sons). */
  update(st: GameState, marks: BoardMarks, animate = true): { steps: number; home: boolean; captures: number; delay: number } {
    const STEP = 110;
    let maxDur = 0;
    let steps = 0;
    let home = false;
    const captured: [SVGGElement, Pt[]][] = [];
    const tr = ([x, y]: Pt) => `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px)`;
    for (let seat = 0; seat < this.n; seat++) {
      for (let i = 0; i < PAWNS_PER_SEAT; i++) {
        const ref = { s: seat, i };
        const key = `${seat}.${i}`;
        const el = this.pawnEl(ref);
        const p = st.pawns[seat][i].p;
        const old = this.prev.get(key);
        el.style.transform = tr(this.pos(seat, p, i));
        if (animate && old !== undefined && old !== p && typeof el.animate === 'function') {
          const pts = this.path(ref, old, p);
          if (p < 0 && st.lastCaptures.some((c) => sameRef(c, ref))) captured.push([el, pts]);
          else {
            const dur = Math.max(260, (pts.length - 1) * STEP);
            maxDur = Math.max(maxDur, dur);
            steps = Math.max(steps, pts.length - 1);
            if (inHome(this.n, p) && !inHome(this.n, old)) home = true;
            // Petit saut à chaque case.
            const frames: Keyframe[] = [];
            pts.forEach((pt, k) => {
              frames.push({ transform: tr(pt) + ' scale(1)', offset: k / Math.max(1, pts.length - 1) });
            });
            el.animate(frames, { duration: dur, easing: 'ease-in-out' });
          }
        }
        this.prev.set(key, p);
        el.classList.toggle('playable', marks.highlight.some((r) => sameRef(r, ref)));
        el.classList.toggle('selected', !!marks.selected && sameRef(marks.selected, ref));
        el.classList.toggle('blocking', st.variants.startBlocks && st.pawns[seat][i].fresh && p === 0);
      }
    }
    for (const [el, pts] of captured) {
      const a = tr(pts[0]), b = tr(pts[pts.length - 1]);
      // Onde de choc à l'endroit de la prise.
      const ring = s('circle', { cx: pts[0][0], cy: pts[0][1], r: this.spacing * 0.5, class: 'burst' });
      this.fxLayer.append(ring);
      ring.animate?.([{ transform: 'scale(0.6)', opacity: 0 }, { transform: 'scale(0.6)', opacity: 0, offset: 0.55 }, { transform: 'scale(2.6)', opacity: 0.9, offset: 0.7 }, { transform: 'scale(3.4)', opacity: 0 }], { duration: maxDur + 500 });
      setTimeout(() => ring.remove(), maxDur + 600);
      el.animate(
        [{ transform: a }, { transform: a, offset: 0.6 }, { transform: a + ' scale(1.4)', opacity: 0.2, offset: 0.75 }, { transform: b, opacity: 1 }],
        { duration: maxDur + 500, easing: 'ease-in' },
      );
    }
    for (const r of marks.highlight) this.pawnLayer.append(this.pawnEl(r));
    this.tappable = marks.highlight;
    this.ghostLayer.replaceChildren(
      ...marks.ghosts.map((gh) => {
        const [x, y] = this.pos(gh.ref.s, gh.p, gh.ref.i);
        return s('circle', { cx: x, cy: y, r: this.spacing * 0.5, class: 'ghost' });
      }),
    );
    return { steps, home, captures: captured.length, delay: maxDur };
  }

  private handleTap(e: MouseEvent) {
    if (!this.tappable.length) return;
    const ctm = this.top.getScreenCTM();
    if (!ctm) return;
    const pt = new DOMPoint(e.clientX, e.clientY).matrixTransform(ctm.inverse());
    let best: PawnRef | null = null;
    let bestD = Math.max(80, this.spacing * 1.8);
    for (const ref of this.tappable) {
      const m = /translate\(([-\d.]+)px, ([-\d.]+)px\)/.exec(this.pawnEl(ref).style.transform);
      if (!m) continue;
      const d = Math.hypot(pt.x - +m[1], pt.y - +m[2]);
      if (d < bestD) {
        bestD = d;
        best = ref;
      }
    }
    if (best) this.onPawnTap(best);
  }
}

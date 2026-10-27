import {
  GameState, HOME_SIZE, PAWNS_PER_SEAT, PawnRef, inBase, inHome, homeIndex, onTrack, sameRef, squareOf,
  startSq, trackLen,
} from '../engine';
import { COLORS, shapePath } from './colors';
import { s } from './dom';

const C = 500;
const R = 430;

export interface BoardMarks {
  /** Pions jouables avec la carte choisie. */
  highlight: PawnRef[];
  selected: PawnRef | null;
  /** Aperçu de l'arrivée du coup choisi (progressions par pion). */
  ghosts: { ref: PawnRef; p: number }[];
}

type Pt = [number, number];

export class Board {
  readonly el: SVGSVGElement;
  private pawnEls = new Map<string, SVGGElement>();
  private prev = new Map<string, number>();
  private pawnLayer: SVGElement;
  private ghostLayer: SVGElement;
  private tappable: PawnRef[] = [];
  private L: number;
  private spacing: number;
  onPawnTap: (ref: PawnRef) => void = () => {};

  constructor(private n: number, private viewer: number, private colors: number[], private names: string[] = []) {
    this.L = trackLen(n);
    this.spacing = (2 * Math.PI * R) / this.L;
    this.el = s('svg', {
      viewBox: '0 0 1000 1000',
      class: 'board',
      role: 'img',
      'aria-label': `Plateau de Toc à ${n} joueurs`,
    }) as SVGSVGElement;
    this.drawStatic();
    this.ghostLayer = s('g', { class: 'ghosts' });
    this.pawnLayer = s('g', { class: 'pawns' });
    this.el.append(this.ghostLayer, this.pawnLayer);
    this.el.addEventListener('click', (e) => this.handleTap(e));
  }

  private angle(sq: number) {
    const rot = startSq(Math.max(0, this.viewer));
    return Math.PI / 2 + (2 * Math.PI * (sq - rot)) / this.L;
  }

  private polar(a: number, r: number): Pt {
    return [C + Math.cos(a) * r, C + Math.sin(a) * r];
  }

  /** Coordonnées d'un pion selon sa progression. */
  pos(seat: number, p: number, i: number): Pt {
    const sp = this.spacing;
    const a0 = this.angle(startSq(seat));
    if (inBase(p)) return this.polar(a0 - (2 * Math.PI * (2.6 + i * 1.25)) / this.L, R - sp * 2.2);
    if (inHome(this.n, p)) return this.polar(a0, R - sp * 1.15 * (homeIndex(this.n, p) + 1));
    return this.polar(this.angle(squareOf(this.n, seat, p)), R);
  }

  private drawStatic() {
    const { n, L, spacing: sp } = this;
    const defs = s(
      'defs',
      null,
      s(
        'radialGradient',
        { id: 'wood', cx: '45%', cy: '40%', r: '70%' },
        s('stop', { offset: '0%', 'stop-color': 'var(--wood-1)' }),
        s('stop', { offset: '70%', 'stop-color': 'var(--wood-2)' }),
        s('stop', { offset: '100%', 'stop-color': 'var(--wood-3)' }),
      ),
    );
    const g = s('g', { class: 'static' });
    g.append(s('circle', { cx: C, cy: C, r: 496, fill: 'url(#wood)', stroke: 'var(--wood-edge)', 'stroke-width': 6 }));
    // Veinage du bois.
    for (let k = 0; k < 9; k++) {
      g.append(
        s('ellipse', {
          cx: C + 30 - k * 7, cy: C - 20 + k * 5, rx: 60 + k * 48, ry: 40 + k * 46,
          fill: 'none', stroke: 'var(--grain)', 'stroke-width': 2, opacity: 0.35,
        }),
      );
    }
    const sqR = sp * 0.36;
    for (let sq = 0; sq < L; sq++) {
      const [x, y] = this.polar(this.angle(sq), R);
      const owner = sq % 18 === 0 ? sq / 18 : -1;
      if (owner >= 0) {
        const col = COLORS[this.colors[owner]]?.fill ?? '#999';
        g.append(s('circle', { cx: x, cy: y, r: sqR * 1.35, fill: col, opacity: 0.9, stroke: 'var(--ink)', 'stroke-width': 3 }));
      } else {
        g.append(s('circle', { cx: x, cy: y, r: sqR, class: 'sq' }));
      }
    }
    for (let seat = 0; seat < n; seat++) {
      const col = COLORS[this.colors[seat]]?.fill ?? '#999';
      for (let h = 0; h < HOME_SIZE; h++) {
        const [x, y] = this.pos(seat, L + 1 + h, 0);
        g.append(s('circle', { cx: x, cy: y, r: sqR * 1.05, fill: col, 'fill-opacity': 0.35, stroke: col, 'stroke-width': 4 }));
      }
      for (let i = 0; i < PAWNS_PER_SEAT; i++) {
        const [x, y] = this.pos(seat, -1, i);
        g.append(s('circle', { cx: x, cy: y, r: sqR * 1.05, fill: 'var(--hole)', stroke: col, 'stroke-width': 3, 'stroke-dasharray': '6 4' }));
      }
      const name = this.names[seat];
      if (name) {
        const [x, y] = this.polar(this.angle(startSq(seat)) - (2 * Math.PI * 4.4) / L, R - sp * 4.4);
        g.append(s('text', { x, y, class: 'seat-name', 'text-anchor': 'middle', 'dominant-baseline': 'middle' }, name.slice(0, 10)));
      }
    }
    g.append(s('text', { x: C, y: C + 18, class: 'logo', 'text-anchor': 'middle' }, 'TOC'));
    this.el.append(defs, g);
  }

  private pawnEl(ref: PawnRef): SVGGElement {
    const key = `${ref.s}.${ref.i}`;
    let el = this.pawnEls.get(key);
    if (!el) {
      const c = COLORS[this.colors[ref.s]] ?? COLORS[0];
      const r = this.spacing * 0.4;
      el = s(
        'g',
        { class: 'pawn', 'data-key': key },
        s('circle', { r: r * 1.9, class: 'halo' }),
        s('path', { d: shapePath(c.shape, r), fill: c.fill, class: 'body' }),
        s('circle', { r: r * 0.28, class: 'shine', cx: -r * 0.3, cy: -r * 0.35 }),
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
      if (fwd > 0 && fwd <= 13) {
        return Array.from({ length: fwd + 1 }, (_, k) => this.pos(ref.s, from + k, ref.i));
      }
      if (onTrack(this.n, from) && onTrack(this.n, to)) {
        const back = (from - to + L) % L;
        if (back > 0 && back <= 4) {
          return Array.from({ length: back + 1 }, (_, k) => this.pos(ref.s, (from - k + L) % L, ref.i));
        }
      }
    }
    return [this.pos(ref.s, from, ref.i), this.pos(ref.s, to, ref.i)];
  }

  update(st: GameState, marks: BoardMarks, animate = true) {
    const STEP = 110;
    let maxDur = 0;
    const captured: [SVGGElement, Pt[]][] = [];
    for (let seat = 0; seat < this.n; seat++) {
      for (let i = 0; i < PAWNS_PER_SEAT; i++) {
        const ref = { s: seat, i };
        const key = `${seat}.${i}`;
        const el = this.pawnEl(ref);
        const p = st.pawns[seat][i].p;
        const [x, y] = this.pos(seat, p, i);
        const old = this.prev.get(key);
        el.style.transform = `translate(${x}px, ${y}px)`;
        if (animate && old !== undefined && old !== p && typeof el.animate === 'function') {
          const pts = this.path(ref, old, p);
          const frames = pts.map(([px, py]) => ({ transform: `translate(${px}px, ${py}px)` }));
          const isCapture = p < 0 && st.lastCaptures.some((c) => sameRef(c, ref));
          if (isCapture) captured.push([el, pts]);
          else {
            const dur = Math.max(260, (pts.length - 1) * STEP);
            maxDur = Math.max(maxDur, dur);
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
      const frames = pts.map(([px, py]) => ({ transform: `translate(${px}px, ${py}px)` }));
      el.animate([frames[0], frames[0], frames[frames.length - 1]], {
        duration: maxDur + 450,
        easing: 'ease-in',
      });
    }
    // Les pions sélectionnés passent au premier plan.
    for (const r of marks.highlight) this.pawnLayer.append(this.pawnEl(r));
    this.tappable = marks.highlight;
    this.ghostLayer.replaceChildren(
      ...marks.ghosts.map((g) => {
        const [x, y] = this.pos(g.ref.s, g.p, g.ref.i);
        return s('circle', { cx: x, cy: y, r: this.spacing * 0.55, class: 'ghost' });
      }),
    );
  }

  private handleTap(e: MouseEvent) {
    if (!this.tappable.length) return;
    const ctm = this.el.getScreenCTM();
    if (!ctm) return;
    const pt = new DOMPoint(e.clientX, e.clientY).matrixTransform(ctm.inverse());
    let best: PawnRef | null = null;
    let bestD = Math.max(80, this.spacing * 1.8);
    for (const ref of this.tappable) {
      const el = this.pawnEl(ref);
      const m = /translate\(([-\d.]+)px, ([-\d.]+)px\)/.exec(el.style.transform);
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

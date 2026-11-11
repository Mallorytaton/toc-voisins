// La planche de la partie : à la fin, les coups marquants deviennent une page de BD (trois cases et la case « FIN »).
// Le même contenu sert deux fois : affiché sur l'écran de fin (plancheEl), et dessiné en image pour l'envoyer aux
// copains (plancheImage, sharePlanche), sans aucun service : tout est fabriqué sur le téléphone.
import { burstPath } from './board/fx';
import { h } from './dom';
import { COL, type CharId, type ColorName } from './kit/data';
import { type Humeur, perso, persoSvg } from './kit/perso';
import { type MascotMood, mascot, mascotSvg } from './mascot';

export interface PlancheActor { char: CharId; color: ColorName; humeur: Humeur }
export interface PlancheCase {
  /** Récitatif de la case (« Frédo se venge de Coco. ») */
  cap: string;
  /** Mot lettré en grand (« BOUM ! », « VENGEANCE ! ») */
  fx: string;
  /** Celui qui joue le coup, à gauche */
  by?: PlancheActor;
  /** Ceux qui le subissent, à droite */
  hits: PlancheActor[];
}
export interface Planche {
  won: boolean;
  /** Fond de l'écran et de l'image : la couleur de l'équipe gagnante */
  color: string;
  /** « Victoire ! », « Défaite… » */
  title: string;
  /** Les deux gagnants */
  duo: PlancheActor[];
  kicker: string;
  /** Titre de l'histoire (« La vengeance de Frédo ») */
  story: string;
  cases: PlancheCase[];
  /** La dernière case : la bille qui rentre, de la couleur du joueur qui finit */
  fin: { cap: string; color: ColorName; toc: MascotMood };
  foot: string;
  reward?: { n: string; label: string };
  /** Message qui accompagne l'image partagée */
  text: string;
}

const INK = '#16131f';
const CASE_BG: [string, string][] = [['#3b5bff', 'blue'], ['#ffcf1f', 'yellow'], ['#ff8fc4', 'rose'], ['#19c6a4', 'teal'], ['#ff5433', 'coral']];
const finBg = (p: Planche) => (p.fin.color === 'teal' ? '#3b5bff' : '#19c6a4');
/**
 * Le fond de chaque case : jamais la couleur d'un de ses personnages. Tant que c'est possible, les cases ont
 * toutes un fond différent, et celles qui touchent la case « Fin » ne reprennent pas le sien.
 */
function caseBgs(p: Planche): string[] {
  const out: string[] = [], n = p.cases.length;
  p.cases.forEach((c, k) => {
    const used = new Set<string>([c.by?.color ?? '', ...c.hits.map((x) => x.color)]);
    const free = CASE_BG.map((_, i) => CASE_BG[(k + i) % CASE_BG.length]).filter(([, name]) => !used.has(name)).map(([bg]) => bg);
    const aboveFin = n === 3 ? k > 0 : k === n - 1;
    out.push(free.find((bg) => !out.includes(bg) && !(aboveFin && bg === finBg(p))) ?? free.find((bg) => bg !== out[k - 1]) ?? free[0] ?? CASE_BG[k % CASE_BG.length][0]);
  });
  return out;
}
/** L'étoile derrière le mot : jaune, ou blanche quand la case ou le héros de la case est déjà jaune. */
const burstOn = (bg: string, c: PlancheCase) => (bg === '#ffcf1f' || c.by?.color === 'yellow' ? '#fff' : '#ffcf1f');
/** Trois cases : la première sur toute la largeur, les deux autres côte à côte. Une ou deux : chacune sur toute la largeur. */
const isWide = (n: number, k: number) => n < 3 || k === 0;

const layer = (style: string) => { const e = h('i'); e.style.cssText = style; return e; };
/** Une étoile d'explosion cernée d'encre, qui remplit son parent. */
export function burstEl(color: string, points = 11, inner = 34, rot = 4): HTMLElement[] {
  const p = burstPath(points, 50, inner, rot);
  return [layer(`inset:-4px;background:${INK};clip-path:${p}`), layer(`inset:0;background:${color};clip-path:${p}`)];
}

/** La planche affichée sur l'écran de fin. */
export function plancheEl(p: Planche): HTMLElement {
  const n = p.cases.length, bgs = caseBgs(p);
  const cases = p.cases.map((c, k) => {
    const wide = isWide(n, k), bg = bgs[k];
    return h('div', { class: 'case' + (wide ? ' case--wide' : '') + (k === 0 ? ' case--first' : ''), style: { '--kc': bg } },
      h('i'),
      h('div', { class: 'case__burst' }, ...burstEl(burstOn(bg, c))),
      c.by && h('span', { class: 'case__who case__who--by' }, perso(c.by.char, c.by.color, wide ? 72 : 58, c.by.humeur)),
      ...c.hits.slice(0, 2).map((x) => h('span', { class: 'case__who case__who--hit' }, perso(x.char, x.color, wide ? 58 : 44, x.humeur, { flip: true }))),
      // Le récitatif puis le mot, l'un sous l'autre : le mot ne passe jamais sous le récitatif, même sur deux lignes
      h('span', { class: 'case__cap' }, c.cap),
      h('span', { class: 'case__fx' + (c.fx.length > 8 ? ' case__fx--long' : '') }, c.fx));
  });
  const t = COL[p.fin.color];
  const fin = h('div', { class: 'case case--wide case--fin', style: { '--kc': finBg(p) } },
    h('i'),
    h('div', { class: 'case__lane', style: { '--d': t.d } },
      ...[0, 1, 2, 3].map(() => h('div', { class: 'bille', style: { '--c': t.c, '--d': t.d, '--s': '22' } }))),
    h('span', { class: 'case__tocword' }, 'Toc !'),
    h('span', { class: 'case__fin' }, 'Fin'),
    h('span', { class: 'case__toc' }, mascot(p.fin.toc, 66, 'buste')),
    h('span', { class: 'case__cap' }, p.fin.cap));
  return h('div', { class: 'planche' + (n < 2 ? ' planche--courte' : ''), role: 'img', 'aria-label': `La planche de la partie. ${p.story}. ${[...p.cases.map((c) => c.cap), p.fin.cap].join(' ')} ${p.foot}` },
    h('div', { class: 'planche__head' },
      h('div', { style: { minWidth: 0, display: 'flex', flexDirection: 'column', gap: 3 } },
        h('span', { class: 'planche__kicker' }, p.kicker), h('span', { class: 'planche__title' }, p.story)),
      h('span', { class: 'planche__logo' }, 'TOC !')),
    cases.length ? h('div', { class: 'planche__grid' }, ...cases) : null,
    fin,
    h('span', { class: 'planche__foot' }, p.foot),
    p.reward && h('div', { class: 'victory__reward' }, ...burstEl('#ffcf1f', 12, 40, 8), h('span', null, p.reward.n, h('small', null, p.reward.label))));
}

// ---------- L'image à partager ----------

const W = 1080, H = 1350;
const FX = 'Bangers, "Rubik Variable", Impact, sans-serif';
const TXT = '"Rubik Variable", Rubik, system-ui, sans-serif';

const loadSvg = (svg: string, size: number) => new Promise<HTMLImageElement | null>((res) => {
  const img = new Image();
  img.onload = () => res(img);
  img.onerror = () => res(null);
  img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg.replace('<svg ', `<svg width="${size}" height="${size}" `));
});

/** Dessine la planche (1080 × 1350) et rend l'image, ou null si le téléphone ne sait pas la produire. */
export async function plancheImage(p: Planche): Promise<Blob | null> {
  const cv = document.createElement('canvas');
  cv.width = W;
  cv.height = H;
  const x = cv.getContext('2d');
  if (!x || !x.roundRect) return null;
  await Promise.all([document.fonts?.load(`400 100px Bangers`), document.fonts?.load(`800 40px ${TXT}`)]).catch(() => undefined);
  x.lineJoin = 'round';
  x.textBaseline = 'alphabetic';

  /** Rectangle arrondi plein, cerné d'encre, avec son ombre dure. */
  const box = (bx: number, by: number, bw: number, bh: number, r: number, fill: string, line = 8, shadow = 0) => {
    if (shadow) { x.fillStyle = INK; x.beginPath(); x.roundRect(bx + shadow, by + shadow * 1.2, bw, bh, r); x.fill(); }
    x.fillStyle = fill;
    x.beginPath();
    x.roundRect(bx, by, bw, bh, r);
    x.fill();
    if (line) { x.strokeStyle = INK; x.lineWidth = line; x.stroke(); }
  };
  /** Lettrage BD : blanc (ou `fill`), cerné d'encre, ombre dure, penché de `rot` degrés autour de (tx, ty). */
  const letter = (t: string, tx: number, ty: number, size: number, o: { fill?: string; rot?: number; align?: CanvasTextAlign; line?: number; max?: number } = {}) => {
    x.save();
    x.translate(tx, ty);
    x.rotate(((o.rot ?? 0) * Math.PI) / 180);
    x.font = `400 ${size}px ${FX}`;
    x.textAlign = o.align ?? 'left';
    const lw = o.line ?? Math.max(8, size * 0.13);
    x.lineWidth = lw;
    x.strokeStyle = INK;
    x.fillStyle = INK;
    x.strokeText(t.toUpperCase(), lw * 0.5, lw * 0.65, o.max);
    x.fillText(t.toUpperCase(), lw * 0.5, lw * 0.65, o.max);
    x.strokeText(t.toUpperCase(), 0, 0, o.max);
    x.fillStyle = o.fill ?? '#fff';
    x.fillText(t.toUpperCase(), 0, 0, o.max);
    x.restore();
  };
  const text = (t: string, tx: number, ty: number, font: string, o: { fill?: string; align?: CanvasTextAlign; max?: number } = {}) => {
    x.font = font;
    x.textAlign = o.align ?? 'left';
    x.fillStyle = o.fill ?? INK;
    x.fillText(t, tx, ty, o.max);
  };
  /** Rayons de vitesse dans un rectangle, autour de (cx, cy). */
  const rays = (bx: number, by: number, bw: number, bh: number, r: number, cx: number, cy: number) => {
    x.save();
    x.beginPath();
    x.roundRect(bx, by, bw, bh, r);
    x.clip();
    x.fillStyle = 'rgba(255,255,255,.16)';
    for (let k = 0; k < 28; k++) {
      const a = (k / 28) * Math.PI * 2;
      x.beginPath();
      x.moveTo(cx, cy);
      x.arc(cx, cy, 1600, a, a + Math.PI / 36);
      x.fill();
    }
    x.restore();
  };
  /** Étoile d'explosion centrée, cernée d'encre. */
  const burst = (cx: number, cy: number, rx: number, ry: number, fill: string, points = 11) => {
    x.beginPath();
    for (let i = 0; i < points * 2; i++) {
      const a = ((4 + (i * 180) / points) * Math.PI) / 180, k = 1 - (0.12 * ((i * 7) % 5)) / 5, r = (i % 2 ? 0.68 : 1) * k;
      const px = cx + rx * r * Math.cos(a), py = cy + ry * r * Math.sin(a);
      if (i) x.lineTo(px, py); else x.moveTo(px, py);
    }
    x.closePath();
    x.fillStyle = fill;
    x.fill();
    x.strokeStyle = INK;
    x.lineWidth = 9;
    x.stroke();
  };
  const actor = async (a: PlancheActor, ax: number, ay: number, size: number, rot = 0, flip = false) => {
    const img = await loadSvg(persoSvg(a.char, a.color, a.humeur, { flip }), 240);
    if (!img) return;
    x.save();
    x.translate(ax + size / 2, ay + size / 2);
    x.rotate((rot * Math.PI) / 180);
    x.drawImage(img, -size / 2, -size / 2, size, size);
    x.restore();
  };
  /** Le cerne d'une case, redessiné par-dessus ce qui dépasse. */
  const frame = (bx: number, by: number, bw: number, bh: number, r: number, line: number) => {
    x.beginPath();
    x.roundRect(bx, by, bw, bh, r);
    x.strokeStyle = INK;
    x.lineWidth = line;
    x.stroke();
  };
  /** Récitatif : boîte blanche cernée d'encre, texte sur une ou deux lignes. Rend sa hauteur. */
  const caption = (t: string, bx: number, by: number, maxW: number) => {
    x.font = `700 27px ${TXT}`;
    const words = t.split(' ');
    const lines: string[] = [];
    let cur = '';
    for (const w of words) {
      const next = cur ? cur + ' ' + w : w;
      if (cur && x.measureText(next).width > maxW - 36) { lines.push(cur); cur = w; } else cur = next;
    }
    lines.push(cur);
    const shown = lines.slice(0, 2);
    const bw = Math.min(maxW, Math.max(...shown.map((l) => x.measureText(l).width)) + 36);
    box(bx, by, bw, 22 + shown.length * 33, 8, '#fff', 5);
    shown.forEach((l, i) => text(l, bx + 18, by + 39 + i * 33, `700 27px ${TXT}`));
    return 22 + shown.length * 33;
  };

  // Fond : la couleur de l'équipe gagnante et ses rayons
  x.fillStyle = p.color;
  x.fillRect(0, 0, W, H);
  rays(0, 0, W, H, 0, W / 2, 470);

  letter(p.title, 60, 192, p.title.length > 10 ? 118 : 146, { rot: -4, line: 18 });
  for (const [k, a] of p.duo.slice(0, 2).entries()) await actor(a, 760 + k * 136, 48 + k * 24, 170, k ? 8 : -8);

  // La page : sa hauteur suit le nombre de cases, et elle reste centrée sous le titre
  const n = p.cases.length;
  const GAP = 18, CH = 282, FH = 212;
  const rowsH = Math.min(n, 2) * (CH + GAP);
  const PX = 60, PW = 960, PH = 152 + rowsH + FH + 62;
  const PY = 240 + Math.round((1010 - PH) / 2);
  box(PX, PY, PW, PH, 26, '#fffdf6', 8, 14);
  text(p.kicker.toUpperCase(), PX + 34, PY + 46, `900 25px ${TXT}`, { max: PW - 68 });
  text(p.story.toUpperCase(), PX + 32, PY + 126, `400 64px ${FX}`, { fill: '#c4311a', max: PW - 220 });
  text('TOC !', PX + PW - 34, PY + 122, `400 52px ${FX}`, { align: 'right' });

  const GX = PX + 28, GW = PW - 56, bgs = caseBgs(p);
  let gy = PY + 152;
  let col = 0;
  for (const [k, c] of p.cases.entries()) {
    const wide = isWide(n, k), bg = bgs[k];
    const cw = wide ? GW : (GW - GAP) / 2;
    const cx = wide ? GX : GX + col * (cw + GAP);
    box(cx, gy, cw, CH, 14, bg, 0);
    rays(cx, gy, cw, CH, 14, cx + cw / 2, gy + CH * 0.55);
    burst(cx + cw / 2, gy + (wide ? CH * 0.6 : 138), wide ? 190 : 150, wide ? 108 : 98, burstOn(bg, c));
    // Dans une demi-case, les personnages dépassent sous le cadre et sont coupés au bord : le mot reste lisible au-dessus d'eux
    x.save();
    x.beginPath();
    x.roundRect(cx, gy, cw, CH, 14);
    x.clip();
    if (c.by) await actor(c.by, cx + (wide ? 12 : 4), gy + CH - (wide ? 200 : 128), wide ? 190 : 150, -5);
    for (const [j, a] of c.hits.slice(0, 2).entries())
      await actor(a, cx + cw - (wide ? 170 : 122) - j * (wide ? 84 : 70), gy + CH - (wide ? 164 : 100) - j * (wide ? 62 : 34), wide ? 152 : 112, j ? -16 : 18, true);
    x.restore();
    frame(cx, gy, cw, CH, 14, 7);
    const capH = caption(c.cap, cx + 14, gy + 14, cw - 28);
    letter(c.fx, cx + cw / 2, gy + (wide ? CH * 0.65 : 14 + capH + 70), wide ? (c.fx.length > 9 ? 84 : 96) : c.fx.length > 8 ? 56 : 72,
      { rot: -6, align: 'center', max: wide ? cw - 420 : cw - 30 });
    if (wide) { gy += CH + GAP; col = 0; } else if (col === 1 || k === n - 1) { gy += CH + GAP; col = 0; } else col = 1;
  }

  // La case « FIN »
  const t = COL[p.fin.color];
  box(GX, gy, GW, FH, 14, finBg(p), 7);
  rays(GX, gy, GW, FH, 14, GX + GW / 2, gy + FH * 0.55);
  box(GX + 34, gy + FH - 122, 460, 92, 46, t.d, 7);
  for (let i = 0; i < 4; i++) {
    const bx = GX + 96 + i * 108, by = gy + FH - 82;
    x.beginPath();
    x.arc(bx, by, 34, 0, Math.PI * 2);
    x.fillStyle = t.c;
    x.fill();
    x.beginPath();
    x.arc(bx, by, 34, 0, Math.PI * 2);
    x.strokeStyle = INK;
    x.lineWidth = 7;
    x.stroke();
    x.beginPath();
    x.arc(bx - 13, by - 14, 8, 0, Math.PI * 2);
    x.fillStyle = '#fff';
    x.fill();
  }
  letter('Fin', GX + 540, gy + FH - 40, 92, { rot: -5 });
  const toc = await loadSvg(mascotSvg(p.fin.toc, { viewBox: '70 14 400 400', ground: false, arms: false }), 400);
  if (toc) x.drawImage(toc, GX + GW - 190, gy + FH - 184, 180, 180);
  caption(p.fin.cap, GX + 14, gy + 14, GW - 230);

  text(p.foot.toUpperCase(), PX + 34, PY + PH - 24, `900 25px ${TXT}`, { max: PW - 68 });

  // Pied : la date de la partie
  text(new Date().toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' }), W / 2, H - 32, `800 28px ${TXT}`, { align: 'center', fill: p.won ? INK : '#fff' });
  return new Promise((res) => cv.toBlob(res, 'image/png'));
}

/** Partage la planche par le menu du téléphone ; sans menu de partage, l'image est enregistrée. */
export async function sharePlanche(p: Planche): Promise<'partagee' | 'enregistree' | 'annulee' | 'impossible'> {
  const blob = await plancheImage(p).catch(() => null);
  if (!blob) return 'impossible';
  const file = new File([blob], 'toc-planche.png', { type: 'image/png' });
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], text: p.text });
      return 'partagee';
    } catch (e) {
      // Menu refermé sans rien envoyer : ce n'est pas une panne.
      if ((e as Error).name === 'AbortError') return 'annulee';
    }
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = file.name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 10000);
  return 'enregistree';
}

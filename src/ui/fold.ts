// Pliants : la forme de l'écran et la place de la pliure décident de la mise en page, jamais le modèle du téléphone.
// Cinq tenues, comme sur la maquette « TOC sur pliants » :
//   « open »  : grand ouvert, à plat (ou tablette) : la double page, comme un album de BD ouvert ;
//   « book »  : entrouvert comme un livre (pliure verticale) : une page de chaque côté, rien sur la pliure ;
//   « tent »  : posé en chevalet (pliure horizontale, grand écran) : le haut se regarde, le bas se touche ;
//   « flip »  : pliant à clapet entrouvert (pliure horizontale, écran de téléphone) ;
//   « phone » : tout le reste (téléphone, pliant fermé).

export type Pose = 'phone' | 'open' | 'book' | 'tent' | 'flip';
export interface Box { x: number; y: number; w: number; h: number }

/** Ce que le navigateur dit de l'écran. */
export interface Reading {
  w: number;
  h: number;
  /** Écran tactile (un ordinateur garde la mise en page du téléphone) */
  coarse: boolean;
  /** Volets côte à côte (2 : une pliure verticale sépare l'écran) et volets l'un sous l'autre (2 : pliure horizontale) */
  cols: number;
  rows: number;
  /** L'appareil se dit plié (true), à plat (false), ou ne dit rien (null) */
  folded: boolean | null;
}

/** Le plus petit côté d'un écran qui porte la double page (en dessous, c'est un téléphone). */
export const OPEN_MIN = 560;

/** La tenue qui convient à cet écran. */
export function poseOf(r: Reading): Pose {
  const small = Math.min(r.w, r.h);
  // Une pliure qui sépare vraiment l'écran : le navigateur annonce deux volets (sauf si l'appareil se dit à plat).
  if (r.folded !== false) {
    if (r.cols === 2 && small >= 480) return 'book';
    if (r.rows === 2) return r.w >= OPEN_MIN ? 'tent' : 'flip';
  }
  const ratio = r.w / r.h;
  return r.coarse && small >= OPEN_MIN && ratio >= 0.6 && ratio <= 1.8 ? 'open' : 'phone';
}

/**
 * La forme d'une double page à plat : « wide » (nettement plus large que haute : des colonnes sur les côtés),
 * « trio » (très large : trois volets), sinon « duo » (deux pages).
 */
export type Shape = 'duo' | 'wide' | 'trio';
export function shapeOf(w: number, h: number): Shape {
  const ratio = w / h;
  if (w >= 1000 && ratio >= 1.3) return 'trio';
  return ratio >= 1.25 ? 'wide' : 'duo';
}

type PostureApi = EventTarget & { type: string };
/** Les questions posées au navigateur, préparées au premier besoin (ce fichier se charge aussi sans navigateur, pour ses essais). */
let asked: { cols: MediaQueryList; rows: MediaQueryList; coarse: MediaQueryList; forced: Pose | null } | null = null;
function ask() {
  if (asked) return asked;
  // Essais et captures : « ?pli=book » (ou open, tent, flip, phone) impose une tenue, quel que soit l'écran.
  // (accepté aussi en fin d'adresse, après le « # » : « …/#/accueil?pli=open », là où on l'ajoute naturellement)
  const v = new URLSearchParams(location.search).get('pli') ?? new URLSearchParams(location.hash.split('?')[1] ?? '').get('pli');
  asked = {
    cols: matchMedia('(horizontal-viewport-segments: 2)'), rows: matchMedia('(vertical-viewport-segments: 2)'), coarse: matchMedia('(pointer: coarse)'),
    forced: v === 'phone' || v === 'open' || v === 'book' || v === 'tent' || v === 'flip' ? v : null,
  };
  return asked;
}
const postureApi = () => (navigator as Navigator & { devicePosture?: PostureApi }).devicePosture;

export function reading(): Reading {
  const p = postureApi()?.type, q = ask();
  return {
    w: innerWidth, h: innerHeight, coarse: q.coarse.matches,
    cols: q.cols.matches ? 2 : 1, rows: q.rows.matches ? 2 : 1,
    folded: p === 'folded' ? true : p === 'continuous' ? false : null,
  };
}

/** La tenue en cours. */
export const pose = (): Pose => ask().forced ?? poseOf(reading());
/** Grand écran hors partie : la double page (ouvert, en livre ou en chevalet). Le clapet garde l'écran du téléphone. */
export const spread = () => { const p = pose(); return p === 'open' || p === 'book' || p === 'tent'; };

function probe(css: string): Box {
  const el = document.createElement('div');
  el.style.cssText = `position:fixed;visibility:hidden;pointer-events:none;${css}`;
  document.body.append(el);
  const r = el.getBoundingClientRect();
  el.remove();
  return { x: r.left, y: r.top, w: r.width, h: r.height };
}
const segment = (i: number, j: number) =>
  probe(`left:env(viewport-segment-left ${i} ${j});top:env(viewport-segment-top ${i} ${j});width:env(viewport-segment-width ${i} ${j});height:env(viewport-segment-height ${i} ${j})`);

/**
 * Les deux volets de l'écran plié : gauche et droite (livre), ou haut et bas (chevalet, clapet).
 * Sans mesure du navigateur (tenue imposée), l'écran est coupé en deux moitiés.
 */
export function panes(p: Pose = pose()): [Box, Box] | null {
  if (p !== 'book' && p !== 'tent' && p !== 'flip') return null;
  const W = innerWidth, H = innerHeight, side = p === 'book';
  if (side ? ask().cols.matches : ask().rows.matches) {
    const a = segment(0, 0), b = side ? segment(1, 0) : segment(0, 1);
    if (a.w > 40 && a.h > 40 && b.w > 40 && b.h > 40) return [a, b];
  }
  return side ? [{ x: 0, y: 0, w: W / 2, h: H }, { x: W / 2, y: 0, w: W / 2, h: H }]
    : [{ x: 0, y: 0, w: W, h: H / 2 }, { x: 0, y: H / 2, w: W, h: H / 2 }];
}

/** Prévient quand on plie, déplie ou tourne l'appareil. */
export function watchFold(cb: () => void): () => void {
  const api = postureApi(), { cols, rows } = ask();
  cols.addEventListener?.('change', cb);
  rows.addEventListener?.('change', cb);
  api?.addEventListener('change', cb);
  window.addEventListener('resize', cb);
  return () => {
    cols.removeEventListener?.('change', cb);
    rows.removeEventListener?.('change', cb);
    api?.removeEventListener('change', cb);
    window.removeEventListener('resize', cb);
  };
}

// ---------- Pliant fermé : « Déplie-moi » ----------
// Rien ne dit à une page web qu'un téléphone est un pliant fermé. On le retient nous-mêmes : un appareil qui a déjà
// montré la double page et qui affiche maintenant un écran de téléphone est un pliant refermé.
const KEY = 'toc.pliant';
/** À appeler quand la double page s'affiche. */
export function noteOpened() {
  try { localStorage.setItem(KEY, '1'); } catch { /* sans stockage */ }
}
/** Ce téléphone a déjà montré la double page : c'est un pliant, en ce moment refermé. */
export function closedFoldable(): boolean {
  try { return pose() === 'phone' && localStorage.getItem(KEY) === '1'; } catch { return false; }
}

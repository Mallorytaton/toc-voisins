// Les personnages : chaque joueur est une bille avec un visage, un accessoire et des humeurs.
// Un seul dessin (SVG, repère 120 × 120, bille centrée en 60,66) pour l'accueil, la salle, le plateau et la planche de fin.
// Trait d'encre épais, aplats et ombre du même ton : la direction BD de l'app.
import { AV_COL, type CharId, type ColorName } from './data';

/** Humeurs d'une bille : elle réagit à la partie (visée, renvoyée, victorieuse…). */
export type Humeur = 'content' | 'joie' | 'malin' | 'concentre' | 'furieux' | 'panique' | 'ko';

const INK = '#16131f';

/** Une ellipse en tracé, pour passer d'un œil ouvert à un œil fermé sans changer de balise. */
const ell = (cx: number, cy: number, rx: number, ry: number) =>
  `M${cx - rx} ${cy} a${rx} ${ry} 0 1 0 ${2 * rx} 0 a${rx} ${ry} 0 1 0 ${-2 * rx} 0 Z`;
const L = 46, R = 76, Y = 64;
const open = (rx: number, ry: number) => ell(L, Y, rx, ry) + ' ' + ell(R, Y, rx, ry);
const pup = (dx: number, dy: number, rx: number, ry: number) => ell(L + dx, Y + dy, rx, ry) + ' ' + ell(R + dx, Y + dy, rx, ry);

interface Face {
  /** Blanc des yeux, pupilles, reflets : tracés pleins */
  white: string; pupil: string; glint: string;
  /** Yeux fermés ou en croix : traits */
  line: string;
  brow: string;
  /** Bouche ouverte (pleine), langue, dents (blanches), bouche en trait */
  mouth: string; tongue: string; teeth: string; smile: string;
  cheeks: number;
}

const FACES: Record<Humeur, Face> = {
  content: {
    white: open(10, 12.5), pupil: pup(2, 1.5, 4.8, 6.2), glint: pup(0.5, -1.5, 1.8, 1.8), line: '',
    brow: 'M36 46 Q45 41 54 45 M68 45 Q77 41 86 46',
    mouth: 'M47 82 Q61 88 75 82 Q74 99 61 99 Q48 99 47 82 Z', tongue: 'M54 94 Q61 89 68 94 Q61 99 54 94 Z', teeth: '', smile: '', cheeks: 0.3,
  },
  joie: {
    white: '', pupil: '', glint: '', line: 'M36 68 Q46 54 56 68 M66 68 Q76 54 86 68',
    brow: 'M35 47 Q45 39 55 45 M67 45 Q77 39 87 47',
    mouth: 'M43 79 Q61 86 79 79 Q78 104 61 104 Q44 104 43 79 Z', tongue: 'M52 97 Q61 90 70 97 Q61 104 52 97 Z', teeth: '', smile: '', cheeks: 0.34,
  },
  malin: {
    white: 'M36 63 A10 11 0 0 0 56 63 Z M66 63 A10 11 0 0 0 86 63 Z', pupil: pup(3, 4.5, 4.2, 4.5), glint: '', line: 'M34 63 H58 M64 63 H88',
    brow: 'M35 52 L56 51 M66 46 Q77 37 88 44',
    mouth: '', tongue: '', teeth: '', smile: 'M48 87 Q62 95 78 81 M78 81 Q81 79 82 76', cheeks: 0,
  },
  concentre: {
    white: open(10, 11.5), pupil: pup(3, 3.5, 4.8, 5.8), glint: pup(1.5, 1, 1.6, 1.6), line: '',
    brow: 'M35 45 L56 50 M87 45 L66 50',
    mouth: '', tongue: 'M68 86 Q76 86 76 92 Q76 97 71 97 Q66 97 66 91 Z', teeth: '', smile: 'M50 88 Q60 91 72 87', cheeks: 0,
  },
  furieux: {
    white: open(9, 10), pupil: pup(1, 1, 4.5, 5), glint: '', line: '',
    brow: 'M33 43 L57 54 M89 43 L65 54',
    mouth: '', tongue: '', teeth: 'M48 83 H74 Q79 83 79 88 V92 Q79 97 74 97 H48 Q43 97 43 92 V88 Q43 83 48 83 Z', smile: 'M52 83 V97 M61 83 V97 M70 83 V97 M43 90 H79', cheeks: 0,
  },
  panique: {
    white: open(12, 15), pupil: pup(0, 0, 3.2, 3.2), glint: '', line: '',
    brow: 'M34 47 L55 39 M88 47 L67 39',
    mouth: 'M50 86 Q55 80 61 82 Q68 79 72 86 Q76 96 68 100 Q61 103 54 100 Q46 96 50 86 Z', tongue: '', teeth: '', smile: '', cheeks: 0,
  },
  ko: {
    white: '', pupil: '', glint: '', line: 'M39 57 L53 71 M53 57 L39 71 M69 57 L83 71 M83 57 L69 71',
    brow: '', mouth: '', tongue: '', teeth: '', smile: 'M45 91 Q49.5 84 54 91 T63 91 T72 91 T79 89', cheeks: 0,
  },
};

/** L'accessoire de chaque perso, posé par-dessus le visage. `d` : ton foncé de la bille (cheveux du chignon). */
function accessoire(char: CharId, d: string): string {
  const s = `stroke="${INK}" stroke-linejoin="round" stroke-linecap="round"`;
  switch (char) {
    case 'tuque':
      return `<path d="M18 50 Q20 11 60 11 Q100 11 102 50 Q80 39 60 39 Q40 39 18 50 Z" fill="#fff7ea" ${s} stroke-width="4"/>`
        + `<path d="M18 50 Q40 39 60 39 Q80 39 102 50 L100 37 Q80 27 60 27 Q40 27 20 37 Z" fill="#3b5bff" ${s} stroke-width="4"/>`
        + `<circle cx="60" cy="8" r="8.5" fill="#fff7ea" ${s} stroke-width="4"/>`;
    case 'lunettes':
      return `<circle cx="46" cy="64" r="15" fill="#fff" fill-opacity=".22" ${s} stroke-width="4"/><circle cx="76" cy="64" r="15" fill="#fff" fill-opacity=".22" ${s} stroke-width="4"/>`
        + `<path d="M31 62 L19 57 M91 62 L103 57" fill="none" ${s} stroke-width="4"/>`;
    case 'casquette':
      return `<path d="M20 51 Q22 16 60 16 Q98 16 100 51 Q80 43 60 43 Q40 43 20 51 Z" fill="#2a2670" ${s} stroke-width="4"/>`
        + `<path d="M66 43 Q100 36 116 52 Q98 57 76 52 Z" fill="#ffcf1f" ${s} stroke-width="4"/><circle cx="60" cy="16" r="4" fill="#ffcf1f" ${s} stroke-width="3"/>`;
    case 'couronne':
      return `<path d="M35 33 L30 6 L47 21 L60 2 L73 21 L90 6 L85 33 Q60 26 35 33 Z" fill="#ffcf1f" ${s} stroke-width="4"/><circle cx="60" cy="21" r="4" fill="#ff5433" ${s} stroke-width="2.5"/>`;
    case 'chignon':
      return `<circle cx="60" cy="16" r="14" fill="${d}" ${s} stroke-width="4"/><path d="M52 12 Q58 6 66 9" fill="none" stroke="#fff" stroke-opacity=".7" stroke-width="3" stroke-linecap="round"/>`
        + `<path d="M24 46 Q40 22 60 26 Q80 22 96 46 Q78 34 60 37 Q42 34 24 46 Z" fill="${d}" ${s} stroke-width="4"/>`;
    case 'bandeau':
      return `<path d="M17 52 Q40 35 60 35 Q80 35 103 52 L101 40 Q80 24 60 24 Q40 24 19 40 Z" fill="#fff7ea" ${s} stroke-width="4"/>`
        + `<path d="M100 40 L116 30 L112 46 Z M101 46 L118 52 L106 60 Z" fill="#fff7ea" ${s} stroke-width="3.5"/><circle cx="101" cy="45" r="5" fill="#fff7ea" ${s} stroke-width="3.5"/>`;
  }
}

/**
 * Le dessin d'un personnage. `flip` : il regarde vers la gauche ; `ombre` : son ombre au sol.
 * Les lunettes passent sous les sourcils, les couvre-chefs par-dessus tout.
 */
export function persoSvg(char: CharId, color: ColorName, humeur: Humeur = 'content', o: { flip?: boolean; ombre?: boolean } = {}): string {
  const [c, d] = AV_COL[color] ?? AV_COL.coral;
  const f = FACES[humeur] ?? FACES.content;
  const lunettes = char === 'lunettes';
  const p = (path: string, attrs: string) => (path ? `<path d="${path}" ${attrs}/>` : '');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120" style="overflow:visible" aria-hidden="true">`
    + (o.ombre ? `<ellipse cx="62" cy="113" rx="34" ry="5" fill="${INK}" opacity=".22"/>` : '')
    + `<circle cx="60" cy="66" r="44" fill="${c}" stroke="${INK}" stroke-width="5"/>`
    + `<path d="M95.9 45.3 A41.5 41.5 0 0 1 39.3 101.9 A52 52 0 0 0 95.9 45.3 Z" fill="${d}"/>`
    + `<ellipse cx="41" cy="45" rx="11" ry="6" transform="rotate(-38 41 45)" fill="#fff" opacity=".92"/><circle cx="29" cy="60" r="3" fill="#fff" opacity=".92"/>`
    + `<g${o.flip ? ' transform="translate(120 0) scale(-1 1)"' : ''}>`
    + (f.cheeks ? `<ellipse cx="35" cy="81" rx="6.5" ry="4" fill="#fff" opacity="${f.cheeks}"/><ellipse cx="87" cy="81" rx="6.5" ry="4" fill="#fff" opacity="${f.cheeks}"/>` : '')
    + p(f.white, `fill="#fff" stroke="${INK}" stroke-width="3" stroke-linejoin="round"`)
    + p(f.pupil, `fill="${INK}"`) + p(f.glint, 'fill="#fff"')
    + p(f.line, `fill="none" stroke="${INK}" stroke-width="4.5" stroke-linecap="round" stroke-linejoin="round"`)
    + (lunettes ? accessoire(char, d) : '')
    + p(f.brow, `fill="none" stroke="${INK}" stroke-width="5.5" stroke-linecap="round" stroke-linejoin="round"`)
    + p(f.mouth, `fill="#5b1f1a" stroke="${INK}" stroke-width="3" stroke-linejoin="round"`)
    + p(f.tongue, 'fill="#ff8a7a"')
    + p(f.teeth, `fill="#fff" stroke="${INK}" stroke-width="3" stroke-linejoin="round"`)
    + p(f.smile, `fill="none" stroke="${INK}" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"`)
    + (lunettes ? '' : accessoire(char, d))
    + '</g>'
    + (humeur === 'panique' ? `<path d="M101 26 Q110 39 104 45 Q96 47 95 39 Q95 33 101 26 Z" fill="#9bdcff" stroke="${INK}" stroke-width="3" stroke-linejoin="round"/>` : '')
    + (humeur === 'ko'
      ? `<path d="M22 14 L25.5 22 L34 23 L27.5 28.5 L29.5 37 L22 32.5 L14.5 37 L16.5 28.5 L10 23 L18.5 22 Z" fill="#ffcf1f" stroke="${INK}" stroke-width="3" stroke-linejoin="round"/>`
        + `<path d="M98 6 L100.5 12 L107 12.5 L102 16.5 L103.5 23 L98 19.5 L92.5 23 L94 16.5 L89 12.5 L95.5 12 Z" fill="#fff" stroke="${INK}" stroke-width="3" stroke-linejoin="round"/>`
      : '')
    + '</svg>';
}

/** Un personnage prêt à poser dans la page, de `size` pixels de côté. */
export function perso(char: CharId, color: ColorName, size = 64, humeur: Humeur = 'content', o: { flip?: boolean; ombre?: boolean } = {}): HTMLElement {
  const el = document.createElement('span');
  el.className = 'perso';
  el.setAttribute('aria-hidden', 'true');
  el.style.width = el.style.height = size + 'px';
  el.dataset.humeur = humeur;
  el.innerHTML = persoSvg(char, color, humeur, o);
  return el;
}

/** Change l'humeur d'un personnage déjà posé (même perso, même couleur). */
export function setHumeur(el: HTMLElement, char: CharId, color: ColorName, humeur: Humeur, o: { flip?: boolean; ombre?: boolean } = {}) {
  if (el.dataset.humeur === humeur) return;
  el.dataset.humeur = humeur;
  el.innerHTML = persoSvg(char, color, humeur, o);
}

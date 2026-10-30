// Toc, la mascotte : un pion en bois à grosse tête, socle bleu nuit, gants blancs (d'après la planche de Mallory,
// redessiné dans le style de l'app). Un seul dessin (SVG) pour l'icône, le coach de l'initiation et les écrans.
// Repère : viewBox 512 × 512, pion entier de y ≈ 40 (couronne) à y ≈ 460 (ombre au sol).

export type MascotMood = 'content' | 'concentre' | 'surpris' | 'vainqueur';

const WOOD = '#e2b47f', WOOD_D = '#c48f57', WOOD_L = '#f4d6aa';
const BASE = '#1f4a6e', BASE_D = '#143650';
const INK = '#2b2a3d', BROW = '#7a4a26', ARM = '#9a6436', GLOVE = '#ffffff', GLOVE_D = '#e3d6c4';

let seq = 0;

/**
 * Une main gantée (moufle, deux plis de doigts, pouce, manchette), tournée pour que la manchette
 * regarde vers (ax, ay), le point d'où arrive le bras.
 */
function hand(x: number, y: number, ax: number, ay: number, r = 23): string {
  const rot = (Math.atan2(ay - y, ax - x) * 180) / Math.PI - 90;
  const st = `stroke="${GLOVE_D}" stroke-width="3"`;
  return `<g transform="rotate(${rot.toFixed(1)} ${x} ${y})">`
    + `<rect x="${x - r * .62}" y="${y + r * .62}" width="${r * 1.24}" height="${r * .55}" rx="${r * .22}" fill="${GLOVE}" ${st}/>`
    + `<ellipse cx="${x + r * .9}" cy="${y + r * .05}" rx="${r * .36}" ry="${r * .55}" transform="rotate(-25 ${x + r * .9} ${y})" fill="${GLOVE}" ${st}/>`
    + `<rect x="${x - r}" y="${y - r}" width="${r * 2}" height="${r * 1.8}" rx="${r * .85}" fill="${GLOVE}" ${st}/>`
    + `<path d="M${x - r * .33} ${y - r * .95} v${r * .55} M${x + r * .2} ${y - r * .98} v${r * .55}" stroke="${GLOVE_D}" stroke-width="3" stroke-linecap="round"/>`
    + '</g>';
}

/** Le pouce levé : poing de profil, pouce dressé, manchette vers le bas à gauche (le bras). */
function thumbsUp(x: number, y: number, r = 25): string {
  const st = `stroke="${GLOVE_D}" stroke-width="3"`;
  return `<rect x="${x - r * .55}" y="${y - r * 1.95}" width="${r * .78}" height="${r * 1.55}" rx="${r * .39}" fill="${GLOVE}" ${st}/>`
    + `<rect x="${x - r}" y="${y - r * .7}" width="${r * 2}" height="${r * 1.55}" rx="${r * .55}" fill="${GLOVE}" ${st}/>`
    + `<path d="M${x - r * .1} ${y - r * .2} h${r * .8} M${x - r * .1} ${y + r * .25} h${r * .8}" stroke="${GLOVE_D}" stroke-width="3" stroke-linecap="round"/>`
    + `<rect x="${x - r * 1.35}" y="${y - r * .15}" width="${r * .5}" height="${r * 1.1}" rx="${r * .2}" transform="rotate(-20 ${x - r * 1.1} ${y + r * .4})" fill="${GLOVE}" ${st}/>`;
}

/** Un bras : trait brun arrondi de l'épaule (sx, sy) à la main (hx, hy), courbé par (cx, cy). */
const arm = (sx: number, sy: number, cx: number, cy: number, hx: number, hy: number) =>
  `<path d="M${sx} ${sy} Q${cx} ${cy} ${hx} ${hy}" fill="none" stroke="${ARM}" stroke-width="18" stroke-linecap="round"/>`;

function face(mood: MascotMood): string {
  const eye = (x: number, dx = 0, dy = 0, big = 1) =>
    `<ellipse cx="${x}" cy="160" rx="${29 * big}" ry="${35 * big}" fill="#fff" stroke="${WOOD_D}" stroke-width="3"/>`
    + `<ellipse cx="${x + 5 + dx}" cy="${167 + dy}" rx="${(mood === 'surpris' ? 12 : 16)}" ry="${(mood === 'surpris' ? 15 : 20)}" fill="${INK}"/>`
    + `<circle cx="${x - 2 + dx}" cy="${158 + dy}" r="7" fill="#fff"/>`;
  const happyEye = (x: number) => `<path d="M${x - 24} 170 Q${x} 140 ${x + 24} 170" fill="none" stroke="${INK}" stroke-width="10" stroke-linecap="round"/>`;
  const brow = (x: number, tilt: number, lift = 0) =>
    `<path d="M${x - 24} ${108 - lift + tilt} Q${x} ${96 - lift} ${x + 24} ${108 - lift - tilt}" fill="none" stroke="${BROW}" stroke-width="9" stroke-linecap="round"/>`;
  const cheeks = `<ellipse cx="186" cy="206" rx="19" ry="11" fill="#ff6b6b" opacity=".32"/><ellipse cx="326" cy="206" rx="19" ry="11" fill="#ff6b6b" opacity=".32"/>`;
  const nose = `<ellipse cx="256" cy="196" rx="12" ry="9" fill="${WOOD_D}"/>`;
  const bigSmile = `<path d="M212 214 Q256 276 300 214 Q256 230 212 214 Z" fill="#5b2318"/><path d="M236 246 Q256 230 276 246 Q256 258 236 246 Z" fill="#ff8f80"/>`;
  switch (mood) {
    case 'concentre':
      return brow(214, 6, 4) + brow(298, -10) + eye(214, -7, -8) + eye(298, -7, -8) + cheeks + nose
        + `<path d="M234 230 Q252 222 276 228" fill="none" stroke="#5b2318" stroke-width="9" stroke-linecap="round"/>`;
    case 'surpris':
      return brow(214, -4, 14) + brow(298, 4, 14) + eye(214, 0, 0, 1.08) + eye(298, 0, 0, 1.08) + cheeks + nose
        + `<ellipse cx="256" cy="238" rx="17" ry="21" fill="#5b2318"/>`;
    case 'vainqueur':
      return brow(214, 0, 8) + brow(298, 0, 8) + happyEye(214) + happyEye(298) + cheeks + nose + bigSmile;
    default:
      return brow(214, 2) + brow(298, -2) + eye(214, 3) + eye(298, 3) + cheeks + nose + bigSmile;
  }
}

function arms(mood: MascotMood): { back: string; front: string } {
  switch (mood) {
    case 'concentre': // une main sous le menton, l'autre le long du corps
      return {
        back: arm(212, 304, 186, 340, 160, 372) + hand(156, 380, 186, 340, 21),
        front: arm(300, 308, 350, 300, 318, 270) + hand(306, 262, 338, 300, 22),
      };
    case 'surpris': // les mains levées de chaque côté, paumes ouvertes
      return { back: '', front: arm(212, 304, 160, 300, 138, 252) + arm(300, 304, 352, 300, 374, 252) + hand(134, 238, 150, 290) + hand(378, 238, 362, 290) };
    case 'vainqueur': // les deux bras en l'air, bien au-dessus des épaules
      return { back: arm(212, 300, 140, 270, 118, 168) + arm(300, 300, 372, 270, 394, 168), front: hand(114, 150, 124, 200, 24) + hand(398, 150, 388, 200, 24) };
    default: // pouce levé, l'autre bras le long du corps
      return {
        back: arm(212, 304, 186, 340, 160, 372) + hand(156, 380, 186, 340, 21),
        front: arm(300, 304, 362, 316, 384, 282) + thumbsUp(398, 270),
      };
  }
}

const crown = `<path d="M206 78 L214 36 L238 60 L256 26 L274 60 L298 36 L306 78 Z" fill="#ffc93c" stroke="#d9a116" stroke-width="5" stroke-linejoin="round"/>`
  + `<circle cx="256" cy="58" r="7" fill="#ff6b4a"/>`;

/** Le dessin SVG de Toc. `ground` : son ombre au sol (pas dans l'icône, où il est coupé). */
export function mascotSvg(mood: MascotMood = 'content', o: { viewBox?: string; ground?: boolean } = {}): string {
  const k = ++seq;
  const head = `hd${k}`, body = `bd${k}`, gloss = `gl${k}`;
  const { back, front } = arms(mood);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${o.viewBox ?? '0 0 512 512'}" aria-hidden="true">
<defs>
<clipPath id="${head}"><circle cx="256" cy="168" r="112"/></clipPath>
<linearGradient id="${body}" x1="0" x2="1" y1="0" y2="0"><stop offset="0" stop-color="${WOOD_L}"/><stop offset=".45" stop-color="${WOOD}"/><stop offset="1" stop-color="${WOOD_D}"/></linearGradient>
<radialGradient id="${gloss}" cx="34%" cy="26%" r="42%"><stop offset="0" stop-color="#fff" stop-opacity=".55"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient>
</defs>
${o.ground === false ? '' : '<ellipse cx="256" cy="456" rx="122" ry="14" fill="#000" opacity=".13"/>'}
${back}
<path d="M210 262 C208 322 170 372 160 412 L352 412 C342 372 304 322 302 262 Z" fill="url(#${body})"/>
<path d="M232 330 C228 360 222 382 218 404 M286 300 C292 336 300 368 306 404" fill="none" stroke="${WOOD_D}" stroke-width="4" stroke-linecap="round" opacity=".35"/>
<ellipse cx="256" cy="278" rx="62" ry="13" fill="${WOOD_D}" opacity=".55"/>
<rect x="148" y="398" width="216" height="54" rx="24" fill="${BASE_D}"/>
<rect x="148" y="398" width="216" height="40" rx="20" fill="${BASE}"/>
<rect x="172" y="406" width="120" height="8" rx="4" fill="#fff" opacity=".18"/>
<circle cx="256" cy="168" r="112" fill="${WOOD_D}"/>
<circle cx="244" cy="152" r="112" fill="${WOOD}" clip-path="url(#${head})"/>
<circle cx="256" cy="168" r="112" fill="url(#${gloss})"/>
${face(mood)}
${front}
${mood === 'vainqueur' ? crown : ''}
</svg>`;
}

/** Toc dans la page : `crop` 'buste' ne garde que la tête et les épaules (coach, bulles). */
export function mascot(mood: MascotMood = 'content', size = 96, crop: 'entier' | 'buste' = 'entier'): HTMLElement {
  const el = document.createElement('span');
  el.className = 'mascot';
  el.style.width = el.style.height = size + 'px';
  el.innerHTML = mascotSvg(mood, crop === 'buste' ? { viewBox: '84 10 344 344', ground: false } : {});
  return el;
}

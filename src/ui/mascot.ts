// Toc, la mascotte : la bille blanche masquée, héroïne et narratrice du jeu. Masque bleu nuit, cape rouge,
// gants blancs qui flottent. Même famille que les personnages des joueurs (src/ui/kit/perso.ts), mais d'une couleur
// qu'aucun joueur ne porte : on la reconnaît partout, de l'icône de l'app jusqu'aux moments forts de la partie.
// Repère : viewBox 512 × 512, bille centrée en (256, 200), rayon 150 ; la cape descend jusqu'à y ≈ 455.

export type MascotMood = 'content' | 'concentre' | 'surpris' | 'vainqueur';

const INK = '#16131f', IVORY = '#fffdf6', SHADE = '#e2dccd', NUIT = '#241f63', ROUGE = '#ff5433', ROUGE_D = '#d4381b', JAUNE = '#ffcf1f';
const st = (w: number) => `stroke="${INK}" stroke-width="${w}" stroke-linejoin="round" stroke-linecap="round"`;
const ell = (cx: number, cy: number, rx: number, ry: number) =>
  `M${cx - rx} ${cy} a${rx} ${ry} 0 1 0 ${2 * rx} 0 a${rx} ${ry} 0 1 0 ${-2 * rx} 0 Z`;
const EL = 202, ER = 310, EY = 186;
const two = (dx: number, dy: number, rx: number, ry: number) => ell(EL + dx, EY + dy, rx, ry) + ' ' + ell(ER + dx, EY + dy, rx, ry);

/** Un gant ouvert (moufle, pouce, manchette), tourné de `rot` degrés autour de son centre. */
function glove(x: number, y: number, rot: number, r = 30): string {
  return `<g transform="rotate(${rot} ${x} ${y})">`
    + `<rect x="${x - r * 0.62}" y="${y + r * 0.6}" width="${r * 1.24}" height="${r * 0.6}" rx="${r * 0.22}" fill="#fff" ${st(8)}/>`
    + `<ellipse cx="${x + r * 0.95}" cy="${y + r * 0.1}" rx="${r * 0.36}" ry="${r * 0.58}" transform="rotate(-25 ${x + r * 0.95} ${y})" fill="#fff" ${st(8)}/>`
    + `<rect x="${x - r}" y="${y - r}" width="${r * 2}" height="${r * 1.8}" rx="${r * 0.85}" fill="#fff" ${st(8)}/>`
    + `<path d="M${x - r * 0.33} ${y - r * 0.9} v${r * 0.5} M${x + r * 0.2} ${y - r * 0.92} v${r * 0.5}" fill="none" ${st(6)}/>`
    + '</g>';
}

/** Le pouce levé : poing de profil, pouce dressé. */
function thumbsUp(x: number, y: number, r = 30): string {
  return `<rect x="${x - r * 0.55}" y="${y - r * 1.95}" width="${r * 0.78}" height="${r * 1.55}" rx="${r * 0.39}" fill="#fff" ${st(8)}/>`
    + `<rect x="${x - r}" y="${y - r * 0.7}" width="${r * 2}" height="${r * 1.55}" rx="${r * 0.55}" fill="#fff" ${st(8)}/>`
    + `<path d="M${x - r * 0.1} ${y - r * 0.15} h${r * 0.8} M${x - r * 0.1} ${y + r * 0.3} h${r * 0.8}" fill="none" ${st(6)}/>`;
}

/** Un poing levé (victoire). */
function fist(x: number, y: number, r = 30): string {
  return `<rect x="${x - r * 0.62}" y="${y + r * 0.55}" width="${r * 1.24}" height="${r * 0.6}" rx="${r * 0.22}" fill="#fff" ${st(8)}/>`
    + `<rect x="${x - r}" y="${y - r * 0.85}" width="${r * 2}" height="${r * 1.6}" rx="${r * 0.6}" fill="#fff" ${st(8)}/>`
    + `<path d="M${x - r * 0.45} ${y - r * 0.8} v${r * 0.55} M${x} ${y - r * 0.82} v${r * 0.55} M${x + r * 0.45} ${y - r * 0.8} v${r * 0.55}" fill="none" ${st(6)}/>`;
}

interface Face { white: string; pupil: string; glint: string; lids: string; brow: string; mouth: string; tongue: string; smile: string }

function face(mood: MascotMood): Face {
  switch (mood) {
    case 'concentre':
      return {
        white: 'M166 182 A36 34 0 0 0 238 182 Z M274 182 A36 34 0 0 0 346 182 Z', pupil: two(-8, 12, 14, 14), glint: '', lids: '',
        brow: 'M170 118 L236 130 M276 130 L342 110', mouth: '', tongue: 'M290 280 Q306 278 306 292 Q306 304 296 304 Q286 304 286 290 Z',
        smile: 'M210 288 Q252 300 302 276',
      };
    case 'surpris':
      return {
        white: two(0, 0, 40, 46), pupil: two(0, 2, 11, 13), glint: two(-4, -3, 4, 4), lids: '',
        brow: 'M170 104 Q202 84 234 100 M278 100 Q310 84 342 104', mouth: ell(256, 288, 23, 27), tongue: '', smile: '',
      };
    case 'vainqueur':
      return {
        white: '', pupil: '', glint: '', lids: 'M168 198 Q202 150 236 198 M276 198 Q310 150 344 198',
        brow: 'M170 112 Q202 94 234 108 M278 108 Q310 94 342 112',
        mouth: 'M186 256 Q256 338 326 256 Q256 280 186 256 Z', tongue: 'M226 300 Q256 280 286 300 Q256 318 226 300 Z', smile: '',
      };
    default:
      return {
        white: two(0, 0, 36, 40), pupil: two(6, 6, 17, 21), glint: two(1, -3, 7, 7), lids: '',
        brow: 'M172 118 Q202 100 232 114 M280 114 Q310 100 340 118',
        mouth: 'M196 260 Q256 324 316 260 Q256 282 196 260 Z', tongue: 'M228 296 Q256 278 284 296 Q256 312 228 296 Z', smile: '',
      };
  }
}

function hands(mood: MascotMood): string {
  switch (mood) {
    case 'concentre': return glove(86, 336, 18) + glove(346, 340, -28, 28);
    case 'surpris': return glove(62, 204, -18) + glove(452, 292, 18);
    case 'vainqueur': return fist(60, 108) + fist(456, 62);
    default: return glove(84, 336, 18) + thumbsUp(444, 330);
  }
}

/** Le dessin SVG de Toc. `ground` : son ombre au sol ; `arms` : sans les gants (icône, tout petit format). */
export function mascotSvg(mood: MascotMood = 'content', o: { viewBox?: string; ground?: boolean; arms?: boolean } = {}): string {
  const f = face(mood);
  const p = (d: string, attrs: string) => (d ? `<path d="${d}" ${attrs}/>` : '');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${o.viewBox ?? '0 0 512 512'}" aria-hidden="true">
${o.ground === false ? '' : `<ellipse cx="262" cy="470" rx="132" ry="14" fill="${INK}" opacity=".16"/>`}
<path d="M138 262 C112 330 128 392 108 446 C150 436 170 458 214 440 C250 462 290 440 330 452 C370 438 406 454 450 416 C412 372 398 318 374 262 Z" fill="${ROUGE}" ${st(12)}/>
<path d="M214 346 C206 384 216 412 210 438 M300 350 C312 388 320 418 330 448" fill="none" stroke="${ROUGE_D}" stroke-width="9" stroke-linecap="round"/>
<path d="M400 170 L462 140 L446 182 Z M400 186 L466 206 L432 226 Z" fill="${NUIT}" ${st(10)}/>
<circle cx="256" cy="200" r="150" fill="${IVORY}" ${st(13)}/>
<path d="M379.8 128.5 A143 143 0 0 1 184.5 323.8 A180 180 0 0 0 379.8 128.5 Z" fill="${SHADE}"/>
<ellipse cx="150" cy="270" rx="20" ry="12" fill="#ff9fb0" opacity=".8"/><ellipse cx="362" cy="270" rx="20" ry="12" fill="#ff9fb0" opacity=".8"/>
<path d="M110 176 C130 118 382 118 402 176 C410 222 370 252 312 236 C290 229 270 222 256 222 C242 222 222 229 200 236 C142 252 102 222 110 176 Z" fill="${NUIT}" ${st(11)}/>
<circle cx="404" cy="180" r="12" fill="${NUIT}" ${st(9)}/>
${p(f.white, `fill="#fff" ${st(9)}`)}${p(f.pupil, `fill="${INK}"`)}${p(f.glint, 'fill="#fff"')}
${p(f.lids, 'fill="none" stroke="#fff" stroke-width="13" stroke-linecap="round"')}
${p(f.brow, `fill="none" ${st(12)}`)}
${p(f.mouth, `fill="#5b1f1a" ${st(9)}`)}${p(f.tongue, 'fill="#ff8a7a"')}${p(f.smile, `fill="none" ${st(11)}`)}
<circle cx="256" cy="360" r="19" fill="${JAUNE}" ${st(9)}/><circle cx="250" cy="354" r="5" fill="#fff"/>
${mood === 'vainqueur' ? `<path d="M196 70 L206 18 L234 46 L256 8 L278 46 L306 18 L316 70 Q256 54 196 70 Z" fill="${JAUNE}" ${st(11)}/><circle cx="256" cy="44" r="8" fill="${ROUGE}" ${st(6)}/>` : ''}
${o.arms === false ? '' : hands(mood)}
</svg>`;
}

/** Toc et une phrase dessous : écrans vides, messages. */
export function tocSays(text: string, mood: MascotMood = 'content', size = 84): HTMLElement {
  const el = document.createElement('div');
  el.className = 'toc-says';
  const p = document.createElement('p');
  p.className = 'empty';
  p.textContent = text;
  el.append(mascot(mood, size, 'buste'), p);
  return el;
}

/** Toc dans la page : `crop` 'buste' ne garde que la bille et son masque, sans la cape ni les gants (coach, bulles). */
export function mascot(mood: MascotMood = 'content', size = 96, crop: 'entier' | 'buste' = 'entier'): HTMLElement {
  const el = document.createElement('span');
  el.className = 'mascot';
  el.style.width = el.style.height = size + 'px';
  el.innerHTML = mascotSvg(mood, crop === 'buste' ? { viewBox: '70 14 400 400', ground: false, arms: false } : {});
  return el;
}

// Exporte Toc en fichiers SVG (planche des expressions, icône) : npx tsx scripts/mascotte-svg.ts <dossier>
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { mascotSvg, type MascotMood } from '../src/ui/mascot.ts';

const out = process.argv[2] ?? '.';
for (const m of ['content', 'concentre', 'surpris', 'vainqueur'] as MascotMood[]) writeFileSync(join(out, `toc-${m}.svg`), mascotSvg(m));
// Icône : fond bleu de l'app, Toc en grand (pouce levé), socle coupé en bas.
const inner = mascotSvg('content', { ground: false }).replace(/^<svg[^>]*>/, '').replace(/<\/svg>\s*$/, '');
const icon = (scale: number, x: number, y: number) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
<rect width="512" height="512" fill="#4a7dff"/>
<circle cx="256" cy="246" r="214" fill="#5b8aff"/>
<g transform="translate(${x - 256 * scale} ${y - 168 * scale}) scale(${scale})">${inner}</g>
</svg>`;
// Corps entier ou presque (1.2), et plan serré sur la tête (1.45) : plus lisible en tout petit.
writeFileSync(join(out, 'icone-toc.svg'), icon(1.2, 250, 214));
writeFileSync(join(out, 'icone-toc-serre.svg'), icon(1.45, 236, 240));
console.log('OK');

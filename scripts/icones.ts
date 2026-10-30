// Icônes de l'app d'après Toc, la mascotte : npx tsx scripts/icones.ts
// Écrit dans public/ : icon-192.png, icon-512.png, icon-maskable-512.png (Toc dans le cercle visible
// des icônes Android découpées), apple-touch-icon.png (180, sans transparence) et favicon.svg (la tête seule).
import { writeFileSync } from 'node:fs';
import { chromium } from '@playwright/test';
import { mascotSvg } from '../src/ui/mascot.ts';

const BLUE = '#4a7dff', HALO = '#5b8aff';
const strip = (svg: string) => svg.replace(/^<svg[^>]*>/, '').replace(/<\/svg>\s*$/, '');
const inner = strip(mascotSvg('content', { ground: false }));
/** Toc agrandi `scale` fois, la tête centrée en (x, y), sur le fond bleu de l'app. */
const icon = (scale: number, x: number, y: number, rx = 0, body = inner) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
<rect width="512" height="512" rx="${rx}" fill="${BLUE}"/>
<circle cx="256" cy="246" r="214" fill="${HALO}"/>
<g transform="translate(${x - 256 * scale} ${y - 168 * scale}) scale(${scale})">${body}</g>
</svg>`;

const files: [string, string, number][] = [
  ['icon-512.png', icon(1.45, 236, 240), 512],
  ['icon-192.png', icon(1.45, 236, 240), 192],
  // Découpe en cercle (Android) : tout l'essentiel tient dans 80 % du carré.
  ['icon-maskable-512.png', icon(1.15, 246, 236), 512],
  ['apple-touch-icon.png', icon(1.45, 236, 240), 180],
];

const browser = await chromium.launch();
const page = await browser.newPage();
for (const [name, svg, size] of files) {
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(`<html><body style="margin:0">${svg.replace('<svg ', `<svg width="${size}" height="${size}" `)}</body></html>`);
  await page.screenshot({ path: `public/${name}`, omitBackground: false });
  console.log('écrit public/' + name);
}
await browser.close();

// Favicon : la tête seule, sur une tuile bleue arrondie (lisible à 16 px dans un onglet).
writeFileSync('public/favicon.svg', icon(1.9, 256, 270, 112, strip(mascotSvg('content', { ground: false, arms: false }))));
console.log('écrit public/favicon.svg');

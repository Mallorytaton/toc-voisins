// Icônes de l'app d'après Toc, la mascotte, façon couverture de BD : npx tsx scripts/icones.ts
// Écrit dans public/ : icon-192.png, icon-512.png, icon-maskable-512.png (Toc dans le cercle visible
// des icônes Android découpées), apple-touch-icon.png (180, sans transparence) et favicon.svg (la tête seule).
import { writeFileSync } from 'node:fs';
import { chromium } from '@playwright/test';
import { mascotSvg } from '../src/ui/mascot.ts';

const JAUNE = '#ffcf1f', INK = '#16131f';
const strip = (svg: string) => svg.replace(/^<svg[^>]*>/, '').replace(/<\/svg>\s*$/, '');
const inner = strip(mascotSvg('content', { ground: false }));
/** Les rayons de la couverture, autour de (cx, cy). */
const rays = (cx: number, cy: number) => Array.from({ length: 14 }, (_, k) => {
  const a = (k / 14) * Math.PI * 2 + 0.1, b = a + Math.PI / 24;
  const p = (t: number) => `${(cx + 900 * Math.cos(t)).toFixed(1)} ${(cy + 900 * Math.sin(t)).toFixed(1)}`;
  return `<path d="M${cx} ${cy} L${p(a)} L${p(b)} Z" fill="#fff" opacity=".3"/>`;
}).join('');
/**
 * Toc agrandi `scale` fois, la tête centrée en (x, y), sur le jaune de l'app et ses rayons.
 * rx : coins arrondis ; cerne : trait d'encre autour de la tuile (favicon).
 */
const icon = (scale: number, x: number, y: number, rx = 0, body = inner, cerne = 0) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
<defs><clipPath id="t"><rect width="512" height="512" rx="${rx}"/></clipPath></defs>
<g clip-path="url(#t)"><rect width="512" height="512" fill="${JAUNE}"/>${rays(256, 250)}
<g transform="translate(${x - 256 * scale} ${y - 200 * scale}) scale(${scale})">${body}</g></g>
${cerne ? `<rect x="${cerne / 2}" y="${cerne / 2}" width="${512 - cerne}" height="${512 - cerne}" rx="${rx - cerne / 2}" fill="none" stroke="${INK}" stroke-width="${cerne}"/>` : ''}
</svg>`;

const files: [string, string, number][] = [
  ['icon-512.png', icon(1.12, 256, 214), 512],
  ['icon-192.png', icon(1.12, 256, 214), 192],
  // Découpe en cercle (Android) : tout l'essentiel tient dans 80 % du carré.
  ['icon-maskable-512.png', icon(0.9, 256, 222), 512],
  ['apple-touch-icon.png', icon(1.12, 256, 214), 180],
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

// Favicon : la tête seule, sur une tuile jaune cernée d'encre (lisible à 16 px dans un onglet).
writeFileSync('public/favicon.svg', icon(1.5, 256, 262, 112, strip(mascotSvg('content', { ground: false, arms: false })), 26));
console.log('écrit public/favicon.svg');

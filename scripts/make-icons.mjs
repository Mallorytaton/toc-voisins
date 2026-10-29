// Génère les icônes PNG de la PWA à partir de public/favicon.svg (via Playwright/Chromium).
import { chromium } from '@playwright/test';
import { readFileSync } from 'node:fs';

const svg = readFileSync('public/favicon.svg', 'utf8');
const browser = await chromium.launch();
const page = await browser.newPage();
// [fichier, taille, marge, fond] : fond transparent pour les icônes classiques ; bleu plein pour
// l'icône « maskable » (Android la découpe) et pour iOS (qui remplit la transparence en noir).
const shots = [
  ['public/icon-192.png', 192, 0, 'transparent'],
  ['public/icon-512.png', 512, 0, 'transparent'],
  ['public/apple-touch-icon.png', 180, 0.04, '#4a7dff'],
  ['public/icon-maskable-512.png', 512, 0.12, '#4a7dff'],
];
// Sur fond bleu plein, le système arrondit lui-même : on ne garde que la bille.
const plain = svg.replace(/<rect[^>]*\/>/g, '');
for (const [file, size, pad, bg] of shots) {
  const art = bg === 'transparent' ? svg : plain;
  await page.setViewportSize({ width: size, height: size });
  const inner = Math.round(size * (1 - 2 * pad));
  await page.setContent(`<body style="margin:0;background:${bg};display:flex;align-items:center;justify-content:center;width:${size}px;height:${size}px">
    <div style="width:${inner}px;height:${inner}px">${art.replace('<svg ', `<svg width="${inner}" height="${inner}" `)}</div></body>`);
  await page.screenshot({ path: file, omitBackground: bg === 'transparent' });
}
await browser.close();
console.log('icônes générées');

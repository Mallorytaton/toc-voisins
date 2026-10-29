// Mesure la hauteur naturelle de chaque écran (393 de large), en mode démo.
import { chromium } from '@playwright/test';
const base = (process.env.TOC_URL ?? 'http://localhost:5180/toc-voisins/') + '?demo';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 393, height: 700 } });
await page.addInitScript(() => localStorage.setItem('toc.profile', JSON.stringify(
  { nick: 'Frédo', char: 'tuque', color: 'coral', level: 14, xp: 13680, tokens: 2450, friendCode: 'FREDO#2741', qc: true })));
for (const r of ['/splash', '/bienvenue', '/perso', '/accueil', '/salle/nouvelle', '/gang', '/classement']) {
  await page.goto(base + '#' + r);
  await page.waitForTimeout(r.startsWith('/salle') ? 3500 : 700);
  const h = await page.evaluate(() => Math.max(...[...document.querySelectorAll('.screen')].map((e) => e.scrollHeight)));
  console.log(r.padEnd(16), h);
}
await browser.close();

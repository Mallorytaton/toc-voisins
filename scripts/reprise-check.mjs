// Partie en ligne contre 3 robots : pas de coup joué à ta place, puis app fermée et reprise.
// Usage : node scripts/reprise-check.mjs <dossier>
import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

const [out = 'captures'] = process.argv.slice(2);
const base = (process.env.TOC_URL ?? 'http://localhost:5180/toc-voisins/') + '?debug';
mkdirSync(out, { recursive: true });
const browser = await chromium.launch();
const opts = { viewport: { width: 393, height: 852 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true };
let ctx = await browser.newContext(opts);
let page = await ctx.newPage();
await page.addInitScript(() => {
  localStorage.setItem('toc.install.later', String(Date.now()));
  if (!localStorage.getItem('toc.profile')) localStorage.setItem('toc.profile', JSON.stringify({ nick: 'Frédo', char: 'tuque', color: 'coral', level: 1, xp: 0, tokens: 0 }));
});
const hint = () => page.locator('.g-hint b').innerText().catch(() => '');
const hand = () => page.locator('.hand .pcard').count();

await page.goto(base + '#/salle/nouvelle?n=4');
await page.waitForURL(/#\/salle\/\d{4}$/, { timeout: 20000 });
await page.getByRole('button', { name: 'Compléter avec des robots' }).click();
await page.getByRole('button', { name: 'Lancer la partie' }).click();
await page.waitForSelector('.game', { timeout: 20000 });
for (let k = 0; k < 40 && (await hint()) !== 'Échange'; k++) await page.waitForTimeout(500);
await page.locator('.hand .pcard').first().click({ force: true });
await page.getByRole('button', { name: 'Donner' }).click();
for (let k = 0; k < 60 && (await hint()) !== 'À ton tour !'; k++) await page.waitForTimeout(500);
const before = await hand();
console.log('À mon tour, cartes en main :', before);
await page.waitForTimeout(40_000);
const after = await hand();
console.log(`Après 40 s sans jouer : ${after} cartes, indice « ${await hint()} » ; minuteur visible : ${await page.locator('.g-timer > div').isVisible()}`);

// L'app est fermée puis rouverte (même mémoire du téléphone).
const state = await ctx.storageState({ indexedDB: true }); // la session Firebase est dans IndexedDB
await ctx.close();
ctx = await browser.newContext({ ...opts, storageState: state });
page = await ctx.newPage();
await page.goto(base + '#/accueil');
await page.getByRole('button', { name: 'Reprendre' }).waitFor({ timeout: 20000 });
await page.screenshot({ path: join(out, '01-accueil-reprendre.png') });
console.log('Accueil : « Reprendre » proposé.');
await page.getByRole('button', { name: 'Reprendre' }).click();
await page.waitForSelector('.game', { timeout: 20000 });
await page.waitForTimeout(3000);
await page.screenshot({ path: join(out, '02-partie-reprise.png') });
console.log(`Partie reprise : ${await hand()} cartes en main, indice « ${await hint()} »`);
await browser.close();

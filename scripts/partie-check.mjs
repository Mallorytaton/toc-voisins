// Joue le début d'une partie locale contre des robots et capture chaque étape.
// Usage : node scripts/partie-check.mjs <dossier> [4|6]   (serveur `npx vite --port 5180` lancé avant)
import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

const [out = 'captures', mode = '4'] = process.argv.slice(2);
const base = (process.env.TOC_URL ?? 'http://localhost:5180/toc-voisins/') + '?debug';
mkdirSync(out, { recursive: true });

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 393, height: 852 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
await page.addInitScript(() => localStorage.setItem('toc.profile', JSON.stringify(
  { nick: 'Frédo', char: 'tuque', color: 'coral', level: 14, xp: 13680, tokens: 2450, friendCode: 'FREDO#2741' })));
const errors = [];
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
page.on('pageerror', (e) => errors.push(String(e)));
const shot = async (name) => { await page.screenshot({ path: join(out, `${mode}j-${name}.png`) }); console.log('capturé', name); };
const hint = () => page.locator('.g-hint b').innerText();

await page.goto(`${base}#/salle/nouvelle?n=${mode}`);
await page.getByRole('button', { name: 'Compléter avec des robots' }).click();
await page.getByRole('button', { name: 'Lancer la partie' }).click();
await page.waitForSelector('.game', { timeout: 10000 });
await page.waitForTimeout(1900);
await shot('01-distribution');

// Main de la maquette (As, 4, 7, Valet, Dame) + un Roi qu'on donne au partenaire.
await page.evaluate(() => { window.__toc.game().state.hands[0] = ['AS0', '4H0', '7D0', 'JC0', 'QH0', 'KD0']; });
await page.locator('.hand .pcard').first().click();
await page.locator('.hand .pcard').last().click();
await page.waitForTimeout(400);
await shot('02-echange');
await page.getByRole('button', { name: 'Donner' }).click();

const myTurn = async () => {
  for (let k = 0; k < 60 && (await hint()) !== 'À ton tour !'; k++) await page.waitForTimeout(500);
  await page.waitForTimeout(1600);
};
/** Touche la carte de rang `r`, choisit une bille si besoin, capture l'aperçu puis joue. */
const play = async (r, tag) => {
  await page.locator('.hand .pcard', { has: page.locator('.pcard__rank', { hasText: new RegExp(`^${r}$`) }) }).first().click();
  await page.waitForTimeout(350);
  if (!(await page.locator('.g-play:not([hidden])').count()) && (await page.locator('.pawn--pick').count())) {
    await page.locator('.pawn--pick').first().click();
    await page.waitForTimeout(300);
  }
  await page.waitForTimeout(500);
  await shot(`${tag}-apercu`);
  await page.locator('.g-play:not([hidden])').click();
  await page.waitForTimeout(950);
  await shot(`${tag}-animation`);
};

await myTurn();
await shot('03-mon-tour');
await play('A', '04-as');
await myTurn();
await play('7', '05-sept');
await page.waitForTimeout(4000);
await shot('06-apres-robots');
console.log('Indice :', await hint());
if (errors.length) console.log('Erreurs console :\n' + errors.join('\n'));
else console.log('Aucune erreur console.');
await browser.close();

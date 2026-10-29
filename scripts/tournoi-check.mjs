// Tournoi à quatre navigateurs : création, places (duos), partie lancée avec les places fixes,
// victoire comptée une seule fois. Usage : node scripts/tournoi-check.mjs <dossier>
import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

const [out = 'captures'] = process.argv.slice(2);
const base = (process.env.TOC_URL ?? 'http://localhost:5180/toc-voisins/') + '?debug';
mkdirSync(out, { recursive: true });
const browser = await chromium.launch();
const errors = [];
async function player(name, char, color) {
  const ctx = await browser.newContext({ viewport: { width: 393, height: 852 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const page = await ctx.newPage();
  await page.addInitScript((p) => {
    localStorage.setItem('toc.install.later', String(Date.now()));
    if (!localStorage.getItem('toc.profile')) localStorage.setItem('toc.profile', JSON.stringify(p));
  }, { nick: name, char, color, level: 1, xp: 0, tokens: 0 });
  page.on('pageerror', (e) => errors.push(`[${name}] ${e.stack ?? e}`));
  page.on('console', (m) => m.type() === 'error' && errors.push(`[${name}] ${m.text()}`));
  return { name, page };
}
const step = (t) => console.log('•', t);
const a = await player('Frédo', 'tuque', 'coral');
const b = await player('Mimi', 'lunettes', 'yellow');
const c = await player('Coco', 'casquette', 'teal');
const d = await player('Boss', 'couronne', 'blue');

await a.page.goto(base + '#/tournoi/nouveau');
await a.page.getByLabel('Nom du tournoi').fill('Les voisins du 12');
await a.page.getByRole('button', { name: 'Créer le tournoi' }).click();
await a.page.waitForURL(/#\/tournoi\/\d{4}$/, { timeout: 20000 });
const code = a.page.url().match(/(\d{4})$/)[1];
step('Tournoi T-' + code + ' créé');
// Places : Mimi avec Frédo (place 2), Coco et Boss en face (places 1 et 3).
for (const [p, seat] of [[b, 2], [c, 1], [d, 3]]) {
  await p.page.goto(base.replace('?debug', `?debug&t=${code}`));
  await p.page.locator('.seat').nth([0, 2, 1, 3].indexOf(seat)).waitFor({ timeout: 20000 });
  await p.page.getByRole('button', { name: /Prendre la place/ }).nth(seat === 2 ? 0 : 0).click();
  await p.page.waitForTimeout(1200);
}
await a.page.waitForTimeout(1500);
await a.page.screenshot({ path: join(out, '01-tournoi-complet.png') });
step('Tout le monde est assis ; Frédo lance une partie');
await a.page.getByRole('button', { name: 'Jouer une partie' }).click();
await a.page.waitForURL(/#\/salle\/\d{4}$/, { timeout: 20000 });
for (const p of [b, c, d]) {
  await p.page.locator('.invite-banner').waitFor({ timeout: 20000 });
  await p.page.getByRole('button', { name: 'Rejoindre' }).click();
}
await a.page.getByRole('button', { name: 'Lancer la partie' }).waitFor({ timeout: 20000 });
await a.page.waitForTimeout(800);
await a.page.screenshot({ path: join(out, '02-salle-tournoi.png') });
const seats = await a.page.locator('.seat .seat__name').allInnerTexts();
console.log('Places dans la salle :', seats.join(', '));
step('Fin de partie simulée, envoyée par deux téléphones');
for (const p of [a, b]) await p.page.evaluate(([cd]) => window.__toc.recordLeagueGame(cd, 'test-1', 0), [code]);
await a.page.goto(base + '#/tournoi/' + code);
await a.page.waitForTimeout(2500);
await a.page.screenshot({ path: join(out, '03-score.png') });
const wins = await a.page.locator('[aria-label$="victoires"], [aria-label$="victoire"]').allInnerTexts().catch(() => []);
console.log('Victoires affichées :', wins.join(' / '));
await a.page.goto(base + '#/accueil');
await a.page.waitForTimeout(2500);
await a.page.screenshot({ path: join(out, '04-accueil.png') });
console.log(errors.length ? 'Erreurs console :\n' + errors.join('\n') : 'Aucune erreur console.');
await browser.close();

// Partie à ton rythme, à deux joueurs + robots : le choix du rythme, l'absence de minuteur (on attend
// le joueur parti même après 30 s), la liste « À ton rythme » de l'accueil, puis le retour du joueur.
// Usage : node scripts/rythme-check.mjs [dossier-captures]
import { chromium } from '@playwright/test';
import { join } from 'node:path';

const [out = 'captures'] = process.argv.slice(2);
const base = (process.env.TOC_URL ?? 'http://localhost:5180/toc-voisins/') + '?debug';
const browser = await chromium.launch();
const errors = [];
async function player(name, profile) {
  const ctx = await browser.newContext({ viewport: { width: 393, height: 852 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(`[${name}] ${e.stack ?? e}`));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(`[${name}] console: ${m.text()}`); });
  await page.addInitScript((p) => {
    localStorage.setItem('toc.install.later', String(Date.now()));
    localStorage.setItem('toc.notifs.later', String(Date.now()));
    if (!localStorage.getItem('toc.profile')) localStorage.setItem('toc.profile', JSON.stringify(p));
    // Pastille de l'icône : on note ce que l'app demande (le navigateur de test n'en affiche pas).
    window.__badges = [];
    navigator.setAppBadge = (n) => { window.__badges.push(n); return Promise.resolve(); };
    navigator.clearAppBadge = () => { window.__badges.push(0); return Promise.resolve(); };
  }, profile);
  return { name, page };
}
const shot = (p, tag) => p.page.screenshot({ path: join(out, `rythme-${p.name}-${tag}.png`) });
const hint = (p) => p.page.locator('.g-hint b').innerText().catch(() => '');
const game = (p) => p.page.evaluate(() => { const g = window.__toc.game(); return g ? { turn: g.state.turn, phase: g.state.phase, v: g.state.v, me: g.mySeat, ex: g.state.exchange } : null; });

const host = await player('hote', { nick: 'Frédo', char: 'tuque', color: 'coral', level: 1, xp: 0, tokens: 0 });
const guest = await player('invite', { nick: 'Mimi', char: 'lunettes', color: 'yellow', level: 1, xp: 0, tokens: 0 });
await host.page.goto(`${base}#/salle/nouvelle?n=4`);
await host.page.waitForURL(/#\/salle\/\d{4}$/, { timeout: 20000 });
const code = host.page.url().match(/(\d{4})$/)[1];
await host.page.getByRole('button', { name: /À ton rythme/ }).click();
await guest.page.goto(`${base}#/salle/${code}`);
await guest.page.getByText('Toi', { exact: true }).waitFor({ timeout: 20000 });
await host.page.getByText('Mimi').first().waitFor({ timeout: 20000 });
await host.page.getByRole('button', { name: 'Compléter avec des robots' }).click();
await host.page.waitForTimeout(800);
await shot(host, '01-salle');
await shot(guest, '01-salle');
console.log('Salle TOC-' + code, '| rythme vu par Mimi :', await guest.page.locator('.pace .pill').innerText());
await host.page.getByRole('button', { name: 'Lancer la partie' }).click();
await Promise.all([host, guest].map((p) => p.page.waitForSelector('.game', { timeout: 20000 })));
console.log('Minuteur affiché :', await host.page.locator('.g-timer div').evaluate((e) => getComputedStyle(e).visibility));

async function act(p) {
  const t = await hint(p);
  if (t === 'Échange') {
    await p.page.locator('.hand .pcard').first().click();
    await p.page.getByRole('button', { name: 'Donner' }).click();
    return 'donne';
  }
  if (t !== 'À ton tour !') return '';
  const cards = p.page.locator('.hand .pcard');
  for (let i = 0; i < (await cards.count()); i++) {
    await cards.nth(i).click();
    await p.page.waitForTimeout(250);
    if (!(await p.page.locator('.g-play:not([hidden])').count()) && (await p.page.locator('.pawn--pick').count())) {
      await p.page.locator('.pawn--pick').first().click();
      await p.page.waitForTimeout(200);
    }
    const btn = p.page.locator('.g-play:not([hidden])');
    if (await btn.count()) { await btn.click(); return 'joue'; }
    await cards.nth(i).click();
  }
  return '';
}
// Échange : chacun donne sa carte, puis Mimi s'en va (elle revient plus tard).
for (let k = 0; k < 40; k++) {
  await act(host); await act(guest);
  const g = await game(guest);
  if (g && g.ex[g.me]) break;
  await host.page.waitForTimeout(500);
}
const mimiSeat = (await game(guest)).me;
await guest.page.goto(`${base}#/accueil`);
console.log('Mimi (place ' + mimiSeat + ') quitte la partie.');
// Frédo joue ses tours jusqu'à ce que la partie attende Mimi : son tour de jeu, ou sa carte
// d'échange si une nouvelle donne a commencé entre-temps.
const waitsForMimi = (g) => g && ((g.phase === 'play' && g.turn === mimiSeat) || (g.phase === 'exchange' && !g.ex[mimiSeat] && g.ex.filter(Boolean).length === g.ex.length - 1));
let waitingSince = 0;
for (let k = 0; k < 120; k++) {
  const g = await game(host);
  if (waitsForMimi(g)) { waitingSince = Date.now(); break; }
  if (k % 10 === 0) console.log('  état :', JSON.stringify(g), '| indice :', await hint(host));
  await act(host);
  await host.page.waitForTimeout(700);
}
if (!waitingSince) throw new Error('Le tour de Mimi n’est pas arrivé.');
const v0 = (await game(host)).v;
await host.page.waitForTimeout(40_000);
const g1 = await game(host);
console.log(`Après 40 s d’absence (${g1.phase === 'exchange' ? 'échange' : 'tour de jeu'}) : version ${g1.v} (avant ${v0}) → ${g1.v === v0 && waitsForMimi(g1) ? 'on attend Mimi ✔' : 'joué à sa place ✘'}`);
console.log('Frédo voit :', await hint(host), '|', await host.page.locator('.g-hint span').first().innerText());
await shot(host, '02-attente');
// L'accueil de Mimi
await guest.page.waitForSelector('.slow-row', { timeout: 15000 });
console.log('Accueil de Mimi :', (await guest.page.locator('.slow-card').innerText()).replace(/\n/g, ' | '));
await shot(guest, '02-accueil');
const badge = await guest.page.evaluate(() => window.__badges.at(-1));
console.log('Pastille de Mimi :', badge, badge === 1 ? '✔' : '✘');
// Mimi revient et joue
await guest.page.locator('.slow-row').first().click();
await guest.page.waitForSelector('.game', { timeout: 20000 });
let played = '';
for (let k = 0; k < 30 && !played; k++) { played = await act(guest); if (!played) await guest.page.waitForTimeout(700); }
await host.page.waitForTimeout(2500);
const g2 = await game(host);
console.log(`Mimi revient et ${played === 'donne' ? 'donne sa carte' : 'joue'} :`, played && g2.v > v0 ? `oui (version ${g2.v}) ✔` : 'non ✘');
console.log(errors.length ? 'Erreurs : ' + errors.join('\n') : 'Aucune erreur.');
await browser.close();

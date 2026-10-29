// Partie en ligne réelle (Firebase) entre deux navigateurs + deux robots, avec captures.
// Usage : node scripts/online-check.mjs <dossier> [tours]   (serveur `npx vite --port 5180` lancé avant)
import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

const [out = 'captures', turnsArg = '2'] = process.argv.slice(2);
const base = (process.env.TOC_URL ?? 'http://localhost:5180/toc-voisins/') + '?debug';
mkdirSync(out, { recursive: true });

const browser = await chromium.launch();
const errors = [];
async function player(name, profile) {
  const ctx = await browser.newContext({ viewport: { width: 393, height: 852 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const page = await ctx.newPage();
  await page.addInitScript((p) => localStorage.setItem('toc.profile', JSON.stringify(p)), profile);
  page.on('console', (m) => m.type() === 'error' && errors.push(`[${name}] ${m.text()}`));
  page.on('pageerror', (e) => errors.push(`[${name}] ${e}`));
  return { name, page, played: 0 };
}
const shot = (p, tag) => p.page.screenshot({ path: join(out, `${p.name}-${tag}.png`) });
const hint = (p) => p.page.locator('.g-hint b').innerText().catch(() => '');

const host = await player('hote', { nick: 'Frédo', char: 'tuque', color: 'coral', level: 1, xp: 0, tokens: 0 });
const guest = await player('invite', { nick: 'Mimi', char: 'lunettes', color: 'yellow', level: 1, xp: 0, tokens: 0 });

await host.page.goto(`${base}#/salle/nouvelle?n=4`);
await host.page.waitForURL(/#\/salle\/\d{4}$/, { timeout: 20000 });
const code = host.page.url().match(/(\d{4})$/)[1];
console.log('Salle TOC-' + code);
await guest.page.goto(`${base}#/salle/${code}`);
await guest.page.getByText('Toi', { exact: true }).waitFor({ timeout: 20000 });
await host.page.getByText('Mimi').first().waitFor({ timeout: 20000 });
await host.page.getByRole('button', { name: 'Compléter avec des robots' }).click();
await host.page.waitForTimeout(800);
await shot(host, '01-salle');
await shot(guest, '01-salle');
await host.page.getByRole('button', { name: 'Lancer la partie' }).click();
await Promise.all([host, guest].map((p) => p.page.waitForSelector('.game', { timeout: 20000 })));
console.log('Les deux joueurs sont sur le plateau.');

async function act(p) {
  const t = await hint(p);
  if (t === 'Échange') {
    await p.page.locator('.hand .pcard').first().click();
    await p.page.getByRole('button', { name: 'Donner' }).click();
    console.log(`${p.name} donne une carte`);
    return;
  }
  if (t !== 'À ton tour !') return;
  const cards = p.page.locator('.hand .pcard');
  for (let i = 0; i < (await cards.count()); i++) {
    await cards.nth(i).click();
    await p.page.waitForTimeout(250);
    if (!(await p.page.locator('.g-play:not([hidden])').count()) && (await p.page.locator('.pawn--pick').count())) {
      await p.page.locator('.pawn--pick').first().click();
      await p.page.waitForTimeout(200);
    }
    const btn = p.page.locator('.g-play:not([hidden])');
    if (await btn.count()) {
      const label = await btn.innerText();
      await shot(p, `tour-${p.played + 1}-apercu`);
      await btn.click();
      p.played++;
      console.log(`${p.name} : ${label} (${await cards.nth(0).count() ? 'ok' : ''})`);
      return;
    }
    await cards.nth(i).click();
  }
}

const absent = process.env.TOC_ABSENT === '1';
const turns = absent ? 0 : Number(turnsArg);
// En mode absent, on fait juste l'échange de cartes avant que l'invité parte, main pleine.
const guestGave = () => guest.page.evaluate(() => {
  const g = window.__toc.game();
  return !!g && (g.state.phase === 'play' || !!g.state.exchange[g.mySeat]);
});
for (let k = 0; absent && k < 40 && !(await guestGave()); k++) {
  await act(host);
  await act(guest);
  await host.page.waitForTimeout(500);
}
const deadline = Date.now() + 150_000;
while (Date.now() < deadline && (host.played < turns || guest.played < turns)) {
  await act(host);
  await act(guest);
  await host.page.waitForTimeout(700);
}
// TOC_ABSENT=1 : l'invité ferme l'app ; son tour doit être joué à sa place après 30 s.
if (absent) {
  const guestMoves = () => host.page.evaluate(() => window.__toc.game().state.log.filter((e) => e.seat === 2 && e.card !== '' || /@2 ne peut/.test(e.text)).length);
  const before = await guestMoves();
  await guest.page.context().close();
  console.log('L’invité ferme l’app.');
  const target = host.played + 2;
  const until = Date.now() + 120_000;
  while (Date.now() < until && host.played < target) {
    await act(host);
    await host.page.waitForTimeout(700);
  }
  const after = await guestMoves();
  console.log(host.played >= target ? 'La partie a continué sans l’invité.' : 'BLOQUÉ : la partie n’a pas continué sans l’invité.');
  console.log(`Coups joués à la place de l’invité absent : ${after - before}`);
  await shot(host, '10-sans-invite');
  const v = await host.page.evaluate(() => window.__toc.game()?.state.v);
  console.log('Version de l’état chez l’hôte : ' + v);
  if (errors.length) console.log('Erreurs console :\n' + errors.join('\n'));
  await browser.close();
  process.exit(0);
}
await host.page.waitForTimeout(2500);
await shot(host, '09-fin');
await shot(guest, '09-fin');
const v = await Promise.all([host, guest].map((p) => p.page.evaluate(() => window.__toc.game()?.state.v)));
console.log(`Coups joués : hôte ${host.played}, invité ${guest.played} ; version de l'état : ${v.join(' / ')}`);
if (errors.length) console.log('Erreurs console :\n' + errors.join('\n'));
else console.log('Aucune erreur console.');
await browser.close();

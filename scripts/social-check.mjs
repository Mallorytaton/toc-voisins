// Social en ligne entre deux navigateurs : code ami, présence, invitation, partie, chat d'équipe.
// Usage : node scripts/social-check.mjs <dossier>   (serveur `npx vite --port 5180` lancé avant)
import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

const [out = 'captures'] = process.argv.slice(2);
const base = process.env.TOC_URL ?? 'http://localhost:5180/toc-voisins/';
mkdirSync(out, { recursive: true });
const browser = await chromium.launch();
const errors = [];
const rnd = () => 1000 + Math.floor(Math.random() * 9000);

async function player(name, profile) {
  const ctx = await browser.newContext({ viewport: { width: 393, height: 852 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const page = await ctx.newPage();
  await page.addInitScript((p) => { if (!localStorage.getItem('toc.profile')) localStorage.setItem('toc.profile', JSON.stringify(p)); }, profile);
  page.on('console', (m) => m.type() === 'error' && errors.push(`[${name}] ${m.text()}`));
  page.on('pageerror', (e) => errors.push(`[${name}] ${e}`));
  return { name, page };
}
const shot = (p, tag) => p.page.screenshot({ path: join(out, `${p.name}-${tag}.png`) });
const step = (t) => console.log('•', t);

const codeA = `FREDO#${rnd()}`;
const a = await player('frédo', { nick: 'Frédo', char: 'tuque', color: 'coral', level: 1, xp: 0, tokens: 0, friendCode: codeA });
const b = await player('mimi', { nick: 'Mimi', char: 'lunettes', color: 'yellow', level: 1, xp: 0, tokens: 0, friendCode: `MIMI#${rnd()}` });

await a.page.goto(base + '#/amis');
await b.page.goto(base + '#/amis');
await a.page.waitForTimeout(2500);
step('Mimi ajoute Frédo avec son code ' + codeA);
await b.page.getByLabel('Code ami à ajouter').fill(codeA);
await b.page.getByRole('button', { name: 'Ajouter' }).click();
await b.page.getByText('Frédo fait partie de tes amis !').waitFor({ timeout: 15000 });
await a.page.getByText('Mimi').waitFor({ timeout: 15000 });
await a.page.waitForTimeout(800);
await shot(a, '01-gang');
step('Frédo voit Mimi en ligne et l’invite');
await a.page.getByRole('button', { name: 'Inviter' }).first().click();
await a.page.waitForURL(/#\/salle\/\d{4}$/, { timeout: 20000 });
await b.page.locator('.invite-banner').waitFor({ timeout: 20000 });
await shot(b, '02-invitation');
await b.page.getByRole('button', { name: 'Rejoindre' }).click();
await a.page.getByText('Mimi').first().waitFor({ timeout: 20000 });
step('Mimi a rejoint la salle ; robots, lancement');
await a.page.getByRole('button', { name: 'Compléter avec des robots' }).click();
await a.page.getByRole('button', { name: 'Lancer la partie' }).click();
await Promise.all([a, b].map((p) => p.page.waitForSelector('.game', { timeout: 20000 })));
await a.page.waitForTimeout(2500);
step('Les deux quittent la partie et ouvrent le chat d’équipe');
for (const p of [a, b]) {
  await p.page.getByRole('button', { name: 'Pause' }).click();
  await p.page.getByRole('button', { name: 'Quitter la partie' }).click();
  await p.page.goto(base + '#/amis');
  await p.page.getByRole('button', { name: 'Chat d’équipe' }).click();
}
await a.page.getByLabel('Message').fill('Salut partner, bien joué !');
await a.page.getByRole('button', { name: 'Envoyer' }).click();
await b.page.getByText('Salut partner, bien joué !').waitFor({ timeout: 15000 });
await b.page.getByLabel('Message').fill('Revanche à soir ?');
await b.page.getByRole('button', { name: 'Envoyer' }).click();
await a.page.getByText('Revanche à soir ?').waitFor({ timeout: 15000 });
await shot(a, '03-chat');
await shot(b, '03-chat');
await a.page.goto(base + '#/classement');
await a.page.waitForTimeout(2500);
await shot(a, '04-classement');
await a.page.goto(base + '#/accueil');
await a.page.waitForTimeout(2500);
await shot(a, '05-accueil');
console.log(errors.length ? 'Erreurs console :\n' + errors.join('\n') : 'Aucune erreur console.');
await browser.close();

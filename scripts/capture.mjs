// Captures d'écran au format téléphone (393 × 852, comme la maquette).
// Usage : node scripts/capture.mjs <dossier> <route>[=nom][@attente-ms] ...  (serveur `npx vite --port 5180` lancé avant)
// Exemple : node scripts/capture.mjs captures/etape-3 /accueil=accueil /salle/nouvelle=salle@3500
// TOC_DEMO=1 : données de démonstration de la maquette (profil Frédo, amis, classement).
import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

const [out = 'captures', ...routes] = process.argv.slice(2);
const demo = process.env.TOC_DEMO === '1';
const base = (process.env.TOC_URL ?? 'http://localhost:5180/toc-voisins/') + (demo ? '?demo' : '');
mkdirSync(out, { recursive: true });

const browser = await chromium.launch();
// TOC_VW / TOC_VH : taille d'écran (par défaut celle de la maquette).
const vw = Number(process.env.TOC_VW ?? 393), vh = Number(process.env.TOC_VH ?? 852);
const page = await browser.newPage({ viewport: { width: vw, height: vh }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
if (demo)
  await page.addInitScript(() => localStorage.setItem('toc.profile', JSON.stringify(
    { nick: 'Frédo', char: 'tuque', color: 'coral', level: 14, xp: 13680, tokens: 2450, friendCode: 'FREDO#2741' })));
const errors = [];
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
page.on('pageerror', (e) => errors.push(String(e)));

for (const r of routes.length ? routes : ['/']) {
  const [spec, wait = '900'] = r.split('@');
  const [route, name = route.replace(/\W+/g, '-').replace(/^-|-$/g, '') || 'accueil'] = spec.split('=');
  await page.goto(base + '#' + route);
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(Number(wait));
  await page.screenshot({ path: join(out, name + '.png') });
  await page.screenshot({ path: join(out, name + '-complet.png'), fullPage: true });
  console.log('capturé', route, '->', name);
}
if (errors.length) console.log('Erreurs console :\n' + errors.join('\n'));
await browser.close();

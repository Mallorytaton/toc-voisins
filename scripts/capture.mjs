// Captures d'écran au format téléphone (393 × 852, comme la maquette).
// Usage : node scripts/capture.mjs <dossier> <route>[=nom] ...  (serveur `npx vite --port 5180` lancé avant)
// Exemple : node scripts/capture.mjs captures/etape-1 /vitrine=vitrine
import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

const [out = 'captures', ...routes] = process.argv.slice(2);
const base = process.env.TOC_URL ?? 'http://localhost:5180/toc-voisins/';
mkdirSync(out, { recursive: true });

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 393, height: 852 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
const errors = [];
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
page.on('pageerror', (e) => errors.push(String(e)));

for (const r of routes.length ? routes : ['/']) {
  const [route, name = route.replace(/\W+/g, '-').replace(/^-|-$/g, '') || 'accueil'] = r.split('=');
  await page.goto(base + '#' + route);
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(900);
  await page.screenshot({ path: join(out, name + '.png') });
  await page.screenshot({ path: join(out, name + '-complet.png'), fullPage: true });
  console.log('capturé', route, '->', name);
}
if (errors.length) console.log('Erreurs console :\n' + errors.join('\n'));
await browser.close();

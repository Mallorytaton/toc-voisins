// Mesure la hauteur naturelle de chaque écran (393 de large), en mode démo.
import { chromium } from '@playwright/test';
const base = (process.env.TOC_URL ?? 'http://localhost:5180/toc-voisins/') + '?demo';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 393, height: 700 } });
await page.addInitScript(() => localStorage.setItem('toc.profile', JSON.stringify(
  { nick: 'Frédo', char: 'tuque', color: 'coral', level: 14, xp: 13680, tokens: 2450, friendCode: 'FREDO#2741', qc: true })));
for (const r of ['/splash', '/bienvenue', '/perso', '/accueil', '/salle/nouvelle', '/amis', '/classement']) {
  await page.goto(base + '#' + r);
  await page.waitForTimeout(r.startsWith('/salle') ? 3500 : 700);
  // Hauteur naturelle à 393 de large (scène sans mise à l'échelle).
  const h = await page.evaluate(() => {
    const sc = document.querySelector('.screen'), st = sc.parentElement;
    st.style.transform = 'none'; st.style.width = '393px'; st.style.height = 'auto'; sc.style.height = 'auto';
    return sc.offsetHeight;
  });
  console.log(r.padEnd(16), h);
}
await browser.close();

import { Browser, Page, expect, test } from '@playwright/test';

// Partie réelle à 4 onglets sur Firebase. Lancer avec : TOC_URL=https://.../toc-voisins/ npx playwright test online --project android
const URL = process.env.TOC_URL;

test.skip(!URL, 'TOC_URL non défini');
test.setTimeout(30 * 60_000);

async function joinLobby(page: Page, name: string, color: number, seat: number) {
  await page.getByLabel('Ton prénom').fill(name);
  await page.locator('.color-btn').nth(color).click();
  await page.waitForTimeout(600);
  await page.locator('.seat').nth(seat).click();
  await expect(page.locator('.seat.mine')).toBeVisible();
}

/** Boucle d'un joueur : échange et coups via le vrai contrôleur en ligne (mêmes écritures que l'UI). */
async function autoplay(page: Page) {
  return page.evaluate(async () => {
    const w = window as any;
    let moves = 0;
    const start = Date.now();
    while (Date.now() - start < 25 * 60_000) {
      const t = w.__toc;
      if (!t) { await new Promise((r) => setTimeout(r, 300)); continue; }
      const st = t.ctl.state;
      const me = t.ctl.viewer;
      if (st.phase === 'over') return { moves, winner: st.winner };
      try {
        if (st.phase === 'exchange' && !st.exchange[me] && st.hands[me].length) {
          await t.ctl.give(st.hands[me][0]);
        } else if (st.phase === 'play' && st.turn === me && st.hands[me].filter((c: string) => c !== '?').length) {
          await t.ctl.play(t.botMove(st, t.cryptoRng, 30));
          moves++;
        }
      } catch (e) {
        /* conflit de version : on réessaie au prochain état */
      }
      await new Promise((r) => setTimeout(r, 150));
    }
    return { moves, winner: -1 };
  });
}

async function newPlayer(browser: Browser) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => console.log('pageerror', e.message));
  return page;
}

test('partie complète à 4 onglets sur Firebase', async ({ browser }) => {
  const host = await newPlayer(browser);
  await host.goto(URL! + '?debug');
  await host.getByRole('button', { name: 'Créer une partie' }).click();
  await host.getByRole('button', { name: 'Créer la partie' }).click();
  const code = ((await host.locator('.big-code').textContent()) ?? '').replace(/\D/g, '');
  expect(code).toHaveLength(4);
  console.log('Partie TOC-' + code);
  await joinLobby(host, 'Mallory', 0, 0);
  const others: Page[] = [];
  const names = ['Bea', 'Chris', 'Dom'];
  for (let i = 1; i < 4; i++) {
    const p = await newPlayer(browser);
    await p.goto(`${URL}?debug#/g/${code}`);
    await joinLobby(p, names[i - 1], i, i);
    others.push(p);
  }
  await host.getByRole('button', { name: 'Lancer la partie' }).click();
  const all = [host, ...others];
  for (const p of all) await expect(p.locator('svg.board')).toBeVisible({ timeout: 20_000 });
  // Aucune carte adverse n'est visible : seule ma main est affichée.
  await expect(host.locator('.hand .card').first()).toBeVisible({ timeout: 20_000 });
  await host.screenshot({ path: 'test-results/online-debut.png' });
  const results = await Promise.all(all.map(autoplay));
  console.log(results);
  expect(results.every((r) => r.winner >= 0)).toBe(true);
  await host.screenshot({ path: 'test-results/online-fin.png' });
  for (const p of all) await expect(p.getByText(/Victoire|Partie terminée/)).toBeVisible();
});

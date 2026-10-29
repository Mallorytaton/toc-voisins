// Partie en ligne réelle sur Firebase : ne tourne qu'avec TOC_ONLINE=1 (écrit dans la vraie base).
// TOC_ONLINE=1 npx playwright test online --project android
import { type Browser, expect, test } from '@playwright/test';

test.skip(process.env.TOC_ONLINE !== '1', 'Test en ligne : lancer avec TOC_ONLINE=1');
test.setTimeout(120_000);

async function player(browser: Browser, baseURL: string, nick: string, char: string, color: string) {
  const ctx = await browser.newContext({ baseURL, viewport: { width: 393, height: 852 }, isMobile: true, hasTouch: true });
  const page = await ctx.newPage();
  await page.addInitScript((p) => localStorage.setItem('toc.profile', JSON.stringify(p)),
    { nick, char, color, level: 1, xp: 0, tokens: 0 });
  return page;
}

test('deux joueurs et deux robots jouent la même partie', async ({ browser, baseURL }) => {
  const host = await player(browser, baseURL!, 'Frédo', 'tuque', 'coral');
  const guest = await player(browser, baseURL!, 'Mimi', 'lunettes', 'yellow');
  await host.goto('./?debug#/salle/nouvelle?n=4');
  await host.waitForURL(/#\/salle\/\d{4}$/, { timeout: 20_000 });
  const code = host.url().match(/(\d{4})$/)![1];

  await guest.goto(`./?debug#/salle/${code}`);
  await expect(host.getByText('Mimi')).toBeVisible({ timeout: 20_000 });
  await host.getByRole('button', { name: 'Compléter avec des robots' }).click();
  await host.getByRole('button', { name: 'Lancer la partie' }).click();
  for (const p of [host, guest]) await expect(p.locator('.game')).toBeVisible({ timeout: 20_000 });

  // Chacun donne une carte à son partenaire (Frédo et Mimi sont partenaires).
  for (const p of [host, guest]) {
    await expect(p.locator('.g-hint b')).toHaveText('Échange', { timeout: 20_000 });
    await p.locator('.hand .pcard').first().click();
    await p.getByRole('button', { name: 'Donner' }).click();
  }
  // L'hôte commence : quand c'est son tour, les deux écrans voient la même version de l'état.
  await expect(host.locator('.g-hint b')).toHaveText('À ton tour !', { timeout: 30_000 });
  const v = () => Promise.all([host, guest].map((p) => p.evaluate(() => (window as never as { __toc: { game(): { state: { v: number } } } }).__toc.game().state.v)));
  await expect.poll(async () => { const [a, b] = await v(); return a === b; }, { timeout: 10_000 }).toBe(true);
  await expect(guest.locator('.g-top__turn')).toHaveText('Tour de Frédo');
});

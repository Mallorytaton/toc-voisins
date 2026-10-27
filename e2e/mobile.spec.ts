import { Page, expect, test } from '@playwright/test';

async function noHorizontalScroll(page: Page) {
  const over = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(over).toBeLessThanOrEqual(1);
}

/** Joue un tour humain via l'interface (carte, éventuel joker/7, pion, confirmation). */
async function playMyTurn(page: Page) {
  const discard = page.getByRole('button', { name: 'Défausser ma main' });
  if (await discard.isVisible()) return discard.click();
  await page.locator('.hand .card:not(.dim)').first().click();
  for (let k = 0; k < 10; k++) {
    const play = page.getByRole('button', { name: 'Jouer', exact: true });
    if (await play.isVisible()) return play.click();
    const chip = page.locator('.chip-btn').first();
    if (await chip.isVisible()) {
      await chip.click();
      continue;
    }
    const pawn = page.locator('.pawn.playable:not(.selected)').first();
    if (await pawn.count()) {
      const box = (await pawn.boundingBox())!;
      await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
      continue;
    }
    await page.waitForTimeout(100);
  }
}

test('accueil, table locale et quelques tours de jeu', async ({ page }, info) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('./');
  await expect(page.getByRole('heading', { name: /Toc/ })).toBeVisible();
  await noHorizontalScroll(page);
  await page.screenshot({ path: `test-results/${info.project.name}-accueil.png` });
  // Les boutons secondaires de l'accueil doivent être immobiles et cliquables.
  await page.getByRole('button', { name: 'Règles du jeu' }).click();
  await expect(page.getByRole('heading', { name: 'Règles du Toc' })).toBeVisible();
  await page.goBack();

  await page.getByRole('button', { name: 'Table locale' }).click();
  await page.getByRole('button', { name: 'Commencer' }).click();
  await expect(page.locator('svg.board')).toBeVisible();

  let turns = 0;
  for (let i = 0; i < 120 && turns < 4; i++) {
    const status = (await page.locator('.status-main').textContent()) ?? '';
    if (status.startsWith('Choisis une carte')) {
      await page.locator('.hand .card').first().click();
      await page.getByRole('button', { name: 'Donner' }).click();
    } else if (status.includes('À toi de jouer')) {
      await playMyTurn(page);
      turns++;
      await page.waitForTimeout(300);
    } else await page.waitForTimeout(300);
  }
  expect(turns).toBeGreaterThanOrEqual(3);
  await noHorizontalScroll(page);
  // Zones tactiles : cartes et boutons d'au moins 44 px de haut.
  for (const el of await page.locator('.hand .card, .panel-col .btn, .topbar .icon-btn').all()) {
    const b = await el.boundingBox();
    if (b) expect(b.height).toBeGreaterThanOrEqual(44);
  }
  await page.screenshot({ path: `test-results/${info.project.name}-partie.png` });
  await page.getByRole('button', { name: 'Règles' }).click();
  await expect(page.getByRole('heading', { name: 'Règles du Toc' })).toBeVisible();
  expect(errors).toEqual([]);
});

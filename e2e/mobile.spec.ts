import { type Page, expect, test } from '@playwright/test';

const PROFILE = { nick: 'Frédo', char: 'tuque', color: 'coral', level: 1, xp: 0, tokens: 0, friendCode: 'FREDO#2741' };

/** Ces tests n'écrivent rien dans la vraie base : Firebase est bloqué (le jeu reste jouable sans réseau). */
test.beforeEach(async ({ page }) => {
  // La proposition d'installation ne doit pas couvrir l'écran pendant les tests.
  await page.addInitScript(() => localStorage.setItem('toc.install.later', String(Date.now())));
  await page.route(/(googleapis\.com|firebasedatabase\.app|firebaseio\.com)/, (r) => r.abort());
});

function watchErrors(page: Page) {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  // Les requêtes Firebase bloquées exprès par le test ne comptent pas.
  page.on('console', (m) => m.type() === 'error' && !m.text().startsWith('Failed to load resource') && errors.push(m.text()));
  return errors;
}

/** Aucun défilement horizontal : tout tient dans la largeur du téléphone. */
async function expectNoSideScroll(page: Page) {
  const over = await page.evaluate(() => document.scrollingElement!.scrollWidth - window.innerWidth);
  expect(over).toBeLessThanOrEqual(1);
}

test('premier lancement : splash, présentation, perso, accueil', async ({ page }) => {
  const errors = watchErrors(page);
  await page.goto('./');
  await expect(page.getByText('Le jeu qui brise des amitiés… et qui en crée.')).toBeVisible();
  await page.getByRole('button', { name: 'C’est parti !' }).click();
  await expect(page.getByText('Tu ne joues jamais seul')).toBeVisible();
  await page.getByRole('button', { name: 'Suivant' }).click();
  await page.getByRole('button', { name: 'Suivant' }).click();
  await page.getByRole('button', { name: 'Choisir mon perso' }).click();
  await page.getByRole('button', { name: /Mimi/ }).click();
  await page.getByLabel('Ton surnom').fill('Ginette');
  await page.getByRole('button', { name: 'C’est moi, ça !' }).click();
  await expect(page.getByText('Salut Ginette !')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Créer une salle · 4 joueurs' })).toBeVisible();
  await expectNoSideScroll(page);
  // Les onglets mènent aux amis et au classement.
  await page.getByRole('button', { name: 'Amis', exact: true }).click();
  await expect(page.getByText('Ton code ami', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Classement' }).click();
  await expect(page.locator('.t-screen')).toHaveText('Classement');
  expect(errors).toEqual([]);
});

test('partie hors ligne contre les robots', async ({ page, context }) => {
  const errors = watchErrors(page);
  await page.addInitScript((p) => localStorage.setItem('toc.profile', JSON.stringify(p)), PROFILE);
  await page.goto('./#/accueil');
  await expect(page.getByText('Salut Frédo !')).toBeVisible();
  await context.setOffline(true);
  await page.getByRole('button', { name: 'Créer une salle · 4 joueurs' }).click();
  await page.getByRole('button', { name: 'Compléter avec des robots' }).click();
  await page.getByRole('button', { name: 'Lancer la partie' }).click();
  await expect(page.locator('.game')).toBeVisible({ timeout: 10_000 });
  const hint = page.locator('.g-hint b');

  // Échange : une carte pour le partenaire.
  await expect(hint).toHaveText('Échange', { timeout: 10_000 });
  await expect(page.locator('.hand .pcard')).toHaveCount(5);
  await page.locator('.hand .pcard').first().click();
  await page.getByRole('button', { name: 'Donner' }).click();

  // Notre tour : on joue la première carte qui a un coup (ou on défausse).
  await expect(hint).toHaveText('À ton tour !', { timeout: 20_000 });
  const cards = page.locator('.hand .pcard');
  const play = page.locator('.g-play:not([hidden])');
  // force : dans l'éventail, une carte voisine peut chevaucher un instant celle qu'on touche.
  for (let i = 0; i < (await cards.count()) && !(await play.count()); i++) {
    await cards.nth(i).click({ force: true });
    if (!(await play.count()) && (await page.locator('.pawn--pick').count())) await page.locator('.pawn--pick').first().click({ force: true });
    if (!(await play.count())) await cards.nth(i).click({ force: true });
  }
  await play.click({ timeout: 10_000 });
  // Les robots enchaînent, puis la partie continue.
  await expect(page.locator('.g-top__turn')).not.toHaveText('À toi de jouer, Frédo', { timeout: 10_000 });
  await expectNoSideScroll(page);
  expect(errors).toEqual([]);
});

test('écran de jeu à 6 joueurs : 96 trous et 24 billes', async ({ page, context }) => {
  await page.addInitScript((p) => localStorage.setItem('toc.profile', JSON.stringify(p)), PROFILE);
  await page.goto('./#/accueil');
  await context.setOffline(true);
  await page.getByRole('button', { name: /6 joueurs/ }).click();
  await page.getByRole('button', { name: 'Créer une salle · 6 joueurs' }).click();
  await page.getByRole('button', { name: 'Compléter avec des robots' }).click();
  await page.getByRole('button', { name: 'Lancer la partie' }).click();
  await expect(page.locator('.game')).toBeVisible({ timeout: 10_000 });
  // 96 trous de circuit + 6 × (4 maison + 4 réserve)
  await expect(page.locator('.board .hole')).toHaveCount(96 + 6 * 8);
  await expect(page.locator('.board .pawn')).toHaveCount(24);
  await expect(page.locator('.seat-av')).toHaveCount(6);
});

import { type Page, expect, test } from '@playwright/test';
import { HAPTICS } from '../src/ui/haptics';

const PROFILE = { nick: 'Frédo', char: 'tuque', color: 'coral', level: 1, xp: 0, tokens: 0, friendCode: 'FREDO#2741' };

/** Ces tests n'écrivent rien dans la vraie base : Firebase est bloqué (le jeu reste jouable sans réseau). */
test.beforeEach(async ({ page }) => {
  // La proposition d'installation ne doit pas couvrir l'écran pendant les tests.
  await page.addInitScript(() => localStorage.setItem('toc.install.later', String(Date.now())));
  await page.route(/(googleapis\.com|firebasedatabase\.app|firebaseio\.com)/, (r) => r.abort());
  // La base parle aussi par une connexion directe (WebSocket), que la règle ci-dessus ne voit pas : on la ferme aussitôt.
  // Sans cela, elle pouvait s'ouvrir vers la vraie base avant la coupure du réseau, ou échouer bruyamment juste après.
  await page.routeWebSocket(/(firebasedatabase\.app|firebaseio\.com)/, (ws) => ws.close());
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
  // « Nouvelle partie » propose 4 ou 6 joueurs.
  await page.getByRole('button', { name: /Nouvelle partie/ }).click();
  await expect(page.getByRole('button', { name: 'Créer une salle · 4 joueurs' })).toBeVisible();
  await page.getByRole('button', { name: 'Annuler' }).click();
  await expectNoSideScroll(page);
  // Les quatre onglets : la une, ta bande (amis, classement, chat), les albums et le kiosque.
  await page.getByRole('button', { name: 'Ta bande', exact: true }).click();
  await expect(page.getByText('Ton code ami', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Classement', exact: true }).click();
  await expect(page.locator('.rank-scope')).toBeVisible();
  await page.getByRole('button', { name: 'Albums', exact: true }).click();
  await expect(page.locator('.t-screen')).toHaveText('Tes albums');
  await page.getByRole('button', { name: 'Kiosque', exact: true }).click();
  await expect(page.locator('.t-screen')).toHaveText('Le kiosque');
  await expectNoSideScroll(page);
  expect(errors).toEqual([]);
});

test('partie hors ligne contre les robots', async ({ page, context }) => {
  const errors = watchErrors(page);
  await page.addInitScript((p) => localStorage.setItem('toc.profile', JSON.stringify(p)), PROFILE);
  await page.goto('./#/accueil');
  await expect(page.getByText('Salut Frédo !')).toBeVisible();
  await context.setOffline(true);
  await page.getByRole('button', { name: /Nouvelle partie/ }).click();
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
  await expect(hint).toHaveText('À toi, Frédo !', { timeout: 20_000 });
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

test('retour haptique : la donne, une carte, « Donner » et « à toi » font vibrer le téléphone', async ({ page, context }) => {
  const errors = watchErrors(page);
  await page.addInitScript((p) => {
    localStorage.setItem('toc.profile', JSON.stringify(p));
    // La vibration du téléphone est remplacée par un carnet : chaque motif demandé y est noté.
    const log: unknown[] = [];
    Object.assign(window, { __vib: log });
    Object.defineProperty(navigator, 'vibrate', { configurable: true, value: (v: unknown) => { log.push(v); return true; } });
  }, PROFILE);
  const vibrations = () => page.evaluate(() => (window as unknown as { __vib: unknown[] }).__vib);
  await page.goto('./#/accueil');
  await context.setOffline(true);
  await page.getByRole('button', { name: /Nouvelle partie/ }).click();
  await page.getByRole('button', { name: 'Créer une salle · 4 joueurs' }).click();
  await page.getByRole('button', { name: 'Compléter avec des robots' }).click();
  await page.getByRole('button', { name: 'Lancer la partie' }).click();
  await expect(page.locator('.game')).toBeVisible({ timeout: 10_000 });
  await expect(page.locator('.g-hint b')).toHaveText('Échange', { timeout: 10_000 });
  await page.locator('.hand .pcard').first().click();
  await page.getByRole('button', { name: 'Donner' }).click();
  // Dans l'ordre : la donne claque, ma carte, « Donner », la carte du partenaire, puis « à toi ».
  await expect.poll(vibrations, { timeout: 20_000 }).toEqual([HAPTICS.donne, HAPTICS.carte, HAPTICS.jouer, HAPTICS.carte, HAPTICS.tour]);

  // Vibrations coupées dans la pause : choisir une carte ne fait plus rien vibrer.
  await page.getByRole('button', { name: 'Pause' }).click();
  await page.getByRole('switch', { name: 'Vibrations' }).click();
  await page.getByRole('button', { name: 'Reprendre' }).click();
  await page.locator('.hand .pcard').first().click({ force: true });
  await expect(page.locator('.hand .pcard[aria-pressed="true"]')).toHaveCount(1);
  expect(await vibrations()).toHaveLength(5);
  expect(errors).toEqual([]);
});

test('retour haptique sur iPhone : chaque geste bascule un vrai interrupteur, et la partie se joue', async ({ page, context }) => {
  const errors = watchErrors(page);
  await page.addInitScript((p) => {
    localStorage.setItem('toc.profile', JSON.stringify(p));
    // Le réglage « Vibrations » allumé (sur iPhone, il est coupé d'office).
    localStorage.setItem('toc.vibrations', '1');
    // Comme sur iPhone : pas de vibration pour les pages web, mais l'interrupteur natif existe.
    Object.defineProperty(Navigator.prototype, 'vibrate', { configurable: true, value: undefined });
    Object.defineProperty(Navigator.prototype, 'userAgent', { configurable: true, get: () => 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.5 Mobile/15E148 Safari/604.1' });
    if (!('switch' in HTMLInputElement.prototype)) Object.defineProperty(HTMLInputElement.prototype, 'switch', { configurable: true, get() { return (this as HTMLInputElement).hasAttribute('switch'); } });
    // Le carnet : chaque bascule d'un interrupteur caché, et si elle vient d'un vrai toucher.
    const log: boolean[] = [];
    Object.assign(window, { __tics: log });
    document.addEventListener('click', (e) => { if (e.target instanceof HTMLInputElement && e.target.hasAttribute('switch')) log.push(e.isTrusted); }, true);
  }, PROFILE);
  const tics = () => page.evaluate(() => (window as unknown as { __tics: boolean[] }).__tics);
  await page.goto('./#/accueil');
  await context.setOffline(true);
  await page.getByRole('button', { name: /Nouvelle partie/ }).click();
  await page.getByRole('button', { name: 'Créer une salle · 4 joueurs' }).click();
  await page.getByRole('button', { name: 'Compléter avec des robots' }).click();
  await page.getByRole('button', { name: 'Lancer la partie' }).click();
  await expect(page.locator('.game')).toBeVisible({ timeout: 10_000 });
  const hint = page.locator('.g-hint b');
  await expect(hint).toHaveText('Échange', { timeout: 10_000 });

  // Une carte : un seul vrai toucher sur son interrupteur, et elle est choisie (pas choisie puis reposée).
  await page.locator('.hand .pcard').first().click();
  await expect(page.locator('.hand .pcard[aria-pressed="true"]')).toHaveCount(1);
  expect(await tics()).toEqual([true]);
  await page.getByRole('button', { name: 'Donner' }).click();
  await expect(hint).toHaveText('À toi, Frédo !', { timeout: 20_000 });
  expect(await tics()).toEqual([true, true]);

  // Un coup complet du bout du doigt : carte, bille s'il faut, « Jouer ! ». Le toucher passe d'abord par l'interrupteur
  // et n'arrive au bouton qu'un instant après : on attend son effet avant le geste suivant, comme le ferait un doigt.
  const cards = page.locator('.hand .pcard');
  const chosen = page.locator('.hand .pcard[aria-pressed="true"]');
  const play = page.locator('.g-play:not([hidden])');
  for (let i = 0; i < (await cards.count()) && !(await play.count()); i++) {
    await cards.nth(i).click({ force: true });
    await expect(chosen).toHaveCount(1);
    if (!(await play.count()) && (await page.locator('.pawn--pick').count())) {
      await page.locator('.pawn--pick').first().click({ force: true });
      await page.waitForTimeout(150);
    }
    if (!(await play.count())) {
      await cards.nth(i).click({ force: true });
      await expect(chosen).toHaveCount(0);
    }
  }
  await play.click({ timeout: 10_000 });
  await expect(page.locator('.g-top__turn')).not.toHaveText('À toi de jouer, Frédo', { timeout: 10_000 });
  const all = await tics();
  expect(all.length).toBeGreaterThanOrEqual(4);
  expect(all.every(Boolean)).toBe(true);
  expect(errors).toEqual([]);
});

test('écran de jeu à 6 joueurs : 96 trous et 24 billes', async ({ page, context }) => {
  await page.addInitScript((p) => localStorage.setItem('toc.profile', JSON.stringify(p)), PROFILE);
  await page.goto('./#/accueil');
  await context.setOffline(true);
  // « Nouvelle partie », puis un toucher sur « 6 joueurs » crée la salle.
  await page.getByRole('button', { name: /Nouvelle partie/ }).click();
  await page.getByRole('button', { name: 'Créer une salle · 6 joueurs' }).click();
  // L'affiche : trois équipes de deux places.
  await expect(page.locator('.aff-team')).toHaveCount(3);
  await expect(page.locator('.aff-slot')).toHaveCount(6);
  await page.getByRole('button', { name: 'Compléter avec des robots' }).click();
  await page.getByRole('button', { name: 'Lancer la partie' }).click();
  await expect(page.locator('.game')).toBeVisible({ timeout: 10_000 });
  // 96 trous de circuit + 6 × (4 maison + 4 réserve)
  await expect(page.locator('.board .hole')).toHaveCount(96 + 6 * 8);
  await expect(page.locator('.board .pawn')).toHaveCount(24);
  await expect(page.locator('.seat-av')).toHaveCount(6);
});

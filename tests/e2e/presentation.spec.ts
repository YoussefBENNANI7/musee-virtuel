import { expect, test } from '@playwright/test';
import { openMuseum, panel, position } from './helpers';

const yaw = (page: import('@playwright/test').Page) => page.evaluate(() => (window as any).__museum.controls.yaw as number);
const presenting = (page: import('@playwright/test').Page) => page.evaluate(() => (window as any).__museum.presenting() as boolean);
/** Termine le commentaire en cours, comme si la voix était arrivée au bout du texte. */
const endSpeech = (page: import('@playwright/test').Page) => page.evaluate(() => (window as any).__lastSpeech.onend());

test('à l’ouverture : écran de chargement, puis le regard parcourt la salle derrière l’accueil', async ({ page }) => {
  const errors = await openMuseum(page, { welcome: true });
  // L'écran de chargement s'efface une fois le musée prêt.
  await expect(page.locator('.splash')).toHaveCSS('opacity', '0');
  // L'avancée du chargement des œuvres s'efface quand tout est arrivé.
  await expect(page.locator('#welcome-loading')).toHaveClass(/done/);

  const start = await position(page);
  const first = await yaw(page);
  await expect.poll(async () => (await yaw(page)) - first, { timeout: 15_000 }).toBeGreaterThan(0.1);
  // Le regard tourne, le visiteur ne se déplace pas.
  expect(await position(page)).toEqual(start);

  // En entrant, le regard revient vers la direction de départ.
  await page.locator('.welcome-enter').click();
  await expect.poll(async () => Math.abs(await yaw(page)), { timeout: 15_000 }).toBeLessThan(0.02);
  expect(errors).toEqual([]);
});

test('qui a demandé moins d’animations garde une ouverture immobile', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await openMuseum(page, { welcome: true });
  const first = await yaw(page);
  await page.waitForTimeout(1500);
  expect(await yaw(page)).toBe(first);
});

test('le mode présentation déroule un parcours tout seul, avec la voix, et rend la main au premier geste', async ({ page }) => {
  const errors = await openMuseum(page, { spySpeech: true });
  await page.locator('#tours-open').click();
  await page.getByRole('button', { name: 'Présentation : La couleur avant tout' }).click();
  await expect(page.locator('#p-title')).toHaveText('Midi plein');
  expect(await presenting(page)).toBe(true);
  // L'écran se vide : il ne reste que le musée et la fiche.
  await expect(page.locator('.tools')).toBeHidden();
  await expect(page.locator('#minimap')).toBeHidden();
  await expect(page.locator('#tour-auto')).toHaveText('Arrêter la présentation automatique');

  // Arrivé devant l'œuvre, le commentaire se lance de lui-même.
  const spoken = () => page.evaluate(() => (window as any).__spoken.length as number);
  await expect.poll(spoken, { timeout: 15_000 }).toBe(1);
  expect(await page.evaluate(() => (window as any).__spoken[0].text as string)).toContain('Midi plein');
  await expect(page.locator('#p-audio')).toHaveText('Arrêter la lecture');
  // Le commentaire fini, la présentation passe à l'œuvre suivante et la commente à son tour.
  await page.waitForTimeout(2200);
  await endSpeech(page);
  await expect(page.locator('#tour-status')).toContainText('Étape 2 sur 6', { timeout: 15_000 });
  await expect.poll(spoken, { timeout: 15_000 }).toBe(2);

  // Un clic dans le musée : le visiteur reprend la main.
  await page.mouse.click(200, 660);
  expect(await presenting(page)).toBe(false);
  await expect(page.locator('.tools')).toBeVisible();
  await expect(page.locator('#tour-resume')).toBeVisible();
  expect(errors).toEqual([]);
});

test('la présentation se lance depuis l’adresse et se termine d’elle-même', async ({ page }) => {
  await openMuseum(page, { spySpeech: true, welcome: true, query: '&presentation=essentiels' });
  // L'accueil reste le point de départ : c'est le clic d'entrée qui autorise le son.
  await expect(page.locator('#welcome')).toBeVisible();
  expect(await presenting(page)).toBe(false);
  await page.locator('.welcome-enter').click();
  await expect(page.locator('#tour-status')).toContainText('Étape 1 sur');
  expect(await presenting(page)).toBe(true);

  // Le bouton « Suivant » reste utilisable : il saute une étape sans arrêter la présentation.
  const steps = Number((await page.locator('#tour-status').textContent())!.match(/sur (\d+)/)![1]);
  for (let i = 1; i < steps; i++) await page.locator('#tour-next').click();
  await expect(page.locator('#tour-status')).toContainText(`Étape ${steps} sur ${steps}`);
  expect(await presenting(page)).toBe(true);
  // Dernier commentaire terminé : la présentation s'achève et l'interface revient.
  await expect.poll(() => page.evaluate(() => (window as any).__spoken.length as number), { timeout: 15_000 }).toBeGreaterThan(0);
  await page.waitForTimeout(2200);
  await endSpeech(page);
  await expect(page.locator('#toast')).toHaveText('La présentation est terminée.', { timeout: 15_000 });
  await expect(panel(page)).toBeHidden();
  await expect(page.locator('.tools')).toBeVisible();
  expect(await presenting(page)).toBe(false);
});

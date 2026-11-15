import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { clickArtwork, holdUntil, openMuseum, panel, roomName, walkUntilBlocked, teleport } from './helpers';

const fixture = () => JSON.parse(readFileSync(fileURLToPath(new URL('../fixtures/museum.json', import.meta.url)), 'utf8'));
const hook = (page: import('@playwright/test').Page, key: string) => page.evaluate((k) => (window as any).__museum[k], key);

test('le style d’architecture se change depuis l’adresse, sans toucher à la configuration', async ({ page }) => {
  await openMuseum(page);
  expect(await hook(page, 'style')).toBe('classic');
  // Murs de 0,30 m : face au mur ouest (limite en x = -6), le visiteur s'arrête vers x = -5,40.
  await teleport(page, -4, 3, Math.PI / 2);
  const classic = await walkUntilBlocked(page);

  const errors = await openMuseum(page, { query: '&style=contemporary' });
  expect(await hook(page, 'style')).toBe('contemporary');
  // Murs de 0,40 m : il s'arrête cinq centimètres plus tôt.
  await teleport(page, -4, 3, Math.PI / 2);
  const contemporary = await walkUntilBlocked(page);
  expect(classic.x).toBeCloseTo(-5.4, 1);
  expect(contemporary.x).toBeGreaterThan(classic.x + 0.02);
  expect(errors).toEqual([]);
});

test('le décor d’une salle se change depuis l’adresse, sans toucher à la configuration', async ({ page }) => {
  await openMuseum(page);
  expect(await hook(page, 'decors')).toEqual({ hall: null, galerie: null, cabinet: null, rotonde: null });

  // Trois décors à la fois : bain de couleur sous plafond flottant, salle claire, salle obscure.
  const errors = await openMuseum(page, { query: '&decor=cabinet:terre-cuite,galerie:argile-claire,rotonde:nuit,grenier:nuit,hall:rococo' });
  expect(await hook(page, 'decors')).toEqual({ hall: null, galerie: 'argile-claire', cabinet: 'terre-cuite', rotonde: 'nuit' });

  // La visite se déroule comme avant : on entre à pied dans une salle décorée, et une œuvre s'y ouvre.
  await teleport(page, 3.5, -2, 0);
  await holdUntil(page, 'KeyW', async () => (await roomName(page).textContent()) === 'Cabinet des Couleurs');
  await clickArtwork(page, 'crepuscule-interieur');
  await expect(page.locator('#p-title')).toHaveText('Crépuscule intérieur');
  await page.keyboard.press('Escape');
  await expect(panel(page)).toBeHidden();
  // Dans la salle obscure, une sculpture reste cliquable.
  await clickArtwork(page, 'orbites');
  await expect(page.locator('#p-title')).toHaveText('Orbites');
  expect(errors).toEqual([]);
});

test('un même décor s’applique à tout le musée, reflets du sol compris', async ({ page }) => {
  for (const decor of ['argile-claire', 'terre-cuite', 'nuit']) {
    const errors = await openMuseum(page, { query: `&q=high&decor=${decor}` });
    expect(await hook(page, 'decors'), decor).toEqual({ hall: decor, galerie: decor, cabinet: decor, rotonde: decor });
    expect(await page.evaluate(() => (window as any).__museum.reflections())).toBe(true);
    // Le musée a bien été dessiné : son image n'est pas vide.
    await page.waitForTimeout(400);
    expect((await page.locator('#scene').screenshot()).length, decor).toBeGreaterThan(20_000);
    expect(errors, decor).toEqual([]);
  }
});

test('le décor écrit dans la configuration est appliqué, et un décor inconnu est signalé', async ({ page }) => {
  const decorated = fixture();
  decorated.rooms.find((r: any) => r.id === 'cabinet').decor = 'terre-cuite';
  decorated.rooms.find((r: any) => r.id === 'rotonde').decor = { preset: 'nuit', colors: { wall: '#20304a' }, ceiling: { type: 'cove' } };
  const errors = await openMuseum(page, { museum: decorated });
  expect(await hook(page, 'decors')).toEqual({ hall: null, galerie: null, cabinet: 'terre-cuite', rotonde: 'nuit' });
  expect(errors).toEqual([]);

  decorated.rooms.find((r: any) => r.id === 'cabinet').decor = 'rococo';
  await page.route('**/museums/fixture/museum.json', (route) =>
    route.fulfill({ contentType: 'application/json', body: JSON.stringify(decorated) }),
  );
  await page.goto('/?m=fixture&q=medium');
  const box = page.locator('#config-errors');
  await expect(box).toBeVisible();
  await expect(box).toContainText('Salle "cabinet" : décor inconnu : "rococo"');
  await expect(page.locator('body')).not.toHaveClass(/ready/);
});

test('le niveau de qualité suit l’appareil, et se force depuis l’adresse', async ({ page }) => {
  // Un ordinateur reçoit le rendu complet, avec le reflet du sol.
  await page.goto('/');
  await page.waitForSelector('body.ready');
  expect(await hook(page, 'quality')).toBe('high');
  expect(await page.evaluate(() => (window as any).__museum.reflections())).toBe(true);
  await openMuseum(page);
  expect(await hook(page, 'quality')).toBe('medium');
  expect(await page.evaluate(() => (window as any).__museum.reflections())).toBe(false);
  await openMuseum(page, { query: '&q=low' });
  expect(await hook(page, 'quality')).toBe('low');
  expect(await page.evaluate(() => (window as any).__museum.pixelRatio())).toBe(1);
});

test('une configuration erronée affiche la liste des erreurs au lieu d’un musée cassé', async ({ page }) => {
  const broken = fixture();
  broken.doors.push({ room: 'hall', wall: 'south', offset: 0, width: 2 });
  broken.tours[0].stops.push('fantome');
  await page.route('**/museums/fixture/museum.json', (route) =>
    route.fulfill({ contentType: 'application/json', body: JSON.stringify(broken) }),
  );
  await page.goto('/?m=fixture');
  const box = page.locator('#config-errors');
  await expect(box).toBeVisible();
  await expect(box.locator('li')).toHaveCount(2);
  await expect(box).toContainText('Porte de "hall" (mur south) : ne débouche sur aucune salle voisine');
  await expect(box).toContainText('Parcours "essentiels" : étape inconnue : "fantome"');
  await expect(page.locator('body')).not.toHaveClass(/ready/);
});

test('un musée introuvable affiche un message simple', async ({ page }) => {
  await page.goto('/?m=inexistant');
  await expect(page.locator('#help')).toHaveText('Impossible de charger ce musée.');
});

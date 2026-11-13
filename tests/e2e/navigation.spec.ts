import { expect, test } from '@playwright/test';
import { clickArtwork, holdUntil, openMuseum, panel, position, roomName, teleport, walkUntilBlocked } from './helpers';

const WEST = Math.PI / 2; // regard vers l'ouest
const NORTH = 0;

test('le visiteur arrive dans la salle de départ, sans erreur', async ({ page }) => {
  const errors = await openMuseum(page);
  await expect(roomName(page)).toHaveText('Salle des Horizons');
  await expect(page.locator('#museum-name')).toHaveText('Musée des Horizons');
  expect(errors).toEqual([]);
});

test('le visiteur passe par les portes', async ({ page }) => {
  await openMuseum(page);
  await teleport(page, -4, 0, WEST);
  await holdUntil(page, 'KeyW', async () => (await roomName(page).textContent()) === 'Salon des Sculptures');

  await teleport(page, 3.5, -2, NORTH);
  await holdUntil(page, 'KeyW', async () => (await roomName(page).textContent()) === 'Cabinet des Couleurs');
});

test('un mur plein arrête le visiteur', async ({ page }) => {
  await openMuseum(page);
  await teleport(page, -4, 3, WEST);
  const stopped = await walkUntilBlocked(page);
  await expect(roomName(page)).toHaveText('Salle des Horizons');
  // Le mur ouest de la salle est en x = -6 : le visiteur s'arrête avant.
  expect(stopped.x).toBeGreaterThan(-6);
  expect(stopped.x).toBeLessThan(-5);
});

test('le visiteur glisse le long du mur à côté d’une porte, sans la traverser en biais', async ({ page }) => {
  await openMuseum(page);
  // Face au mur nord, un mètre et demi à gauche de la porte.
  await teleport(page, 1.2, -2, NORTH);
  const stopped = await walkUntilBlocked(page);
  await expect(roomName(page)).toHaveText('Salle des Horizons');
  expect(stopped.z).toBeGreaterThan(-4.5);
});

test('le socle d’une sculpture arrête le visiteur', async ({ page }) => {
  await openMuseum(page);
  // Dans le salon, face à la sculpture centrale posée en (-10.5, 0).
  await teleport(page, -8, 0, WEST);
  const stopped = await walkUntilBlocked(page);
  expect(Math.hypot(stopped.x + 10.5, stopped.z)).toBeGreaterThan(0.7);
  expect(stopped.x).toBeGreaterThan(-10.5);
});

test('un banc arrête le visiteur, qui peut le contourner', async ({ page }) => {
  await openMuseum(page);
  // Dans la galerie, un banc est posé en (10, 3.6), allongé du nord au sud. On marche vers lui depuis l'ouest.
  await teleport(page, 7.5, 3.6, -WEST);
  const stopped = await walkUntilBlocked(page);
  expect(stopped.x).toBeGreaterThan(8.5);
  expect(stopped.x).toBeLessThan(9.8);
  // En se décalant au-delà du bout du banc, le passage est libre jusqu'au mur est (x = 14).
  await teleport(page, 7.5, 1.5, -WEST);
  const free = await walkUntilBlocked(page);
  expect(free.x).toBeGreaterThan(12.5);
});

test('face à une œuvre, le visiteur n’est jamais placé dans un banc', async ({ page }) => {
  await openMuseum(page);
  const walkable = (x: number, z: number) => page.evaluate(([x, z]) => (window as any).__museum.world.walkable(x, z), [x, z]);
  // « Ronds dans l'eau » est accroché sur le mur est (surface en x = 13,85), juste en face du banc :
  // à quatre mètres de recul, l'emplacement naturel du visiteur tombe sur le banc.
  expect(await walkable(13.85 - 4, 3.8)).toBe(false);
  for (const distance of [2, 3, 3.5, 4, 4.5, 5]) {
    await page.evaluate(([d]) => (window as any).__museum.standBefore('ronds-dans-l-eau', d), [distance]);
    const p = await position(page);
    expect(await walkable(p.x, p.z), `recul de ${distance} m`).toBe(true);
    expect(p.z).toBeCloseTo(3.8, 1);
  }
});

test('cliquer sur un tableau ouvre sa fiche et amène le visiteur devant', async ({ page }) => {
  await openMuseum(page);
  await clickArtwork(page, 'equilibre-no-7', 4.5);
  await expect(panel(page)).toBeVisible();
  await expect(page.locator('#p-title')).toHaveText('Équilibre n° 7');
  await expect(page.locator('#p-artist')).toHaveText('Hélène Varga');
  await expect(page.locator('#p-meta')).toContainText('150 × 200 cm');
  // Le visiteur se rapproche du mur nord (z = -4.5).
  const start = await position(page);
  await expect.poll(async () => (await position(page)).z, { timeout: 15_000 }).not.toBe(start.z);

  await page.keyboard.press('Escape');
  await expect(panel(page)).toBeHidden();
});

test('cliquer sur une sculpture ouvre sa fiche', async ({ page }) => {
  await openMuseum(page);
  await clickArtwork(page, 'noeud-sans-fin', 3);
  await expect(page.locator('#p-title')).toHaveText('Nœud sans fin');
  await expect(page.locator('#p-meta')).toContainText('H. 150 cm');
});

test('une œuvre cachée derrière un mur n’est pas cliquable', async ({ page }) => {
  await openMuseum(page);
  // Dans la salle principale, face à un mur plein derrière lequel se trouve une sculpture.
  await teleport(page, -3, -2.7, WEST);
  await page.waitForTimeout(400);
  await page.mouse.click(640, 400);
  await page.waitForTimeout(400);
  await expect(panel(page)).toBeHidden();
});

test('le plan transporte le visiteur dans la salle choisie', async ({ page }) => {
  await openMuseum(page);
  await page.click('#map-open');
  await expect(page.locator('.map-room')).toHaveCount(4);
  await page.getByRole('button', { name: 'Cabinet des Couleurs' }).click();
  await expect(roomName(page)).toHaveText('Cabinet des Couleurs');

  await page.click('#map-open');
  await page.getByRole('button', { name: 'Galerie des Lignes' }).click();
  await expect(roomName(page)).toHaveText('Galerie des Lignes');
});

test('la langue change les textes de l’interface et des œuvres', async ({ page }) => {
  await openMuseum(page);
  await clickArtwork(page, 'equilibre-no-7', 4.5);
  await page.selectOption('#lang', 'en');
  await expect(page.locator('#p-title')).toHaveText('Balance No. 7');
  await expect(page.locator('#museum-name')).toHaveText('Horizons Museum');
  await expect(page.locator('#map-open')).toHaveText('Map');
});

test('à l’arrêt, le musée ne redessine pas l’image', async ({ page }) => {
  await openMuseum(page);
  const frames = () => page.evaluate(() => (window as any).__museum.renderer.info.render.frame as number);
  await page.waitForTimeout(4500);
  const before = await frames();
  await page.waitForTimeout(1500);
  expect((await frames()) - before).toBe(0);
});

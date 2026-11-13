import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { openMuseum, walkUntilBlocked, teleport } from './helpers';

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

test('le niveau de qualité suit l’appareil, et se force depuis l’adresse', async ({ page }) => {
  await openMuseum(page);
  expect(await hook(page, 'quality')).toBe('high');
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

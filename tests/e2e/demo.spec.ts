import { expect, test } from '@playwright/test';
import { PROD_URL } from '../../playwright.config';

/** Ces tests portent sur le vrai musée de démonstration, pas sur le musée de test. */

test('démo : chaque œuvre s’ouvre depuis le point de vue qui lui fait face', async ({ page }) => {
  const errors: string[] = [];
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto('/');
  await page.waitForSelector('body.ready');

  const works = await page.evaluate(() => {
    const m = (window as any).__museum;
    return m.world.artworks.map((a: any) => ({ id: a.config.id as string, title: a.config.title.fr as string }));
  });
  expect(works.length).toBeGreaterThan(0);
  // Toutes les images des œuvres finissent de charger.
  await expect
    .poll(() => page.evaluate(() => (window as any).__museum.world.artworks.filter((a: any) => !a.ready).length), { timeout: 30_000 })
    .toBe(0);
  for (const work of works) {
    await page.evaluate((id) => (window as any).__museum.standBefore(id, 3), work.id);
    await page.waitForTimeout(250);
    const p = await page.evaluate((id) => (window as any).__museum.screenOf(id), work.id);
    await page.mouse.click(p.x, p.y);
    await expect(page.locator('#p-title'), `fiche de « ${work.title} »`).toHaveText(work.title);
    await page.keyboard.press('Escape');
    await expect(page.locator('#panel')).toBeHidden();
  }
  expect(errors).toEqual([]);
});

test('démo : la fiche d’une œuvre cite le musée qui la conserve, dans les deux langues', async ({ page }) => {
  await page.goto('/?q=medium');
  await page.waitForSelector('body.ready');
  await page.evaluate(() => (window as any).__museum.standBefore('la-grande-vague', 2));
  await page.waitForTimeout(300);
  const p = await page.evaluate(() => (window as any).__museum.screenOf('la-grande-vague'));
  await page.mouse.click(p.x, p.y);
  await expect(page.locator('#p-title')).toHaveText('La Grande Vague de Kanagawa');
  await expect(page.locator('#p-artist')).toHaveText('Katsushika Hokusai');
  await expect(page.locator('#p-meta')).toContainText('vers 1830–1832');
  const credit = page.locator('#p-credit');
  await expect(credit).toContainText('The Metropolitan Museum of Art, New York · image dans le domaine public');
  await expect(credit.locator('a')).toHaveAttribute('href', 'https://www.metmuseum.org/art/collection/search/45434');
  await expect(credit.locator('a')).toHaveAttribute('target', '_blank');
  // Une petite estampe se regarde de près : le visiteur s'arrête à moins d'un mètre.
  await expect
    .poll(() => page.evaluate(() => {
      const m = (window as any).__museum;
      const art = m.world.artworks.find((a: any) => a.config.id === 'la-grande-vague');
      return Math.hypot(m.camera.position.x - art.center.x, m.camera.position.z - art.center.z);
    }), { timeout: 15_000 })
    .toBeLessThan(1);

  await page.locator('#lang').selectOption('en');
  await expect(page.locator('#p-title')).toHaveText('The Great Wave off Kanagawa');
  await expect(page.locator('#p-meta')).toContainText('c. 1830–32');
  await expect(credit).toContainText('public domain image');
  await expect(credit.locator('a')).toHaveText('View the museum record');
});

test('une œuvre sans mention ni lien n’affiche pas de ligne vide', async ({ page }) => {
  await page.route('**/museums/fixture/museum.json', (route) =>
    route.fulfill({ path: new URL('../fixtures/museum.json', import.meta.url).pathname }),
  );
  await page.goto('/?m=fixture&q=medium');
  await page.waitForSelector('body.ready');
  await page.evaluate(() => (window as any).__museum.standBefore('equilibre-no-7', 3));
  await page.waitForTimeout(300);
  const p = await page.evaluate(() => (window as any).__museum.screenOf('equilibre-no-7'));
  await page.mouse.click(p.x, p.y);
  await expect(page.locator('#p-title')).toHaveText('Équilibre n° 7');
  await expect(page.locator('#p-credit')).toBeHidden();
});

test('version publiée : la visite 3D et la vue simplifiée se chargent', async ({ page }) => {
  const errors: string[] = [];
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('response', (r) => r.status() >= 400 && errors.push(`${r.status()} ${r.url()}`));

  await page.goto(`${PROD_URL}/`);
  await page.waitForSelector('body.ready');
  await expect(page.locator('#scene')).toBeVisible();
  await expect(page.locator('#museum-name')).not.toBeEmpty();
  // L'accès réservé aux tests ne doit pas exister dans la version publiée.
  expect(await page.evaluate(() => '__museum' in window)).toBe(false);

  await page.goto(`${PROD_URL}/?vue=simple`);
  await page.waitForSelector('body.ready');
  expect(await page.locator('.card').count()).toBeGreaterThan(0);
  const image = page.locator('.card img').first();
  await expect.poll(() => image.evaluate((img: HTMLImageElement) => img.naturalWidth)).toBeGreaterThan(0);
  expect(errors).toEqual([]);
});

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

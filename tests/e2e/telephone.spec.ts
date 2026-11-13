import { devices, expect, test } from '@playwright/test';
import { clickArtwork, openMuseum, panel } from './helpers';

// Un téléphone, émulé dans le même navigateur que les autres tests.
const { defaultBrowserType: _ignored, ...iphone } = devices['iPhone 13'];
test.use(iphone);

test('sur téléphone, la manette est visible et la fiche s’ouvre en bas d’écran', async ({ page }) => {
  const errors = await openMuseum(page);
  await expect(page.locator('#joystick')).toBeVisible();
  await expect(page.locator('#help')).toContainText('manette pour avancer');

  // Toucher une œuvre.
  await page.evaluate(() => (window as any).__museum.standBefore('equilibre-no-7', 4.5));
  await page.waitForTimeout(300);
  const p = await page.evaluate(() => (window as any).__museum.screenOf('equilibre-no-7'));
  await page.touchscreen.tap(p.x, p.y);
  await expect(panel(page)).toBeVisible();

  const box = (await panel(page).boundingBox())!;
  const view = page.viewportSize()!;
  expect(box.width).toBeCloseTo(view.width, 0);
  expect(box.y + box.height).toBeCloseTo(view.height, 0);
  // L'œuvre reste visible : elle est cadrée entre l'en-tête et la fiche.
  const bar = (await page.locator('#bar').boundingBox())!;
  await expect
    .poll(async () => (await page.evaluate(() => (window as any).__museum.screenOf('equilibre-no-7'))).y, { timeout: 15_000 })
    .toBeGreaterThan(bar.y + bar.height);
  const art = await page.evaluate(() => (window as any).__museum.screenOf('equilibre-no-7'));
  expect(art.y).toBeLessThan(box.y);
  expect(errors).toEqual([]);
});

test('sur téléphone, les boutons du parcours restent visibles sans faire défiler la fiche', async ({ page }) => {
  await openMuseum(page);
  await page.locator('#tours-open').tap();
  await page.getByRole('button', { name: 'Commencer : La couleur avant tout' }).tap();
  await expect(page.locator('#p-title')).toHaveText('Midi plein');
  await expect(page.locator('#tour-next')).toBeInViewport();
  await expect(page.locator('#tour-prev')).toBeDisabled();
});

test('sur téléphone, la vue simplifiée ne déborde pas en largeur', async ({ page }) => {
  await openMuseum(page, { query: '&vue=simple' });
  await expect(page.locator('.card')).toHaveCount(21);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(0);
});

test('la joystick tactile déplace le visiteur', async ({ page }) => {
  await openMuseum(page);
  const start = await page.evaluate(() => (window as any).__museum.camera.position.z as number);
  const stick = (await page.locator('#joystick').boundingBox())!;
  const cx = stick.x + stick.width / 2;
  const cy = stick.y + stick.height / 2;
  // Un doigt posé au centre de la manette, puis poussé vers le haut.
  await page.locator('#joystick').dispatchEvent('pointerdown', { pointerId: 7, clientX: cx, clientY: cy, pointerType: 'touch', isPrimary: true });
  await page.locator('#joystick').dispatchEvent('pointermove', { pointerId: 7, clientX: cx, clientY: cy - 50, pointerType: 'touch', isPrimary: true });
  await expect
    .poll(() => page.evaluate(() => (window as any).__museum.camera.position.z as number), { timeout: 15_000 })
    .toBeLessThan(start - 0.3);
  await page.locator('#joystick').dispatchEvent('pointerup', { pointerId: 7, clientX: cx, clientY: cy - 50, pointerType: 'touch', isPrimary: true });
});

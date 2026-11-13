import { expect, test } from '@playwright/test';
import { openMuseum } from './helpers';

test('la vue simplifiée présente toutes les œuvres, sans 3D', async ({ page }) => {
  const errors = await openMuseum(page, { spySpeech: true });
  await page.click('#mode');
  await page.waitForSelector('body.simple.ready');
  expect(new URL(page.url()).searchParams.get('vue')).toBe('simple');

  await expect(page.locator('#scene')).toBeHidden();
  await expect(page.locator('.card')).toHaveCount(21);
  await expect(page.locator('.simple-page h2').first()).toHaveText('Parcours de visite');

  // Les tableaux générés sont dessinés à l'approche de l'écran.
  const first = page.locator('#art-equilibre-no-7 img');
  await first.scrollIntoViewIfNeeded();
  await expect.poll(() => first.evaluate((img: HTMLImageElement) => img.naturalWidth)).toBeGreaterThan(0);

  // Audioguide.
  const listen = page.locator('#art-noeud-sans-fin button');
  await listen.click();
  await expect(listen).toHaveText('Arrêter la lecture');

  // Langue, puis retour à la visite en 3D.
  await page.selectOption('#lang', 'en');
  await expect(page.locator('.simple-page h2').first()).toHaveText('Guided tours');
  await expect(page.locator('#mode')).toHaveText('3D visit');
  await page.click('#mode');
  await page.waitForSelector('body.ready:not(.simple)');
  await expect(page.locator('#scene')).toBeVisible();
  expect(errors).toEqual([]);
});

test('un lien de parcours mène à la fiche de l’œuvre', async ({ page }) => {
  await openMuseum(page, { query: '&vue=simple' });
  await page.getByRole('link', { name: 'Nœud sans fin, Paolo Venier' }).click();
  await expect(page.locator('#art-noeud-sans-fin')).toBeInViewport();
});

test('sans 3D disponible, le musée s’ouvre directement en vue simplifiée', async ({ page }) => {
  await page.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement, type: string, ...rest: unknown[]) {
      return String(type).startsWith('webgl') ? null : (original as any).call(this, type, ...rest);
    } as typeof original;
  });
  await openMuseum(page);
  await expect(page.locator('body')).toHaveClass(/simple/);
  await expect(page.locator('.notice')).toContainText('La visite en 3D n’est pas disponible sur cet appareil');
  await expect(page.locator('#mode')).toBeHidden();
  await expect(page.locator('.card')).toHaveCount(21);
});

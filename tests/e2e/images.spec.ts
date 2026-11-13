import { expect, test, type Page } from '@playwright/test';
import { openMuseum } from './helpers';

/** Dans le musée de test, le tableau « Portée » est le seul dont l'image est un fichier. */
const portee = (page: Page) =>
  page.evaluate(() => {
    const art = (window as any).__museum.world.artworks.find((a: any) => a.config.id === 'portee');
    const map = art.label.parent.children.find((c: any) => c.material?.map && c.geometry.parameters.width === art.config.width)?.material.map;
    return { ready: art.ready as boolean, width: (map?.image?.width ?? 0) as number, span: art.span as number };
  });

const requested = (page: Page) => {
  const urls: string[] = [];
  page.on('request', (r) => {
    if (r.url().includes('/museums/fixture/images/')) urls.push(new URL(r.url()).pathname);
  });
  return urls;
};

test('une œuvre dont l’image est un fichier s’affiche dans la visite 3D', async ({ page }) => {
  const urls = requested(page);
  const errors = await openMuseum(page);
  await expect.poll(async () => (await portee(page)).ready).toBe(true);
  const art = await portee(page);
  // L'image servie par le test mesure 300 pixels de large ; le tableau garde la largeur de la configuration.
  expect(art.width).toBe(300);
  expect(art.span).toBeCloseTo(1.13);
  // Qualité moyenne : la version de 1024 pixels, et elle seule.
  expect(urls).toEqual(['/museums/fixture/images/web/portee-1024.webp']);
  expect(errors).toEqual([]);
});

test('la version chargée dépend du niveau de qualité', async ({ page }) => {
  const urls = requested(page);
  await openMuseum(page, { query: '&q=low' });
  await expect.poll(async () => (await portee(page)).ready).toBe(true);
  await openMuseum(page, { query: '&q=high' });
  await expect.poll(async () => (await portee(page)).ready).toBe(true);
  expect(urls).toEqual(['/museums/fixture/images/web/portee-640.webp', '/museums/fixture/images/web/portee-1600.webp']);
});

test('dans la vue simplifiée, le navigateur choisit lui-même la version de l’image', async ({ page }) => {
  await openMuseum(page, { query: '&vue=simple' });
  const img = page.locator('#art-portee img');
  await img.scrollIntoViewIfNeeded();
  await expect.poll(() => img.evaluate((el: HTMLImageElement) => el.naturalWidth)).toBeGreaterThan(0);
  // La vignette fait 260 pixels de large à l'écran : la version de 640 pixels suffit.
  expect(await img.evaluate((el: HTMLImageElement) => el.currentSrc)).toContain('/images/web/portee-640.webp');
  expect(await img.getAttribute('srcset')).toContain('portee-640.webp 427w');
  expect(await img.getAttribute('alt')).toBe('Portée, Ingrid Solberg');
});

test('une image introuvable laisse la toile vide sans bloquer la visite', async ({ page }) => {
  const errors = await openMuseum(page, { missingImages: true });
  await expect(page.locator('#room-name')).toHaveText('Salle des Horizons');
  await expect.poll(() => errors.some((e) => e.includes('[musée] image introuvable : images/portee.webp'))).toBe(true);
  expect((await portee(page)).ready).toBe(false);
});

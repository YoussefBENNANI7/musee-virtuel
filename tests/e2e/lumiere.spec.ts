import { expect, test, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { openMuseum } from './helpers';

/**
 * Lumière précalculée (rendu premium, pilote de la version 2) : voir src/engine/lumiere.ts.
 * Le musée de démonstration en a une pour la Salle des Horizons, calculée par `npm run lumiere`.
 */

const demo = () => JSON.parse(readFileSync(fileURLToPath(new URL('../../public/museums/demo/museum.json', import.meta.url)), 'utf8'));

/** Ouvre la démonstration, éventuellement avec une configuration modifiée, et relève les erreurs et avertissements. */
async function openDemo(page: Page, query = '', museum?: unknown) {
  const errors: string[] = [];
  const warnings: string[] = [];
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
    if (m.type() === 'warning') warnings.push(m.text());
  });
  page.on('pageerror', (e) => errors.push(String(e)));
  if (museum) await page.route('**/museums/demo/museum.json', (route) => route.fulfill({ contentType: 'application/json', body: JSON.stringify(museum) }));
  await page.goto(`/?m=demo&q=medium&accueil=non${query}`);
  await page.waitForSelector('body.ready');
  const rooms = await page.evaluate(() => (window as any).__museum.lumiere() as Promise<string[]>);
  return { rooms, errors, warnings };
}

/** État de l'éclairage d'une salle : surfaces lues dans l'atlas, halos et ombres peintes encore visibles. */
const roomState = (page: Page, roomId: string) =>
  page.evaluate((id) => {
    const m = (window as any).__museum;
    let surfaces = 0;
    let lightmapped = 0;
    let halos = 0;
    let shadows = 0;
    m.world.group.traverse((o: any) => {
      if (o.isMesh && o.userData.lumiere === id) {
        surfaces++;
        if (o.material.lightMap && !o.material.vertexColors) lightmapped++;
      }
      if (o.userData.halo === id && o.visible) halos++;
      if (o.userData.ombrePeinte && o.visible) {
        const p = o.getWorldPosition(o.position.clone());
        const r = m.world.roomAt(p.x, p.z);
        if (r?.id === id) shadows++;
      }
    });
    return { surfaces, lightmapped, halos, shadows };
  }, roomId);

test('la Salle des Horizons est éclairée par sa lumière précalculée, les autres salles gardent la leur', async ({ page }) => {
  const { rooms, errors } = await openDemo(page);
  expect(rooms).toEqual(['horizons']);
  const horizons = await roomState(page, 'horizons');
  expect(horizons.surfaces).toBeGreaterThan(5);
  expect(horizons.lightmapped).toBe(horizons.surfaces);
  // Les effets peints qui imitaient la lumière sont retirés : les vrais sont dans l'atlas.
  expect(horizons.halos).toBe(0);
  expect(horizons.shadows).toBe(0);
  // Le Cabinet des Couleurs n'a pas été calculé : éclairage par formule, halos et ombres peintes en place.
  const cabinet = await roomState(page, 'cabinet');
  expect(cabinet.lightmapped).toBe(0);
  expect(cabinet.halos).toBeGreaterThan(0);
  expect(errors).toEqual([]);
});

test('« ?lumiere=0 » montre la salle avec l’éclairage par formule, pour comparer', async ({ page }) => {
  const { rooms, errors } = await openDemo(page, '&lumiere=0');
  expect(rooms).toEqual([]);
  const horizons = await roomState(page, 'horizons');
  expect(horizons.lightmapped).toBe(0);
  expect(horizons.halos).toBeGreaterThan(0);
  expect(horizons.shadows).toBeGreaterThan(0);
  expect(errors).toEqual([]);
});

test('une salle modifiée depuis le calcul garde l’éclairage par formule, et le signale', async ({ page }) => {
  // Un tableau de la salle a été déplacé de 50 cm : le faisceau de son projecteur n'est plus au bon endroit.
  const museum = demo();
  const horizons = museum.rooms.find((r: any) => r.id === 'horizons');
  horizons.artworks.find((a: any) => a.type === 'painting').offset += 0.5;
  const { rooms, errors, warnings } = await openDemo(page, '', museum);
  expect(rooms).toEqual([]);
  expect((await roomState(page, 'horizons')).lightmapped).toBe(0);
  expect(warnings.some((w) => w.includes('horizons') && w.includes('npm run lumiere'))).toBe(true);
  expect(errors).toEqual([]);
});

test('un musée dont la lumière précalculée manque s’ouvre normalement', async ({ page }) => {
  const museum = JSON.parse(readFileSync(fileURLToPath(new URL('../fixtures/museum.json', import.meta.url)), 'utf8'));
  museum.lumiere = 'lumiere/lumiere.json';
  await page.route('**/museums/fixture/lumiere/lumiere.json', (route) => route.fulfill({ status: 404, body: '' }));
  const errors = await openMuseum(page, { museum });
  expect(await page.evaluate(() => (window as any).__museum.lumiere())).toEqual([]);
  // Seule la ressource introuvable est signalée par le navigateur ; la visite, elle, n'a aucune erreur.
  expect(errors.filter((e) => !e.includes('404'))).toEqual([]);
});

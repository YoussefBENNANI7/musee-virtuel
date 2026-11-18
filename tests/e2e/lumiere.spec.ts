import { expect, test, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { openMuseum } from './helpers';

/**
 * Lumière précalculée (rendu premium, version 2) : voir src/engine/lumiere.ts.
 * Le musée de démonstration en a une pour chacune de ses salles, calculée par `npm run lumiere`.
 */

const read = (path: string) => JSON.parse(readFileSync(fileURLToPath(new URL(path, import.meta.url)), 'utf8'));
const demo = () => read('../../public/museums/demo/museum.json');
const manifest = () => read('../../public/museums/demo/lumiere/lumiere.json');
const ROOMS = ['atrium', 'horizons', 'cabinet', 'galerie', 'cour', 'riad'];

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
  await page.goto(`/?m=demo${/[?&]q=/.test(query) ? '' : '&q=medium'}&accueil=non${query}`);
  await page.waitForSelector('body.ready');
  const rooms = await page.evaluate(() => (window as any).__museum.lumiere() as Promise<string[]>);
  return { rooms, errors, warnings };
}

/**
 * État de l'éclairage d'une salle : surfaces qui lisent l'atlas, et effets peints encore visibles
 * (halos autour des œuvres, ombres sous les bancs et les socles, tache de soleil).
 */
const roomState = (page: Page, roomId: string) =>
  page.evaluate((id) => {
    const m = (window as any).__museum;
    const state = { surfaces: 0, lightmapped: 0, bands: 0, halos: 0, shadows: 0, sunPatches: 0, intensity: 0, atlasWidth: 0 };
    m.world.group.traverse((o: any) => {
      if (o.isMesh && o.userData.lumiere === id) {
        state.surfaces++;
        if (o.material.lightMap && !o.material.vertexColors && o.geometry.attributes.uv1) {
          state.lightmapped++;
          if (o.userData.habillage) state.bands++;
          state.intensity = o.material.lightMapIntensity;
          state.atlasWidth = o.material.lightMap.image.width;
        }
      }
      if (o.userData.halo === id && o.visible) state.halos++;
      if (o.userData.soleil === id && o.visible) state.sunPatches++;
      if (o.userData.ombrePeinte && o.visible) {
        const p = o.getWorldPosition(o.position.clone());
        if (m.world.roomAt(p.x, p.z)?.id === id) state.shadows++;
      }
    });
    return state;
  }, roomId);

test('chaque salle de la démonstration est éclairée par sa lumière précalculée', async ({ page }) => {
  const { rooms, errors, warnings } = await openDemo(page);
  expect(rooms).toEqual(ROOMS);
  const entries = manifest().rooms;
  for (const id of ROOMS) {
    const state = await roomState(page, id);
    expect(state.surfaces, id).toBeGreaterThan(5);
    expect(state.lightmapped, id).toBe(state.surfaces);
    // La lumière est lue avec le facteur de codage de la salle.
    expect(state.intensity, id).toBeCloseTo(entries[id].encode * Math.PI, 5);
    expect(state.atlasWidth, id).toBe(entries[id].width);
    // Les effets qui imitaient la lumière sont retirés : les vrais sont dans l'atlas.
    expect(state.halos, id).toBe(0);
    expect(state.shadows, id).toBe(0);
    expect(state.sunPatches, id).toBe(0);
  }
  // Le patio a des bandes de zellige et de plâtre : elles lisent la lumière du mur qu'elles habillent.
  expect((await roomState(page, 'riad')).bands).toBeGreaterThan(8);
  // Sous une verrière, le soleil a été calculé ; la salle sombre a besoin d'une plage de lumière plus large.
  expect(entries.atrium.soleil).toBe(true);
  expect(entries.horizons.soleil).toBe(false);
  expect(entries.galerie.encode).toBeGreaterThan(entries.horizons.encode);
  expect(warnings.filter((w) => w.includes('lumiere'))).toEqual([]);
  expect(errors).toEqual([]);
});

test('« ?lumiere=0 » montre le musée avec l’éclairage par formule, pour comparer', async ({ page }) => {
  const { rooms, errors } = await openDemo(page, '&lumiere=0');
  expect(rooms).toEqual([]);
  const horizons = await roomState(page, 'horizons');
  expect(horizons.lightmapped).toBe(0);
  expect(horizons.halos).toBeGreaterThan(0);
  expect(horizons.shadows).toBeGreaterThan(0);
  const atrium = await roomState(page, 'atrium');
  expect(atrium.sunPatches).toBe(1);
  expect(atrium.shadows).toBe(1);
  expect(errors).toEqual([]);
});

test('une salle modifiée depuis le calcul garde l’éclairage par formule, et le signale ; les autres gardent leur atlas', async ({ page }) => {
  // Un tableau de la salle a été déplacé de 50 cm : le faisceau de son projecteur n'est plus au bon endroit.
  const museum = demo();
  const horizons = museum.rooms.find((r: any) => r.id === 'horizons');
  horizons.artworks.find((a: any) => a.type === 'painting').offset += 0.5;
  const { rooms, errors, warnings } = await openDemo(page, '', museum);
  expect(rooms).toEqual(ROOMS.filter((id) => id !== 'horizons'));
  const state = await roomState(page, 'horizons');
  expect(state.lightmapped).toBe(0);
  expect(state.halos).toBeGreaterThan(0);
  expect(warnings.some((w) => w.includes('horizons') && w.includes('npm run lumiere'))).toBe(true);
  expect(errors).toEqual([]);
});

test('sur un appareil modeste, l’atlas de lumière est réduit de moitié', async ({ page }) => {
  const { rooms, errors } = await openDemo(page, '&q=low');
  expect(rooms).toEqual(ROOMS);
  const state = await roomState(page, 'horizons');
  expect(state.lightmapped).toBe(state.surfaces);
  expect(state.atlasWidth).toBe(manifest().rooms.horizons.width / 2);
  expect(errors).toEqual([]);
});

test('la scène exportée pour Blender décrit la salle : plans, surfaces, projecteurs, salles voisines', async ({ page }) => {
  // Galerie du musée de test : quatre murs dont un percé d'une porte, cinq tableaux, un banc.
  const errors = await openMuseum(page);
  const { scene, print } = await page.evaluate(() => {
    const m = (window as any).__museum;
    return { scene: JSON.parse(m.lumiereExport('galerie', { samples: 8 })), print: m.lumiereEmpreinte('galerie') as string };
  });
  expect(scene.fingerprint).toBe(print);
  expect(scene.samples).toBe(8);
  expect(Math.log2(scene.atlas.width) % 1).toBe(0);
  expect(Math.log2(scene.atlas.height) % 1).toBe(0);

  // Un plan par mur, un pour le sol, un pour le plafond.
  expect(scene.charts.map((c: any) => c.family).sort()).toEqual(['murs', 'murs', 'murs', 'murs', 'plafond', 'sol']);
  for (const c of scene.charts) {
    const [x0, y0, x1, y1] = c.rect;
    expect(x0).toBeGreaterThanOrEqual(0);
    expect(y0).toBeGreaterThanOrEqual(0);
    expect(x1).toBeLessThanOrEqual(scene.atlas.width);
    expect(y1).toBeLessThanOrEqual(scene.atlas.height);
    // Sol et plafond : seule compte la partie visible, entre les murs (et sous la porte, pour le sol).
    expect(c.visible?.length ?? 0).toBe(c.family === 'sol' ? 2 : c.family === 'plafond' ? 1 : 0);
    for (const [vx0, vy0, vx1, vy1] of c.visible ?? []) {
      expect(vx1).toBeGreaterThan(vx0);
      expect(vy1).toBeGreaterThan(vy0);
    }
  }

  const byRole = (role: string) => scene.meshes.filter((m: any) => m.role === role);
  // Le mur de la porte compte trois pans (deux côtés et le linteau) : huit surfaces à éclairer en tout.
  const bake = byRole('bake');
  expect(bake).toHaveLength(8);
  expect(bake.filter((m: any) => scene.charts[m.chart].family === 'murs')).toHaveLength(6);
  for (const m of scene.meshes) {
    expect(m.positions.every(Number.isFinite)).toBe(true);
    expect(m.indices.length % 3).toBe(0);
    expect(Math.max(...m.indices)).toBeLessThan(m.positions.length / 3);
  }
  for (const m of bake) {
    expect(m.uv1).toHaveLength((m.positions.length / 3) * 2);
    expect(m.light).toHaveLength(m.positions.length);
    expect(m.uv1.every((x: number) => x >= 0 && x <= 1)).toBe(true);
    expect(m.albedo.every((x: number) => x > 0 && x <= 0.9)).toBe(true);
  }
  // Les autres salles rayonnent leur couleur ; le banc, les cadres et l'embrasure de la porte font de l'ombre.
  expect(byRole('env').length).toBeGreaterThan(10);
  expect(byRole('occlude').length).toBeGreaterThan(15);
  expect(byRole('own')).toHaveLength(0);

  // Un projecteur par tableau, au-dessus de lui, braqué sur son centre ; son faisceau se mesure sur le mur.
  expect(scene.spots).toHaveLength(5);
  for (const spot of scene.spots) {
    expect(spot.position[1]).toBeGreaterThan(spot.target[1] + 1.5);
    expect(spot.angle).toBeGreaterThan(10);
    expect(spot.angle).toBeLessThan(90);
    expect(spot.probe).toHaveLength(2);
    expect(spot.probe.every((x: number) => x > 0 && x < 1)).toBe(true);
  }
  // Plafond plein : une ambiance, ni soleil ni lanternes.
  expect(scene.areas).toHaveLength(1);
  expect(scene.sun).toBeNull();
  expect(scene.points).toEqual([]);
  expect(scene.gains.spots).toBeCloseTo(0.42, 5);
  expect(errors).toEqual([]);
});

test('un musée dont la lumière précalculée manque s’ouvre normalement', async ({ page }) => {
  const museum = read('../fixtures/museum.json');
  museum.lumiere = 'lumiere/lumiere.json';
  await page.route('**/museums/fixture/lumiere/lumiere.json', (route) => route.fulfill({ status: 404, body: '' }));
  const errors = await openMuseum(page, { museum });
  expect(await page.evaluate(() => (window as any).__museum.lumiere())).toEqual([]);
  // Seule la ressource introuvable est signalée par le navigateur ; la visite, elle, n'a aucune erreur.
  expect(errors.filter((e) => !e.includes('404'))).toEqual([]);
});

test('l’aperçu de l’éditeur dit où en est la lumière de chaque salle, et se photographie pour une couverture', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto('/?m=demo&apercu=1&q=medium');
  await page.waitForSelector('body.ready');
  // Toutes les salles de la démonstration sont à jour : aucune à recalculer, aucune jamais calculée.
  expect(await page.evaluate(() => (window as any).__apercu.lumiere())).toEqual({ applied: ROOMS, stale: [], missing: [] });

  const before = await page.evaluate(() => (window as any).__museum.renderer.domElement.width);
  const shot = await page.evaluate(async () => {
    const data: string = (window as any).__apercu.capture();
    const img = new Image();
    img.src = data;
    await img.decode();
    return { kind: data.slice(0, 23), width: img.naturalWidth, height: img.naturalHeight };
  });
  // Au format des cartes de la page de choix (16:10), en JPEG ; l'aperçu reprend ensuite sa taille.
  expect(shot).toEqual({ kind: 'data:image/jpeg;base64,', width: 1600, height: 1000 });
  expect(await page.evaluate(() => (window as any).__museum.renderer.domElement.width)).toBe(before);
  expect(errors).toEqual([]);
});

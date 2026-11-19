import { expect, test, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { clickArtwork, openMuseum, panel } from './helpers';

/**
 * Cadres en relief (src/engine/cadres.ts). Tant que le porteur n'a pas choisi ses modèles, ils ne se
 * montrent qu'à la demande : `?cadres=famille:modèle` dans l'adresse. Sans cela, rien ne change.
 */

/** Le musée de test, avec un tableau doré, une estampe sous passe-partout et un objet sans cadre. */
function museum() {
  const config = JSON.parse(readFileSync(fileURLToPath(new URL('../fixtures/museum.json', import.meta.url)), 'utf8'));
  const hall = config.rooms.find((r: any) => r.id === 'hall').artworks;
  hall.find((a: any) => a.id === 'petite-fugue').frame = 'gilt';
  Object.assign(hall.find((a: any) => a.id === 'midi-plein'), { width: 0.3, height: 0.4, mat: 0.1 });
  hall.find((a: any) => a.id === 'rive-gauche-rive-droite').frameless = true;
  return config;
}

/** Pour chaque tableau : son nombre de moulures, sa saillie sur le mur, et la hauteur de sa toile. */
const frames = (page: Page) =>
  page.evaluate(() => {
    const m = (window as any).__museum;
    const out: Record<string, { mouldings: number; depth: number; canvas: number }> = {};
    for (const a of m.world.artworks) {
      if (a.config.type !== 'painting') continue;
      const group = a.label.parent;
      let mouldings = 0;
      let depth = 0;
      let canvas = 0;
      for (const child of group.children) {
        child.traverse((o: any) => {
          if (!o.isMesh) return;
          // Une moulure : une matière éclairée, dont les creux sont assombris sommet par sommet.
          if (o.geometry.attributes.color && o.material.isMeshStandardMaterial) {
            mouldings++;
            o.geometry.computeBoundingBox();
            depth = Math.max(depth, o.geometry.boundingBox.max.z);
          }
          // La toile : le seul plan qui porte l'image de l'œuvre, aux dimensions de l'œuvre.
          const p = o.geometry.parameters;
          if (o.material.isMeshBasicMaterial && !o.material.transparent && p?.width === a.config.width && p?.height === a.config.height && o.material.polygonOffsetFactor === -3) canvas = o.position.z;
        });
      }
      out[a.config.id] = { mouldings, depth: +depth.toFixed(4), canvas: +canvas.toFixed(4) };
    }
    return out;
  });

test('sans réglage, les cadres restent ceux d’avant', async ({ page }) => {
  const errors = await openMuseum(page, { museum: museum() });
  const state = await frames(page);
  expect(Object.keys(state)).toHaveLength(16);
  for (const [id, frame] of Object.entries(state)) expect(frame.mouldings, id).toBe(0);
  expect(errors).toEqual([]);
});

test('« ?cadres= » montre chaque famille dans son cadre en relief, l’œuvre en retrait', async ({ page }) => {
  const errors = await openMuseum(page, { museum: museum(), query: '&cadres=tableau:noir-filet-or,papier:baguette-chene,caisse:caisse-noire' });
  const state = await frames(page);
  // Tableau doré de 1,40 m : bois noir à filet doré, deux pièces, moulure agrandie de 12 %. La toile est derrière la moulure.
  expect(state['petite-fugue']).toEqual({ mouldings: 2, depth: 0.0672, canvas: 0.0224 });
  // Sous passe-partout : baguette de chêne ; l'estampe est derrière le carton, au fond de sa fenêtre biseautée.
  expect(state['midi-plein'].mouldings).toBe(1);
  expect(state['midi-plein'].depth).toBe(0.032);
  expect(state['midi-plein'].canvas).toBeCloseTo(0.012 - 0.0024, 4);
  // Toile au cadre du décor : caisse américaine, la toile un peu en retrait du bord de la caisse.
  expect(state['equilibre-no-7']).toEqual({ mouldings: 1, depth: 0.046, canvas: 0.04 });
  // Un objet accroché sans cadre le reste.
  expect(state['rive-gauche-rive-droite'].mouldings).toBe(0);

  // Une œuvre encadrée ainsi s'ouvre comme avant.
  await clickArtwork(page, 'petite-fugue', 3);
  await expect(panel(page)).toBeVisible();
  await expect(page.locator('#p-title')).toHaveText('Petite fugue');
  expect(errors).toEqual([]);
});

test('un modèle inconnu, ou une famille sans modèle, garde le cadre d’avant', async ({ page }) => {
  const errors = await openMuseum(page, { museum: museum(), query: '&cadres=tableau:inconnu,papier:baguette-noire' });
  const state = await frames(page);
  expect(state['petite-fugue'].mouldings).toBe(0);
  expect(state['equilibre-no-7'].mouldings).toBe(0);
  expect(state['midi-plein'].mouldings).toBe(1);
  expect(errors).toEqual([]);
});

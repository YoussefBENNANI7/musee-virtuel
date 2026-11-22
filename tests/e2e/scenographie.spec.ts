import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { clickArtwork, openMuseum, panel } from './helpers';

const fixture = () => JSON.parse(readFileSync(fileURLToPath(new URL('../fixtures/museum.json', import.meta.url)), 'utf8'));

/** Le musée de test, dont la rotonde est mise en scène : éclairage d'accent, cloche, zone au sol, lettrage mural. */
function staged(decor: unknown = { preset: 'nuit', light: { accents: 1 } }) {
  const museum = fixture();
  const room = museum.rooms.find((r: any) => r.id === 'rotonde');
  room.decor = decor;
  room.zones = [{ position: [0, 0], size: [3, 2], color: '#3a2618', border: '#b9944a' }];
  room.lettering = [
    { wall: 'north', offset: 0, text: { fr: 'Formes en liberté', en: 'Shapes set free' } },
    { wall: 'east', offset: 1, kind: 'text', width: 1.4, text: { fr: 'Cinq sculptures, réunies ici pour la première fois : chacune se regarde de tous les côtés, sous son propre faisceau.', en: 'Five sculptures, shown together for the first time: each can be seen from every side, under its own beam.' } },
  ];
  room.artworks.find((a: any) => a.id === 'galet-qui-respire').hood = true;
  return museum;
}

/** Ce que la scène contient, par nom d'élément de scénographie. */
const staging = (page: any) =>
  page.evaluate(() => {
    const count: Record<string, number> = {};
    const titles: { width: number; height: number; drawn: boolean }[] = [];
    (window as any).__museum.world.group.traverse((o: any) => {
      if (['accent', 'faisceau', 'cloche', 'zone', 'lettrage'].includes(o.name)) count[o.name] = (count[o.name] ?? 0) + 1;
      if (o.name === 'lettrage') titles.push({ width: o.scale.x, height: o.scale.y, drawn: Boolean(o.material.map) });
    });
    return { count, titles };
  });

test('une salle mise en scène : faisceaux sur les objets, cloche, zone au sol et lettrage mural', async ({ page }) => {
  const errors = await openMuseum(page, { museum: staged() });
  await expect(page.locator('#config-errors')).toBeHidden();
  const { count, titles } = await staging(page);
  // Cinq sculptures dans la rotonde : chacune a son éclairage d'accent ; une seule est sous cloche.
  expect(count).toEqual({ accent: 5, faisceau: 5, cloche: 1, zone: 1, lettrage: 2 });
  // Le titre tient sur une ligne, bien plus large que haute ; le texte est composé en paragraphe, sur 1,40 m au plus.
  const [title, text] = titles;
  expect(title.drawn && text.drawn).toBe(true);
  expect(title.width).toBeGreaterThan(title.height * 4);
  expect(text.width).toBeLessThanOrEqual(1.45);
  // Trop long pour une ligne : il passe sur plusieurs.
  expect(text.height).toBeGreaterThan(0.12);

  // Le lettrage suit la langue du visiteur.
  await page.selectOption('#lang', 'en');
  await expect.poll(async () => (await staging(page)).titles[0].width).not.toBeCloseTo(title.width, 2);

  // Sous sa cloche, l'objet s'ouvre toujours d'un clic.
  await clickArtwork(page, 'galet-qui-respire');
  await expect(panel(page)).toBeVisible();
  expect(errors).toEqual([]);
});

test('dans une salle claire, les objets gardent leur lumière d’accent, sans faisceau visible', async ({ page }) => {
  const errors = await openMuseum(page, { museum: staged({ preset: 'pierre-claire', light: { accents: 0.7 } }) });
  const { count } = await staging(page);
  expect(count.accent).toBe(5);
  expect(count.faisceau).toBeUndefined();
  expect(errors).toEqual([]);
});

test('sans mise en scène, rien de tout cela n’apparaît', async ({ page }) => {
  await openMuseum(page);
  expect((await staging(page)).count).toEqual({});
});

test('dans une rotonde : frise en panneaux, lettrage cintré sur le mur courbe, titre de vitrine', async ({ page }) => {
  const museum = fixture();
  const room = museum.rooms.find((r: any) => r.id === 'rotonde');
  room.rotunda = { dome: 0.3, safes: 0.6, niches: false, frieze: { from: 0.9, to: 2, color: '#d6c9ad', spans: [[70, 110], [250, 290]] } };
  room.lettering = [{ angle: 90, y: 2.2, height: 0.16, text: { fr: 'Le franc', en: 'The franc' } }];
  room.vitrines = [{ id: 'essai', position: [0, -2.2], title: { fr: 'Les origines', en: 'The origins' } }];
  // La rotonde ne laisse pas de place aux sculptures du milieu de la salle : on les retire pour l'essai.
  const gone = new Set(room.artworks.filter((a: any) => a.type === 'sculpture').map((a: any) => a.id));
  room.artworks = room.artworks.filter((a: any) => !gone.has(a.id));
  for (const tour of museum.tours ?? []) tour.stops = tour.stops.filter((id: string) => !gone.has(id));
  const errors = await openMuseum(page, { museum });
  const scene = await page.evaluate(() => {
    const found: Record<string, number> = {};
    const bends: number[] = [];
    (window as any).__museum.world.group.traverse((o: any) => {
      if (['frise', 'lettrage'].includes(o.name)) found[o.name] = (found[o.name] ?? 0) + 1;
      if (o.name === 'lettrage') {
        const p = o.geometry.attributes.position;
        let z = 0;
        for (let i = 0; i < p.count; i++) z = Math.max(z, p.getZ(i));
        bends.push(z);
      }
    });
    return { found, bends };
  });
  // Deux panneaux de frise ; un lettrage sur le mur courbe et un sur la vitrine.
  expect(scene.found).toEqual({ frise: 2, lettrage: 2 });
  // Le lettrage du mur courbe est cintré : ses bouts avancent vers la salle ; celui de la vitrine reste plan.
  expect(Math.max(...scene.bends)).toBeGreaterThan(0.001);
  expect(Math.min(...scene.bends)).toBe(0);
  expect(errors).toEqual([]);
});

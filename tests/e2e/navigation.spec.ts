import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { clickArtwork, holdClock, holdUntil, onWalkableGround, openMuseum, panel, position, roomName, slowFrames, teleport, walkUntilBlocked } from './helpers';

const WEST = Math.PI / 2; // regard vers l'ouest
const NORTH = 0;

test('le visiteur arrive dans la salle de départ, sans erreur', async ({ page }) => {
  const errors = await openMuseum(page);
  await expect(roomName(page)).toHaveText('Salle des Horizons');
  await expect(page.locator('#museum-name')).toHaveText('Musée des Horizons');
  expect(errors).toEqual([]);
});

test('le visiteur passe par les portes', async ({ page }) => {
  await openMuseum(page);
  await teleport(page, -4, 0, WEST);
  await holdUntil(page, 'KeyW', async () => (await roomName(page).textContent()) === 'Salon des Sculptures');

  await teleport(page, 3.5, -2, NORTH);
  await holdUntil(page, 'KeyW', async () => (await roomName(page).textContent()) === 'Cabinet des Couleurs');
});

test('un mur plein arrête le visiteur', async ({ page }) => {
  await openMuseum(page);
  await teleport(page, -4, 3, WEST);
  const stopped = await walkUntilBlocked(page);
  await expect(roomName(page)).toHaveText('Salle des Horizons');
  // Le mur ouest de la salle est en x = -6 : le visiteur s'arrête avant.
  expect(stopped.x).toBeGreaterThan(-6);
  expect(stopped.x).toBeLessThan(-5);
});

test('même quand les images sont lentes, le visiteur s’arrête au ras du mur, sans à-coups', async ({ page }) => {
  await openMuseum(page);
  await teleport(page, -4, 3, WEST);
  const frames = await slowFrames(page);
  await page.keyboard.down('KeyW');
  const path = await frames.stopped().finally(() => page.keyboard.up('KeyW'));
  // Cinq pas entiers de 24 cm, puis un sixième, plus court, qui l'amène au ras du mur (limite de marche en x = -5,40).
  // Aucune autre position ensuite : il ne s'approche pas du mur par à-coups.
  expect(path).toHaveLength(7);
  for (let i = 1; i <= 5; i++) expect(path[i].x, `pas n° ${i}`).toBeCloseTo(-4 - 0.24 * i, 6);
  expect(path[6].x).toBeGreaterThanOrEqual(-5.4);
  expect(path[6].x).toBeLessThan(-5.39);
});

test('le visiteur glisse le long du mur à côté d’une porte, sans la traverser en biais', async ({ page }) => {
  await openMuseum(page);
  // Face au mur nord, un mètre et demi à gauche de la porte.
  await teleport(page, 1.2, -2, NORTH);
  const stopped = await walkUntilBlocked(page);
  await expect(roomName(page)).toHaveText('Salle des Horizons');
  expect(stopped.z).toBeGreaterThan(-4.5);
});

test('le socle d’une sculpture arrête le visiteur', async ({ page }) => {
  await openMuseum(page);
  // Dans le salon, face à la sculpture centrale posée en (-10.5, 0).
  await teleport(page, -8, 0, WEST);
  const stopped = await walkUntilBlocked(page);
  expect(Math.hypot(stopped.x + 10.5, stopped.z)).toBeGreaterThan(0.7);
  expect(stopped.x).toBeGreaterThan(-10.5);
});

test('un banc arrête le visiteur, qui peut le contourner', async ({ page }) => {
  await openMuseum(page);
  // Dans la galerie, un banc est posé en (10, 3.6), allongé du nord au sud. On marche vers lui depuis l'ouest.
  await teleport(page, 7.5, 3.6, -WEST);
  const stopped = await walkUntilBlocked(page);
  expect(stopped.x).toBeGreaterThan(8.5);
  expect(stopped.x).toBeLessThan(9.8);
  // En se décalant au-delà du bout du banc, le passage est libre jusqu'au mur est (x = 14).
  await teleport(page, 7.5, 1.5, -WEST);
  const free = await walkUntilBlocked(page);
  expect(free.x).toBeGreaterThan(12.5);
});

test('face à une œuvre, le visiteur n’est jamais placé dans un banc', async ({ page }) => {
  await openMuseum(page);
  const walkable = (x: number, z: number) => page.evaluate(([x, z]) => (window as any).__museum.world.walkable(x, z), [x, z]);
  // « Ronds dans l'eau » est accroché sur le mur est (surface en x = 13,85), juste en face du banc :
  // à quatre mètres de recul, l'emplacement naturel du visiteur tombe sur le banc.
  expect(await walkable(13.85 - 4, 3.8)).toBe(false);
  for (const distance of [2, 3, 3.5, 4, 4.5, 5]) {
    await page.evaluate(([d]) => (window as any).__museum.standBefore('ronds-dans-l-eau', d), [distance]);
    const p = await position(page);
    expect(await walkable(p.x, p.z), `recul de ${distance} m`).toBe(true);
    expect(p.z).toBeCloseTo(3.8, 1);
  }
});

test('cliquer sur un tableau ouvre sa fiche et amène le visiteur devant', async ({ page }) => {
  await openMuseum(page);
  await clickArtwork(page, 'equilibre-no-7', 4.5);
  await expect(panel(page)).toBeVisible();
  await expect(page.locator('#p-title')).toHaveText('Équilibre n° 7');
  await expect(page.locator('#p-artist')).toHaveText('Hélène Varga');
  await expect(page.locator('#p-meta')).toContainText('150 × 200 cm');
  // Le visiteur se rapproche du mur nord (z = -4.5).
  const start = await position(page);
  await expect.poll(async () => (await position(page)).z, { timeout: 15_000 }).not.toBe(start.z);

  await page.keyboard.press('Escape');
  await expect(panel(page)).toBeHidden();
});

test('cliquer sur une sculpture ouvre sa fiche', async ({ page }) => {
  await openMuseum(page);
  await clickArtwork(page, 'noeud-sans-fin', 3);
  await expect(page.locator('#p-title')).toHaveText('Nœud sans fin');
  await expect(page.locator('#p-meta')).toContainText('H. 150 cm');
});

test('une œuvre cachée derrière un mur n’est pas cliquable', async ({ page }) => {
  await openMuseum(page);
  // Dans la salle principale, face à un mur plein derrière lequel se trouve une sculpture.
  await teleport(page, -3, -2.7, WEST);
  await page.waitForTimeout(400);
  await page.mouse.click(640, 400);
  await page.waitForTimeout(400);
  await expect(panel(page)).toBeHidden();
});

test('le plan transporte le visiteur dans la salle choisie', async ({ page }) => {
  await openMuseum(page);
  await page.click('#map-open');
  await expect(page.locator('#map .map-room')).toHaveCount(4);
  await page.getByRole('button', { name: 'Cabinet des Couleurs' }).click();
  await expect(roomName(page)).toHaveText('Cabinet des Couleurs');

  await page.click('#map-open');
  await page.getByRole('button', { name: 'Galerie des Lignes' }).click();
  await expect(roomName(page)).toHaveText('Galerie des Lignes');
});

test('la langue change les textes de l’interface et des œuvres', async ({ page }) => {
  await openMuseum(page);
  await clickArtwork(page, 'equilibre-no-7', 4.5);
  await page.selectOption('#lang', 'en');
  await expect(page.locator('#p-title')).toHaveText('Balance No. 7');
  await expect(page.locator('#museum-name')).toHaveText('Horizons Museum');
  await expect(page.locator('#map-open')).toHaveText('Map');
});

test('à l’arrêt, le musée ne redessine pas l’image', async ({ page }) => {
  await openMuseum(page);
  const frames = () => page.evaluate(() => (window as any).__museum.renderer.info.render.frame as number);
  await page.waitForTimeout(4500);
  const before = await frames();
  await page.waitForTimeout(1500);
  expect((await frames()) - before).toBe(0);
});

/** Vrai tant qu'un déplacement en douceur est en cours : marche vers un point du sol ou approche d'une œuvre. */
const gliding = (page: import('@playwright/test').Page) => page.evaluate(() => (window as any).__museum.controls.gliding as boolean);
/**
 * Clique sur un point du sol, donné par ses coordonnées dans le musée, et vérifie que le clic a lancé la marche.
 * Le visiteur ne bouge qu'à l'image suivante, qui peut tarder quand l'ordinateur est très chargé.
 */
async function clickFloor(page: import('@playwright/test').Page, x: number, z: number) {
  const p = await page.evaluate(([x, z]) => (window as any).__museum.screenAt(x, z), [x, z]);
  await page.mouse.click(p.x, p.y);
  await expect.poll(() => gliding(page), { message: 'le clic au sol aurait dû lancer la marche' }).toBe(true);
}
/**
 * Attend que le déplacement en cours soit terminé, et renvoie la position d'arrivée.
 * On attend que le moteur l'annonce fini, et non deux positions identiques de suite : quand une image tarde,
 * deux relevés rapprochés sont identiques avant même que le visiteur ait commencé à bouger.
 */
async function settle(page: import('@playwright/test').Page) {
  await expect.poll(() => gliding(page), { timeout: 20_000, message: 'le visiteur aurait dû arriver' }).toBe(false);
  return position(page);
}
const yaw = (page: import('@playwright/test').Page) => page.evaluate(() => (window as any).__museum.controls.yaw as number);
const markerVisible = (page: import('@playwright/test').Page) => page.evaluate(() => (window as any).__museum.marker.visible as boolean);

test('cliquer au sol amène le visiteur à cet endroit, sans changer la direction du regard', async ({ page }) => {
  const errors = await openMuseum(page);
  await teleport(page, 0, 2.5, NORTH);
  await page.waitForTimeout(300);
  // Le survol du sol montre déjà où mènerait le clic.
  const p = await page.evaluate(() => (window as any).__museum.screenAt(1.5, -1));
  await page.mouse.move(p.x, p.y);
  await expect.poll(() => markerVisible(page)).toBe(true);

  await clickFloor(page, 1.5, -1);
  const end = await settle(page);
  expect(end.x).toBeCloseTo(1.5, 1);
  expect(end.z).toBeCloseTo(-1, 1);
  expect(await yaw(page)).toBeCloseTo(NORTH, 3);
  await expect(roomName(page)).toHaveText('Salle des Horizons');
  expect(errors).toEqual([]);
});

test('un clic au sol au-delà d’un banc arrête le visiteur devant le banc', async ({ page }) => {
  await openMuseum(page);
  // Dans la galerie, le banc est posé en (10, 3.6). On vise le sol de l'autre côté, visible par-dessus.
  await teleport(page, 7.5, 3.6, -WEST);
  await page.waitForTimeout(300);
  await clickFloor(page, 12.5, 3.6);
  const end = await settle(page);
  expect(end.x).toBeGreaterThan(8.5);
  expect(end.x).toBeLessThan(9.8);
  // Arrivé, le repère du sol s'efface.
  await page.mouse.move(640, 200);
  await expect.poll(() => markerVisible(page)).toBe(false);
});

test('avec une fiche ouverte, un clic au sol la referme sans déplacer le visiteur', async ({ page }) => {
  await openMuseum(page);
  await clickArtwork(page, 'equilibre-no-7', 4.5);
  await expect(panel(page)).toBeVisible();
  const before = await settle(page);
  // En bas à gauche de l'écran : le sol, loin de la fiche.
  await page.mouse.click(200, 660);
  await expect(panel(page)).toBeHidden();
  expect(await gliding(page), 'le clic n’aurait dû lancer aucune marche').toBe(false);
  await page.waitForTimeout(600);
  const after = await position(page);
  expect(Math.hypot(after.x - before.x, after.z - before.z)).toBeLessThan(0.01);
});

/** Clique sur une œuvre telle qu'on la voit de là où l'on est, sans se placer devant. */
async function clickSeen(page: import('@playwright/test').Page, id: string) {
  const p = await page.evaluate((id) => (window as any).__museum.screenOf(id), id);
  await page.mouse.click(p.x, p.y);
}

test('interrompu dans l’épaisseur d’un mur par un glissement de la vue, le visiteur en sort de lui-même et peut marcher', async ({ page }) => {
  const errors = await openMuseum(page);
  // Dans le hall, à gauche de la porte du cabinet. Par elle, on voit « Zellige imaginaire », accroché au mur est du cabinet.
  await teleport(page, -0.5, 2, Math.atan2(-5.35, 10.5));
  await page.waitForTimeout(300);
  const clock = await holdClock(page);
  await clickSeen(page, 'zellige-imaginaire');
  await expect(page.locator('#p-title')).toHaveText('Zellige imaginaire');

  // Le visiteur est emmené devant l'œuvre en ligne droite : il passe par le mur, à côté de la porte.
  await clock.untilOutside();
  expect(await onWalkableGround(page)).toBe(false);
  const inWall = await position(page);
  expect(inWall.z).toBeLessThan(-3.9);
  expect(inWall.z).toBeGreaterThan(-5.1);

  // À cet instant, il fait glisser la vue, à gauche de la fiche.
  const before = await yaw(page);
  await page.mouse.move(300, 300);
  await page.mouse.down();
  await page.mouse.move(380, 300, { steps: 4 });
  await page.mouse.up();
  // Le regard a tourné aussitôt ; les pieds finissent de traverser, en un quart de seconde au plus.
  expect(await yaw(page)).toBeGreaterThan(before + 0.1);
  expect(await gliding(page)).toBe(true);
  expect(await clock.untilArrived()).toBeLessThanOrEqual(0.25 + 1 / 60);
  // Il s'arrête au premier endroit praticable de son trajet : la limite de marche du cabinet (z = -5,10).
  expect(await onWalkableGround(page)).toBe(true);
  const stop = await position(page);
  expect(stop.z).toBeLessThanOrEqual(-5.1);
  expect(stop.z).toBeGreaterThan(-5.1 - 0.00001);

  // Et il peut marcher. Avant la correction, il restait dans le mur, et aucune touche ne l'en sortait.
  await clock.release();
  await holdUntil(page, 'KeyW', async () => {
    const now = await position(page);
    return Math.hypot(now.x - stop.x, now.z - stop.z) > 1;
  });
  expect(await onWalkableGround(page)).toBe(true);
  await expect(roomName(page)).toHaveText('Cabinet des Couleurs');
  expect(errors).toEqual([]);
});

test('interrompu dans la zone d’un socle par une touche, le visiteur en sort de lui-même et peut marcher', async ({ page }) => {
  await openMuseum(page);
  // Dans le salon, le « Nocturne » est accroché au mur ouest. Vu d'ici, le chemin qui y mène en ligne droite
  // passe par la zone réservée autour du socle central, posé en (-10,5 ; 0).
  await teleport(page, -7.5, 1.5, Math.atan2(7.35, 1.5));
  await page.waitForTimeout(300);
  const clock = await holdClock(page);
  await clickSeen(page, 'nocturne-en-quatre-temps');
  await expect(page.locator('#p-title')).toHaveText('Nocturne en quatre temps');
  // Fiche refermée, le clavier revient à la visite ; le déplacement continue.
  await page.keyboard.press('Escape');
  await expect(panel(page)).toBeHidden();
  const fromCentre = async () => {
    const p = await position(page);
    return Math.hypot(p.x + 10.5, p.z);
  };
  const radius = await page.evaluate(() => (window as any).__museum.world.artworks.find((a: any) => a.config.id === 'noeud-sans-fin').obstacle.r as number);

  await clock.untilOutside();
  expect(await onWalkableGround(page)).toBe(false);
  expect(await fromCentre()).toBeLessThan(radius);

  // À cet instant, il appuie sur la touche « avancer ».
  await page.keyboard.down('KeyW');
  try {
    expect(await clock.untilArrived()).toBeLessThanOrEqual(0.25 + 1 / 60);
    // Il s'arrête au ras de la zone du socle, de l'autre côté.
    expect(await onWalkableGround(page)).toBe(true);
    expect(await fromCentre()).toBeGreaterThanOrEqual(radius);
    expect(await fromCentre()).toBeLessThan(radius + 0.00001);
    const stop = await position(page);
    expect(stop.x).toBeLessThan(-10.5);
    // La touche toujours enfoncée, il marche.
    await clock.release();
    await expect.poll(async () => Math.hypot((await position(page)).x - stop.x, (await position(page)).z - stop.z)).toBeGreaterThan(0.5);
  } finally {
    await page.keyboard.up('KeyW');
  }
  expect(await onWalkableGround(page)).toBe(true);
});

test('le mini-plan suit le visiteur et ouvre le plan complet', async ({ page }) => {
  await openMuseum(page);
  const mini = page.locator('#minimap');
  await expect(mini).toBeVisible();
  await expect(mini.locator('.map-room')).toHaveCount(4);
  await expect(mini.locator('.map-room.current')).toHaveCount(1);

  await teleport(page, -10.5, 2, NORTH);
  await expect(roomName(page)).toHaveText('Salon des Sculptures');
  await expect(mini.locator('.map-you')).toHaveAttribute('transform', /translate\(-10\.50 2\.00\)/);

  await mini.click();
  await expect(page.locator('#map')).toBeVisible();
  await expect(page.locator('#map-title')).toHaveText('Plan du musée');
});

test('une sculpture s’examine seule, sous tous les angles, puis la visite reprend où elle en était', async ({ page }) => {
  const errors = await openMuseum(page);
  await clickArtwork(page, 'noeud-sans-fin', 3);
  await expect(page.locator('#p-title')).toHaveText('Nœud sans fin');
  const button = page.locator('#p-zoom');
  await expect(button).toHaveText('Examiner');
  const before = await settle(page);

  await button.click();
  const viewer = page.locator('#inspect');
  await expect(viewer).toBeVisible();
  await expect(panel(page)).toBeHidden();
  const state = () => page.evaluate(() => ({ ...(window as any).__museum.inspect.state }));
  const start = await state();
  // Elle est vraiment seule : aucune des cinq autres sculptures du salon n'est sur le calque montré.
  const shown = () =>
    page.evaluate(() =>
      (window as any).__museum.world.artworks
        .filter((a: any) => a.shape && a.shape.layers.isEnabled(1))
        .map((a: any) => a.config.id as string),
    );
  expect(await shown()).toEqual(['noeud-sans-fin']);

  // Glisser fait tourner autour de la sculpture ; la molette approche.
  await page.mouse.move(500, 400);
  await page.mouse.down();
  await page.mouse.move(650, 340, { steps: 5 });
  await page.mouse.up();
  const turned = await state();
  expect(Math.abs(turned.yaw - start.yaw)).toBeGreaterThan(0.5);
  expect(turned.pitch).not.toBeCloseTo(start.pitch, 2);
  expect(turned.spinning).toBe(false);
  await page.mouse.wheel(0, -400);
  await expect.poll(async () => (await state()).distance).toBeLessThan(start.distance - 0.1);
  // Le clavier aussi, sans déplacer le visiteur resté dans la salle.
  await page.keyboard.press('ArrowLeft');
  expect((await state()).yaw).not.toBeCloseTo(turned.yaw, 3);

  await page.keyboard.press('Escape');
  await expect(viewer).toBeHidden();
  await expect(panel(page)).toBeVisible();
  expect(await shown()).toEqual([]);
  const after = await position(page);
  expect(Math.hypot(after.x - before.x, after.z - before.z)).toBeLessThan(0.01);
  expect(errors).toEqual([]);
});

test('le commentaire continue pendant qu’on examine une sculpture', async ({ page }) => {
  await openMuseum(page, { spySpeech: true });
  await clickArtwork(page, 'noeud-sans-fin', 3);
  await page.locator('#p-audio').click();
  await expect(page.locator('#p-audio')).toHaveText('Arrêter la lecture');
  const playing = () => page.evaluate(() => (window as any).__museum.world && document.querySelector('#p-audio')!.getAttribute('aria-pressed'));
  await page.locator('#p-zoom').click();
  await expect(page.locator('#inspect')).toBeVisible();
  expect(await playing()).toBe('true');
  // Refermer l'examen ne coupe pas non plus la lecture : le bouton d'arrêt est de nouveau sous la main.
  await page.keyboard.press('Escape');
  await expect(page.locator('#inspect')).toBeHidden();
  await expect(page.locator('#p-audio')).toHaveText('Arrêter la lecture');
});

test('la présentation de la salle accompagne le visiteur : il marche, ouvre une œuvre, change de salle', async ({ page }) => {
  // La salle de départ et le cabinet ont chacun une présentation ; le salon des sculptures n'en a pas.
  const museum = JSON.parse(readFileSync(fileURLToPath(new URL('../fixtures/museum.json', import.meta.url)), 'utf8'));
  museum.rooms.find((r: any) => r.id === 'hall').intro = { text: { fr: 'Ici commence la visite.', en: 'The visit starts here.' } };
  museum.rooms.find((r: any) => r.id === 'cabinet').intro = { text: { fr: 'Un cabinet de couleurs.', en: 'A cabinet of colours.' } };
  const errors = await openMuseum(page, { spySpeech: true, museum });
  const intro = page.locator('#room-intro');
  const spoken = () => page.evaluate(() => (window as any).__spoken.map((s: { text: string }) => s.text) as string[]);

  await expect(intro).toHaveText('Écouter la présentation de la salle');
  await intro.click();
  await expect(intro).toHaveText('Arrêter la lecture');
  expect(await spoken()).toEqual(['Salle des Horizons. Ici commence la visite.']);

  // Le bouton vient d'être cliqué : les touches déplacent quand même le visiteur, sans rien couper.
  const start = await position(page);
  await holdUntil(page, 'ArrowUp', async () => {
    const now = await position(page);
    return Math.hypot(now.x - start.x, now.z - start.z) > 1;
  });
  await expect(intro).toHaveAttribute('aria-pressed', 'true');

  // Ouvrir une œuvre, puis refermer sa fiche : la présentation continue.
  await clickArtwork(page, 'le-pays-d-avant', 3);
  await expect(panel(page)).toBeVisible();
  await expect(intro).toHaveAttribute('aria-pressed', 'true');
  await page.keyboard.press('Escape');
  await expect(panel(page)).toBeHidden();
  await expect(intro).toHaveAttribute('aria-pressed', 'true');

  // Dans une salle sans présentation, le bouton reste là tant que la lecture dure, pour pouvoir l'arrêter.
  await teleport(page, -10.5, 0, WEST);
  await expect(roomName(page)).toHaveText('Salon des Sculptures');
  await expect(intro).toHaveText('Arrêter la lecture');
  await intro.click();
  await expect(intro).toBeHidden();

  // Une seule voix à la fois : le commentaire d'une œuvre remplace la présentation de la salle.
  await teleport(page, 0, 2.5, NORTH);
  await expect(roomName(page)).toHaveText('Salle des Horizons');
  await intro.click();
  await expect(intro).toHaveAttribute('aria-pressed', 'true');
  await clickArtwork(page, 'le-pays-d-avant', 3);
  await page.locator('#p-audio').click();
  await expect(page.locator('#p-audio')).toHaveText('Arrêter la lecture');
  await expect(intro).toHaveText('Écouter la présentation de la salle');
  // Et la présentation d'une autre salle remplace celle qui se lit encore.
  await page.keyboard.press('Escape');
  await intro.click();
  await teleport(page, 0, -8.5, NORTH);
  await expect(roomName(page)).toHaveText('Cabinet des Couleurs');
  await expect(intro).toHaveText('Arrêter la lecture');
  await intro.click();
  await expect(intro).toHaveText('Écouter la présentation de la salle');
  await intro.click();
  expect((await spoken()).at(-1)).toBe('Cabinet des Couleurs. Un cabinet de couleurs.');
  expect(errors).toEqual([]);
});

test('un musée sans fontaine n’a pas de bouton de son', async ({ page }) => {
  await openMuseum(page);
  await expect(page.locator('#sound')).toBeHidden();
  await expect(page.locator('#carnet-open')).toBeVisible();
});

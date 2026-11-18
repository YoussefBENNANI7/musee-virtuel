import { expect, test, type Page } from '@playwright/test';
import { existsSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const museums = fileURLToPath(new URL('../../public/museums/', import.meta.url));
const trash = fileURLToPath(new URL('../../musees-supprimes/', import.meta.url));
const photo = readFileSync(fileURLToPath(new URL('../fixtures/image.webp', import.meta.url)));
const file = (name: string) => ({ name, mimeType: 'image/webp', buffer: photo });
const onDisk = (id: string) => JSON.parse(readFileSync(`${museums}${id}/museum.json`, 'utf8'));

/** Les musées créés par ces tests commencent par « essai- » : on les retire du disque après chaque test. */
function clean() {
  for (const id of readdirSync(museums)) if (id.startsWith('essai-')) rmSync(`${museums}${id}`, { recursive: true, force: true });
  for (const id of existsSync(trash) ? readdirSync(trash) : []) if (id.startsWith('essai-')) rmSync(`${trash}${id}`, { recursive: true, force: true });
}
test.beforeAll(clean);
test.afterEach(clean);

const saved = (page: Page) => expect(page.locator('#status')).toHaveText('Enregistré', { timeout: 30_000 });

/**
 * Remplace l'aperçu en 3D par une page vide. Sans carte graphique, chaque rechargement de l'aperçu
 * coûte une quinzaine de secondes aux tests ; ceux qui ne vérifient que l'éditeur s'en passent.
 */
const withoutPreview = (page: Page) => page.route(/\/\?m=[^&]+&apercu=1/, (route) => route.fulfill({ contentType: 'text/html', body: '<!doctype html><title>Aperçu coupé</title>' }));

/** Crée un musée depuis l'accueil de l'éditeur et renvoie son identifiant. */
async function create(page: Page, plan: string) {
  const name = `Essai automatique ${Date.now()}`;
  await page.goto('/editeur.html');
  await page.fill('#new-name', name);
  await page.click(`[data-plan="${plan}"]`);
  await page.click('#create button[type=submit]');
  await expect(page.locator('#drop')).toBeVisible();
  const id = new URL(page.url()).searchParams.get('m')!;
  expect(id).toMatch(/^essai-automatique-\d+$/);
  return { id, name };
}

test('créer un musée, y déposer des photos : elles s’accrochent seules et le musée s’ouvre', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto('/editeur.html');
  // L'accueil liste les musées du dossier, dont la démonstration.
  await expect(page.locator('.museums strong', { hasText: 'Musée des Horizons' })).toBeVisible();
  await expect(page.locator('.plan-card')).toHaveCount(4);

  const { id, name } = await create(page, 'enfilade');
  await expect(page.locator('#museum-title')).toHaveText(name);
  expect(onDisk(id)).toMatchObject({ id, name: { fr: name }, langs: ['fr'] });
  expect(onDisk(id).rooms).toHaveLength(3);

  // Trois photos déposées : trois œuvres, réparties sur les murs sans rien régler.
  await page.setInputFiles('#photos', [file('portrait de famille.webp'), file('IMG_2041.webp'), file('nature_morte.webp')]);
  // Sans carte graphique, le premier chargement de l'aperçu en 3D occupe la page une vingtaine de
  // secondes quand un autre test dessine en même temps : le dépôt attend la fin de ce chargement.
  await expect(page.locator('.work')).toHaveCount(3, { timeout: 60_000 });
  await saved(page);
  // Les œuvres sont rangées par mur : l'ordre à l'écran n'est pas celui du dépôt.
  expect((await page.locator('.work-title').allInnerTexts()).sort()).toEqual(['Nature morte', 'Portrait de famille', 'Sans titre']);
  const works = onDisk(id).rooms[0].artworks;
  expect(works.map((a: any) => a.id)).toEqual(['portrait-de-famille', 'oeuvre', 'nature-morte']);
  for (const art of works) {
    expect(art).toMatchObject({ type: 'painting', height: 0.7, image: { width: 300, height: 450 } });
    // Proportions de la photo respectées : 300 × 450 pixels.
    expect(art.width).toBeCloseTo(0.467, 2);
    for (const path of [art.image.src, `images/sources/${art.id}.jpg`, art.image.src.replace('images/', 'images/web/').replace('.jpg', '-450.webp')]) {
      expect(existsSync(`${museums}${id}/${path}`), path).toBe(true);
    }
  }
  // Deux œuvres ne partagent jamais un mur au même endroit.
  const places = works.map((a: any) => `${a.wall}:${a.offset}`);
  expect(new Set(places).size).toBe(3);

  // Le vrai musée s'ouvre dans l'aperçu, sans erreur de configuration.
  const preview = page.frameLocator('#preview');
  await expect(preview.locator('#museum-name')).toHaveText(name, { timeout: 60_000 });
  await expect(preview.locator('#config-errors')).toBeHidden();
  await expect(preview.locator('#welcome')).toHaveCount(0);
  // Une modification enregistrée se voit dans l'aperçu dès que le champ est quitté.
  await page.locator('#tabs button', { hasText: 'Musée' }).click();
  await page.locator('label.field', { hasText: 'Nom du musée' }).locator('input').first().fill('Essai renommé');
  await page.locator('#tabs button', { hasText: 'Œuvres' }).click();
  await saved(page);
  expect(onDisk(id).name.fr).toBe('Essai renommé');
  await expect(preview.locator('#museum-name')).toHaveText('Essai renommé', { timeout: 60_000 });
  // Les cartels restent à remplir : l'éditeur le dit en clair, une ligne par œuvre.
  await page.locator('#tabs button', { hasText: 'À compléter (3)' }).click();
  await expect(page.locator('.issues li')).toHaveCount(3);
  await expect(page.locator('.issues li').first()).toContainText('Œuvre « Portrait de famille » · à renseigner : technique, commentaire, artiste');
  expect(errors).toEqual([]);
});

test('remplir un cartel, changer la taille, le mur et la salle d’une œuvre', async ({ page }) => {
  await withoutPreview(page);
  const { id } = await create(page, 'enfilade');
  await page.setInputFiles('#photos', [file('marine.webp'), file('paysage.webp')]);
  await expect(page.locator('.work')).toHaveCount(2);
  await saved(page);

  await page.locator('.work-title', { hasText: 'Marine' }).click();
  const input = (label: string) => page.locator('label.field', { hasText: label }).locator('input, textarea, select').first();
  await input('Titre').fill('Marine au couchant');
  await expect(page.locator('#work-title')).toHaveText('Marine au couchant');
  await input('Artiste').fill('Anonyme');
  await input('Date').fill('vers 1900');
  await input('Technique').fill('Huile sur toile');
  await input('Commentaire').fill('Une mer calme, peu avant la nuit.');
  // La vraie taille de l'œuvre : la largeur suit les proportions de la photo.
  await input('Hauteur (cm)').fill('120');
  await input('Hauteur (cm)').blur();
  await expect(input('Largeur (cm)')).toHaveValue('80');
  await saved(page);
  const art = () => [...onDisk(id).rooms.flatMap((r: any) => r.artworks), ...onDisk(id).reserve].find((a: any) => a.id === 'marine');
  expect(art()).toMatchObject({ title: { fr: 'Marine au couchant' }, artist: 'Anonyme', year: 'vers 1900', medium: { fr: 'Huile sur toile' }, description: { fr: 'Une mer calme, peu avant la nuit.' }, height: 1.2, width: 0.8 });
  // Une mention laissée vide ne laisse aucune trace dans la configuration.
  expect(art().credit).toBeUndefined();

  // Cadre doré, puis changement de salle depuis la fiche.
  await input('Cadre').selectOption('gilt');
  await saved(page);
  expect(art().frame).toBe('gilt');
  await page.locator('label.field:has(> span:text-is("Salle")) select').selectOption('salle-2');
  await saved(page);
  expect(onDisk(id).rooms[1].artworks.map((a: any) => a.id)).toEqual(['marine']);

  // Retour à la liste : l'autre œuvre change de mur, puis part en réserve.
  await page.locator('.back').click();
  await page.locator('#room-select').selectOption('salle-1');
  const row = page.locator('.work', { hasText: 'Paysage' });
  const before = onDisk(id).rooms[0].artworks[0].wall;
  const other = before === 'north' ? 'south' : 'north';
  await row.locator('select').selectOption(other);
  await saved(page);
  expect(onDisk(id).rooms[0].artworks[0].wall).toBe(other);
  await page.locator('.work', { hasText: 'Paysage' }).locator('select').selectOption('reserve');
  await saved(page);
  expect(onDisk(id).rooms[0].artworks).toEqual([]);
  expect(onDisk(id).reserve.map((a: any) => a.id)).toEqual(['paysage']);
  await expect(page.locator('.reserve .work')).toHaveCount(1);

  // « Annuler » remet l'œuvre sur son mur.
  await page.locator('#undo').click();
  await saved(page);
  expect(onDisk(id).rooms[0].artworks.map((a: any) => a.id)).toEqual(['paysage']);
});

test('recadrer une photo change son image et ses proportions, sans perdre l’originale', async ({ page }) => {
  await withoutPreview(page);
  const { id } = await create(page, 'une-salle');
  await page.setInputFiles('#photos', [file('affiche.webp')]);
  await expect(page.locator('.work')).toHaveCount(1);
  await saved(page);
  const first = onDisk(id).rooms[0].artworks[0];

  await page.locator('.work-title').click();
  await page.locator('#crop-open').click();
  await expect(page.locator('#crop')).toBeVisible();
  await expect.poll(() => page.locator('#crop-img').evaluate((img: HTMLImageElement) => img.naturalWidth)).toBe(300);
  // On tire le coin bas-droit vers le centre : il ne reste que le quart haut-gauche, à peu près.
  const box = (await page.locator('#crop-box').boundingBox())!;
  const image = (await page.locator('#crop-img').boundingBox())!;
  await page.mouse.move(box.x + box.width, box.y + box.height);
  await page.mouse.down();
  await page.mouse.move(image.x + image.width / 2, image.y + image.height / 4, { steps: 6 });
  await page.mouse.up();
  await page.locator('#crop-apply').click();
  await expect(page.locator('#crop')).toBeHidden();
  await saved(page);

  const cropped = onDisk(id).rooms[0].artworks[0];
  expect(cropped.image.src).not.toBe(first.image.src);
  expect(cropped.image.width).toBeLessThan(160);
  expect(cropped.image.height).toBeLessThan(120);
  // La hauteur de l'œuvre est gardée, sa largeur suit le nouveau cadrage.
  expect(cropped.height).toBe(first.height);
  expect(cropped.width / cropped.height).toBeCloseTo(cropped.image.width / cropped.image.height, 2);
  expect(existsSync(`${museums}${id}/${cropped.image.src}`)).toBe(true);
  expect(existsSync(`${museums}${id}/images/sources/affiche.jpg`)).toBe(true);

  // « Garder toute la photo » revient à l'image entière.
  await page.locator('#crop-open').click();
  await page.locator('#crop-full').click();
  await saved(page);
  expect(onDisk(id).rooms[0].artworks[0].image).toMatchObject({ width: 300, height: 450 });
});

test('une salle pleine range le surplus en réserve, et les salles changent de nom et de décor', async ({ page }) => {
  const { id } = await create(page, 'une-salle');
  // Cinquante-cinq photos pour une seule salle : toutes ne tiennent pas.
  await page.setInputFiles('#photos', Array.from({ length: 55 }, (_, i) => file(`toile ${i + 1}.webp`)));
  await expect(page.locator('#notice')).toContainText('La salle est pleine', { timeout: 60_000 });
  await saved(page);
  const museum = onDisk(id);
  expect(museum.rooms[0].artworks.length).toBeGreaterThan(30);
  expect(museum.reserve.length).toBeGreaterThan(0);
  expect(museum.rooms[0].artworks.length + museum.reserve.length).toBe(55);
  await expect(page.locator('.reserve .work')).toHaveCount(museum.reserve.length);
  await expect(page.frameLocator('#preview').locator('#config-errors')).toBeHidden();

  // Une fiche ouverte depuis le bas d'une longue liste s'affiche en haut ; le retour retrouve la liste au même endroit.
  const scrolled = () => page.locator('#pane').evaluate((pane) => pane.scrollTop);
  const title = page.locator('.work-title', { hasText: 'Toile 20' }).first();
  await title.scrollIntoViewIfNeeded();
  const before = await scrolled();
  expect(before).toBeGreaterThan(200);
  await title.click();
  await expect(page.locator('.back')).toBeInViewport();
  expect(await scrolled()).toBe(0);
  await page.locator('.back').click();
  expect(await scrolled()).toBe(before);

  await page.locator('#tabs button', { hasText: 'Salles' }).click();
  await expect(page.locator('#pane h2').first()).toBeInViewport();
  await page.locator('.card label.field', { hasText: 'Nom de la salle' }).locator('input').fill('Salle des paysages');
  await page.locator('.card label.field', { hasText: 'Décor' }).locator('select').selectOption('nuit');
  await saved(page);
  expect(onDisk(id).rooms[0]).toMatchObject({ name: { fr: 'Salle des paysages' }, decor: 'nuit' });

  // L'anglais s'ajoute d'une case : chaque texte reçoit alors un second champ.
  await page.locator('#tabs button', { hasText: 'Musée' }).click();
  await page.locator('label.check input').check();
  await saved(page);
  expect(onDisk(id).langs).toEqual(['fr', 'en']);
  await expect(page.locator('label.field', { hasText: 'Nom du musée (anglais)' })).toBeVisible();
});

test('supprimer un musée le retire de la liste et range son dossier à part', async ({ page }) => {
  await withoutPreview(page);
  const { id, name } = await create(page, 'une-salle');
  await page.goto('/editeur.html');
  const row = page.locator('.museums li', { hasText: name });
  await expect(row).toBeVisible();
  // La démonstration n'a pas de bouton de suppression.
  await expect(page.locator('.museums li', { hasText: 'Musée des Horizons' }).locator('button')).toHaveCount(0);

  // On change d'avis : rien ne bouge.
  await row.locator('button', { hasText: 'Supprimer' }).click();
  await page.locator('dialog.confirm button.cancel').click();
  await expect(page.locator('dialog.confirm')).toHaveCount(0);
  await expect(row).toBeVisible();
  expect(existsSync(`${museums}${id}/museum.json`)).toBe(true);

  // On confirme : le musée quitte la liste et le site, son dossier est gardé à part.
  await row.locator('button', { hasText: 'Supprimer' }).click();
  await expect(page.locator('dialog.confirm')).toContainText(name);
  await page.locator('dialog.confirm button.accept').click();
  await expect(page.locator('#notice')).toContainText(`« ${name} » est supprimé`);
  await expect(page.locator('.museums li', { hasText: name })).toHaveCount(0);
  expect(existsSync(`${museums}${id}`)).toBe(false);
  expect(readdirSync(trash).filter((f) => f.startsWith(`${id}-`))).toHaveLength(1);
});

test('ouvrir le musée de démonstration dans l’éditeur ne le modifie pas', async ({ page }) => {
  const path = `${museums}demo/museum.json`;
  const before = readFileSync(path, 'utf8');
  await page.goto('/editeur.html?m=demo');
  await expect(page.locator('#museum-title')).toHaveText('Musée des Horizons');
  // Ses œuvres ont été placées à la main : l'éditeur le dit et garde leur emplacement.
  await expect(page.locator('.callout')).toContainText('placées à la main');
  await expect(page.locator('#drop')).toHaveCount(0);
  await expect(page.locator('.work').first()).toBeVisible();
  // On regarde une fiche, les salles, le contrôle : rien n'est écrit sur le disque.
  await page.locator('.work-title').first().click();
  await expect(page.locator('#work-title')).not.toBeEmpty();
  await page.locator('#tabs button', { hasText: 'Salles' }).click();
  await page.locator('#tabs button', { hasText: /Contrôle|compléter/ }).click();
  await page.waitForTimeout(1500);
  expect(readFileSync(path, 'utf8')).toBe(before);
});

test('le service de l’éditeur refuse ce qui ne vient pas de sa page', async ({ request }) => {
  // Sans l'en-tête de l'éditeur : refus. Un autre site ne peut donc rien écrire sur l'ordinateur.
  const bare = await request.put('/__editeur/museums/essai-refus', { data: { rooms: [] } });
  expect(bare.status()).toBe(403);
  expect(existsSync(`${museums}essai-refus`)).toBe(false);
  const headers = { 'X-Musee-Editeur': '1' };
  // Un identifiant qui chercherait à sortir du dossier des musées.
  for (const id of ['..%2Fpirate', 'Mauvais', 'a.b']) {
    expect((await request.put(`/__editeur/museums/${id}`, { headers, data: { rooms: [] } })).status(), id).toBe(400);
  }
  expect((await request.post('/__editeur/museums/essai-refus/images/..%2Fx', { headers, data: 'x' })).status()).toBe(400);
  expect((await request.post('/__editeur/museums/essai-refus/images/toile', { headers, data: 'pas une image' })).status()).toBe(415);
  expect((await request.put('/__editeur/museums/essai-refus', { headers, data: { sans: 'salles' } })).status()).toBe(400);
  // La démonstration ne se supprime pas, même avec l'en-tête de l'éditeur ; sans lui, rien ne se supprime.
  expect((await request.delete('/__editeur/museums/demo', { headers })).status()).toBe(403);
  expect((await request.delete('/__editeur/museums/demo')).status()).toBe(403);
  expect(existsSync(`${museums}demo/museum.json`)).toBe(true);
});

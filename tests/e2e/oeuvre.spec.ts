import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { clickArtwork, openMuseum, panel, roomName } from './helpers';

const fixture = () => JSON.parse(readFileSync(fileURLToPath(new URL('../fixtures/museum.json', import.meta.url)), 'utf8'));

/** Le musée de test, avec deux détails commentés sur « Portée », seul tableau fourni en fichier image. */
function withDetails() {
  const museum = fixture();
  const portee = museum.rooms.flatMap((r: any) => r.artworks).find((a: any) => a.id === 'portee');
  portee.details = [
    { at: [0.25, 0.3], title: { fr: 'La première ligne', en: 'The first line' }, text: { fr: 'Elle part du bord gauche.', en: 'It starts from the left edge.' } },
    { at: [0.8, 0.7], title: { fr: 'Le point final', en: 'The final dot' }, text: { fr: 'Il ferme la portée.', en: 'It closes the staff.' } },
  ];
  return museum;
}

test('les détails commentés d’un tableau se découvrent dans son agrandissement', async ({ page }) => {
  const errors = await openMuseum(page, { museum: withDetails() });
  await clickArtwork(page, 'portee', 3);
  const button = page.locator('#p-zoom');
  await expect(button).toHaveText('Explorer les détails');
  await button.click();
  await expect(page.locator('#zoom')).toBeVisible();
  const dots = page.locator('.zoom-dot');
  await expect(dots).toHaveCount(2);
  await expect(page.locator('#zoom-detail')).toBeHidden();
  await expect(page.locator('#zoom-hint')).toContainText('Touchez un point numéroté');

  // Un point : l'image s'approche du détail, qui vient vers le centre de l'écran, et son texte s'affiche.
  await dots.nth(0).click();
  await expect(page.locator('#zoom-detail-count')).toHaveText('Détail 1 sur 2');
  await expect(page.locator('#zoom-detail-title')).toHaveText('La première ligne');
  await expect(page.locator('#zoom-detail-text')).toHaveText('Elle part du bord gauche.');
  await expect(page.locator('#zoom-detail-prev')).toBeDisabled();
  const scaleOf = () => page.locator('#zoom-sheet').evaluate((el) => new DOMMatrix(getComputedStyle(el).transform).a);
  await expect.poll(scaleOf).toBeCloseTo(3, 1);
  // L'image de test est petite : même grossie, elle tient à l'écran et reste donc centrée, le détail bien visible.
  await expect(dots.nth(0)).toBeInViewport();
  // Le point garde sa taille à l'écran, malgré le grossissement.
  expect((await dots.nth(0).boundingBox())!.width).toBeCloseTo(34, 0);

  await page.locator('#zoom-detail-next').click();
  await expect(page.locator('#zoom-detail-title')).toHaveText('Le point final');
  await expect(page.locator('#zoom-detail-next')).toBeDisabled();
  await page.locator('#zoom-detail-all').click();
  await expect(page.locator('#zoom-detail')).toBeHidden();
  await expect.poll(scaleOf).toBeCloseTo(1, 1);

  await page.keyboard.press('Escape');
  await expect(page.locator('#zoom')).toBeHidden();
  await expect(panel(page)).toBeVisible();
  expect(errors).toEqual([]);
});

test('sans détails, le tableau s’agrandit comme avant ; la vue simplifiée liste les détails', async ({ page }) => {
  await openMuseum(page);
  await clickArtwork(page, 'portee', 3);
  await expect(page.locator('#p-zoom')).toHaveText('Agrandir');
  await page.locator('#p-zoom').click();
  await expect(page.locator('.zoom-dot')).toHaveCount(0);

  await openMuseum(page, { museum: withDetails(), query: '&vue=simple' });
  const card = page.locator('#art-portee');
  await expect(card.locator('.details-title')).toHaveText('Détails à regarder');
  await expect(card.locator('.details li')).toHaveText(['La première ligne : Elle part du bord gauche.', 'Le point final : Il ferme la portée.']);
});

/** Le musée de test, où « Portée » a un verso, comme un billet de banque. */
function withBack() {
  const museum = fixture();
  const portee = museum.rooms.flatMap((r: any) => r.artworks).find((a: any) => a.id === 'portee');
  portee.back = { src: 'images/portee-verso.webp' };
  return museum;
}

test('une œuvre à deux faces se retourne dans son agrandissement, au bouton comme au clavier', async ({ page }) => {
  const errors = await openMuseum(page, { museum: withBack() });
  await clickArtwork(page, 'portee', 3);
  await expect(page.locator('#p-zoom')).toHaveText('Agrandir et retourner');
  await page.locator('#p-zoom').click();
  const img = page.locator('#zoom-img');
  const flip = page.locator('#zoom-flip');
  await expect(flip).toBeVisible();
  await expect(flip).toHaveAttribute('aria-label', 'Retourner');
  await expect(page.locator('#zoom-face')).toHaveText('Recto');
  await expect(img).toHaveAttribute('src', /images\/portee\.webp$/);
  await expect(page.locator('#zoom-hint')).toContainText('pour retourner');

  await flip.click();
  await expect(page.locator('#zoom-face')).toHaveText('Verso');
  await expect(img).toHaveAttribute('src', /images\/portee-verso\.webp$/);
  await expect(img).toHaveAttribute('alt', /: Verso$/);
  await expect(flip).toHaveAttribute('aria-pressed', 'true');
  // L'œuvre revient de face : le retournement terminé, elle n'est plus de profil.
  const turning = () => page.locator('#zoom-sheet').evaluate((el) => el.classList.contains('flip') || el.style.transform.includes('rotateY'));
  await expect.poll(turning).toBe(false);

  // La touche R la remet au recto ; grossie, elle revient d'abord à sa taille.
  await page.locator('#zoom-in').click();
  await page.keyboard.press('r');
  await expect(page.locator('#zoom-face')).toHaveText('Recto');
  await expect(img).toHaveAttribute('src', /images\/portee\.webp$/);
  await expect.poll(() => page.locator('#zoom-sheet').evaluate((el) => new DOMMatrix(getComputedStyle(el).transform).a)).toBeCloseTo(1, 1);

  await page.keyboard.press('Escape');
  await expect(page.locator('#zoom')).toBeHidden();
  expect(errors).toEqual([]);
});

test('sans verso, pas de bouton pour retourner ; la vue simplifiée montre les deux faces', async ({ page }) => {
  await openMuseum(page);
  await clickArtwork(page, 'portee', 3);
  await page.locator('#p-zoom').click();
  await expect(page.locator('#zoom')).toBeVisible();
  await expect(page.locator('#zoom-flip')).toBeHidden();
  await expect(page.locator('#zoom-face')).toBeHidden();
  // La touche R ne fait rien.
  await page.keyboard.press('r');
  await expect(page.locator('#zoom-img')).toHaveAttribute('src', /images\/portee\.webp$/);

  await openMuseum(page, { museum: withBack(), query: '&vue=simple' });
  const faces = page.locator('#art-portee figure.two-faces img');
  await expect(faces).toHaveCount(2);
  await expect(faces.nth(0)).toHaveAttribute('alt', /: Recto$/);
  await expect(faces.nth(1)).toHaveAttribute('alt', /: Verso$/);
  await expect(faces.nth(1)).toHaveAttribute('src', /images\/portee-verso\.webp$/);
});

test('un détail mal placé est signalé à la personne qui configure le musée', async ({ page }) => {
  const museum = withDetails();
  museum.rooms.flatMap((r: any) => r.artworks).find((a: any) => a.id === 'portee').details[0].at = [1.4, 0.3];
  await page.route('**/museums/fixture/museum.json', (route) => route.fulfill({ contentType: 'application/json', body: JSON.stringify(museum) }));
  await page.goto('/?m=fixture');
  await expect(page.locator('#config-errors')).toContainText('détail 1');
  await expect(page.locator('#config-errors')).toContainText('position invalide');
});

test('le carnet de visite retient les œuvres vues, salue une salle terminée et se conserve', async ({ page }) => {
  const errors = await openMuseum(page);
  const badge = page.locator('#carnet-open .badge');
  await expect(badge).toHaveText('0/21');

  // Les quatre œuvres du cabinet, une à une.
  await page.evaluate(() => (window as any).__museum.controls.teleport(0, -8.5, 0));
  for (const id of ['crepuscule-interieur', 'aube-interieure', 'soleils-multiples']) {
    await clickArtwork(page, id, 2.5);
    await expect(panel(page)).toBeVisible();
    await page.locator('#p-close').click();
  }
  await expect(badge).toHaveText('3/21');
  await expect(page.locator('#toast')).toBeHidden();
  // Rouvrir une œuvre déjà vue ne compte pas deux fois.
  await clickArtwork(page, 'aube-interieure', 2.5);
  await page.locator('#p-close').click();
  await expect(badge).toHaveText('3/21');
  await clickArtwork(page, 'zellige-imaginaire', 2.5);
  await expect(page.locator('#toast')).toHaveText('Salle terminée : Cabinet des Couleurs');
  await page.locator('#p-close').click();

  await page.locator('#carnet-open').click();
  await expect(page.locator('#carnet-hint')).toHaveText('4 œuvres vues sur 21');
  await expect(page.locator('.carnet-room')).toHaveCount(4);
  await expect(page.locator('.carnet-room.complete .name')).toHaveText('Cabinet des Couleurs');
  await expect(page.locator('.carnet-room', { hasText: 'Salon des Sculptures' }).locator('.count')).toHaveText('0 / 6');
  // Une salle du carnet y conduit.
  await page.locator('.carnet-room', { hasText: 'Salon des Sculptures' }).click();
  await expect(page.locator('#carnet')).toBeHidden();
  await expect(roomName(page)).toHaveText('Salon des Sculptures');

  // Le carnet se retrouve à la visite suivante, sur le même appareil.
  await openMuseum(page);
  await expect(badge).toHaveText('4/21');
  await page.locator('#carnet-open').click();
  await page.locator('#carnet-reset').click();
  await expect(page.locator('#carnet-hint')).toHaveText('0 œuvres vues sur 21');
  await expect(badge).toHaveText('0/21');
  expect(errors).toEqual([]);
});

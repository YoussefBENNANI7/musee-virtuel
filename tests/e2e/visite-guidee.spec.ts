import { expect, test } from '@playwright/test';
import { clickArtwork, openMuseum, panel, roomName } from './helpers';

test.describe('audioguide', () => {
  test('lit le commentaire dans la langue choisie, puis s’arrête', async ({ page }) => {
    await openMuseum(page, { spySpeech: true });
    await clickArtwork(page, 'equilibre-no-7', 4.5);
    const button = page.locator('#p-audio');
    await expect(button).toHaveText('Écouter le commentaire');

    await button.click();
    await expect(button).toHaveText('Arrêter la lecture');
    const spoken = await page.evaluate(() => (window as any).__spoken[0]);
    expect(spoken.lang).toBe('fr-FR');
    expect(spoken.text).toContain('Équilibre n° 7. Hélène Varga, 1962.');

    // Fin naturelle de la lecture : le bouton revient à son état initial.
    await page.evaluate(() => (window as any).__lastSpeech.onend());
    await expect(button).toHaveText('Écouter le commentaire');
  });

  test('fermer la fiche coupe la lecture', async ({ page }) => {
    await openMuseum(page, { spySpeech: true });
    await clickArtwork(page, 'equilibre-no-7', 4.5);
    await page.locator('#p-audio').click();
    const cancelled = page.evaluate(
      () => new Promise<boolean>((resolve) => (speechSynthesis.cancel = () => resolve(true))),
    );
    await page.locator('#p-close').click();
    expect(await cancelled).toBe(true);
    await expect(panel(page)).toBeHidden();
  });
});

test.describe('parcours', () => {
  test('conduit d’œuvre en œuvre à travers les salles, jusqu’à la fin', async ({ page }) => {
    await openMuseum(page);
    await page.click('#tours-open');
    await expect(page.locator('.tour-item')).toHaveCount(2);
    await page.getByRole('button', { name: 'Commencer : Les essentiels' }).click();

    const stops = [
      ['Équilibre n° 7', 'Salle des Horizons'],
      ['Le pays d\'avant', 'Salle des Horizons'],
      ['Crépuscule intérieur', 'Cabinet des Couleurs'],
      ['Partition pour le vent', 'Galerie des Lignes'],
      ['Nœud sans fin', 'Salon des Sculptures'],
    ];
    for (const [i, [title, room]] of stops.entries()) {
      await expect(page.locator('#p-title')).toHaveText(title);
      await expect(roomName(page)).toHaveText(room);
      await expect(page.locator('#tour-status')).toHaveText(`Les essentiels · Étape ${i + 1} sur 5`);
      if (i < stops.length - 1) await page.click('#tour-next');
    }
    await expect(page.locator('#tour-next')).toHaveText('Terminer');
    await expect(page.locator('#tour-prev')).toBeEnabled();

    // Fermer la fiche met le parcours en pause : un bouton permet de le reprendre.
    await page.click('#p-close');
    await expect(page.locator('#tour-resume-btn')).toHaveText('Reprendre le parcours · Étape 5 sur 5');
    await page.click('#tour-resume-btn');
    await expect(page.locator('#p-title')).toHaveText('Nœud sans fin');

    await page.click('#tour-next');
    await expect(page.locator('#tour-nav')).toBeHidden();
    await expect(page.locator('#tour-resume')).toBeHidden();
  });

  test('les boutons de l’en-tête restent accessibles quand une fiche est ouverte', async ({ page }) => {
    await openMuseum(page);
    await clickArtwork(page, 'equilibre-no-7', 4.5);
    await expect(panel(page)).toBeVisible();
    await page.click('#map-open');
    await expect(page.locator('#map')).toBeVisible();
  });
});

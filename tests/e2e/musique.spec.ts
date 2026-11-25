import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { openMuseum } from './helpers';

const fixture = () => JSON.parse(readFileSync(fileURLToPath(new URL('../fixtures/museum.json', import.meta.url)), 'utf8'));
/** Un vrai fichier MP3 sert de musique d'essai : celui de la fontaine. */
const mp3 = readFileSync(fileURLToPath(new URL('../../public/sons/fontaine.mp3', import.meta.url)));

test('chaque salle a sa musique : elle se fond dans la suivante, baisse sous les voix et se coupe', async ({ page }) => {
  const museum = fixture();
  const room = (id: string) => museum.rooms.find((r: any) => r.id === id);
  room('hall').music = { src: 'audio/musique-a.mp3', credit: { fr: 'Pièce A, domaine public', en: 'Piece A, public domain' } };
  room('galerie').music = { src: 'audio/musique-b.mp3', volume: 0.5, loop: [0.3, 20.3] };
  const loaded: string[] = [];
  await page.route('**/museums/fixture/audio/musique-*.mp3', (route) => {
    loaded.push(route.request().url().split('/').pop()!);
    return route.fulfill({ contentType: 'audio/mpeg', body: mp3 });
  });
  const errors = await openMuseum(page, { museum });
  const state = () => page.evaluate(() => ({ ...(window as any).__museum.ambiance.state }));
  const go = (x: number, z: number) => page.evaluate(([x, z]) => (window as any).__museum.controls.teleport(x, z, 0), [x, z]);

  // Sans fontaine, le bouton de son est là pour la musique ; sa mention se lit au survol.
  const button = page.locator('#sound');
  await expect(button).toBeVisible();
  await expect(button).toHaveAttribute('title', 'Musique et son d’ambiance · Pièce A, domaine public');
  // Rien ne joue avant un geste du visiteur.
  expect((await state()).started).toBe(false);
  await page.mouse.click(640, 300);
  await expect.poll(async () => (await state()).music ?? '').toMatch(/musique-a\.mp3$/);
  expect((await state()).musicGain).toBeCloseTo(0.9 * 0.45, 3);

  // Dans la galerie, la musique de la galerie, à son volume ; dans le cabinet, aucune.
  await go(10, 0);
  await expect.poll(async () => (await state()).music ?? '').toMatch(/musique-b\.mp3$/);
  expect((await state()).musicGain).toBeCloseTo(0.9 * 0.45 * 0.5, 3);
  await expect(button).toHaveAttribute('title', 'Musique et son d’ambiance');
  await go(0, -8.5);
  await expect.poll(async () => (await state()).music).toBeNull();
  // De retour dans le hall, la musique reprend sans être rechargée.
  await go(0, 2.5);
  await expect.poll(async () => (await state()).music ?? '').toMatch(/musique-a\.mp3$/);
  expect(loaded).toEqual(['musique-a.mp3', 'musique-b.mp3']);

  // Sous une voix, elle baisse de 12 dB ; coupée, elle se tait.
  await page.evaluate(() => (window as any).__museum.ambiance.duck(true));
  expect((await state()).musicGain).toBeCloseTo(0.25 * 0.45, 3);
  await page.evaluate(() => (window as any).__museum.ambiance.duck(false));
  await button.click();
  expect((await state()).musicGain).toBe(0);
  expect(errors).toEqual([]);
});

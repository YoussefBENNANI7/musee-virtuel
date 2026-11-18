import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { PROD_URL } from '../../playwright.config';

/** Ces tests portent sur le vrai musée de démonstration, pas sur le musée de test. */

test('démo : chaque œuvre s’ouvre depuis le point de vue qui lui fait face', async ({ page }) => {
  // 47 œuvres à visiter une à une, dont cinq sculptures numérisées : le test est long.
  test.setTimeout(300_000);
  const errors: string[] = [];
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto('/?accueil=non');
  await page.waitForSelector('body.ready');

  const works = await page.evaluate(() => {
    const m = (window as any).__museum;
    return m.world.artworks.map((a: any) => ({ id: a.config.id as string, title: a.config.title.fr as string }));
  });
  expect(works.length).toBeGreaterThan(0);
  // Toutes les images des œuvres finissent de charger.
  await expect
    .poll(() => page.evaluate(() => (window as any).__museum.world.artworks.filter((a: any) => !a.ready).length), { timeout: 60_000 })
    .toBe(0);
  for (const work of works) {
    await page.evaluate((id) => (window as any).__museum.standBefore(id, 3), work.id);
    await page.waitForTimeout(250);
    const p = await page.evaluate((id) => (window as any).__museum.screenOf(id), work.id);
    await page.mouse.click(p.x, p.y);
    await expect(page.locator('#p-title'), `fiche de « ${work.title} »`).toHaveText(work.title);
    await page.keyboard.press('Escape');
    await expect(page.locator('#panel')).toBeHidden();
  }
  expect(errors).toEqual([]);
});

test('démo : la fiche d’une œuvre cite le musée qui la conserve, dans les deux langues', async ({ page }) => {
  await page.goto('/?q=medium&accueil=non');
  await page.waitForSelector('body.ready');
  await page.evaluate(() => (window as any).__museum.standBefore('la-grande-vague', 2));
  await page.waitForTimeout(300);
  const p = await page.evaluate(() => (window as any).__museum.screenOf('la-grande-vague'));
  await page.mouse.click(p.x, p.y);
  await expect(page.locator('#p-title')).toHaveText('La Grande Vague de Kanagawa');
  await expect(page.locator('#p-artist')).toHaveText('Katsushika Hokusai');
  await expect(page.locator('#p-meta')).toContainText('vers 1830–1832');
  const credit = page.locator('#p-credit');
  await expect(credit).toContainText('The Metropolitan Museum of Art, New York · image dans le domaine public');
  await expect(credit.locator('a')).toHaveAttribute('href', 'https://www.metmuseum.org/art/collection/search/45434');
  await expect(credit.locator('a')).toHaveAttribute('target', '_blank');
  // Une petite estampe se regarde de près : le visiteur s'arrête à moins d'un mètre.
  await expect
    .poll(() => page.evaluate(() => {
      const m = (window as any).__museum;
      const art = m.world.artworks.find((a: any) => a.config.id === 'la-grande-vague');
      return Math.hypot(m.camera.position.x - art.center.x, m.camera.position.z - art.center.z);
    }), { timeout: 15_000 })
    .toBeLessThan(1);

  await page.locator('#lang').selectOption('en');
  await expect(page.locator('#p-title')).toHaveText('The Great Wave off Kanagawa');
  await expect(page.locator('#p-meta')).toContainText('c. 1830–32');
  await expect(credit).toContainText('public domain image');
  await expect(credit.locator('a')).toHaveText('View the museum record');
});

test('démo : les sculptures numérisées se chargent, à la bonne taille, en version légère sur un appareil modeste', async ({ page }) => {
  const requested: string[] = [];
  page.on('request', (r) => r.url().endsWith('.glb') && requested.push(new URL(r.url()).pathname));
  const errors: string[] = [];
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  const sculpture = () =>
    page.evaluate(() => {
      const m = (window as any).__museum;
      const art = m.world.artworks.find((a: any) => a.config.id === 'l-esclave-grecque');
      const shape = art.label.parent.children.find((c: any) => c.isGroup);
      if (!art.ready || !shape) return null;
      shape.updateWorldMatrix(true, true);
      let min = Infinity;
      let max = -Infinity;
      shape.traverse((n: any) => {
        if (!n.isMesh) return;
        n.geometry.computeBoundingBox();
        const box = n.geometry.boundingBox.clone().applyMatrix4(n.matrixWorld);
        min = Math.min(min, box.min.y);
        max = Math.max(max, box.max.y);
      });
      return { bottom: min, height: max - min, walkable: m.world.walkable(art.center.x, art.center.z) };
    });

  await page.goto('/?q=medium&accueil=non');
  await page.waitForSelector('body.ready');
  await expect.poll(sculpture, { timeout: 30_000 }).not.toBeNull();
  const s = (await sculpture())!;
  // Haute de 1,686 m, posée sur son socle de 60 cm, que le visiteur contourne.
  expect(s.height).toBeCloseTo(1.686, 2);
  expect(s.bottom).toBeCloseTo(0.6, 2);
  expect(s.walkable).toBe(false);

  await page.goto('/?q=low&accueil=non');
  await page.waitForSelector('body.ready');
  await expect.poll(sculpture, { timeout: 30_000 }).not.toBeNull();
  // Chaque sculpture a été demandée dans sa version complète, puis dans sa version légère, et dans aucune autre.
  await expect.poll(() => requested.length, { timeout: 30_000 }).toBe(10);
  const ids = ['bouddha-cosmique', 'danseuse', 'defense-sculptee', 'l-esclave-grecque', 'vase-fangyi'];
  expect([...requested].sort()).toEqual(ids.flatMap((id) => [`/museums/demo/models/web/${id}-leger.glb`, `/museums/demo/models/web/${id}.glb`]).sort());
  expect(errors).toEqual([]);
});

test('démo : on entre à pied dans le patio marocain par l’arc, et la fontaine se contourne', async ({ page }) => {
  await page.goto('/?q=medium&accueil=non');
  await page.waitForSelector('body.ready');
  const m = (fn: string) => page.evaluate(`(() => { const m = window.__museum; return ${fn}; })()`);
  expect(await m('m.decors.riad')).toBe('riad');
  // Depuis le Cabinet des Couleurs, face au nord, dans l'axe de la porte.
  await page.evaluate(() => (window as any).__museum.controls.teleport(0, -20, 0));
  await page.keyboard.down('KeyW');
  await expect(page.locator('#room-name')).toHaveText('Patio marocain', { timeout: 30_000 });
  // Le visiteur continue tout droit et s'arrête devant la fontaine, au centre du patio (z = -27,5).
  await expect
    .poll(async () => {
      const a = (await m('m.camera.position.z')) as number;
      await page.waitForTimeout(400);
      return Math.abs(((await m('m.camera.position.z')) as number) - a) < 0.005 ? a : null;
    }, { timeout: 30_000 })
    .not.toBeNull();
  await page.keyboard.up('KeyW');
  const z = (await m('m.camera.position.z')) as number;
  expect(z).toBeLessThan(-23);
  expect(z).toBeGreaterThan(-26.2);
  expect(await m('m.world.walkable(0, -27.5)')).toBe(false);
  // De part et d'autre de l'arc, le mur arrête le visiteur.
  expect(await m('m.world.walkable(1.05, -22)')).toBe(false);
  expect(await m('m.world.walkable(0, -22)')).toBe(true);
});

test('démo : une œuvre s’agrandit en haute définition, et Échap referme d’abord l’agrandissement', async ({ page }) => {
  await page.goto('/?q=medium&accueil=non');
  await page.waitForSelector('body.ready');
  await page.evaluate(() => (window as any).__museum.standBefore('les-moissonneurs', 2.5));
  await page.waitForTimeout(300);
  const p = await page.evaluate(() => (window as any).__museum.screenOf('les-moissonneurs'));
  await page.mouse.click(p.x, p.y);
  // Les Moissonneurs ont des détails commentés : le bouton d'agrandissement les annonce.
  await expect(page.locator('#p-zoom')).toHaveText('Explorer les détails');
  // On laisse le visiteur finir de s'approcher de l'œuvre avant de noter où il se tient.
  const where = () => page.evaluate(() => (window as any).__museum.camera.position.toArray().map((v: number) => v.toFixed(3)).join(' '));
  let last = '';
  await expect.poll(async () => { const now = await where(); const still = now === last; last = now; return still; }, { timeout: 15_000, intervals: [400] }).toBe(true);
  const before = last;
  await page.locator('#p-zoom').click();
  const zoom = page.locator('#zoom');
  await expect(zoom).toBeVisible();
  const img = page.locator('#zoom-img');
  // C'est l'image d'origine, pas une version allégée.
  await expect.poll(() => img.evaluate((i: HTMLImageElement) => i.naturalWidth), { timeout: 30_000 }).toBeGreaterThanOrEqual(2500);
  expect(await img.getAttribute('src')).toContain('/images/les-moissonneurs.webp');
  expect(await img.getAttribute('alt')).toBe('Les Moissonneurs, Pieter Bruegel l\'Ancien');
  // L'image et ses points numérotés sont portés par une même feuille : c'est elle qui grossit et se déplace.
  const sheet = page.locator('#zoom-sheet');
  await expect(page.locator('.zoom-dot')).toHaveCount(3);
  const scale = () => sheet.evaluate((el: HTMLElement) => Number(/scale\(([\d.]+)\)/.exec(el.style.transform)?.[1]));
  expect(await scale()).toBe(1);
  await page.keyboard.press('+');
  await page.locator('#zoom-in').click();
  expect(await scale()).toBeCloseTo(2.25);
  // Les flèches déplacent l'image, pas le visiteur resté derrière.
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('ArrowUp');
  expect(await sheet.evaluate((el: HTMLElement) => el.style.transform)).toMatch(/translate\(-60px, 60px\)/);
  await page.locator('#zoom-out').click();
  await page.locator('#zoom-out').click();
  await page.locator('#zoom-out').click();
  expect(await scale()).toBe(1);
  expect(await sheet.evaluate((el: HTMLElement) => el.style.transform)).toMatch(/translate\(0px, 0px\)/);
  await page.keyboard.press('Escape');
  await expect(zoom).toBeHidden();
  await expect(page.locator('#panel')).toBeVisible();
  expect(await where()).toBe(before);
  // Une sculpture ne s'agrandit pas : elle s'examine en tournant autour.
  await page.keyboard.press('Escape');
  await page.evaluate(() => (window as any).__museum.standBefore('l-esclave-grecque', 3));
  await page.waitForTimeout(300);
  const s = await page.evaluate(() => (window as any).__museum.screenOf('l-esclave-grecque'));
  await page.mouse.click(s.x, s.y);
  await expect(page.locator('#p-title')).toHaveText("Modèle de L'Esclave grecque");
  await expect(page.locator('#p-zoom')).toHaveText('Examiner');
});

test('une œuvre sans mention ni lien n’affiche pas de ligne vide', async ({ page }) => {
  await page.route('**/museums/fixture/museum.json', (route) =>
    route.fulfill({ path: new URL('../fixtures/museum.json', import.meta.url).pathname }),
  );
  await page.goto('/?m=fixture&q=medium&accueil=non');
  await page.waitForSelector('body.ready');
  await page.evaluate(() => (window as any).__museum.standBefore('equilibre-no-7', 3));
  await page.waitForTimeout(300);
  const p = await page.evaluate(() => (window as any).__museum.screenOf('equilibre-no-7'));
  await page.mouse.click(p.x, p.y);
  await expect(page.locator('#p-title')).toHaveText('Équilibre n° 7');
  await expect(page.locator('#p-credit')).toBeHidden();
});

test('version publiée : la visite 3D et la vue simplifiée se chargent', async ({ page }) => {
  const errors: string[] = [];
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('response', (r) => r.status() >= 400 && errors.push(`${r.status()} ${r.url()}`));

  await page.goto(`${PROD_URL}/?m=demo`);
  await page.waitForSelector('body.ready');
  await expect(page.locator('#scene')).toBeVisible();
  await expect(page.locator('#museum-name')).not.toBeEmpty();
  // L'accès réservé aux tests ne doit pas exister dans la version publiée.
  expect(await page.evaluate(() => '__museum' in window)).toBe(false);

  await page.goto(`${PROD_URL}/?vue=simple`);
  await page.waitForSelector('body.ready');
  expect(await page.locator('.card').count()).toBeGreaterThan(0);
  const image = page.locator('.card img').first();
  await expect.poll(() => image.evaluate((img: HTMLImageElement) => img.naturalWidth)).toBeGreaterThan(0);
  expect(errors).toEqual([]);
});

test('démo : l’audioguide joue la voix enregistrée de l’œuvre, dans la langue choisie', async ({ page }) => {
  // La voix du navigateur ne doit pas servir : chaque œuvre de la démo a sa voix enregistrée.
  await page.addInitScript(() => {
    (window as any).__spoken = [];
    speechSynthesis.speak = (u: SpeechSynthesisUtterance) => (window as any).__spoken.push(u.text);
  });
  const played: string[] = [];
  // Un fichier audio se charge par morceaux : réponse 200 ou 206, selon le navigateur.
  page.on('response', (r) => r.url().includes('/audio/') && r.status() < 300 && played.push(new URL(r.url()).pathname.split('/').pop()!));
  await page.goto('/?q=medium&accueil=non');
  await page.waitForSelector('body.ready');
  await page.evaluate(() => (window as any).__museum.standBefore('les-moissonneurs', 3));
  await page.waitForTimeout(300);
  const p = await page.evaluate(() => (window as any).__museum.screenOf('les-moissonneurs'));
  await page.mouse.click(p.x, p.y);
  await expect(page.locator('#p-title')).toHaveText('Les Moissonneurs');

  const button = page.locator('#p-audio');
  await button.click();
  await expect(button).toHaveText('Arrêter la lecture');
  await expect.poll(() => played).toContain('les-moissonneurs.fr.mp3');
  await button.click();
  await expect(button).toHaveText('Écouter le commentaire');

  await page.locator('#lang').selectOption('en');
  await button.click();
  await expect.poll(() => played).toContain('les-moissonneurs.en.mp3');
  expect(await page.evaluate(() => (window as any).__spoken)).toEqual([]);
});

test('démo : l’eau de la fontaine s’entend plus fort de près, se coupe et se rétablit', async ({ page }) => {
  const errors: string[] = [];
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  page.on('pageerror', (e) => errors.push(String(e)));
  const sounds: number[] = [];
  page.on('response', (r) => r.url().endsWith('/sons/fontaine.mp3') && sounds.push(r.status()));
  await page.goto('/?q=low&accueil=non');
  await page.waitForSelector('body.ready');
  const state = () => page.evaluate(() => ({ ...(window as any).__museum.ambiance.state }));
  const button = page.locator('#sound');
  await expect(button).toBeVisible();
  await expect(button).toHaveAttribute('aria-pressed', 'true');
  // Aucun son avant un geste du visiteur.
  expect((await state()).started).toBe(false);
  await page.mouse.click(640, 300);
  await expect.poll(async () => (await state()).started).toBe(true);
  await expect.poll(() => sounds).toEqual([200]);

  // Dans l'atrium, loin du patio : la fontaine est presque inaudible.
  const far = (await state()).level;
  expect(far).toBeLessThan(0.02);
  // Dans le patio, la fontaine est à droite du visiteur qui regarde vers le nord.
  await page.evaluate(() => (window as any).__museum.controls.teleport(-2, -27.5, 0));
  await expect.poll(async () => (await state()).level).toBeGreaterThan(0.5);
  expect((await state()).pan).toBeGreaterThan(0.5);
  // Dans la salle voisine, à la même distance, elle s'entendrait moins : ici, plus loin dans le patio, elle faiblit.
  await page.evaluate(() => (window as any).__museum.controls.teleport(-4.5, -31.5, 0));
  await expect.poll(async () => (await state()).level).toBeLessThan(0.2);

  await button.click();
  await expect(button).toHaveAttribute('aria-pressed', 'false');
  expect((await state()).muted).toBe(true);
  // Le choix se retrouve à la visite suivante.
  await page.reload();
  await page.waitForSelector('body.ready');
  await expect(page.locator('#sound')).toHaveAttribute('aria-pressed', 'false');
  expect(errors).toEqual([]);
});

test('sans musée dans l\'adresse, une page propose les musées ; chacun s\'ouvre, et un lien y ramène', async ({ page }) => {
  // La liste des musées proposés est propre à chaque ordinateur (museums/index.json, hors du dépôt) :
  // le test en fournit une, avec le musée de démonstration et le musée de test.
  const list = [
    { id: 'demo', name: { fr: 'Musée des Horizons' }, summary: { fr: 'Le musée de démonstration.' }, image: 'demo/couverture.webp' },
    { id: 'fixture', name: { fr: 'Musée de test' }, summary: { fr: 'Un plan figé.' }, image: 'demo/images/web/un-dimanche-a-la-grande-jatte-640.webp' },
    // Retiré de la page dans l'éditeur : il garde sa fiche, mais ne se montre pas.
    { id: 'retire', name: { fr: 'Musée retiré' }, summary: {}, image: '', hidden: true },
  ];
  await page.route('**/museums/index.json', (route) => route.fulfill({ contentType: 'application/json', body: JSON.stringify(list) }));
  await page.route('**/museums/fixture/museum.json', (route) =>
    route.fulfill({ contentType: 'application/json', body: readFileSync(fileURLToPath(new URL('../fixtures/museum.json', import.meta.url)), 'utf8') }),
  );
  await page.goto('/');
  await page.waitForSelector('body.ready');
  const cards = page.locator('.chooser-card');
  await expect(cards).toHaveCount(2);
  await expect(page.locator('#scene')).toBeHidden();
  const hrefs = await cards.evaluateAll((nodes) => nodes.map((n) => (n as HTMLAnchorElement).getAttribute('href')));
  expect(hrefs).toEqual(['?m=demo', '?m=fixture']);
  // Les couvertures se chargent ; celle de la démonstration est une vue de son atrium.
  const first = cards.first().locator('img');
  await expect.poll(() => first.evaluate((img: HTMLImageElement) => img.naturalWidth)).toBe(1600);
  // Sur l'ordinateur qui fait tourner le projet, un bouton mène à l'éditeur.
  await expect(page.locator('.chooser-admin')).toHaveAttribute('href', 'editeur.html');

  await cards.nth(1).click();
  await page.waitForSelector('body.ready #scene');
  await expect(page).toHaveURL(/\?m=fixture/);
  // L'écran d'accueil du musée se referme avec Échap.
  await page.keyboard.press('Escape');
  const back = page.locator('#museums-link');
  await expect(back).toBeVisible();
  await back.click();
  await expect(page.locator('.chooser-card')).toHaveCount(2);

  // Dans la version publiée, pas de bouton vers l'éditeur : il n'y fonctionnerait pas.
  await page.goto(`${PROD_URL}/`);
  await expect(page.locator('.chooser-card')).toHaveCount(2);
  await expect(page.locator('.chooser-admin')).toHaveCount(0);
});

test('sans liste de musées, l\'adresse sans réglage ouvre le musée de démonstration, comme avant', async ({ page }) => {
  await page.route('**/museums/index.json', (route) => route.fulfill({ status: 404, body: '' }));
  await page.goto('/');
  await page.waitForSelector('body.ready');
  await expect(page.locator('.chooser-card')).toHaveCount(0);
  await expect(page.locator('#scene')).toBeVisible();
  await expect(page.locator('#museums-link')).toBeHidden();
});

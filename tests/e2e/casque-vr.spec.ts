import { expect, test, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { holdClock, onWalkableGround, openMuseum, panel, teleport } from './helpers';

// Émulateur de casque (Meta Quest 3) : il remplace l'interface WebXR du navigateur.
const require = createRequire(import.meta.url);
const iwer = readFileSync(require.resolve('iwer/build/iwer.min.js'), 'utf8');

type Hand = 'left' | 'right';

const state = (page: Page) =>
  page.evaluate(() => {
    const m = (window as any).__museum;
    const head = m.camera.getWorldPosition(m.camera.position.clone());
    return {
      presenting: m.renderer.xr.isPresenting as boolean,
      head: { x: head.x as number, y: head.y as number, z: head.z as number },
      yaw: m.rig.rotation.y as number,
      panel: m.vrPanel().visible as boolean,
    };
  });

/** Place une manette et l'incline (angle négatif = vers le sol). */
const aim = (page: Page, hand: Hand, pitchDeg: number) =>
  page.evaluate(
    ([hand, pitchDeg]) => {
      const c = (window as any).xrDevice.controllers[hand];
      c.position.set(hand === 'right' ? 0.2 : -0.2, 1.4, -0.3);
      const a = ((pitchDeg as number) * Math.PI) / 180;
      c.quaternion.set(Math.sin(a / 2), 0, 0, Math.cos(a / 2));
    },
    [hand, pitchDeg] as const,
  );

async function trigger(page: Page, hand: Hand) {
  await page.evaluate((h) => (window as any).xrDevice.controllers[h].updateButtonValue('trigger', 1), hand);
  await page.waitForTimeout(400);
  await page.evaluate((h) => (window as any).xrDevice.controllers[h].updateButtonValue('trigger', 0), hand);
  await page.waitForTimeout(400);
}

const stick = (page: Page, hand: Hand, x: number, y: number) =>
  page.evaluate(([h, x, y]) => (window as any).xrDevice.controllers[h].updateAxes('thumbstick', x, y), [hand, x, y] as const);

/** Branche le casque émulé, avant l'ouverture du musée. */
async function plugHeadset(page: Page) {
  await page.addInitScript(iwer);
  await page.addInitScript(() => {
    const w = window as any;
    w.xrDevice = new w.IWER.XRDevice(w.IWER.metaQuest3);
    w.xrDevice.installRuntime({ forceInstall: true });
  });
}

test('visite en casque VR : fiche, téléportation, marche, pivot et sortie', async ({ page }) => {
  await plugHeadset(page);
  const errors = await openMuseum(page, { spySpeech: true });
  await expect(page.locator('#vr')).toBeVisible();

  // On entre en VR face au tableau « Équilibre n° 7 », à quatre mètres.
  await page.evaluate(() => (window as any).__museum.standBefore('equilibre-no-7', 4));
  await page.waitForTimeout(300);
  const before = await page.evaluate(() => {
    const c = (window as any).__museum.camera.position;
    return { x: c.x as number, z: c.z as number };
  });
  await page.click('#vr');
  await expect.poll(async () => (await state(page)).presenting).toBe(true);
  const entered = await state(page);
  expect(entered.head.x).toBeCloseTo(before.x, 0);
  expect(entered.head.z).toBeCloseTo(before.z, 0);
  expect(entered.head.y).toBeGreaterThan(1.2);

  // Gâchette vers le tableau : la fiche flottante apparaît.
  await aim(page, 'right', 0);
  await page.waitForTimeout(400);
  await trigger(page, 'right');
  expect((await state(page)).panel).toBe(true);

  // Gâchette vers le sol : téléportation vers le point visé, devant soi.
  await aim(page, 'right', -35);
  await page.waitForTimeout(400);
  await trigger(page, 'right');
  const teleported = await state(page);
  expect(teleported.head.z).toBeLessThan(entered.head.z - 0.5);

  // Joystick gauche : on avance jusqu'à être arrêté par le mur nord (z = -4.5, limite de marche en z = -3.9).
  await stick(page, 'left', 0, -1);
  let last = teleported.head.z;
  let still = 0;
  for (let i = 0; i < 120 && still < 4; i++) {
    await page.waitForTimeout(250);
    const z = (await state(page)).head.z;
    still = Math.abs(z - last) < 0.005 ? still + 1 : 0;
    last = z;
  }
  await stick(page, 'left', 0, 0);
  expect(last).toBeLessThan(teleported.head.z - 0.3);
  // Le visiteur s'arrête à moins d'un petit pas (5 cm) de la limite, alors que les images de ce test sont lentes
  // (un pas entier y fait jusqu'à 18 cm). En casque, il n'est pas amené au ras : voir src/vr.ts.
  expect(last).toBeGreaterThan(-3.9 - 1e-9);
  expect(last).toBeLessThan(-3.85);

  // Joystick droit : pivot d'un cran de 30°, autour de la tête.
  const beforeTurn = await state(page);
  await stick(page, 'right', 1, 0);
  await page.waitForTimeout(600);
  await stick(page, 'right', 0, 0);
  await page.waitForTimeout(300);
  const turned = await state(page);
  expect(turned.yaw - beforeTurn.yaw).toBeCloseTo(-Math.PI / 6, 2);
  expect(turned.head.x).toBeCloseTo(beforeTurn.head.x, 1);
  expect(turned.head.z).toBeCloseTo(beforeTurn.head.z, 1);

  // Sortie : le visiteur retrouve sa position et son orientation hors du casque.
  await page.evaluate(() => (window as any).__museum.renderer.xr.getSession().end());
  await expect.poll(async () => (await state(page)).presenting).toBe(false);
  const after = await state(page);
  expect(after.head.x).toBeCloseTo(turned.head.x, 1);
  expect(after.head.z).toBeCloseTo(turned.head.z, 1);
  const yaw = await page.evaluate(() => (window as any).__museum.controls.yaw as number);
  expect(yaw).toBeCloseTo(turned.yaw, 2);
  expect(errors).toEqual([]);
});

test('entré en VR pendant qu’il est emmené devant une œuvre, le visiteur arrive devant elle, pas dans un mur', async ({ page }) => {
  await plugHeadset(page);
  await openMuseum(page);
  // Dans le hall, à gauche de la porte du cabinet : par elle, on voit « Zellige imaginaire ». Le chemin
  // qui y mène en ligne droite passe par le mur, à côté de la porte.
  await teleport(page, -0.5, 2, Math.atan2(-5.35, 10.5));
  await page.waitForTimeout(300);
  const clock = await holdClock(page);
  const p = await page.evaluate(() => (window as any).__museum.screenOf('zellige-imaginaire'));
  await page.mouse.click(p.x, p.y);
  await expect(panel(page)).toBeVisible();
  await clock.untilOutside();
  expect(await onWalkableGround(page)).toBe(false);

  // À cet instant, il entre en VR : le déplacement s'achève d'un coup, et le casque démarre devant l'œuvre.
  await page.click('#vr');
  await expect.poll(async () => (await state(page)).presenting).toBe(true);
  const { head } = await state(page);
  expect(await page.evaluate(([x, z]) => (window as any).__museum.world.walkable(x, z) as boolean, [head.x, head.z])).toBe(true);
  // Le tableau est accroché au mur est du cabinet, en (4,85 ; -8,5) : le visiteur est devant lui, à moins de 3 m.
  expect(Math.hypot(head.x - 4.85, head.z + 8.5)).toBeLessThan(3);
  expect(Math.abs(head.z + 8.5)).toBeLessThan(0.3);
});

test('sans casque, le bouton VR reste masqué', async ({ page }) => {
  await openMuseum(page);
  await teleport(page, 0, 0, 0);
  await expect(page.locator('#vr')).toBeHidden();
});

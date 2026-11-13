import { expect, test, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { openMuseum, teleport } from './helpers';

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

test('visite en casque VR : fiche, téléportation, marche, pivot et sortie', async ({ page }) => {
  await page.addInitScript(iwer);
  await page.addInitScript(() => {
    const w = window as any;
    w.xrDevice = new w.IWER.XRDevice(w.IWER.metaQuest3);
    w.xrDevice.installRuntime({ forceInstall: true });
  });
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

  // Joystick gauche : on avance jusqu'à être arrêté par le mur nord (z = -4.5).
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
  expect(last).toBeGreaterThan(-4.5);

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

test('sans casque, le bouton VR reste masqué', async ({ page }) => {
  await openMuseum(page);
  await teleport(page, 0, 0, 0);
  await expect(page.locator('#vr')).toBeHidden();
});

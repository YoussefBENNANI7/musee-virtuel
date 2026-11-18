import { expect, test, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { holdClock, onWalkableGround, openMuseum, panel, teleport } from './helpers';

// Émulateur de casque (Meta Quest 3) : il remplace l'interface WebXR du navigateur.
const require = createRequire(import.meta.url);
const iwer = readFileSync(require.resolve('iwer/build/iwer.min.js'), 'utf8');

type Hand = 'left' | 'right';

/** Branche le casque émulé. À appeler avant d'ouvrir le musée. */
async function installHeadset(page: Page) {
  await page.addInitScript(iwer);
  await page.addInitScript(() => {
    const w = window as any;
    w.xrDevice = new w.IWER.XRDevice(w.IWER.metaQuest3);
    w.xrDevice.installRuntime({ forceInstall: true });
  });
}

const state = (page: Page) =>
  page.evaluate(() => {
    const m = (window as any).__museum;
    const head = m.camera.getWorldPosition(m.camera.position.clone());
    return {
      presenting: m.renderer.xr.isPresenting as boolean,
      head: { x: head.x as number, y: head.y as number, z: head.z as number },
      yaw: m.rig.rotation.y as number,
      panel: m.vrPanel().visible as boolean,
      /** La tête est-elle en zone praticable ? */
      walkable: m.world.walkable(head.x, head.z) as boolean,
      /** Point d'appui du visiteur : voir `follow`, dans src/engine/marche.ts. */
      support: m.vrSupport() as { x: number; z: number },
      /** Nombre d'images dessinées depuis l'ouverture. */
      frame: m.renderer.info.render.frame as number,
    };
  });

/** Attend que le casque ait dessiné `count` images de plus. */
async function frames(page: Page, count: number) {
  const from = (await state(page)).frame;
  await expect.poll(async () => (await state(page)).frame, { intervals: [50] }).toBeGreaterThanOrEqual(from + count);
}

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

/** Durée d'une image : sur un appareil très lent (le plus long que la visite accorde à une image), et sur un casque à 90 images par seconde. */
const SLOW = 0.1;
const HEADSET = 1 / 90;
/** Chemin fait en une seconde, joystick à fond, à la cadence d'un casque : 90 pas de 2 cm. */
const ONE_SECOND = 90;

/**
 * Pousse le joystick gauche pendant `count` images de `dt` secondes, puis le relâche, et renvoie le déplacement de la tête.
 * Le test fait lui-même avancer le temps, d'un seul tenant : la cadence est celle qu'il choisit, pas celle du navigateur
 * des tests, dont les images sont lentes et irrégulières. C'est la cadence d'un vrai casque qui révèle le défaut d'origine :
 * à 2 cm par image, aucun pas ne ramenait d'un coup en zone praticable une tête penchée de 10 cm.
 */
const push = (page: Page, x: number, y: number, dt: number, count: number) =>
  page.evaluate(
    ([x, y, dt, count]) => {
      const w = window as any;
      const m = w.__museum;
      const head = () => m.camera.getWorldPosition(m.camera.position.clone());
      const left = w.xrDevice.controllers.left;
      const from = head();
      left.updateAxes('thumbstick', x, y);
      for (let i = 0; i < count; i++) m.vrUpdate(dt);
      left.updateAxes('thumbstick', 0, 0);
      const to = head();
      return { dx: (to.x - from.x) as number, dz: (to.z - from.z) as number };
    },
    [x, y, dt, count] as const,
  );

/**
 * Le visiteur déplace réellement sa tête de (dx, dz) mètres dans le musée : il se penche, il fait un pas.
 * Le joystick n'y est pour rien : c'est le casque qui change de place dans la pièce réelle.
 */
async function moveHead(page: Page, dx: number, dz: number) {
  const from = await page.evaluate(
    ([dx, dz]) => {
      const w = window as any;
      const m = w.__museum;
      // Le casque se repère dans la pièce réelle, qui a tourné avec le visiteur à chaque pivot.
      const yaw = m.rig.rotation.y;
      w.xrDevice.position.x += dx * Math.cos(yaw) - dz * Math.sin(yaw);
      w.xrDevice.position.z += dx * Math.sin(yaw) + dz * Math.cos(yaw);
      return m.renderer.info.render.frame as number;
    },
    [dx, dz] as const,
  );
  // Deux images : la première donne la nouvelle position de la tête, la suivante en tient compte.
  await expect.poll(async () => (await state(page)).frame, { intervals: [50] }).toBeGreaterThanOrEqual(from + 2);
}

/** Entre en casque depuis l'endroit donné, et attend que le casque ait donné sa position. */
async function enterVR(page: Page, x: number, z: number, yaw: number) {
  await teleport(page, x, z, yaw);
  await page.click('#vr');
  await expect.poll(async () => (await state(page)).presenting).toBe(true);
  await frames(page, 2);
}

test('visite en casque VR : fiche, téléportation, marche, pivot et sortie', async ({ page }) => {
  await installHeadset(page);
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
  // Le visiteur s'arrête au ras de la limite, comme au clavier, alors que les images de ce test sont lentes
  // (un pas entier y fait jusqu'à 18 cm).
  expect(last).toBeGreaterThan(-3.9 - 1e-9);
  expect(last).toBeLessThan(-3.9 + 1e-5);

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

test('en casque, le joystick répond encore quand la tête a passé la limite de marche', async ({ page }) => {
  await installHeadset(page);
  const errors = await openMuseum(page);
  await enterVR(page, 0, -1.4, 0);

  // Joystick vers l'avant jusqu'à l'arrêt devant le mur nord (limite de marche en z = -3,90), à grands pas :
  // le visiteur vient au ras de la limite. À petits pas, il n'avance plus du tout.
  await push(page, 0, -1, SLOW, 40);
  const stopped = await state(page);
  expect(stopped.walkable).toBe(true);
  expect(stopped.head.z).toBeGreaterThan(-3.9 - 1e-9);
  expect(stopped.head.z).toBeLessThan(-3.9 + 1e-5);
  expect(stopped.support.z).toBeCloseTo(stopped.head.z, 9);
  expect(await push(page, 0, -1, HEADSET, ONE_SECOND)).toEqual({ dx: 0, dz: 0 });
  // Reparti d'un mètre en arrière, à la cadence d'un casque cette fois, il s'arrête au même endroit.
  await push(page, 0, 1, HEADSET, 50);
  await push(page, 0, -1, HEADSET, ONE_SECOND);
  expect((await state(page)).head.z).toBeCloseTo(stopped.head.z, 5);

  // Le visiteur se penche de 10 cm pour regarder le mur de près : sa tête passe la limite de marche.
  await moveHead(page, 0, -0.1);
  const leaning = await state(page);
  expect(leaning.head.z).toBeCloseTo(stopped.head.z - 0.1, 6);
  expect(leaning.walkable).toBe(false);

  // À la cadence d'un casque, le joystick le déplace encore le long du mur, vers la droite puis vers la gauche…
  const right = await push(page, 1, 0, HEADSET, ONE_SECOND);
  expect(right.dx).toBeCloseTo(1.8, 6);
  expect(right.dz).toBeCloseTo(0, 9);
  // (La règle de marche part de son point d'appui, resté en zone praticable, au ras de la limite, en face de sa tête.)
  const held = await state(page);
  expect(held.support.x).toBeCloseTo(held.head.x, 6);
  expect(held.support.z).toBeGreaterThanOrEqual(-3.9);
  expect(held.support.z).toBeLessThan(-3.9 + 1e-5);
  const left = await push(page, -1, 0, HEADSET, 2 * ONE_SECOND);
  expect(left.dx).toBeCloseTo(-3.6, 6);
  expect(left.dz).toBeCloseTo(0, 9);
  // … ne l'enfonce pas davantage vers le mur, de face comme de biais…
  expect(await push(page, 0, -1, HEADSET, ONE_SECOND)).toEqual({ dx: 0, dz: 0 });
  const slide = await push(page, 0.6, -0.8, HEADSET, ONE_SECOND);
  expect(slide.dx).toBeCloseTo(1.8 * 0.6, 6);
  expect(slide.dz).toBeCloseTo(0, 9);
  expect((await state(page)).head.z).toBeCloseTo(leaning.head.z, 9);

  // … et il en va de même avec les images du navigateur, lentes, telles qu'elles viennent.
  const real = await state(page);
  await stick(page, 'left', 1, 0);
  await expect.poll(async () => (await state(page)).head.x, { intervals: [100] }).toBeGreaterThan(real.head.x + 0.5);
  await stick(page, 'left', 0, 0);
  await frames(page, 2);
  const walked = await state(page);
  expect(walked.walkable).toBe(false);
  expect(walked.head.z).toBeCloseTo(leaning.head.z, 9);

  // Vers l'arrière, il recule dès la première image : sa tête revient en zone praticable, et il s'y appuie de nouveau.
  const first = await push(page, 0, 1, HEADSET, 1);
  expect(first.dz).toBeCloseTo(0.02, 9);
  const back = await push(page, 0, 1, HEADSET, ONE_SECOND - 1);
  expect(back.dx).toBeCloseTo(0, 9);
  expect(back.dz).toBeCloseTo(1.8 - 0.02, 6);
  const free = await state(page);
  expect(free.walkable).toBe(true);
  expect(free.support.x).toBeCloseTo(free.head.x, 9);
  expect(free.support.z).toBeCloseTo(free.head.z, 9);
  expect(errors).toEqual([]);
});

test('en casque, la tête bouge sans cesse, comme sur un vrai casque : le joystick répond à chaque image', async ({ page }) => {
  await installHeadset(page);
  const errors = await openMuseum(page);
  await enterVR(page, 0, -1.4, 0);

  // L'émulateur tient le casque parfaitement immobile ; une vraie tête, jamais. Ici, à chaque image, le test déplace
  // lui-même la tête dans la pièce réelle, à la cadence d'un casque : elle oscille de 2 cm, le visiteur regarde à droite
  // et à gauche (le casque tourne autour du cou, 9 cm en arrière des yeux), et il se penche par moments de 10 cm vers
  // ce qu'il regarde. Le test compte les images où le joystick, poussé, est resté sans effet.
  const walk = await page.evaluate((dt) => {
    const w = window as any;
    const m = w.__museum;
    const left = w.xrDevice.controllers.left;
    const NECK = 0.09;
    const head = () => m.camera.getWorldPosition(m.camera.position.clone());
    let i = 0;
    /** Une image : la tête prend sa nouvelle place, puis la visite avance. Renvoie vrai si le joystick a déplacé le visiteur. */
    const frame = () => {
      i++;
      const look = 0.26 * Math.sin(i / 60);
      // Arrivé devant le mur (après 270 images), il se penche vers lui, puis se redresse.
      const lean = i < 270 ? 0 : 0.05 * (1 - Math.cos((i - 270) / 29));
      const neck = { x: 0.02 * Math.sin(i / 25), z: NECK + 0.02 * Math.sin(i / 35) - lean };
      m.camera.position.x = neck.x - NECK * Math.sin(look);
      m.camera.position.z = neck.z - NECK * Math.cos(look);
      m.camera.quaternion.set(0, Math.sin(look / 2), 0, Math.cos(look / 2));
      const { x, z } = m.rig.position;
      m.vrUpdate(dt);
      return x !== m.rig.position.x || z !== m.rig.position.z;
    };
    // Trois secondes vers le mur nord : il y arrive, et sa tête va et vient par-dessus la limite de marche.
    left.updateAxes('thumbstick', 0, -1);
    for (let k = 0; k < 270; k++) frame();
    // Puis il longe le mur vers la gauche pendant deux secondes, en regardant les œuvres.
    left.updateAxes('thumbstick', -1, 0);
    const from = m.rig.position.x as number;
    const count = { idle: 0, outside: 0, deepest: 0, support: true };
    for (let k = 0; k < 180; k++) {
      if (!frame()) count.idle++;
      const h = head();
      if (!m.world.walkable(h.x, h.z)) count.outside++;
      count.deepest = Math.min(count.deepest, h.z + 3.9);
      const s = m.vrSupport();
      count.support &&= m.world.walkable(s.x, s.z);
    }
    left.updateAxes('thumbstick', 0, 0);
    return { ...count, moved: (m.rig.position.x - from) as number };
  }, HEADSET);
  expect(walk.idle).toBe(0);
  // Il a longé le mur à pleine allure : 3,60 m en deux secondes, aux détours de son regard près.
  expect(walk.moved).toBeLessThan(-3.4);
  // Le test a bien éprouvé la règle : la tête a passé une bonne partie du trajet au-delà de la limite de marche,
  // jusqu'à plusieurs centimètres, et le point d'appui n'a jamais quitté la zone praticable.
  expect(walk.outside).toBeGreaterThan(60);
  expect(walk.deepest).toBeLessThan(-0.05);
  expect(walk.support).toBe(true);
  expect(errors).toEqual([]);
});

test('en casque, le visiteur garde un point d’appui praticable : entrée, pivot, mur traversé, téléportation, sortie', async ({ page }) => {
  await installHeadset(page);
  const errors = await openMuseum(page);

  // Entrée. Le visiteur se tient presque au ras du mur ouest du hall (limite de marche en x = -5,40), tourné vers
  // le nord. Le casque le voit 30 cm plus à l'ouest : dès la première image, sa tête est au-delà de la limite.
  await page.evaluate(() => {
    const m = (window as any).__museum;
    (window as any).xrDevice.position.x = -0.3;
    // Avant la première position donnée par le casque, la tête est tenue pour être là où se tenait le visiteur.
    m.renderer.xr.addEventListener('sessionstart', () => {
      m.vrUpdate(0);
      const head = m.camera.getWorldPosition(m.camera.position.clone());
      (window as any).__start = { head: { x: head.x, z: head.z }, support: m.vrSupport() };
    });
  });
  await enterVR(page, -5.39, 3, 0);
  const start = await page.evaluate(() => (window as any).__start as { head: { x: number; z: number }; support: { x: number; z: number } });
  expect(start.head).toEqual({ x: -5.39, z: 3 });
  expect(start.support).toEqual({ x: -5.39, z: 3 });
  const entered = await state(page);
  expect(entered.head.x).toBeLessThan(-5.69);
  expect(entered.walkable).toBe(false);
  expect(entered.support.x).toBeGreaterThanOrEqual(-5.4);
  expect(entered.support.x).toBeLessThan(-5.4 + 1e-5);
  expect(entered.support.z).toBeCloseTo(3, 9);
  // Le joystick répond d'emblée le long du mur, sans pousser la tête vers lui.
  const along = await push(page, 0, -1, HEADSET, ONE_SECOND / 2);
  expect(along.dx).toBeCloseTo(0, 9);
  expect(along.dz).toBeCloseTo(-0.9, 6);
  expect(await push(page, -1, 0, HEADSET, ONE_SECOND / 2)).toEqual({ dx: 0, dz: 0 });

  // Pivot d'un cran vers la droite, autour de la tête : ni la tête ni le point d'appui ne changent de place.
  const beforeTurn = await state(page);
  await stick(page, 'right', 1, 0);
  await expect.poll(async () => (await state(page)).yaw).toBeCloseTo(-Math.PI / 6, 6);
  await stick(page, 'right', 0, 0);
  await frames(page, 2);
  const turned = await state(page);
  expect(turned.head.x).toBeCloseTo(beforeTurn.head.x, 6);
  expect(turned.head.z).toBeCloseTo(beforeTurn.head.z, 6);
  expect(turned.walkable).toBe(false);
  expect(turned.support.x).toBeCloseTo(beforeTurn.support.x, 9);
  expect(turned.support.z).toBeCloseTo(beforeTurn.support.z, 9);
  // Tourné de 30°, joystick vers la gauche : il vise le mur de biais, et le longe vers le nord sans s'en approcher.
  const slide = await push(page, -1, 0, HEADSET, ONE_SECOND / 2);
  expect(slide.dx).toBeCloseTo(0, 9);
  expect(slide.dz).toBeCloseTo(-0.9 * Math.sin(Math.PI / 6), 6);

  // Mur traversé. De vrais pas vers l'ouest : la tête est d'abord dans l'épaisseur du mur. Le joystick ne l'y enfonce
  // pas, mais répond encore : poussé de biais vers le mur, il le longe.
  await moveHead(page, -0.4, 0);
  const inWall = await state(page);
  expect(inWall.walkable).toBe(false);
  expect(inWall.support.x).toBeGreaterThanOrEqual(-5.4);
  expect(inWall.support.x).toBeLessThan(-5.4 + 1e-5);
  const pressed = await push(page, -1, 0, HEADSET, ONE_SECOND / 2);
  expect(pressed.dx).toBeCloseTo(0, 9);
  expect(pressed.dz).toBeCloseTo(-0.9 * Math.sin(Math.PI / 6), 6);
  // Encore 60 cm : sa tête est dans la rotonde (praticable à partir de x = -6,60). Il s'y appuie, et le joystick l'y promène.
  await moveHead(page, -0.6, 0);
  const crossed = await state(page);
  expect(crossed.head.x).toBeLessThan(-6.6);
  expect(crossed.walkable).toBe(true);
  expect(crossed.support.x).toBeCloseTo(crossed.head.x, 9);
  expect(crossed.support.z).toBeCloseTo(crossed.head.z, 9);
  // Joystick vers la droite (vers le hall, de biais) : c'est maintenant le mur de la rotonde qui l'arrête, au ras.
  await push(page, 1, 0, SLOW, 20);
  const rotonde = await state(page);
  expect(rotonde.head.x).toBeLessThan(-6.6 + 1e-9);
  expect(rotonde.head.x).toBeGreaterThan(-6.6 - 1e-5);

  // Téléportation, la tête hors zone : il se penche vers le hall, par-dessus la limite, puis vise le sol devant lui.
  await moveHead(page, 0.2, 0);
  expect((await state(page)).walkable).toBe(false);
  await aim(page, 'right', -35);
  await frames(page, 2);
  const beforeJump = await state(page);
  await page.evaluate(() => (window as any).xrDevice.controllers.right.updateButtonValue('trigger', 1));
  await expect
    .poll(async () => {
      const now = await state(page);
      return Math.hypot(now.head.x - beforeJump.head.x, now.head.z - beforeJump.head.z);
    })
    .toBeGreaterThan(1);
  await page.evaluate(() => (window as any).xrDevice.controllers.right.updateButtonValue('trigger', 0));
  await frames(page, 2);
  const jumped = await state(page);
  expect(jumped.walkable).toBe(true);
  expect(jumped.support.x).toBeCloseTo(jumped.head.x, 9);
  expect(jumped.support.z).toBeCloseTo(jumped.head.z, 9);

  // Sortie, la tête hors zone. Il recule jusqu'au mur ouest du hall, se penche par-dessus la limite, puis quitte le casque.
  await push(page, 0, 1, SLOW, 20);
  await moveHead(page, -0.3, 0);
  const leaving = await state(page);
  expect(leaving.walkable).toBe(false);
  await page.evaluate(() => (window as any).__museum.renderer.xr.getSession().end());
  await expect.poll(async () => (await state(page)).presenting).toBe(false);
  // À l'écran, il se retrouve à son point d'appui, en zone praticable, tourné comme dans le casque…
  const out = await state(page);
  expect(out.walkable).toBe(true);
  expect(out.head.x).toBeCloseTo(leaving.support.x, 9);
  expect(out.head.z).toBeCloseTo(leaving.support.z, 9);
  expect(Math.hypot(out.head.x - leaving.head.x, out.head.z - leaving.head.z)).toBeLessThan(0.4);
  expect(await page.evaluate(() => (window as any).__museum.controls.yaw as number)).toBeCloseTo(leaving.yaw, 9);
  // … d'où il repart à pied : une demi-seconde au clavier, à 60 images par seconde, le déplace de 1,20 m.
  const walked = await page.evaluate(() => {
    const { controls, camera } = (window as any).__museum;
    const from = { x: camera.position.x as number, z: camera.position.z as number };
    const key = (type: string) => document.body.dispatchEvent(new KeyboardEvent(type, { code: 'KeyW', bubbles: true }));
    key('keydown');
    for (let i = 0; i < 30; i++) controls.update(1 / 60);
    key('keyup');
    return Math.hypot(camera.position.x - from.x, camera.position.z - from.z);
  });
  expect(walked).toBeCloseTo(1.2, 6);
  expect(errors).toEqual([]);
});

test('entré en VR pendant qu’il est emmené devant une œuvre, le visiteur arrive devant elle, pas dans un mur', async ({ page }) => {
  await installHeadset(page);
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

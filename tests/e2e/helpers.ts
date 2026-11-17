import { expect, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

/**
 * Musée de test : un plan figé (quatre salles, 21 œuvres, deux parcours), indépendant
 * du musée de démonstration, pour que les tests ne cassent pas quand la démo change.
 */
const fixture = readFileSync(fileURLToPath(new URL('../fixtures/museum.json', import.meta.url)), 'utf8');
/** Image servie pour toute œuvre du musée de test dont l'image est un fichier (le tableau « Portée »). */
const fixtureImage = readFileSync(fileURLToPath(new URL('../fixtures/image.webp', import.meta.url)));

export interface OpenOptions {
  /** Paramètres d'adresse supplémentaires, par exemple "&vue=simple". */
  query?: string;
  /** Garde l'écran d'accueil, que les tests passent d'ordinaire pour entrer droit dans le musée. */
  welcome?: boolean;
  /** Remplace la voix de synthèse par un enregistreur : window.__spoken liste les textes lus. */
  spySpeech?: boolean;
  /** Fait comme si les fichiers d'images des œuvres n'existaient pas. */
  missingImages?: boolean;
  /** Configuration à servir à la place de celle du musée de test, par exemple une variante modifiée. */
  museum?: unknown;
}

/** Ouvre le musée de test et renvoie la liste (vivante) des erreurs survenues dans la page. */
export async function openMuseum(page: Page, options: OpenOptions = {}): Promise<string[]> {
  const errors: string[] = [];
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  page.on('pageerror', (e) => errors.push(String(e)));
  if (options.spySpeech) {
    await page.addInitScript(() => {
      const w = window as any;
      w.__spoken = [];
      speechSynthesis.speak = (u: SpeechSynthesisUtterance) => {
        w.__spoken.push({ lang: u.lang, text: u.text });
        w.__lastSpeech = u;
      };
    });
  }
  await page.route('**/museums/fixture/museum.json', (route) =>
    route.fulfill({ contentType: 'application/json', body: options.museum ? JSON.stringify(options.museum) : fixture }),
  );
  await page.route('**/museums/fixture/images/**', (route) =>
    options.missingImages ? route.fulfill({ status: 404, body: '' }) : route.fulfill({ contentType: 'image/webp', body: fixtureImage }),
  );
  // Qualité moyenne par défaut : le reflet du sol double le temps de rendu, calculé ici par le processeur.
  const query = options.query ?? '';
  await page.goto(`/?m=fixture${/[?&]q=/.test(query) ? '' : '&q=medium'}${options.welcome ? '' : '&accueil=non'}${query}`);
  await page.waitForSelector('body.ready');
  return errors;
}

export const position = (page: Page) =>
  page.evaluate(() => {
    const c = (window as any).__museum.camera.position;
    return { x: c.x as number, z: c.z as number };
  });

export const teleport = (page: Page, x: number, z: number, yaw: number) =>
  page.evaluate(([x, z, yaw]) => (window as any).__museum.controls.teleport(x, z, yaw), [x, z, yaw]);

/** Place le visiteur face à une œuvre puis clique dessus. */
export async function clickArtwork(page: Page, id: string, distance = 3) {
  await page.evaluate(([id, d]) => (window as any).__museum.standBefore(id, d), [id, distance] as const);
  await page.waitForTimeout(300);
  const p = await page.evaluate((id) => (window as any).__museum.screenOf(id), id);
  await page.mouse.click(p.x, p.y);
}

/** Maintient une touche jusqu'à ce que la condition soit vraie (ou que le délai expire). */
export async function holdUntil(page: Page, key: string, done: () => Promise<boolean>, timeout = 30_000) {
  await page.keyboard.down(key);
  try {
    await expect.poll(done, { timeout, intervals: [150] }).toBe(true);
  } finally {
    await page.keyboard.up(key);
  }
}

/**
 * Maintient une touche jusqu'à ce qu'un obstacle arrête le visiteur, et renvoie l'endroit où il s'arrête.
 *
 * Une fois le visiteur en marche, le test fait lui-même avancer le temps au lieu d'attendre les images,
 * à grands pas : un dixième de seconde, le plus long que la visite accorde à une image, comme sur un
 * appareil très lent. Le moteur amène le visiteur au ras de l'obstacle quelle que soit la durée des images :
 * de tout petits pas ne doivent donc plus le déplacer. L'aide le vérifie à chaque appel. Elle ne peut pas
 * masquer un retour de l'ancien défaut, où le visiteur s'arrêtait jusqu'à 24 cm avant l'obstacle quand
 * les images étaient lentes, puis s'en approchait par à-coups.
 */
export async function walkUntilBlocked(page: Page, key = 'KeyW') {
  const start = await position(page);
  await page.keyboard.down(key);
  try {
    // La touche est bien prise en compte : une image a déjà déplacé le visiteur.
    await expect
      .poll(async () => {
        const now = await position(page);
        return Math.hypot(now.x - start.x, now.z - start.z);
      }, { message: 'la touche maintenue aurait dû mettre le visiteur en marche' })
      .toBeGreaterThan(0);
    const creep = await page.evaluate(() => {
      const { controls, camera } = (window as any).__museum;
      // En dessous de 2 cm par seconde, le visiteur est tenu pour arrêté (il marche à 2,4 m par seconde).
      const STILL = 0.02;
      /** Avance par pas de `dt` secondes, jusqu'au premier pas qui ne déplace plus le visiteur. */
      const walk = (dt: number) => {
        for (let i = 0; i < 1000; i++) {
          const { x, z } = camera.position;
          controls.update(dt);
          if (Math.hypot(camera.position.x - x, camera.position.z - z) < STILL * dt) return true;
        }
        return false;
      };
      if (!walk(0.1)) return null;
      // Le visiteur est arrêté. De tout petits pas le rapprochent-ils encore de l'obstacle ?
      const { x, z } = camera.position;
      if (!walk(0.001)) return null;
      return Math.hypot(camera.position.x - x, camera.position.z - z);
    });
    expect(creep, 'le visiteur aurait dû finir par être arrêté').not.toBeNull();
    expect(creep, 'à grands pas, le visiteur aurait dû s’arrêter au ras de l’obstacle : de petits pas l’en ont encore approché').toBeLessThan(0.00001);
  } finally {
    await page.keyboard.up(key);
  }
  // Une image passe : le nom de la salle et le mini-plan sont à jour.
  await page.evaluate(() => new Promise<void>((done) => requestAnimationFrame(() => requestAnimationFrame(() => done()))));
  return position(page);
}

/**
 * Ralentit toutes les images, comme sur un appareil très lent, et note les positions successives du visiteur.
 * Chaque image est retenue plus d'un dixième de seconde : à pleine allure, le visiteur avance alors de 24 cm
 * par image, le pas le plus long que la visite accorde.
 * Renvoie `stopped`, qui attend que le visiteur ait marché puis soit resté immobile huit images de suite,
 * et donne les endroits où il s'est trouvé, dans l'ordre, départ compris.
 */
export async function slowFrames(page: Page) {
  await page.evaluate(() => {
    const w = window as any;
    const camera = w.__museum.camera;
    const walk = { path: [{ x: camera.position.x as number, z: camera.position.z as number }], still: 0 };
    w.__walk = walk;
    const tick = () => {
      const until = performance.now() + 120;
      while (performance.now() < until);
      const last = walk.path[walk.path.length - 1];
      if (camera.position.x !== last.x || camera.position.z !== last.z) {
        walk.path.push({ x: camera.position.x, z: camera.position.z });
        walk.still = 0;
      } else {
        walk.still++;
      }
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
  const walk = () => page.evaluate(() => (window as any).__walk as { path: { x: number; z: number }[]; still: number });
  // Les images lentes sont en place avant que le visiteur se mette en marche : son premier pas sera déjà un grand pas.
  await expect.poll(async () => (await walk()).still).toBeGreaterThanOrEqual(2);
  return {
    async stopped() {
      await expect
        .poll(async () => {
          const { path, still } = await walk();
          return path.length > 1 && still >= 8;
        }, { timeout: 30_000, message: 'le visiteur aurait dû marcher, puis être arrêté' })
        .toBe(true);
      return (await walk()).path;
    },
  };
}

/**
 * Tient l'horloge de la visite : les images continuent d'être dessinées, mais le visiteur ne bouge plus
 * que lorsque le test fait avancer le temps. Un vrai geste (souris, clavier, doigt) arrive ainsi à l'instant
 * voulu d'un déplacement en douceur, quelle que soit la vitesse de l'ordinateur : laissé à lui-même,
 * un tel déplacement ne passe que quelques centièmes de seconde dans l'épaisseur d'un mur.
 */
export async function holdClock(page: Page) {
  await page.evaluate(() => {
    const w = window as any;
    const controls = w.__museum.controls;
    w.__clock = controls.update.bind(controls);
    // La visite appelle cette fonction à chaque image : tant que l'horloge est tenue, elle ne fait plus rien.
    controls.update = () => {};
  });
  /** Fait passer des images d'un soixantième de seconde tant que le déplacement en douceur dure, et renvoie le temps écoulé. */
  const pass = (whileWalkable: boolean) =>
    page.evaluate((whileWalkable) => {
      const w = window as any;
      const { controls, camera, world } = w.__museum;
      let frames = 0;
      while (controls.gliding && frames < 6000 && !(whileWalkable && !world.walkable(camera.position.x, camera.position.z))) {
        w.__clock(1 / 60);
        frames++;
      }
      return frames / 60;
    }, whileWalkable);
  return {
    /** Avance jusqu'à la première image où le visiteur, emmené en douceur, n'est plus à un endroit praticable. */
    untilOutside: () => pass(true),
    /** Avance jusqu'à la fin du déplacement en douceur, et renvoie sa durée en secondes. */
    untilArrived: () => pass(false),
    /** Rend l'horloge à la visite : le visiteur bouge de nouveau à chaque image. */
    release: () => page.evaluate(() => delete (window as any).__museum.controls.update),
  };
}

/** Le visiteur est-il à un endroit où il peut se tenir (ni mur, ni banc, ni socle) ? */
export const onWalkableGround = (page: Page) =>
  page.evaluate(() => {
    const { world, camera } = (window as any).__museum;
    return world.walkable(camera.position.x, camera.position.z) as boolean;
  });

export const roomName = (page: Page) => page.locator('#room-name');
export const panel = (page: Page) => page.locator('#panel');

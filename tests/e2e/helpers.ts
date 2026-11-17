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
 * Une fois le visiteur en marche, le test fait lui-même avancer le temps au lieu d'attendre les images :
 * d'abord à grands pas (un dixième de seconde, le plus long que la visite accorde à une image, comme sur un
 * appareil très lent), puis à tout petits pas pour trouver l'endroit exact.
 * Attendre « quelques relevés sans mouvement » ne suffit pas. Quand les images sont lentes, le visiteur
 * s'arrête jusqu'à 24 cm avant l'obstacle, puis ne s'en approche que par à-coups, espacés d'une demi-seconde
 * ou davantage : entre deux à-coups, il passerait pour arrêté.
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
    const blocked = await page.evaluate(() => {
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
      return walk(0.1) && walk(0.001);
    });
    expect(blocked, 'le visiteur aurait dû finir par être arrêté').toBe(true);
  } finally {
    await page.keyboard.up(key);
  }
  // Une image passe : le nom de la salle et le mini-plan sont à jour.
  await page.evaluate(() => new Promise<void>((done) => requestAnimationFrame(() => requestAnimationFrame(() => done()))));
  return position(page);
}

export const roomName = (page: Page) => page.locator('#room-name');
export const panel = (page: Page) => page.locator('#panel');

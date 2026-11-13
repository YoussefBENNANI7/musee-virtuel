import { expect, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

/**
 * Musée de test : un plan figé (quatre salles, 21 œuvres, deux parcours), indépendant
 * du musée de démonstration, pour que les tests ne cassent pas quand la démo change.
 */
const fixture = readFileSync(fileURLToPath(new URL('../fixtures/museum.json', import.meta.url)), 'utf8');

export interface OpenOptions {
  /** Paramètres d'adresse supplémentaires, par exemple "&vue=simple". */
  query?: string;
  /** Remplace la voix de synthèse par un enregistreur : window.__spoken liste les textes lus. */
  spySpeech?: boolean;
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
    route.fulfill({ contentType: 'application/json', body: fixture }),
  );
  await page.goto(`/?m=fixture${options.query ?? ''}`);
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

/** Maintient une touche jusqu'à ce que le visiteur ne bouge plus : il est arrêté par un obstacle. */
export async function walkUntilBlocked(page: Page, key = 'KeyW') {
  await page.keyboard.down(key);
  let last = await position(page);
  let still = 0;
  for (let i = 0; i < 150 && still < 4; i++) {
    await page.waitForTimeout(250);
    const now = await position(page);
    still = Math.hypot(now.x - last.x, now.z - last.z) < 0.005 ? still + 1 : 0;
    last = now;
  }
  await page.keyboard.up(key);
  expect(still, 'le visiteur aurait dû finir par être arrêté').toBeGreaterThanOrEqual(4);
  return last;
}

export const roomName = (page: Page) => page.locator('#room-name');
export const panel = (page: Page) => page.locator('#panel');

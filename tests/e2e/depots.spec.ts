import { expect, test } from '@playwright/test';
import { DEV_URL, PROD_URL } from '../../playwright.config';

// Un musée client a son propre dépôt privé : son dossier contient alors un dossier .git, avec tout
// l'historique du musée. Ni le serveur du musée (ouvert au réseau local) ni la version publiée ne le montrent.
const interdites = [
  '/museums/120-ans/.git/config',
  '/museums/120-ans/.git/HEAD',
  '/museums/120-ans/.git',
  '/museums/demo/.GIT/config',
  '/museums/demo/%2Egit/config',
  '/museums/demo/%252Egit/HEAD',
];

for (const [name, base] of [
  ['le serveur du musée', DEV_URL],
  ['la version publiée', PROD_URL],
]) {
  test(`${name} ne montre jamais les fichiers internes d’un dépôt de musée`, async ({ request }) => {
    for (const path of interdites) {
      expect((await request.get(base + path)).status(), path).toBe(404);
    }
    // Le reste du musée est servi normalement.
    const museum = await request.get(`${base}/museums/demo/museum.json`);
    expect(museum.status()).toBe(200);
    expect((await museum.json()).id).toBe('demo');
  });
}

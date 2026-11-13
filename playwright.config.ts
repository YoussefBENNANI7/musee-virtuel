import { defineConfig } from '@playwright/test';

/** Ports réservés aux tests, pour ne pas gêner un serveur de développement déjà lancé. */
export const DEV_URL = 'http://localhost:5199';
export const PROD_URL = 'http://localhost:5198';

export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 120_000,
  expect: { timeout: 20_000 },
  // Le rendu 3D des tests est calculé par le processeur : trop de tests en parallèle les ralentit tous.
  workers: 2,
  reporter: [['list']],
  use: {
    baseURL: DEV_URL,
    locale: 'fr-FR',
    viewport: { width: 1280, height: 720 },
    trace: 'off',
    launchOptions: { args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] },
  },
  webServer: [
    {
      command: 'npm run dev -- --port 5199 --strictPort',
      url: DEV_URL,
      reuseExistingServer: true,
    },
    {
      // La version publiée, telle qu'elle sera hébergée.
      command: 'npm run build && npx vite preview --port 5198 --strictPort',
      url: PROD_URL,
      reuseExistingServer: true,
      timeout: 180_000,
    },
  ],
});

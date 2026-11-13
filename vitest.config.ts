import { defineConfig } from 'vitest/config';

// Tests unitaires seulement : les tests de tests/e2e sont joués par Playwright.
export default defineConfig({
  test: { include: ['tests/unit/**/*.test.ts'] },
});

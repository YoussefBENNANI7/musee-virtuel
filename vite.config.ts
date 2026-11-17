import { defineConfig } from 'vite';
// @ts-expect-error Module JavaScript sans déclaration de types : il n'est lu que par Vite.
import { editorService } from './scripts/editeur-serveur.mjs';

export default defineConfig({
  base: './',
  server: { port: 5173 },
  // L'éditeur de musée écrit sur le disque par ce service, présent seulement pendant « npm run dev ».
  plugins: [editorService()],
});

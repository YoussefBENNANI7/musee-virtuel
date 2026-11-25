import { defineConfig } from 'vite';
// @ts-expect-error Module JavaScript sans déclaration de types : il n'est lu que par Vite.
import { editorService } from './scripts/editeur-serveur.mjs';
// @ts-expect-error Module JavaScript sans déclaration de types : il n'est lu que par Vite.
import { protectionDepots } from './scripts/protection-depots.mjs';

export default defineConfig({
  base: './',
  server: { port: 5173 },
  plugins: [
    // En premier : le dossier .git d'un musée client n'est jamais servi, ni copié dans la version publiable.
    protectionDepots(),
    // L'éditeur de musée écrit sur le disque par ce service, présent seulement pendant « npm run dev ».
    editorService(),
  ],
});

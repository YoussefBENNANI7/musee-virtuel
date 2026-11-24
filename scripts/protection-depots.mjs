// Les fichiers internes d'un dépôt git ne quittent jamais l'ordinateur.
//
// Un musée client a son propre dépôt privé (voir scripts/musee.mjs) : son dossier
// public/museums/<musée>/ contient alors un dossier .git, avec tout l'historique du musée et l'adresse
// de son dépôt. Vite protège déjà le .git du moteur, mais pas ce qui se trouve dans public/ : sans cette
// extension, le serveur du musée (« npm run dev », ouvert à tout le réseau local) montrerait ce dossier
// à qui le demande, et la version publiable (« npm run build ») le recopierait.
import { readdirSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';

/**
 * Vrai si l'adresse demandée mène dans un dossier .git ou sur un fichier .git, même écrite de façon
 * détournée : encodée, une ou plusieurs fois (%2Egit, %252Egit), ou en majuscules (le disque d'un Mac
 * ne distingue pas .GIT de .git).
 */
export function cheminInterdit(url) {
  let path = String(url ?? '').split(/[?#]/)[0];
  for (let i = 0; i < 5; i++) {
    let next;
    try {
      next = decodeURIComponent(path);
    } catch {
      // Une adresse mal encodée n'est jamais celle d'un fichier du musée.
      return true;
    }
    if (next === path) break;
    path = next;
  }
  return path.split(/[\\/]+/).some((part) => part.trim().toLowerCase() === '.git');
}

/** Retire du dossier tout ce qui s'appelle .git (dossier ou fichier), à toute profondeur. Renvoie les chemins retirés. */
export function retirerDepots(dir) {
  const removed = [];
  const walk = (folder) => {
    let entries;
    try {
      entries = readdirSync(folder, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const path = join(folder, entry.name);
      if (entry.name.toLowerCase() === '.git') {
        rmSync(path, { recursive: true, force: true });
        removed.push(path);
      } else if (entry.isDirectory()) {
        // Un lien symbolique n'est pas suivi : on ne sort jamais du dossier donné.
        walk(path);
      }
    }
  };
  walk(dir);
  return removed;
}

/**
 * Extension de Vite : répond « introuvable » à ces adresses, sur le serveur du musée comme sur l'aperçu
 * de la version publiable, et les retire de la version publiable.
 */
export function protectionDepots() {
  let outDir = '';
  let build = false;
  const refuse = (req, res, next) => {
    if (!cheminInterdit(req.url)) return next();
    res.statusCode = 404;
    res.setHeader('Cache-Control', 'no-store');
    res.end();
  };
  return {
    name: 'musee-protection-depots',
    configResolved(config) {
      outDir = resolve(config.root, config.build.outDir);
      build = config.command === 'build';
    },
    // Installée avant les services de Vite : la demande est refusée avant qu'un fichier soit cherché.
    configureServer(server) {
      server.middlewares.use(refuse);
    },
    configurePreviewServer(server) {
      server.middlewares.use(refuse);
    },
    closeBundle() {
      if (!build) return;
      const removed = retirerDepots(outDir);
      if (removed.length) console.log(`Protection : ${removed.length} dossier(s) .git retiré(s) de la version publiable.`);
    },
  };
}

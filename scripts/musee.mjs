// Relie un musée de cet ordinateur à son dépôt privé, puis le tient à jour dans les deux sens.
//
// Le dépôt du moteur est public : un musée client n'y entre jamais. Chaque musée client a donc son propre
// dépôt privé, dont le dossier public/museums/<musée>/ est la copie de travail. Le musée de démonstration,
// lui, fait partie du dépôt du moteur.
//
// Usage :
//   npm run musee -- relier 120-ans https://github.com/<compte>/musee-120-ans.git
//       Une seule fois par ordinateur. Si le dossier du musée existe, il devient la copie du dépôt, qui doit
//       être vide, et tout son contenu y est envoyé. Sinon, le musée est téléchargé depuis le dépôt.
//   npm run musee -- synchroniser            (tous les musées reliés)
//   npm run musee -- synchroniser 120-ans
//       Enregistre les changements faits sur cet ordinateur (éditeur, lumière, paquets), reçoit ceux faits
//       ailleurs (une autre conversation, un autre ordinateur), puis envoie le tout.
//
// Rien ne se perd : chaque envoi est gardé dans l'historique du dépôt. Si les mêmes fichiers ont changé
// des deux côtés, la synchronisation s'arrête sans rien écraser.
// Les fichiers internes du dépôt (.git) ne sont jamais servis par le serveur du musée ni copiés dans la
// version publiable : voir scripts/protection-depots.mjs.
import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const MUSEUMS = fileURLToPath(new URL('../public/museums/', import.meta.url));
const ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const BRANCH = 'main';
/** Fichiers propres à un ordinateur, jamais envoyés. */
const IGNORE = '# Fichiers propres à un ordinateur, jamais envoyés.\n.DS_Store\n._*\n*.tmp\n';

/** Une erreur expliquée en clair : le message suffit, sans détail technique. */
export class MuseeError extends Error {}

/**
 * Lance git dans un dossier. En mode interactif, git parle directement à la personne : c'est ainsi qu'il
 * peut demander l'identifiant et le jeton GitHub au premier envoi.
 */
function git(cwd, args, { interactive = false } = {}) {
  const result = spawnSync('git', args, { cwd, encoding: 'utf8', stdio: interactive ? 'inherit' : ['ignore', 'pipe', 'pipe'] });
  if (result.error) throw new MuseeError(`git est introuvable sur cet ordinateur (${result.error.message})`);
  return { ok: result.status === 0, out: (result.stdout ?? '').trim(), err: (result.stderr ?? '').trim() };
}

function checkId(id) {
  if (id === 'demo') throw new MuseeError('le musée de démonstration fait partie du dépôt du moteur : il n’a pas de dépôt à lui');
  if (!id || !ID.test(id)) throw new MuseeError(`nom de musée invalide : « ${id ?? ''} » (exemple : 120-ans)`);
}

const linked = (dir) => existsSync(join(dir, '.git'));

/** Les musées de ce dossier qui ont leur dépôt. */
export function linkedMuseums(museumsDir = MUSEUMS) {
  if (!existsSync(museumsDir)) return [];
  return readdirSync(museumsDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && entry.name !== 'demo' && linked(join(museumsDir, entry.name)))
    .map((entry) => entry.name)
    .sort();
}

/** Sans identité git sur cet ordinateur, un enregistrement est refusé : on en donne une, propre à ce dépôt. */
function ensureIdentity(dir) {
  if (!git(dir, ['config', 'user.email']).out) git(dir, ['config', 'user.email', 'porteur@musee-virtuel.invalid']);
  if (!git(dir, ['config', 'user.name']).out) git(dir, ['config', 'user.name', 'Ordinateur du porteur']);
}

/**
 * Relie le musée à son dépôt. Si l'envoi échoue, le dossier redevient exactement comme avant :
 * on corrige (jeton, adresse) et l'on relance la même commande.
 */
export function relier(id, url, { museumsDir = MUSEUMS, interactive = false } = {}) {
  checkId(id);
  if (!url || !/^(https:\/\/|ssh:\/\/|git@|file:\/\/|\/)/.test(url)) {
    throw new MuseeError('adresse du dépôt manquante ou invalide (exemple : https://github.com/compte/musee-120-ans.git)');
  }
  const dir = join(museumsDir, id);

  if (!existsSync(dir)) {
    const clone = git(museumsDir, ['clone', '--branch', BRANCH, url, id], { interactive });
    if (!clone.ok) {
      rmSync(dir, { recursive: true, force: true });
      throw new MuseeError(`téléchargement impossible depuis ${url} : vérifiez l’adresse et vos droits sur ce dépôt`);
    }
    if (!existsSync(join(dir, 'museum.json'))) {
      rmSync(dir, { recursive: true, force: true });
      throw new MuseeError('ce dépôt ne contient pas de museum.json : ce n’est pas un musée');
    }
    return { id, action: 'téléchargé' };
  }

  if (!existsSync(join(dir, 'museum.json'))) throw new MuseeError(`le dossier « ${id} » ne contient pas de museum.json : ce n’est pas un musée`);
  if (linked(dir)) {
    const current = git(dir, ['remote', 'get-url', 'origin']).out;
    if (current !== url) throw new MuseeError(`ce musée est déjà relié à un autre dépôt (${current || 'sans adresse'})`);
    return { id, action: 'déjà relié' };
  }

  const ignore = join(dir, '.gitignore');
  const createdIgnore = !existsSync(ignore);
  const undo = () => {
    rmSync(join(dir, '.git'), { recursive: true, force: true });
    if (createdIgnore) rmSync(ignore, { force: true });
  };
  try {
    if (createdIgnore) writeFileSync(ignore, IGNORE);
    if (!git(dir, ['init', '--initial-branch', BRANCH]).ok) throw new MuseeError('création du dépôt local impossible');
    ensureIdentity(dir);
    git(dir, ['add', '--all']);
    if (!git(dir, ['commit', '--quiet', '--message', `Musée « ${id} » : premier envoi, depuis cet ordinateur`]).ok) {
      throw new MuseeError('enregistrement du musée impossible');
    }
    git(dir, ['remote', 'add', 'origin', url]);
    if (!git(dir, ['push', '--set-upstream', 'origin', BRANCH], { interactive }).ok) {
      throw new MuseeError(
        'envoi refusé. Le dossier du musée est resté comme avant. Vérifiez que le dépôt existe, qu’il est vide (sans README) ' +
          'et que l’identifiant et le jeton donnés sont les bons, puis relancez la même commande.',
      );
    }
  } catch (error) {
    undo();
    throw error;
  }
  return { id, action: 'relié' };
}

const head = (dir) => git(dir, ['rev-parse', 'HEAD']).out;

/** Enregistre les changements de cet ordinateur, reçoit ceux faits ailleurs, envoie le tout. */
export function synchroniser(id, { museumsDir = MUSEUMS, interactive = false, now = new Date() } = {}) {
  checkId(id);
  const dir = join(museumsDir, id);
  if (!existsSync(dir)) throw new MuseeError(`aucun musée « ${id} » sur cet ordinateur`);
  if (!linked(dir)) throw new MuseeError(`le musée « ${id} » n’est pas encore relié à son dépôt : lancez d’abord « npm run musee -- relier ${id} <adresse> »`);
  ensureIdentity(dir);

  git(dir, ['add', '--all']);
  const local = !git(dir, ['diff', '--cached', '--quiet']).ok;
  if (local) {
    const when = now.toLocaleString('fr-FR', { dateStyle: 'long', timeStyle: 'short' });
    if (!git(dir, ['commit', '--quiet', '--message', `Changements faits sur cet ordinateur (${when})`]).ok) {
      throw new MuseeError('enregistrement des changements impossible');
    }
  }

  const before = head(dir);
  // --no-rebase et --ff l'emportent sur les réglages de git propres à cet ordinateur : on réunit toujours les deux versions.
  const pull = git(dir, ['pull', '--no-rebase', '--ff', '--no-edit', 'origin', BRANCH], { interactive });
  if (!pull.ok) {
    const merging = existsSync(join(dir, '.git', 'MERGE_HEAD'));
    if (merging) {
      git(dir, ['merge', '--abort']);
      throw new MuseeError(
        'les mêmes fichiers ont changé ici et ailleurs. Rien n’est perdu : vos changements sont enregistrés sur cet ordinateur, ' +
          'mais pas encore envoyés. Demandez à Claude de réunir les deux versions.',
      );
    }
    throw new MuseeError('réception impossible : vérifiez la connexion à internet et vos droits sur le dépôt. Vos changements restent enregistrés sur cet ordinateur');
  }
  const received = head(dir) !== before;

  const remote = git(dir, ['rev-parse', `origin/${BRANCH}`]).out;
  const sent = head(dir) !== remote;
  if (sent && !git(dir, ['push', 'origin', BRANCH], { interactive }).ok) {
    throw new MuseeError('envoi impossible : vos changements sont enregistrés sur cet ordinateur ; relancez la synchronisation plus tard');
  }
  return { id, local, received, sent };
}

function main() {
  const [action, ...args] = process.argv.slice(2);
  const options = { interactive: true };
  try {
    if (action === 'relier' && args.length === 2) {
      const { id, action: done } = relier(args[0], args[1], options);
      const what = { relié: 'relié à son dépôt, tout son contenu y est envoyé', téléchargé: 'téléchargé depuis son dépôt', 'déjà relié': 'déjà relié à ce dépôt' };
      console.log(`✓ Musée « ${id} » : ${what[done]}.`);
      console.log(`Ensuite, pour le tenir à jour dans les deux sens : npm run musee -- synchroniser`);
    } else if (action === 'synchroniser') {
      const ids = args.length ? args : linkedMuseums();
      if (!ids.length) throw new MuseeError('aucun musée de cet ordinateur n’est relié à un dépôt');
      for (const one of ids) {
        const { id, received, sent } = synchroniser(one, options);
        const what = received && sent ? 'changements reçus et envoyés' : received ? 'changements reçus' : sent ? 'changements envoyés' : 'déjà à jour';
        console.log(`✓ Musée « ${id} » : ${what}.`);
      }
      console.log('Si l’éditeur affiche « Lumière à recalculer », cliquer sur « Recalculer la lumière ».');
    } else {
      console.error('Usage :');
      console.error('  npm run musee -- relier <musée> <adresse du dépôt>');
      console.error('  npm run musee -- synchroniser [<musée>]');
      process.exitCode = 1;
    }
  } catch (error) {
    if (!(error instanceof MuseeError)) throw error;
    console.error(`✗ ${error.message}`);
    process.exitCode = 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();

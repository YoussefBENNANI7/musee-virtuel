// Applique un paquet de mise à jour à un musée de cet ordinateur.
//
// Usage :
//   npm run maj -- 120-ans ~/Downloads/maj-120-ans-01.zip
//   npm run maj -- 120-ans ~/Downloads/maj-120-ans-01          (le même paquet, déjà décompressé)
//   npm run maj -- 120-ans ~/Downloads/maj-120-ans-01.zip --essai   (montre ce qui changerait, sans rien écrire)
//   npm run maj -- 120-ans ~/Downloads/maj-120-ans-02.zip ~/Downloads/maj-120-ans-03.zip   (plusieurs paquets, dans l'ordre)
//
// Un paquet est un dossier (ou son archive .zip) qui contient :
//   - maj.json : le musée visé, un titre, la liste des fichiers à poser et les retouches des œuvres ;
//   - les fichiers eux-mêmes, rangés comme dans le musée (images/…, models/…, audio/…).
//
// Exemple de maj.json :
//   {
//     "musee": "120-ans",
//     "titre": "Deux images validées",
//     "fichiers": ["images/ryal-paris-1336.webp"],
//     "oeuvres": { "ryal-paris": { "credit": { "fr": "Image : exemplaire du même type." } } }
//   }
// Dans "oeuvres", chaque champ donné remplace celui de l'œuvre ; un objet est fusionné avec l'existant ;
// la valeur null retire le champ. Rien d'autre n'est touché dans le musée.
//
// Un paquet peut aussi retirer des œuvres et en ajouter :
//     "retirer": ["billet-02"],
//     "ajouter": { "chambre-forte": [ { "id": "billet-nouveau", "type": "painting", … } ] }
// Une œuvre retirée ne doit être l'étape d'aucun parcours ; une œuvre ajoutée porte un identifiant nouveau,
// et sa salle doit exister.
//
// Avant d'écrire, tout est vérifié, puis l'état précédent est copié dans musees-sauvegardes/ : si une
// vérification échoue, le musée reste exactement comme il était.
import { execFileSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, normalize, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
export const MUSEUMS_DIR = join(ROOT, 'public', 'museums');
export const BACKUP_DIR = join(ROOT, 'musees-sauvegardes');

/** Dossiers d'un musée où un paquet a le droit de poser des fichiers. */
const FOLDERS = ['images', 'models', 'audio'];

const isSlug = (value) => typeof value === 'string' && /^[a-z0-9][a-z0-9-]{0,47}$/.test(value);
const isPlain = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);

/** Chemin d'un fichier du paquet, sans danger pour le disque : relatif, dans un dossier permis, sans remontée. */
export function safePath(path) {
  if (typeof path !== 'string' || !path || path.includes('\\') || path.startsWith('/')) return null;
  const parts = path.split('/');
  if (parts.length < 2 || !FOLDERS.includes(parts[0])) return null;
  if (parts.some((part) => !part || part === '.' || part === '..' || part.startsWith('.'))) return null;
  return normalize(parts.join(sep));
}

/** Retouche d'une œuvre : les champs donnés remplacent, les objets se fusionnent, null retire. */
export function patchArtwork(art, patch) {
  const out = { ...art };
  for (const [key, value] of Object.entries(patch)) {
    if (value === null) delete out[key];
    else if (isPlain(value) && isPlain(out[key])) out[key] = patchArtwork(out[key], value);
    else out[key] = value;
  }
  return out;
}

/** Fichiers qu'une œuvre fait charger : son image, son verso, son modèle, la face d'une pièce, ses photographies, ses voix. */
function filesOf(art) {
  const files = [art.image?.src, art.back?.src, art.model?.src, art.model?.coin, art.model?.coinBack, art.photo, art.sourcePhoto];
  // Un modèle préparé pour le web se charge depuis models/web/, en version complète ou légère.
  if (art.model?.web && typeof art.model.src === 'string') {
    const slash = art.model.src.lastIndexOf('/');
    const name = art.model.src.slice(slash + 1).replace(/\.[^.]+$/, '');
    files.push(`${art.model.src.slice(0, slash + 1)}web/${name}.glb`, `${art.model.src.slice(0, slash + 1)}web/${name}-leger.glb`);
  }
  for (const audio of [art.audio, art.testimony?.audio]) if (isPlain(audio)) files.push(...Object.values(audio));
  return files.filter((file) => typeof file === 'string');
}

/** Tous les fichiers d'un dossier, en chemins relatifs. */
function walk(dir, base = '') {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = base ? `${base}/${entry.name}` : entry.name;
    return entry.isDirectory() ? walk(join(dir, entry.name), path) : [path];
  });
}

/**
 * Lit et vérifie un paquet contre le musée visé, sans rien écrire.
 * Renvoie le plan : fichiers à poser, œuvres retouchées, et la configuration telle qu'elle serait enregistrée.
 * Lève une erreur en français à la première anomalie.
 */
export function planUpdate(museumId, packageDir, museumsDir = MUSEUMS_DIR) {
  if (!isSlug(museumId)) throw new Error(`nom de musée invalide : « ${museumId} »`);
  const folder = join(museumsDir, museumId);
  const configPath = join(folder, 'museum.json');
  if (!existsSync(configPath)) throw new Error(`musée introuvable : ${configPath}`);
  const manifestPath = join(packageDir, 'maj.json');
  if (!existsSync(manifestPath)) throw new Error(`ce dossier n'est pas un paquet de mise à jour : il n'a pas de fichier maj.json (${packageDir})`);

  let manifest;
  let museum;
  try {
    manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  } catch (error) {
    throw new Error(`maj.json illisible : ${error.message}`);
  }
  try {
    museum = JSON.parse(readFileSync(configPath, 'utf8'));
  } catch (error) {
    throw new Error(`museum.json illisible : ${error.message}`);
  }
  if (!isPlain(manifest)) throw new Error('maj.json illisible : un objet est attendu');
  if (manifest.musee !== museumId) throw new Error(`ce paquet est destiné au musée « ${manifest.musee} », pas à « ${museumId} »`);
  if (!Array.isArray(museum.rooms)) throw new Error('museum.json illisible : pas de salles');

  // Fichiers : chacun doit être déclaré, sûr, et présent dans le paquet.
  const files = manifest.fichiers ?? [];
  if (!Array.isArray(files)) throw new Error('maj.json : « fichiers » doit être une liste');
  const copies = files.map((path) => {
    const safe = safePath(path);
    if (!safe) throw new Error(`fichier refusé : « ${path} » (attendu : images/…, models/… ou audio/…)`);
    const source = join(packageDir, safe);
    if (!existsSync(source) || !statSync(source).isFile()) throw new Error(`fichier annoncé mais absent du paquet : ${path}`);
    return { path, source, target: join(folder, safe), replaces: existsSync(join(folder, safe)), size: statSync(source).size };
  });
  if (new Set(files).size !== files.length) throw new Error('maj.json : un fichier est annoncé deux fois');
  // Un fichier glissé dans le paquet sans être déclaré est sans doute un oubli : mieux vaut le dire.
  const extras = FOLDERS.filter((name) => existsSync(join(packageDir, name)))
    .flatMap((name) => walk(join(packageDir, name), name))
    .filter((path) => !files.includes(path) && !path.split('/').pop().startsWith('.'));
  if (extras.length) throw new Error(`fichier présent dans le paquet mais absent de maj.json : ${extras.join(', ')}`);

  // Œuvres : chacune doit exister dans le musée.
  const patches = manifest.oeuvres ?? {};
  if (!isPlain(patches)) throw new Error('maj.json : « oeuvres » doit être un objet');
  const known = new Map(museum.rooms.flatMap((room) => (room.artworks ?? []).map((art) => [art.id, room.id])));
  for (const [id, patch] of Object.entries(patches)) {
    if (!known.has(id)) throw new Error(`œuvre inconnue dans ce musée : « ${id} »`);
    if (!isPlain(patch)) throw new Error(`retouche illisible pour l'œuvre « ${id} »`);
    if ('id' in patch) throw new Error(`une mise à jour ne change pas l'identifiant d'une œuvre (« ${id} »)`);
  }

  // Œuvres à retirer : chacune doit exister, sans être retouchée par le même paquet ni servir d'étape à un parcours.
  const removals = manifest.retirer ?? [];
  if (!Array.isArray(removals) || removals.some((id) => typeof id !== 'string')) throw new Error('maj.json : « retirer » doit être une liste d’identifiants d’œuvres');
  if (new Set(removals).size !== removals.length) throw new Error('maj.json : une œuvre est à retirer deux fois');
  for (const id of removals) {
    if (!known.has(id)) throw new Error(`œuvre à retirer inconnue dans ce musée : « ${id} »`);
    if (patches[id]) throw new Error(`l'œuvre « ${id} » est à la fois retouchée et retirée`);
    const tour = (museum.tours ?? []).find((t) => (t.stops ?? []).includes(id));
    if (tour) throw new Error(`l'œuvre « ${id} » est une étape du parcours « ${tour.id} » : elle ne peut pas être retirée`);
  }

  // Œuvres à ajouter, salle par salle : la salle existe, l'identifiant est nouveau.
  const additions = manifest.ajouter ?? {};
  if (!isPlain(additions)) throw new Error('maj.json : « ajouter » doit être un objet : { "salle": [œuvres] }');
  const roomIds = new Set(museum.rooms.map((room) => room.id));
  const taken = new Set([...known.keys(), ...(museum.reserve ?? []).map((art) => art.id)]);
  const added = [];
  for (const [roomId, list] of Object.entries(additions)) {
    if (!roomIds.has(roomId)) throw new Error(`salle inconnue dans ce musée : « ${roomId} »`);
    if (!Array.isArray(list)) throw new Error(`maj.json : les œuvres à ajouter dans la salle « ${roomId} » doivent former une liste`);
    for (const art of list) {
      if (!isPlain(art) || !isSlug(art.id)) throw new Error(`œuvre à ajouter illisible dans la salle « ${roomId} » : un identifiant simple est attendu`);
      if (taken.has(art.id)) throw new Error(`l'œuvre à ajouter « ${art.id} » existe déjà dans ce musée`);
      taken.add(art.id);
      added.push({ id: art.id, room: roomId });
    }
  }
  if (!copies.length && !Object.keys(patches).length && !removals.length && !added.length) throw new Error('ce paquet ne contient rien à appliquer');

  const gone = new Set(removals);
  const fresh = new Set(added.map((art) => art.id));
  const updated = {
    ...museum,
    rooms: museum.rooms.map((room) => ({
      ...room,
      artworks: [
        ...(room.artworks ?? []).filter((art) => !gone.has(art.id)).map((art) => (patches[art.id] ? patchArtwork(art, patches[art.id]) : art)),
        ...(additions[room.id] ?? []).map((art) => JSON.parse(JSON.stringify(art))),
      ],
    })),
  };
  // Après la mise à jour, chaque œuvre retouchée ou ajoutée doit trouver ses fichiers.
  const arriving = new Set(copies.map((copy) => copy.path));
  for (const room of updated.rooms)
    for (const art of room.artworks)
      if (patches[art.id] || fresh.has(art.id))
        for (const file of filesOf(art))
          if (!arriving.has(file) && !existsSync(join(folder, file))) throw new Error(`l'œuvre « ${art.id} » attendrait un fichier qui n'existe pas : ${file}`);

  const artworks = Object.entries(patches).map(([id, patch]) => ({ id, room: known.get(id), fields: Object.keys(patch) }));
  const removed = removals.map((id) => ({ id, room: known.get(id) }));
  return { museumId, title: typeof manifest.titre === 'string' ? manifest.titre : '', folder, configPath, copies, artworks, added, removed, museum: updated, changed: JSON.stringify(updated) !== JSON.stringify(museum) };
}

/**
 * Applique un paquet : sauvegarde ce qui va changer, pose les fichiers, enregistre la configuration.
 * Renvoie le plan, complété par l'endroit de la sauvegarde.
 */
export function applyUpdate(museumId, packageDir, { museumsDir = MUSEUMS_DIR, backupDir = BACKUP_DIR, now = new Date() } = {}) {
  const plan = planUpdate(museumId, packageDir, museumsDir);
  // 2026-11-19-16-30-05 : lisible, et deux mises à jour du même musée ne se marchent pas dessus.
  const stamp = now.toISOString().slice(0, 19).replace(/[T:]/g, '-');
  let backup = join(backupDir, museumId, stamp);
  for (let n = 2; existsSync(backup); n++) backup = join(backupDir, museumId, `${stamp}-${n}`);
  mkdirSync(backup, { recursive: true });
  copyFileSync(plan.configPath, join(backup, 'museum.json'));
  for (const copy of plan.copies) {
    if (!copy.replaces) continue;
    const kept = join(backup, normalize(copy.path));
    mkdirSync(dirname(kept), { recursive: true });
    copyFileSync(copy.target, kept);
  }
  for (const copy of plan.copies) {
    mkdirSync(dirname(copy.target), { recursive: true });
    // On écrit à côté puis on remplace : une coupure ne laisse jamais un fichier tronqué.
    copyFileSync(copy.source, `${copy.target}.tmp`);
    renameSync(`${copy.target}.tmp`, copy.target);
  }
  if (plan.changed) {
    writeFileSync(`${plan.configPath}.tmp`, `${JSON.stringify(plan.museum, null, 2)}\n`);
    renameSync(`${plan.configPath}.tmp`, plan.configPath);
  }
  return { ...plan, backup };
}

/** Dossier d'un paquet : le dossier donné, ou l'archive .zip décompressée dans un dossier provisoire. */
export function openPackage(path) {
  if (!existsSync(path)) throw new Error(`paquet introuvable : ${path}`);
  if (statSync(path).isDirectory()) return { dir: locate(path), close: () => {} };
  if (!path.toLowerCase().endsWith('.zip')) throw new Error(`paquet illisible : un dossier ou une archive .zip est attendu (${path})`);
  const temp = mkdtempSync(join(tmpdir(), 'maj-musee-'));
  try {
    execFileSync('unzip', ['-q', '-o', path, '-d', temp], { stdio: 'pipe' });
  } catch (error) {
    rmSync(temp, { recursive: true, force: true });
    throw new Error(`archive illisible : ${error.stderr?.toString().trim() || error.message}`);
  }
  return { dir: locate(temp), close: () => rmSync(temp, { recursive: true, force: true }) };
}

/** Une archive contient parfois un seul dossier, qui contient le paquet : on descend jusqu'à maj.json. */
function locate(dir) {
  if (existsSync(join(dir, 'maj.json'))) return dir;
  const inner = readdirSync(dir, { withFileTypes: true }).filter((entry) => entry.isDirectory() && !entry.name.startsWith('.') && entry.name !== '__MACOSX');
  return inner.length === 1 && existsSync(join(dir, inner[0].name, 'maj.json')) ? join(dir, inner[0].name) : dir;
}

const size = (bytes) => (bytes < 1024 * 1024 ? `${Math.round(bytes / 1024)} Ko` : `${(bytes / 1024 / 1024).toFixed(1)} Mo`);

function main() {
  const args = process.argv.slice(2);
  const dry = args.includes('--essai');
  const [museumId, ...paths] = args.filter((arg) => !arg.startsWith('--'));
  if (!museumId || !paths.length) {
    console.error('Usage : npm run maj -- <musée> <paquet.zip ou dossier> [paquets suivants…] [--essai]');
    process.exit(1);
  }
  // Plusieurs paquets : ils sont appliqués dans l'ordre donné ; au premier refus, on s'arrête là.
  let done = 0;
  for (const path of paths) {
    let pack = null;
    try {
      pack = openPackage(path.replace(/^~(?=\/|$)/, process.env.HOME ?? '~'));
      const result = dry ? planUpdate(museumId, pack.dir) : applyUpdate(museumId, pack.dir);
      console.log(`${dry ? 'Essai, rien n’est écrit' : 'Mise à jour appliquée'} : ${result.title || 'paquet sans titre'}`);
      for (const copy of result.copies) console.log(`  ${copy.replaces ? 'remplace' : 'ajoute  '} ${copy.path} (${size(copy.size)})`);
      for (const art of result.artworks) console.log(`  retouche l’œuvre « ${art.id} » (${art.room}) : ${art.fields.join(', ')}`);
      for (const art of result.removed) console.log(`  retire l’œuvre « ${art.id} » (${art.room})`);
      for (const art of result.added) console.log(`  ajoute l’œuvre « ${art.id} » (${art.room})`);
      if (!dry) console.log(`Sauvegarde de l’état précédent : ${result.backup.replace(ROOT, '')}`);
      done += 1;
    } catch (error) {
      console.error(`✗ Mise à jour refusée (${path}), le musée n’a pas été modifié par ce paquet : ${error.message}`);
      if (paths.length > 1) console.error(`  ${done} paquet(s) appliqué(s) avant lui ; les suivants ne sont pas appliqués.`);
      process.exitCode = 1;
      break;
    } finally {
      pack?.close();
    }
  }
  if (done && !dry) {
    if (paths.length > 1) console.log(`${done} mise(s) à jour appliquée(s) sur ${paths.length}.`);
    console.log('À faire maintenant : ouvrir le musée pour voir le résultat. Si l’éditeur affiche « Lumière à recalculer », cliquer sur « Recalculer la lumière ».');
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();

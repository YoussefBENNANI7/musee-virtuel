// Calcule la lumière des salles d'un musée avec Blender : rendu premium (version 2).
//
// Usage :
//   npm run lumiere -- demo                      les salles modifiées depuis leur dernier calcul
//   npm run lumiere -- demo --salle horizons     une salle
//   npm run lumiere -- demo --salle toutes       toutes les salles, l'une après l'autre
//
// Réglages facultatifs (valeurs par défaut dans src/engine/lumiere.ts). Un réglage donné pour une
// salle est retenu dans lumiere.json : il resservira à ses prochains calculs, sans le redonner.
//   --echantillons 256   finesse du calcul (plus : moins de grain, plus long ; 32 pour un essai)
//   --chaleur 0.07       chaleur ajoutée à la lumière (0 : teinte du décor)
//   --exposition 1       clarté d'ensemble de la salle (1.1 : 10 % plus clair)
//   --projecteurs 1      force des faisceaux sur les œuvres
//   --soleil 1           force de la tache de soleil sous une verrière (0 : pas de soleil)
//   --lanternes 1        force des lanternes
//   --voisines 1         lumière des salles voisines entrant par les portes
//   --ambiance 3.2       éclairage d'ambiance du plafond
//   --gorge 3            force de la gorge lumineuse
//   --ciel 4             force du ciel de la verrière
//   --defaut             oublie les réglages retenus pour les salles calculées
//
// Il faut Blender comme module Python, installé une fois pour toutes (voir docs/lumiere.md).
// Le script lance lui-même le musée, exporte les salles, fait calculer leur lumière par Blender,
// puis range les atlas dans public/museums/<musée>/lumiere/ et déclare ce dossier dans museum.json.
import { chromium } from '@playwright/test';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { createServer } from 'vite';

const FLAGS = {
  echantillons: 'samples',
  chaleur: 'warmth',
  exposition: 'exposure',
  projecteurs: 'spots',
  soleil: 'sun',
  lanternes: 'lanterns',
  voisines: 'neighbours',
  ambiance: 'fill',
  gorge: 'cove',
  ciel: 'sky',
};
const args = process.argv.slice(2);
const valued = new Set(['salle', ...Object.keys(FLAGS)]);
const museumId = args.find((a, i) => !a.startsWith('--') && !(args[i - 1]?.startsWith('--') && valued.has(args[i - 1].slice(2)))) ?? 'demo';
const option = (name) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
};
const wanted = option('salle') ?? 'modifiees';
const given = {};
for (const [flag, key] of Object.entries(FLAGS)) {
  const value = option(flag);
  if (value === undefined) continue;
  if (!Number.isFinite(Number(value))) {
    console.error(`Réglage --${flag} : nombre attendu, reçu « ${value} ».`);
    process.exit(1);
  }
  given[key] = Number(value);
}

const python = process.env.LUMIERE_PYTHON ?? join(homedir(), '.cache', 'musee-virtuel', 'blender', 'bin', 'python');
if (!existsSync(python)) {
  console.error(`Blender (module Python) introuvable : ${python}`);
  console.error('Installation, une seule fois : voir docs/lumiere.md.');
  process.exit(1);
}

const root = fileURLToPath(new URL('..', import.meta.url));
const dir = join(root, 'public', 'museums', museumId);
const configPath = join(dir, 'museum.json');
if (!existsSync(configPath)) {
  console.error(`Musée introuvable : ${configPath}`);
  process.exit(1);
}
const museum = JSON.parse(readFileSync(configPath, 'utf8'));
const all = museum.rooms.map((r) => r.id);
if (!['toutes', 'modifiees'].includes(wanted) && !all.includes(wanted)) {
  console.error(`Salle inconnue dans le musée « ${museumId} » : ${wanted} (salles : ${all.join(', ')}, ou « toutes »)`);
  process.exit(1);
}
const manifestPath = join(dir, 'lumiere', 'lumiere.json');
const manifest = existsSync(manifestPath) ? JSON.parse(readFileSync(manifestPath, 'utf8')) : { version: 2, rooms: {} };
manifest.version = 2;
/**
 * Réglages d'une salle : ceux retenus à son dernier calcul, puis ceux donnés maintenant.
 * La finesse du calcul n'est pas retenue : un essai rapide ne doit pas rendre grossier le calcul suivant.
 */
const lookOf = (id) => {
  const { samples: _samples, ...look } = { ...(args.includes('--defaut') ? {} : manifest.rooms[id]?.settings), ...given };
  return look;
};
const settingsOf = (id) => ({ ...lookOf(id), ...(given.samples ? { samples: given.samples } : {}) });

// 1. Le musée, ouvert sans lumière précalculée, exporte les salles. Qualité basse : les modèles 3D
// allégés suffisent pour les ombres, et la géométrie du bâtiment est la même à tous les niveaux.
const server = await createServer({ root, logLevel: 'error', server: { port: 5196 } });
await server.listen();
const url = server.resolvedUrls.local[0];
const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
const scenes = {};
let roomIds;
try {
  const page = await browser.newPage({ viewport: { width: 800, height: 600 } });
  await page.goto(`${url}?m=${encodeURIComponent(museumId)}&q=low&accueil=non&lumiere=0`);
  await page.waitForSelector('body.ready', { timeout: 120000 });
  // Les sculptures doivent être là : elles font de l'ombre.
  await page.waitForFunction(() => window.__museum.world.artworks.every((a) => a.ready), null, { timeout: 180000 });
  if (wanted === 'modifiees') {
    // Seulement les salles jamais calculées, ou modifiées depuis (leur empreinte a changé).
    const prints = await page.evaluate((ids) => Object.fromEntries(ids.map((id) => [id, window.__museum.lumiereEmpreinte(id)])), all);
    roomIds = all.filter((id) => manifest.rooms[id]?.fingerprint !== prints[id]);
    if (roomIds.length === 0) console.log('Toutes les salles sont à jour : rien à calculer. (--salle toutes pour tout recalculer.)');
  } else {
    roomIds = wanted === 'toutes' ? all : [wanted];
  }
  if (roomIds.length) console.log(`Export : ${roomIds.join(', ')}…`);
  for (const id of roomIds) scenes[id] = await page.evaluate(([room, s]) => window.__museum.lumiereExport(room, s), [id, settingsOf(id)]);
} finally {
  await browser.close();
  await server.close();
}

for (const roomId of roomIds) {
  const scene = scenes[roomId];
  // 2. Blender calcule la lumière.
  const work = mkdtempSync(join(tmpdir(), 'lumiere-'));
  const scenePath = join(work, 'scene.json');
  const pngPath = join(work, 'lumiere.png');
  const summaryPath = join(work, 'resume.json');
  writeFileSync(scenePath, scene);
  const { atlas, fingerprint, samples } = JSON.parse(scene);
  console.log(`Salle « ${roomId} », calcul par Blender : atlas de ${atlas.width} × ${atlas.height} points, ${samples} échantillons. Compter quelques minutes…`);
  // Les passes calculées sont gardées hors du projet : un simple réglage se refait alors sans nouveau calcul.
  const cachePath = join(homedir(), '.cache', 'musee-virtuel', 'lumiere', `${museumId}-${roomId}.npz`);
  const run = spawnSync(python, [join(root, 'scripts', 'lumiere', 'calcul.py'), scenePath, pngPath, summaryPath, cachePath], { stdio: ['ignore', process.env.LUMIERE_BAVARD ? 'inherit' : 'ignore', 'inherit'] });
  if (run.status !== 0) {
    console.error(`Le calcul de la salle « ${roomId} » a échoué.`);
    process.exit(1);
  }
  const summary = JSON.parse(readFileSync(summaryPath, 'utf8'));

  // 3. L'atlas rejoint le musée, en WebP : bien plus léger qu'un PNG pour une image aussi douce.
  mkdirSync(join(dir, 'lumiere'), { recursive: true });
  const image = `${roomId}.webp`;
  await sharp(pngPath).webp({ quality: 92, smartSubsample: true, effort: 6 }).toFile(join(dir, 'lumiere', image));
  manifest.rooms[roomId] = {
    image,
    fingerprint,
    width: atlas.width,
    height: atlas.height,
    encode: summary.encode,
    soleil: summary.soleil,
    samples,
    // Mesures du calcul, pour mémoire : facteurs par famille de surfaces, force de l'accent, lumière la plus forte.
    scale: summary.scale,
    accent: summary.accent,
    peak: summary.peak,
    settings: lookOf(roomId),
  };
  writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  if (museum.lumiere !== 'lumiere/lumiere.json') {
    museum.lumiere = 'lumiere/lumiere.json';
    writeFileSync(configPath, `${JSON.stringify(museum, null, 2)}\n`);
  }
  if (process.env.LUMIERE_GARDER) console.log(`Fichiers de travail gardés : ${work}`);
  else rmSync(work, { recursive: true, force: true });
  console.log(`Lumière de la salle « ${roomId} » enregistrée (${summary.seconds.total} s${summary.seconds.repris ? ', passes reprises du calcul précédent' : ' de calcul'} ; lumière la plus forte : ${summary.peak}).`);
}

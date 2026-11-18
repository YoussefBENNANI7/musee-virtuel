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
// Il faut Blender comme module Python, installé une fois pour toutes : npm run lumiere:installer
// (voir docs/lumiere.md).
// Le script lance lui-même le musée, exporte les salles, fait calculer leur lumière par Blender,
// puis range les atlas dans public/museums/<musée>/lumiere/ et déclare ce dossier dans museum.json.
import { chromium } from '@playwright/test';
import { spawn } from 'node:child_process';
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

/** Arrête la commande sur un message clair, sans le détail technique réservé aux pannes inattendues. */
const stop = (message) => {
  console.error(`\n✗ ${message}\n`);
  process.exit(1);
};

// Sur Mac, l'ordinateur ne se met pas en veille pendant le calcul, qui peut durer longtemps.
if (process.platform === 'darwin') {
  const awake = spawn('caffeinate', ['-i', '-w', String(process.pid)], { stdio: 'ignore' });
  awake.on('error', () => {});
  awake.unref();
}

const python = process.env.LUMIERE_PYTHON ?? join(homedir(), '.cache', 'musee-virtuel', 'blender', 'bin', 'python');
if (!existsSync(python)) stop('Blender n’est pas encore installé sur cet ordinateur. Lancez d’abord, une seule fois :\n\n    npm run lumiere:installer');

const root = fileURLToPath(new URL('..', import.meta.url));
const dir = join(root, 'public', 'museums', museumId);
const configPath = join(dir, 'museum.json');
if (!existsSync(configPath)) stop(`Musée introuvable : il n’y a pas de dossier « ${museumId} » dans public/museums/.`);
const all = JSON.parse(readFileSync(configPath, 'utf8')).rooms.map((r) => r.id);
if (!['toutes', 'modifiees'].includes(wanted) && !all.includes(wanted)) stop(`Salle inconnue dans le musée « ${museumId} » : ${wanted}\n  Salles de ce musée : ${all.join(', ')} (ou « toutes »).`);
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

/**
 * Ouvre le musée, en 3D, dans un navigateur sans fenêtre. Selon l'ordinateur, la 3D y passe par la carte
 * graphique ou par un rendu logiciel : on essaie l'un puis l'autre.
 */
async function openMuseum(address) {
  const software = '--enable-unsafe-swiftshader';
  const attempts = [
    { args: [software] },
    { args: ['--use-angle=swiftshader', software] },
    { args: ['--use-gl=swiftshader', software] },
    // Le navigateur complet, quand il est installé : il sait se servir de la carte graphique sans fenêtre.
    { channel: 'chromium', args: [software] },
  ];
  let reason = '';
  for (const [index, options] of attempts.entries()) {
    let browser;
    try {
      browser = await chromium.launch(options);
    } catch (error) {
      if (index === 0 && /Executable doesn't exist|playwright install/i.test(String(error))) {
        stop('Le navigateur de calcul n’est pas installé sur cet ordinateur. Lancez d’abord, une seule fois :\n\n    npm run lumiere:installer');
      }
      reason ||= String(error.message ?? error).split('\n')[0];
      continue;
    }
    try {
      const page = await browser.newPage({ viewport: { width: 800, height: 600 } });
      await page.goto(address);
      await page.waitForSelector('body.ready, body.failed', { timeout: 120000 });
      if (await page.evaluate(() => document.body.classList.contains('failed'))) {
        // La configuration du musée est refusée : un autre réglage du navigateur n'y changerait rien.
        const detail = await page.evaluate(() => (document.getElementById('config-errors')?.innerText || document.getElementById('help')?.innerText || '').trim());
        await browser.close();
        stop(`Le musée « ${museumId} » ne s’ouvre pas. Ouvrez-le dans l’éditeur pour voir ce qui manque.\n${detail}`);
      }
      if (await page.evaluate(() => Boolean(window.__museum))) return { browser, page };
      reason = 'la visite en 3D ne démarre pas dans le navigateur de calcul';
    } catch (error) {
      reason = String(error.message ?? error).split('\n')[0];
    }
    await browser.close();
  }
  return stop(`Impossible d’ouvrir le musée pour l’exporter : ${reason}.\n  Copiez ce message à Claude.`);
}

/** Lance le calcul d'une salle par Blender, en donnant des nouvelles chaque minute. Vrai s'il réussit. */
function calculate(argv) {
  return new Promise((resolve) => {
    const started = Date.now();
    const child = spawn(python, argv, { stdio: ['ignore', process.env.LUMIERE_BAVARD ? 'inherit' : 'ignore', 'inherit'] });
    const news = setInterval(() => console.log(`   … calcul en cours depuis ${Math.round((Date.now() - started) / 60000)} min`), 60000);
    const done = (success) => {
      clearInterval(news);
      resolve(success);
    };
    child.on('error', () => done(false));
    child.on('exit', (code) => done(code === 0));
  });
}

// 1. Le musée, ouvert sans lumière précalculée, exporte les salles. Qualité basse : les modèles 3D
// allégés suffisent pour les ombres, et la géométrie du bâtiment est la même à tous les niveaux.
console.log(`Ouverture du musée « ${museumId} »…`);
const server = await createServer({ root, logLevel: 'error', server: { port: 5196 } });
await server.listen();
const url = server.resolvedUrls.local[0];
const scenes = {};
let roomIds;
const { browser, page } = await openMuseum(`${url}?m=${encodeURIComponent(museumId)}&q=low&accueil=non&lumiere=0`);
try {
  // Les sculptures doivent être là : elles font de l'ombre. Une œuvre dont l'image ou le modèle 3D
  // manque ne se charge jamais : passé un délai, le calcul se fait sans elle.
  await page
    .waitForFunction(() => window.__museum.world.artworks.every((a) => a.ready), null, { timeout: 90000 })
    .catch(() => console.warn('   Attention : certaines œuvres ne se chargent pas (image ou modèle 3D manquant). Le calcul continue sans les attendre.'));
  if (wanted === 'modifiees') {
    // Seulement les salles jamais calculées, ou modifiées depuis (leur empreinte a changé).
    const prints = await page.evaluate((ids) => Object.fromEntries(ids.map((id) => [id, window.__museum.lumiereEmpreinte(id)])), all);
    roomIds = all.filter((id) => manifest.rooms[id]?.fingerprint !== prints[id]);
    if (roomIds.length === 0) console.log('Toutes les salles sont à jour : rien à calculer. (--salle toutes pour tout recalculer.)');
  } else {
    roomIds = wanted === 'toutes' ? all : [wanted];
  }
  if (roomIds.length) console.log(`Salles à calculer : ${roomIds.join(', ')}.`);
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
  console.log(`\nSalle « ${roomId} » (${roomIds.indexOf(roomId) + 1} sur ${roomIds.length}) : calcul par Blender, atlas de ${atlas.width} × ${atlas.height} points, ${samples} échantillons. Compter quelques minutes…`);
  // Les passes calculées sont gardées hors du projet : un simple réglage se refait alors sans nouveau calcul.
  const cachePath = join(homedir(), '.cache', 'musee-virtuel', 'lumiere', `${museumId}-${roomId}.npz`);
  if (!(await calculate([join(root, 'scripts', 'lumiere', 'calcul.py'), scenePath, pngPath, summaryPath, cachePath]))) {
    stop(`Le calcul de la salle « ${roomId} » a échoué. Copiez à Claude ce qui est affiché ci-dessus.`);
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
  // Le musée déclare sa lumière précalculée. Son fichier est relu à cet instant : il a pu être
  // modifié, dans l'éditeur par exemple, pendant les minutes qu'a duré le calcul.
  const museum = JSON.parse(readFileSync(configPath, 'utf8'));
  if (museum.lumiere !== 'lumiere/lumiere.json') {
    museum.lumiere = 'lumiere/lumiere.json';
    writeFileSync(configPath, `${JSON.stringify(museum, null, 2)}\n`);
  }
  if (process.env.LUMIERE_GARDER) console.log(`Fichiers de travail gardés : ${work}`);
  else rmSync(work, { recursive: true, force: true });
  console.log(`Lumière de la salle « ${roomId} » enregistrée (${summary.seconds.total} s${summary.seconds.repris ? ', passes reprises du calcul précédent' : ' de calcul'} ; lumière la plus forte : ${summary.peak}).`);
}

if (roomIds.length) {
  console.log(`\nTerminé : ${roomIds.length} salle(s) calculée(s). Pour voir le résultat, lancez le musée (npm run dev) puis ouvrez :\n\n    http://localhost:5173/?m=${museumId}\n\nPour comparer avec l'ancien éclairage, ajoutez &lumiere=0 à la fin de l'adresse.`);
}

// Calcule la lumière d'une salle avec Blender : rendu premium (pilote de la version 2).
//
// Usage :
//   npm run lumiere -- demo --salle horizons
// Réglages facultatifs (valeurs par défaut dans src/engine/lumiere.ts) :
//   --echantillons 512   finesse du calcul (plus : moins de grain, plus long)
//   --projecteurs 260    puissance des projecteurs sur les œuvres
//   --ambiance 3.2       éclairage d'ambiance du plafond
//   --gorge 3            force de la gorge lumineuse
//   --exposition 1       clarté d'ensemble, par rapport à la salle actuelle
//
// Il faut Blender comme module Python, installé une fois pour toutes (voir docs/lumiere.md).
// Le script lance lui-même le musée, exporte la salle, fait calculer la lumière par Blender,
// puis range l'atlas dans public/museums/<musée>/lumiere/ et déclare ce dossier dans museum.json.
import { chromium } from '@playwright/test';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { createServer } from 'vite';

const args = process.argv.slice(2);
const museumId = args.find((a) => !a.startsWith('--')) ?? 'demo';
const option = (name) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
};
const roomId = option('salle');
if (!roomId) {
  console.error('Indiquer la salle à calculer, par exemple : npm run lumiere -- demo --salle horizons');
  process.exit(1);
}
const settings = {};
for (const [flag, key] of [
  ['echantillons', 'samples'],
  ['projecteurs', 'spotPower'],
  ['ambiance', 'fill'],
  ['gorge', 'cove'],
  ['exposition', 'exposure'],
]) {
  const value = option(flag);
  if (value !== undefined) settings[key] = Number(value);
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
const museum = JSON.parse(readFileSync(configPath, 'utf8'));
if (!museum.rooms.some((r) => r.id === roomId)) {
  console.error(`Salle inconnue dans le musée « ${museumId} » : ${roomId}`);
  process.exit(1);
}

// 1. Le musée, ouvert sans lumière précalculée, exporte la salle.
console.log(`Export de la salle « ${roomId} »…`);
const server = await createServer({ root, logLevel: 'error', server: { port: 5196 } });
await server.listen();
const url = server.resolvedUrls.local[0];
const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
let scene;
try {
  const page = await browser.newPage({ viewport: { width: 800, height: 600 } });
  await page.goto(`${url}?m=${encodeURIComponent(museumId)}&q=high&accueil=non&lumiere=0`);
  await page.waitForSelector('body.ready', { timeout: 120000 });
  scene = await page.evaluate(([room, s]) => window.__museum.lumiereExport(room, s), [roomId, settings]);
} finally {
  await browser.close();
  await server.close();
}

// 2. Blender calcule la lumière.
const work = mkdtempSync(join(tmpdir(), 'lumiere-'));
const scenePath = join(work, 'scene.json');
const pngPath = join(work, 'lumiere.png');
const summaryPath = join(work, 'resume.json');
writeFileSync(scenePath, scene);
const { atlas, fingerprint, samples } = JSON.parse(scene);
console.log(`Calcul par Blender : atlas de ${atlas.width} × ${atlas.height} points, ${samples} échantillons. Compter quelques minutes…`);
const run = spawnSync(python, [join(root, 'scripts', 'lumiere', 'calcul.py'), scenePath, pngPath, summaryPath], { stdio: 'inherit' });
if (run.status !== 0) {
  console.error('Le calcul a échoué.');
  process.exit(1);
}
const summary = JSON.parse(readFileSync(summaryPath, 'utf8'));

// 3. L'atlas rejoint le musée, en WebP : bien plus léger qu'un PNG pour une image aussi douce.
mkdirSync(join(dir, 'lumiere'), { recursive: true });
const image = `${roomId}.webp`;
await sharp(pngPath).webp({ quality: 92, smartSubsample: true, effort: 6 }).toFile(join(dir, 'lumiere', image));
const manifestPath = join(dir, 'lumiere', 'lumiere.json');
const manifest = existsSync(manifestPath) ? JSON.parse(readFileSync(manifestPath, 'utf8')) : { version: 1, rooms: {} };
manifest.rooms[roomId] = { image, fingerprint, width: atlas.width, height: atlas.height, samples, scale: summary.scale, settings };
writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
if (museum.lumiere !== 'lumiere/lumiere.json') {
  museum.lumiere = 'lumiere/lumiere.json';
  writeFileSync(configPath, `${JSON.stringify(museum, null, 2)}\n`);
}
rmSync(work, { recursive: true, force: true });
console.log(`Lumière de la salle « ${roomId} » enregistrée (${summary.seconds.total} s de calcul).`);

// Service local de l'éditeur de musée. Il n'existe que pendant « npm run dev » : c'est lui qui
// écrit sur le disque ce que l'éditeur demande (la configuration d'un musée, ses images).
//
//   GET  /__editeur/museums                         liste des musées du dossier public/museums
//   PUT  /__editeur/museums/<id>                    enregistre museum.json
//   POST /__editeur/museums/<id>/images/<œuvre>     dépose une image, ou la recadre (?crop=x,y,l,h)
//   DELETE /__editeur/museums/<id>                  supprime un musée : son dossier est rangé dans musees-supprimes/
//   GET|PUT /__editeur/museums/<id>/vitrine         place du musée sur la page de choix (public/museums/index.json)
//   POST /__editeur/museums/<id>/couverture         photo de couverture du musée sur la page de choix
//   GET|POST /__editeur/museums/<id>/lumiere        calcul de la lumière précalculée (npm run lumiere) : état, lancement
//   POST /__editeur/museums/demo/retablir           rétablit le musée de démonstration tel qu'il est dans le projet
//
// Sécurité : le service ne répond qu'aux demandes venues de cet ordinateur, écrit seulement dans
// public/museums/<id>/, et exige un en-tête que seule la page de l'éditeur envoie.
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
export const MUSEUMS_DIR = fileURLToPath(new URL('../public/museums/', import.meta.url));
/** Les musées supprimés y sont rangés, hors du site : on peut les récupérer en les remettant dans public/museums. */
export const TRASH_DIR = fileURLToPath(new URL('../musees-supprimes/', import.meta.url));
/** La démonstration fait partie du dépôt : elle ne se supprime pas depuis l'éditeur. */
const LOCKED = new Set(['demo']);
const SIZES = [640, 1024, 1600];
const MAX_BODY = 60 * 1024 * 1024;
const DAY = 24 * 3600 * 1000;

/** Identifiant de musée ou d'œuvre : minuscules, chiffres et tirets, rien qui permette de sortir du dossier. */
export const isSlug = (value) => typeof value === 'string' && /^[a-z0-9][a-z0-9-]{0,47}$/.test(value);

/** Zone à garder d'une image : quatre parts de 0 à 1 (gauche, haut, largeur, hauteur), ou null pour toute l'image. */
export function parseCrop(text) {
  if (!text) return null;
  const parts = text.split(',').map(Number);
  if (parts.length !== 4 || parts.some((n) => !Number.isFinite(n))) return null;
  const [x, y, w, h] = parts;
  if (x < 0 || y < 0 || w < 0.02 || h < 0.02 || x + w > 1.0001 || y + h > 1.0001) return null;
  return { x, y, w: Math.min(w, 1 - x), h: Math.min(h, 1 - y) };
}

const isLocal = (req) => ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(req.socket.remoteAddress ?? '');

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY) {
        reject(Object.assign(new Error('fichier trop lourd (60 Mo au plus)'), { status: 413 }));
        req.destroy();
      } else chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

/** Les musées présents sur le disque, du plus récemment modifié au plus ancien. */
export function listMuseums(dir = MUSEUMS_DIR) {
  if (!existsSync(dir)) return [];
  // Les musées présentés sur la page de choix, pour le signaler dans l'éditeur.
  const shown = new Set(readIndex(dir).filter((e) => e && !e.hidden).map((e) => e.id));
  return readdirSync(dir)
    .filter((id) => isSlug(id) && existsSync(join(dir, id, 'museum.json')))
    .map((id) => {
      const file = join(dir, id, 'museum.json');
      try {
        const museum = JSON.parse(readFileSync(file, 'utf8'));
        return {
          id,
          name: museum.name ?? {},
          rooms: museum.rooms?.length ?? 0,
          works: (museum.rooms ?? []).reduce((n, r) => n + (r.artworks?.length ?? 0), 0) + (museum.reserve?.length ?? 0),
          modified: statSync(file).mtimeMs,
          locked: LOCKED.has(id),
          shown: shown.has(id),
        };
      } catch {
        return { id, name: {}, rooms: 0, works: 0, modified: 0, locked: LOCKED.has(id), shown: shown.has(id), unreadable: true };
      }
    })
    .sort((a, b) => b.modified - a.modified);
}

/** Enregistre la configuration d'un musée, puis fait le ménage des images qui ne servent plus. */
export function saveMuseum(id, museum, dir = MUSEUMS_DIR) {
  if (!museum || typeof museum !== 'object' || !Array.isArray(museum.rooms)) throw Object.assign(new Error('configuration illisible'), { status: 400 });
  const folder = join(dir, id);
  mkdirSync(folder, { recursive: true });
  // On écrit à côté puis on remplace : une coupure en pleine écriture ne laisse jamais un fichier tronqué.
  const file = join(folder, 'museum.json');
  const data = { ...museum, id };
  // La lumière précalculée est déclarée par « npm run lumiere », parfois pendant que l'éditeur est
  // ouvert sur une version plus ancienne du fichier : l'enregistrement ne doit pas la faire oublier.
  const previous = readJson(file);
  if (previous?.lumiere && !('lumiere' in museum)) data.lumiere = previous.lumiere;
  writeFileSync(`${file}.tmp`, `${JSON.stringify(data, null, 2)}\n`);
  renameSync(`${file}.tmp`, file);
  cleanImages(folder, museum);
  // Un musée renommé garde le même nom sur la page de choix.
  syncShowcase(dir, id);
}

/** Contenu d'un fichier JSON, ou null s'il manque ou est illisible. */
function readJson(file) {
  try {
    return JSON.parse(readFileSync(file, 'utf8'));
  } catch {
    return null;
  }
}

/**
 * Supprime un musée sans rien effacer : son dossier quitte le site et part dans musees-supprimes/,
 * sous son nom suivi de la date. Renvoie l'endroit où il est gardé.
 */
export function removeMuseum(id, dir = MUSEUMS_DIR, trash = TRASH_DIR, now = new Date()) {
  if (LOCKED.has(id)) throw Object.assign(new Error('le musée de démonstration ne se supprime pas depuis l’éditeur'), { status: 403 });
  const folder = join(dir, id);
  if (!existsSync(join(folder, 'museum.json'))) throw Object.assign(new Error('musée introuvable'), { status: 404 });
  mkdirSync(trash, { recursive: true });
  // 2026-11-17-09-30-05 : lisible, et deux suppressions du même nom ne se marchent pas dessus.
  const stamp = now.toISOString().slice(0, 19).replace(/[T:]/g, '-');
  let name = `${id}-${stamp}`;
  for (let n = 2; existsSync(join(trash, name)); n++) name = `${id}-${stamp}-${n}`;
  renameSync(folder, join(trash, name));
  return { kept: `musees-supprimes/${name}` };
}

/**
 * Supprime les images qu'aucune œuvre n'utilise plus depuis un jour : les anciens recadrages,
 * les photos d'œuvres supprimées. Le délai laisse le temps d'annuler une erreur.
 */
export function cleanImages(folder, museum, now = Date.now()) {
  const images = join(folder, 'images');
  if (!existsSync(images)) return;
  const works = [...museum.rooms.flatMap((r) => r.artworks ?? []), ...(museum.reserve ?? [])];
  // Une image sert à un tableau, à la face d'une pièce, à la vue simplifiée d'un objet ou à sa fiche.
  const used = new Set(
    works
      .flatMap((a) => [a.image?.src, a.model?.coin, a.photo, a.sourcePhoto])
      .filter((src) => typeof src === 'string')
      .map((src) => src.split('/').pop().replace(/\.[^.]+$/, '')),
  );
  const ids = new Set(works.map((a) => a.id));
  const old = (file) => now - statSync(file).mtimeMs > DAY;
  // Seules les images déposées par l'éditeur sont concernées : il en garde la source dans images/sources/.
  const sources = join(images, 'sources');
  if (!existsSync(sources)) return;
  const managed = new Set(readdirSync(sources).map((f) => f.replace(/\.[^.]+$/, '')));
  const owner = (name) => [...managed].find((artId) => name === artId || name.startsWith(`${artId}-`));
  for (const file of readdirSync(images)) {
    const path = join(images, file);
    if (!statSync(path).isFile()) continue;
    const name = file.replace(/\.[^.]+$/, '');
    if (owner(name) && !used.has(name) && old(path)) rmSync(path);
  }
  const web = join(images, 'web');
  for (const file of existsSync(web) ? readdirSync(web) : []) {
    const name = file.replace(/-\d+\.webp$/, '');
    if (owner(name) && !used.has(name) && old(join(web, file))) rmSync(join(web, file));
  }
  for (const file of readdirSync(sources)) {
    if (!ids.has(file.replace(/\.[^.]+$/, '')) && old(join(sources, file))) rmSync(join(sources, file));
  }
}

/**
 * Enregistre l'image d'une œuvre et prépare ses versions allégées.
 * - `data` : la photo déposée. Elle est redressée (orientation de l'appareil) et gardée comme source.
 * - `crop` : la zone à garder de la source ; sans `data`, on recadre la source déjà enregistrée.
 * Chaque appel produit des fichiers au nom nouveau : le navigateur ne ressert jamais une ancienne version.
 */
export async function storeImage(id, artId, data, crop, dir = MUSEUMS_DIR) {
  const { default: sharp } = await import('sharp');
  const images = join(dir, id, 'images');
  mkdirSync(join(images, 'web'), { recursive: true });
  mkdirSync(join(images, 'sources'), { recursive: true });
  const source = join(images, 'sources', `${artId}.jpg`);
  if (data?.length) {
    try {
      await sharp(data).rotate().resize({ width: 6000, height: 6000, fit: 'inside', withoutEnlargement: true }).flatten({ background: '#ffffff' }).jpeg({ quality: 93 }).toFile(source);
    } catch {
      throw Object.assign(new Error('image illisible : utilisez une photo au format JPEG, PNG ou WebP'), { status: 415 });
    }
  } else if (!existsSync(source)) {
    throw Object.assign(new Error('aucune image enregistrée pour cette œuvre'), { status: 404 });
  }
  const full = await sharp(source).metadata();
  let picture = sharp(source);
  let region = { left: 0, top: 0, width: full.width, height: full.height };
  if (crop) {
    region = {
      left: Math.round(crop.x * full.width),
      top: Math.round(crop.y * full.height),
      width: Math.max(8, Math.round(crop.w * full.width)),
      height: Math.max(8, Math.round(crop.h * full.height)),
    };
    region.width = Math.min(region.width, full.width - region.left);
    region.height = Math.min(region.height, full.height - region.top);
    picture = picture.extract(region);
  }
  const name = `${artId}-${Date.now().toString(36)}`;
  const buffer = await picture.jpeg({ quality: 92 }).toBuffer();
  writeFileSync(join(images, `${name}.jpg`), buffer);
  const longSide = Math.max(region.width, region.height);
  // On ne produit jamais une version plus grande que l'image elle-même.
  const variants = [...new Set(SIZES.map((size) => Math.min(size, longSide)))];
  for (const size of variants) {
    await sharp(buffer).resize({ width: size, height: size, fit: 'inside' }).webp({ quality: 82 }).toFile(join(images, 'web', `${name}-${size}.webp`));
  }
  return {
    image: { src: `images/${name}.jpg`, width: region.width, height: region.height, variants },
    source: { src: `images/sources/${artId}.jpg`, width: full.width, height: full.height },
    crop: crop ?? null,
  };
}

// --- Page de choix des musées ---------------------------------------------------------------------
// public/museums/index.json dit quels musées la page d'accueil propose (voir src/choix.ts). Il est
// propre à chaque ordinateur et n'entre pas dans le dépôt. Un musée retiré de la page y reste, marqué
// « hidden » : sa présentation est retrouvée s'il revient.

/** Présentation de la démonstration, quand l'éditeur crée la liste. */
const DEMO_SUMMARY = {
  fr: 'Six salles, de l’atrium sous verrière au patio aux lanternes : une visite pour découvrir le musée virtuel.',
  en: 'Six rooms, from the glass-roofed atrium to the lantern-lit patio: a tour to discover the virtual museum.',
};
const COVER = /^couverture(-[a-z0-9]+)?\.webp$/;

/**
 * La liste de la page de choix ; vide si elle n'existe pas. Avec `strict`, une liste illisible (une
 * virgule oubliée en la modifiant à la main) arrête tout, plutôt que d'être remplacée et perdue.
 */
export function readIndex(dir = MUSEUMS_DIR, strict = false) {
  const file = join(dir, 'index.json');
  if (!existsSync(file)) return [];
  const list = readJson(file);
  if (Array.isArray(list)) return list;
  if (strict) throw Object.assign(new Error('le fichier public/museums/index.json est illisible : corrigez-le ou supprimez-le'), { status: 409 });
  return [];
}

function writeIndex(list, dir) {
  const file = join(dir, 'index.json');
  writeFileSync(`${file}.tmp`, `${JSON.stringify(list, null, 2)}\n`);
  renameSync(`${file}.tmp`, file);
}

/** Photo de couverture d'un musée (« couverture….webp » dans son dossier), depuis le dossier des musées. */
export function coverOf(id, dir = MUSEUMS_DIR) {
  const folder = join(dir, id);
  if (!existsSync(folder)) return null;
  const covers = readdirSync(folder).filter((f) => COVER.test(f));
  if (!covers.length) return null;
  const age = (f) => statSync(join(folder, f)).mtimeMs;
  covers.sort((a, b) => age(b) - age(a) || b.localeCompare(a));
  return `${id}/${covers[0]}`;
}

/** Faute de couverture, la carte du musée montre sa première œuvre qui a une photo. */
function firstImage(id, museum) {
  const works = [...(museum.rooms ?? []).flatMap((r) => r.artworks ?? []), ...(museum.reserve ?? [])];
  const image = works.map((a) => a.image).find((img) => typeof img?.src === 'string' && !/^[a-z]+:|^\//i.test(img.src));
  if (!image) return null;
  const sizes = Array.isArray(image.variants) ? image.variants.filter((n) => Number.isFinite(n)) : [];
  if (!sizes.length) return `${id}/${image.src}`;
  // La version allégée la plus proche de la taille d'une carte.
  const size = sizes.reduce((best, n) => (Math.abs(n - 1024) < Math.abs(best - 1024) ? n : best));
  return `${id}/${image.src.replace(/^images\//, 'images/web/').replace(/\.[^.]+$/, `-${size}.webp`)}`;
}

/** Ce que la page de choix montre d'un musée. */
export function showcaseOf(id, dir = MUSEUMS_DIR) {
  const entry = readIndex(dir).find((e) => e?.id === id);
  return { shown: Boolean(entry && !entry.hidden), summary: entry?.summary ?? {}, image: entry?.image ?? coverOf(id, dir) };
}

/** Textes par langue venus de l'éditeur : seulement des textes, de longueur raisonnable. */
const cleanText = (value) =>
  Object.fromEntries(Object.entries(value && typeof value === 'object' ? value : {}).filter(([lang, v]) => /^[a-z]{2}$/.test(lang) && typeof v === 'string').map(([lang, v]) => [lang, v.slice(0, 600)]));

/** Fiche d'un musée pour la page de choix, à partir de sa configuration. */
function entryFor(id, museum, dir, summary = {}) {
  const entry = { id, name: museum.name ?? {}, summary, image: coverOf(id, dir) ?? firstImage(id, museum) ?? '' };
  if (museum.theme?.accent) entry.accent = museum.theme.accent;
  return entry;
}

/**
 * Propose un musée sur la page de choix (`shown`), ou l'en retire, et règle sa présentation (`summary`).
 * Quand la liste n'existe pas encore, la démonstration y est inscrite aussi : la page de choix
 * n'apparaît qu'à partir de deux musées.
 */
export function setShowcase(id, change = {}, dir = MUSEUMS_DIR) {
  const museum = readJson(join(dir, id, 'museum.json'));
  if (!museum) throw Object.assign(new Error('musée introuvable'), { status: 404 });
  const fresh = !existsSync(join(dir, 'index.json'));
  const list = readIndex(dir, true);
  const demo = fresh && id !== 'demo' ? readJson(join(dir, 'demo', 'museum.json')) : null;
  if (demo) list.push(entryFor('demo', demo, dir, DEMO_SUMMARY));
  let entry = list.find((e) => e?.id === id);
  if (!entry) {
    entry = entryFor(id, museum, dir);
    list.push(entry);
  }
  entry.name = museum.name ?? entry.name ?? {};
  if (change.summary !== undefined) entry.summary = cleanText(change.summary);
  entry.summary ??= {};
  entry.image = coverOf(id, dir) ?? (entry.image || firstImage(id, museum) || '');
  if (change.shown === false) entry.hidden = true;
  else if (change.shown === true) delete entry.hidden;
  writeIndex(list, dir);
  return showcaseOf(id, dir);
}

/**
 * Accorde la page de choix aux dossiers des musées : la couverture de chaque musée et, pour le musée
 * `only` qui vient d'être enregistré, son nom. Rien n'est écrit si rien ne change.
 */
export function syncShowcase(dir = MUSEUMS_DIR, only = null) {
  let list;
  try {
    list = readIndex(dir, true);
  } catch {
    return false;
  }
  let changed = false;
  for (const entry of list) {
    if (!entry || !isSlug(entry.id) || (only && entry.id !== only)) continue;
    const cover = coverOf(entry.id, dir);
    if (cover && entry.image !== cover) {
      entry.image = cover;
      changed = true;
    }
    const name = only ? readJson(join(dir, only, 'museum.json'))?.name : null;
    if (name && JSON.stringify(name) !== JSON.stringify(entry.name)) {
      entry.name = name;
      changed = true;
    }
  }
  if (changed) writeIndex(list, dir);
  return changed;
}

/**
 * Enregistre la photo de couverture d'un musée, au format des cartes de la page de choix (16:10).
 * Chaque couverture a un nom nouveau (le navigateur ne ressert jamais l'ancienne) ; les anciennes sont retirées.
 */
export async function storeCover(id, data, dir = MUSEUMS_DIR) {
  const { default: sharp } = await import('sharp');
  const folder = join(dir, id);
  if (!existsSync(join(folder, 'museum.json'))) throw Object.assign(new Error('musée introuvable'), { status: 404 });
  const name = `couverture-${Date.now().toString(36)}.webp`;
  try {
    await sharp(data).rotate().resize(1600, 1000, { fit: 'cover', position: 'centre' }).webp({ quality: 84 }).toFile(join(folder, name));
  } catch {
    throw Object.assign(new Error('image illisible : utilisez une photo au format JPEG, PNG ou WebP'), { status: 415 });
  }
  for (const file of readdirSync(folder)) if (COVER.test(file) && file !== name) rmSync(join(folder, file));
  syncShowcase(dir, id);
  return { image: `${id}/${name}` };
}

// --- Lumière précalculée, calculée depuis l'éditeur ------------------------------------------------
// Le bouton « Recalculer la lumière » lance « npm run lumiere -- <musée> » sur cet ordinateur : seules
// les salles modifiées sont recalculées. Un seul calcul à la fois : il occupe tout le processeur.

const blenderPython = () => process.env.LUMIERE_PYTHON ?? join(homedir(), '.cache', 'musee-virtuel', 'blender', 'bin', 'python');
/** Le calcul en cours ou le dernier terminé, pour chaque musée. */
const jobs = new Map();
/** Lignes de « npm run lumiere » qui disent où en est le calcul (les autres viennent de Blender). */
const STEP = /^(✗|Ouverture du musée|Salles à calculer|Salle «|\s*… calcul en cours|Lumière de la salle|Terminé|Toutes les salles|\s*Attention)/;

/** Où en est le calcul de la lumière d'un musée. */
export function lumiereStatus(id) {
  const job = jobs.get(id);
  const other = [...jobs.values()].find((j) => j.running && j.id !== id);
  const steps = job?.lines.filter((l) => STEP.test(l)) ?? [];
  return {
    installed: existsSync(blenderPython()),
    running: Boolean(job?.running),
    busy: other?.id ?? null,
    started: job?.started ?? null,
    ended: job?.ended ?? null,
    ok: job?.ok ?? null,
    step: steps.at(-1)?.trim() ?? null,
    progress: job?.progress ?? null,
    lines: job?.lines.slice(-14) ?? [],
  };
}

/**
 * Lance le calcul de la lumière d'un musée. `command` remplace « npm run lumiere », pour les essais.
 * La commande tourne tant que le serveur de l'éditeur tourne ; ce qu'elle affiche est gardé pour l'éditeur.
 */
export function startLumiere(id, { dir = MUSEUMS_DIR, command = null } = {}) {
  if (!existsSync(join(dir, id, 'museum.json'))) throw Object.assign(new Error('musée introuvable'), { status: 404 });
  const other = [...jobs.values()].find((j) => j.running);
  if (other) throw Object.assign(new Error(`un calcul de lumière est déjà en cours (musée « ${other.id} ») : attendez qu’il se termine`), { status: 409 });
  if (!command && !existsSync(blenderPython())) {
    throw Object.assign(new Error('Blender n’est pas installé sur cet ordinateur. Dans le Terminal, dans le dossier du projet, lancez une seule fois : npm run lumiere:installer'), { status: 412 });
  }
  const [program, ...args] = command ?? [process.execPath, join(ROOT, 'scripts', 'lumiere.mjs'), id];
  const job = { id, running: true, started: Date.now(), ended: null, ok: null, lines: [], progress: null, child: null };
  jobs.set(id, job);
  let rest = '';
  const take = (chunk) => {
    const parts = (rest + chunk.toString('utf8')).split(/\r?\n/);
    rest = parts.pop() ?? '';
    for (const line of parts) {
      if (!line.trim()) continue;
      job.lines.push(line.trimEnd());
      // « Salle « atrium » (1 sur 3) : calcul par Blender… » : la salle en cours de calcul.
      const room = /^Salle « (.+?) » \((\d+) sur (\d+)\)/.exec(line);
      if (room) job.progress = { room: room[1], index: Number(room[2]), total: Number(room[3]) };
    }
    if (job.lines.length > 400) job.lines.splice(0, job.lines.length - 400);
  };
  const finish = (ok, last) => {
    if (!job.running) return;
    if (rest.trim()) job.lines.push(rest.trimEnd());
    if (last) job.lines.push(last);
    Object.assign(job, { running: false, ok, ended: Date.now(), child: null });
  };
  const child = spawn(program, args, { cwd: ROOT, env: { ...process.env, FORCE_COLOR: '0', NO_COLOR: '1' } });
  job.child = child;
  child.stdout.on('data', take);
  child.stderr.on('data', take);
  child.on('error', (error) => finish(false, `✗ Le calcul n’a pas pu démarrer : ${error.message}`));
  child.on('close', (code) => finish(code === 0, code === 0 ? null : `(Le calcul s’est arrêté, code ${code}.)`));
  return lumiereStatus(id);
}

/** Arrête le calcul en cours, quand le serveur de l'éditeur s'arrête. */
export function stopLumiere() {
  for (const job of jobs.values()) job.child?.kill();
}

/**
 * Rétablit le musée de démonstration tel qu'il est dans le projet (sa dernière version enregistrée
 * par git), après une modification malencontreuse. Les fichiers ajoutés depuis sont laissés en place.
 */
export function restoreDemo(root = ROOT) {
  const result = spawnSync('git', ['checkout', 'HEAD', '--', 'public/museums/demo'], { cwd: root, encoding: 'utf8' });
  if (result.error || result.status !== 0) {
    throw Object.assign(new Error(`le musée de démonstration n’a pas pu être rétabli : ${(result.stderr || result.error?.message || '').trim()}`), { status: 500 });
  }
  syncShowcase(join(root, 'public', 'museums'));
  return { restored: true };
}

/** Module pour Vite : branche le service sur le serveur de développement. */
export function editorService() {
  return {
    name: 'musee-editeur',
    configureServer(server) {
      // Au démarrage, la page de choix reprend la couverture que chaque musée a dans son dossier.
      syncShowcase();
      server.httpServer?.once('close', stopLumiere);
      server.middlewares.use('/__editeur', async (req, res) => {
        const reply = (status, body) => {
          res.statusCode = status;
          res.setHeader('Content-Type', 'application/json; charset=utf-8');
          res.setHeader('Cache-Control', 'no-store');
          res.end(JSON.stringify(body));
        };
        try {
          if (!isLocal(req)) return reply(403, { error: 'l’éditeur ne répond que sur cet ordinateur' });
          const url = new URL(req.url ?? '/', 'http://localhost');
          const parts = url.pathname.split('/').filter(Boolean);
          if (req.method === 'GET' && parts.length === 1 && parts[0] === 'museums') return reply(200, { museums: listMuseums() });
          // Toute écriture doit venir de la page de l'éditeur : un autre site ne peut pas envoyer cet en-tête.
          if (req.headers['x-musee-editeur'] !== '1') return reply(403, { error: 'demande refusée' });
          const [root, id, kind, artId] = parts;
          if (root !== 'museums' || !isSlug(id)) return reply(400, { error: 'identifiant de musée invalide' });
          if (req.method === 'DELETE' && parts.length === 2) return reply(200, removeMuseum(id));
          if (req.method === 'PUT' && parts.length === 2) {
            saveMuseum(id, JSON.parse((await readBody(req)).toString('utf8')));
            return reply(200, { saved: true });
          }
          if (parts.length === 3 && kind === 'vitrine' && req.method === 'GET') return reply(200, showcaseOf(id));
          if (parts.length === 3 && kind === 'vitrine' && req.method === 'PUT') return reply(200, setShowcase(id, JSON.parse((await readBody(req)).toString('utf8') || '{}')));
          if (parts.length === 3 && kind === 'couverture' && req.method === 'POST') return reply(200, await storeCover(id, await readBody(req)));
          if (parts.length === 3 && kind === 'lumiere' && req.method === 'GET') return reply(200, lumiereStatus(id));
          if (parts.length === 3 && kind === 'lumiere' && req.method === 'POST') return reply(200, startLumiere(id));
          if (parts.length === 3 && kind === 'retablir' && req.method === 'POST') {
            if (!LOCKED.has(id)) return reply(403, { error: 'seul le musée de démonstration se rétablit ainsi' });
            return reply(200, restoreDemo());
          }
          if (req.method === 'POST' && parts.length === 4 && kind === 'images') {
            if (!isSlug(artId)) return reply(400, { error: 'identifiant d’œuvre invalide' });
            const crop = parseCrop(url.searchParams.get('crop'));
            if (url.searchParams.has('crop') && !crop) return reply(400, { error: 'zone de recadrage invalide' });
            return reply(200, await storeImage(id, artId, await readBody(req), crop));
          }
          reply(404, { error: 'demande inconnue' });
        } catch (error) {
          reply(error.status ?? 500, { error: error.message ?? String(error) });
        }
      });
    },
  };
}

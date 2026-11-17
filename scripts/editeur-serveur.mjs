// Service local de l'éditeur de musée. Il n'existe que pendant « npm run dev » : c'est lui qui
// écrit sur le disque ce que l'éditeur demande (la configuration d'un musée, ses images).
//
//   GET  /__editeur/museums                         liste des musées du dossier public/museums
//   PUT  /__editeur/museums/<id>                    enregistre museum.json
//   POST /__editeur/museums/<id>/images/<œuvre>     dépose une image, ou la recadre (?crop=x,y,l,h)
//   DELETE /__editeur/museums/<id>                  supprime un musée : son dossier est rangé dans musees-supprimes/
//
// Sécurité : le service ne répond qu'aux demandes venues de cet ordinateur, écrit seulement dans
// public/museums/<id>/, et exige un en-tête que seule la page de l'éditeur envoie.
import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

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
        };
      } catch {
        return { id, name: {}, rooms: 0, works: 0, modified: 0, locked: LOCKED.has(id), unreadable: true };
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
  writeFileSync(`${file}.tmp`, `${JSON.stringify({ ...museum, id }, null, 2)}\n`);
  renameSync(`${file}.tmp`, file);
  cleanImages(folder, museum);
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
  const used = new Set(works.map((a) => a.image?.src).filter((src) => typeof src === 'string').map((src) => src.split('/').pop().replace(/\.[^.]+$/, '')));
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

/** Module pour Vite : branche le service sur le serveur de développement. */
export function editorService() {
  return {
    name: 'musee-editeur',
    configureServer(server) {
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

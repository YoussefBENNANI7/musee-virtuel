// Prépare les images d'un musée pour le web.
//
// Usage :
//   npm run images -- demo            prépare les images déjà déclarées dans la configuration
//   npm run images -- demo --attach   associe d'abord à chaque tableau le fichier images/<identifiant>.*
//
// Pour chaque tableau dont l'image est un fichier (champ "src"), le script :
//   - mesure l'image et inscrit ses dimensions dans la configuration ;
//   - produit des versions allégées dans images/web/ (grand côté de 640, 1024 et 1600 pixels) ;
//   - ajuste la largeur du tableau aux proportions réelles de l'image (sa hauteur fait foi).
// Le fichier d'origine n'est jamais modifié : il servira au zoom haute définition.
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { basename, dirname, extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const SIZES = [640, 1024, 1600];
const EXTENSIONS = ['.webp', '.png', '.jpg', '.jpeg'];

const args = process.argv.slice(2);
const attach = args.includes('--attach');
const museumId = args.find((a) => !a.startsWith('--')) ?? 'demo';
const dir = fileURLToPath(new URL(`../public/museums/${museumId}/`, import.meta.url));
const configPath = join(dir, 'museum.json');
const museum = JSON.parse(readFileSync(configPath, 'utf8'));
const paintings = museum.rooms.flatMap((room) => room.artworks).filter((art) => art.type === 'painting');

if (attach) {
  const files = existsSync(join(dir, 'images')) ? readdirSync(join(dir, 'images')) : [];
  for (const art of paintings) {
    const file = files.find((f) => EXTENSIONS.includes(extname(f).toLowerCase()) && basename(f, extname(f)) === art.id);
    if (file) art.image = { src: `images/${file}` };
  }
}

let prepared = 0;
let bytes = 0;
const resized = [];
for (const art of paintings) {
  if (!art.image?.src) continue;
  const source = join(dir, art.image.src);
  if (!existsSync(source)) {
    console.error(`✗ ${art.id} : fichier introuvable (${art.image.src})`);
    process.exitCode = 1;
    continue;
  }
  const { width, height } = await sharp(source).metadata();
  const longSide = Math.max(width, height);
  const outDir = join(dirname(source), 'web');
  mkdirSync(outDir, { recursive: true });
  const name = basename(source, extname(source));

  // On ne produit jamais une version plus grande que l'original.
  const variants = [...new Set(SIZES.map((size) => Math.min(size, longSide)))];
  for (const size of variants) {
    const out = join(outDir, `${name}-${size}.webp`);
    await sharp(source).resize({ width: size, height: size, fit: 'inside' }).webp({ quality: 82 }).toFile(out);
    bytes += statSync(out).size;
  }
  art.image = { src: art.image.src, width, height, variants };

  const fitted = Math.round(art.height * (width / height) * 100) / 100;
  if (fitted !== art.width) {
    resized.push(`${art.id} : largeur ${art.width} m → ${fitted} m`);
    art.width = fitted;
  }
  prepared++;
}

writeFileSync(configPath, `${JSON.stringify(museum, null, 2)}\n`);
console.log(`${prepared} image(s) préparée(s) pour le musée « ${museumId} » : ${(bytes / 1e6).toFixed(1)} Mo de versions allégées.`);
if (resized.length) console.log(`Tableaux ajustés aux proportions de leur image :\n  ${resized.join('\n  ')}`);

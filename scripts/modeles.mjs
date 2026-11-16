// Prépare les modèles 3D d'un musée pour le web.
//
// Usage :
//   npm run modeles -- demo
//
// Pour chaque sculpture dont le modèle est un fichier (champ "src", au format GLB), le script
// produit deux versions dans models/web/ :
//   - nom.glb        version complète : 100 000 triangles au plus, images de 2048 pixels ;
//   - nom-leger.glb  version légère, pour les appareils modestes : 30 000 triangles, 1024 pixels.
// Les deux sont compressées (géométrie Meshopt, images WebP). Le fichier d'origine n'est jamais modifié.
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { dedup, meshopt, prune, simplify, textureCompress, weld } from '@gltf-transform/functions';
import draco3d from 'draco3dgltf';
import { MeshoptDecoder, MeshoptEncoder, MeshoptSimplifier } from 'meshoptimizer';
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { basename, dirname, extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const VERSIONS = [
  { suffix: '', triangles: 100_000, texture: 2048 },
  { suffix: '-leger', triangles: 30_000, texture: 1024 },
];

const museumId = process.argv.slice(2).find((a) => !a.startsWith('--')) ?? 'demo';
const dir = fileURLToPath(new URL(`../public/museums/${museumId}/`, import.meta.url));
const configPath = join(dir, 'museum.json');
const museum = JSON.parse(readFileSync(configPath, 'utf8'));
const sculptures = museum.rooms.flatMap((room) => room.artworks).filter((art) => art.type === 'sculpture' && art.model?.src);

await MeshoptEncoder.ready;
await MeshoptSimplifier.ready;
await MeshoptDecoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({
  'draco3d.decoder': await draco3d.createDecoderModule(),
  'meshopt.encoder': MeshoptEncoder,
  'meshopt.decoder': MeshoptDecoder,
});

const countTriangles = (doc) =>
  doc
    .getRoot()
    .listMeshes()
    .flatMap((mesh) => mesh.listPrimitives())
    .reduce((sum, prim) => sum + (prim.getIndices()?.getCount() ?? prim.getAttribute('POSITION').getCount()) / 3, 0);

let prepared = 0;
for (const art of sculptures) {
  const source = join(dir, art.model.src);
  if (!existsSync(source)) {
    console.error(`✗ ${art.id} : fichier introuvable (${art.model.src})`);
    process.exitCode = 1;
    continue;
  }
  const outDir = join(dirname(source), 'web');
  mkdirSync(outDir, { recursive: true });
  const name = basename(source, extname(source));
  const sizes = [];
  for (const version of VERSIONS) {
    const doc = await io.read(source);
    // La compression d'origine est retirée : les versions produites ont la leur.
    for (const ext of doc.getRoot().listExtensionsUsed()) {
      if (ext.extensionName === 'KHR_draco_mesh_compression') ext.dispose();
    }
    await doc.transform(dedup(), weld());
    const before = countTriangles(doc);
    if (before > version.triangles) {
      await doc.transform(simplify({ simplifier: MeshoptSimplifier, ratio: version.triangles / before, error: 0.01 }));
    }
    await doc.transform(
      textureCompress({ encoder: sharp, targetFormat: 'webp', quality: 86, resize: [version.texture, version.texture] }),
      prune(),
      meshopt({ encoder: MeshoptEncoder, level: 'medium' }),
    );
    const out = join(outDir, `${name}${version.suffix}.glb`);
    writeFileSync(out, await io.writeBinary(doc));
    sizes.push(`${Math.round(countTriangles(doc)).toLocaleString('fr-FR')} triangles, ${(statSync(out).size / 1e6).toFixed(1)} Mo`);
  }
  art.model = { src: art.model.src, web: true };
  console.log(`${art.id} : ${sizes.join(' ; version légère : ')}`);
  prepared++;
}

writeFileSync(configPath, `${JSON.stringify(museum, null, 2)}\n`);
console.log(`${prepared} modèle(s) préparé(s) pour le musée « ${museumId} ».`);

import * as THREE from 'three';
import type { PlacedArtwork } from './artworks';
import { clearHeight, coveOf, type Decor } from './decors';
import type { RoomConfig } from './types';

/**
 * Lumière précalculée : rendu premium (version 2).
 *
 * Sans elle, la lumière des murs, des sols et des plafonds est donnée par une formule, sommet par
 * sommet (voir lighting.ts). Cette formule ne connaît ni les ombres ni la lumière qu'une surface
 * renvoie sur une autre. Ici, la lumière d'une salle est calculée une fois pour toutes par Blender,
 * comme pour une image d'architecte : ombres douces sous les bancs, coins qui s'assombrissent,
 * faisceaux des projecteurs, lumière qui entre par les portes et rebondit sur le sol. Elle est rangée
 * dans une image, l'atlas de lumière, que la visite plaque sur les surfaces de la salle. Cela ne coûte
 * presque rien à l'appareil du visiteur : le téléphone et le casque en profitent autant que l'ordinateur.
 *
 * Chaque surface de la salle (un pan de mur, le sol, le plafond) a sa place dans l'atlas, à raison de
 * DENSITY points par mètre. Cette place est calculée ici, de la même façon au moment du calcul
 * (`npm run lumiere`) et pendant la visite. L'empreinte de la salle (surfaces, décor, œuvres, bancs)
 * vérifie que rien n'a changé entre-temps ; sinon, la visite garde l'éclairage par formule et signale
 * qu'il faut relancer le calcul.
 */

/** Points de l'atlas par mètre de surface : un point tous les 2,5 cm. */
export const DENSITY = 40;
/** Marge autour de chaque surface dans l'atlas, en points : le filtrage ne mélange pas deux surfaces. */
export const PAD = 3;
/** L'image ne va que de 0 à 1, la lumière jusqu'à 1,7 environ : l'image en garde la moitié. */
export const ENCODE = 2;
/** Version du format : toute modification de l'atlas la fait changer, et périme les calculs faits. */
const FORMAT = 1;

/** Fichier de la lumière précalculée d'un musée (`lumiere/lumiere.json`) : l'atlas de chaque salle calculée. */
export interface LumiereManifest {
  version: number;
  rooms: Record<string, { image: string; fingerprint: string; width: number; height: number }>;
}

export interface Rect {
  width: number;
  height: number;
}

export interface Placement {
  x: number;
  y: number;
  /** Taille en points, marges comprises. */
  w: number;
  h: number;
}

/** Taille en points d'une longueur de surface, marges comprises. */
const texels = (metres: number) => Math.max(1, Math.ceil(metres * DENSITY)) + PAD * 2;

/**
 * Range des rectangles (tailles en mètres) dans un atlas, par rangées, du plus haut au plus bas.
 * Choisit la plus petite image, aux côtés en puissances de deux, qui les contient tous.
 * Le résultat ne dépend que des tailles données et de leur ordre : il est reproductible.
 */
export function packAtlas(rects: Rect[]): { width: number; height: number; placements: Placement[] } {
  const sizes = rects.map((r) => ({ w: texels(r.width), h: texels(r.height) }));
  const order = sizes.map((_, i) => i).sort((a, b) => sizes[b].h - sizes[a].h || sizes[b].w - sizes[a].w || a - b);
  let best: { width: number; height: number; placements: Placement[] } | null = null;
  for (const width of [256, 512, 1024, 2048, 4096]) {
    if (sizes.some((s) => s.w > width)) continue;
    const placements: Placement[] = new Array(rects.length);
    let x = 0;
    let y = 0;
    let row = 0;
    for (const i of order) {
      const { w, h } = sizes[i];
      if (x + w > width) {
        x = 0;
        y += row;
        row = 0;
      }
      placements[i] = { x, y, w, h };
      x += w;
      row = Math.max(row, h);
    }
    let height = 1;
    while (height < y + row) height *= 2;
    if (height > 4096) continue;
    // À surface égale, la première trouvée (la moins large) l'emporte.
    if (!best || width * height < best.width * best.height) best = { width, height, placements };
  }
  if (!best) throw new Error('Salle trop grande pour un seul atlas de lumière.');
  return best;
}

/**
 * Surfaces d'une salle qui reçoivent la lumière précalculée : sol, pans de mur, plafond, bandes de
 * revêtement. Le bâtiment les marque (`userData.lumiere`) ; l'ordre est celui de leur construction.
 */
export function bakeTargets(group: THREE.Object3D, roomId: string): THREE.Mesh[] {
  const out: THREE.Mesh[] = [];
  group.traverse((o) => {
    if ((o as THREE.Mesh).isMesh && o.userData.lumiere === roomId) out.push(o as THREE.Mesh);
  });
  return out;
}

/** Étendue d'une surface dans son propre plan : celles du bâtiment sont dessinées dans le plan XY. */
function planeSize(mesh: THREE.Mesh): { minX: number; minY: number; width: number; height: number } {
  mesh.geometry.computeBoundingBox();
  const box = mesh.geometry.boundingBox!;
  return { minX: box.min.x, minY: box.min.y, width: box.max.x - box.min.x, height: box.max.y - box.min.y };
}

/**
 * Ce dont dépend la lumière d'une salle, en plus de ses surfaces : son décor, ses œuvres (les
 * projecteurs les visent), ses bancs (ils font de l'ombre) et le style du musée.
 */
export function roomContext(room: RoomConfig, decor: Decor, style: string): string {
  const artworks = room.artworks.map((a) =>
    a.type === 'painting' ? [a.id, a.wall, a.offset, a.width, a.height, a.y ?? null, a.frame ?? null, a.frameless ?? null] : [a.id, a.position, a.plinth],
  );
  return JSON.stringify([style, decor, artworks, room.benches ?? []]);
}

/**
 * Donne à chaque surface ses coordonnées dans l'atlas (attribut `uv1`, le second jeu de coordonnées).
 * Renvoie la taille de l'atlas et l'empreinte de la salle.
 */
export function layoutLightmap(meshes: THREE.Mesh[], context: string): { width: number; height: number; fingerprint: string } {
  const sizes = meshes.map(planeSize);
  const { width, height, placements } = packAtlas(sizes);
  meshes.forEach((mesh, i) => {
    const { minX, minY, width: sw, height: sh } = sizes[i];
    const p = placements[i];
    const pos = mesh.geometry.attributes.position;
    const uv = new Float32Array(pos.count * 2);
    for (let k = 0; k < pos.count; k++) {
      const fx = sw > 0 ? (pos.getX(k) - minX) / sw : 0;
      const fy = sh > 0 ? (pos.getY(k) - minY) / sh : 0;
      uv[k * 2] = (p.x + PAD + fx * (p.w - PAD * 2)) / width;
      uv[k * 2 + 1] = (p.y + PAD + fy * (p.h - PAD * 2)) / height;
    }
    mesh.geometry.setAttribute('uv1', new THREE.BufferAttribute(uv, 2));
  });
  return { width, height, fingerprint: fingerprint(meshes, width, height, context) };
}

/** Empreinte d'une salle : la place et le découpage de chacune de ses surfaces, et ce dont dépend sa lumière. */
function fingerprint(meshes: THREE.Mesh[], width: number, height: number, context: string): string {
  const parts: number[] = [FORMAT, DENSITY, PAD, width, height, meshes.length];
  const v = new THREE.Vector3();
  for (const mesh of meshes) {
    mesh.updateWorldMatrix(true, false);
    const pos = mesh.geometry.attributes.position;
    parts.push(pos.count);
    for (const k of [0, pos.count - 1]) {
      v.fromBufferAttribute(pos, k).applyMatrix4(mesh.matrixWorld);
      parts.push(v.x, v.y, v.z);
    }
  }
  // FNV-1a, sur les nombres arrondis au millimètre puis sur le contexte.
  let hash = 0x811c9dc5;
  for (const ch of `${parts.map((n) => Math.round(n * 1000)).join(',')}|${context}`) {
    hash ^= ch.charCodeAt(0);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

/**
 * Plaque l'atlas de lumière sur les surfaces d'une salle. Leur matériau est remplacé par une copie
 * qui prend la lumière dans l'atlas au lieu de la couleur des sommets. Les effets peints qui imitaient
 * la lumière sont retirés : les halos autour des œuvres (les vrais faisceaux des projecteurs sont dans
 * l'atlas) et les ombres douces sous les bancs et les socles (les vraies ombres aussi).
 */
export function applyLightmap(group: THREE.Object3D, room: RoomConfig, meshes: THREE.Mesh[], texture: THREE.Texture) {
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.channel = 1;
  const copies = new Map<THREE.Material, THREE.MeshBasicMaterial>();
  for (const mesh of meshes) {
    const source = mesh.material as THREE.MeshBasicMaterial;
    let copy = copies.get(source);
    if (!copy) {
      copy = source.clone();
      copy.vertexColors = false;
      copy.lightMap = texture;
      // Le rendu divise la lumière précalculée par π : on la lui rend, avec le facteur de codage.
      copy.lightMapIntensity = ENCODE * Math.PI;
      copies.set(source, copy);
    }
    mesh.material = copy;
  }
  const floor = roomBox(room, 0);
  const at = new THREE.Vector3();
  group.traverse((o) => {
    if (o.userData.halo === room.id) o.visible = false;
    if (o.userData.ombrePeinte && floor.containsPoint(o.getWorldPosition(at))) o.visible = false;
  });
}

/**
 * Charge la lumière précalculée d'un musée et la plaque, salle par salle, à mesure que les atlas arrivent.
 * Jusque-là, et pour toute salle dont l'empreinte a changé, l'éclairage par formule reste en place.
 * Renvoie les salles éclairées par un atlas, une fois tout chargé.
 */
export async function loadLumiere(
  url: string,
  group: THREE.Object3D,
  rooms: RoomConfig[],
  context: (room: RoomConfig) => string,
  onApplied: () => void,
): Promise<string[]> {
  let manifest: LumiereManifest;
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`${res.status}`);
    manifest = await res.json();
  } catch (e) {
    console.warn(`Lumière précalculée indisponible (${url}) : éclairage par formule.`, e);
    return [];
  }
  const loader = new THREE.TextureLoader();
  const applied = await Promise.all(
    rooms.map(async (room) => {
      const entry = manifest.rooms?.[room.id];
      if (!entry) return null;
      const meshes = bakeTargets(group, room.id);
      if (!meshes.length) return null;
      const { fingerprint } = layoutLightmap(meshes, context(room));
      if (fingerprint !== entry.fingerprint) {
        console.warn(`Salle « ${room.id} » modifiée depuis le calcul de sa lumière : relancer npm run lumiere.`);
        return null;
      }
      try {
        const texture = await loader.loadAsync(new URL(entry.image, new URL(url, location.href)).href);
        applyLightmap(group, room, meshes, texture);
        onApplied();
        return room.id;
      } catch (e) {
        console.warn(`Atlas de lumière de la salle « ${room.id} » illisible : éclairage par formule.`, e);
        return null;
      }
    }),
  );
  return applied.filter((id): id is string => id !== null);
}

/** Couleur moyenne d'une texture dessinée (bois, enduit, ciel), pour la lumière qu'elle renvoie. */
function averageColor(texture: THREE.Texture | null | undefined, cache: Map<THREE.Texture, THREE.Color>): THREE.Color {
  if (!texture) return new THREE.Color(1, 1, 1);
  const known = cache.get(texture);
  if (known) return known;
  const color = new THREE.Color(0.5, 0.5, 0.5);
  const image = texture.image as (CanvasImageSource & { width?: number }) | undefined;
  if (image?.width) {
    try {
      const canvas = document.createElement('canvas');
      canvas.width = canvas.height = 1;
      const ctx = canvas.getContext('2d')!;
      ctx.drawImage(image, 0, 0, 1, 1);
      const [r, g, b] = ctx.getImageData(0, 0, 1, 1).data;
      color.setRGB(r / 255, g / 255, b / 255, THREE.SRGBColorSpace);
    } catch {
      // Image illisible : gris moyen.
    }
  }
  cache.set(texture, color);
  return color;
}

/** Réglages du calcul, ajustables par `npm run lumiere`. */
export interface BakeSettings {
  samples: number;
  /** Puissance d'un projecteur, en watts (unités de Blender). */
  spotPower: number;
  /** Éclairage d'ambiance du plafond, en watts par mètre carré de plafond. */
  fill: number;
  /** Force de la gorge lumineuse, par rapport à sa couleur à l'écran. */
  cove: number;
  /** Clarté d'ensemble, par rapport à celle que la salle a aujourd'hui. */
  exposure: number;
}

export const DEFAULT_BAKE: BakeSettings = { samples: 512, spotPower: 260, fill: 3.2, cove: 3, exposure: 1 };

/**
 * Matériau visible et opaque : il compte pour la lumière. Ce qui est posé en transparence par-dessus
 * (halos, ombres peintes, taches de soleil) imite la lumière et n'en arrête aucune.
 */
function counts(material: THREE.Material): boolean {
  return material.visible && !material.transparent;
}

const roomBox = (room: RoomConfig, margin: number) =>
  new THREE.Box3(
    new THREE.Vector3(room.position[0] - room.size[0] / 2 - margin, -0.1, room.position[1] - room.size[2] / 2 - margin),
    new THREE.Vector3(room.position[0] + room.size[0] / 2 + margin, room.size[1] + 2, room.position[1] + room.size[2] / 2 + margin),
  );

const round = (x: number, digits = 4) => +x.toFixed(digits);

/**
 * Scène à calculer, pour Blender : les surfaces de la salle (à éclairer), le bâtiment alentour (il
 * rayonne la couleur qu'il a à l'écran, et éclaire ainsi la salle par ses portes), les objets de la
 * salle (ils font de l'ombre), ses projecteurs et son éclairage d'ambiance. Coordonnées de Three.js.
 */
export function exportBakeScene(
  group: THREE.Object3D,
  room: RoomConfig,
  decor: Decor,
  artworks: PlacedArtwork[],
  context: string,
  settings: BakeSettings,
): object {
  const targets = bakeTargets(group, room.id);
  const atlas = layoutLightmap(targets, context);
  const targetSet = new Set<THREE.Object3D>(targets);
  const near = roomBox(room, 8);
  const inside = roomBox(room, 0.3);
  const textures = new Map<THREE.Texture, THREE.Color>();
  const meshes: object[] = [];
  const v = new THREE.Vector3();
  const box = new THREE.Box3();
  group.updateMatrixWorld(true);

  const flat = (mesh: THREE.Mesh) => {
    const pos = mesh.geometry.attributes.position;
    const positions: number[] = [];
    for (let k = 0; k < pos.count; k++) {
      v.fromBufferAttribute(pos, k).applyMatrix4(mesh.matrixWorld);
      positions.push(round(v.x), round(v.y), round(v.z));
    }
    const index = mesh.geometry.index;
    const indices = index ? Array.from(index.array as ArrayLike<number>) : Array.from({ length: pos.count }, (_, i) => i);
    return { positions, indices };
  };
  /** Couleur de la matière, texture comprise. */
  const colorOf = (material: THREE.Material) => {
    const m = material as THREE.MeshBasicMaterial;
    return (m.color ?? new THREE.Color(1, 1, 1)).clone().multiply(averageColor(m.map, textures));
  };
  /** Part de lumière qu'une matière renvoie : jamais tout à fait 1. */
  const albedoOf = (material: THREE.Material) => {
    const c = colorOf(material);
    return [c.r, c.g, c.b].map((x) => round(Math.min(0.9, x)));
  };

  group.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh || !o.visible || Array.isArray(mesh.material)) return;
    const material = mesh.material;
    if (!counts(material)) return;
    box.setFromObject(mesh);
    if (targetSet.has(mesh)) {
      const { positions, indices } = flat(mesh);
      const color = mesh.geometry.attributes.color;
      const light: number[] = [];
      for (let k = 0; k < color.count; k++) light.push(round(color.getX(k)), round(color.getY(k)), round(color.getZ(k)));
      const uv1 = Array.from(mesh.geometry.attributes.uv1.array as ArrayLike<number>).map((x) => round(x, 6));
      meshes.push({ role: 'bake', positions, indices, uv1, light, albedo: albedoOf(material) });
    } else if (o.userData.building) {
      if (!box.intersectsBox(near)) return;
      const { positions, indices } = flat(mesh);
      const base = colorOf(material);
      const vertex = (material as THREE.MeshBasicMaterial).vertexColors ? mesh.geometry.attributes.color : null;
      const colors: number[] = [];
      for (let k = 0; k < positions.length / 3; k++) {
        const l = vertex ? [vertex.getX(k), vertex.getY(k), vertex.getZ(k)] : [1, 1, 1];
        colors.push(round(base.r * l[0]), round(base.g * l[1]), round(base.b * l[2]));
      }
      meshes.push({ role: 'emit', positions, indices, colors, strength: o.userData.gorge === room.id ? settings.cove : 1 });
    } else {
      if (!box.intersectsBox(inside)) return;
      const { positions, indices } = flat(mesh);
      // Œuvres et cartels : leur image n'est pas lue, on prend un ton moyen.
      const albedo = (material as THREE.MeshBasicMaterial).map ? [0.35, 0.33, 0.3] : albedoOf(material);
      meshes.push({ role: 'occlude', positions, indices, albedo });
    }
  });

  const [w, , d] = room.size;
  const [cx, cz] = room.position;
  const top = clearHeight(room, decor);
  const tint = new THREE.Color(decor.light.tint);
  const color = [tint.r, tint.g, tint.b].map((x) => round(x));
  const spots: object[] = [];
  if (decor.light.spots > 0) {
    for (const art of artworks) {
      if (art.room.id !== room.id || !art.normal || art.config.type !== 'painting') continue;
      // Le projecteur pend au rail, à 1,50 m du mur, et vise le centre de l'œuvre.
      const position = art.center.clone().addScaledVector(art.normal, 1.5).setY(top - 0.24);
      const reach = position.distanceTo(art.center);
      const half = Math.max(art.config.width, art.config.height) / 2 + 0.35;
      spots.push({
        position: position.toArray().map((x) => round(x)),
        target: art.center.toArray().map((x) => round(x)),
        angle: round(THREE.MathUtils.radToDeg(2 * Math.atan(half / reach)), 2),
        blend: 0.7,
        power: settings.spotPower * decor.light.spots,
        color,
      });
    }
  }
  const cove = coveOf(room, decor);
  const inset = cove ? cove.inset + 0.3 : 0.6;
  const areas = [
    {
      position: [cx, round(top - 0.05), cz],
      size: [round(w - inset * 2), round(d - inset * 2)],
      power: round(settings.fill * decor.light.level * (w - inset * 2) * (d - inset * 2), 2),
      color,
    },
  ];
  return {
    version: FORMAT,
    room: room.id,
    atlas: { width: atlas.width, height: atlas.height },
    fingerprint: atlas.fingerprint,
    samples: settings.samples,
    exposure: settings.exposure,
    meshes,
    spots,
    areas,
  };
}

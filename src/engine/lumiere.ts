import * as THREE from 'three';
import type { PlacedArtwork } from './artworks';
import { clearHeight, coveOf, type Decor } from './decors';
import { LANTERN_COLOR, lanternHeight } from './furniture';
import type { Layout } from './layout';
import { skylightOpening, sunDirection } from './lighting';
import { rotundaShape } from './rotonde';
import type { RoomConfig } from './types';

/**
 * Lumière précalculée : rendu premium (version 2).
 *
 * Sans elle, la lumière des murs, des sols et des plafonds est donnée par une formule, sommet par
 * sommet (voir lighting.ts). Cette formule ne connaît ni les ombres ni la lumière qu'une surface
 * renvoie sur une autre. Ici, la lumière d'une salle est calculée une fois pour toutes par Blender,
 * comme pour une image d'architecte : ombres douces sous les bancs, coins qui s'assombrissent,
 * faisceaux des projecteurs, tache de soleil sous une verrière, lumière des lanternes, lumière qui
 * entre par les portes et rebondit sur le sol. Elle est rangée dans une image, l'atlas de lumière,
 * que la visite plaque sur les surfaces de la salle. Cela ne coûte presque rien à l'appareil du
 * visiteur : le téléphone et le casque en profitent autant que l'ordinateur.
 *
 * Chaque plan de la salle (un mur entier, le sol, le plafond) a sa place dans l'atlas, à raison de
 * DENSITY points par mètre. Les surfaces d'un même plan (les pans d'un mur de part et d'autre d'une
 * porte, le linteau, l'arc, les bandes de zellige) s'y rangent côte à côte, comme dans le musée :
 * la lumière passe de l'une à l'autre sans couture. Cette place est calculée ici, de la même façon
 * au moment du calcul (`npm run lumiere`) et pendant la visite. L'empreinte de la salle (surfaces,
 * décor, œuvres, mobilier) vérifie que rien n'a changé entre-temps ; sinon, la visite garde
 * l'éclairage par formule et signale qu'il faut relancer le calcul.
 */

/** Points de l'atlas par mètre de surface : un point tous les 2,5 cm. */
export const DENSITY = 40;
/** Marge autour de chaque plan dans l'atlas, en points : le filtrage ne mélange pas deux plans. */
export const PAD = 3;
/** Deux surfaces parallèles à moins de 2 cm l'une de l'autre sont dans le même plan. */
const COPLANAR = 0.02;
/** Version du format : toute modification de l'atlas ou du calcul la fait changer, et périme les calculs faits. */
const FORMAT = 2;

/** Lumière précalculée d'une salle, telle que la décrit `lumiere/lumiere.json`. */
export interface LumiereRoom {
  image: string;
  fingerprint: string;
  width: number;
  height: number;
  /**
   * L'image ne va que de 0 à 1, la lumière jusqu'à 1,7 et plus dans une salle sombre aux projecteurs
   * puissants : l'image garde la lumière divisée par ce facteur (2, 4 ou 8).
   */
  encode: number;
  /** Vrai si la tache de soleil de la verrière est dans l'atlas. */
  soleil?: boolean;
}

/** Fichier de la lumière précalculée d'un musée : l'atlas de chaque salle calculée. */
export interface LumiereManifest {
  version: number;
  rooms: Record<string, LumiereRoom>;
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
 * Surfaces d'une salle qui reçoivent la lumière précalculée : sol, pans de mur, plafond, arcs,
 * bandes de revêtement. Le bâtiment les marque (`userData.lumiere`) ; l'ordre est celui de leur construction.
 */
export function bakeTargets(group: THREE.Object3D, roomId: string): THREE.Mesh[] {
  const out: THREE.Mesh[] = [];
  group.traverse((o) => {
    if ((o as THREE.Mesh).isMesh && o.userData.lumiere === roomId) out.push(o as THREE.Mesh);
  });
  return out;
}

/** Sol, murs ou plafond : chaque famille de surfaces garde la clarté que lui donne son décor. */
export type Family = 'sol' | 'murs' | 'plafond';

/** Un plan de la salle, et les surfaces qui s'y trouvent. */
export interface Chart extends Rect {
  meshes: THREE.Mesh[];
  /** Passage du repère du musée à celui du plan : x et y dans le plan. */
  toPlane: THREE.Matrix4;
  /** Direction vers laquelle le plan est tourné, et sa position le long de cette direction. */
  normal: THREE.Vector3;
  offset: number;
  /** Coin du rectangle qui contient toutes ses surfaces, dans le repère du plan. */
  minX: number;
  minY: number;
  family: Family;
}

/**
 * Regroupe les surfaces par plan. Les surfaces du bâtiment sont dessinées dans le plan XY de leur
 * propre repère, tournées vers +Z : deux surfaces tournées du même côté, à moins de 2 cm l'une de
 * l'autre le long de cette direction, sont dans le même plan.
 */
export function chartsOf(meshes: THREE.Mesh[]): Chart[] {
  const charts: (Chart & { maxX: number; maxY: number })[] = [];
  const normal = new THREE.Vector3();
  const origin = new THREE.Vector3();
  const v = new THREE.Vector3();
  const m = new THREE.Matrix4();
  for (const mesh of meshes) {
    mesh.updateWorldMatrix(true, false);
    normal.set(0, 0, 1).transformDirection(mesh.matrixWorld);
    const offset = normal.dot(origin.setFromMatrixPosition(mesh.matrixWorld));
    let chart = charts.find((c) => c.normal.dot(normal) > 0.999 && Math.abs(c.offset - offset) < COPLANAR);
    if (!chart) {
      const family: Family = normal.y > 0.7 ? 'sol' : normal.y < -0.7 ? 'plafond' : 'murs';
      chart = { meshes: [], toPlane: mesh.matrixWorld.clone().invert(), normal: normal.clone(), offset, minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity, width: 0, height: 0, family };
      charts.push(chart);
    }
    chart.meshes.push(mesh);
    m.multiplyMatrices(chart.toPlane, mesh.matrixWorld);
    const pos = mesh.geometry.attributes.position;
    for (let k = 0; k < pos.count; k++) {
      v.fromBufferAttribute(pos, k).applyMatrix4(m);
      chart.minX = Math.min(chart.minX, v.x);
      chart.maxX = Math.max(chart.maxX, v.x);
      chart.minY = Math.min(chart.minY, v.y);
      chart.maxY = Math.max(chart.maxY, v.y);
    }
  }
  return charts.map(({ maxX, maxY, ...c }) => ({ ...c, width: maxX - c.minX, height: maxY - c.minY }));
}

/** Les plans d'une salle rangés dans l'atlas. */
export interface LightmapLayout {
  width: number;
  height: number;
  fingerprint: string;
  charts: (Chart & Placement)[];
}

/** Coordonnées dans l'atlas d'un point (x, y) du repère d'un plan. */
function atlasUV(layout: Pick<LightmapLayout, 'width' | 'height'>, c: Chart & Placement, x: number, y: number): [number, number] {
  const fx = c.width > 0 ? (x - c.minX) / c.width : 0;
  const fy = c.height > 0 ? (y - c.minY) / c.height : 0;
  return [(c.x + PAD + fx * (c.w - PAD * 2)) / layout.width, (c.y + PAD + fy * (c.h - PAD * 2)) / layout.height];
}

/**
 * Ce dont dépend la lumière d'une salle, en plus de ses surfaces : son décor, ses œuvres (les
 * projecteurs les visent, les sculptures font de l'ombre), son mobilier et le style du musée.
 */
export function roomContext(room: RoomConfig, decor: Decor, style: string): string {
  // Les réglages plus récents (rotonde, vitrines, comptoirs, cubes) ne comptent que s'ils sont là :
  // l'empreinte des salles qui n'en ont pas ne change pas, et leur lumière reste valable.
  const when = <T>(value: T | undefined) => (value === undefined ? [] : [value]);
  const artworks = room.artworks.map((a) =>
    a.type === 'painting'
      ? [a.id, a.wall, a.offset, a.width, a.height, a.y ?? null, a.frame ?? null, a.frameless ?? null, ...when(a.rotunda)]
      : [a.id, a.position, a.plinth, a.height, a.turn ?? null, 'src' in a.model ? a.model.src : a.model, ...when(a.vitrine)],
  );
  // Le titre d'une vitrine n'éclaire rien : le changer ne demande pas de recalculer la lumière.
  const vitrines = room.vitrines?.map(({ title, ...vitrine }) => vitrine);
  const extras = { counters: room.counters, cubes: room.cubes, rotunda: room.rotunda, vitrines };
  const more = Object.values(extras).some((v) => v !== undefined) ? [extras] : [];
  return JSON.stringify([style, decor, artworks, room.benches ?? [], room.fountain ?? null, room.lanterns ?? [], ...more]);
}

/**
 * Donne à chaque surface ses coordonnées dans l'atlas (attribut `uv1`, le second jeu de coordonnées).
 * Renvoie la taille de l'atlas, la place de chaque plan et l'empreinte de la salle.
 */
export function layoutLightmap(meshes: THREE.Mesh[], context: string): LightmapLayout {
  const charts = chartsOf(meshes);
  const { width, height, placements } = packAtlas(charts);
  const placed = charts.map((c, i) => ({ ...c, ...placements[i] }));
  const v = new THREE.Vector3();
  const m = new THREE.Matrix4();
  for (const chart of placed) {
    for (const mesh of chart.meshes) {
      m.multiplyMatrices(chart.toPlane, mesh.matrixWorld);
      const pos = mesh.geometry.attributes.position;
      const uv = new Float32Array(pos.count * 2);
      for (let k = 0; k < pos.count; k++) {
        v.fromBufferAttribute(pos, k).applyMatrix4(m);
        uv.set(atlasUV({ width, height }, chart, v.x, v.y), k * 2);
      }
      mesh.geometry.setAttribute('uv1', new THREE.BufferAttribute(uv, 2));
    }
  }
  return { width, height, fingerprint: fingerprint(meshes, placed.length, width, height, context), charts: placed };
}

/** Empreinte d'une salle : la place et le découpage de chacune de ses surfaces, et ce dont dépend sa lumière. */
function fingerprint(meshes: THREE.Mesh[], charts: number, width: number, height: number, context: string): string {
  const parts: number[] = [FORMAT, DENSITY, PAD, width, height, charts, meshes.length];
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

const roomBox = (room: RoomConfig, margin: number) =>
  new THREE.Box3(
    new THREE.Vector3(room.position[0] - room.size[0] / 2 - margin, -0.1, room.position[1] - room.size[2] / 2 - margin),
    new THREE.Vector3(room.position[0] + room.size[0] / 2 + margin, room.size[1] + 2, room.position[1] + room.size[2] / 2 + margin),
  );

/**
 * Plaque l'atlas de lumière sur les surfaces d'une salle. Leur matériau est remplacé par une copie
 * qui prend la lumière dans l'atlas au lieu de la couleur des sommets. Les effets peints qui imitaient
 * la lumière sont retirés, puisque les vrais sont dans l'atlas : les halos autour des œuvres, les
 * ombres douces sous les bancs et les socles et, si le soleil a été calculé, la tache de soleil au sol.
 * L'ombre que le soleil de la visite fait porter aux sculptures, elle, reste.
 */
export function applyLightmap(group: THREE.Object3D, room: RoomConfig, meshes: THREE.Mesh[], texture: THREE.Texture, entry: Pick<LumiereRoom, 'encode' | 'soleil'>) {
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.channel = 1;
  // Une lumière varie doucement : inutile d'en garder des versions réduites, qui mêleraient
  // au loin les plans voisins dans l'atlas.
  texture.generateMipmaps = false;
  texture.minFilter = THREE.LinearFilter;
  const copies = new Map<THREE.Material, THREE.MeshBasicMaterial>();
  for (const mesh of meshes) {
    const source = mesh.material as THREE.MeshBasicMaterial;
    let copy = copies.get(source);
    if (!copy) {
      copy = source.clone();
      copy.vertexColors = false;
      copy.lightMap = texture;
      // Le rendu divise la lumière précalculée par π : on la lui rend, avec le facteur de codage.
      copy.lightMapIntensity = (entry.encode ?? 2) * Math.PI;
      copies.set(source, copy);
    }
    mesh.material = copy;
  }
  const floor = roomBox(room, 0);
  const at = new THREE.Vector3();
  group.traverse((o) => {
    if (o.userData.halo === room.id) o.visible = false;
    if (entry.soleil && o.userData.soleil === room.id) o.visible = false;
    if (o.userData.ombrePeinte && floor.containsPoint(o.getWorldPosition(at))) o.visible = false;
  });
}

/** Atlas réduit de moitié, pour les appareils modestes : quatre fois moins de mémoire. */
function halved(texture: THREE.Texture): THREE.Texture {
  const image = texture.image as CanvasImageSource & { width: number; height: number };
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, image.width >> 1);
  canvas.height = Math.max(1, image.height >> 1);
  canvas.getContext('2d')!.drawImage(image, 0, 0, canvas.width, canvas.height);
  texture.dispose();
  return new THREE.CanvasTexture(canvas);
}

/**
 * Charge la lumière précalculée d'un musée et la plaque, salle par salle, à mesure que les atlas arrivent.
 * Jusque-là, et pour toute salle dont l'empreinte a changé, l'éclairage par formule reste en place.
 * Renvoie, une fois tout chargé, où en est chaque salle (l'éditeur s'en sert pour signaler une salle à recalculer).
 */
export async function loadLumiere(
  url: string,
  group: THREE.Object3D,
  rooms: RoomConfig[],
  context: (room: RoomConfig) => string,
  onApplied: () => void,
  options: { light?: boolean } = {},
): Promise<LumiereState> {
  const state: LumiereState = { applied: [], stale: [], missing: [] };
  let manifest: LumiereManifest;
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`${res.status}`);
    manifest = await res.json();
  } catch (e) {
    console.warn(`Lumière précalculée indisponible (${url}) : éclairage par formule.`, e);
    return { ...state, missing: rooms.map((r) => r.id) };
  }
  const loader = new THREE.TextureLoader();
  const results = await Promise.all(
    rooms.map(async (room): Promise<keyof LumiereState | null> => {
      const meshes = bakeTargets(group, room.id);
      if (!meshes.length) return null;
      const entry = manifest.rooms?.[room.id];
      if (!entry) return 'missing';
      const { fingerprint } = layoutLightmap(meshes, context(room));
      if (fingerprint !== entry.fingerprint) {
        console.warn(`Salle « ${room.id} » modifiée depuis le calcul de sa lumière : relancer npm run lumiere.`);
        return 'stale';
      }
      try {
        const texture = await loader.loadAsync(new URL(entry.image, new URL(url, location.href)).href);
        applyLightmap(group, room, meshes, options.light ? halved(texture) : texture, entry);
        onApplied();
        return 'applied';
      } catch (e) {
        console.warn(`Atlas de lumière de la salle « ${room.id} » illisible : éclairage par formule.`, e);
        return 'stale';
      }
    }),
  );
  results.forEach((result, i) => result && state[result].push(rooms[i].id));
  return state;
}

/** Où en est la lumière précalculée des salles d'un musée. */
export interface LumiereState {
  /** Salles éclairées par leur atlas. */
  applied: string[];
  /** Salles modifiées depuis le calcul de leur lumière (ou dont l'atlas est illisible) : à recalculer. */
  stale: string[];
  /** Salles dont la lumière n'a jamais été calculée. */
  missing: string[];
}

/** Couleur moyenne d'une image (bois, enduit, ciel, tableau), pour la lumière qu'elle renvoie. */
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

/** Réglages du calcul, ajustables par `npm run lumiere`. Sauf `samples`, ce sont des forces relatives. */
export interface BakeSettings {
  /** Finesse du calcul : plus, c'est moins de grain et plus long. */
  samples: number;
  /** Éclairage d'ambiance du plafond, en watts par mètre carré de plafond (salles sans verrière). */
  fill: number;
  /** Force de la gorge lumineuse, par rapport à sa couleur à l'écran. */
  cove: number;
  /** Force du ciel d'une verrière, par rapport à sa couleur à l'écran. */
  sky: number;
  /** Force des faisceaux des projecteurs sur les œuvres : 1 suit le décor de la salle. */
  spots: number;
  /** Force de la tache de soleil sous une verrière : 0 la supprime. */
  sun: number;
  /** Force des lanternes. */
  lanterns: number;
  /** Lumière des salles voisines entrant par les portes : 1 est sa valeur réelle. */
  neighbours: number;
  /** Clarté d'ensemble, par rapport à celle que le décor donne à la salle. */
  exposure: number;
  /** Chaleur ajoutée à la lumière : 0 garde la teinte du décor. Sans effet dans une salle à lumière froide. */
  warmth: number;
}

export const DEFAULT_BAKE: BakeSettings = { samples: 256, fill: 3.2, cove: 3, sky: 4, spots: 1, sun: 1, lanterns: 1, neighbours: 1, exposure: 1, warmth: 0.07 };

/**
 * Faisceau d'un projecteur : ce qu'il ajoute sur le mur, au-dessus de l'œuvre, par rapport à la clarté
 * du mur. Discret dans une salle claire, il devient l'essentiel de la lumière dans une salle sombre.
 */
export const spotGain = (decor: Pick<Decor, 'light'>): number => 0.42 * decor.light.spots ** 3.2;
/** Tache de soleil : ce qu'elle ajoute au sol, par rapport à la clarté du sol. */
const SUN_GAIN = 0.75;
/** Puissance d'une lanterne, en watts (unités de Blender), et taille de sa flamme. */
const LANTERN_POWER = 95;
const LANTERN_RADIUS = 0.1;
/** Lumière du soleil, dorée, et diamètre apparent du soleil voilé, en degrés. */
const SUN_COLOR = [1, 0.93, 0.8];
const SUN_ANGLE = 0.8;

/**
 * Matériau visible et opaque : il compte pour la lumière. Ce qui est posé en transparence par-dessus
 * (halos, ombres peintes, taches de soleil) imite la lumière et n'en arrête aucune.
 */
function counts(material: THREE.Material): boolean {
  return material.visible && !material.transparent;
}

const round = (x: number, digits = 4) => +x.toFixed(digits);

/**
 * Scène à calculer, pour Blender. Coordonnées de Three.js.
 * - `bake` : les surfaces de la salle, à éclairer.
 * - `own` : ses sources de lumière dessinées (gorge lumineuse, ciel de la verrière).
 * - `env` : les surfaces des autres salles. Elles rayonnent la couleur qu'elles ont à l'écran,
 *   et éclairent ainsi la salle par ses portes.
 * - `occlude` : ce qui fait de l'ombre et renvoie la lumière (mobilier, cadres, sculptures, embrasures).
 * - projecteurs, éclairage d'ambiance, lanternes et soleil.
 */
export function exportBakeScene(
  group: THREE.Object3D,
  room: RoomConfig,
  decor: Decor,
  artworks: PlacedArtwork[],
  context: string,
  settings: BakeSettings,
  plan: Pick<Layout, 'wallThickness' | 'passages'>,
): object {
  const targets = bakeTargets(group, room.id);
  const layout = layoutLightmap(targets, context);
  const chartOf = new Map<THREE.Object3D, number>();
  layout.charts.forEach((c, i) => c.meshes.forEach((mesh) => chartOf.set(mesh, i)));
  // Ce qui se trouve dans la salle, à ses portes, et alentour.
  const inside = roomBox(room, 0.05);
  const local = roomBox(room, 0.1);
  const near = roomBox(room, 8);
  const textures = new Map<THREE.Texture, THREE.Color>();
  const meshes: object[] = [];
  const v = new THREE.Vector3();
  const centre = new THREE.Vector3();
  const box = new THREE.Box3();
  group.updateMatrixWorld(true);

  /** Sommets dans le repère du musée, et triangles de la matière donnée (ou de toutes). */
  const flat = (mesh: THREE.Mesh, materialIndex?: number) => {
    const pos = mesh.geometry.attributes.position;
    const positions: number[] = [];
    for (let k = 0; k < pos.count; k++) {
      v.fromBufferAttribute(pos, k).applyMatrix4(mesh.matrixWorld);
      positions.push(round(v.x), round(v.y), round(v.z));
    }
    const index = mesh.geometry.index;
    const all = index ? Array.from(index.array as ArrayLike<number>) : Array.from({ length: pos.count }, (_, i) => i);
    if (materialIndex === undefined) return { positions, indices: all };
    const indices: number[] = [];
    for (const g of mesh.geometry.groups) if (g.materialIndex === materialIndex) indices.push(...all.slice(g.start, g.start + g.count));
    return { positions, indices };
  };
  /** Couleur de la matière, image comprise. */
  const colorOf = (material: THREE.Material) => {
    const m = material as THREE.MeshBasicMaterial;
    return (m.color ?? new THREE.Color(1, 1, 1)).clone().multiply(averageColor(m.map, textures));
  };
  /** Part de lumière qu'une matière renvoie : jamais tout à fait 1. */
  const albedoOf = (material: THREE.Material) => {
    const c = colorOf(material);
    return [c.r, c.g, c.b].map((x) => round(Math.min(0.9, x)));
  };
  /** Couleur de chaque sommet à l'écran : la matière, multipliée par la lumière inscrite dans les sommets. */
  const screenColors = (mesh: THREE.Mesh, material: THREE.Material, count: number) => {
    const base = colorOf(material);
    const vertex = (material as THREE.MeshBasicMaterial).vertexColors ? mesh.geometry.attributes.color : null;
    const colors: number[] = [];
    for (let k = 0; k < count; k++) {
      const l = vertex ? [vertex.getX(k), vertex.getY(k), vertex.getZ(k)] : [1, 1, 1];
      colors.push(round(base.r * l[0]), round(base.g * l[1]), round(base.b * l[2]));
    }
    return colors;
  };

  group.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh || !o.visible || o.userData.lanterne) return;
    box.setFromObject(mesh).getCenter(centre);
    const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    materials.forEach((material, slot) => {
      if (!counts(material)) return;
      const part = () => flat(mesh, Array.isArray(mesh.material) ? slot : undefined);
      const occluder = () => meshes.push({ role: 'occlude', ...part(), albedo: albedoOf(material) });
      const basic = (material as THREE.MeshBasicMaterial).isMeshBasicMaterial === true;
      if (chartOf.has(mesh)) {
        // Une bande de revêtement est plaquée sur son mur : elle en partage la lumière, sans calcul à part.
        if (o.userData.habillage) return;
        const { positions, indices } = part();
        const color = mesh.geometry.attributes.color;
        const light: number[] = [];
        for (let k = 0; k < color.count; k++) light.push(round(color.getX(k)), round(color.getY(k)), round(color.getZ(k)));
        const uv1 = Array.from(mesh.geometry.attributes.uv1.array as ArrayLike<number>).map((x) => round(x, 6));
        meshes.push({ role: 'bake', chart: chartOf.get(mesh), positions, indices, uv1, light, albedo: albedoOf(material) });
      } else if (!o.userData.building) {
        // Mobilier, cadres, socles, sculptures de la salle.
        if (inside.containsPoint(centre)) occluder();
      } else if (o.userData.gorge === room.id || o.userData.verriere === room.id) {
        const { positions, indices } = part();
        const sky = o.userData.verriere === room.id;
        meshes.push({ role: 'own', kind: sky ? 'ciel' : 'gorge', positions, indices, colors: screenColors(mesh, material, positions.length / 3), strength: sky ? settings.sky : settings.cove });
      } else if (o.userData.embrasure) {
        if (box.intersectsBox(local)) occluder();
      } else if ((o.userData.lumiere ?? o.userData.gorge ?? o.userData.verriere) !== undefined) {
        // Surface d'une autre salle.
        if (!basic || !box.intersectsBox(near)) return;
        const { positions, indices } = part();
        meshes.push({ role: 'env', positions, indices, colors: screenColors(mesh, material, positions.length / 3) });
      } else if (local.containsPoint(centre)) {
        // Plinthes, traverses de la verrière, parois de son puits.
        occluder();
      }
    });
  });

  const [w, h, d] = room.size;
  const [cx, cz] = room.position;
  const top = clearHeight(room, decor);
  const tint = new THREE.Color(decor.light.tint);
  const sky = skylightOpening(room);
  // Une lumière bleutée est un choix du décor (salle « nuit ») : la chaleur ne s'y applique pas.
  // Sous une verrière, le soleil réchauffe déjà la salle : les murs en reçoivent moins.
  const warmth = tint.b > tint.r ? 0 : settings.warmth * (sky ? 0.6 : 1);
  const lamp = [tint.r, tint.g, tint.b].map((x) => round(x));

  /** Coordonnées dans l'atlas d'un point d'un mur, ou null s'il n'est sur aucune surface de la salle. */
  const locate = (point: THREE.Vector3, normal: THREE.Vector3): [number, number] | null => {
    for (const c of layout.charts) {
      if (c.normal.dot(normal) < 0.999 || Math.abs(c.normal.dot(point) - c.offset) > 0.2) continue;
      v.copy(point).applyMatrix4(c.toPlane);
      if (v.x < c.minX || v.x > c.minX + c.width || v.y < c.minY || v.y > c.minY + c.height) continue;
      return atlasUV(layout, c, v.x, v.y).map((x) => round(x, 6)) as [number, number];
    }
    return null;
  };

  // Sous une verrière, la lumière du jour suffit : pas de projecteurs, comme dans la visite.
  const spots: object[] = [];
  if (decor.light.spots > 0 && !sky) {
    for (const art of artworks) {
      if (art.room.id !== room.id || !art.normal || art.config.type !== 'painting') continue;
      // Seules les œuvres accrochées à un mur de la salle : le mur courbe d'une rotonde ne lit pas
      // l'atlas, ses œuvres gardent leur halo peint.
      if (!locate(art.center, art.normal)) continue;
      // Le projecteur pend au rail, à 1,50 m du mur, et vise le centre de l'œuvre. Sa lumière part
      // de 12 cm devant lui : le corps du projecteur ne lui fait pas d'ombre.
      const position = art.center.clone().addScaledVector(art.normal, 1.5).setY(top - 0.24);
      position.addScaledVector(art.center.clone().sub(position).normalize(), 0.12);
      const reach = position.distanceTo(art.center);
      const half = Math.max(art.config.width, art.config.height) / 2 + 0.35;
      spots.push({
        position: position.toArray().map((x) => round(x)),
        target: art.center.toArray().map((x) => round(x)),
        angle: round(THREE.MathUtils.radToDeg(2 * Math.atan(half / reach)), 2),
        blend: 0.7,
        color: lamp,
        // Où mesurer le faisceau : sur le mur, 25 cm au-dessus de l'œuvre.
        probe: locate(art.center.clone().setY(art.center.y + art.config.height / 2 + 0.25), art.normal),
      });
    }
  }

  // Ambiance : le plafond entier éclaire doucement la salle. Sous une verrière, c'est le ciel qui s'en charge.
  // Dans une rotonde, la coupole cache le plafond : l'ambiance vient de sous la coupole, au-dessus du cercle.
  const cove = coveOf(room, decor);
  const inset = cove ? cove.inset + 0.3 : 0.6;
  const rotunda = rotundaShape(room);
  const [ax, ad, ay] = rotunda ? [rotunda.radius * 1.3, rotunda.radius * 1.3, rotunda.wallHeight - 0.05] : [w - inset * 2, d - inset * 2, top - 0.05];
  const areas = sky
    ? []
    : [
        {
          position: [cx, round(ay), cz],
          size: [round(ax), round(ad)],
          power: round(settings.fill * decor.light.level * ax * ad, 2),
          color: [tint.r, tint.g, tint.b].map((x) => round(x)),
        },
      ];

  const flame = new THREE.Color(LANTERN_COLOR);
  const points = (room.lanterns ?? []).map(([lx, lz]) => ({
    position: [round(cx + lx), round(lanternHeight(room)), round(cz + lz)],
    power: round(LANTERN_POWER * settings.lanterns, 2),
    radius: LANTERN_RADIUS,
    color: [flame.r, flame.g, flame.b].map((x) => round(x)),
  }));

  const sun = sky && settings.sun > 0 ? { direction: sunDirection(room).toArray().map((x) => round(x)), from: [cx, h + 6, cz], color: SUN_COLOR, angle: SUN_ANGLE } : null;

  // Partie visible du sol et du plafond : ils vont jusqu'aux limites de la salle, mais on n'en voit que
  // ce qui se trouve entre les surfaces des murs et, pour le sol, sous les portes.
  const half = plan.wallThickness / 2;
  const zones: [number, number, number, number][] = [[cx - w / 2 + half, cz - d / 2 + half, cx + w / 2 - half, cz + d / 2 - half]];
  const thresholds = plan.passages
    .filter((p) => p.rooms.includes(room))
    .map((p): [number, number, number, number] => {
      const a = p.center.clone().addScaledVector(p.tangent, -p.width / 2).addScaledVector(p.normal, -half);
      const b = p.center.clone().addScaledVector(p.tangent, p.width / 2).addScaledVector(p.normal, half);
      return [Math.min(a.x, b.x), Math.min(a.z, b.z), Math.max(a.x, b.x), Math.max(a.z, b.z)];
    });
  /** Rectangles visibles d'un plan horizontal, en points de l'atlas. */
  const visible = (c: (typeof layout.charts)[number]) =>
    [...zones, ...(c.family === 'sol' ? thresholds : [])].map(([x0, z0, x1, z1]) => {
      const p = v.set(x0, 0, z0).applyMatrix4(c.toPlane).clone();
      const q = v.set(x1, 0, z1).applyMatrix4(c.toPlane);
      const [u0, v0] = atlasUV(layout, c, p.x, p.y);
      const [u1, v1] = atlasUV(layout, c, q.x, q.y);
      return [Math.min(u0, u1) * layout.width, Math.min(v0, v1) * layout.height, Math.max(u0, u1) * layout.width, Math.max(v0, v1) * layout.height].map((x) => round(x, 3));
    });

  return {
    version: FORMAT,
    room: room.id,
    atlas: { width: layout.width, height: layout.height },
    fingerprint: layout.fingerprint,
    pad: PAD,
    // Rectangle de chaque plan dans l'atlas, marges comprises : x et y du coin, puis du coin opposé.
    charts: layout.charts.map((c) => ({ rect: [c.x, c.y, c.x + c.w, c.y + c.h], family: c.family, ...(c.family === 'murs' ? {} : { visible: visible(c) }) })),
    samples: settings.samples,
    gains: { spots: round(spotGain(decor) * settings.spots), sun: round(SUN_GAIN * settings.sun) },
    // Lumière plus dorée des projecteurs. Appliquée à l'assemblage : changer la chaleur ne demande pas de recalcul.
    lampTint: [1, round(1 - 1.2 * warmth), round(1 - 3.4 * warmth)],
    neighbours: settings.neighbours,
    exposure: settings.exposure,
    warmth,
    meshes,
    spots,
    areas,
    points,
    sun,
  };
}

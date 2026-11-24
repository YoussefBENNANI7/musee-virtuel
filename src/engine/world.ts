import * as THREE from 'three';
import { fixtureMaterial, hangPainting, placeSculpture, TRACK_DISTANCE, type ArtworkContext, type PlacedArtwork } from './artworks';
import { FRAMES } from './cadres';
import { buildBuilding } from './building';
import { clearHeight, resolveDecor, type Decor } from './decors';
import { COUNTER, benchFootprint, buildBench, buildCounter, buildLantern, buildPhotoCubes, buildZone, lanternHeight } from './furniture';
import { FOUNTAIN_RADIUS, buildFountain, type Fountain } from './fontaine';
import { bendLettering, buildLettering, drawLettering, letteringColor } from './lettrage';
import { EYE_HEIGHT, WALLS, buildLayout, inside, roomRect, wallFrame, type Layout } from './layout';
import type { Quality } from './quality';
import type { Style } from './styles';
import { FRIEZE_INSET, buildRotunda, rotundaFrame, wallNiche } from './rotonde';
import { labelTexture } from './textures';
import { loc, tr, type LetteringConfig, type MuseumConfig, type RoomConfig } from './types';
import { VITRINE, VITRINE_RADIUS, VITRINE_TITLE, buildVitrine, placeCoin } from './vitrines';

export type { PlacedArtwork } from './artworks';

/** Le musée construit : le bâtiment, les œuvres installées et les règles de déplacement. */
export interface World {
  group: THREE.Group;
  layout: Layout;
  artworks: PlacedArtwork[];
  /** Décor de chaque salle, par identifiant. */
  decors: Map<string, Decor>;
  /** Fontaines : leur eau bouge, la visite l'anime tant qu'elles sont en vue. */
  fountains: Fountain[];
  /** Le visiteur peut-il se tenir en ce point (murs, portes et socles compris) ? */
  walkable(x: number, z: number): boolean;
  roomAt(x: number, z: number): RoomConfig | null;
  /** Point d'arrivée dans une salle, face à l'intérieur. */
  spawn(roomId: string): { x: number; z: number; yaw: number };
  /** Où se placer pour voir une œuvre en entier, à la distance demandée. */
  viewpoint(art: PlacedArtwork, from: THREE.Vector3, distance: number): { pos: THREE.Vector3; yaw: number; pitch: number };
  setLang(lang: string): void;
}

export interface WorldOptions {
  lang: string;
  /** Adresse du dossier du musée. */
  base: string;
  style: Style;
  quality: Quality;
  /** Environnement reflété par les sculptures. */
  env: THREE.Texture;
  /** Appelé quand une image finit de charger, pour redessiner la scène. */
  onLoad?: () => void;
  /**
   * Aperçu d'autres cadres (`?cadres=tableau:dore-ancien,papier:baguette-chene` dans l'adresse) :
   * modèle à donner à chaque famille de cadres, à la place du sien, sans toucher à la configuration.
   */
  frames?: string | null;
}

/** Lit le choix de cadres d'aperçu : « famille:modèle », séparés par des virgules. */
function frameChooser(choice: string | null | undefined): ArtworkContext['frameStyle'] {
  const wanted = new Map((choice ?? '').split(',').map((pair) => pair.split(':') as [string, string]));
  if (!choice) return undefined;
  return (cfg) => {
    // La famille d'un tableau : cadre doré, œuvre sous passe-partout, ou toile au cadre discret du décor.
    const family = cfg.frame === 'gilt' ? 'tableau' : cfg.mat ? 'papier' : 'caisse';
    return FRAMES[wanted.get(family) ?? ''] ?? null;
  };
}

export function buildWorld(museum: MuseumConfig, options: WorldOptions): World {
  const { style, quality } = options;
  const layout = buildLayout(museum, { wallThickness: style.wallThickness, doorHeight: style.doorHeight });
  const decors = new Map(museum.rooms.map((room) => [room.id, resolveDecor(style, room)]));
  const building = buildBuilding(museum, layout, style, quality, decors);
  const group = building.group;

  const ctx: ArtworkContext = {
    quality,
    base: options.base,
    env: options.env,
    onLoad: options.onLoad ?? (() => {}),
    light: building.light,
    decor: (roomId) => decors.get(roomId)!,
    frameStyle: frameChooser(options.frames),
  };
  /** Zones occupées par le mobilier et les socles : le visiteur les contourne. */
  const blocked: ((x: number, z: number) => boolean)[] = [];
  const artworks: PlacedArtwork[] = [];
  const fountains: Fountain[] = [];
  /**
   * Lettrages muraux : leur texte est redessiné quand la langue change. `curve` : rayon du mur courbe qui les porte ;
   * `fit` : largeur à ne pas dépasser (le titre d'une vitrine tient sur la face de son socle).
   */
  const letterings: { cfg: LetteringConfig; mesh: THREE.Mesh; color: string; curve?: number; fit?: number }[] = [];
  for (const room of museum.rooms) {
    const decor = decors.get(room.id)!;
    for (const wall of WALLS) {
      const { holder, frame } = building.wall(room.id, wall);
      for (const cfg of room.lettering ?? []) {
        if (cfg.wall === wall && cfg.angle === undefined) letterings.push({ cfg, mesh: buildLettering(cfg, holder), color: letteringColor(cfg, decor) });
      }
      const hung = room.artworks.filter((cfg) => cfg.type === 'painting' && !cfg.rotunda && cfg.wall === wall);
      for (const cfg of hung) {
        if (cfg.type === 'painting') artworks.push(hangPainting(cfg, room, holder, frame, ctx));
      }
      // Rail des projecteurs, au plafond, le long des murs qui portent des œuvres.
      if (hung.length && !building.light(room.id).daylight && decor.light.spots > 0) {
        // Sa longueur le fait rejoindre exactement les rails des murs voisins, dans les angles.
        const rail = new THREE.Mesh(new THREE.BoxGeometry(frame.length - TRACK_DISTANCE * 2 + 0.025, 0.02, 0.025), fixtureMaterial(decor));
        rail.position.set(0, clearHeight(room, decor) - 0.01, TRACK_DISTANCE);
        holder.add(rail);
      }
    }
    for (const bench of room.benches ?? []) {
      group.add(buildBench(bench, room, decor));
      const { hx, hz } = benchFootprint(bench);
      const bx = room.position[0] + bench.position[0];
      const bz = room.position[1] + bench.position[1];
      blocked.push((x, z) => Math.abs(x - bx) < hx + 0.3 && Math.abs(z - bz) < hz + 0.3);
    }
    if (room.fountain) {
      const fountain = buildFountain(room.fountain.position, room, decor, quality, options.env);
      group.add(fountain.group);
      fountains.push(fountain);
      const fx = room.position[0] + room.fountain.position[0];
      const fz = room.position[1] + room.fountain.position[1];
      blocked.push((x, z) => Math.hypot(x - fx, z - fz) < FOUNTAIN_RADIUS + 0.3);
    }
    for (const wall of room.counters ?? []) {
      group.add(buildCounter(wall, room, decor, style.wallThickness));
      // Le visiteur reste devant le comptoir : une bande le long du mur lui est fermée.
      const frame = wallFrame(room, wall, style.wallThickness / 2);
      const rect = roomRect(room);
      const reach = COUNTER.depth + 0.3;
      blocked.push((x, z) => inside(rect, x, z) && (x - frame.center.x) * frame.normal.x + (z - frame.center.z) * frame.normal.z < reach);
    }
    for (const zone of room.zones ?? []) group.add(buildZone(zone, room, decor));
    if (room.cubes) group.add(buildPhotoCubes(room.cubes, room, decor, options.base, ctx.onLoad));
    for (const at of room.lanterns ?? []) group.add(buildLantern(at, room, room.size[1], lanternHeight(room)));
    // Rotonde : le mur courbe porte ses propres œuvres, chacune dans une niche de laiton.
    const rotunda = room.rotunda ? buildRotunda(room, decor, quality, options.env) : null;
    if (rotunda) {
      group.add(rotunda.group);
      blocked.push(rotunda.blocked);
      for (const cfg of room.artworks) {
        if (cfg.type !== 'painting' || !cfg.rotunda) continue;
        const frame = rotundaFrame(rotunda.shape, cfg.rotunda.angle, 0.14);
        const holder = new THREE.Group();
        holder.position.copy(frame.center);
        holder.rotation.y = frame.rotY;
        group.add(holder);
        if (room.rotunda!.niches !== false) wallNiche(holder, cfg.width, cfg.height, cfg.y ?? 1.55, decor, options.env);
        artworks.push(hangPainting({ ...cfg, offset: 0 }, room, holder, frame, ctx));
        artworks[artworks.length - 1].config = cfg;
        // Le mur courbe ne lit pas la lumière précalculée : le halo peint de l'œuvre y reste toujours.
        holder.traverse((o) => {
          delete o.userData.halo;
        });
      }
    }
    // Lettrage sur le mur courbe : cintré pour l'épouser, posé sur la frise d'étoffe s'il y en a une.
    if (rotunda) {
      const inset = (room.rotunda!.frieze ? FRIEZE_INSET : 0) + 0.006;
      for (const cfg of room.lettering ?? []) {
        if (cfg.angle === undefined) continue;
        const frame = rotundaFrame(rotunda.shape, cfg.angle, inset);
        const holder = new THREE.Group();
        holder.position.copy(frame.center);
        holder.rotation.y = frame.rotY;
        group.add(holder);
        letterings.push({ cfg: { ...cfg, offset: 0 }, mesh: buildLettering({ ...cfg, offset: 0 }, holder), color: letteringColor(cfg, decor), curve: rotunda.shape.radius - inset });
      }
    }
    // Vitrines : chaque pièce de monnaie y a sa place.
    const vitrines = new Map<string, THREE.Group>();
    for (const cfg of room.vitrines ?? []) {
      const vitrine = buildVitrine(cfg, room, decor, rotunda ? rotunda.shape.wallHeight + 0.6 : 0);
      vitrines.set(cfg.id, vitrine);
      // Titre de la vitrine, en lettres de laiton sur la face avant de son socle.
      if (cfg.title) {
        const title: LetteringConfig = { offset: 0, y: VITRINE_TITLE.y, height: VITRINE_TITLE.height, text: cfg.title, color: VITRINE_TITLE.color };
        const front = new THREE.Group();
        front.position.z = VITRINE.side / 2 + 0.002;
        vitrine.add(front);
        letterings.push({ cfg: title, mesh: buildLettering(title, front), color: VITRINE_TITLE.color, fit: VITRINE.side - 0.08 });
      }
      group.add(vitrine);
      const [vx, vz] = [vitrine.position.x, vitrine.position.z];
      blocked.push((x, z) => Math.hypot(x - vx, z - vz) < VITRINE_RADIUS);
    }
    for (const cfg of room.artworks) {
      if (cfg.type !== 'sculpture') continue;
      const vitrine = cfg.vitrine && 'coin' in cfg.model ? vitrines.get(cfg.vitrine.id) : undefined;
      artworks.push(vitrine ? placeCoin(cfg, room, vitrine, ctx) : placeSculpture(cfg, room, group, ctx));
    }
  }
  for (const art of artworks) {
    const o = art.obstacle;
    if (o) blocked.push((x, z) => Math.hypot(x - o.x, z - o.z) < o.r);
  }

  const world: World = {
    group,
    layout,
    decors,
    artworks,
    fountains,
    walkable: (x, z) => layout.walkable(x, z) && !blocked.some((hit) => hit(x, z)),
    roomAt: layout.roomAt,
    spawn: layout.spawn,

    viewpoint(art, from, distance) {
      const target = new THREE.Vector3(art.center.x, EYE_HEIGHT, art.center.z);
      let dir: THREE.Vector3;
      if (art.normal) {
        dir = art.normal.clone();
      } else {
        // Sculpture : on l'aborde du côté où se trouve déjà le visiteur.
        const origin = layout.roomAt(from.x, from.z) === art.room ? from : new THREE.Vector3(art.room.position[0], 0, art.room.position[1]);
        dir = new THREE.Vector3(origin.x - target.x, 0, origin.z - target.z);
        if (dir.lengthSq() < 0.01) dir.set(0, 0, 1);
        dir.normalize();
      }
      const area = layout.standingArea(art.room);
      const pos = new THREE.Vector3();
      // Si l'endroit idéal est occupé par un banc ou un socle, on s'approche de l'œuvre
      // par petits pas, puis, à défaut, on recule.
      const nearest = art.depth + Math.min(1, art.closest);
      const tries = [0, -0.4, -0.8, -1.2, -1.6, -2, 0.4, 0.8, 1.2].map((delta) => Math.max(nearest, distance + delta));
      for (const d of tries) {
        pos.copy(target).addScaledVector(dir, d);
        pos.x = THREE.MathUtils.clamp(pos.x, area.minX, area.maxX);
        pos.z = THREE.MathUtils.clamp(pos.z, area.minZ, area.maxZ);
        if (world.walkable(pos.x, pos.z)) break;
      }
      const reach = Math.hypot(pos.x - target.x, pos.z - target.z);
      return { pos, yaw: Math.atan2(dir.x, dir.z), pitch: Math.atan2(art.center.y - EYE_HEIGHT, reach) };
    },

    setLang(lang) {
      for (const art of artworks) {
        const mat = art.label.material as THREE.MeshBasicMaterial;
        mat.map?.dispose();
        const dark = decors.get(art.room.id)!.labels === 'dark';
        mat.map = labelTexture(tr(art.config.title, lang), loc(art.config.artist, lang), loc(art.config.year, lang), quality, dark);
        mat.needsUpdate = true;
      }
      for (const { cfg, mesh, color, curve, fit } of letterings) {
        const mat = mesh.material as THREE.MeshBasicMaterial;
        mat.map?.dispose();
        const drawn = drawLettering(cfg, tr(cfg.text, lang), color, quality.tier === 'low' ? 0.5 : 1);
        mat.map = drawn.texture;
        mat.needsUpdate = true;
        // Trop long pour sa place, un titre est réduit d'un bloc, sans changer de proportions.
        const k = fit ? Math.min(1, fit / drawn.width) : 1;
        if (curve) bendLettering(mesh, drawn.width, drawn.height, curve);
        else mesh.scale.set(drawn.width * k, drawn.height * k, 1);
      }
    },
  };
  world.setLang(options.lang);
  return world;
}

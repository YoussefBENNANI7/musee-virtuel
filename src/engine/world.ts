import * as THREE from 'three';
import { fixtureMaterial, hangPainting, placeSculpture, TRACK_DISTANCE, type ArtworkContext, type PlacedArtwork } from './artworks';
import { buildBuilding } from './building';
import { clearHeight, resolveDecor, type Decor } from './decors';
import { FOUNTAIN_RADIUS, benchFootprint, buildBench, buildFountain, buildLantern, lanternHeight } from './furniture';
import { EYE_HEIGHT, WALLS, buildLayout, type Layout } from './layout';
import type { Quality } from './quality';
import type { Style } from './styles';
import { labelTexture } from './textures';
import { loc, tr, type MuseumConfig, type RoomConfig } from './types';

export type { PlacedArtwork } from './artworks';

/** Le musée construit : le bâtiment, les œuvres installées et les règles de déplacement. */
export interface World {
  group: THREE.Group;
  layout: Layout;
  artworks: PlacedArtwork[];
  /** Décor de chaque salle, par identifiant. */
  decors: Map<string, Decor>;
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
  };
  /** Zones occupées par le mobilier et les socles : le visiteur les contourne. */
  const blocked: ((x: number, z: number) => boolean)[] = [];
  const artworks: PlacedArtwork[] = [];
  for (const room of museum.rooms) {
    const decor = decors.get(room.id)!;
    for (const wall of WALLS) {
      const { holder, frame } = building.wall(room.id, wall);
      const hung = room.artworks.filter((cfg) => cfg.type === 'painting' && cfg.wall === wall);
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
      group.add(buildFountain(room.fountain.position, room, decor, building.zellige()));
      const fx = room.position[0] + room.fountain.position[0];
      const fz = room.position[1] + room.fountain.position[1];
      blocked.push((x, z) => Math.hypot(x - fx, z - fz) < FOUNTAIN_RADIUS + 0.3);
    }
    for (const at of room.lanterns ?? []) group.add(buildLantern(at, room, room.size[1], lanternHeight(room)));
    for (const cfg of room.artworks) {
      if (cfg.type === 'sculpture') artworks.push(placeSculpture(cfg, room, group, ctx));
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
    },
  };
  world.setLang(options.lang);
  return world;
}

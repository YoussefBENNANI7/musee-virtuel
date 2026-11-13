import * as THREE from 'three';
import { hangPainting, placeSculpture, type ArtworkContext, type PlacedArtwork } from './artworks';
import { buildBuilding } from './building';
import { EYE_HEIGHT, WALLS, buildLayout, type Layout } from './layout';
import type { Quality } from './quality';
import type { Style } from './styles';
import { labelTexture } from './textures';
import { tr, type MuseumConfig, type RoomConfig } from './types';

export type { PlacedArtwork } from './artworks';

/** Le musée construit : le bâtiment, les œuvres installées et les règles de déplacement. */
export interface World {
  group: THREE.Group;
  layout: Layout;
  artworks: PlacedArtwork[];
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
  const building = buildBuilding(museum, layout, style, quality);
  const group = building.group;

  const ctx: ArtworkContext = { style, quality, base: options.base, env: options.env, onLoad: options.onLoad ?? (() => {}) };
  const artworks: PlacedArtwork[] = [];
  for (const room of museum.rooms) {
    for (const wall of WALLS) {
      const { holder, frame } = building.wall(room.id, wall);
      for (const cfg of room.artworks) {
        if (cfg.type === 'painting' && cfg.wall === wall) artworks.push(hangPainting(cfg, room, holder, frame, ctx));
      }
    }
    for (const cfg of room.artworks) {
      if (cfg.type === 'sculpture') artworks.push(placeSculpture(cfg, room, group, ctx));
    }
  }
  const obstacles = artworks.flatMap((a) => (a.obstacle ? [a.obstacle] : []));

  const world: World = {
    group,
    layout,
    artworks,
    walkable: (x, z) => layout.walkable(x, z) && !obstacles.some((o) => Math.hypot(x - o.x, z - o.z) < o.r),
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
      const pos = target.clone().addScaledVector(dir, distance);
      pos.x = THREE.MathUtils.clamp(pos.x, area.minX, area.maxX);
      pos.z = THREE.MathUtils.clamp(pos.z, area.minZ, area.maxZ);
      const reach = Math.hypot(pos.x - target.x, pos.z - target.z);
      return { pos, yaw: Math.atan2(dir.x, dir.z), pitch: Math.atan2(art.center.y - EYE_HEIGHT, reach) };
    },

    setLang(lang) {
      for (const art of artworks) {
        const mat = art.label.material as THREE.MeshStandardMaterial;
        mat.map?.dispose();
        mat.map = labelTexture(tr(art.config.title, lang), art.config.artist, art.config.year, quality);
        mat.needsUpdate = true;
      }
    },
  };
  world.setLang(options.lang);
  return world;
}

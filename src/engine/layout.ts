import { Vector3 } from 'three';
import type { DoorConfig, MuseumConfig, RoomConfig, WallId } from './types';

/**
 * Géométrie du plan : murs, portes, zones où le visiteur peut marcher.
 * Ce module ne dessine rien et ne dépend pas du navigateur : il se teste seul.
 */

export const EYE_HEIGHT = 1.6;
/** Hauteur du centre des tableaux. */
export const ART_CENTER_Y = 1.55;
/** Distance minimale entre le visiteur et la surface d'un mur. */
export const MARGIN = 0.45;
/** Largeur minimale d'une porte pour qu'un visiteur y passe. */
export const MIN_DOOR_WIDTH = 0.9;
export const WALLS: WallId[] = ['north', 'south', 'east', 'west'];

export interface Rect {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

/** Repère d'un mur : son centre au sol, la direction vers la salle, et l'axe des décalages. */
export interface WallFrame {
  center: Vector3;
  normal: Vector3;
  tangent: Vector3;
  /** Rotation à donner à un objet pour qu'il soit plaqué sur ce mur, face à la salle. */
  rotY: number;
  length: number;
}

/**
 * Repère d'un mur. `inset` recule le mur vers l'intérieur de la salle : avec la moitié
 * de l'épaisseur des murs, on obtient la surface réellement visible.
 */
export function wallFrame(room: RoomConfig, wall: WallId, inset = 0): WallFrame {
  const [w, , d] = room.size;
  const [cx, cz] = room.position;
  const length = (wall === 'north' || wall === 'south' ? w : d) - inset * 2;
  switch (wall) {
    case 'north':
      return { center: new Vector3(cx, 0, cz - d / 2 + inset), normal: new Vector3(0, 0, 1), tangent: new Vector3(1, 0, 0), rotY: 0, length };
    case 'south':
      return { center: new Vector3(cx, 0, cz + d / 2 - inset), normal: new Vector3(0, 0, -1), tangent: new Vector3(-1, 0, 0), rotY: Math.PI, length };
    case 'east':
      return { center: new Vector3(cx + w / 2 - inset, 0, cz), normal: new Vector3(-1, 0, 0), tangent: new Vector3(0, 0, 1), rotY: -Math.PI / 2, length };
    case 'west':
      return { center: new Vector3(cx - w / 2 + inset, 0, cz), normal: new Vector3(1, 0, 0), tangent: new Vector3(0, 0, -1), rotY: Math.PI / 2, length };
  }
}

export function roomRect(room: RoomConfig, inset = 0): Rect {
  const [w, , d] = room.size;
  const [cx, cz] = room.position;
  return { minX: cx - w / 2 + inset, maxX: cx + w / 2 - inset, minZ: cz - d / 2 + inset, maxZ: cz + d / 2 - inset };
}

export const inside = (r: Rect, x: number, z: number) => x >= r.minX && x <= r.maxX && z >= r.minZ && z <= r.maxZ;

/** Ouverture dans un mur, vue depuis une salle. */
export interface Opening {
  offset: number;
  width: number;
  height: number;
}

/** Passage entre deux salles, à travers l'épaisseur du mur. */
export interface Passage {
  door: DoorConfig;
  /** Point au sol, au milieu de la porte et de l'épaisseur du mur. */
  center: Vector3;
  /** Axe de la largeur de la porte, et direction vers la salle où elle est déclarée. */
  tangent: Vector3;
  normal: Vector3;
  rotY: number;
  width: number;
  height: number;
  /** Salle où la porte est déclarée, puis salle voisine. */
  rooms: [RoomConfig, RoomConfig];
}

export interface Layout {
  wallThickness: number;
  /** Ouvertures d'un mur, triées le long du mur. */
  openings(roomId: string, wall: WallId): Opening[];
  passages: Passage[];
  /** Portes qui ne débouchent sur aucune salle voisine. */
  deadEnds: DoorConfig[];
  /** Le visiteur peut-il se tenir en ce point (mobilier non compris) ? */
  walkable(x: number, z: number): boolean;
  roomAt(x: number, z: number): RoomConfig | null;
  /** Zone d'une salle où le visiteur peut se tenir. */
  standingArea(room: RoomConfig): Rect;
  /** Point d'arrivée dans une salle, face à l'intérieur. */
  spawn(roomId: string): { x: number; z: number; yaw: number };
  /** Salles que l'on peut atteindre à pied depuis une salle donnée, elle comprise. */
  reachable(fromRoomId: string): Set<string>;
}

export interface LayoutOptions {
  wallThickness: number;
  doorHeight: number;
}

export function buildLayout(museum: MuseumConfig, options: LayoutOptions): Layout {
  const half = options.wallThickness / 2;
  const rooms = museum.rooms;
  const byId = new Map(rooms.map((r) => [r.id, r]));
  const openings = new Map<string, Opening[]>();
  const passages: Passage[] = [];
  const deadEnds: DoorConfig[] = [];
  const corridors: Rect[] = [];
  const links = new Map<string, Set<string>>(rooms.map((r) => [r.id, new Set<string>()]));

  const addOpening = (roomId: string, wall: WallId, o: Opening) => {
    const key = `${roomId}:${wall}`;
    openings.set(key, [...(openings.get(key) ?? []), o].sort((a, b) => a.offset - b.offset));
  };

  for (const door of museum.doors ?? []) {
    const room = byId.get(door.room);
    if (!room) continue;
    const f = wallFrame(room, door.wall);
    const center = f.center.clone().addScaledVector(f.tangent, door.offset);

    // La salle voisine est celle dont un mur opposé se trouve sur la même limite, en face de la porte.
    let neighbour: { room: RoomConfig; wall: WallId; offset: number } | null = null;
    for (const other of rooms) {
      if (other === room) continue;
      for (const wall of WALLS) {
        const g = wallFrame(other, wall);
        const rel = center.clone().sub(g.center);
        if (g.normal.dot(f.normal) > -0.99 || Math.abs(rel.dot(g.normal)) > 0.01) continue;
        const offset = rel.dot(g.tangent);
        if (Math.abs(offset) + door.width / 2 <= g.length / 2 - half) neighbour = { room: other, wall, offset };
      }
    }

    const lowest = Math.min(room.size[1], neighbour?.room.size[1] ?? Infinity);
    const height = door.height === 'full' ? lowest : Math.min(door.height ?? options.doorHeight, lowest);
    addOpening(room.id, door.wall, { offset: door.offset, width: door.width, height });
    if (!neighbour) {
      deadEnds.push(door);
      continue;
    }
    addOpening(neighbour.room.id, neighbour.wall, { offset: neighbour.offset, width: door.width, height });
    passages.push({ door, center, tangent: f.tangent, normal: f.normal, rotY: f.rotY, width: door.width, height, rooms: [room, neighbour.room] });
    links.get(room.id)!.add(neighbour.room.id);
    links.get(neighbour.room.id)!.add(room.id);

    // Couloir de marche : un peu plus étroit que la porte, il traverse le mur d'une salle à l'autre.
    const side = Math.max(0.05, door.width / 2 - 0.3);
    const reach = half + MARGIN + 0.1;
    const a = center.clone().addScaledVector(f.tangent, -side).addScaledVector(f.normal, -reach);
    const b = center.clone().addScaledVector(f.tangent, side).addScaledVector(f.normal, reach);
    corridors.push({ minX: Math.min(a.x, b.x), maxX: Math.max(a.x, b.x), minZ: Math.min(a.z, b.z), maxZ: Math.max(a.z, b.z) });
  }

  const standingArea = (room: RoomConfig) => roomRect(room, half + MARGIN);
  const areas = rooms.map(standingArea);

  return {
    wallThickness: options.wallThickness,
    openings: (roomId, wall) => openings.get(`${roomId}:${wall}`) ?? [],
    passages,
    deadEnds,
    standingArea,
    walkable: (x, z) => areas.some((r) => inside(r, x, z)) || corridors.some((r) => inside(r, x, z)),
    roomAt: (x, z) => rooms.find((r) => inside(roomRect(r), x, z)) ?? null,

    spawn(roomId) {
      const room = byId.get(roomId) ?? rooms[0];
      if (room.id === museum.start.room) {
        return { x: room.position[0] + museum.start.position[0], z: room.position[1] + museum.start.position[1], yaw: museum.start.yaw };
      }
      // On arrive juste après la première porte de la salle, face à l'intérieur.
      for (const wall of WALLS) {
        const gap = openings.get(`${room.id}:${wall}`)?.[0];
        if (!gap) continue;
        const f = wallFrame(room, wall, half);
        const p = f.center.clone().addScaledVector(f.tangent, gap.offset).addScaledVector(f.normal, 1.4);
        return { x: p.x, z: p.z, yaw: Math.atan2(-f.normal.x, -f.normal.z) };
      }
      return { x: room.position[0], z: room.position[1], yaw: 0 };
    },

    reachable(fromRoomId) {
      const seen = new Set<string>();
      const queue = byId.has(fromRoomId) ? [fromRoomId] : [];
      while (queue.length) {
        const id = queue.pop()!;
        if (seen.has(id)) continue;
        seen.add(id);
        queue.push(...(links.get(id) ?? []));
      }
      return seen;
    },
  };
}

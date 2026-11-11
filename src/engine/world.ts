import * as THREE from 'three';
import type {
  ArtworkConfig,
  MuseumConfig,
  PaintingConfig,
  RoomConfig,
  SculptureConfig,
  WallId,
} from './types';
import { tr } from './types';
import { artworkTexture, floorTexture, labelTexture, poolTexture, rng } from './textures';

export const EYE_HEIGHT = 1.6;
const ART_CENTER_Y = 1.55;
const DOOR_HEIGHT = 2.7;
/** Distance minimale entre le visiteur et un mur. */
const MARGIN = 0.45;
const WALLS: WallId[] = ['north', 'south', 'east', 'west'];

export interface PlacedArtwork {
  config: ArtworkConfig;
  room: RoomConfig;
  /** Point visé par le regard. */
  center: THREE.Vector3;
  /** Largeur à faire tenir à l'écran, et recul supplémentaire dû au volume de l'œuvre. */
  span: number;
  depth: number;
  /** Pour un tableau : direction du mur vers la salle. */
  normal?: THREE.Vector3;
  label: THREE.Mesh;
}

interface Rect {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

export interface World {
  group: THREE.Group;
  artworks: PlacedArtwork[];
  walkable(x: number, z: number): boolean;
  roomAt(x: number, z: number): RoomConfig | null;
  /** Point d'arrivée dans une salle, face à l'intérieur. */
  spawn(roomId: string): { x: number; z: number; yaw: number };
  /** Où se placer pour voir une œuvre en entier, à la distance demandée. */
  viewpoint(art: PlacedArtwork, from: THREE.Vector3, distance: number): { pos: THREE.Vector3; yaw: number; pitch: number };
  setLang(lang: string): void;
}

/** Repère d'un mur : son centre, la direction vers la salle, et l'axe des décalages. */
export function wallFrame(room: RoomConfig, wall: WallId) {
  const [w, , d] = room.size;
  const [cx, cz] = room.position;
  switch (wall) {
    case 'north':
      return { center: new THREE.Vector3(cx, 0, cz - d / 2), normal: new THREE.Vector3(0, 0, 1), tangent: new THREE.Vector3(1, 0, 0), rotY: 0, length: w };
    case 'south':
      return { center: new THREE.Vector3(cx, 0, cz + d / 2), normal: new THREE.Vector3(0, 0, -1), tangent: new THREE.Vector3(-1, 0, 0), rotY: Math.PI, length: w };
    case 'east':
      return { center: new THREE.Vector3(cx + w / 2, 0, cz), normal: new THREE.Vector3(-1, 0, 0), tangent: new THREE.Vector3(0, 0, 1), rotY: -Math.PI / 2, length: d };
    case 'west':
      return { center: new THREE.Vector3(cx - w / 2, 0, cz), normal: new THREE.Vector3(1, 0, 0), tangent: new THREE.Vector3(0, 0, -1), rotY: Math.PI / 2, length: d };
  }
}

function roomRect(room: RoomConfig, inset = 0): Rect {
  const [w, , d] = room.size;
  const [cx, cz] = room.position;
  return { minX: cx - w / 2 + inset, maxX: cx + w / 2 - inset, minZ: cz - d / 2 + inset, maxZ: cz + d / 2 - inset };
}

const inside = (r: Rect, x: number, z: number) => x >= r.minX && x <= r.maxX && z >= r.minZ && z <= r.maxZ;

interface Opening {
  offset: number;
  width: number;
  /** Vrai du côté où la porte est déclarée : c'est là qu'on pose l'encadrement. */
  framed: boolean;
}

/** Calcule, pour chaque mur, les ouvertures de porte, des deux côtés de la cloison. */
function resolveOpenings(museum: MuseumConfig) {
  const openings = new Map<string, Opening[]>();
  const corridors: Rect[] = [];
  const add = (roomId: string, wall: WallId, o: Opening) => {
    const key = `${roomId}:${wall}`;
    openings.set(key, [...(openings.get(key) ?? []), o]);
  };
  for (const door of museum.doors ?? []) {
    const room = museum.rooms.find((r) => r.id === door.room);
    if (!room) continue;
    const f = wallFrame(room, door.wall);
    const p = f.center.clone().addScaledVector(f.tangent, door.offset);
    add(room.id, door.wall, { offset: door.offset, width: door.width, framed: true });
    for (const other of museum.rooms) {
      if (other === room) continue;
      for (const wall of WALLS) {
        const g = wallFrame(other, wall);
        const rel = p.clone().sub(g.center);
        if (g.normal.dot(f.normal) > -0.99 || Math.abs(rel.dot(g.normal)) > 0.01) continue;
        const offset = rel.dot(g.tangent);
        if (Math.abs(offset) + door.width / 2 > g.length / 2) continue;
        add(other.id, wall, { offset, width: door.width, framed: false });
      }
    }
    // Couloir de passage : un peu plus étroit que la porte, à cheval sur la cloison.
    const half = door.width / 2 - 0.3;
    const a = p.clone().addScaledVector(f.tangent, -half).addScaledVector(f.normal, -(MARGIN + 0.1));
    const b = p.clone().addScaledVector(f.tangent, half).addScaledVector(f.normal, MARGIN + 0.1);
    corridors.push({ minX: Math.min(a.x, b.x), maxX: Math.max(a.x, b.x), minZ: Math.min(a.z, b.z), maxZ: Math.max(a.z, b.z) });
  }
  return { openings, corridors };
}

// --- Sculptures ---------------------------------------------------------------

function sculptureMaterial(cfg: SculptureConfig, env: THREE.Texture) {
  const presets = {
    bronze: { color: '#8a5a2e', metalness: 1, roughness: 0.36 },
    marble: { color: '#efebe3', metalness: 0, roughness: 0.32 },
    patina: { color: '#3f8073', metalness: 0.85, roughness: 0.5 },
    lacquer: { color: cfg.color ?? '#8f231c', metalness: 0.05, roughness: 0.22 },
  };
  return new THREE.MeshStandardMaterial({ ...presets[cfg.material], envMap: env, envMapIntensity: 1.1 });
}

/** Sculpture fictive générée à partir d'une graine. Les vrais musées fourniront des modèles 3D. */
function sculptureShape(cfg: SculptureConfig, mat: THREE.Material): THREE.Group {
  const r = rng(cfg.model.seed);
  const g = new THREE.Group();
  switch (cfg.model.generator) {
    case 'knot': {
      const [p, q] = [[2, 3], [3, 4], [2, 5], [3, 5]][Math.floor(r() * 4)];
      g.add(new THREE.Mesh(new THREE.TorusKnotGeometry(0.5, 0.15, 220, 28, p, q), mat));
      break;
    }
    case 'blob': {
      const geo = new THREE.SphereGeometry(0.5, 72, 48);
      const pos = geo.attributes.position;
      const ph = [r() * 6, r() * 6, r() * 6];
      const v = new THREE.Vector3();
      for (let i = 0; i < pos.count; i++) {
        v.fromBufferAttribute(pos, i);
        const k = 1 + 0.22 * Math.sin(v.x * 5 + ph[0]) * Math.sin(v.y * 4 + ph[1]) + 0.16 * Math.sin(v.z * 6 + ph[2]);
        pos.setXYZ(i, v.x * k, v.y * k * 0.8, v.z * k);
      }
      geo.computeVertexNormals();
      g.add(new THREE.Mesh(geo, mat));
      break;
    }
    case 'rings':
      for (let i = 0; i < 3; i++) {
        const ring = new THREE.Mesh(new THREE.TorusGeometry(0.5 - i * 0.09, 0.04, 16, 96), mat);
        ring.rotation.set(r() * Math.PI, r() * Math.PI, 0);
        g.add(ring);
      }
      break;
    case 'stack': {
      let y = 0;
      for (let i = 0; i < 6; i++) {
        const s = 0.5 - i * 0.05 + r() * 0.08;
        const hgt = 0.16 + r() * 0.18;
        const box = new THREE.Mesh(new THREE.BoxGeometry(s, hgt, s * (0.6 + r() * 0.4)), mat);
        box.position.y = y + hgt / 2;
        box.rotation.y = r() * Math.PI;
        y += hgt;
        g.add(box);
      }
      break;
    }
    case 'ribbon': {
      const pts: THREE.Vector3[] = [];
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2;
        const rad = 0.3 + r() * 0.25;
        pts.push(new THREE.Vector3(Math.cos(a) * rad, 0.5 + Math.sin(a * 2 + r()) * 0.45, Math.sin(a) * rad));
      }
      g.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts, true), 240, 0.06, 14, true), mat));
      break;
    }
  }
  return g;
}

// --- Construction du musée ----------------------------------------------------

export function buildWorld(
  museum: MuseumConfig,
  lang: string,
  base: string,
  env: THREE.Texture,
  /** Appelé quand une image finit de charger, pour redessiner la scène. */
  onLoad: () => void = () => {},
): World {
  const group = new THREE.Group();
  const { theme } = museum;
  const { openings, corridors } = resolveOpenings(museum);
  const artworks: PlacedArtwork[] = [];
  const obstacles: { x: number; z: number; r: number }[] = [];

  const floorTex = floorTexture(theme.floor);
  const ceilingMat = new THREE.MeshStandardMaterial({ color: theme.ceiling, roughness: 1 });
  const trimMat = new THREE.MeshStandardMaterial({ color: theme.frame, roughness: 0.6 });
  const plinthMat = new THREE.MeshStandardMaterial({ color: '#f4f1eb', roughness: 0.8 });
  const poolMat = new THREE.MeshBasicMaterial({ map: poolTexture(), transparent: true, depthWrite: false });
  const noRaycast = () => {};

  for (const room of museum.rooms) {
    const [w, h, d] = room.size;
    const [cx, cz] = room.position;

    const tex = floorTex.clone();
    tex.repeat.set(w / 2, d / 2);
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(w, d), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.55 }));
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(cx, 0, cz);
    floor.userData.floor = true;
    const ceiling = new THREE.Mesh(new THREE.PlaneGeometry(w, d), ceilingMat);
    ceiling.rotation.x = Math.PI / 2;
    ceiling.position.set(cx, h, cz);
    group.add(floor, ceiling);

    const wallMat = new THREE.MeshStandardMaterial({ color: room.wall ?? theme.wall, roughness: 0.95 });
    for (const wall of WALLS) {
      const f = wallFrame(room, wall);
      // Tout ce qui est posé sur ce mur se place dans son repère : x = décalage, z = vers la salle.
      const holder = new THREE.Group();
      // Les murs sont avancés de 2 cm dans la salle : deux salles voisines ne partagent
      // ainsi jamais exactement le même plan, ce qui évite des traits parasites à l'affichage.
      holder.position.copy(f.center).addScaledVector(f.normal, 0.02);
      holder.rotation.y = f.rotY;
      group.add(holder);

      const gaps = (openings.get(`${room.id}:${wall}`) ?? []).sort((a, b) => a.offset - b.offset);
      let cursor = -f.length / 2;
      const solid = (from: number, to: number) => {
        if (to - from < 0.01) return;
        const seg = new THREE.Mesh(new THREE.PlaneGeometry(to - from, h), wallMat);
        seg.position.set((from + to) / 2, h / 2, 0.003);
        const skirt = new THREE.Mesh(new THREE.BoxGeometry(to - from, 0.08, 0.02), trimMat);
        skirt.position.set((from + to) / 2, 0.04, 0.01);
        holder.add(seg, skirt);
      };
      for (const gap of gaps) {
        solid(cursor, gap.offset - gap.width / 2);
        cursor = gap.offset + gap.width / 2;
        const lintel = new THREE.Mesh(new THREE.PlaneGeometry(gap.width, h - DOOR_HEIGHT), wallMat);
        lintel.position.set(gap.offset, DOOR_HEIGHT + (h - DOOR_HEIGHT) / 2, 0.003);
        holder.add(lintel);
        if (gap.framed) {
          for (const side of [-1, 1]) {
            const jamb = new THREE.Mesh(new THREE.BoxGeometry(0.12, DOOR_HEIGHT, 0.26), trimMat);
            jamb.position.set(gap.offset + side * (gap.width / 2 - 0.06), DOOR_HEIGHT / 2, 0);
            holder.add(jamb);
          }
          const top = new THREE.Mesh(new THREE.BoxGeometry(gap.width, 0.12, 0.26), trimMat);
          top.position.set(gap.offset, DOOR_HEIGHT - 0.06, 0);
          holder.add(top);
        }
      }
      solid(cursor, f.length / 2);

      for (const cfg of room.artworks) {
        if (cfg.type !== 'painting' || cfg.wall !== wall) continue;
        artworks.push(hangPainting(cfg, room, holder, f));
      }
    }

    for (const cfg of room.artworks) {
      if (cfg.type === 'sculpture') artworks.push(placeSculpture(cfg, room));
    }
  }

  function hangPainting(cfg: PaintingConfig, room: RoomConfig, holder: THREE.Group, f: ReturnType<typeof wallFrame>): PlacedArtwork {
    const art = new THREE.Group();
    art.position.set(cfg.offset, ART_CENTER_Y, 0);
    holder.add(art);

    const pool = new THREE.Mesh(new THREE.PlaneGeometry(cfg.width + 1.5, cfg.height + 1.7), poolMat);
    pool.position.set(0, 0.2, 0.008);
    pool.raycast = noRaycast;
    const frame = new THREE.Mesh(
      new THREE.BoxGeometry(cfg.width + 0.12, cfg.height + 0.12, 0.06),
      new THREE.MeshStandardMaterial({ color: theme.frame, roughness: 0.5 }),
    );
    frame.position.z = 0.03;
    const canvas = new THREE.Mesh(
      new THREE.PlaneGeometry(cfg.width, cfg.height),
      new THREE.MeshStandardMaterial({ map: artworkTexture(cfg.image, cfg.width / cfg.height, base, onLoad), roughness: 0.85 }),
    );
    canvas.position.z = 0.062;
    const label = new THREE.Mesh(new THREE.PlaneGeometry(0.3, 0.15), new THREE.MeshStandardMaterial({ roughness: 0.9 }));
    label.position.set(cfg.width / 2 + 0.35, -cfg.height / 2 + 0.12, 0.012);
    art.add(pool, frame, canvas, label);

    const placed: PlacedArtwork = {
      config: cfg,
      room,
      center: f.center.clone().addScaledVector(f.tangent, cfg.offset).setY(ART_CENTER_Y),
      span: cfg.width,
      depth: 0,
      normal: f.normal,
      label,
    };
    art.userData.artwork = placed;
    return placed;
  }

  function placeSculpture(cfg: SculptureConfig, room: RoomConfig): PlacedArtwork {
    const x = room.position[0] + cfg.position[0];
    const z = room.position[1] + cfg.position[1];
    const art = new THREE.Group();
    art.position.set(x, 0, z);
    group.add(art);

    const shape = sculptureShape(cfg, sculptureMaterial(cfg, env));
    const box = new THREE.Box3().setFromObject(shape);
    const size = box.getSize(new THREE.Vector3());
    const scale = cfg.height / size.y;
    shape.scale.setScalar(scale);
    shape.position.set(-((box.min.x + box.max.x) / 2) * scale, cfg.plinth - box.min.y * scale, -((box.min.z + box.max.z) / 2) * scale);

    const side = THREE.MathUtils.clamp(Math.max(size.x, size.z) * scale * 0.8, 0.5, 1.3);
    const plinth = new THREE.Mesh(new THREE.BoxGeometry(side, cfg.plinth, side), plinthMat);
    plinth.position.y = cfg.plinth / 2;
    const label = new THREE.Mesh(new THREE.PlaneGeometry(0.3, 0.15), new THREE.MeshStandardMaterial({ roughness: 0.9 }));
    label.position.set(side / 2 + 0.002, Math.min(cfg.plinth - 0.12, 0.8), 0);
    label.rotation.y = Math.PI / 2;
    art.add(shape, plinth, label);

    obstacles.push({ x, z, r: side * 0.71 + 0.25 });
    const placed: PlacedArtwork = {
      config: cfg,
      room,
      center: new THREE.Vector3(x, cfg.plinth + cfg.height / 2, z),
      span: Math.max(size.x, size.z) * scale,
      depth: (Math.max(size.x, size.z) * scale) / 2,
      label,
    };
    art.userData.artwork = placed;
    return placed;
  }

  const inner = museum.rooms.map((r) => roomRect(r, MARGIN));
  const walkable = (x: number, z: number) =>
    (inner.some((r) => inside(r, x, z)) || corridors.some((r) => inside(r, x, z))) &&
    !obstacles.some((o) => Math.hypot(x - o.x, z - o.z) < o.r);

  const world: World = {
    group,
    artworks,
    walkable,
    roomAt: (x, z) => museum.rooms.find((r) => inside(roomRect(r), x, z)) ?? null,

    spawn(roomId) {
      const room = museum.rooms.find((r) => r.id === roomId) ?? museum.rooms[0];
      if (room.id === museum.start.room) {
        return { x: room.position[0] + museum.start.position[0], z: room.position[1] + museum.start.position[1], yaw: museum.start.yaw };
      }
      // On arrive juste après la première porte de la salle, face à l'intérieur.
      for (const wall of WALLS) {
        const gap = openings.get(`${room.id}:${wall}`)?.[0];
        if (!gap) continue;
        const f = wallFrame(room, wall);
        const p = f.center.clone().addScaledVector(f.tangent, gap.offset).addScaledVector(f.normal, 1.4);
        return { x: p.x, z: p.z, yaw: Math.atan2(-f.normal.x, -f.normal.z) };
      }
      return { x: room.position[0], z: room.position[1], yaw: 0 };
    },

    viewpoint(art, from, distance) {
      const target = new THREE.Vector3(art.center.x, EYE_HEIGHT, art.center.z);
      let dir: THREE.Vector3;
      if (art.normal) {
        dir = art.normal.clone();
      } else {
        // Sculpture : on l'aborde du côté où se trouve déjà le visiteur.
        const origin = world.roomAt(from.x, from.z) === art.room ? from : new THREE.Vector3(art.room.position[0], 0, art.room.position[1]);
        dir = new THREE.Vector3(origin.x - target.x, 0, origin.z - target.z);
        if (dir.lengthSq() < 0.01) dir.set(0, 0, 1);
        dir.normalize();
      }
      const rect = roomRect(art.room, MARGIN);
      const pos = target.clone().addScaledVector(dir, distance);
      pos.x = THREE.MathUtils.clamp(pos.x, rect.minX, rect.maxX);
      pos.z = THREE.MathUtils.clamp(pos.z, rect.minZ, rect.maxZ);
      const reach = Math.hypot(pos.x - target.x, pos.z - target.z);
      return { pos, yaw: Math.atan2(dir.x, dir.z), pitch: Math.atan2(art.center.y - EYE_HEIGHT, reach) };
    },

    setLang(code) {
      for (const art of artworks) {
        const mat = art.label.material as THREE.MeshStandardMaterial;
        mat.map?.dispose();
        mat.map = labelTexture(tr(art.config.title, code), art.config.artist, art.config.year);
        mat.needsUpdate = true;
      }
    },
  };
  world.setLang(lang);
  return world;
}

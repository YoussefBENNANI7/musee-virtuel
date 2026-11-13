import * as THREE from 'three';
import { WALLS, wallFrame, type Layout, type WallFrame } from './layout';
import { lightAt, roomLight, skylightOpening, sunPatch, type RoomLight } from './lighting';
import type { Quality } from './quality';
import type { Style } from './styles';
import { concreteTexture, parquetTexture, skyTexture, sunPatchTexture } from './textures';
import type { MuseumConfig, RoomConfig, WallId } from './types';

/**
 * Le bâtiment nu : sols, plafonds, murs épais et passages de portes.
 * Chaque mur expose un repère (`holder`) où accrocher les œuvres :
 * x = décalage le long du mur, y = hauteur, z = vers la salle.
 *
 * L'éclairage est calculé ici, une fois, et inscrit dans la couleur de chaque sommet
 * (voir lighting.ts). Les matériaux du bâtiment ne dépendent donc d'aucune lampe.
 */
export interface Building {
  group: THREE.Group;
  wall(roomId: string, wall: WallId): { holder: THREE.Group; frame: WallFrame };
  light(roomId: string): RoomLight;
}

const SKYLIGHT_WELL = 0.7;
const noRaycast = () => {};

/** Positions des sommets le long d'une longueur : serrées près des bords, où la lumière varie vite. */
function knots(length: number): number[] {
  const out: number[] = [];
  if (length <= 1.8) {
    const n = Math.max(1, Math.ceil(length / 0.45));
    for (let i = 0; i <= n; i++) out.push((length * i) / n);
  } else {
    const edge = [0, 0.12, 0.35, 0.8];
    const inner = Math.ceil((length - 1.6) / 0.8);
    out.push(...edge);
    for (let i = 1; i < inner; i++) out.push(0.8 + ((length - 1.6) * i) / inner);
    out.push(...edge.map((e) => length - e).reverse());
  }
  return out.map((v) => v - length / 2);
}

/** Rectangle quadrillé dans le plan XY, tourné vers +Z, prêt à recevoir une couleur par sommet. */
function gridGeometry(width: number, height: number): THREE.BufferGeometry {
  const xs = knots(width);
  const ys = knots(height);
  const position: number[] = [];
  const uv: number[] = [];
  const index: number[] = [];
  for (const y of ys) {
    for (const x of xs) {
      position.push(x, y, 0);
      uv.push(x / width + 0.5, y / height + 0.5);
    }
  }
  const cols = xs.length;
  for (let j = 0; j < ys.length - 1; j++) {
    for (let i = 0; i < cols - 1; i++) {
      const p = j * cols + i;
      index.push(p, p + 1, p + cols, p + 1, p + cols + 1, p + cols);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(position, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(new Float32Array(position.length).fill(1), 3));
  geo.setIndex(index);
  geo.computeVertexNormals();
  return geo;
}

/** Matériau du bâtiment : sa couleur est multipliée par la lumière inscrite dans les sommets. */
function litMaterial(color: string, map?: THREE.Texture): THREE.MeshBasicMaterial {
  return new THREE.MeshBasicMaterial({ color, map, vertexColors: true, toneMapped: false });
}

const point = new THREE.Vector3();
const normal = new THREE.Vector3();

/** Inscrit dans les sommets d'une surface la lumière qu'elle reçoit (moyenne des salles données). */
function bake(mesh: THREE.Mesh, lights: RoomLight[]) {
  mesh.updateWorldMatrix(true, false);
  const pos = mesh.geometry.attributes.position;
  const color = mesh.geometry.attributes.color;
  normal.set(0, 0, 1).transformDirection(mesh.matrixWorld);
  for (let i = 0; i < pos.count; i++) {
    point.fromBufferAttribute(pos, i).applyMatrix4(mesh.matrixWorld);
    let value = 0;
    for (const light of lights) value += lightAt(light, point, normal);
    value /= lights.length;
    color.setXYZ(i, value, value, value);
  }
  color.needsUpdate = true;
}

export function buildBuilding(museum: MuseumConfig, layout: Layout, style: Style, quality: Quality): Building {
  const group = new THREE.Group();
  const { palette } = style;
  const half = layout.wallThickness / 2;
  const walls = new Map<string, { holder: THREE.Group; frame: WallFrame }>();
  const lights = new Map(museum.rooms.map((r) => [r.id, roomLight(r, layout.wallThickness)]));
  /** Surfaces à éclairer une fois tout le bâtiment assemblé. */
  const pending: { mesh: THREE.Mesh; lights: RoomLight[] }[] = [];
  const lit = (mesh: THREE.Mesh, ...roomLights: RoomLight[]) => {
    pending.push({ mesh, lights: roomLights });
    return mesh;
  };

  const floorTex = (style.floor === 'concrete' ? concreteTexture : parquetTexture)(palette.floor, quality);
  /** Taille réelle, en mètres, de la surface couverte par une répétition de la texture de sol. */
  const floorTile = style.floor === 'concrete' ? 3 : 2;
  const ceilingMat = litMaterial(palette.ceiling);
  const trimMat = new THREE.MeshStandardMaterial({ color: palette.trim, roughness: 0.6 });
  const revealMat = litMaterial(palette.wall);

  for (const room of museum.rooms) {
    const [w, h, d] = room.size;
    const [cx, cz] = room.position;
    const light = lights.get(room.id)!;

    // Le sol va jusqu'à la limite de la salle : sous une porte, il rejoint celui de la salle voisine.
    const tex = floorTex.clone();
    tex.repeat.set(w / floorTile, d / floorTile);
    const floor = lit(new THREE.Mesh(gridGeometry(w, d), litMaterial('#ffffff', tex)), light);
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(cx, 0, cz);
    floor.userData.floor = true;
    group.add(floor);
    buildCeiling(room);
    buildSunPatch(room);

    const wallMat = litMaterial(room.wall ?? palette.wall);
    for (const wall of WALLS) {
      // Surface visible du mur : en retrait d'une demi-épaisseur par rapport à la limite de la salle.
      const frame = wallFrame(room, wall, half);
      const holder = new THREE.Group();
      holder.position.copy(frame.center);
      holder.rotation.y = frame.rotY;
      group.add(holder);
      walls.set(`${room.id}:${wall}`, { holder, frame });

      let cursor = -frame.length / 2;
      const solid = (from: number, to: number) => {
        if (to - from < 0.01) return;
        const face = lit(new THREE.Mesh(gridGeometry(to - from, h), wallMat), light);
        face.position.set((from + to) / 2, h / 2, 0);
        holder.add(face);
        const base = baseboard(to - from, style, trimMat);
        if (base) {
          base.position.x = (from + to) / 2;
          holder.add(base);
        }
      };
      for (const gap of layout.openings(room.id, wall)) {
        solid(cursor, gap.offset - gap.width / 2);
        cursor = gap.offset + gap.width / 2;
        if (h - gap.height > 0.01) {
          const lintel = lit(new THREE.Mesh(gridGeometry(gap.width, h - gap.height), wallMat), light);
          lintel.position.set(gap.offset, (h + gap.height) / 2, 0);
          holder.add(lintel);
        }
      }
      solid(cursor, frame.length / 2);
    }
  }

  // Traversée des murs : les deux tableaux de la porte, son dessous de linteau, et l'encadrement éventuel.
  for (const passage of layout.passages) {
    const t = layout.wallThickness;
    const both = passage.rooms.map((r) => lights.get(r.id)!);
    const portal = new THREE.Group();
    portal.position.copy(passage.center);
    portal.rotation.y = passage.rotY;
    group.add(portal);
    for (const side of [-1, 1]) {
      const jamb = lit(new THREE.Mesh(gridGeometry(t, passage.height), revealMat), ...both);
      jamb.position.set((side * passage.width) / 2, passage.height / 2, 0);
      jamb.rotation.y = (-side * Math.PI) / 2;
      portal.add(jamb);
    }
    const soffit = lit(new THREE.Mesh(gridGeometry(passage.width, t), revealMat), ...both);
    soffit.position.y = passage.height - 0.002;
    soffit.rotation.x = Math.PI / 2;
    portal.add(soffit);

    if (style.doorCasing) {
      const depth = t + 0.04;
      for (const side of [-1, 1]) {
        const post = new THREE.Mesh(new THREE.BoxGeometry(0.12, passage.height, depth), trimMat);
        post.position.set(side * (passage.width / 2 - 0.06), passage.height / 2, 0);
        portal.add(post);
      }
      const top = new THREE.Mesh(new THREE.BoxGeometry(passage.width, 0.12, depth), trimMat);
      top.position.y = passage.height - 0.06;
      portal.add(top);
    }
  }

  function buildCeiling(room: RoomConfig) {
    const [w, h, d] = room.size;
    const light = lights.get(room.id)!;
    const ceiling = new THREE.Group();
    ceiling.position.set(room.position[0], h, room.position[1]);
    group.add(ceiling);
    /** Panneau horizontal tourné vers le bas, centré en (x, z) dans le repère de la salle. */
    const panel = (width: number, depth: number, x: number, z: number) => {
      const m = lit(new THREE.Mesh(gridGeometry(width, depth), ceilingMat), light);
      m.rotation.x = Math.PI / 2;
      m.position.set(x, 0, z);
      ceiling.add(m);
    };

    const sky = skylightOpening(room);
    if (!sky) return panel(w, d, 0, 0);

    // Verrière : le plafond devient un cadre, percé d'un puits de lumière fermé par un vitrage.
    const { width: ow, depth: od, margin } = sky;
    panel(w, margin, 0, -(d - margin) / 2);
    panel(w, margin, 0, (d - margin) / 2);
    panel(margin, od, -(w - margin) / 2, 0);
    panel(margin, od, (w - margin) / 2, 0);

    // Les parois du puits reçoivent le ciel de plein fouet : elles sont à pleine lumière.
    const wellMat = new THREE.MeshBasicMaterial({ color: palette.ceiling, toneMapped: false });
    for (const [length, x, z, rotY] of [
      [ow, 0, -od / 2, 0],
      [ow, 0, od / 2, Math.PI],
      [od, ow / 2, 0, -Math.PI / 2],
      [od, -ow / 2, 0, Math.PI / 2],
    ]) {
      const side = new THREE.Mesh(new THREE.PlaneGeometry(length, SKYLIGHT_WELL), wellMat);
      side.position.set(x, SKYLIGHT_WELL / 2, z);
      side.rotation.y = rotY;
      ceiling.add(side);
    }
    const glass = new THREE.Mesh(new THREE.PlaneGeometry(ow, od), new THREE.MeshBasicMaterial({ map: skyTexture(), toneMapped: false }));
    glass.rotation.x = Math.PI / 2;
    glass.position.y = SKYLIGHT_WELL;
    ceiling.add(glass);

    // Fines traverses du vitrage, espacées d'environ un mètre et demi.
    const [cols, rows] = skylightBars(ow, od);
    const bars = (span: number, across: number, count: number, alongX: boolean) => {
      for (let i = 1; i < count; i++) {
        const at = -span / 2 + (span * i) / count;
        const bar = new THREE.Mesh(new THREE.BoxGeometry(alongX ? 0.04 : across, 0.06, alongX ? across : 0.04), trimMat);
        bar.position.set(alongX ? at : 0, SKYLIGHT_WELL - 0.03, alongX ? 0 : at);
        ceiling.add(bar);
      }
    };
    bars(ow, od, cols, true);
    bars(od, ow, rows, false);
  }

  /** Tache de soleil au sol sous une verrière, quadrillée par l'ombre des traverses. */
  function buildSunPatch(room: RoomConfig) {
    const patch = sunPatch(room);
    if (!patch) return;
    const [cols, rows] = skylightBars(patch.width, patch.depth);
    const mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(patch.width * 1.12, patch.depth * 1.12),
      new THREE.MeshBasicMaterial({
        map: sunPatchTexture(cols, rows),
        color: '#fff0d6',
        opacity: 0.22,
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        toneMapped: false,
      }),
    );
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.copy(patch.center).setY(0.004);
    mesh.raycast = noRaycast;
    group.add(mesh);
  }

  for (const { mesh, lights: roomLights } of pending) bake(mesh, roomLights);

  return {
    group,
    wall: (roomId, wall) => walls.get(`${roomId}:${wall}`)!,
    light: (roomId) => lights.get(roomId)!,
  };
}

/** Nombre de carreaux de vitrage dans chaque direction. */
function skylightBars(width: number, depth: number): [number, number] {
  return [Math.max(1, Math.round(width / 1.5)), Math.max(1, Math.round(depth / 1.5))];
}

/** Bas de mur, dans le repère du mur. */
function baseboard(length: number, style: Style, mat: THREE.Material): THREE.Mesh | null {
  if (style.baseboard === 'skirting') {
    const m = new THREE.Mesh(new THREE.BoxGeometry(length, 0.08, 0.02), mat);
    m.position.set(0, 0.04, 0.01);
    return m;
  }
  if (style.baseboard === 'shadow-gap') {
    // Joint creux : une fine bande sombre au ras du sol, comme si le mur flottait.
    const m = new THREE.Mesh(new THREE.BoxGeometry(length, 0.018, 0.004), mat);
    m.position.set(0, 0.009, 0.002);
    return m;
  }
  return null;
}

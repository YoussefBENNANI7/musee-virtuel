import * as THREE from 'three';
import { WALLS, wallFrame, type Layout, type WallFrame } from './layout';
import type { Quality } from './quality';
import type { Style } from './styles';
import { concreteTexture, parquetTexture, skyTexture } from './textures';
import type { MuseumConfig, RoomConfig, WallId } from './types';

/**
 * Le bâtiment nu : sols, plafonds, murs épais et passages de portes.
 * Chaque mur expose un repère (`holder`) où accrocher les œuvres :
 * x = décalage le long du mur, y = hauteur, z = vers la salle.
 */
export interface Building {
  group: THREE.Group;
  wall(roomId: string, wall: WallId): { holder: THREE.Group; frame: WallFrame };
}

const SKYLIGHT_WELL = 0.7;

export function buildBuilding(museum: MuseumConfig, layout: Layout, style: Style, quality: Quality): Building {
  const group = new THREE.Group();
  const { palette } = style;
  const half = layout.wallThickness / 2;
  const walls = new Map<string, { holder: THREE.Group; frame: WallFrame }>();

  const floorTex = (style.floor === 'concrete' ? concreteTexture : parquetTexture)(palette.floor, quality);
  /** Taille réelle, en mètres, de la surface couverte par une répétition de la texture de sol. */
  const floorTile = style.floor === 'concrete' ? 3 : 2;
  const ceilingMat = new THREE.MeshStandardMaterial({ color: palette.ceiling, roughness: 1 });
  const trimMat = new THREE.MeshStandardMaterial({ color: palette.trim, roughness: 0.6 });
  const revealMat = new THREE.MeshStandardMaterial({ color: palette.wall, roughness: 0.95 });

  for (const room of museum.rooms) {
    const [w, h, d] = room.size;
    const [cx, cz] = room.position;

    // Le sol va jusqu'à la limite de la salle : sous une porte, il rejoint celui de la salle voisine.
    const tex = floorTex.clone();
    tex.repeat.set(w / floorTile, d / floorTile);
    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(w, d),
      new THREE.MeshStandardMaterial({ map: tex, roughness: style.floor === 'concrete' ? 0.5 : 0.55 }),
    );
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(cx, 0, cz);
    floor.userData.floor = true;
    group.add(floor, buildCeiling(room, ceilingMat, trimMat));

    const wallMat = new THREE.MeshStandardMaterial({ color: room.wall ?? palette.wall, roughness: 0.95 });
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
        const face = new THREE.Mesh(new THREE.PlaneGeometry(to - from, h), wallMat);
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
          const lintel = new THREE.Mesh(new THREE.PlaneGeometry(gap.width, h - gap.height), wallMat);
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
    const portal = new THREE.Group();
    portal.position.copy(passage.center);
    portal.rotation.y = passage.rotY;
    for (const side of [-1, 1]) {
      const jamb = new THREE.Mesh(new THREE.PlaneGeometry(t, passage.height), revealMat);
      jamb.position.set((side * passage.width) / 2, passage.height / 2, 0);
      jamb.rotation.y = (-side * Math.PI) / 2;
      portal.add(jamb);
    }
    const soffit = new THREE.Mesh(new THREE.PlaneGeometry(passage.width, t), revealMat);
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
    group.add(portal);
  }

  return {
    group,
    wall: (roomId, wall) => walls.get(`${roomId}:${wall}`)!,
  };
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

function buildCeiling(room: RoomConfig, ceilingMat: THREE.Material, trimMat: THREE.Material): THREE.Object3D {
  const [w, h, d] = room.size;
  const group = new THREE.Group();
  group.position.set(room.position[0], h, room.position[1]);
  /** Panneau horizontal tourné vers le bas, centré en (x, z) dans le repère de la salle. */
  const panel = (width: number, depth: number, x: number, z: number, y = 0, mat = ceilingMat) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(width, depth), mat);
    m.rotation.x = Math.PI / 2;
    m.position.set(x, y, z);
    group.add(m);
  };

  if (room.ceiling?.type !== 'skylight') {
    panel(w, d, 0, 0);
    return group;
  }

  // Verrière : le plafond devient un cadre, percé d'un puits de lumière fermé par un vitrage.
  const margin = room.ceiling.margin ?? 1.2;
  const ow = w - margin * 2;
  const od = d - margin * 2;
  panel(w, margin, 0, -(d - margin) / 2);
  panel(w, margin, 0, (d - margin) / 2);
  panel(margin, od, -(w - margin) / 2, 0);
  panel(margin, od, (w - margin) / 2, 0);

  for (const [length, x, z, rotY] of [
    [ow, 0, -od / 2, 0],
    [ow, 0, od / 2, Math.PI],
    [od, ow / 2, 0, -Math.PI / 2],
    [od, -ow / 2, 0, Math.PI / 2],
  ]) {
    const side = new THREE.Mesh(new THREE.PlaneGeometry(length, SKYLIGHT_WELL), ceilingMat);
    side.position.set(x, SKYLIGHT_WELL / 2, z);
    side.rotation.y = rotY;
    group.add(side);
  }

  const sky = new THREE.MeshBasicMaterial({ map: skyTexture(), toneMapped: false });
  panel(ow, od, 0, 0, SKYLIGHT_WELL, sky);

  // Fines traverses du vitrage, espacées d'environ un mètre et demi.
  const bars = (span: number, across: number, alongX: boolean) => {
    const count = Math.max(1, Math.round(span / 1.5));
    for (let i = 1; i < count; i++) {
      const at = -span / 2 + (span * i) / count;
      const bar = new THREE.Mesh(new THREE.BoxGeometry(alongX ? 0.04 : across, 0.06, alongX ? across : 0.04), trimMat);
      bar.position.set(alongX ? at : 0, SKYLIGHT_WELL - 0.03, alongX ? 0 : at);
      group.add(bar);
    }
  };
  bars(ow, od, true);
  bars(od, ow, false);
  return group;
}

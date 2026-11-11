import * as THREE from 'three';
import type { ArtworkConfig, MuseumConfig, RoomConfig, WallId } from './types';
import { tr } from './types';
import { artworkTexture, floorTexture, labelTexture } from './textures';

export const EYE_HEIGHT = 1.6;
const ART_CENTER_Y = 1.55;

export interface PlacedArtwork {
  config: ArtworkConfig;
  /** Objet cliquable (la toile). */
  mesh: THREE.Mesh;
  /** Point du mur où l'œuvre est accrochée, à hauteur d'yeux, et direction vers la salle. */
  anchor: THREE.Vector3;
  normal: THREE.Vector3;
  /** Orientation du visiteur quand il fait face à l'œuvre. */
  viewYaw: number;
  label: THREE.Mesh;
}

export interface BuiltRoom {
  group: THREE.Group;
  artworks: PlacedArtwork[];
  /** Limites de déplacement : [minX, maxX, minZ, maxZ]. */
  bounds: [number, number, number, number];
}

/** Position et orientation d'un point sur un mur, pour un décalage donné. */
function wallAnchor(wall: WallId, offset: number, w: number, d: number) {
  switch (wall) {
    case 'north':
      return { pos: new THREE.Vector3(offset, 0, -d / 2), normal: new THREE.Vector3(0, 0, 1), rotY: 0 };
    case 'south':
      return { pos: new THREE.Vector3(-offset, 0, d / 2), normal: new THREE.Vector3(0, 0, -1), rotY: Math.PI };
    case 'east':
      return { pos: new THREE.Vector3(w / 2, 0, offset), normal: new THREE.Vector3(-1, 0, 0), rotY: -Math.PI / 2 };
    case 'west':
      return { pos: new THREE.Vector3(-w / 2, 0, -offset), normal: new THREE.Vector3(1, 0, 0), rotY: Math.PI / 2 };
  }
}

export function buildRoom(room: RoomConfig, museum: MuseumConfig, lang: string, base: string): BuiltRoom {
  const [w, h, d] = room.size;
  const group = new THREE.Group();
  const { theme } = museum;

  const floorTex = floorTexture(theme.floor);
  floorTex.repeat.set(w / 2, d / 2);
  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(w, d),
    new THREE.MeshStandardMaterial({ map: floorTex, roughness: 0.55, metalness: 0 }),
  );
  floor.rotation.x = -Math.PI / 2;
  group.add(floor);

  const ceiling = new THREE.Mesh(
    new THREE.PlaneGeometry(w, d),
    new THREE.MeshStandardMaterial({ color: theme.ceiling, roughness: 1 }),
  );
  ceiling.rotation.x = Math.PI / 2;
  ceiling.position.y = h;
  group.add(ceiling);

  const wallMat = new THREE.MeshStandardMaterial({ color: theme.wall, roughness: 0.95 });
  const skirtMat = new THREE.MeshStandardMaterial({ color: theme.frame, roughness: 0.7 });
  (['north', 'south', 'east', 'west'] as WallId[]).forEach((id) => {
    const len = id === 'north' || id === 'south' ? w : d;
    const a = wallAnchor(id, 0, w, d);
    const wall = new THREE.Mesh(new THREE.PlaneGeometry(len, h), wallMat);
    wall.position.copy(a.pos).setY(h / 2);
    wall.rotation.y = a.rotY;
    group.add(wall);
    const skirt = new THREE.Mesh(new THREE.BoxGeometry(len, 0.08, 0.02), skirtMat);
    skirt.position.copy(a.pos).addScaledVector(a.normal, 0.01).setY(0.04);
    skirt.rotation.y = a.rotY;
    group.add(skirt);
  });

  const frameMat = new THREE.MeshStandardMaterial({ color: theme.frame, roughness: 0.5 });
  const artworks: PlacedArtwork[] = room.artworks.map((cfg) => {
    const a = wallAnchor(cfg.wall, cfg.offset, w, d);
    const holder = new THREE.Group();
    holder.position.copy(a.pos).setY(ART_CENTER_Y);
    holder.rotation.y = a.rotY;

    const frame = new THREE.Mesh(new THREE.BoxGeometry(cfg.width + 0.12, cfg.height + 0.12, 0.06), frameMat);
    frame.position.z = 0.03;
    holder.add(frame);

    const mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(cfg.width, cfg.height),
      new THREE.MeshStandardMaterial({
        map: artworkTexture(cfg.image, cfg.width / cfg.height, base),
        roughness: 0.85,
      }),
    );
    mesh.position.z = 0.062;
    holder.add(mesh);

    const label = new THREE.Mesh(
      new THREE.PlaneGeometry(0.3, 0.15),
      new THREE.MeshStandardMaterial({ roughness: 0.9 }),
    );
    label.position.set(cfg.width / 2 + 0.35, -cfg.height / 2 + 0.12, 0.012);
    holder.add(label);
    group.add(holder);

    // Éclairage d'accrochage : un projecteur au plafond par œuvre.
    const spot = new THREE.SpotLight(0xfff4e4, 16, 9, 0.55, 0.8, 1.6);
    spot.position.copy(a.pos).addScaledVector(a.normal, 1.7).setY(h - 0.15);
    spot.target.position.copy(a.pos).setY(ART_CENTER_Y);
    group.add(spot, spot.target);

    const placed: PlacedArtwork = {
      config: cfg,
      mesh,
      label,
      anchor: a.pos.clone().setY(EYE_HEIGHT),
      normal: a.normal,
      viewYaw: Math.atan2(a.normal.x, a.normal.z),
    };
    mesh.userData.artwork = placed;
    return placed;
  });

  const built: BuiltRoom = {
    group,
    artworks,
    bounds: [-w / 2 + 0.45, w / 2 - 0.45, -d / 2 + 0.45, d / 2 - 0.45],
  };
  updateLabels(built, lang);
  return built;
}

/** Régénère les cartels dans la langue courante. */
export function updateLabels(room: BuiltRoom, lang: string) {
  for (const art of room.artworks) {
    const mat = art.label.material as THREE.MeshStandardMaterial;
    mat.map?.dispose();
    mat.map = labelTexture(tr(art.config.title, lang), art.config.artist, art.config.year);
    mat.needsUpdate = true;
  }
}

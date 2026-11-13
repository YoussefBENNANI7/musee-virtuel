import * as THREE from 'three';
import { ART_CENTER_Y, type WallFrame } from './layout';
import type { Quality } from './quality';
import { sculptureMaterial, sculptureShape } from './sculptures';
import type { Style } from './styles';
import { artworkTexture, poolTexture } from './textures';
import type { ArtworkConfig, PaintingConfig, RoomConfig, SculptureConfig } from './types';

/** Une œuvre installée dans le musée. */
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
  /** Cartel : son texte est redessiné à chaque changement de langue. */
  label: THREE.Mesh;
  /** Pour une sculpture : rayon au sol que le visiteur doit contourner. */
  obstacle?: { x: number; z: number; r: number };
}

export interface ArtworkContext {
  style: Style;
  quality: Quality;
  /** Adresse du dossier du musée, pour résoudre les images. */
  base: string;
  /** Environnement reflété par les sculptures. */
  env: THREE.Texture;
  /** Appelé quand une image finit de charger. */
  onLoad: () => void;
}

const LABEL_W = 0.3;
const LABEL_H = 0.15;
const noRaycast = () => {};
let poolMaterial: THREE.Material | null = null;

function label(): THREE.Mesh {
  return new THREE.Mesh(new THREE.PlaneGeometry(LABEL_W, LABEL_H), new THREE.MeshStandardMaterial({ roughness: 0.9 }));
}

/** Accroche un tableau sur un mur, dans le repère de ce mur. */
export function hangPainting(cfg: PaintingConfig, room: RoomConfig, holder: THREE.Group, frame: WallFrame, ctx: ArtworkContext): PlacedArtwork {
  const { style } = ctx;
  const { width: fw, depth, gap } = style.frame;
  const art = new THREE.Group();
  art.position.set(cfg.offset, ART_CENTER_Y, 0);
  holder.add(art);

  // Halo d'éclairage peint sur le mur (remplace un vrai projecteur, bien plus coûteux).
  poolMaterial ??= new THREE.MeshBasicMaterial({ map: poolTexture(), transparent: true, depthWrite: false });
  const pool = new THREE.Mesh(new THREE.PlaneGeometry(cfg.width + 1.5, cfg.height + 1.7), poolMaterial);
  pool.position.set(0, 0.2, 0.006);
  pool.raycast = noRaycast;

  const border = gap + fw;
  const body = new THREE.Mesh(
    new THREE.BoxGeometry(cfg.width + border * 2, cfg.height + border * 2, depth),
    new THREE.MeshStandardMaterial({ color: style.palette.frame, roughness: 0.5 }),
  );
  body.position.z = depth / 2;
  art.add(pool, body);
  if (gap > 0) {
    // Caisse américaine : un vide sombre sépare la toile du cadre.
    const recess = new THREE.Mesh(new THREE.PlaneGeometry(cfg.width + gap * 2, cfg.height + gap * 2), new THREE.MeshBasicMaterial({ color: 0x050505 }));
    recess.position.z = depth + 0.001;
    art.add(recess);
  }
  const canvas = new THREE.Mesh(
    new THREE.PlaneGeometry(cfg.width, cfg.height),
    new THREE.MeshStandardMaterial({ map: artworkTexture(cfg.image, cfg.width / cfg.height, ctx.base, ctx.quality, ctx.onLoad), roughness: 0.85 }),
  );
  canvas.position.z = depth + 0.002;

  const card = label();
  card.position.set(cfg.width / 2 + border + 0.14 + LABEL_W / 2, -cfg.height / 2 + 0.12, 0.012);
  art.add(canvas, card);

  const placed: PlacedArtwork = {
    config: cfg,
    room,
    center: frame.center.clone().addScaledVector(frame.tangent, cfg.offset).setY(ART_CENTER_Y),
    span: cfg.width,
    depth: 0,
    normal: frame.normal,
    label: card,
  };
  art.userData.artwork = placed;
  return placed;
}

/** Pose une sculpture sur son socle. */
export function placeSculpture(cfg: SculptureConfig, room: RoomConfig, parent: THREE.Group, ctx: ArtworkContext): PlacedArtwork {
  const x = room.position[0] + cfg.position[0];
  const z = room.position[1] + cfg.position[1];
  const art = new THREE.Group();
  art.position.set(x, 0, z);
  parent.add(art);

  // La forme est mise à l'échelle pour atteindre la hauteur demandée, puis centrée sur le socle.
  const shape = sculptureShape(cfg, sculptureMaterial(cfg, ctx.env));
  const box = new THREE.Box3().setFromObject(shape);
  const size = box.getSize(new THREE.Vector3());
  const scale = cfg.height / size.y;
  shape.scale.setScalar(scale);
  shape.position.set(-((box.min.x + box.max.x) / 2) * scale, cfg.plinth - box.min.y * scale, -((box.min.z + box.max.z) / 2) * scale);
  const footprint = Math.max(size.x, size.z) * scale;

  const side = THREE.MathUtils.clamp(footprint * 0.8, 0.5, 1.3);
  const plinth = new THREE.Mesh(
    new THREE.BoxGeometry(side, cfg.plinth, side),
    new THREE.MeshStandardMaterial({ color: ctx.style.palette.plinth, roughness: 0.8 }),
  );
  plinth.position.y = cfg.plinth / 2;
  const card = label();
  card.position.set(side / 2 + 0.002, Math.min(cfg.plinth - 0.12, 0.8), 0);
  card.rotation.y = Math.PI / 2;
  art.add(shape, plinth, card);

  const placed: PlacedArtwork = {
    config: cfg,
    room,
    center: new THREE.Vector3(x, cfg.plinth + cfg.height / 2, z),
    span: footprint,
    depth: footprint / 2,
    label: card,
    obstacle: { x, z, r: side * 0.71 + 0.25 },
  };
  art.userData.artwork = placed;
  return placed;
}

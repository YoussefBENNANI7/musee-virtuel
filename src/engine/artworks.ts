import * as THREE from 'three';
import { groundShadow } from './furniture';
import { ART_CENTER_Y, type WallFrame } from './layout';
import type { RoomLight } from './lighting';
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
  /** Faux tant que l'image de l'œuvre n'a pas fini de charger. */
  ready: boolean;
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
  /** Éclairage de chaque salle. */
  light(roomId: string): RoomLight;
}

const LABEL_W = 0.3;
const LABEL_H = 0.15;
const noRaycast = () => {};
/** Un matériau de halo par couleur de mur. */
const poolMaterials = new Map<string, THREE.Material>();
function poolMaterial(wallColor: string): THREE.Material {
  let mat = poolMaterials.get(wallColor);
  if (!mat) {
    // Lumière ajoutée à la couleur du mur : un mur coloré s'éclaircit dans sa propre teinte.
    const wall = new THREE.Color(wallColor);
    // Un mur clair est déjà proche du blanc : son halo doit rester discret.
    const brightness = wall.getHSL({ h: 0, s: 0, l: 0 }).l;
    mat = new THREE.MeshBasicMaterial({
      map: poolTexture(),
      color: wall.clone().lerp(new THREE.Color('#fff4e2'), 0.25),
      opacity: 0.5 - 0.3 * brightness,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      toneMapped: false,
    });
    poolMaterials.set(wallColor, mat);
  }
  return mat;
}

function label(): THREE.Mesh {
  return new THREE.Mesh(new THREE.PlaneGeometry(LABEL_W, LABEL_H), new THREE.MeshBasicMaterial({ toneMapped: false }));
}

/** Distance entre le mur et le rail des projecteurs. */
export const TRACK_DISTANCE = 1.5;
const fixtureMat = new THREE.MeshStandardMaterial({ color: '#161616', roughness: 0.5 });
const UP = new THREE.Vector3(0, 1, 0);

/** Projecteur suspendu au rail, braqué sur le centre de l'œuvre. Repère du mur. */
function spotFixture(offset: number, ceiling: number): THREE.Group {
  const fixture = new THREE.Group();
  fixture.position.set(offset, ceiling - 0.16, TRACK_DISTANCE);
  const head = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.055, 0.16, 16), fixtureMat);
  head.quaternion.setFromUnitVectors(UP, new THREE.Vector3(0, ceiling - 0.16 - ART_CENTER_Y, TRACK_DISTANCE).normalize());
  const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.12, 8), fixtureMat);
  stem.position.y = 0.09;
  fixture.add(head, stem);
  return fixture;
}

/** Accroche un tableau sur un mur, dans le repère de ce mur. */
export function hangPainting(cfg: PaintingConfig, room: RoomConfig, holder: THREE.Group, frame: WallFrame, ctx: ArtworkContext): PlacedArtwork {
  const { style } = ctx;
  const { width: fw, depth, gap } = style.frame;
  const art = new THREE.Group();
  art.position.set(cfg.offset, ART_CENTER_Y, 0);
  holder.add(art);

  // Sous une verrière, la lumière du jour suffit. Ailleurs, chaque œuvre a son projecteur :
  // son faisceau est peint sur le mur, ce qui coûte bien moins cher qu'une vraie lampe.
  if (!ctx.light(room.id).daylight) {
    const pool = new THREE.Mesh(new THREE.PlaneGeometry(cfg.width + 1.7, cfg.height + 1.9), poolMaterial(room.wall ?? style.palette.wall));
    pool.position.set(0, 0.15, 0.006);
    pool.raycast = noRaycast;
    art.add(pool);
    holder.add(spotFixture(cfg.offset, room.size[1]));
  }

  const border = gap + fw;
  const body = new THREE.Mesh(
    new THREE.BoxGeometry(cfg.width + border * 2, cfg.height + border * 2, depth),
    new THREE.MeshStandardMaterial({ color: style.palette.frame, roughness: 0.5 }),
  );
  body.position.z = depth / 2;
  art.add(body);
  if (gap > 0) {
    // Caisse américaine : un vide sombre sépare la toile du cadre.
    const recess = new THREE.Mesh(new THREE.PlaneGeometry(cfg.width + gap * 2, cfg.height + gap * 2), new THREE.MeshBasicMaterial({ color: 0x050505 }));
    recess.position.z = depth + 0.001;
    art.add(recess);
  }
  // Une œuvre est toujours montrée dans ses couleurs exactes, comme sous un éclairage de musée.
  const surface = new THREE.MeshBasicMaterial({ toneMapped: false });
  const canvas = new THREE.Mesh(new THREE.PlaneGeometry(cfg.width, cfg.height), surface);
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
    ready: !('src' in cfg.image),
  };
  if ('src' in cfg.image) {
    // Le fichier arrive après la construction : en attendant, la toile reste d'un gris neutre.
    surface.color.set('#d9d5cd');
    const texture = artworkTexture(cfg.image, cfg.width / cfg.height, ctx.base, ctx.quality, () => {
      surface.map = texture;
      surface.color.set('#ffffff');
      surface.needsUpdate = true;
      placed.ready = true;
      ctx.onLoad();
    });
  } else {
    surface.map = artworkTexture(cfg.image, cfg.width / cfg.height, ctx.base, ctx.quality);
  }
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
  art.add(shape, plinth, card, groundShadow(side, side));

  const placed: PlacedArtwork = {
    config: cfg,
    room,
    center: new THREE.Vector3(x, cfg.plinth + cfg.height / 2, z),
    span: footprint,
    depth: footprint / 2,
    label: card,
    ready: true,
    obstacle: { x, z, r: side * 0.71 + 0.25 },
  };
  art.userData.artwork = placed;
  return placed;
}

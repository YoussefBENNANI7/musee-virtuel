import * as THREE from 'three';
import { clearHeight, objectLight, type Decor } from './decors';
import { groundShadow } from './furniture';
import { ART_CENTER_Y, type WallFrame } from './layout';
import type { RoomLight } from './lighting';
import type { Quality } from './quality';
import { loadSculpture, sculptureMaterial, sculptureShape } from './sculptures';
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
  /** Plus petite distance utile pour regarder l'œuvre : on s'approche davantage d'une petite estampe. */
  closest: number;
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
  quality: Quality;
  /** Adresse du dossier du musée, pour résoudre les images. */
  base: string;
  /** Environnement reflété par les sculptures. */
  env: THREE.Texture;
  /** Appelé quand une image finit de charger. */
  onLoad: () => void;
  /** Éclairage de chaque salle. */
  light(roomId: string): RoomLight;
  /** Décor de chaque salle. */
  decor(roomId: string): Decor;
}

/** Couleur d'une matière telle qu'elle paraît dans une salle : assombrie si la salle est tamisée. */
export function litColor(color: string, decor: Decor): THREE.Color {
  return new THREE.Color(color).multiplyScalar(objectLight(decor)).multiply(new THREE.Color(decor.light.tint));
}

const LABEL_W = 0.3;
const LABEL_H = 0.15;
const noRaycast = () => {};
/**
 * Réglage d'une matière plaquée sur une autre (halo sur le mur, toile sur son cadre) : elle passe
 * toujours devant, même dans le reflet du sol, où la profondeur est mesurée moins finement.
 * `rank` : 1 pour la première couche, 2 pour celle qui la recouvre.
 */
const inFront = (rank: number) => ({ polygonOffset: true, polygonOffsetFactor: -rank, polygonOffsetUnits: -rank });

/** Un matériau de halo par couleur de mur et par force de projecteur. */
const poolMaterials = new Map<string, THREE.Material>();
function poolMaterial(wallColor: string, strength: number): THREE.Material {
  const key = `${wallColor}:${strength}`;
  let mat = poolMaterials.get(key);
  if (!mat) {
    // Lumière ajoutée à la couleur du mur : un mur coloré s'éclaircit dans sa propre teinte.
    const wall = new THREE.Color(wallColor);
    // Un mur clair est déjà proche du blanc : son halo doit rester discret.
    const brightness = wall.getHSL({ h: 0, s: 0, l: 0 }).l;
    // Un projecteur plus fort révèle surtout la couleur du mur : sa part de lumière blanche
    // n'augmente pas, sans quoi un mur sombre se couvrirait d'un voile gris.
    const own = strength <= 1 ? 0.75 * strength : 0.75 * strength ** 2.5;
    const white = strength <= 1 ? 0.25 * strength : 0.25 / strength;
    mat = new THREE.MeshBasicMaterial({
      map: poolTexture(),
      color: wall.clone().multiplyScalar(own).add(new THREE.Color('#fff4e2').multiplyScalar(white)),
      opacity: 0.5 - 0.3 * brightness,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      toneMapped: false,
      ...inFront(1),
    });
    poolMaterials.set(key, mat);
  }
  return mat;
}

/** Cartel : éclairé comme le reste de la salle, pour ne pas briller dans une salle tamisée. */
function label(decor: Decor): THREE.Mesh {
  const color = new THREE.Color('#ffffff').multiplyScalar(Math.min(1, 0.35 + 0.65 * objectLight(decor)));
  return new THREE.Mesh(new THREE.PlaneGeometry(LABEL_W, LABEL_H), new THREE.MeshBasicMaterial({ color, toneMapped: false }));
}

/** Carton du passe-partout, et l'ombre de son biseau autour de l'œuvre. */
const MAT_COLOR = '#f1ede3';
const MAT_BEVEL = 0.004;
const MAT_BEVEL_COLOR = '#cfc8b8';

/** Distance de regard la plus courte : 1,20 m pour un tableau, moins pour une œuvre de petit format. */
export const closestView = (size: number): number => THREE.MathUtils.clamp(size * 1.6, 0.55, 1.2);

/** Distance entre le mur et le rail des projecteurs. */
export const TRACK_DISTANCE = 1.5;
const fixtureMaterials = new Map<string, THREE.Material>();
/** Matière des rails et des projecteurs d'une salle. */
export function fixtureMaterial(decor: Decor): THREE.Material {
  const key = `${decor.colors.fixture}:${decor.light.level}:${decor.light.tint}`;
  let mat = fixtureMaterials.get(key);
  if (!mat) {
    mat = new THREE.MeshStandardMaterial({ color: litColor(decor.colors.fixture, decor), roughness: 0.5 });
    fixtureMaterials.set(key, mat);
  }
  return mat;
}
const UP = new THREE.Vector3(0, 1, 0);

/** Projecteur suspendu au rail, braqué sur le centre de l'œuvre. Repère du mur. */
function spotFixture(offset: number, ceiling: number, fixtureMat: THREE.Material): THREE.Group {
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
  const decor = ctx.decor(room.id);
  const { width: fw, depth } = decor.frame;
  // Sous passe-partout, pas de vide entre l'œuvre et le cadre : le carton va jusqu'au montant.
  const mat = cfg.mat ?? 0;
  const gap = mat > 0 ? 0 : decor.frame.gap;
  const art = new THREE.Group();
  art.position.set(cfg.offset, ART_CENTER_Y, 0);
  holder.add(art);

  // Sous une verrière, la lumière du jour suffit. Ailleurs, chaque œuvre a son projecteur :
  // son faisceau est peint sur le mur, ce qui coûte bien moins cher qu'une vraie lampe.
  if (!ctx.light(room.id).daylight && decor.light.spots > 0) {
    const pool = new THREE.Mesh(new THREE.PlaneGeometry(cfg.width + mat * 2 + 1.7, cfg.height + mat * 2 + 1.9), poolMaterial(decor.colors.wall, decor.light.spots));
    pool.position.set(0, 0.15, 0.006);
    pool.raycast = noRaycast;
    art.add(pool);
    holder.add(spotFixture(cfg.offset, clearHeight(room, decor), fixtureMaterial(decor)));
  }

  const border = mat + gap + fw;
  const body = new THREE.Mesh(
    new THREE.BoxGeometry(cfg.width + border * 2, cfg.height + border * 2, depth),
    new THREE.MeshStandardMaterial({ color: litColor(decor.colors.frame, decor), roughness: 0.5 }),
  );
  body.position.z = depth / 2;
  art.add(body);
  if (gap > 0) {
    // Caisse américaine : un vide sombre sépare la toile du cadre.
    const recess = new THREE.Mesh(new THREE.PlaneGeometry(cfg.width + gap * 2, cfg.height + gap * 2), new THREE.MeshBasicMaterial({ color: 0x050505, ...inFront(1) }));
    recess.position.z = depth + 0.001;
    art.add(recess);
  }
  if (mat > 0) {
    // Passe-partout : un carton crème, dont la fenêtre est taillée en biseau autour de l'œuvre.
    const board = new THREE.Mesh(new THREE.PlaneGeometry(cfg.width + mat * 2, cfg.height + mat * 2), new THREE.MeshBasicMaterial({ color: MAT_COLOR, toneMapped: false, ...inFront(1) }));
    board.position.z = depth + 0.001;
    const bevel = new THREE.Mesh(new THREE.PlaneGeometry(cfg.width + MAT_BEVEL * 2, cfg.height + MAT_BEVEL * 2), new THREE.MeshBasicMaterial({ color: MAT_BEVEL_COLOR, toneMapped: false, ...inFront(2) }));
    bevel.position.z = depth + 0.0015;
    art.add(board, bevel);
  }
  // Une œuvre est toujours montrée dans ses couleurs exactes, comme sous un éclairage de musée.
  const surface = new THREE.MeshBasicMaterial({ toneMapped: false, ...inFront(3) });
  const canvas = new THREE.Mesh(new THREE.PlaneGeometry(cfg.width, cfg.height), surface);
  canvas.position.z = depth + 0.002;

  const card = label(decor);
  card.position.set(cfg.width / 2 + border + 0.14 + LABEL_W / 2, -cfg.height / 2 + 0.12, 0.012);
  art.add(canvas, card);

  const placed: PlacedArtwork = {
    config: cfg,
    room,
    center: frame.center.clone().addScaledVector(frame.tangent, cfg.offset).setY(ART_CENTER_Y),
    span: cfg.width,
    depth: 0,
    closest: closestView(Math.max(cfg.width, cfg.height)),
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

  const decor = ctx.decor(room.id);
  // Une sculpture reste mise en valeur par son éclairage, même dans une salle tamisée.
  const light = Math.min(1, 0.4 + 0.6 * objectLight(decor));
  // Le socle et l'ombre sont taillés à la mesure de la sculpture, une fois sa forme connue.
  const plinth = new THREE.Mesh(new THREE.BoxGeometry(1, cfg.plinth, 1), new THREE.MeshStandardMaterial({ color: litColor(decor.colors.plinth, decor), roughness: 0.8 }));
  plinth.position.y = cfg.plinth / 2;
  const card = label(decor);
  card.rotation.y = Math.PI / 2;
  const shadow = groundShadow(1, 1);
  art.add(plinth, card, shadow);

  const placed: PlacedArtwork = {
    config: cfg,
    room,
    center: new THREE.Vector3(x, cfg.plinth + cfg.height / 2, z),
    span: 0.8,
    depth: 0.4,
    closest: 1.2,
    label: card,
    ready: false,
    obstacle: { x, z, r: 0.8 },
  };
  /** Met la forme à l'échelle de la hauteur demandée, la centre sur le socle, et ajuste celui-ci. */
  const fit = (shape: THREE.Object3D | null) => {
    let footprint = 0.8;
    if (shape) {
      const box = new THREE.Box3().setFromObject(shape);
      const size = box.getSize(new THREE.Vector3());
      const scale = cfg.height / size.y;
      shape.scale.multiplyScalar(scale);
      shape.position.set(-((box.min.x + box.max.x) / 2) * scale, cfg.plinth - box.min.y * scale, -((box.min.z + box.max.z) / 2) * scale);
      footprint = Math.max(size.x, size.z) * scale;
      art.add(shape);
    }
    const side = THREE.MathUtils.clamp(footprint * 0.8, 0.5, 1.3);
    plinth.scale.set(side, 1, side);
    shadow.scale.set(side, side, 1);
    card.position.set(side / 2 + 0.002, Math.min(cfg.plinth - 0.12, 0.8), 0);
    placed.span = footprint;
    placed.depth = footprint / 2;
    placed.obstacle!.r = side * 0.71 + 0.25;
  };

  if ('src' in cfg.model) {
    // Le modèle arrive après la construction : en attendant, le socle est seul.
    fit(null);
    loadSculpture(cfg.model, ctx.base, ctx.quality, ctx.env, light)
      .then((shape) => {
        fit(shape);
        placed.ready = true;
        ctx.onLoad();
      })
      .catch(() => console.error(`[musée] modèle 3D introuvable : ${(cfg.model as { src: string }).src}`));
  } else {
    fit(sculptureShape(cfg, sculptureMaterial(cfg, ctx.env, light)));
    placed.ready = true;
  }
  art.userData.artwork = placed;
  return placed;
}

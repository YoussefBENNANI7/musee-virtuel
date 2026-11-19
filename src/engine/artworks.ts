import * as THREE from 'three';
import { buildMat, buildMoulding, frameModel, frameScale, MAT_THICKNESS, shadowStrip, type FrameStyle } from './cadres';
import { clearHeight, objectLight, type Decor } from './decors';
import { groundShadow } from './furniture';
import { ART_CENTER_Y, type WallFrame } from './layout';
import type { RoomLight } from './lighting';
import type { Quality } from './quality';
import { loadSculpture, sculptureMaterial, sculptureShape } from './sculptures';
import { artworkTexture, poolTexture } from './textures';
import type { ArtworkConfig, PaintingConfig, RoomConfig, SculptureConfig, WallId } from './types';

/** Une œuvre installée dans le musée. */
/** Calque à part : la sculpture qu'on examine y est placée, pour la montrer seule, sans la salle ni les autres œuvres. */
export const ALONE_LAYER = 1;

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
  /** Pour une sculpture : sa forme, une fois chargée. */
  shape?: THREE.Object3D;
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
  /** Aperçu d'un autre cadre (`?cadres=` dans l'adresse) : modèle à donner à ce tableau à la place du sien, s'il y en a un. */
  frameStyle?(cfg: PaintingConfig): FrameStyle | null;
}

/** Couleur d'une matière telle qu'elle paraît dans une salle : assombrie si la salle est tamisée. */
export function litColor(color: string, decor: Decor): THREE.Color {
  return new THREE.Color(color).multiplyScalar(objectLight(decor)).multiply(new THREE.Color(decor.light.tint));
}

const LABEL_W = 0.3;
const LABEL_H = 0.15;
const noRaycast = () => {};
let catcherMaterial: THREE.ShadowMaterial | null = null;
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

/** Distance de regard la plus courte : 1,20 m pour un tableau ou une sculpture, moins pour une œuvre de petit format. */
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
  // Un objet accroché tel quel (porte, tapis, panneau) n'a ni cadre ni passe-partout : seulement son épaisseur.
  const bare = cfg.frameless === true;
  // Son cadre : une moulure en relief (voir cadres.ts), l'œuvre en retrait au fond de la feuillure.
  const moulded = bare ? null : (ctx.frameStyle?.(cfg) ?? frameModel(cfg, decor.frames));
  const scale = moulded ? frameScale(moulded, Math.max(cfg.width, cfg.height)) : 1;
  const fw = moulded ? moulded.width * scale : 0;
  // Hauteur de l'œuvre au-dessus du mur.
  const depth = moulded ? moulded.rabbet * scale : (cfg.thickness ?? 0.03);
  // Sous passe-partout, le carton va jusqu'au montant. Une caisse américaine n'en reçoit pas : la toile y flotte dans un vide.
  const mat = !moulded || moulded.family === 'caisse' ? 0 : (cfg.mat ?? 0);
  const gap = moulded?.gap ?? 0;
  const centerY = cfg.y ?? ART_CENTER_Y;
  const art = new THREE.Group();
  art.position.set(cfg.offset, centerY, 0);
  if (bare && cfg.turn) {
    // Totem tourné : on l'avance juste assez pour que son arête arrière reste devant le mur.
    const angle = THREE.MathUtils.degToRad(cfg.turn);
    art.rotation.y = angle;
    art.position.z = Math.abs(Math.sin(angle)) * (cfg.width / 2) + 0.02;
  }
  holder.add(art);

  // Sous une verrière, la lumière du jour suffit. Ailleurs, chaque œuvre a son projecteur :
  // son faisceau est peint sur le mur, ce qui coûte bien moins cher qu'une vraie lampe.
  if (!ctx.light(room.id).daylight && decor.light.spots > 0) {
    const pool = new THREE.Mesh(new THREE.PlaneGeometry(cfg.width + mat * 2 + 1.7, cfg.height + mat * 2 + 1.9), poolMaterial(decor.colors.wall, decor.light.spots));
    pool.position.set(0, 0.15, 0.006);
    pool.raycast = noRaycast;
    // Avec la lumière précalculée, le vrai faisceau est dans l'atlas : ce halo est alors retiré.
    pool.userData.halo = room.id;
    art.add(pool);
    holder.add(spotFixture(cfg.offset, clearHeight(room, decor), fixtureMaterial(decor)));
  }

  const border = mat + gap + fw;
  if (moulded) {
    const [openW, openH] = [cfg.width + (mat + gap) * 2, cfg.height + (mat + gap) * 2];
    art.add(buildMoulding(moulded, openW, openH, scale, { env: ctx.env, light: objectLight(decor), tint: decor.light.tint, anisotropy: ctx.quality.anisotropy }));
    const relief = (moulded.depth - moulded.rabbet) * scale;
    if (gap > 0) {
      // Caisse américaine : la toile flotte dans le cadre. On voit son chant, et le fond sombre de la caisse.
      const floor = new THREE.Mesh(new THREE.PlaneGeometry(openW, openH), new THREE.MeshBasicMaterial({ color: 0x070605 }));
      floor.position.z = 0.008 * scale;
      const stretcher = new THREE.Mesh(new THREE.BoxGeometry(cfg.width, cfg.height, depth - 0.008 * scale), new THREE.MeshStandardMaterial({ color: litColor('#d9d2c2', decor), roughness: 0.9 }));
      stretcher.position.z = (depth + 0.008 * scale) / 2 - 0.0005;
      art.add(floor, stretcher);
    } else {
      // Fond du cadre : rien ne se voit du mur entre l'œuvre et la moulure.
      const back = new THREE.Mesh(new THREE.PlaneGeometry(openW, openH), new THREE.MeshBasicMaterial({ color: 0x0b0a09 }));
      back.position.z = depth - MAT_THICKNESS - 0.001;
      art.add(back);
    }
    if (mat > 0) {
      const board = buildMat(cfg.width, cfg.height, mat, relief, inFront);
      board.position.z = depth;
      art.add(board);
    } else if (gap === 0 && relief > 0.012) {
      // Sans passe-partout, le cadre porte son ombre sur le haut de la toile, et un peu sur ses côtés.
      for (const [side, reach, opacity] of [[2, relief * 0.7, 0.3], [1, relief * 0.3, 0.16], [3, relief * 0.3, 0.16]] as const) {
        const shadow = shadowStrip(side, cfg.width, cfg.height, Math.min(reach, cfg.height * 0.12), opacity, inFront(4));
        shadow.position.z = depth + 0.0005;
        art.add(shadow);
      }
    }
  } else {
    // Sans cadre : l'objet lui-même, avec son épaisseur.
    const body = new THREE.Mesh(new THREE.BoxGeometry(cfg.width, cfg.height, depth), new THREE.MeshStandardMaterial({ color: litColor('#2a2019', decor), roughness: 0.5 }));
    body.position.z = depth / 2;
    art.add(body);
  }
  // Une œuvre est toujours montrée dans ses couleurs exactes, comme sous un éclairage de musée.
  const surface = new THREE.MeshBasicMaterial({ toneMapped: false, ...inFront(3) });
  const canvas = new THREE.Mesh(new THREE.PlaneGeometry(cfg.width, cfg.height), surface);
  // Sous un passe-partout biseauté, l'œuvre est derrière le carton, au fond de sa fenêtre.
  canvas.position.z = moulded ? (mat > 0 ? depth - MAT_THICKNESS : depth) : depth + 0.002;

  const card = label(decor);
  // Le cartel reste à hauteur de lecture, même à côté d'une porte ou d'un tapis qui descend jusqu'au sol.
  card.position.set(cfg.width / 2 + border + 0.14 + LABEL_W / 2, THREE.MathUtils.clamp(-cfg.height / 2 + 0.12, 1.15 - centerY, 1.5 - centerY), 0.012);
  // Un totem épais se passe de cartel : ses voisins le cacheraient.
  card.visible = !(bare && depth > 0.1);
  art.add(canvas, card);

  const placed: PlacedArtwork = {
    config: cfg,
    room,
    center: frame.center.clone().addScaledVector(frame.tangent, cfg.offset).setY(centerY),
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

/** Direction (x, z) vers laquelle regarde le cartel d'un socle, selon le mur de la salle qu'il a en face. */
const CARD_SIDES: Record<WallId, [number, number]> = { east: [1, 0], west: [-1, 0], south: [0, 1], north: [0, -1] };

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
  // Le cartel regarde le côté d'où vient le visiteur : l'est, sauf indication contraire.
  const [cardX, cardZ] = CARD_SIDES[cfg.cardSide ?? 'east'] ?? CARD_SIDES.east;
  card.rotation.y = Math.atan2(cardX, cardZ);
  const shadow = groundShadow(1, 1);
  art.add(plinth, card, shadow);
  if (ctx.quality.shadows) {
    // Ombre portée : le socle la projette et la reçoit ; au sol, une surface invisible la recueille.
    plinth.castShadow = true;
    plinth.receiveShadow = true;
    catcherMaterial ??= new THREE.ShadowMaterial({ opacity: 0.3, depthWrite: false });
    const catcher = new THREE.Mesh(new THREE.PlaneGeometry(7, 7), catcherMaterial);
    catcher.rotation.x = -Math.PI / 2;
    catcher.position.y = 0.0045;
    catcher.receiveShadow = true;
    catcher.raycast = noRaycast;
    art.add(catcher);
  }

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
      // Tournée avant d'être mesurée : le socle suit l'emprise de la sculpture telle qu'elle est posée.
      if (cfg.turn) shape.rotation.y = THREE.MathUtils.degToRad(cfg.turn);
      shape.traverse((node) => {
        node.castShadow = true;
        node.receiveShadow = true;
      });
      placed.shape = shape;
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
    card.position.set(cardX * (side / 2 + 0.002), Math.min(cfg.plinth - 0.12, 0.8), cardZ * (side / 2 + 0.002));
    placed.span = footprint;
    placed.depth = footprint / 2;
    // Un petit objet se regarde de plus près qu'une statue, comme un petit tableau.
    placed.closest = closestView(Math.max(cfg.height, footprint));
    placed.obstacle!.r = side * 0.71 + 0.25;
  };

  if ('src' in cfg.model) {
    // Le modèle arrive après la construction : en attendant, le socle est seul.
    fit(null);
    loadSculpture(cfg.model, ctx.base, ctx.quality, ctx.env, light * (cfg.tone ?? 1))
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

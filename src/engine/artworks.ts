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

/** Cadre doré mouluré : largeur du montant et saillie, en mètres. */
export const GILT_FRAME = { width: 0.1, depth: 0.075 };

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
  // Un objet accroché tel quel (porte, tapis, panneau) n'a ni cadre ni passe-partout : seulement son épaisseur.
  const bare = cfg.frameless === true;
  const gilt = !bare && cfg.frame === 'gilt';
  const fw = bare ? 0 : gilt ? GILT_FRAME.width : decor.frame.width;
  const depth = bare ? (cfg.thickness ?? 0.03) : gilt ? 0.02 : decor.frame.depth;
  // Sous passe-partout, pas de vide entre l'œuvre et le cadre : le carton va jusqu'au montant.
  const mat = bare ? 0 : (cfg.mat ?? 0);
  const gap = bare || gilt || mat > 0 ? 0 : decor.frame.gap;
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
  const body = new THREE.Mesh(
    new THREE.BoxGeometry(cfg.width + border * 2, cfg.height + border * 2, depth),
    new THREE.MeshStandardMaterial({ color: litColor(bare ? '#2a2019' : gilt ? '#9c7a34' : decor.colors.frame, decor), roughness: 0.5 }),
  );
  body.position.z = depth / 2;
  art.add(body);
  if (gilt) {
    // Cadre doré : trois moulures emboîtées, la plus haute au milieu, qui descendent vers la toile.
    // L'or est rendu par sa teinte : sans rien à refléter, un vrai métal paraîtrait terne.
    const gold = new THREE.MeshStandardMaterial({ color: litColor('#d8b25c', decor), roughness: 0.5 });
    const bright = new THREE.MeshStandardMaterial({ color: litColor('#edd08a', decor), roughness: 0.4 });
    const shadowed = new THREE.MeshStandardMaterial({ color: litColor('#9c7a34', decor), roughness: 0.6 });
    const moulding = (from: number, to: number, height: number, material: THREE.Material) => {
      const outer = new THREE.Shape();
      const [ow, oh] = [cfg.width / 2 + fw * to, cfg.height / 2 + fw * to];
      outer.moveTo(-ow, -oh);
      outer.lineTo(ow, -oh);
      outer.lineTo(ow, oh);
      outer.lineTo(-ow, oh);
      outer.closePath();
      const [iw, ih] = [cfg.width / 2 + fw * from, cfg.height / 2 + fw * from];
      const hole = new THREE.Path();
      hole.moveTo(-iw, -ih);
      hole.lineTo(-iw, ih);
      hole.lineTo(iw, ih);
      hole.lineTo(iw, -ih);
      hole.closePath();
      outer.holes.push(hole);
      art.add(new THREE.Mesh(new THREE.ExtrudeGeometry(outer, { depth: height, bevelEnabled: false }), material));
    };
    moulding(0, 1, 0.04, gold);
    moulding(0.3, 0.8, GILT_FRAME.depth, bright);
    moulding(0.86, 1, 0.055, bright);
    moulding(0, 0.22, 0.03, shadowed);
  }
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
    card.position.set(side / 2 + 0.002, Math.min(cfg.plinth - 0.12, 0.8), 0);
    placed.span = footprint;
    placed.depth = footprint / 2;
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

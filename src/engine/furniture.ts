import * as THREE from 'three';
import { objectLight, type Decor } from './decors';
import { blobTexture, poolTexture as blobTextureLight } from './textures';
import { wallFrame } from './layout';
import type { BenchConfig, RoomConfig, WallId, ZoneConfig } from './types';

export const BENCH = { length: 1.8, width: 0.46, height: 0.44 };

let blobMaterial: THREE.Material | null = null;

/** Ombre douce au sol, sous un socle ou un banc. `width` et `depth` : emprise de l'objet. */
export function groundShadow(width: number, depth: number): THREE.Mesh {
  blobMaterial ??= new THREE.MeshBasicMaterial({ map: blobTexture(), transparent: true, depthWrite: false, toneMapped: false });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(width * 2.1, depth * 2.1), blobMaterial);
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.y = 0.003;
  mesh.raycast = () => {};
  // Avec la lumière précalculée, la vraie ombre est dans l'atlas : cette ombre peinte est alors retirée.
  mesh.userData.ombrePeinte = true;
  return mesh;
}

/** Largeur du filet qui borde une zone au sol, en mètres. */
const ZONE_BORDER = 0.035;

/**
 * Zone marquée au sol : un rectangle de couleur bordé d'un filet, qui réunit plusieurs socles en un îlot.
 * Elle est posée sur le sol comme un tapis : le visiteur marche dessus, et l'ombre des socles s'y lit encore.
 */
export function buildZone(zone: ZoneConfig, room: RoomConfig, decor: Decor): THREE.Group {
  const [w, d] = zone.size;
  const lit = (color: string) => new THREE.Color(color).multiplyScalar(objectLight(decor)).multiply(new THREE.Color(decor.light.tint));
  const group = new THREE.Group();
  group.name = 'zone';
  group.position.set(room.position[0] + zone.position[0], 0, room.position[1] + zone.position[1]);
  const flat = (width: number, depth: number, material: THREE.Material, y: number) => {
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(width, depth), material);
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.y = y;
    mesh.raycast = () => {};
    return mesh;
  };
  const offset = (rank: number) => ({ polygonOffset: true, polygonOffsetFactor: -rank, polygonOffsetUnits: -rank });
  const field = new THREE.MeshBasicMaterial({ color: lit(zone.color ?? decor.colors.wood), transparent: true, opacity: 0.9, depthWrite: false, ...offset(1) });
  const border = new THREE.MeshBasicMaterial({ color: lit(zone.border ?? decor.colors.trim), depthWrite: false, ...offset(2) });
  group.add(flat(w, d, field, 0.0012));
  for (const side of [-1, 1]) {
    const along = flat(w, ZONE_BORDER, border, 0.0016);
    along.position.z = (side * (d - ZONE_BORDER)) / 2;
    const across = flat(ZONE_BORDER, d, border, 0.0016);
    across.position.x = (side * (w - ZONE_BORDER)) / 2;
    group.add(along, across);
  }
  return group;
}

let lanternGlow: THREE.Material | null = null;

/**
 * Lanterne de laiton ajouré, suspendue au plafond par une chaîne : un corps à huit pans
 * éclairé de l'intérieur, sous un petit dôme. `top` : hauteur du plafond ; `y` : hauteur de la lanterne.
 */
export function buildLantern(position: [number, number], room: RoomConfig, top: number, y: number): THREE.Group {
  const group = new THREE.Group();
  group.position.set(room.position[0] + position[0], y, room.position[1] + position[1]);
  const brass = new THREE.MeshStandardMaterial({ color: '#8a6a2c', roughness: 0.45, metalness: 0.8 });
  const glass = new THREE.MeshBasicMaterial({ color: '#ffd9a0', toneMapped: false });
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.12, 0.42, 8, 1, true), glass);
  // Montants et cercles de laiton par-dessus le verre éclairé.
  const cage = new THREE.Mesh(new THREE.CylinderGeometry(0.175, 0.125, 0.42, 8, 3, true), new THREE.MeshStandardMaterial({ color: '#6b4f1e', roughness: 0.5, metalness: 0.8, wireframe: true }));
  const dome = new THREE.Mesh(new THREE.ConeGeometry(0.2, 0.2, 8), brass);
  dome.position.y = 0.31;
  const foot = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.14, 8), brass);
  foot.rotation.x = Math.PI;
  foot.position.y = -0.28;
  const chain = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, top - y - 0.4, 6), brass);
  chain.position.y = 0.4 + (top - y - 0.4) / 2;
  // Halo de lumière autour de la lanterne, toujours tourné vers le visiteur.
  lanternGlow ??= new THREE.SpriteMaterial({ map: blobTextureLight(), color: LANTERN_COLOR, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
  const halo = new THREE.Sprite(lanternGlow as THREE.SpriteMaterial);
  halo.scale.set(1.5, 1.5, 1);
  halo.raycast = () => {};
  group.add(body, cage, dome, foot, chain, halo);
  // Pour la lumière précalculée, la lanterne est une lampe : son corps ne lui fait pas d'ombre.
  group.traverse((o) => {
    o.userData.lanterne = true;
  });
  return group;
}

/** Hauteur à laquelle pendent les lanternes d'une salle. */
export const lanternHeight = (room: RoomConfig): number => Math.min(3.4, room.size[1] - 0.9);

/** Couleur de la lumière d'une lanterne. */
export const LANTERN_COLOR = '#ffc880';

/** Comptoir de banque : profondeur, hauteur du plateau, hauteur de la lisse des guichets, et retrait à chaque bout. */
export const COUNTER = { depth: 0.55, height: 1.02, rail: 2.25, inset: 0.6 };

/**
 * Comptoir à guichets le long d'un mur : un meuble de bois à panneaux, un plateau de pierre sombre,
 * et des montants de laiton réunis par une lisse, qui découpent le mur en guichets.
 * `wallThickness` : épaisseur des murs du musée.
 */
export function buildCounter(wall: WallId, room: RoomConfig, decor: Decor, wallThickness: number): THREE.Group {
  const frame = wallFrame(room, wall, wallThickness / 2);
  const group = new THREE.Group();
  group.position.copy(frame.center);
  group.rotation.y = frame.rotY;
  const lit = (color: string, gain = 1) => new THREE.Color(color).multiplyScalar(objectLight(decor) * gain).multiply(new THREE.Color(decor.light.tint));
  const wood = new THREE.MeshStandardMaterial({ color: lit(decor.colors.wood), roughness: 0.6 });
  const dark = new THREE.MeshStandardMaterial({ color: lit(decor.colors.wood, 0.6), roughness: 0.7 });
  const stone = new THREE.MeshStandardMaterial({ color: lit('#2a2622'), roughness: 0.3 });
  const brass = new THREE.MeshStandardMaterial({ color: lit('#b9944a', 1.1), metalness: 0.8, roughness: 0.38 });
  const length = frame.length - COUNTER.inset * 2;
  const { depth, height, rail } = COUNTER;
  const body = new THREE.Mesh(new THREE.BoxGeometry(length, height - 0.04, depth), wood);
  body.position.set(0, (height - 0.04) / 2, depth / 2);
  const top = new THREE.Mesh(new THREE.BoxGeometry(length + 0.06, 0.04, depth + 0.05), stone);
  top.position.set(0, height - 0.02, depth / 2 + 0.01);
  const plinth = new THREE.Mesh(new THREE.BoxGeometry(length + 0.02, 0.1, depth + 0.02), dark);
  plinth.position.set(0, 0.05, depth / 2);
  group.add(body, top, plinth);
  // Un guichet tous les deux mètres environ : panneau mouluré en façade, montant de laiton entre deux guichets.
  const bays = Math.max(1, Math.round(length / 2));
  const bay = length / bays;
  for (let i = 0; i < bays; i++) {
    const x = -length / 2 + bay * (i + 0.5);
    const panel = new THREE.Mesh(new THREE.BoxGeometry(bay - 0.22, height - 0.36, 0.02), dark);
    panel.position.set(x, height / 2 + 0.02, depth + 0.005);
    const inlay = new THREE.Mesh(new THREE.BoxGeometry(0.035, height - 0.5, 0.012), brass);
    inlay.position.set(x, height / 2 + 0.02, depth + 0.02);
    group.add(panel, inlay);
  }
  for (let i = 0; i <= bays; i++) {
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.035, rail - height, 0.035), brass);
    post.position.set(-length / 2 + bay * i, (rail + height) / 2, depth - 0.06);
    group.add(post);
  }
  const lisse = new THREE.Mesh(new THREE.BoxGeometry(length + 0.035, 0.035, 0.035), brass);
  lisse.position.set(0, rail, depth - 0.06);
  group.add(lisse);
  group.traverse((node) => {
    node.raycast = () => {};
  });
  return group;
}

/**
 * Cubes suspendus : une grappe de cubes blancs pendus au plafond à des hauteurs différentes,
 * dont les quatre faces portent une photographie. `base` : adresse du dossier du musée.
 */
export function buildPhotoCubes(cfg: { position: [number, number]; images: string[] }, room: RoomConfig, decor: Decor, base: string, onLoad: () => void): THREE.Group {
  const group = new THREE.Group();
  group.position.set(room.position[0] + cfg.position[0], 0, room.position[1] + cfg.position[1]);
  const top = room.size[1];
  const side = 0.52;
  const level = Math.min(1, 0.45 + 0.55 * objectLight(decor));
  const white = new THREE.MeshBasicMaterial({ color: new THREE.Color('#e9e6e0').multiplyScalar(level), toneMapped: false });
  const wire = new THREE.MeshBasicMaterial({ color: '#8d8a84', toneMapped: false });
  const loader = new THREE.TextureLoader();
  // Disposition figée : la grappe est la même à chaque visite.
  const spots = [[-0.9, 0.2, 0.62], [0.1, -0.5, 0.86], [0.95, 0.35, 0.7], [-0.35, 0.75, 0.42], [0.55, -0.15, 0.5], [-1.15, -0.55, 0.36], [1.3, -0.6, 0.3], [0.05, 0.3, 0.2], [0.75, 0.9, 0.12], [-0.7, -0.05, 0.05]];
  cfg.images.slice(0, spots.length).forEach((image, i) => {
    const [x, z, lift] = spots[i];
    const y = 2.55 + lift * Math.max(0.6, top - 3.6);
    const face = new THREE.MeshBasicMaterial({ color: new THREE.Color('#ffffff').multiplyScalar(level), toneMapped: false });
    loader.load(new URL(image, base).href, (texture) => {
      texture.colorSpace = THREE.SRGBColorSpace;
      face.map = texture;
      face.needsUpdate = true;
      onLoad();
    });
    const cube = new THREE.Mesh(new THREE.BoxGeometry(side, side, side), [face, face, white, white, face, face]);
    cube.position.set(x, y, z);
    cube.rotation.y = ((i * 37) % 60) * 0.02 - 0.5;
    cube.raycast = () => {};
    const thread = new THREE.Mesh(new THREE.CylinderGeometry(0.003, 0.003, top - y - side / 2, 4), wire);
    thread.position.set(x, (top + y + side / 2) / 2, z);
    thread.raycast = () => {};
    group.add(cube, thread);
  });
  return group;
}

/** Emprise au sol d'un banc : demi-longueurs selon x et z. */
export function benchFootprint(bench: BenchConfig): { hx: number; hz: number } {
  return bench.rotated ? { hx: BENCH.width / 2, hz: BENCH.length / 2 } : { hx: BENCH.length / 2, hz: BENCH.width / 2 };
}

/** Banc monolithe en bois, détaché du sol par un socle en retrait. */
export function buildBench(bench: BenchConfig, room: RoomConfig, decor: Decor): THREE.Group {
  const lit = (color: string) => new THREE.Color(color).multiplyScalar(objectLight(decor)).multiply(new THREE.Color(decor.light.tint));
  const group = new THREE.Group();
  group.position.set(room.position[0] + bench.position[0], 0, room.position[1] + bench.position[1]);
  if (bench.rotated) group.rotation.y = Math.PI / 2;
  const seat = new THREE.Mesh(
    new THREE.BoxGeometry(BENCH.length, BENCH.height - 0.05, BENCH.width),
    new THREE.MeshStandardMaterial({ color: lit(decor.colors.wood), roughness: 0.7 }),
  );
  seat.position.y = 0.05 + (BENCH.height - 0.05) / 2;
  const base = new THREE.Mesh(
    new THREE.BoxGeometry(BENCH.length - 0.12, 0.05, BENCH.width - 0.1),
    new THREE.MeshStandardMaterial({ color: lit(decor.colors.trim), roughness: 0.8 }),
  );
  base.position.y = 0.025;
  group.add(seat, base, groundShadow(BENCH.length, BENCH.width));
  return group;
}

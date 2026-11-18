import * as THREE from 'three';
import { objectLight, type Decor } from './decors';
import { blobTexture, poolTexture as blobTextureLight } from './textures';
import { wallFrame } from './layout';
import type { BenchConfig, RoomConfig, WallId } from './types';

export const BENCH = { length: 1.8, width: 0.46, height: 0.44 };

let blobMaterial: THREE.Material | null = null;

/** Ombre douce au sol, sous un socle ou un banc. `width` et `depth` : emprise de l'objet. */
export function groundShadow(width: number, depth: number): THREE.Mesh {
  blobMaterial ??= new THREE.MeshBasicMaterial({ map: blobTexture(), transparent: true, depthWrite: false, toneMapped: false });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(width * 2.1, depth * 2.1), blobMaterial);
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.y = 0.003;
  mesh.raycast = () => {};
  return mesh;
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
  lanternGlow ??= new THREE.SpriteMaterial({ map: blobTextureLight(), color: '#ffc880', opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
  const halo = new THREE.Sprite(lanternGlow as THREE.SpriteMaterial);
  halo.scale.set(1.5, 1.5, 1);
  halo.raycast = () => {};
  group.add(body, cage, dome, foot, chain, halo);
  return group;
}

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

/** Rayon au sol de la fontaine, pointes de l'étoile comprises. */
export const FOUNTAIN_RADIUS = 1.3;

/**
 * Fontaine de patio : un bassin bas en étoile à huit branches, bordé de marbre et paré de zellige,
 * avec une vasque au centre. `tiles` : la matière des parois du bassin.
 */
export function buildFountain(position: [number, number], room: RoomConfig, decor: Decor, tiles: THREE.Material): THREE.Group {
  const group = new THREE.Group();
  group.position.set(room.position[0] + position[0], 0, room.position[1] + position[1]);
  const lit = (color: string) => new THREE.Color(color).multiplyScalar(objectLight(decor)).multiply(new THREE.Color(decor.light.tint));
  const marble = new THREE.MeshStandardMaterial({ color: lit('#efe9dc'), roughness: 0.35 });
  const points = (radius: number) =>
    Array.from({ length: 16 }, (_, i) => {
      const d = i % 2 ? radius * 0.765 : radius;
      return new THREE.Vector2(Math.cos((i * Math.PI) / 8) * d, Math.sin((i * Math.PI) / 8) * d);
    });
  const height = 0.42;
  const outer = points(FOUNTAIN_RADIUS);
  // Parois : un panneau de zellige par côté de l'étoile.
  outer.forEach((a, i) => {
    const b = outer[(i + 1) % 16];
    const length = a.distanceTo(b);
    const wall = new THREE.Mesh(new THREE.PlaneGeometry(length, height), tiles);
    wall.position.set((a.x + b.x) / 2, height / 2, (a.y + b.y) / 2);
    wall.rotation.y = Math.atan2(-(b.y - a.y), b.x - a.x) + Math.PI;
    group.add(wall);
  });
  // Margelle de marbre, puis l'eau.
  const rim = new THREE.Shape(outer);
  rim.holes.push(new THREE.Path(points(FOUNTAIN_RADIUS - 0.16).reverse()));
  const top = new THREE.Mesh(new THREE.ShapeGeometry(rim), marble);
  top.rotation.x = -Math.PI / 2;
  top.position.y = height;
  const water = new THREE.Mesh(
    new THREE.ShapeGeometry(new THREE.Shape(points(FOUNTAIN_RADIUS - 0.16))),
    new THREE.MeshStandardMaterial({ color: lit('#4fa39b'), roughness: 0.08, metalness: 0.1 }),
  );
  water.rotation.x = -Math.PI / 2;
  water.position.y = height - 0.07;
  // Vasque centrale sur son fût.
  const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.11, 0.55, 20), marble);
  stem.position.y = height + 0.2;
  const profile = [[0.06, 0], [0.3, 0.05], [0.44, 0.14], [0.46, 0.17], [0.4, 0.15], [0.05, 0.08]].map(([x, y]) => new THREE.Vector2(x, y));
  const bowl = new THREE.Mesh(new THREE.LatheGeometry(profile, 40), marble);
  bowl.position.y = height + 0.46;
  const shadow = groundShadow(FOUNTAIN_RADIUS * 1.5, FOUNTAIN_RADIUS * 1.5);
  group.add(top, water, stem, bowl, shadow);
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

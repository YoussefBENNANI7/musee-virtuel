import * as THREE from 'three';
import { objectLight, type Decor } from './decors';
import { blobTexture, poolTexture as blobTextureLight } from './textures';
import type { BenchConfig, RoomConfig } from './types';

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

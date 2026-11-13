import * as THREE from 'three';
import type { Style } from './styles';
import { blobTexture } from './textures';
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
  return mesh;
}

/** Emprise au sol d'un banc : demi-longueurs selon x et z. */
export function benchFootprint(bench: BenchConfig): { hx: number; hz: number } {
  return bench.rotated ? { hx: BENCH.width / 2, hz: BENCH.length / 2 } : { hx: BENCH.length / 2, hz: BENCH.width / 2 };
}

/** Banc monolithe en bois, détaché du sol par un socle en retrait. */
export function buildBench(bench: BenchConfig, room: RoomConfig, style: Style): THREE.Group {
  const group = new THREE.Group();
  group.position.set(room.position[0] + bench.position[0], 0, room.position[1] + bench.position[1]);
  if (bench.rotated) group.rotation.y = Math.PI / 2;
  const seat = new THREE.Mesh(
    new THREE.BoxGeometry(BENCH.length, BENCH.height - 0.05, BENCH.width),
    new THREE.MeshStandardMaterial({ color: style.palette.wood, roughness: 0.7 }),
  );
  seat.position.y = 0.05 + (BENCH.height - 0.05) / 2;
  const base = new THREE.Mesh(
    new THREE.BoxGeometry(BENCH.length - 0.12, 0.05, BENCH.width - 0.1),
    new THREE.MeshStandardMaterial({ color: style.palette.trim, roughness: 0.8 }),
  );
  base.position.y = 0.025;
  group.add(seat, base, groundShadow(BENCH.length, BENCH.width));
  return group;
}

import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import type { Quality } from './quality';
import { rng } from './textures';
import type { ModelSource, SculptureConfig } from './types';

export type FileModel = Extract<ModelSource, { src: string }>;

/** Adresse du fichier à charger : la version préparée qui convient à l'appareil, sinon l'original. */
export function modelUrl(model: FileModel, base: string, light: boolean): string {
  if (!model.web) return new URL(model.src, base).href;
  const slash = model.src.lastIndexOf('/');
  const name = model.src.slice(slash + 1).replace(/\.[^.]+$/, '');
  return new URL(`${model.src.slice(0, slash + 1)}web/${name}${light ? '-leger' : ''}.glb`, base).href;
}

let loader: GLTFLoader | null = null;

/**
 * Charge une sculpture numérisée. Sa matière est celle du relevé : on y ajoute seulement
 * les reflets du musée, et on l'assombrit comme le reste de sa salle (`light`, entre 0 et 1).
 */
export function loadSculpture(model: FileModel, base: string, quality: Quality, env: THREE.Texture, light: number): Promise<THREE.Group> {
  loader ??= new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
  return loader.loadAsync(modelUrl(model, base, quality.lightModels)).then((gltf) => {
    lightModel(gltf.scene, env, light, quality.anisotropy);
    return gltf.scene;
  });
}

/**
 * Met un modèle 3D à la lumière de sa salle. Plusieurs pièces d'un modèle partagent souvent la même matière :
 * chacune n'est assombrie qu'une fois, sinon elle vire au noir (vingt feuilles d'un livre, une seule matière « papier »).
 */
export function lightModel(scene: THREE.Object3D, env: THREE.Texture | null, light: number, anisotropy = 1) {
  const done = new Set<THREE.Material>();
  scene.traverse((node) => {
    const mesh = node as THREE.Mesh;
    if (!mesh.isMesh) return;
    for (const mat of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) {
      const std = mat as THREE.MeshStandardMaterial;
      if (!std.isMeshStandardMaterial || done.has(std)) continue;
      done.add(std);
      std.envMap = env;
      std.envMapIntensity = light;
      std.color.multiplyScalar(light);
      if (std.map) std.map.anisotropy = anisotropy;
    }
  });
}

/** `light` : part de lumière que la sculpture reçoit dans sa salle, entre 0 et 1. */
export function sculptureMaterial(cfg: SculptureConfig, env: THREE.Texture, light = 1): THREE.Material {
  const material = cfg.material ?? 'bronze';
  const presets = {
    bronze: { color: '#8a5a2e', metalness: 1, roughness: 0.36 },
    marble: { color: '#efebe3', metalness: 0, roughness: 0.32 },
    patina: { color: '#3f8073', metalness: 0.85, roughness: 0.5 },
    lacquer: { color: cfg.color ?? '#8f231c', metalness: 0.05, roughness: 0.22 },
  };
  const result = new THREE.MeshStandardMaterial({ ...presets[material], envMap: env, envMapIntensity: 1.1 * light });
  result.color.multiplyScalar(light);
  return result;
}

/** Sculpture fictive générée à partir d'une graine. Les vrais musées fourniront des modèles 3D. */
export function sculptureShape(cfg: SculptureConfig, mat: THREE.Material): THREE.Group {
  const g = new THREE.Group();
  if (!('generator' in cfg.model)) return g;
  const r = rng(cfg.model.seed);
  switch (cfg.model.generator) {
    case 'knot': {
      const [p, q] = [[2, 3], [3, 4], [2, 5], [3, 5]][Math.floor(r() * 4)];
      g.add(new THREE.Mesh(new THREE.TorusKnotGeometry(0.5, 0.15, 220, 28, p, q), mat));
      break;
    }
    case 'blob': {
      const geo = new THREE.SphereGeometry(0.5, 72, 48);
      const pos = geo.attributes.position;
      const ph = [r() * 6, r() * 6, r() * 6];
      const v = new THREE.Vector3();
      for (let i = 0; i < pos.count; i++) {
        v.fromBufferAttribute(pos, i);
        const k = 1 + 0.22 * Math.sin(v.x * 5 + ph[0]) * Math.sin(v.y * 4 + ph[1]) + 0.16 * Math.sin(v.z * 6 + ph[2]);
        pos.setXYZ(i, v.x * k, v.y * k * 0.8, v.z * k);
      }
      geo.computeVertexNormals();
      g.add(new THREE.Mesh(geo, mat));
      break;
    }
    case 'rings':
      for (let i = 0; i < 3; i++) {
        const ring = new THREE.Mesh(new THREE.TorusGeometry(0.5 - i * 0.09, 0.04, 16, 96), mat);
        ring.rotation.set(r() * Math.PI, r() * Math.PI, 0);
        g.add(ring);
      }
      break;
    case 'stack': {
      let y = 0;
      for (let i = 0; i < 6; i++) {
        const s = 0.5 - i * 0.05 + r() * 0.08;
        const hgt = 0.16 + r() * 0.18;
        const box = new THREE.Mesh(new THREE.BoxGeometry(s, hgt, s * (0.6 + r() * 0.4)), mat);
        box.position.y = y + hgt / 2;
        box.rotation.y = r() * Math.PI;
        y += hgt;
        g.add(box);
      }
      break;
    }
    case 'ribbon': {
      const pts: THREE.Vector3[] = [];
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2;
        const rad = 0.3 + r() * 0.25;
        pts.push(new THREE.Vector3(Math.cos(a) * rad, 0.5 + Math.sin(a * 2 + r()) * 0.45, Math.sin(a) * rad));
      }
      g.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts, true), 240, 0.06, 14, true), mat));
      break;
    }
  }
  return g;
}

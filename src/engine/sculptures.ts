import * as THREE from 'three';
import { rng } from './textures';
import type { SculptureConfig } from './types';

export function sculptureMaterial(cfg: SculptureConfig, env: THREE.Texture): THREE.Material {
  const presets = {
    bronze: { color: '#8a5a2e', metalness: 1, roughness: 0.36 },
    marble: { color: '#efebe3', metalness: 0, roughness: 0.32 },
    patina: { color: '#3f8073', metalness: 0.85, roughness: 0.5 },
    lacquer: { color: cfg.color ?? '#8f231c', metalness: 0.05, roughness: 0.22 },
  };
  return new THREE.MeshStandardMaterial({ ...presets[cfg.material], envMap: env, envMapIntensity: 1.1 });
}

/** Sculpture fictive générée à partir d'une graine. Les vrais musées fourniront des modèles 3D. */
export function sculptureShape(cfg: SculptureConfig, mat: THREE.Material): THREE.Group {
  const r = rng(cfg.model.seed);
  const g = new THREE.Group();
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

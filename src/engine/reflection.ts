import * as THREE from 'three';
import { Reflector } from 'three/examples/jsm/objects/Reflector.js';
import type { MuseumConfig } from './types';

/**
 * Reflet du musée dans le sol, comme sur un béton ciré : discret vu de haut,
 * plus marqué en regardant au loin. Le musée est dessiné une seconde fois, à l'envers,
 * à chaque image : ce reflet est donc réservé au niveau de qualité le plus élevé.
 */
const shader = {
  name: 'FloorReflection',
  uniforms: {
    color: { value: null },
    tDiffuse: { value: null },
    textureMatrix: { value: null },
    strength: { value: 0.3 },
    texel: { value: new THREE.Vector2(1 / 1024, 1 / 512) },
  },
  vertexShader: /* glsl */ `
    uniform mat4 textureMatrix;
    varying vec4 vUv;
    varying vec3 vWorld;
    void main() {
      vUv = textureMatrix * vec4(position, 1.0);
      vWorld = (modelMatrix * vec4(position, 1.0)).xyz;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }`,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float strength;
    uniform vec2 texel;
    varying vec4 vUv;
    varying vec3 vWorld;
    void main() {
      // Reflet légèrement flou : le sol est ciré, pas un miroir.
      vec2 uv = vUv.xy / vUv.w;
      vec3 sum = vec3(0.0);
      for (int i = -2; i <= 2; i++) {
        for (int j = -2; j <= 2; j++) {
          sum += texture2D(tDiffuse, uv + vec2(float(i), float(j)) * texel * 1.6).rgb;
        }
      }
      // Plus le regard est rasant, plus le sol réfléchit.
      vec3 view = normalize(cameraPosition - vWorld);
      float grazing = pow(1.0 - clamp(view.y, 0.0, 1.0), 2.5);
      gl_FragColor = vec4(sum / 25.0, strength * mix(0.18, 1.0, grazing));
      #include <colorspace_fragment>
    }`,
};

export interface FloorReflection {
  object: THREE.Object3D;
  /** À appeler quand la taille de l'image change. */
  resize(width: number, height: number): void;
}

export function buildFloorReflection(museum: MuseumConfig): FloorReflection {
  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  for (const r of museum.rooms) {
    minX = Math.min(minX, r.position[0] - r.size[0] / 2);
    maxX = Math.max(maxX, r.position[0] + r.size[0] / 2);
    minZ = Math.min(minZ, r.position[1] - r.size[2] / 2);
    maxZ = Math.max(maxZ, r.position[1] + r.size[2] / 2);
  }
  const reflector = new Reflector(new THREE.PlaneGeometry(maxX - minX, maxZ - minZ), { shader, textureWidth: 1024, textureHeight: 512, clipBias: 0.003 });
  reflector.rotation.x = -Math.PI / 2;
  // Juste au-dessus du sol, de la tache de soleil et des ombres portées.
  reflector.position.set((minX + maxX) / 2, 0.006, (minZ + maxZ) / 2);
  const material = reflector.material as THREE.ShaderMaterial;
  material.transparent = true;
  material.depthWrite = false;
  reflector.raycast = () => {};

  return {
    object: reflector,
    resize(width, height) {
      // Moitié de la définition de l'image : suffisant pour un reflet flou, et bien moins coûteux.
      const w = Math.max(64, Math.round(width / 2));
      const h = Math.max(64, Math.round(height / 2));
      reflector.getRenderTarget().setSize(w, h);
      material.uniforms.texel.value.set(1 / w, 1 / h);
    },
  };
}

import * as THREE from 'three';
import { Reflector } from 'three/examples/jsm/objects/Reflector.js';
import type { Decor } from './decors';
import type { MuseumConfig } from './types';

/**
 * Reflet du musée dans le sol, comme sur un béton ciré : discret vu de haut,
 * plus marqué en regardant au loin. Le musée est dessiné une seconde fois, à l'envers,
 * à chaque image : ce reflet est donc réservé au niveau de qualité le plus élevé.
 * Chaque salle a sa brillance, donnée par son décor : un sol mat reflète à peine, un sol poli beaucoup.
 *
 * Le reflet est adouci en mêlant chaque point à ses voisins. Au pied d'un mur, certains de ces voisins
 * se trouvent derrière le mur : ils montreraient ce qu'il y a de l'autre côté, d'où un liseré clair
 * dans une salle sombre. Chaque point n'est donc mêlé qu'à des voisins du sol visible de sa salle.
 */
const shader = {
  name: 'FloorReflection',
  uniforms: {
    color: { value: null },
    tDiffuse: { value: null },
    textureMatrix: { value: null },
    texel: { value: new THREE.Vector2(1 / 1024, 1 / 512) },
  },
  vertexShader: /* glsl */ `
    uniform mat4 textureMatrix;
    attribute float gloss;
    attribute vec4 area;
    varying vec4 vUv;
    varying vec3 vWorld;
    varying float vGloss;
    varying vec4 vArea;
    void main() {
      vGloss = gloss;
      vArea = area;
      vUv = textureMatrix * vec4(position, 1.0);
      vWorld = (modelMatrix * vec4(position, 1.0)).xyz;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }`,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform vec2 texel;
    varying vec4 vUv;
    varying vec3 vWorld;
    varying float vGloss;
    varying vec4 vArea;
    bool onFloor(vec2 p) {
      return p.x >= vArea.x && p.x <= vArea.y && p.y >= vArea.z && p.y <= vArea.w;
    }
    void main() {
      // Reflet légèrement flou : le sol est ciré, pas un miroir.
      vec2 uv = vUv.xy / vUv.w;
      // À quel point du sol correspond un décalage dans l'image du reflet : on le déduit de la façon
      // dont l'image et le sol varient d'un pixel de l'écran à son voisin.
      vec2 ux = dFdx(uv);
      vec2 uy = dFdy(uv);
      float det = ux.x * uy.y - ux.y * uy.x;
      bool guarded = abs(det) > 1e-14 && onFloor(vWorld.xz);
      mat2 toGround = mat2(dFdx(vWorld.xz), dFdy(vWorld.xz)) * (mat2(uy.y, -ux.y, -uy.x, ux.x) / det);
      vec3 sum = vec3(0.0);
      float count = 0.0;
      for (int i = -2; i <= 2; i++) {
        for (int j = -2; j <= 2; j++) {
          vec2 offset = vec2(float(i), float(j)) * texel * 1.6;
          // Un voisin situé derrière un mur ne compte pas.
          if (guarded && !onFloor(vWorld.xz + toGround * offset)) continue;
          sum += texture2D(tDiffuse, uv + offset).rgb;
          count += 1.0;
        }
      }
      // Plus le regard est rasant, plus le sol réfléchit.
      vec3 view = normalize(cameraPosition - vWorld);
      float grazing = pow(1.0 - clamp(view.y, 0.0, 1.0), 2.5);
      gl_FragColor = vec4(sum / max(count, 1.0), vGloss * mix(0.18, 1.0, grazing));
      #include <colorspace_fragment>
    }`,
};

const UNDER_FLOOR = new THREE.Color('#14120f');

export interface FloorReflection {
  object: THREE.Object3D;
  /** À appeler quand la taille de l'image change. */
  resize(width: number, height: number): void;
}

export function buildFloorReflection(museum: MuseumConfig, decors: Map<string, Decor>, wallThickness: number): FloorReflection {
  // Un seul miroir pour tout le musée, découpé en un rectangle par salle. Couché au sol,
  // son repère a x vers l'est et y vers le nord.
  const position: number[] = [];
  const gloss: number[] = [];
  const area: number[] = [];
  const index: number[] = [];
  const half = wallThickness / 2;
  for (const room of museum.rooms) {
    const [w, , d] = room.size;
    const [cx, cz] = room.position;
    const first = position.length / 3;
    for (const [sx, sz] of [[-1, 1], [1, 1], [1, -1], [-1, -1]]) {
      position.push(cx + (sx * w) / 2, -(cz + (sz * d) / 2), 0);
      gloss.push(decors.get(room.id)!.gloss);
      // Sol visible de la salle, entre les surfaces de ses murs : x mini, x maxi, z mini, z maxi.
      area.push(cx - w / 2 + half, cx + w / 2 - half, cz - d / 2 + half, cz + d / 2 - half);
    }
    index.push(first, first + 1, first + 2, first, first + 2, first + 3);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(position, 3));
  geometry.setAttribute('gloss', new THREE.Float32BufferAttribute(gloss, 1));
  geometry.setAttribute('area', new THREE.Float32BufferAttribute(area, 4));
  geometry.setIndex(index);
  const reflector = new Reflector(geometry, { shader, textureWidth: 1024, textureHeight: 512, clipBias: 0.003 });
  reflector.rotation.x = -Math.PI / 2;
  // Juste au-dessus du sol, de la tache de soleil et des ombres portées.
  reflector.position.y = 0.006;
  const material = reflector.material as THREE.ShaderMaterial;
  material.transparent = true;
  material.depthWrite = false;
  reflector.raycast = () => {};

  // Sous la ligne du sol, l'image du reflet ne contient rien : on y voit le fond de la scène.
  // Un fond sombre évite qu'il n'éclaircisse, même d'un pixel, le pied des murs extérieurs.
  const drawReflection = reflector.onBeforeRender;
  reflector.onBeforeRender = function (renderer, scene, ...rest) {
    const background = scene.background;
    scene.background = UNDER_FLOOR;
    drawReflection.call(this, renderer, scene, ...rest);
    scene.background = background;
  };

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

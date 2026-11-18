import * as THREE from 'three';
import { objectLight, type Decor } from './decors';
import { inside, roomRect, type WallFrame } from './layout';
import type { Quality } from './quality';
import { poolTexture } from './textures';
import type { RoomConfig } from './types';

/**
 * Rotonde : une salle ronde bâtie à l'intérieur d'une salle rectangulaire du plan.
 * Le plan, les portes et l'éclairage du bâtiment ne changent pas : on ajoute un mur courbe
 * paré de coffres de laiton, une coupole ajourée d'étoiles et un anneau au sol, et le visiteur
 * ne marche que dans le cercle. Les coins du rectangle restent cachés derrière le mur.
 */

/** Distance gardée entre le visiteur et le mur courbe. */
const MARGIN = 0.5;
/** Hauteur du socle sombre au bas du mur, puis de la paroi de coffres. */
const BASE = 0.3;
const SAFES = 3.3;
/** Côté d'une porte de coffre, en mètres. */
const SAFE_DOOR = 0.375;
const BRASS = '#b9944a';
/** Demi-largeur du pan de mur droit qui porte la porte de chambre forte, quand on entre par elle. */
const GATE_HALF = 2;
const noRaycast = () => {};
const rad = THREE.MathUtils.degToRad;

export interface RotundaShape {
  cx: number;
  cz: number;
  radius: number;
  wallHeight: number;
}

/** Mesures de la rotonde d'une salle, ou null si la salle n'en a pas. */
export function rotundaShape(room: RoomConfig): RotundaShape | null {
  if (!room.rotunda) return null;
  const [w, h, d] = room.size;
  const radius = Math.min(room.rotunda.radius ?? Infinity, Math.min(w, d) / 2 - 0.3);
  const wallHeight = Math.min(room.rotunda.wallHeight ?? Math.round(h * 6.6) / 10, h - 1);
  return { cx: room.position[0], cz: room.position[1], radius, wallHeight };
}

/**
 * Repère d'un point du mur courbe, comme celui d'un mur droit : on peut y accrocher une œuvre.
 * `angle` en degrés : 0 = nord, puis dans le sens des aiguilles d'une montre vu de dessus.
 * `inset` avance le point vers le centre de la salle.
 */
export function rotundaFrame(shape: RotundaShape, angle: number, inset = 0): WallFrame {
  const a = rad(angle);
  const r = shape.radius - inset;
  return {
    center: new THREE.Vector3(shape.cx + r * Math.sin(a), 0, shape.cz - r * Math.cos(a)),
    normal: new THREE.Vector3(-Math.sin(a), 0, Math.cos(a)),
    tangent: new THREE.Vector3(Math.cos(a), 0, Math.sin(a)),
    rotY: -a,
    length: 2,
  };
}

/** Le visiteur peut-il se tenir en ce point de la salle en rotonde ? */
export function insideRotunda(shape: RotundaShape, x: number, z: number): boolean {
  return Math.hypot(x - shape.cx, z - shape.cz) <= shape.radius - MARGIN;
}

function canvasTexture(size: number, draw: (g: CanvasRenderingContext2D, s: number) => void, quality: Quality, height = size): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = height;
  draw(canvas.getContext('2d')!, size);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.anisotropy = quality.anisotropy;
  return texture;
}

/** Paroi de coffres : quatre portes de laiton patiné par côté, chacune avec sa plaque, sa serrure et son bouton. */
function safesTexture(quality: Quality): THREE.Texture {
  return canvasTexture(
    quality.textureSize,
    (g, s) => {
      g.fillStyle = '#120d07';
      g.fillRect(0, 0, s, s);
      const cell = s / 4;
      for (let j = 0; j < 4; j++) {
        for (let i = 0; i < 4; i++) {
          const x = i * cell + cell * 0.05;
          const y = j * cell + cell * 0.05;
          const w = cell * 0.9;
          // Chaque porte a sa patine : un peu plus claire ou plus sombre que sa voisine.
          const tone = 0.86 + (((i * 7 + j * 13) % 5) / 5) * 0.28;
          const shade = (v: number) => Math.round(v * tone);
          const fill = g.createLinearGradient(x, y, x, y + w);
          fill.addColorStop(0, `rgb(${shade(126)},${shade(98)},${shade(44)})`);
          fill.addColorStop(1, `rgb(${shade(84)},${shade(63)},${shade(26)})`);
          g.fillStyle = fill;
          g.fillRect(x, y, w, w);
          // Arêtes : la lumière vient d'en haut.
          g.fillStyle = 'rgba(255,226,160,0.22)';
          g.fillRect(x, y, w, cell * 0.022);
          g.fillRect(x, y, cell * 0.018, w);
          g.fillStyle = 'rgba(0,0,0,0.42)';
          g.fillRect(x, y + w - cell * 0.03, w, cell * 0.03);
          g.fillRect(x + w - cell * 0.022, y, cell * 0.022, w);
          // Plaque du numéro, serrure et bouton.
          g.fillStyle = 'rgba(30,22,10,0.55)';
          g.fillRect(x + w * 0.3, y + w * 0.16, w * 0.4, w * 0.14);
          g.beginPath();
          g.arc(x + w * 0.3, y + w * 0.62, w * 0.055, 0, Math.PI * 2);
          g.fill();
          const knob = g.createRadialGradient(x + w * 0.68, y + w * 0.6, 1, x + w * 0.7, y + w * 0.62, w * 0.1);
          knob.addColorStop(0, '#e8c987');
          knob.addColorStop(1, '#5d4519');
          g.fillStyle = knob;
          g.beginPath();
          g.arc(x + w * 0.7, y + w * 0.62, w * 0.085, 0, Math.PI * 2);
          g.fill();
        }
      }
    },
    quality,
  );
}

/** Lambris de noyer : un panneau mouluré, bordé de chaque côté par un demi-éventail de laiton. */
function panellingTexture(quality: Quality): THREE.Texture {
  const size = quality.textureSize;
  return canvasTexture(
    size,
    (g, s) => {
      const h = s / 2;
      const wood = g.createLinearGradient(0, 0, 0, h);
      wood.addColorStop(0, '#2c1a0f');
      wood.addColorStop(1, '#43291a');
      g.fillStyle = wood;
      g.fillRect(0, 0, s, h);
      // Fil du bois.
      for (let i = 0; i < 90; i++) {
        const x = (i * 97) % s;
        g.fillStyle = i % 3 ? 'rgba(0,0,0,0.10)' : 'rgba(255,200,140,0.05)';
        g.fillRect(x, 0, 1 + (i % 2), h);
      }
      // Panneau en creux.
      g.strokeStyle = 'rgba(0,0,0,0.5)';
      g.lineWidth = s * 0.008;
      g.strokeRect(s * 0.12, h * 0.16, s * 0.76, h * 0.68);
      g.strokeStyle = 'rgba(255,205,140,0.13)';
      g.lineWidth = s * 0.003;
      g.strokeRect(s * 0.125, h * 0.17, s * 0.75, h * 0.66);
      // Éventail Art déco : des lames de laiton de hauteur croissante vers le milieu, à cheval sur le raccord.
      const blade = s * 0.011;
      for (const edge of [0, s]) {
        for (let k = -3; k <= 3; k++) {
          const top = h * (0.12 + 0.1 * Math.abs(k));
          const x = edge + k * blade * 1.5 - blade / 2;
          const brass = g.createLinearGradient(x, 0, x + blade, 0);
          brass.addColorStop(0, '#7b5d24');
          brass.addColorStop(0.5, '#e0bd72');
          brass.addColorStop(1, '#6d521f');
          g.fillStyle = brass;
          g.fillRect(x, top, blade, h * 0.9 - top);
        }
      }
    },
    quality,
    size / 2,
  );
}

/** Étoile à huit branches, tracée autour d'un point. */
function starPath(g: CanvasRenderingContext2D, x: number, y: number, r: number) {
  g.beginPath();
  for (let i = 0; i < 16; i++) {
    const d = i % 2 ? r * 0.765 : r;
    const a = (i * Math.PI) / 8;
    g[i ? 'lineTo' : 'moveTo'](x + Math.cos(a) * d, y + Math.sin(a) * d);
  }
  g.closePath();
}

/** Résille de la coupole : des étoiles ajourées, lumineuses, dans une trame sombre. */
function latticeTexture(quality: Quality): THREE.Texture {
  return canvasTexture(
    Math.min(512, quality.textureSize),
    (g, s) => {
      g.fillStyle = '#120b06';
      g.fillRect(0, 0, s, s);
      const glow = (x: number, y: number, r: number) => {
        const light = g.createRadialGradient(x, y, 0, x, y, r);
        light.addColorStop(0, '#fff3d6');
        light.addColorStop(1, '#f0b35e');
        g.fillStyle = light;
        starPath(g, x, y, r);
        g.fill();
        g.strokeStyle = '#5a431c';
        g.lineWidth = s * 0.012;
        g.stroke();
      };
      glow(s / 2, s / 2, s * 0.3);
      for (const [x, y] of [[0, 0], [s, 0], [0, s], [s, s]]) glow(x, y, s * 0.17);
      // Petits losanges entre les étoiles.
      g.fillStyle = '#e9b869';
      for (const [x, y] of [[s / 2, 0], [s / 2, s], [0, s / 2], [s, s / 2]]) {
        g.beginPath();
        g.moveTo(x, y - s * 0.06);
        g.lineTo(x + s * 0.06, y);
        g.lineTo(x, y + s * 0.06);
        g.lineTo(x - s * 0.06, y);
        g.closePath();
        g.fill();
      }
    },
    quality,
  );
}

/** Tenture rouge de la niche : plus claire au centre, comme sous un projecteur. */
function velvetTexture(quality: Quality): THREE.Texture {
  return canvasTexture(
    256,
    (g, s) => {
      const light = g.createRadialGradient(s / 2, s * 0.45, s * 0.05, s / 2, s / 2, s * 0.75);
      light.addColorStop(0, '#8a1c26');
      light.addColorStop(1, '#2a060a');
      g.fillStyle = light;
      g.fillRect(0, 0, s, s);
    },
    quality,
  );
}

let beamMaterial: THREE.Material | null = null;

/**
 * Faisceau de lumière tombant de la coupole : un cône très pâle, qui s'ajoute à l'image.
 * `from` et `to` : hauteurs du bas et du haut ; `spread` : rayon du faisceau en bas.
 */
export function lightBeam(from: number, to: number, spread: number): THREE.Mesh {
  beamMaterial ??= new THREE.MeshBasicMaterial({ color: '#ffd9a0', opacity: 0.05, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false });
  const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.05, spread, to - from, 24, 1, true), beamMaterial);
  beam.position.y = (from + to) / 2;
  beam.raycast = noRaycast;
  return beam;
}

export interface Rotunda {
  group: THREE.Group;
  shape: RotundaShape;
  /** Vrai là où le visiteur ne peut pas se tenir : hors du cercle, ou dans le battant de la porte. */
  blocked(x: number, z: number): boolean;
}

export function buildRotunda(room: RoomConfig, decor: Decor, quality: Quality, env: THREE.Texture): Rotunda {
  const shape = rotundaShape(room)!;
  const { radius: R, wallHeight: H } = shape;
  const group = new THREE.Group();
  group.position.set(shape.cx, 0, shape.cz);
  // Clarté des matières peintes : la salle est tamisée, les œuvres seules sont en pleine lumière.
  const level = objectLight(decor);
  const tint = new THREE.Color(decor.light.tint);
  const painted = (color: string, gain = 1) => new THREE.Color(color).multiplyScalar(level * gain).multiply(tint);
  const brass = new THREE.MeshStandardMaterial({ color: painted(BRASS, 1.15), metalness: 0.85, roughness: 0.36, envMap: env, envMapIntensity: 0.9 });
  const steel = new THREE.MeshStandardMaterial({ color: painted('#3b3a38'), metalness: 0.8, roughness: 0.45, envMap: env, envMapIntensity: 0.7 });

  // --- Mur courbe, vu de l'intérieur : socle, coffres, lambris -------------------
  // Si l'on entre par la porte de chambre forte, le mur s'interrompt à cet endroit, sur la largeur de son encadrement.
  const gateAngle = room.rotunda!.passage ? room.rotunda!.vaultDoor : undefined;
  const gap = gateAngle === undefined ? 0 : Math.asin(GATE_HALF / R);
  const band = (from: number, to: number, material: THREE.Material) => {
    const start = gateAngle === undefined ? 0 : Math.PI - rad(gateAngle) + gap;
    const mesh = new THREE.Mesh(new THREE.CylinderGeometry(R, R, to - from, 96, 1, true, start, Math.PI * 2 - gap * 2), material);
    mesh.position.y = (from + to) / 2;
    group.add(mesh);
    return mesh;
  };
  band(0, BASE, new THREE.MeshBasicMaterial({ color: painted('#17120d'), side: THREE.BackSide, toneMapped: false }));
  const safes = safesTexture(quality);
  const around = Math.round((2 * Math.PI * R) / (4 * SAFE_DOOR));
  safes.repeat.set(around, (SAFES - BASE) / (4 * SAFE_DOOR));
  band(BASE, SAFES, new THREE.MeshBasicMaterial({ map: safes, color: painted('#ffffff', 0.5), side: THREE.BackSide, toneMapped: false }));
  const panels = panellingTexture(quality);
  panels.repeat.set(12, 1);
  band(SAFES, H, new THREE.MeshBasicMaterial({ map: panels, color: painted('#ffffff', 0.8), side: THREE.BackSide, toneMapped: false }));
  // Filets de laiton aux raccords, et corniche à la naissance de la coupole.
  const rail = (y: number, tube: number, whole = false) => {
    // Les filets s'interrompent, comme le mur, devant la porte par laquelle on entre.
    const cut = !whole && gateAngle !== undefined;
    const ring = new THREE.Mesh(new THREE.TorusGeometry(R - tube, tube, 10, 128, cut ? Math.PI * 2 - gap * 2 : Math.PI * 2), brass);
    ring.rotation.x = Math.PI / 2;
    if (cut) ring.rotation.z = rad(gateAngle!) - Math.PI / 2 + gap;
    ring.position.y = y;
    group.add(ring);
  };
  rail(BASE, 0.02);
  rail(SAFES, 0.03);
  rail(H, 0.08, true);

  // --- Coupole ajourée ---------------------------------------------------------
  // Une calotte dont la résille est plaquée vue de dessous : les étoiles restent régulières.
  const rise = Math.min(room.size[1] - H - 0.25, R * 0.4);
  const RINGS = 20;
  const TURNS = 96;
  const TILE = 1.35;
  const position: number[] = [];
  const uv: number[] = [];
  const color: number[] = [];
  const index: number[] = [];
  for (let i = 0; i <= RINGS; i++) {
    const t = i / RINGS;
    const y = H + rise * Math.sqrt(1 - t * t);
    // Le ciel de la coupole est plus lumineux en son centre qu'à sa naissance.
    const glow = 0.16 + 0.6 * (1 - t * t) ** 1.5;
    for (let j = 0; j <= TURNS; j++) {
      const a = (j / TURNS) * Math.PI * 2;
      const x = Math.cos(a) * R * t;
      const z = Math.sin(a) * R * t;
      position.push(x, y, z);
      uv.push(x / TILE + 0.5, z / TILE + 0.5);
      color.push(glow, glow, glow);
    }
  }
  for (let i = 0; i < RINGS; i++) {
    for (let j = 0; j < TURNS; j++) {
      const p = i * (TURNS + 1) + j;
      index.push(p, p + 1, p + TURNS + 1, p + 1, p + TURNS + 2, p + TURNS + 1);
    }
  }
  const domeGeometry = new THREE.BufferGeometry();
  domeGeometry.setAttribute('position', new THREE.Float32BufferAttribute(position, 3));
  domeGeometry.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  domeGeometry.setAttribute('color', new THREE.Float32BufferAttribute(color, 3));
  domeGeometry.setIndex(index);
  const dome = new THREE.Mesh(domeGeometry, new THREE.MeshBasicMaterial({ map: latticeTexture(quality), vertexColors: true, side: THREE.DoubleSide, toneMapped: false }));
  dome.raycast = noRaycast;
  group.add(dome);

  // --- Sol : anneaux de laiton incrustés ----------------------------------------
  const inlay = new THREE.MeshBasicMaterial({ color: painted('#c9a04f', 1.2), toneMapped: false, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 });
  for (const [r, width] of [[R * 0.5, 0.05], [R - 0.32, 0.03]]) {
    const ring = new THREE.Mesh(new THREE.RingGeometry(r - width / 2, r + width / 2, 128), inlay);
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.004;
    ring.raycast = noRaycast;
    group.add(ring);
  }
  // Tache de lumière au centre, sous le sommet de la coupole.
  const pool = new THREE.Mesh(
    new THREE.PlaneGeometry(R * 1.5, R * 1.5),
    new THREE.MeshBasicMaterial({ map: poolTexture(), color: '#ffd9a0', opacity: 0.16, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }),
  );
  pool.rotation.x = -Math.PI / 2;
  pool.position.y = 0.006;
  pool.raycast = noRaycast;
  group.add(pool);

  /** Un élément plaqué sur le mur courbe : son repère a x vers la droite et z vers le centre de la salle. */
  const onWall = (angle: number, inset: number) => {
    const frame = rotundaFrame(shape, angle, inset);
    const holder = new THREE.Group();
    holder.position.set(frame.center.x - shape.cx, 0, frame.center.z - shape.cz);
    holder.rotation.y = frame.rotY;
    group.add(holder);
    return holder;
  };

  // --- Niche rouge -------------------------------------------------------------
  if (room.rotunda!.niche !== undefined) {
    const niche = onWall(room.rotunda!.niche, 0.06);
    const [w, h] = [2.3, Math.min(3.6, H - 0.9)];
    const velvet = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: velvetTexture(quality), color: painted('#ffffff', 1.5), toneMapped: false }));
    velvet.position.y = h / 2 + 0.05;
    niche.add(velvet);
    const bar = (bw: number, bh: number, x: number, y: number) => {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(bw, bh, 0.08), brass);
      mesh.position.set(x, y, 0.02);
      niche.add(mesh);
    };
    bar(0.07, h + 0.1, -w / 2, h / 2 + 0.05);
    bar(0.07, h + 0.1, w / 2, h / 2 + 0.05);
    bar(w + 0.07, 0.07, 0, h + 0.1);
    // Fronton à gradins.
    bar(w * 0.6, 0.07, 0, h + 0.2);
    bar(w * 0.3, 0.07, 0, h + 0.3);
  }

  // --- Porte de chambre forte ----------------------------------------------------
  const doorHits: { x: number; z: number }[] = [];
  if (room.rotunda!.vaultDoor !== undefined) {
    const open = gateAngle !== undefined;
    // Quand on entre par la porte, elle est portée par un pan de mur droit, tendu entre les deux bords du mur courbe.
    const setback = open ? R - Math.sqrt(R * R - GATE_HALF * GATE_HALF) : 0.05;
    const door = onWall(room.rotunda!.vaultDoor, setback);
    const RD = 1.5;
    const centreY = 1.78;
    if (open) {
      const panel = new THREE.Shape();
      panel.moveTo(-GATE_HALF, 0);
      panel.lineTo(GATE_HALF, 0);
      panel.lineTo(GATE_HALF, H);
      panel.lineTo(-GATE_HALF, H);
      panel.closePath();
      const hole = new THREE.Path();
      hole.absarc(0, centreY, RD, 0, Math.PI * 2, true);
      panel.holes.push(hole);
      const dark = new THREE.MeshBasicMaterial({ color: painted('#1c130c'), side: THREE.DoubleSide, toneMapped: false });
      door.add(new THREE.Mesh(new THREE.ShapeGeometry(panel, 48), dark));
    } else {
      // Sans passage, l'embrasure est un disque d'ombre.
      const dark = new THREE.Mesh(new THREE.CircleGeometry(RD, 64), new THREE.MeshBasicMaterial({ color: '#040302', toneMapped: false }));
      dark.position.set(0, centreY, 0);
      door.add(dark);
    }
    const hoop = (r: number, tube: number, material: THREE.Material, z: number, parent: THREE.Object3D) => {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(r, tube, 12, 72), material);
      ring.position.z = z;
      parent.add(ring);
      return ring;
    };
    hoop(RD + 0.07, 0.11, brass, 0.03, door).position.y = centreY;
    hoop(RD + 0.26, 0.07, steel, 0.02, door).position.y = centreY;
    // Le battant, ouvert vers l'intérieur : il pivote sur ses gonds, à gauche de l'embrasure.
    const hinge = new THREE.Group();
    hinge.position.set(-(RD + 0.14), centreY, 0.16);
    hinge.rotation.y = -rad(104);
    door.add(hinge);
    const leaf = new THREE.Group();
    leaf.position.x = RD + 0.14;
    hinge.add(leaf);
    const slab = new THREE.Mesh(new THREE.CylinderGeometry(RD, RD, 0.24, 72), brass);
    slab.rotation.x = Math.PI / 2;
    leaf.add(slab);
    hoop(RD, 0.07, steel, 0, leaf);
    for (const z of [0.12, -0.12]) {
      hoop(RD * 0.78, 0.03, steel, z, leaf);
      hoop(RD * 0.5, 0.025, steel, z, leaf);
    }
    // Pênes : de gros verrous cylindriques, du côté opposé aux gonds.
    for (let k = -2; k <= 2; k++) {
      const a = (k * Math.PI) / 9;
      const bolt = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.32, 20), steel);
      bolt.rotation.z = Math.PI / 2 - a;
      bolt.position.set(Math.cos(a) * (RD + 0.1), Math.sin(a) * (RD + 0.1), 0);
      leaf.add(bolt);
    }
    // Volant à huit rayons, sur la face tournée vers la salle.
    const wheel = new THREE.Group();
    wheel.position.z = -0.24;
    hoop(0.56, 0.045, brass, 0, wheel);
    for (let k = 0; k < 4; k++) {
      const spoke = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.028, 1.12, 10), brass);
      spoke.rotation.z = (k * Math.PI) / 4;
      wheel.add(spoke);
    }
    const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.17, 0.26, 24), brass);
    hub.rotation.x = Math.PI / 2;
    hub.position.z = 0.06;
    wheel.add(hub);
    leaf.add(wheel);
    for (const y of [-0.8, 0.8]) {
      const knuckle = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.42, 16), steel);
      knuckle.position.set(0, y, 0);
      hinge.add(knuckle);
    }
    // Le visiteur contourne le battant.
    group.updateMatrixWorld(true);
    for (const along of [0.35, 1.1, 1.85, 2.6, 3.2]) {
      const p = hinge.localToWorld(new THREE.Vector3(along, 0, 0));
      doorHits.push({ x: p.x, z: p.z });
    }
  }

  const rect = roomRect(room);
  // Couloir de marche à travers la porte, du mur de la salle jusque dans le cercle.
  const gate = gateAngle === undefined ? null : rotundaFrame(shape, gateAngle);
  const inGate = (x: number, z: number) => {
    if (!gate) return false;
    const dx = x - gate.center.x;
    const dz = z - gate.center.z;
    const across = dx * gate.tangent.x + dz * gate.tangent.z;
    const inward = dx * gate.normal.x + dz * gate.normal.z;
    return Math.abs(across) < 0.8 && inward > -1.5 && inward < 1.4;
  };
  return {
    group,
    shape,
    blocked: (x, z) => inside(rect, x, z) && ((!insideRotunda(shape, x, z) && !inGate(x, z)) || doorHits.some((p) => Math.hypot(x - p.x, z - p.z) < 0.62)),
  };
}

/**
 * Niche de laiton autour d'une œuvre accrochée au mur courbe (un billet dans son coffre ouvert).
 * `holder` : le repère du mur ; `width` et `height` : dimensions de l'œuvre ; `y` : hauteur de son centre.
 */
export function wallNiche(holder: THREE.Group, width: number, height: number, y: number, decor: Decor, env: THREE.Texture) {
  const level = objectLight(decor);
  const tint = new THREE.Color(decor.light.tint);
  const brass = new THREE.MeshStandardMaterial({ color: new THREE.Color(BRASS).multiplyScalar(level * 1.25).multiply(tint), metalness: 0.85, roughness: 0.34, envMap: env, envMapIntensity: 1 });
  const pad = 0.04;
  const depth = 0.16;
  const [w, h] = [width + pad * 2, height + pad * 2];
  const back = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: '#0a0806', toneMapped: false }));
  back.position.set(0, y, -0.004);
  back.raycast = noRaycast;
  holder.add(back);
  const side = (bw: number, bh: number, x: number, dy: number) => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(bw, bh, depth), brass);
    mesh.position.set(x, y + dy, depth / 2 - 0.05);
    holder.add(mesh);
  };
  const t = 0.022;
  side(w + t * 2, t, 0, h / 2 + t / 2);
  side(w + t * 2, t, 0, -h / 2 - t / 2);
  side(t, h, -w / 2 - t / 2, 0);
  side(t, h, w / 2 + t / 2, 0);
}

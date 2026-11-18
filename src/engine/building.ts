import * as THREE from 'three';
import { coveOf, objectLight, type Decor } from './decors';
import { WALLS, wallFrame, type Layout, type WallFrame } from './layout';
import { MAX_LIGHT, colorAt, doorSpill, roomLight, skylightOpening, sunPatch, type RoomLight } from './lighting';
import type { Quality } from './quality';
import type { Style } from './styles';
import {
  FLOOR_TILE,
  CEDAR_TILE,
  WALL_TILE,
  ZELLIGE_TILE,
  cedarTexture,
  chevronTexture,
  concreteTexture,
  limewashTexture,
  parquetTexture,
  plasterTexture,
  skyTexture,
  stoneTexture,
  sunPatchTexture,
  zelligeTexture,
} from './textures';

/** Zellige des murs : croix blanches, étoiles bleues, vertes et miel. Au sol : un damier plus sobre. */
const WALL_ZELLIGE = ['#f1ead9', '#1f4f8a', '#1f6b55', '#c8902f', '#1f4f8a'];
const FLOOR_ZELLIGE = ['#efe8da', '#e2d8c3', '#d9ceb7', '#e2d8c3', '#d9ceb7'];
const FLOOR_ACCENT = '#1f6b55';

/**
 * Profil d'un arc outrepassé inscrit dans une ouverture de `width` sur `height` :
 * rayon du cercle, hauteur de son centre, et demi-largeur du passage entre les piédroits.
 */
export function horseshoe(width: number, height: number): { radius: number; centerY: number; halfClear: number; springY: number } {
  const radius = Math.min(width / 2 - 0.02, height * 0.42);
  const centerY = height - 0.02 - radius;
  return { radius, centerY, halfClear: radius * Math.cos(Math.PI / 6), springY: centerY - radius / 2 };
}
import type { Baseboard, MuseumConfig, RoomConfig, WallId } from './types';

/**
 * Le bâtiment nu : sols, plafonds, murs épais et passages de portes.
 * Chaque mur expose un repère (`holder`) où accrocher les œuvres :
 * x = décalage le long du mur, y = hauteur, z = vers la salle.
 *
 * L'éclairage est calculé ici, une fois, et inscrit dans la couleur de chaque sommet
 * (voir lighting.ts). Les matériaux du bâtiment ne dépendent donc d'aucune lampe.
 *
 * Chaque salle est bâtie selon son décor (voir decors.ts) : revêtement et couleur du sol,
 * finition des murs, plafond, bas de mur. Les passages entre deux salles gardent
 * les couleurs du style du musée : ils appartiennent au bâtiment, pas à une salle.
 */
export interface Building {
  group: THREE.Group;
  /** Matière de zellige, pour le mobilier paré de carreaux. */
  zellige(): THREE.Material;
  wall(roomId: string, wall: WallId): { holder: THREE.Group; frame: WallFrame };
  light(roomId: string): RoomLight;
}

const SKYLIGHT_WELL = 0.7;
const noRaycast = () => {};

/** Positions des sommets le long d'une longueur : serrées près des bords, où la lumière varie vite. */
function knots(length: number): number[] {
  const out: number[] = [];
  if (length <= 1.8) {
    const n = Math.max(1, Math.ceil(length / 0.45));
    for (let i = 0; i <= n; i++) out.push((length * i) / n);
  } else {
    const edge = [0, 0.12, 0.35, 0.8];
    const inner = Math.ceil((length - 1.6) / 0.8);
    out.push(...edge);
    for (let i = 1; i < inner; i++) out.push(0.8 + ((length - 1.6) * i) / inner);
    out.push(...edge.map((e) => length - e).reverse());
  }
  return out.map((v) => v - length / 2);
}

/**
 * Rectangle quadrillé dans le plan XY, tourné vers +Z, prêt à recevoir une couleur par sommet.
 * Par défaut la texture couvre le rectangle une fois. Avec `metric`, elle garde sa taille réelle :
 * `tile` mètres par répétition, comptés depuis le point (`u0`, `v0`) où se trouve le centre du rectangle.
 */
function gridGeometry(width: number, height: number, metric?: { u0: number; v0: number; tile: number }, rows?: number[]): THREE.BufferGeometry {
  const xs = knots(width);
  // `rows` impose les hauteurs des rangées de sommets, quand un pan doit se raccorder à son voisin.
  const ys = rows ?? knots(height);
  const position: number[] = [];
  const uv: number[] = [];
  const index: number[] = [];
  for (const y of ys) {
    for (const x of xs) {
      position.push(x, y, 0);
      if (metric) uv.push((x + metric.u0) / metric.tile, (y + metric.v0) / metric.tile);
      else uv.push(x / width + 0.5, y / height + 0.5);
    }
  }
  const cols = xs.length;
  for (let j = 0; j < ys.length - 1; j++) {
    for (let i = 0; i < cols - 1; i++) {
      const p = j * cols + i;
      index.push(p, p + 1, p + cols, p + 1, p + cols + 1, p + cols);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(position, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(new Float32Array(position.length).fill(1), 3));
  geo.setIndex(index);
  geo.computeVertexNormals();
  return geo;
}

/** Matériau du bâtiment : sa couleur est multipliée par la lumière inscrite dans les sommets. */
function litMaterial(color: string, map?: THREE.Texture): THREE.MeshBasicMaterial {
  const material = new THREE.MeshBasicMaterial({ color, vertexColors: true, toneMapped: false });
  if (map) material.map = map;
  return material;
}

const point = new THREE.Vector3();
const normal = new THREE.Vector3();
const shade: [number, number, number] = [0, 0, 0];

/** Inscrit dans les sommets d'une surface la lumière qu'elle reçoit (moyenne des salles données). */
function bake(mesh: THREE.Mesh, lights: RoomLight[]) {
  mesh.updateWorldMatrix(true, false);
  const pos = mesh.geometry.attributes.position;
  const color = mesh.geometry.attributes.color;
  normal.set(0, 0, 1).transformDirection(mesh.matrixWorld);
  for (let i = 0; i < pos.count; i++) {
    point.fromBufferAttribute(pos, i).applyMatrix4(mesh.matrixWorld);
    let r = 0;
    let g = 0;
    let b = 0;
    for (const light of lights) {
      colorAt(light, point, normal, shade);
      r += shade[0];
      g += shade[1];
      b += shade[2];
    }
    color.setXYZ(i, r / lights.length, g / lights.length, b / lights.length);
  }
  color.needsUpdate = true;
}

export function buildBuilding(museum: MuseumConfig, layout: Layout, style: Style, quality: Quality, decors: Map<string, Decor>): Building {
  const group = new THREE.Group();
  const { palette } = style;
  const half = layout.wallThickness / 2;
  const walls = new Map<string, { holder: THREE.Group; frame: WallFrame }>();
  const lights = new Map(museum.rooms.map((r) => [r.id, roomLight(r, layout.wallThickness, decors.get(r.id)!)]));
  /** Surfaces à éclairer une fois tout le bâtiment assemblé. */
  const pending: { mesh: THREE.Mesh; lights: RoomLight[] }[] = [];
  const lit = (mesh: THREE.Mesh, ...roomLights: RoomLight[]) => {
    pending.push({ mesh, lights: roomLights });
    return mesh;
  };

  // Matériaux partagés entre les salles de même décor : une texture ou une couleur ne se fabrique qu'une fois.
  const cache = new Map<string, unknown>();
  const once = <T>(key: string, make: () => T): T => {
    if (!cache.has(key)) cache.set(key, make());
    return cache.get(key) as T;
  };
  const floorTexture = (decor: Decor) =>
    once(`sol:${decor.floor}:${decor.colors.floor}`, () =>
      decor.floor === 'zellige'
        ? zelligeTexture([decor.colors.floor, ...FLOOR_ZELLIGE.slice(1)], quality, FLOOR_ACCENT)
        : { concrete: concreteTexture, parquet: parquetTexture, chevron: chevronTexture, stone: stoneTexture }[decor.floor](decor.colors.floor, quality),
    );
  /** Revêtements plaqués sur les murs : ils passent toujours devant, même dans le reflet du sol. */
  const cladding = (key: string, map: () => THREE.Texture) =>
    once(`habillage:${key}`, () => {
      const material = litMaterial('#ffffff', map());
      material.polygonOffset = true;
      material.polygonOffsetFactor = -1;
      material.polygonOffsetUnits = -1;
      return material;
    });
  const ceilingMaterial = (decor: Decor) =>
    once(`plafond:${decor.cedar}:${decor.colors.ceiling}`, () =>
      decor.cedar ? litMaterial('#ffffff', cedarTexture(decor.colors.ceiling, quality)) : litMaterial(decor.colors.ceiling),
    );
  const wallMaterial = (decor: Decor) =>
    once(`mur:${decor.walls}:${decor.colors.wall}`, () => litMaterial(decor.colors.wall, decor.walls === 'limewash' ? limewashTexture(quality) : undefined));
  /** Matière sombre et mate, dont la teinte ne dépend d'aucune lampe : elle ne brille jamais, même dans une salle obscure. */
  const matte = (color: string, light = 1) =>
    once(`mat:${color}:${light}`, () => new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(0.8 * light), toneMapped: false }));
  const trimMat = new THREE.MeshStandardMaterial({ color: palette.trim, roughness: 0.6 });
  const revealMat = litMaterial(palette.wall);
  const soleMat = new THREE.MeshBasicMaterial({ color: '#14120f', toneMapped: false });

  for (const room of museum.rooms) {
    const [w, h, d] = room.size;
    const [cx, cz] = room.position;
    const light = lights.get(room.id)!;
    const decor = decors.get(room.id)!;

    // Le sol va jusqu'à la limite de la salle : sous une porte, il rejoint celui de la salle voisine.
    const tile = FLOOR_TILE[decor.floor];
    const tex = floorTexture(decor).clone();
    tex.repeat.set(w / tile, d / tile);
    const floor = lit(new THREE.Mesh(gridGeometry(w, d), litMaterial('#ffffff', tex)), light);
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(cx, 0, cz);
    floor.userData.floor = true;
    floor.userData.lumiere = room.id;
    group.add(floor);
    buildCeiling(room, decor);
    buildSunPatch(room);

    const wallMat = wallMaterial(decor);
    const baseMat = matte(decor.colors.trim, objectLight(decor));
    /** Hauteurs des rangées de sommets d'un mur de la salle, du sol au plafond. */
    const wallRows = knots(h).map((v) => v + h / 2);
    for (const wall of WALLS) {
      // Surface visible du mur : en retrait d'une demi-épaisseur par rapport à la limite de la salle.
      const frame = wallFrame(room, wall, half);
      const holder = new THREE.Group();
      holder.position.copy(frame.center);
      holder.rotation.y = frame.rotY;
      group.add(holder);
      walls.set(`${room.id}:${wall}`, { holder, frame });

      let cursor = -frame.length / 2;
      /**
       * Pan de mur plein, centré en (x, y) dans le repère du mur. Sa texture garde sa taille réelle
       * d'un pan à l'autre, et ses rangées de sommets sont celles du mur entier : la lumière d'un
       * linteau se raccorde ainsi exactement à celle des pans qui l'encadrent.
       */
      const face = (width: number, height: number, x: number, y: number) => {
        const bottom = y - height / 2;
        const rows = [bottom, ...wallRows.filter((row) => row > bottom + 0.02)].map((row) => row - y);
        const mesh = lit(new THREE.Mesh(gridGeometry(width, height, { u0: x, v0: y, tile: WALL_TILE }, rows), wallMat), light);
        mesh.position.set(x, y, 0);
        mesh.userData.lumiere = room.id;
        holder.add(mesh);
      };
      const solid = (from: number, to: number) => {
        if (to - from < 0.01) return;
        face(to - from, h, (from + to) / 2, h / 2);
        const base = baseboard(to - from, decor.baseboard, baseMat);
        if (base) {
          base.position.x = (from + to) / 2;
          holder.add(base);
        }
        const mid = (from + to) / 2;
        /** Bande de revêtement plaquée sur le pan, entre deux hauteurs. */
        const band = (material: THREE.Material, bottom: number, top: number, tile: number) => {
          // Le motif part du bas de la bande : un registre entier n'est jamais coupé.
          const mesh = lit(new THREE.Mesh(gridGeometry(to - from, top - bottom, { u0: mid, v0: (top - bottom) / 2, tile }), material), light);
          mesh.position.set(mid, (bottom + top) / 2, 0.003);
          mesh.raycast = noRaycast;
          mesh.userData.lumiere = room.id;
          holder.add(mesh);
        };
        const edge = (y: number) => {
          const strip = new THREE.Mesh(new THREE.BoxGeometry(to - from, 0.05, 0.012), baseMat);
          strip.position.set(mid, y, 0.006);
          strip.raycast = noRaycast;
          holder.add(strip);
        };
        if (decor.dado > 0) {
          band(cladding('zellige', () => zelligeTexture(WALL_ZELLIGE, quality)), 0, Math.min(decor.dado, h), ZELLIGE_TILE);
          edge(Math.min(decor.dado, h) + 0.025);
        }
        if (decor.frieze > 0 && h - decor.frieze > decor.dado + 0.5) {
          band(cladding('platre', () => plasterTexture(quality)), h - decor.frieze, h, decor.frieze);
          edge(h - decor.frieze - 0.025);
        }
        // Semelle sombre dans l'épaisseur du mur, au ras du sol. On ne la voit jamais directement :
        // elle empêche le reflet du sol de laisser filtrer, au pied du mur, la clarté de la salle voisine.
        const start = from <= -frame.length / 2 + 0.01 ? from - half : from;
        const end = to >= frame.length / 2 - 0.01 ? to + half : to;
        const sole = new THREE.Mesh(new THREE.PlaneGeometry(end - start, half), soleMat);
        sole.rotation.x = Math.PI / 2;
        sole.position.set((start + end) / 2, 0.02, -half / 2);
        sole.raycast = noRaycast;
        holder.add(sole);
      };
      for (const gap of layout.openings(room.id, wall)) {
        solid(cursor, gap.offset - gap.width / 2);
        cursor = gap.offset + gap.width / 2;
        if (h - gap.height > 0.01) face(gap.width, h - gap.height, gap.offset, (h + gap.height) / 2);
      }
      solid(cursor, frame.length / 2);
    }
  }

  // Traversée des murs : les deux tableaux de la porte, son dessous de linteau, et l'encadrement éventuel.
  for (const passage of layout.passages) {
    const t = layout.wallThickness;
    // L'embrasure est éclairée par les deux salles, avant que l'une ne reçoive la lumière de l'autre.
    const both = passage.rooms.map((r) => ({ ...lights.get(r.id)!, extra: [...lights.get(r.id)!.extra] }));
    const portal = new THREE.Group();
    portal.position.copy(passage.center);
    portal.rotation.y = passage.rotY;
    group.add(portal);
    for (const side of [-1, 1]) {
      const jamb = lit(new THREE.Mesh(gridGeometry(t, passage.height), revealMat), ...both);
      jamb.position.set((side * passage.width) / 2, passage.height / 2, 0);
      jamb.rotation.y = (-side * Math.PI) / 2;
      portal.add(jamb);
    }
    const soffit = lit(new THREE.Mesh(gridGeometry(passage.width, t), revealMat), ...both);
    soffit.position.y = passage.height - 0.002;
    soffit.rotation.x = Math.PI / 2;
    portal.add(soffit);

    if (style.doorCasing) {
      const depth = t + 0.04;
      for (const side of [-1, 1]) {
        const post = new THREE.Mesh(new THREE.BoxGeometry(0.12, passage.height, depth), trimMat);
        post.position.set(side * (passage.width / 2 - 0.06), passage.height / 2, 0);
        portal.add(post);
      }
      const top = new THREE.Mesh(new THREE.BoxGeometry(passage.width, 0.12, depth), trimMat);
      top.position.y = passage.height - 0.06;
      portal.add(top);
    }

    if (passage.door.arch === 'horseshoe') {
      // Arc outrepassé : l'ouverture rectangulaire est refermée par un mur découpé en fer à cheval.
      const { width: w, height: ph } = passage;
      const { radius, centerY, halfClear, springY } = horseshoe(w, ph);
      const outline = new THREE.Shape();
      outline.moveTo(-w / 2, 0);
      outline.lineTo(-w / 2, ph);
      outline.lineTo(w / 2, ph);
      outline.lineTo(w / 2, 0);
      outline.lineTo(halfClear, 0);
      outline.lineTo(halfClear, springY);
      outline.absarc(0, centerY, radius, -Math.PI / 6, (Math.PI * 7) / 6, false);
      outline.lineTo(-halfClear, 0);
      outline.closePath();
      passage.rooms.forEach((room, i) => {
        // Chaque face de l'arc a la matière et la lumière des murs de sa salle.
        const geometry = new THREE.ShapeGeometry(outline, 24);
        const sideDecor = decors.get(room.id)!;
        // Dans une salle à frise de plâtre, l'arc est encadré du même plâtre sculpté.
        const carved = sideDecor.frieze > 0;
        const tile = carved ? sideDecor.frieze : WALL_TILE;
        const uv = geometry.attributes.uv;
        for (let k = 0; k < uv.count; k++) uv.setXY(k, uv.getX(k) / tile, uv.getY(k) / tile);
        geometry.setAttribute('color', new THREE.Float32BufferAttribute(new Float32Array(uv.count * 3).fill(1), 3));
        const face = lit(new THREE.Mesh(geometry, carved ? cladding('platre', () => plasterTexture(quality)) : wallMaterial(sideDecor)), lights.get(room.id)!);
        // La salle où la porte est déclarée se trouve du côté des z positifs du passage.
        face.position.z = i === 0 ? half + 0.002 : -half - 0.002;
        if (i === 1) face.rotation.y = Math.PI;
        portal.add(face);
      });
      // L'intrados : l'épaisseur du mur, visible sous l'arc.
      const through = new THREE.ExtrudeGeometry(outline, { depth: t, bevelEnabled: false, curveSegments: 24 });
      through.translate(0, 0, -half);
      const hidden = new THREE.MeshBasicMaterial({ visible: false });
      const intrados = new THREE.MeshBasicMaterial({ color: new THREE.Color(palette.wall).multiplyScalar(0.86), toneMapped: false });
      portal.add(new THREE.Mesh(through, [hidden, intrados]));
    }

    // Deux sols différents se rejoignent sous la porte : une barre de seuil couvre leur jonction.
    const [a, b] = passage.rooms.map((r) => decors.get(r.id)!);
    if (a.floor !== b.floor || a.colors.floor !== b.colors.floor) {
      const sill = new THREE.Mesh(new THREE.BoxGeometry(passage.width, 0.006, 0.07), matte(palette.trim));
      sill.position.y = 0.003;
      portal.add(sill);
    }
  }

  // Une salle sombre reçoit, par chaque porte, la lumière de sa voisine plus claire.
  for (const passage of layout.passages) {
    const [a, b] = passage.rooms.map((r) => lights.get(r.id)!);
    const { center, tangent, normal: toA, width, height } = passage;
    // La « fenêtre » est au nu du mur de la salle claire : le seuil lui-même est ainsi éclairé.
    const intoA = doorSpill(a, b, center.clone().addScaledVector(toA, -half), tangent, width, height);
    const intoB = doorSpill(b, a, center.clone().addScaledVector(toA, half), tangent, width, height);
    if (intoA) a.extra.push(intoA);
    if (intoB) b.extra.push(intoB);
  }

  function buildCeiling(room: RoomConfig, decor: Decor) {
    const [w, h, d] = room.size;
    const light = lights.get(room.id)!;
    const ceilingMat = ceilingMaterial(decor);
    const ceiling = new THREE.Group();
    ceiling.position.set(room.position[0], h, room.position[1]);
    group.add(ceiling);
    /**
     * Panneau horizontal tourné vers le bas, centré en (x, z) dans le repère de la salle, à la hauteur `y`
     * comptée depuis le plafond. Il reçoit l'éclairage de la salle, sauf s'il est lui-même lumineux (`glow`).
     */
    const panel = (width: number, depth: number, x: number, z: number, y = 0, glow?: THREE.Material) => {
      // Un plafond à motif garde sa taille réelle d'un panneau à l'autre.
      const metric = decor.cedar ? { u0: x, v0: z, tile: CEDAR_TILE } : undefined;
      const m = glow ? new THREE.Mesh(new THREE.PlaneGeometry(width, depth), glow) : lit(new THREE.Mesh(gridGeometry(width, depth, metric), ceilingMat), light);
      m.rotation.x = Math.PI / 2;
      m.position.set(x, y, z);
      // Surfaces de la salle pour la lumière précalculée (voir lumiere.ts) ; la gorge, elle, rayonne.
      if (glow) m.userData.gorge = room.id;
      else m.userData.lumiere = room.id;
      ceiling.add(m);
    };

    const cove = coveOf(room, decor);
    const sky = skylightOpening(room);
    if (cove && !sky) {
      // Plafond flottant : un panneau abaissé, et tout autour le fond de gorge, en pleine lumière.
      const edge = half + cove.inset;
      panel(w - edge * 2, d - edge * 2, 0, 0, -cove.drop);
      // Le fond de gorge prolonge le haut des murs : même teinte, poussée à la pleine lumière.
      const glow = once(`gorge:${decor.colors.wall}:${decor.light.tint}`, () => {
        const color = new THREE.Color(decor.colors.wall).multiplyScalar(MAX_LIGHT).multiply(new THREE.Color(decor.light.tint));
        return new THREE.MeshBasicMaterial({ color, toneMapped: false });
      });
      panel(w, edge, 0, -(d - edge) / 2, 0, glow);
      panel(w, edge, 0, (d - edge) / 2, 0, glow);
      panel(edge, d - edge * 2, -(w - edge) / 2, 0, 0, glow);
      panel(edge, d - edge * 2, (w - edge) / 2, 0, 0, glow);
      return;
    }
    if (!sky) return panel(w, d, 0, 0);

    // Verrière : le plafond devient un cadre, percé d'un puits de lumière fermé par un vitrage.
    const { width: ow, depth: od, margin } = sky;
    panel(w, margin, 0, -(d - margin) / 2);
    panel(w, margin, 0, (d - margin) / 2);
    panel(margin, od, -(w - margin) / 2, 0);
    panel(margin, od, (w - margin) / 2, 0);

    // Les parois du puits reçoivent le ciel de plein fouet : elles sont à pleine lumière.
    const wellMat = new THREE.MeshBasicMaterial({ color: decor.colors.ceiling, toneMapped: false });
    for (const [length, x, z, rotY] of [
      [ow, 0, -od / 2, 0],
      [ow, 0, od / 2, Math.PI],
      [od, ow / 2, 0, -Math.PI / 2],
      [od, -ow / 2, 0, Math.PI / 2],
    ]) {
      const side = new THREE.Mesh(new THREE.PlaneGeometry(length, SKYLIGHT_WELL), wellMat);
      side.position.set(x, SKYLIGHT_WELL / 2, z);
      side.rotation.y = rotY;
      ceiling.add(side);
    }
    const glass = new THREE.Mesh(new THREE.PlaneGeometry(ow, od), new THREE.MeshBasicMaterial({ map: skyTexture(), toneMapped: false }));
    glass.rotation.x = Math.PI / 2;
    glass.position.y = SKYLIGHT_WELL;
    ceiling.add(glass);

    // Fines traverses du vitrage, espacées d'environ un mètre et demi.
    const [cols, rows] = skylightBars(ow, od);
    const bars = (span: number, across: number, count: number, alongX: boolean) => {
      for (let i = 1; i < count; i++) {
        const at = -span / 2 + (span * i) / count;
        const bar = new THREE.Mesh(new THREE.BoxGeometry(alongX ? 0.04 : across, 0.06, alongX ? across : 0.04), trimMat);
        bar.position.set(alongX ? at : 0, SKYLIGHT_WELL - 0.03, alongX ? 0 : at);
        ceiling.add(bar);
      }
    };
    bars(ow, od, cols, true);
    bars(od, ow, rows, false);
  }

  /** Tache de soleil au sol sous une verrière, quadrillée par l'ombre des traverses. */
  function buildSunPatch(room: RoomConfig) {
    const patch = sunPatch(room);
    if (!patch) return;
    const [cols, rows] = skylightBars(patch.width, patch.depth);
    const mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(patch.width * 1.12, patch.depth * 1.12),
      new THREE.MeshBasicMaterial({
        map: sunPatchTexture(cols, rows),
        color: '#fff0d6',
        opacity: 0.22,
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        toneMapped: false,
      }),
    );
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.copy(patch.center).setY(0.004);
    mesh.raycast = noRaycast;
    group.add(mesh);
  }

  for (const { mesh, lights: roomLights } of pending) bake(mesh, roomLights);
  // Tout ce qui précède appartient au bâtiment ; les œuvres et le mobilier viendront s'y ajouter.
  group.traverse((o) => {
    if ((o as THREE.Mesh).isMesh) o.userData.building = true;
  });

  return {
    group,
    zellige: () => once('zellige:mobilier', () => new THREE.MeshBasicMaterial({ map: zelligeTexture(WALL_ZELLIGE, quality), toneMapped: false })),
    wall: (roomId, wall) => walls.get(`${roomId}:${wall}`)!,
    light: (roomId) => lights.get(roomId)!,
  };
}

/** Nombre de carreaux de vitrage dans chaque direction. */
function skylightBars(width: number, depth: number): [number, number] {
  return [Math.max(1, Math.round(width / 1.5)), Math.max(1, Math.round(depth / 1.5))];
}

/** Bas de mur, dans le repère du mur. */
function baseboard(length: number, kind: Baseboard, mat: THREE.Material): THREE.Mesh | null {
  if (kind === 'skirting') {
    const m = new THREE.Mesh(new THREE.BoxGeometry(length, 0.08, 0.02), mat);
    m.position.set(0, 0.04, 0.01);
    return m;
  }
  if (kind === 'shadow-gap') {
    // Joint creux : une fine bande sombre au ras du sol, comme si le mur flottait.
    const m = new THREE.Mesh(new THREE.BoxGeometry(length, 0.018, 0.004), mat);
    m.position.set(0, 0.009, 0.002);
    return m;
  }
  return null;
}

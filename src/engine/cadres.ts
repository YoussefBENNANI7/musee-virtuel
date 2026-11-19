import * as THREE from 'three';
import type { DecorFrames, PaintingConfig } from './types';

/*
 * Cadres en relief. Un cadre est une moulure : une coupe (son profil, vu en tranche) promenée autour
 * de l'œuvre, avec des angles coupés d'onglet comme chez l'encadreur. La lumière accroche alors les
 * creux et les arrondis, et l'œuvre est en retrait, au fond de la feuillure, comme dans un vrai cadre.
 *
 * Tout est en mètres. Dans une coupe, `u` est la distance au bord de l'œuvre (0 contre l'œuvre,
 * puis vers l'extérieur) et `z` la hauteur au-dessus du mur.
 */

/** Point d'une coupe de moulure : [u, z]. */
export type SectionPoint = [number, number];

/** Trace une coupe de moulure : des droites et des courbes, d'un point au suivant. */
export class Section {
  readonly points: SectionPoint[];
  constructor(u: number, z: number) {
    this.points = [[u, z]];
  }
  /** Droite jusqu'à (u, z). */
  to(u: number, z: number): this {
    this.points.push([u, z]);
    return this;
  }
  /** Courbe jusqu'à (u, z), tirée vers le point (cu, cz) : un arrondi, une gorge, une doucine. */
  curve(cu: number, cz: number, u: number, z: number, steps = 7): this {
    const [u0, z0] = this.points[this.points.length - 1];
    for (let i = 1; i <= steps; i++) {
      const t = i / steps;
      const a = (1 - t) * (1 - t);
      const b = 2 * (1 - t) * t;
      const c = t * t;
      this.points.push([a * u0 + b * cu + c * u, a * z0 + b * cz + c * z]);
    }
    return this;
  }
}

/** Au-delà de cet angle entre deux pans d'une coupe, l'arête est vive ; en deçà, la surface est lisse. */
const CREASE = Math.cos(THREE.MathUtils.degToRad(32));

/**
 * Part du ciel que voit chaque point d'une coupe, de 0 (au fond d'un creux) à 1 (bien dégagé).
 * Elle sert à assombrir les creux de la moulure, où la lumière entre moins et où la patine se dépose.
 */
export function sectionOpenness(points: SectionPoint[], reach = 0.035): number[] {
  const n = points.length;
  const normals = segmentNormals(points);
  const hit = (ou: number, oz: number, du: number, dz: number) => {
    // Le mur arrête le regard, comme le reste de la moulure.
    if (dz < 0 && oz / -dz < reach) return true;
    for (let k = 0; k < n - 1; k++) {
      const [au, az] = points[k];
      const [bu, bz] = points[k + 1];
      const su = bu - au;
      const sz = bz - az;
      const det = du * sz - dz * su;
      if (Math.abs(det) < 1e-12) continue;
      const t = ((au - ou) * sz - (az - oz) * su) / det;
      const s = ((au - ou) * dz - (az - oz) * du) / det;
      if (t > 1e-5 && t < reach && s >= 0 && s <= 1) return true;
    }
    return false;
  };
  return points.map(([u, z], j) => {
    const a = normals[Math.max(0, j - 1)];
    const b = normals[Math.min(n - 2, j)];
    let nu = a[0] + b[0];
    let nz = a[1] + b[1];
    const len = Math.hypot(nu, nz) || 1;
    nu /= len;
    nz /= len;
    const [ou, oz] = [u + nu * 2e-4, z + nz * 2e-4];
    const RAYS = 15;
    let open = 0;
    for (let r = 0; r < RAYS; r++) {
      const angle = (-80 + (160 * r) / (RAYS - 1)) * (Math.PI / 180);
      const du = nu * Math.cos(angle) - nz * Math.sin(angle);
      const dz = nu * Math.sin(angle) + nz * Math.cos(angle);
      // Pondéré par le cosinus : ce qui est en face compte plus que ce qui est rasant.
      if (!hit(ou, oz, du, dz)) open += Math.cos(angle);
    }
    let total = 0;
    for (let r = 0; r < RAYS; r++) total += Math.cos((-80 + (160 * r) / (RAYS - 1)) * (Math.PI / 180));
    return open / total;
  });
}

/** Normale de chaque pan d'une coupe, dans son plan : du côté visible. */
function segmentNormals(points: SectionPoint[]): SectionPoint[] {
  const normals: SectionPoint[] = [];
  for (let j = 0; j < points.length - 1; j++) {
    const du = points[j + 1][0] - points[j][0];
    const dz = points[j + 1][1] - points[j][1];
    const len = Math.hypot(du, dz) || 1;
    normals.push([-dz / len, du / len]);
  }
  return normals;
}

/**
 * Moulure autour d'une ouverture de `width` × `height` : la coupe est promenée sur les quatre côtés,
 * coupés d'onglet. `shade` donne la clarté de chaque point de la coupe (voir `sectionOpenness`),
 * au besoin côté par côté (0 : bas, 1 : droite, 2 : haut, 3 : gauche).
 */
export function mouldingGeometry(
  width: number,
  height: number,
  points: SectionPoint[],
  shade?: number[] | ((side: number, point: number) => number),
  /** Teinte des creux : la clarté 0 donne cette couleur, la clarté 1 laisse la matière telle quelle. */
  deep: [number, number, number] = [0, 0, 0],
): THREE.BufferGeometry {
  const normals = segmentNormals(points);
  const smooth = points.map((_, j) => {
    if (j === 0 || j === points.length - 1) return null;
    const [a, b] = [normals[j - 1], normals[j]];
    if (a[0] * b[0] + a[1] * b[1] < CREASE) return null;
    const len = Math.hypot(a[0] + b[0], a[1] + b[1]) || 1;
    return [(a[0] + b[0]) / len, (a[1] + b[1]) / len] as SectionPoint;
  });
  const arc = [0];
  for (let j = 1; j < points.length; j++) arc.push(arc[j - 1] + Math.hypot(points[j][0] - points[j - 1][0], points[j][1] - points[j - 1][1]));

  // Les quatre côtés, dans le sens inverse des aiguilles d'une montre vus de face : bas, droite, haut, gauche.
  const [w, h] = [width / 2, height / 2];
  const sides = [
    { from: [-w, -h], to: [w, -h], out: [0, -1] },
    { from: [w, -h], to: [w, h], out: [1, 0] },
    { from: [w, h], to: [-w, h], out: [0, 1] },
    { from: [-w, h], to: [-w, -h], out: [-1, 0] },
  ];
  const position: number[] = [];
  const normal: number[] = [];
  const uv: number[] = [];
  const color: number[] = [];
  const index: number[] = [];
  sides.forEach((side, k) => {
    const before = sides[(k + 3) % 4].out;
    const after = sides[(k + 1) % 4].out;
    const along = [side.to[0] - side.from[0], side.to[1] - side.from[1]];
    const length = Math.hypot(along[0], along[1]);
    const dir = [along[0] / length, along[1] / length];
    for (let j = 0; j < points.length - 1; j++) {
      const base = position.length / 3;
      for (const end of [j, j + 1]) {
        const [u, z] = points[end];
        const n = smooth[end] ?? normals[j];
        const tone = typeof shade === 'function' ? shade(k, end) : (shade?.[end] ?? 1);
        // À chaque bout, l'onglet : la moulure s'écarte aussi dans le sens du côté voisin.
        const start = [side.from[0] + (side.out[0] + before[0]) * u, side.from[1] + (side.out[1] + before[1]) * u];
        const stop = [side.to[0] + (side.out[0] + after[0]) * u, side.to[1] + (side.out[1] + after[1]) * u];
        for (const p of [start, stop]) {
          position.push(p[0], p[1], z);
          normal.push(side.out[0] * n[0], side.out[1] * n[0], n[1]);
          // Le fil du bois suit la longueur du montant.
          uv.push((p[0] - side.from[0]) * dir[0] + (p[1] - side.from[1]) * dir[1], arc[end]);
          color.push(deep[0] + (1 - deep[0]) * tone, deep[1] + (1 - deep[1]) * tone, deep[2] + (1 - deep[2]) * tone);
        }
      }
      // base : début j, fin j, début j+1, fin j+1.
      index.push(base, base + 3, base + 1, base, base + 2, base + 3);
    }
  });
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(position, 3));
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normal, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(color, 3));
  geometry.setIndex(index);
  return geometry;
}

/** Matière d'une moulure. */
export type Finish =
  /** Feuille d'or brunie. */
  | 'or'
  /** Or ancien, plus mat et plus sombre dans les creux. */
  | 'or-ancien'
  /** Laiton satiné. */
  | 'laiton'
  /** Aluminium brossé. */
  | 'aluminium'
  /** Bois verni, avec son fil. */
  | 'bois'
  /** Laque brillante. */
  | 'laque'
  /** Peinture satinée, sans reflet marqué. */
  | 'satin';

/** Une pièce d'un cadre : sa coupe et sa matière. */
export interface MouldingPart {
  section: SectionPoint[];
  finish: Finish;
  color: string;
  /** Force de l'assombrissement des creux : 0 = aucun, 1 = marqué. */
  patina?: number;
  /** Teinte que prennent les creux : le brun rouge de l'assiette sous une dorure ancienne, par exemple. */
  deep?: string;
}

/** Un modèle de cadre. */
export interface FrameStyle {
  id: string;
  name: Record<string, string>;
  /** Famille : `tableau` pour une peinture, `papier` pour une œuvre sous passe-partout, `caisse` pour une toile sans cadre apparent. */
  family: 'tableau' | 'papier' | 'caisse';
  /** Largeur du montant et saillie sur le mur. */
  width: number;
  depth: number;
  /** Hauteur de l'œuvre (ou du passe-partout) au-dessus du mur, au fond de la feuillure. */
  rabbet: number;
  /** Les grands tableaux portent une moulure plus large : part de l'agrandissement appliquée (0 = aucune). */
  grow: number;
  /** Caisse américaine : vide entre la toile et le cadre, et couleur du chant de la toile. */
  gap?: number;
  parts: MouldingPart[];
}

const S = (u: number, z: number) => new Section(u, z);

/** Baguette droite : une coupe rectangulaire aux arêtes adoucies. */
const baguette = (width: number, depth: number, rabbet: number, soft = 0.0015): SectionPoint[] =>
  S(0, rabbet)
    .to(0, depth - soft)
    .curve(0, depth, soft, depth, 3)
    .to(width - soft, depth)
    .curve(width, depth, width, depth - soft, 3)
    .to(width, 0).points;

/** Les modèles de cadres. */
export const FRAMES: Record<string, FrameStyle> = {
  // --- Tableaux ---------------------------------------------------------------------------
  'dore-classique': {
    id: 'dore-classique',
    name: { fr: 'Doré classique', en: 'Classic gilt' },
    family: 'tableau',
    width: 0.1,
    depth: 0.074,
    rabbet: 0.02,
    grow: 0.6,
    parts: [
      {
        finish: 'or',
        color: '#d6b46e',
        patina: 0.8,
        deep: '#5b3a14',
        // De l'œuvre vers le mur : petit jonc de vue, gorge qui monte, tore au sommet, doucine qui redescend, chant.
        section: S(0, 0.02)
          .to(0, 0.027)
          .curve(0.0005, 0.0325, 0.005, 0.0325, 4)
          .curve(0.009, 0.0325, 0.0095, 0.029, 4)
          .to(0.012, 0.0285)
          .curve(0.036, 0.03, 0.045, 0.056, 9)
          .to(0.047, 0.0575)
          .curve(0.05, 0.074, 0.061, 0.074, 6)
          .curve(0.072, 0.074, 0.074, 0.061, 6)
          .to(0.0765, 0.0595)
          .curve(0.084, 0.058, 0.088, 0.048, 5)
          .curve(0.091, 0.04, 0.097, 0.0385, 5)
          .to(0.1, 0.0375)
          .to(0.1, 0).points,
      },
    ],
  },
  'dore-ancien': {
    id: 'dore-ancien',
    name: { fr: 'Doré ancien, large', en: 'Antique gilt, wide' },
    family: 'tableau',
    width: 0.125,
    depth: 0.07,
    rabbet: 0.02,
    grow: 0.6,
    parts: [
      {
        finish: 'or-ancien',
        color: '#bf9f62',
        patina: 0.95,
        deep: '#4a2412',
        // Cadre « à cassetta » : deux moulures, l'une contre l'œuvre et l'autre au bord, autour d'un plat.
        section: S(0, 0.02)
          .to(0, 0.03)
          .curve(0.001, 0.037, 0.008, 0.037, 4)
          .curve(0.0145, 0.037, 0.016, 0.0315, 4)
          .to(0.019, 0.031)
          .curve(0.023, 0.045, 0.031, 0.0455, 5)
          .to(0.034, 0.0455)
          .to(0.0355, 0.042)
          .to(0.079, 0.042)
          .to(0.0805, 0.047)
          .curve(0.084, 0.07, 0.096, 0.07, 6)
          .curve(0.108, 0.07, 0.11, 0.056, 6)
          .to(0.113, 0.054)
          .curve(0.12, 0.052, 0.125, 0.044, 4)
          .to(0.125, 0).points,
      },
    ],
  },
  'noir-filet-or': {
    id: 'noir-filet-or',
    name: { fr: 'Bois noir à filet doré', en: 'Black wood, gilt fillet' },
    family: 'tableau',
    width: 0.085,
    depth: 0.06,
    rabbet: 0.02,
    grow: 0.6,
    parts: [
      {
        // Filet de vue doré, contre l'œuvre.
        finish: 'or',
        color: '#d6b46e',
        patina: 0.7,
        deep: '#5b3a14',
        section: S(0, 0.02).to(0, 0.0285).curve(0.0005, 0.033, 0.005, 0.033, 4).curve(0.0095, 0.033, 0.01, 0.029, 4).to(0.012, 0.0285).points,
      },
      {
        // Corps en bois noirci, bombé, à la hollandaise.
        finish: 'laque',
        color: '#15110e',
        patina: 0.5,
        section: S(0.012, 0.0285)
          .to(0.014, 0.0285)
          .curve(0.02, 0.03, 0.026, 0.043, 5)
          .to(0.0285, 0.0445)
          .curve(0.034, 0.06, 0.05, 0.06, 7)
          .curve(0.066, 0.06, 0.07, 0.046, 7)
          .to(0.0725, 0.0445)
          .curve(0.079, 0.043, 0.085, 0.034, 5)
          .to(0.085, 0).points,
      },
    ],
  },

  // --- Œuvres sur papier, photographies, documents : baguette et passe-partout -----------------
  'baguette-noire': {
    id: 'baguette-noire',
    name: { fr: 'Baguette noire', en: 'Black moulding' },
    family: 'papier',
    width: 0.02,
    depth: 0.032,
    rabbet: 0.012,
    grow: 0,
    parts: [{ finish: 'satin', color: '#171514', patina: 0.3, section: baguette(0.02, 0.032, 0.012) }],
  },
  'baguette-chene': {
    id: 'baguette-chene',
    name: { fr: 'Baguette de chêne', en: 'Oak moulding' },
    family: 'papier',
    width: 0.024,
    depth: 0.032,
    rabbet: 0.012,
    grow: 0,
    parts: [{ finish: 'bois', color: '#c79a62', patina: 0.3, section: baguette(0.024, 0.032, 0.012) }],
  },
  'baguette-noyer': {
    id: 'baguette-noyer',
    name: { fr: 'Baguette de noyer', en: 'Walnut moulding' },
    family: 'papier',
    width: 0.024,
    depth: 0.032,
    rabbet: 0.012,
    grow: 0,
    parts: [{ finish: 'bois', color: '#6b452b', patina: 0.3, section: baguette(0.024, 0.032, 0.012) }],
  },
  'baguette-laiton': {
    id: 'baguette-laiton',
    name: { fr: 'Baguette de laiton', en: 'Brass moulding' },
    family: 'papier',
    width: 0.016,
    depth: 0.03,
    rabbet: 0.012,
    grow: 0,
    parts: [{ finish: 'laiton', color: '#c2a868', patina: 0.3, section: baguette(0.016, 0.03, 0.012, 0.001) }],
  },
  'baguette-aluminium': {
    id: 'baguette-aluminium',
    name: { fr: 'Baguette d’aluminium', en: 'Aluminium moulding' },
    family: 'papier',
    width: 0.012,
    depth: 0.03,
    rabbet: 0.012,
    grow: 0,
    parts: [{ finish: 'aluminium', color: '#c9ccd0', patina: 0.2, section: baguette(0.012, 0.03, 0.012, 0.0008) }],
  },

  // --- Toiles modernes : caisse américaine --------------------------------------------------
  'caisse-noire': {
    id: 'caisse-noire',
    name: { fr: 'Caisse américaine noire', en: 'Black floater frame' },
    family: 'caisse',
    width: 0.009,
    depth: 0.046,
    rabbet: 0.04,
    grow: 0,
    gap: 0.01,
    parts: [{ finish: 'satin', color: '#171514', patina: 0.2, section: baguette(0.009, 0.046, 0.008, 0.0008) }],
  },
  'caisse-chene': {
    id: 'caisse-chene',
    name: { fr: 'Caisse américaine en chêne', en: 'Oak floater frame' },
    family: 'caisse',
    width: 0.011,
    depth: 0.046,
    rabbet: 0.04,
    grow: 0,
    gap: 0.01,
    parts: [{ finish: 'bois', color: '#c79a62', patina: 0.2, section: baguette(0.011, 0.046, 0.008, 0.0008) }],
  },
};

/** Le cadre doré d'une œuvre marquée « gilt » dans sa configuration. */
export const GILT = 'dore-classique';
/** Vrai si ce nom désigne un cadre : « gilt », ou un modèle. */
export const isFrameId = (value: unknown): value is string => value === 'gilt' || (typeof value === 'string' && Object.hasOwn(FRAMES, value));

type Framed = Pick<PaintingConfig, 'frame' | 'mat' | 'frameless' | 'width' | 'height'>;

/**
 * Modèle du cadre d'un tableau : celui que l'œuvre demande, sinon celui de sa salle (selon qu'elle est
 * sous passe-partout ou non). Un objet accroché sans cadre n'en a pas.
 */
export function frameModel(art: Pick<Framed, 'frame' | 'mat' | 'frameless'>, frames: DecorFrames): FrameStyle | null {
  if (art.frameless) return null;
  const own = art.frame === 'gilt' ? GILT : art.frame;
  if (own && Object.hasOwn(FRAMES, own)) return FRAMES[own];
  return FRAMES[art.mat ? frames.mat : frames.plain] ?? FRAMES['caisse-noire'];
}

/** Largeur prise autour de l'œuvre par son passe-partout, le vide d'une caisse américaine et son cadre. */
export function frameMargin(art: Framed, frames: DecorFrames): number {
  const model = frameModel(art, frames);
  if (!model) return 0;
  // Une caisse américaine ne reçoit pas de passe-partout : la toile y flotte.
  const mat = model.family === 'caisse' ? 0 : (art.mat ?? 0);
  return mat + (model.gap ?? 0) + model.width * frameScale(model, Math.max(art.width, art.height));
}

/** Agrandissement de la moulure pour une œuvre de cette taille : 1 jusqu'à 1 m, 1,6 au-delà de 3 m. */
export function frameScale(style: FrameStyle, size: number): number {
  return 1 + style.grow * THREE.MathUtils.clamp((size - 1) / 2, 0, 1);
}

// --- Matières -----------------------------------------------------------------------------------

let grain: THREE.CanvasTexture | null = null;
/** Fil du bois : des veines claires et sombres dans le sens de la longueur. Une seule image, teintée par chaque essence. */
function woodGrain(anisotropy: number): THREE.CanvasTexture {
  if (grain) return grain;
  const [w, h] = [512, 128];
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#d2d2d2';
  ctx.fillRect(0, 0, w, h);
  // Tirage figé : le même bois à chaque visite.
  let seed = 7;
  const random = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
  for (let i = 0; i < 150; i++) {
    const y = random() * h;
    const light = random() > 0.45;
    ctx.strokeStyle = light ? `rgba(255,255,255,${0.05 + random() * 0.14})` : `rgba(40,25,10,${0.06 + random() * 0.2})`;
    ctx.lineWidth = 0.4 + random() * 1.5;
    ctx.beginPath();
    const wave = random() * 3;
    const phase = random() * 6.28;
    for (let x = 0; x <= w; x += 16) {
      const yy = y + Math.sin((x / w) * 6.28 + phase) * wave;
      if (x === 0) ctx.moveTo(x, yy);
      else ctx.lineTo(x, yy);
    }
    ctx.stroke();
  }
  grain = new THREE.CanvasTexture(canvas);
  grain.colorSpace = THREE.SRGBColorSpace;
  grain.wrapS = grain.wrapT = THREE.RepeatWrapping;
  // L'image couvre 60 cm de long sur 5 cm de large.
  grain.repeat.set(1 / 0.6, 1 / 0.05);
  grain.anisotropy = anisotropy;
  return grain;
}

export interface FinishContext {
  /** Environnement que reflètent les matières brillantes. */
  env: THREE.Texture;
  /** Clarté et teinte de la lumière de la salle. */
  light: number;
  tint: string;
  anisotropy: number;
}

const materials = new Map<string, THREE.Material>();
/** Matière d'une pièce de cadre, telle qu'elle paraît dans la lumière d'une salle. */
export function finishMaterial(part: MouldingPart, ctx: FinishContext): THREE.Material {
  const key = `${part.finish}:${part.color}:${ctx.light}:${ctx.tint}`;
  const known = materials.get(key);
  if (known) return known;
  // Dans une salle tamisée, la matière s'assombrit avec le reste. Un métal ne renvoie que des reflets,
  // teintés par sa couleur : l'assombrir suffit. Un bois ou une laque a aussi un reflet propre, à baisser de même.
  const color = new THREE.Color(part.color).multiply(new THREE.Color(ctx.tint)).multiplyScalar(ctx.light);
  const shared = { vertexColors: true, envMap: ctx.env, color };
  let material: THREE.MeshStandardMaterial;
  switch (part.finish) {
    case 'or':
      // Feuille d'or : c'est le reflet de la salle qui la fait vivre, d'un montant à l'autre.
      material = new THREE.MeshStandardMaterial({ ...shared, metalness: 1, roughness: 0.27, envMapIntensity: 1.15 });
      break;
    case 'or-ancien':
      material = new THREE.MeshStandardMaterial({ ...shared, metalness: 0.95, roughness: 0.42, envMapIntensity: 1.0 });
      break;
    case 'laiton':
      material = new THREE.MeshStandardMaterial({ ...shared, metalness: 1, roughness: 0.34, envMapIntensity: 1.1 });
      break;
    case 'aluminium':
      material = new THREE.MeshStandardMaterial({ ...shared, metalness: 1, roughness: 0.46, envMapIntensity: 1.1 });
      break;
    case 'bois':
      material = new THREE.MeshStandardMaterial({ ...shared, map: woodGrain(ctx.anisotropy), metalness: 0, roughness: 0.5, envMapIntensity: 0.45 * ctx.light });
      break;
    case 'satin':
      material = new THREE.MeshStandardMaterial({ ...shared, metalness: 0, roughness: 0.55, envMapIntensity: 0.3 * ctx.light });
      break;
    default:
      material = new THREE.MeshStandardMaterial({ ...shared, metalness: 0, roughness: 0.26, envMapIntensity: 0.75 * ctx.light });
  }
  materials.set(key, material);
  return material;
}

const openness = new Map<MouldingPart, number[]>();

/**
 * Construit la moulure d'un cadre autour d'une ouverture de `width` × `height` (l'œuvre, ou son
 * passe-partout, ou la toile et son vide pour une caisse américaine). `scale` agrandit la coupe.
 */
export function buildMoulding(style: FrameStyle, width: number, height: number, scale: number, ctx: FinishContext): THREE.Group {
  const group = new THREE.Group();
  // Toute la coupe du cadre, pièces réunies : c'est elle qui dit quels creux sont dans l'ombre.
  const whole = style.parts.flatMap((p) => p.section);
  for (const part of style.parts) {
    let open = openness.get(part);
    if (!open) {
      // Deux échelles : la grande dit les gorges à l'ombre, la petite les filets où la patine se dépose.
      const wide = sectionOpenness(whole, 0.04);
      const fine = sectionOpenness(whole, 0.007);
      // Une moulure est partout assez dégagée : on étire l'écart entre ses gorges et ses arêtes, pour qu'il se voie.
      const stretch = (value: number, floor: number) => THREE.MathUtils.clamp((value - floor) / (1 - floor), 0, 1);
      const all = wide.map((w, j) => stretch(w, 0.6) ** 1.5 * (0.35 + 0.65 * stretch(fine[j], 0.5)));
      const start = style.parts.slice(0, style.parts.indexOf(part)).reduce((n, p) => n + p.section.length, 0);
      open = all.slice(start, start + part.section.length);
      openness.set(part, open);
    }
    const strength = part.patina ?? 0.5;
    const shade = open.map((o) => 1 - strength * (1 - o));
    const section = part.section.map(([u, z]) => [u * scale, z * scale] as SectionPoint);
    const deep = new THREE.Color(part.deep ?? '#000000');
    group.add(new THREE.Mesh(mouldingGeometry(width, height, section, shade, [deep.r, deep.g, deep.b]), finishMaterial(part, ctx)));
  }
  return group;
}

/** Carton du passe-partout, et la tranche blanche de son biseau. */
const MAT_COLOR = '#f1ede3';
const MAT_CORE = '#fbfaf6';
/** Épaisseur du carton : le biseau de la fenêtre en montre la tranche. */
export const MAT_THICKNESS = 0.0024;

/**
 * Passe-partout : un carton dont la fenêtre est taillée en biseau autour de l'œuvre. Sa face est à la
 * hauteur 0, l'œuvre juste derrière. `relief` est la hauteur du cadre au-dessus du carton : il y
 * porte une ombre douce, plus longue sous le montant du haut puisque la lumière vient d'en haut.
 */
export function buildMat(width: number, height: number, mat: number, relief: number, offsets: (rank: number) => object): THREE.Group {
  const group = new THREE.Group();
  const t = MAT_THICKNESS;
  const basic = (color: string, rank: number) => new THREE.MeshBasicMaterial({ color, vertexColors: true, toneMapped: false, ...offsets(rank) });
  // Longueur de l'ombre du cadre sur le carton, côté par côté : bas, droite, haut, gauche.
  const reach = [0.25, 0.55, 1.1, 0.55].map((k) => Math.min(mat * 0.7, relief * k));
  const face: SectionPoint[] = [
    [t, 0],
    [mat * 0.5, 0],
    [mat - 1e-4, 0],
    [mat, 0],
  ];
  const board = new THREE.Mesh(
    mouldingGeometry(width, height, face, () => 1),
    basic(MAT_COLOR, 1),
  );
  // L'ombre : une seconde couche, du noir transparent au bord du cadre, posée sur le carton.
  for (let side = 0; side < 4; side++) {
    if (reach[side] < 0.002) continue;
    const shadow = shadowStrip(side, width + mat * 2, height + mat * 2, reach[side], side === 2 ? 0.34 : 0.2, offsets(2));
    group.add(shadow);
  }
  // Le biseau montre le cœur blanc du carton ; sa moitié basse, tournée vers le haut, est un peu plus claire.
  const bevel = new THREE.Mesh(
    mouldingGeometry(width, height, [[0, -t], [t, 0]], (side) => [1, 0.93, 0.84, 0.93][side]),
    basic(MAT_CORE, 2),
  );
  group.add(board, bevel);
  return group;
}

let fade: THREE.CanvasTexture | null = null;
/** Dégradé du noir au transparent, pour les ombres douces. */
function fadeTexture(): THREE.CanvasTexture {
  if (fade) return fade;
  const canvas = document.createElement('canvas');
  canvas.width = 4;
  canvas.height = 64;
  const ctx = canvas.getContext('2d')!;
  const gradient = ctx.createLinearGradient(0, 0, 0, 64);
  // Une ombre tombe vite puis s'éteint lentement.
  gradient.addColorStop(0, 'rgba(0,0,0,1)');
  gradient.addColorStop(0.35, 'rgba(0,0,0,0.42)');
  gradient.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 4, 64);
  fade = new THREE.CanvasTexture(canvas);
  return fade;
}

/**
 * Ombre douce le long d'un bord intérieur d'un rectangle de `width` × `height`, sur une longueur
 * `reach` : celle d'un montant de cadre sur ce qu'il entoure. Côtés : 0 bas, 1 droite, 2 haut, 3 gauche.
 */
export function shadowStrip(side: number, width: number, height: number, reach: number, opacity: number, offsets: object): THREE.Mesh {
  const horizontal = side % 2 === 0;
  const strip = new THREE.Mesh(
    new THREE.PlaneGeometry(horizontal ? width : height, reach),
    new THREE.MeshBasicMaterial({ color: 0x000000, map: fadeTexture(), transparent: true, opacity, depthWrite: false, toneMapped: false, ...offsets }),
  );
  // Le dégradé part du bord : la bande est tournée pour que son côté sombre touche le montant.
  strip.rotation.z = [Math.PI, -Math.PI / 2, 0, Math.PI / 2][side];
  const inset = reach / 2;
  if (side === 0) strip.position.y = -height / 2 + inset;
  if (side === 2) strip.position.y = height / 2 - inset;
  if (side === 1) strip.position.x = width / 2 - inset;
  if (side === 3) strip.position.x = -width / 2 + inset;
  strip.raycast = () => {};
  return strip;
}

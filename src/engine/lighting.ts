import { Color, Vector3 } from 'three';
import { coveOf, type Decor } from './decors';
import type { RoomConfig } from './types';

/**
 * Éclairage des salles, calculé une fois à la construction puis « peint » sur les murs,
 * les sols et les plafonds. Aucune lampe n'est simulée pendant la visite : le rendu
 * reste fluide sur téléphone et en casque, quel que soit le nombre de salles.
 *
 * Chaque salle est éclairée par deux surfaces lumineuses :
 *  - en haut, la verrière si elle existe, sinon le plafond entier (éclairage diffus) ;
 *  - en bas, le sol, qui renvoie une partie de la lumière vers les murs et le plafond.
 * La lumière reçue en un point dépend de la part de son « ciel » qu'occupe chaque surface :
 * c'est ce qui assombrit naturellement les angles et le bas des murs.
 *
 * Le décor d'une salle règle le niveau et la teinte de cette lumière. Deux sources d'appoint
 * s'y ajoutent : la gorge lumineuse d'un plafond flottant, et la lumière qui entre par une
 * porte quand la salle voisine est plus claire.
 */

const SKYLIGHT_DEFAULT_MARGIN = 1.2;
/** Pleine lumière des sources principales, et plafond absolu une fois les appoints ajoutés. */
const FULL_LIGHT = 1.06;
export const MAX_LIGHT = 1.7;
const COVE_INTENSITY = 4;

type RGB = [number, number, number];

/** Surface lumineuse : ses coins, son intensité, et sa teinte si elle diffère de celle de la salle. */
export interface Emitter {
  corners: Vector3[];
  intensity: number;
  color?: RGB;
}

export interface RoomLight {
  /** Lumière minimale, présente partout. */
  ambient: number;
  /** Surface lumineuse du haut. */
  top: Emitter;
  /** Sol, vu comme une surface qui renvoie la lumière. */
  bounce: Emitter;
  /** Sources d'appoint : gorge lumineuse, lumière entrant par une porte. */
  extra: Emitter[];
  /** Vrai si la salle est éclairée par une verrière. */
  daylight: boolean;
  /** Teinte de la lumière de la salle : rouge, vert, bleu, entre 0 et 1. */
  tint: RGB;
}

/** Composantes d'une couleur, telles qu'elles se multiplient avec la matière des murs. */
function rgbOf(color: string): RGB {
  const c = new Color(color);
  return [c.r, c.g, c.b];
}

/** Rectangle horizontal centré sur la salle, en retrait de `inset` par rapport à ses limites. */
function horizontalRect(room: RoomConfig, y: number, insetX: number, insetZ: number): Vector3[] {
  const [w, , d] = room.size;
  const [cx, cz] = room.position;
  const hx = w / 2 - insetX;
  const hz = d / 2 - insetZ;
  return [new Vector3(cx - hx, y, cz - hz), new Vector3(cx + hx, y, cz - hz), new Vector3(cx + hx, y, cz + hz), new Vector3(cx - hx, y, cz + hz)];
}

/** Ouverture de la verrière d'une salle, ou null si son plafond est plein. */
export function skylightOpening(room: RoomConfig): { width: number; depth: number; margin: number } | null {
  if (room.ceiling?.type !== 'skylight') return null;
  const margin = room.ceiling.margin ?? SKYLIGHT_DEFAULT_MARGIN;
  return { width: room.size[0] - margin * 2, depth: room.size[2] - margin * 2, margin };
}

/** Les quatre bandes d'une gorge lumineuse : entre la surface des murs et le bord du plafond flottant. */
function coveStrips(room: RoomConfig, wallThickness: number, inset: number): Vector3[][] {
  const [w, h, d] = room.size;
  const [cx, cz] = room.position;
  const hx = w / 2 - wallThickness / 2;
  const hz = d / 2 - wallThickness / 2;
  const rect = (x0: number, x1: number, z0: number, z1: number) => [
    new Vector3(cx + x0, h, cz + z0),
    new Vector3(cx + x1, h, cz + z0),
    new Vector3(cx + x1, h, cz + z1),
    new Vector3(cx + x0, h, cz + z1),
  ];
  return [rect(-hx, hx, -hz, -hz + inset), rect(-hx, hx, hz - inset, hz), rect(-hx, -hx + inset, -hz, hz), rect(hx - inset, hx, -hz, hz)];
}

/**
 * Éclairage d'une salle. Sans décor, la salle est une galerie claire à plafond plein
 * (ou à verrière si elle en déclare une), au niveau donné par son réglage `light`.
 */
export function roomLight(room: RoomConfig, wallThickness: number, decor?: Pick<Decor, 'light' | 'ceiling'>): RoomLight {
  const h = room.size[1];
  const level = decor?.light.level ?? room.light ?? 1;
  const sky = skylightOpening(room);
  const cove = sky || !decor ? null : coveOf(room, decor);
  const inset = wallThickness / 2;
  const light: RoomLight = {
    daylight: sky !== null,
    ambient: 0.56 * level,
    top: sky
      ? { corners: horizontalRect(room, h, sky.margin, sky.margin), intensity: 1.2 * level }
      : { corners: horizontalRect(room, h, inset, inset), intensity: 0.6 * level },
    bounce: { corners: horizontalRect(room, 0, inset, inset), intensity: (sky ? 0.42 : 0.34) * level },
    extra: [],
    tint: decor ? rgbOf(decor.light.tint) : [1, 1, 1],
  };
  if (cove) {
    // Plafond flottant : le panneau lui-même éclaire peu, l'essentiel vient de la gorge et lave les murs.
    light.top = { corners: horizontalRect(room, h - cove.drop, inset + cove.inset, inset + cove.inset), intensity: 0.34 * level };
    for (const corners of coveStrips(room, wallThickness, cove.inset)) light.extra.push({ corners, intensity: COVE_INTENSITY * level });
  }
  return light;
}

/** Clarté d'ensemble d'une salle, pour comparer deux salles voisines. */
export const brightness = (light: RoomLight): number => light.ambient + 0.25 * light.top.intensity + 0.25 * light.bounce.intensity;

/**
 * Lumière qu'une salle reçoit par une porte donnant sur une salle plus claire : l'ouverture
 * se comporte comme une fenêtre. `center` : milieu de cette fenêtre au sol, à placer du côté de
 * la salle voisine (une surface n'éclaire pas ce qui se trouve dans son propre plan) ;
 * `tangent` : axe de sa largeur. Renvoie null si la salle voisine n'est pas plus claire.
 */
export function doorSpill(self: RoomLight, neighbour: RoomLight, center: Vector3, tangent: Vector3, width: number, height: number): Emitter | null {
  const gain = brightness(neighbour) - brightness(self);
  if (gain < 0.05) return null;
  const a = center.clone().addScaledVector(tangent, -width / 2);
  const b = center.clone().addScaledVector(tangent, width / 2);
  return {
    corners: [a, b, b.clone().setY(height), a.clone().setY(height)],
    // Au seuil, le sol de la salle sombre rejoint ainsi la clarté de celui de sa voisine.
    intensity: 2.2 * gain,
    color: neighbour.tint,
  };
}

const a = new Vector3();
const b = new Vector3();
const cross = new Vector3();

/**
 * Part du « ciel » d'un point occupée par un polygone lumineux, entre 0 et 1,
 * pondérée par l'incidence (une surface vue de face éclaire plus qu'une surface rasante).
 * Formule exacte de Lambert : pas d'échantillonnage, donc pas de taches ni de bandes.
 */
export function formFactor(point: Vector3, normal: Vector3, polygon: Vector3[]): number {
  // On ne garde que la partie du polygone située du côté éclairé de la surface.
  const rel = polygon.map((v) => v.clone().sub(point));
  const clipped: Vector3[] = [];
  for (let i = 0; i < rel.length; i++) {
    const cur = rel[i];
    const next = rel[(i + 1) % rel.length];
    const dc = cur.dot(normal);
    const dn = next.dot(normal);
    if (dc >= 0) clipped.push(cur);
    if (dc >= 0 !== dn >= 0) clipped.push(cur.clone().lerp(next, dc / (dc - dn)));
  }
  if (clipped.length < 3) return 0;
  // Un polygone situé dans le plan même de la surface ne l'éclaire pas (un plafond lumineux
  // n'éclaire pas le plafond). Sans ce cas, la formule ci-dessous le compterait en entier.
  if (clipped.every((v) => v.dot(normal) < 1e-5)) return 0;

  let sum = 0;
  for (let i = 0; i < clipped.length; i++) {
    a.copy(clipped[i]);
    b.copy(clipped[(i + 1) % clipped.length]);
    const la = a.length();
    const lb = b.length();
    if (la < 1e-6 || lb < 1e-6) continue;
    a.divideScalar(la);
    b.divideScalar(lb);
    cross.crossVectors(a, b);
    const sine = cross.length();
    if (sine < 1e-9) continue;
    const angle = Math.acos(Math.min(1, Math.max(-1, a.dot(b))));
    sum += (angle * cross.dot(normal)) / sine;
  }
  return Math.min(1, Math.abs(sum) / (2 * Math.PI));
}

/** Lumière des sources principales d'une salle : ambiance, haut et sol. */
function mainLight(light: RoomLight, point: Vector3, normal: Vector3): number {
  const value =
    light.ambient +
    light.top.intensity * formFactor(point, normal, light.top.corners) +
    light.bounce.intensity * formFactor(point, normal, light.bounce.corners);
  return Math.min(FULL_LIGHT, value);
}

/** Lumière reçue par un point d'une salle, pour une surface orientée selon `normal`. 1 = pleine lumière. */
export function lightAt(light: RoomLight, point: Vector3, normal: Vector3): number {
  let value = mainLight(light, point, normal);
  for (const e of light.extra) value += e.intensity * formFactor(point, normal, e.corners);
  return Math.min(MAX_LIGHT, value);
}

/** Même calcul, en couleur : la lumière de la salle prend sa teinte, chaque appoint garde la sienne. */
export function colorAt(light: RoomLight, point: Vector3, normal: Vector3, out: RGB = [0, 0, 0]): RGB {
  const main = mainLight(light, point, normal);
  let total = main;
  for (let i = 0; i < 3; i++) out[i] = main * light.tint[i];
  for (const e of light.extra) {
    const value = e.intensity * formFactor(point, normal, e.corners);
    if (value === 0) continue;
    const color = e.color ?? light.tint;
    total += value;
    for (let i = 0; i < 3; i++) out[i] += value * color[i];
  }
  // Au-delà du plafond de lumière, on ramène l'ensemble sans changer la teinte.
  if (total > MAX_LIGHT) for (let i = 0; i < 3; i++) out[i] *= MAX_LIGHT / total;
  return out;
}

/**
 * Direction d'où vient le soleil, et tache de lumière qu'il dessine au sol sous une verrière.
 * Le soleil est assez haut pour que la tache reste entièrement sur le sol de la salle.
 */
export const SUN_AZIMUTH = new Vector3(0.62, 0, 0.78).normalize();

export function sunPatch(room: RoomConfig): { center: Vector3; width: number; depth: number; shift: number } | null {
  const sky = skylightOpening(room);
  if (!sky) return null;
  const shift = Math.max(0, Math.min(sky.margin - 0.5, room.size[1] * Math.tan((16 * Math.PI) / 180)));
  const center = new Vector3(room.position[0], 0, room.position[1]).addScaledVector(SUN_AZIMUTH, -shift);
  return { center, width: sky.width, depth: sky.depth, shift };
}

/** Direction des rayons du soleil dans une salle à verrière (du ciel vers le sol). */
export function sunDirection(room: RoomConfig): Vector3 {
  const patch = sunPatch(room);
  const shift = patch?.shift ?? 1;
  return new Vector3(-SUN_AZIMUTH.x * shift, -room.size[1], -SUN_AZIMUTH.z * shift).normalize();
}

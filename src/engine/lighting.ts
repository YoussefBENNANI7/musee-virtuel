import { Vector3 } from 'three';
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
 */

const SKYLIGHT_DEFAULT_MARGIN = 1.2;

export interface RoomLight {
  /** Lumière minimale, présente partout. */
  ambient: number;
  /** Surface lumineuse du haut : ses quatre coins et son intensité. */
  top: { corners: Vector3[]; intensity: number };
  /** Sol, vu comme une surface qui renvoie la lumière. */
  bounce: { corners: Vector3[]; intensity: number };
  /** Vrai si la salle est éclairée par une verrière. */
  daylight: boolean;
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

export function roomLight(room: RoomConfig, wallThickness: number): RoomLight {
  const h = room.size[1];
  const level = room.light ?? 1;
  const sky = skylightOpening(room);
  const inset = wallThickness / 2;
  return {
    daylight: sky !== null,
    ambient: 0.56 * level,
    top: sky
      ? { corners: horizontalRect(room, h, sky.margin, sky.margin), intensity: 1.2 * level }
      : { corners: horizontalRect(room, h, inset, inset), intensity: 0.6 * level },
    bounce: { corners: horizontalRect(room, 0, inset, inset), intensity: (sky ? 0.42 : 0.34) * level },
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

/** Lumière reçue par un point d'une salle, pour une surface orientée selon `normal`. 1 = pleine lumière. */
export function lightAt(light: RoomLight, point: Vector3, normal: Vector3): number {
  const value =
    light.ambient +
    light.top.intensity * formFactor(point, normal, light.top.corners) +
    light.bounce.intensity * formFactor(point, normal, light.bounce.corners);
  return Math.min(1.06, value);
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

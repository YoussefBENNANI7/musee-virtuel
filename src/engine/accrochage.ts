import { GILT_FRAME } from './artworks';
import type { Decor } from './decors';
import { ART_CENTER_Y, WALLS, wallFrame, type Layout } from './layout';
import type { PaintingConfig, RoomConfig, WallId } from './types';

/*
 * Accrochage automatique : répartit les tableaux d'un mur à intervalles réguliers, entre les
 * angles et les portes, à la bonne hauteur. C'est ce qui permet de créer un musée sans jamais
 * régler une position en mètres. Le contrôle de la configuration (validate.ts) accepte tout
 * ce que produit ce module.
 */

/** Distances à respecter, en mètres. */
export const HANGING = {
  /** Du cadre à l'angle de la salle. */
  corner: 0.45,
  /** Du cadre au bord d'une porte. */
  door: 0.35,
  /** Entre deux cadres, au plus serré. */
  minGap: 0.3,
};

type Framed = Pick<PaintingConfig, 'mat' | 'frameless' | 'frame'>;

/** Largeur prise autour de l'œuvre par son passe-partout et son cadre. */
export const frameMargin = (art: Framed, decor: Decor): number =>
  art.frameless ? 0 : art.frame === 'gilt' ? (art.mat ?? 0) + GILT_FRAME.width : (art.mat ? art.mat : decor.frame.gap) + decor.frame.width;

/** Largeur occupée sur le mur par un tableau, cadre compris. */
export const framedWidth = (art: Framed & { width: number }, decor: Decor): number => art.width + 2 * frameMargin(art, decor);

/** Portion de mur libre, repérée le long du mur depuis son milieu (de gauche à droite quand on lui fait face). */
export interface Span {
  from: number;
  to: number;
}

/** Portions d'un mur où l'on peut accrocher : tout le mur, moins les angles et les portes. */
export function wallSpans(room: RoomConfig, wall: WallId, layout: Layout): Span[] {
  const usable = wallFrame(room, wall, layout.wallThickness / 2).length;
  let spans: Span[] = [{ from: -usable / 2 + HANGING.corner, to: usable / 2 - HANGING.corner }];
  for (const door of layout.openings(room.id, wall)) {
    const a = door.offset - door.width / 2 - HANGING.door;
    const b = door.offset + door.width / 2 + HANGING.door;
    spans = spans.flatMap((s) => (b <= s.from || a >= s.to ? [s] : [{ from: s.from, to: a }, { from: b, to: s.to }]));
  }
  // Un recoin de moins de 40 cm ne reçoit rien.
  return spans.filter((s) => s.to - s.from >= 0.4);
}

/** Les œuvres tiennent-elles dans cette portion, serrées au plus près ? */
const fits = (widths: number[], span: Span) => widths.reduce((sum, w) => sum + w, 0) + Math.max(0, widths.length - 1) * HANGING.minGap <= span.to - span.from + 1e-6;

/**
 * Répartit dans l'ordre des œuvres de largeurs données entre les portions d'un mur.
 * Renvoie, pour chaque œuvre, sa position le long du mur ; `null` si elle ne tient pas.
 */
export function distribute(widths: number[], spans: Span[]): (number | null)[] {
  const offsets: (number | null)[] = widths.map(() => null);
  if (spans.length === 0 || widths.length === 0) return offsets;

  // Première idée : remplir chaque portion à proportion de sa longueur, pour un mur équilibré.
  const total = spans.reduce((sum, s) => sum + s.to - s.from, 0);
  const all = widths.reduce((sum, w) => sum + w, 0);
  let groups: number[][] = spans.map(() => []);
  let done = 0;
  for (const [i, w] of widths.entries()) {
    // Le milieu de l'œuvre, rapporté à la longueur totale des portions, désigne la sienne.
    let target = ((done + w / 2) / all) * total;
    let s = 0;
    while (s < spans.length - 1 && target > spans[s].to - spans[s].from) {
      target -= spans[s].to - spans[s].from;
      s++;
    }
    groups[s].push(i);
    done += w;
  }
  // Si une portion déborde, on remplit au plus serré, dans l'ordre : c'est ce qui case le plus d'œuvres.
  if (groups.some((g, s) => !fits(g.map((i) => widths[i]), spans[s]))) {
    groups = spans.map(() => []);
    let s = 0;
    for (const [i, w] of widths.entries()) {
      while (s < spans.length && !fits([...groups[s].map((k) => widths[k]), w], spans[s])) s++;
      if (s >= spans.length) break;
      groups[s].push(i);
    }
  }

  for (const [s, group] of groups.entries()) {
    const span = spans[s];
    const used = group.reduce((sum, i) => sum + widths[i], 0);
    const free = span.to - span.from - used;
    // Intervalles égaux, bords compris ; si c'est trop serré, les œuvres vont jusqu'aux bords.
    let gap = free / (group.length + 1);
    let cursor = span.from + gap;
    if (gap < HANGING.minGap && group.length > 1) {
      gap = free / (group.length - 1);
      cursor = span.from;
    }
    for (const i of group) {
      offsets[i] = Math.round((cursor + widths[i] / 2) * 1000) / 1000;
      cursor += widths[i] + gap;
    }
  }
  return offsets;
}

/**
 * Hauteur du centre d'une œuvre pour qu'elle tienne entre le sol et le plafond :
 * `undefined` à la hauteur habituelle, un nombre si elle doit descendre, `null` si elle ne tient pas.
 */
export function hangingHeight(art: PaintingConfig, room: RoomConfig, decor: Decor): number | undefined | null {
  const half = art.height / 2 + frameMargin(art, decor);
  const top = room.size[1] - 0.1 - half - 0.01;
  const bottom = (art.frameless ? 0.03 : 0.2) + half + 0.01;
  if (top < bottom) return null;
  if (ART_CENTER_Y <= top && ART_CENTER_Y >= bottom) return undefined;
  return Math.round(Math.min(top, Math.max(bottom, ART_CENTER_Y)) * 1000) / 1000;
}

const paintingsOn = (room: RoomConfig, wall: WallId) => room.artworks.filter((a): a is PaintingConfig => a.type === 'painting' && a.wall === wall);

/**
 * Raccroche toute une salle : chaque mur garde ses œuvres, dans leur ordre, et les répartit.
 * Les œuvres qui ne tiennent plus (mur plein, œuvre trop haute) sont retirées de la salle et renvoyées.
 */
export function hangRoom(room: RoomConfig, layout: Layout, decor: Decor): PaintingConfig[] {
  const removed: PaintingConfig[] = [];
  for (const wall of WALLS) {
    const works = paintingsOn(room, wall).filter((art) => {
      const y = hangingHeight(art, room, decor);
      if (y === null) removed.push(art);
      else if (y === undefined) delete art.y;
      else art.y = y;
      return y !== null;
    });
    const offsets = distribute(works.map((a) => framedWidth(a, decor)), wallSpans(room, wall, layout));
    for (const [i, art] of works.entries()) {
      if (offsets[i] === null) removed.push(art);
      else art.offset = offsets[i]!;
    }
  }
  if (removed.length) room.artworks = room.artworks.filter((a) => !removed.includes(a as PaintingConfig));
  return removed;
}

/** Place libre sur un mur, en mètres, une fois ses œuvres accrochées au plus serré. */
export function freeLength(room: RoomConfig, wall: WallId, layout: Layout, decor: Decor): number {
  const spans = wallSpans(room, wall, layout);
  const works = paintingsOn(room, wall);
  const used = works.reduce((sum, a) => sum + framedWidth(a, decor), 0) + works.length * HANGING.minGap;
  return Math.max(0, spans.reduce((sum, s) => sum + s.to - s.from, 0) - used);
}

/** Mur de la salle qui peut recevoir cette œuvre et garde le plus de place ; `null` si aucun. */
export function roomiestWall(room: RoomConfig, art: PaintingConfig, layout: Layout, decor: Decor): WallId | null {
  if (hangingHeight(art, room, decor) === null) return null;
  let best: WallId | null = null;
  let most = -1;
  for (const wall of WALLS) {
    const widths = [...paintingsOn(room, wall).filter((a) => a !== art), art].map((a) => framedWidth(a, decor));
    if (distribute(widths, wallSpans(room, wall, layout)).includes(null)) continue;
    const free = freeLength(room, wall, layout, decor) - framedWidth(art, decor);
    if (free > most) {
      most = free;
      best = wall;
    }
  }
  return best;
}

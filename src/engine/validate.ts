import { benchFootprint } from './furniture';
import { ART_CENTER_Y, MIN_DOOR_WIDTH, WALLS, buildLayout, inside, roomRect, wallFrame } from './layout';
import { isStyleId, type Style } from './styles';
import type { ArtworkConfig, L10n, MuseumConfig, RoomConfig } from './types';

/**
 * Contrôle d'une configuration de musée avant de la construire.
 * Une erreur empêche l'ouverture du musée ; un avertissement signale un défaut sans gravité.
 */
export interface Issue {
  level: 'error' | 'warning';
  /** Élément concerné, par exemple « Salle "hall" » ou « Œuvre "equilibre-no-7" ». */
  where: string;
  message: string;
}

const PAINTING_GENERATORS = ['geometric', 'fields', 'lines', 'circles', 'mosaic', 'landscape'];
const SCULPTURE_GENERATORS = ['knot', 'blob', 'rings', 'stack', 'ribbon'];
const SCULPTURE_MATERIALS = ['bronze', 'marble', 'patina', 'lacquer'];

export function validateMuseum(museum: MuseumConfig, style: Style): Issue[] {
  const issues: Issue[] = [];
  const error = (where: string, message: string) => issues.push({ level: 'error', where, message });
  const warning = (where: string, message: string) => issues.push({ level: 'warning', where, message });
  try {
    check(museum, style, error, warning);
  } catch (err) {
    // Une configuration trop incomplète pour être analysée jusqu'au bout.
    error('Configuration', `structure illisible (${err instanceof Error ? err.message : String(err)})`);
  }
  return issues;
}

type Report = (where: string, message: string) => void;

function check(museum: MuseumConfig, style: Style, error: Report, warning: Report) {
  const langs = Array.isArray(museum.langs) ? museum.langs : [];
  if (langs.length === 0) error('Musée', 'aucune langue déclarée dans "langs"');
  if (!langs.includes(museum.defaultLang)) error('Musée', `la langue par défaut "${museum.defaultLang}" n'est pas dans "langs"`);
  if (museum.style !== undefined && !isStyleId(museum.style)) error('Musée', `style inconnu : "${museum.style}"`);

  const translated = (where: string, field: string, text: L10n | undefined) => {
    if (!text || typeof text !== 'object') return error(where, `texte manquant : ${field}`);
    const missing = langs.filter((l) => !text[l]?.trim());
    if (missing.length) warning(where, `${field} : traduction manquante (${missing.join(', ')})`);
  };
  translated('Musée', 'nom', museum.name);

  const rooms = Array.isArray(museum.rooms) ? museum.rooms : [];
  if (rooms.length === 0) return error('Musée', 'aucune salle');
  const half = style.wallThickness / 2;

  // --- Salles ----------------------------------------------------------------
  const roomIds = new Set<string>();
  for (const room of rooms) {
    const where = `Salle "${room.id}"`;
    if (roomIds.has(room.id)) error(where, 'identifiant utilisé par plusieurs salles');
    roomIds.add(room.id);
    translated(where, 'nom', room.name);
    const [w, h, d] = room.size;
    if (!(w > 0 && h > 0 && d > 0)) error(where, 'dimensions invalides');
    else {
      if (h < 2.4) error(where, `plafond trop bas (${h} m, minimum 2,4 m)`);
      if (Math.min(w, d) < style.wallThickness + 2) error(where, 'salle trop étroite pour y circuler');
    }
    if (room.light !== undefined && !(room.light >= 0 && room.light <= 2)) error(where, 'niveau d\'éclairage invalide (entre 0 et 2)');
    for (const [i, bench] of (room.benches ?? []).entries()) {
      const { hx, hz } = benchFootprint(bench);
      const clear = half + 0.3;
      if (Math.abs(bench.position[0]) + hx > w / 2 - clear || Math.abs(bench.position[1]) + hz > d / 2 - clear) {
        error(where, `banc n° ${i + 1} : posé hors de la salle ou trop près d'un mur`);
      }
    }
    if (room.ceiling?.type === 'skylight') {
      const margin = room.ceiling.margin ?? 1.2;
      if (Math.min(w, d) - margin * 2 < 1) error(where, 'verrière : marge trop grande pour la taille de la salle');
    }
  }
  for (let i = 0; i < rooms.length; i++) {
    for (let j = i + 1; j < rooms.length; j++) {
      const a = roomRect(rooms[i], 0.005);
      const b = roomRect(rooms[j], 0.005);
      if (a.minX < b.maxX && b.minX < a.maxX && a.minZ < b.maxZ && b.minZ < a.maxZ) {
        error(`Salle "${rooms[i].id}"`, `chevauche la salle "${rooms[j].id}"`);
      }
    }
  }

  // --- Portes ----------------------------------------------------------------
  const doors = Array.isArray(museum.doors) ? museum.doors : [];
  for (const door of doors) {
    const where = `Porte de "${door.room}" (mur ${door.wall})`;
    const room = rooms.find((r) => r.id === door.room);
    if (!room) {
      error(where, 'salle inconnue');
      continue;
    }
    if (!WALLS.includes(door.wall)) {
      error(where, 'mur inconnu (north, south, east ou west)');
      continue;
    }
    if (!(door.width >= MIN_DOOR_WIDTH)) error(where, `trop étroite (minimum ${MIN_DOOR_WIDTH} m)`);
    const usable = wallFrame(room, door.wall, half).length;
    if (Math.abs(door.offset) + door.width / 2 > usable / 2) error(where, 'dépasse du mur');
    if (typeof door.height === 'number' && door.height < 2) error(where, 'trop basse (minimum 2 m)');
  }
  const layout = buildLayout({ ...museum, rooms, doors }, { wallThickness: style.wallThickness, doorHeight: style.doorHeight });
  for (const door of layout.deadEnds) {
    error(`Porte de "${door.room}" (mur ${door.wall})`, 'ne débouche sur aucune salle voisine');
  }

  // --- Départ et accessibilité -------------------------------------------------
  const startRoom = rooms.find((r) => r.id === museum.start?.room);
  if (!startRoom) error('Départ', `salle inconnue : "${museum.start?.room}"`);
  else {
    const s = layout.spawn(startRoom.id);
    if (!inside(layout.standingArea(startRoom), s.x, s.z)) error('Départ', 'la position de départ est hors de la salle ou dans un mur');
    const reachable = layout.reachable(startRoom.id);
    for (const room of rooms) {
      if (!reachable.has(room.id)) error(`Salle "${room.id}"`, 'inaccessible depuis la salle de départ : aucune porte n\'y mène');
    }
  }

  // --- Œuvres ------------------------------------------------------------------
  const artIds = new Set<string>();
  for (const room of rooms) {
    if (!Array.isArray(room.artworks)) {
      error(`Salle "${room.id}"`, 'liste d\'œuvres manquante');
      continue;
    }
    for (const art of room.artworks) {
      const where = `Œuvre "${art.id}"`;
      if (artIds.has(art.id)) error(where, 'identifiant utilisé par plusieurs œuvres');
      artIds.add(art.id);
      translated(where, 'titre', art.title);
      translated(where, 'technique', art.medium);
      translated(where, 'description', art.description);
      if (!art.artist) warning(where, 'artiste manquant');
      if (art.type === 'painting') checkPainting(art, room, layout, style, where, error);
      else if (art.type === 'sculpture') checkSculpture(art, room, half, where, error);
      else error(where, `type inconnu : "${(art as ArtworkConfig).type}"`);
    }
    checkOverlaps(room, style, warning);
  }

  // --- Parcours ----------------------------------------------------------------
  const tourIds = new Set<string>();
  for (const tour of museum.tours ?? []) {
    const where = `Parcours "${tour.id}"`;
    if (tourIds.has(tour.id)) error(where, 'identifiant utilisé par plusieurs parcours');
    tourIds.add(tour.id);
    translated(where, 'nom', tour.name);
    translated(where, 'description', tour.description);
    if (!tour.stops?.length) error(where, 'aucune étape');
    for (const id of tour.stops ?? []) {
      if (!artIds.has(id)) error(where, `étape inconnue : "${id}"`);
    }
  }
}

/** Demi-largeur occupée sur le mur par un tableau et son cadre. */
const framedHalfWidth = (width: number, style: Style) => width / 2 + style.frame.gap + style.frame.width;

function checkPainting(
  art: Extract<ArtworkConfig, { type: 'painting' }>,
  room: RoomConfig,
  layout: ReturnType<typeof buildLayout>,
  style: Style,
  where: string,
  error: Report,
) {
  if (!WALLS.includes(art.wall)) return error(where, 'mur inconnu (north, south, east ou west)');
  if (!(art.width > 0 && art.height > 0)) return error(where, 'dimensions invalides');
  const reach = framedHalfWidth(art.width, style);
  const usable = wallFrame(room, art.wall, layout.wallThickness / 2).length;
  if (Math.abs(art.offset) + reach > usable / 2) error(where, 'dépasse du mur');
  for (const gap of layout.openings(room.id, art.wall)) {
    if (Math.abs(art.offset - gap.offset) < reach + gap.width / 2) error(where, 'accrochée en travers d\'une porte');
  }
  if (ART_CENTER_Y + art.height / 2 + style.frame.width > room.size[1] - 0.1) error(where, 'trop haute pour le plafond de la salle');
  if (ART_CENTER_Y - art.height / 2 < 0.2) error(where, 'trop haute : elle toucherait le sol');

  const image = art.image as { src?: unknown; generator?: unknown } | undefined;
  if (typeof image?.src === 'string') {
    if (!image.src.trim()) error(where, 'image : chemin vide');
  } else if (!PAINTING_GENERATORS.includes(image?.generator as string)) {
    error(where, 'image : indiquez "src" (fichier) ou un "generator" connu');
  }
}

function checkSculpture(
  art: Extract<ArtworkConfig, { type: 'sculpture' }>,
  room: RoomConfig,
  half: number,
  where: string,
  error: Report,
) {
  if (!(art.height > 0 && art.plinth >= 0)) return error(where, 'dimensions invalides');
  const [w, h, d] = room.size;
  const clear = half + 0.5;
  if (Math.abs(art.position[0]) > w / 2 - clear || Math.abs(art.position[1]) > d / 2 - clear) {
    error(where, 'posée hors de la salle ou trop près d\'un mur');
  }
  if (art.height + art.plinth > h - 0.1) error(where, 'trop haute pour le plafond de la salle');
  if (!SCULPTURE_GENERATORS.includes(art.model?.generator)) error(where, 'modèle : "generator" inconnu');
  if (!SCULPTURE_MATERIALS.includes(art.material)) error(where, `matériau inconnu : "${art.material}"`);
}

/** Deux tableaux qui se recouvrent sur un même mur : gênant, mais pas bloquant. */
function checkOverlaps(room: RoomConfig, style: Style, warning: Report) {
  for (const wall of WALLS) {
    const hung = room.artworks.filter((a) => a.type === 'painting' && a.wall === wall) as Extract<ArtworkConfig, { type: 'painting' }>[];
    for (let i = 0; i < hung.length; i++) {
      for (let j = i + 1; j < hung.length; j++) {
        const gap = Math.abs(hung[i].offset - hung[j].offset) - framedHalfWidth(hung[i].width, style) - framedHalfWidth(hung[j].width, style);
        if (gap < 0) warning(`Œuvre "${hung[i].id}"`, `recouvre l'œuvre "${hung[j].id}" sur le mur ${wall}`);
      }
    }
  }
}

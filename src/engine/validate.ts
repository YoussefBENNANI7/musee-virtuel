import { DECORS, coveOf, isDecorId, resolveDecor, type Decor } from './decors';
import { frameMargin } from './accrochage';
import { FOUNTAIN_RADIUS, benchFootprint } from './furniture';
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
const FLOORINGS = ['concrete', 'parquet', 'chevron', 'stone', 'zellige'];
const WALL_FINISHES = ['paint', 'limewash'];
const BASEBOARDS = ['skirting', 'shadow-gap', 'none'];
const CEILINGS = ['flat', 'skylight', 'cove'];
/** Une couleur s'écrit "#rgb" ou "#rrggbb". */
const isColor = (value: unknown) => typeof value === 'string' && /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(value);

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
  if (museum.lumiere !== undefined && (typeof museum.lumiere !== 'string' || !museum.lumiere.endsWith('.json'))) {
    error('Musée', 'lumière précalculée : "lumiere" doit être le chemin d\'un fichier .json');
  }

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
    if (room.wall !== undefined && !isColor(room.wall)) error(where, `couleur de mur invalide : "${room.wall}" (attendu : "#rrggbb")`);
    checkDecor(room, style, where, error);
    for (const [i, bench] of (room.benches ?? []).entries()) {
      const { hx, hz } = benchFootprint(bench);
      const clear = half + 0.3;
      if (Math.abs(bench.position[0]) + hx > w / 2 - clear || Math.abs(bench.position[1]) + hz > d / 2 - clear) {
        error(where, `banc n° ${i + 1} : posé hors de la salle ou trop près d'un mur`);
      }
    }
    if (room.fountain) {
      const [fx, fz] = room.fountain.position ?? [NaN, NaN];
      const clear = half + FOUNTAIN_RADIUS + 0.9;
      if (!(Math.abs(fx) <= w / 2 - clear && Math.abs(fz) <= d / 2 - clear)) error(where, 'fontaine : posée hors de la salle ou trop près d\'un mur');
    }
    if (room.ceiling !== undefined && !CEILINGS.includes(room.ceiling?.type)) error(where, `plafond inconnu : "${room.ceiling?.type}"`);
    if (room.ceiling?.type === 'skylight') {
      const margin = room.ceiling.margin ?? 1.2;
      if (Math.min(w, d) - margin * 2 < 1) error(where, 'verrière : marge trop grande pour la taille de la salle');
    }
    const cove = coveOf(room, resolveDecor(style, room));
    if (cove) {
      if (!(cove.inset >= 0.1 && cove.drop >= 0.1)) error(where, 'plafond flottant : gorge trop fine (minimum 0,1 m)');
      else if (Math.min(w, d) - (half + cove.inset) * 2 < 1) error(where, 'plafond flottant : gorge trop large pour la taille de la salle');
      else if (h - cove.drop < 2.4) error(where, 'plafond flottant : trop bas (minimum 2,4 m sous le panneau)');
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
    if (door.arch !== undefined && door.arch !== 'horseshoe') error(where, `arc inconnu : "${door.arch}"`);
    if (door.arch === 'horseshoe' && door.width < 1.6) error(where, 'trop étroite pour un arc outrepassé (minimum 1,6 m)');
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
    const decor = resolveDecor(style, room);
    for (const art of room.artworks) {
      const where = `Œuvre "${art.id}"`;
      if (artIds.has(art.id)) error(where, 'identifiant utilisé par plusieurs œuvres');
      artIds.add(art.id);
      translated(where, 'titre', art.title);
      translated(where, 'technique', art.medium);
      translated(where, 'description', art.description);
      if (!art.artist) warning(where, 'artiste manquant');
      else if (typeof art.artist !== 'string') translated(where, 'artiste', art.artist);
      if (art.year && typeof art.year !== 'string') translated(where, 'date', art.year);
      if (art.credit !== undefined) translated(where, 'mention', art.credit);
      if (art.link !== undefined && !/^https:\/\/\S+$/.test(String(art.link))) error(where, `lien invalide : "${art.link}" (attendu : une adresse en https://)`);
      if (art.type === 'painting') {
        (art.details ?? []).forEach((detail, i) => {
          const spot = `${where}, détail ${i + 1}`;
          const [x, y]: number[] = Array.isArray(detail.at) ? detail.at : [];
          if (!(x! >= 0 && x! <= 1 && y! >= 0 && y! <= 1)) error(spot, 'position invalide (attendu : deux nombres entre 0 et 1, depuis la gauche puis depuis le haut)');
          translated(spot, 'titre', detail.title);
          translated(spot, 'texte', detail.text);
        });
        if (art.details?.length && !('src' in art.image)) warning(where, 'les détails commentés ne s’affichent que pour une œuvre fournie en fichier image');
      }
      if (art.type === 'painting') checkPainting(art, room, layout, decor, where, error, warning);
      else if (art.type === 'sculpture') {
        if (art.tone !== undefined && !(art.tone > 0 && art.tone <= 1)) error(where, 'réglage "tone" invalide (attendu : un nombre entre 0 et 1)');
        if (art.turn !== undefined && !Number.isFinite(art.turn)) error(where, 'réglage "turn" invalide (attendu : un angle en degrés)');
        checkSculpture(art, room, half, where, error);
      }
      else error(where, `type inconnu : "${(art as ArtworkConfig).type}"`);
    }
    checkOverlaps(room, decor, warning);
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

/** Décor d'une salle : un nom de la bibliothèque, ou des réglages dont chacun doit être connu. */
function checkDecor(room: RoomConfig, style: Style, where: string, error: Report) {
  if (room.decor === undefined) return;
  const config = typeof room.decor === 'string' ? { preset: room.decor } : room.decor;
  if (!config || typeof config !== 'object') return error(where, 'décor illisible');
  if (config.preset !== undefined && !isDecorId(config.preset)) {
    error(where, `décor inconnu : "${config.preset}" (décors disponibles : ${Object.keys(DECORS).join(', ')})`);
  }
  for (const [name, value] of Object.entries(config.colors ?? {})) {
    if (!isColor(value)) error(where, `décor : couleur invalide pour "${name}" : "${value}" (attendu : "#rrggbb")`);
  }
  if (config.floor !== undefined && !FLOORINGS.includes(config.floor)) error(where, `décor : sol inconnu : "${config.floor}"`);
  if (config.walls !== undefined && !WALL_FINISHES.includes(config.walls)) error(where, `décor : finition de mur inconnue : "${config.walls}"`);
  if (config.baseboard !== undefined && !BASEBOARDS.includes(config.baseboard)) error(where, `décor : bas de mur inconnu : "${config.baseboard}"`);
  if (config.ceiling !== undefined && !['flat', 'cove'].includes(config.ceiling?.type)) {
    error(where, `décor : plafond inconnu : "${config.ceiling?.type}" (une verrière se déclare sur la salle)`);
  }
  for (const key of ['dado', 'frieze'] as const) {
    if (config[key] !== undefined && !(config[key]! >= 0 && config[key]! <= 3)) error(where, `décor : hauteur de ${key === 'dado' ? 'soubassement' : 'frise'} invalide (entre 0 et 3 m)`);
  }
  if (config.gloss !== undefined && !(config.gloss >= 0 && config.gloss <= 1)) error(where, 'décor : brillance du sol invalide (entre 0 et 1)');
  if (config.labels !== undefined && !['light', 'dark'].includes(config.labels)) error(where, `décor : cartels inconnus : "${config.labels}"`);
  const light = config.light;
  if (light?.level !== undefined && !(light.level >= 0 && light.level <= 2)) error(where, 'décor : niveau d\'éclairage invalide (entre 0 et 2)');
  if (light?.spots !== undefined && !(light.spots >= 0 && light.spots <= 4)) error(where, 'décor : force des projecteurs invalide (entre 0 et 4)');
  if (light?.tint !== undefined && !isColor(light.tint)) error(where, `décor : teinte de lumière invalide : "${light.tint}" (attendu : "#rrggbb")`);
  const frame = resolveDecor(style, room).frame;
  if (!(frame.width > 0 && frame.width <= 0.3 && frame.depth > 0 && frame.depth <= 0.3 && frame.gap >= 0 && frame.gap <= 0.1)) {
    error(where, 'décor : cadre invalide (largeur et épaisseur entre 0 et 0,3 m, vide entre 0 et 0,1 m)');
  }
}

/** Marge occupée autour d'une œuvre par son passe-partout (ou le vide du cadre) et son cadre. */
/** Demi-largeur occupée sur le mur par un tableau, son passe-partout et son cadre. */
const framedHalfWidth = (art: { width: number; mat?: number; frameless?: boolean; frame?: 'gilt' }, decor: Decor) => art.width / 2 + frameMargin(art, decor);

function checkPainting(
  art: Extract<ArtworkConfig, { type: 'painting' }>,
  room: RoomConfig,
  layout: ReturnType<typeof buildLayout>,
  decor: Decor,
  where: string,
  error: Report,
  warning: Report,
) {
  if (!WALLS.includes(art.wall)) return error(where, 'mur inconnu (north, south, east ou west)');
  if (!(art.width > 0 && art.height > 0)) return error(where, 'dimensions invalides');
  if (art.frame !== undefined && art.frame !== 'gilt') error(where, `cadre inconnu : "${art.frame}"`);
  if (art.mat !== undefined && !(art.mat >= 0 && art.mat <= 0.4)) error(where, 'passe-partout invalide (entre 0 et 0,4 m)');
  const reach = framedHalfWidth(art, decor);
  const usable = wallFrame(room, art.wall, layout.wallThickness / 2).length;
  if (Math.abs(art.offset) + reach > usable / 2) error(where, 'dépasse du mur');
  for (const gap of layout.openings(room.id, art.wall)) {
    if (Math.abs(art.offset - gap.offset) < reach + gap.width / 2) error(where, 'accrochée en travers d\'une porte');
  }
  const margin = frameMargin(art, decor);
  const centerY = art.y ?? ART_CENTER_Y;
  if (art.y !== undefined && !(art.y > 0)) error(where, 'hauteur d\'accrochage invalide');
  if (centerY + art.height / 2 + margin > room.size[1] - 0.1) error(where, 'trop haute pour le plafond de la salle');
  // Un objet sans cadre peut descendre presque jusqu'au sol, comme une porte ; un tableau, non.
  if (centerY - art.height / 2 - margin < (art.frameless ? 0.03 : 0.2)) error(where, 'trop haute : elle toucherait le sol');

  const image = art.image as { src?: unknown; generator?: unknown } | undefined;
  if (typeof image?.src === 'string') {
    if (!image.src.trim()) error(where, 'image : chemin vide');
    const { width, height } = image as { width?: number; height?: number };
    if (width !== undefined || height !== undefined) {
      if (!(width! > 0 && height! > 0)) error(where, 'image : dimensions invalides');
      else if (Math.abs(art.width / art.height / (width! / height!) - 1) > 0.02) {
        warning(where, 'ses proportions ne sont pas celles de son image, qui sera déformée : relancez « npm run images »');
      }
    }
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
  const model = art.model as { src?: unknown; generator?: unknown } | undefined;
  if (typeof model?.src === 'string') {
    if (!/\.glb$/i.test(model.src)) error(where, 'modèle : le fichier doit être au format GLB');
  } else {
    if (!SCULPTURE_GENERATORS.includes(model?.generator as string)) error(where, 'modèle : indiquez "src" (fichier GLB) ou un "generator" connu');
    if (!SCULPTURE_MATERIALS.includes(art.material as string)) error(where, `matériau inconnu : "${art.material}"`);
  }
}

/** Deux tableaux qui se recouvrent sur un même mur : gênant, mais pas bloquant. */
function checkOverlaps(room: RoomConfig, decor: Decor, warning: Report) {
  for (const wall of WALLS) {
    const hung = room.artworks.filter((a) => a.type === 'painting' && a.wall === wall) as Extract<ArtworkConfig, { type: 'painting' }>[];
    for (let i = 0; i < hung.length; i++) {
      for (let j = i + 1; j < hung.length; j++) {
        const gap = Math.abs(hung[i].offset - hung[j].offset) - framedHalfWidth(hung[i], decor) - framedHalfWidth(hung[j], decor);
        if (gap < 0) warning(`Œuvre "${hung[i].id}"`, `recouvre l'œuvre "${hung[j].id}" sur le mur ${wall}`);
      }
    }
  }
}

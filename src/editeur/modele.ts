import { hangRoom, roomiestWall } from '../engine/accrochage';
import { resolveDecor } from '../engine/decors';
import { buildLayout } from '../engine/layout';
import { planById } from '../engine/plans';
import { resolveStyle } from '../engine/styles';
import type { ArtworkConfig, ImageSource, MuseumConfig, PaintingConfig, RoomConfig, WallId } from '../engine/types';

/*
 * Opérations de l'éditeur sur un musée : création, ajout et déplacement d'œuvres, raccrochage.
 * Aucune ne touche à l'écran ni au disque : elles se testent seules.
 */

/** Identifiant lisible tiré d'un texte : « L'Été à Fès » → « l-ete-a-fes ». */
export function slugify(text: string, fallback = 'sans-nom'): string {
  const slug = text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
    .replace(/-+$/, '');
  return slug || fallback;
}

/** Complète un identifiant d'un numéro tant qu'il est déjà pris. */
export function unique(base: string, taken: Iterable<string>): string {
  const used = new Set(taken);
  if (!used.has(base)) return base;
  let n = 2;
  while (used.has(`${base}-${n}`)) n++;
  return `${base}-${n}`;
}

/** Un musée vide, sur un plan tout fait, prêt à recevoir des œuvres. */
export function createMuseum(name: string, planId: string, takenIds: Iterable<string> = []): MuseumConfig {
  const plan = planById(planId).build();
  return {
    id: unique(slugify(name, 'musee'), takenIds),
    name: { fr: name.trim() || 'Mon musée' },
    langs: ['fr'],
    defaultLang: 'fr',
    style: 'contemporary',
    theme: { accent: '#a8472a' },
    ...plan,
    // Une seule langue au départ : les noms anglais des salles reviendront si le musée ajoute l'anglais.
    rooms: plan.rooms,
    tours: [],
    reserve: [],
  };
}

export const allWorks = (museum: MuseumConfig): ArtworkConfig[] => [...museum.rooms.flatMap((r) => r.artworks), ...(museum.reserve ?? [])];

/** Titre proposé pour une photo : son nom de fichier s'il dit quelque chose, sinon « Sans titre ». */
export function titleFromFile(fileName: string): string {
  const base = fileName.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').trim();
  if (!base || /^(img|dsc|dscn|pxl|photo|image|whatsapp|screenshot|capture)?[\s\d()]*$/i.test(base) || /\d{6,}/.test(base)) return 'Sans titre';
  return base.charAt(0).toUpperCase() + base.slice(1);
}

/** Identifiant d'une nouvelle œuvre, tiré du nom de sa photo, différent de tous ceux du musée. */
export function newWorkId(museum: MuseumConfig, fileName: string): string {
  const title = titleFromFile(fileName);
  return unique(slugify(title === 'Sans titre' ? 'oeuvre' : title, 'oeuvre'), allWorks(museum).map((a) => a.id));
}

/** Hauteur donnée à une œuvre dont on ne connaît pas encore les dimensions, en mètres. */
export const DEFAULT_HEIGHT = 0.7;

/** Nouvelle œuvre à partir d'une image déjà enregistrée. Sa largeur suit les proportions de l'image. */
export function newPainting(museum: MuseumConfig, fileName: string, image: Extract<ImageSource, { src: string }>, id?: string): PaintingConfig {
  const title = titleFromFile(fileName);
  const ratio = image.width && image.height ? image.width / image.height : 1;
  // Une image très allongée garde une largeur raisonnable.
  const height = Math.min(DEFAULT_HEIGHT, 1.8 / ratio);
  const text = () => Object.fromEntries(museum.langs.map((lang) => [lang, '']));
  return {
    id: id ?? newWorkId(museum, fileName),
    type: 'painting',
    wall: 'north',
    offset: 0,
    width: Math.round(height * ratio * 1000) / 1000,
    height: Math.round(height * 1000) / 1000,
    image,
    title: { ...text(), [museum.defaultLang]: title },
    artist: '',
    year: '',
    medium: text(),
    description: text(),
  };
}

const context = (museum: MuseumConfig) => {
  const style = resolveStyle(museum);
  return { style, layout: buildLayout(museum, { wallThickness: style.wallThickness, doorHeight: style.doorHeight }) };
};

/**
 * Raccroche toutes les salles en accrochage automatique. Les œuvres qui ne tiennent plus
 * rejoignent la réserve ; leur liste est renvoyée pour prévenir la personne.
 */
export function rehang(museum: MuseumConfig): PaintingConfig[] {
  const { style, layout } = context(museum);
  const moved: PaintingConfig[] = [];
  for (const room of museum.rooms) {
    if (!room.autoHang) continue;
    moved.push(...hangRoom(room, layout, resolveDecor(style, room)));
  }
  if (moved.length) museum.reserve = [...(museum.reserve ?? []), ...moved];
  return moved;
}

/** Accroche une œuvre dans une salle, sur le mur demandé ou sur celui qui a le plus de place. Faux si elle ne tient nulle part. */
export function hangIn(museum: MuseumConfig, room: RoomConfig, art: PaintingConfig, wall?: WallId): boolean {
  const { style, layout } = context(museum);
  const decor = resolveDecor(style, room);
  const target = wall ?? roomiestWall(room, art, layout, decor);
  if (!target) return false;
  const before = { wall: art.wall, from: museum.rooms.find((r) => r.artworks.includes(art)) };
  // On retire l'œuvre de l'endroit où elle se trouve, salle ou réserve.
  for (const r of museum.rooms) r.artworks = r.artworks.filter((a) => a !== art);
  museum.reserve = (museum.reserve ?? []).filter((a) => a !== art);
  art.wall = target;
  room.artworks.push(art);
  if (hangRoom(room, layout, decor).includes(art)) {
    // Elle ne tient pas sur ce mur : elle retourne d'où elle vient.
    art.wall = before.wall;
    if (before.from) {
      before.from.artworks.push(art);
      hangRoom(before.from, layout, resolveDecor(style, before.from));
    } else museum.reserve.push(art);
    return false;
  }
  return true;
}

/** Retire une œuvre de sa salle et la range en réserve. */
export function toReserve(museum: MuseumConfig, art: ArtworkConfig) {
  for (const r of museum.rooms) r.artworks = r.artworks.filter((a) => a !== art);
  if (!(museum.reserve ?? []).includes(art)) museum.reserve = [...(museum.reserve ?? []), art];
}

/** Supprime une œuvre du musée, et la retire des parcours qui y passaient. */
export function removeWork(museum: MuseumConfig, art: ArtworkConfig) {
  for (const r of museum.rooms) r.artworks = r.artworks.filter((a) => a !== art);
  museum.reserve = (museum.reserve ?? []).filter((a) => a !== art);
  for (const tour of museum.tours ?? []) tour.stops = tour.stops.filter((id) => id !== art.id);
}

/** Déplace une œuvre d'un cran sur son mur : vers la gauche (-1) ou vers la droite (+1). */
export function shift(room: RoomConfig, art: PaintingConfig, direction: -1 | 1) {
  const onWall = room.artworks.filter((a) => a.type === 'painting' && a.wall === art.wall);
  const other = onWall[onWall.indexOf(art) + direction];
  if (!other) return;
  const i = room.artworks.indexOf(art);
  const j = room.artworks.indexOf(other);
  [room.artworks[i], room.artworks[j]] = [room.artworks[j], room.artworks[i]];
}

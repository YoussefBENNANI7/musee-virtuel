/** Texte traduit : une valeur par code de langue ("fr", "en", ...). */
export type L10n = Record<string, string>;

export type WallId = 'north' | 'south' | 'east' | 'west';

export type PaintingGenerator = 'geometric' | 'fields' | 'lines' | 'circles' | 'mosaic' | 'landscape';
export type SculptureGenerator = 'knot' | 'blob' | 'rings' | 'stack' | 'ribbon';
export type SculptureMaterial = 'bronze' | 'marble' | 'patina' | 'lacquer';

export type ImageSource =
  | { src: string }
  | { generator: PaintingGenerator; seed: number; mono?: boolean };

interface ArtworkBase {
  id: string;
  title: L10n;
  artist: string;
  year: string;
  medium: L10n;
  description: L10n;
  /** Commentaire enregistré, un fichier par langue. Sans fichier, le texte est lu par une voix de synthèse. */
  audio?: L10n;
  /** Photo de l'œuvre pour la vue simplifiée (utile surtout pour les sculptures). */
  photo?: string;
}

export interface PaintingConfig extends ArtworkBase {
  type: 'painting';
  wall: WallId;
  /** Décalage le long du mur, en mètres, depuis son centre (positif = vers la droite quand on fait face au mur). */
  offset: number;
  width: number;
  height: number;
  image: ImageSource;
}

export interface SculptureConfig extends ArtworkBase {
  type: 'sculpture';
  /** Position dans la salle, en mètres, depuis son centre : [x, z]. */
  position: [number, number];
  /** Hauteur de la sculpture seule. */
  height: number;
  /** Hauteur du socle. */
  plinth: number;
  model: { generator: SculptureGenerator; seed: number };
  material: SculptureMaterial;
  color?: string;
}

export type ArtworkConfig = PaintingConfig | SculptureConfig;

export interface RoomConfig {
  id: string;
  name: L10n;
  /** Centre de la salle dans le musée : [x, z]. Le nord est vers les z négatifs. */
  position: [number, number];
  /** Largeur (x), hauteur (y), profondeur (z), en mètres. */
  size: [number, number, number];
  /** Couleur des murs, si différente de celle du thème. */
  wall?: string;
  artworks: ArtworkConfig[];
}

/** Une porte se déclare d'un seul côté ; l'ouverture dans la salle voisine est déduite. */
export interface DoorConfig {
  room: string;
  wall: WallId;
  offset: number;
  width: number;
}

/** Parcours thématique : une suite d'œuvres à voir dans l'ordre. */
export interface TourConfig {
  id: string;
  name: L10n;
  description: L10n;
  /** Identifiants des œuvres, dans l'ordre de visite. */
  stops: string[];
}

export interface MuseumConfig {
  id: string;
  name: L10n;
  langs: string[];
  defaultLang: string;
  theme: { wall: string; floor: string; ceiling: string; frame: string; accent: string };
  start: { room: string; position: [number, number]; yaw: number };
  rooms: RoomConfig[];
  doors: DoorConfig[];
  tours?: TourConfig[];
}

export function tr(text: L10n, lang: string): string {
  return text[lang] ?? Object.values(text)[0] ?? '';
}

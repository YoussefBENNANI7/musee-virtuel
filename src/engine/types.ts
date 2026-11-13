/** Texte traduit : une valeur par code de langue ("fr", "en", ...). */
export type L10n = Record<string, string>;

export type WallId = 'north' | 'south' | 'east' | 'west';

/** Style d'architecture du musée : voir styles.ts. */
export type StyleId = 'contemporary' | 'classic';

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

export interface BenchConfig {
  /** Position dans la salle, en mètres, depuis son centre : [x, z]. */
  position: [number, number];
  /** Par défaut le banc est allongé d'est en ouest ; `rotated` le tourne d'un quart de tour. */
  rotated?: boolean;
}

export type CeilingConfig =
  | { type: 'flat' }
  /** Verrière centrale. `margin` : distance entre la verrière et les murs, en mètres. */
  | { type: 'skylight'; margin?: number };

/**
 * Une salle est un rectangle du plan. Les salles voisines se touchent : l'épaisseur
 * des murs, définie par le style, est prise à parts égales de chaque côté de la limite.
 */
export interface RoomConfig {
  id: string;
  name: L10n;
  /** Centre de la salle dans le musée : [x, z]. Le nord est vers les z négatifs. */
  position: [number, number];
  /** Largeur (x), hauteur (y), profondeur (z), en mètres. */
  size: [number, number, number];
  /** Couleur des murs, si différente de celle du style. */
  wall?: string;
  /** Plafond plat par défaut. */
  ceiling?: CeilingConfig;
  /** Niveau d'éclairage de la salle : 1 = normal, moins pour une ambiance tamisée. */
  light?: number;
  /** Bancs, posés au sol. */
  benches?: BenchConfig[];
  artworks: ArtworkConfig[];
}

/** Une porte se déclare d'un seul côté ; l'ouverture dans la salle voisine est déduite. */
export interface DoorConfig {
  room: string;
  wall: WallId;
  offset: number;
  width: number;
  /** Hauteur en mètres, ou "full" pour une ouverture jusqu'au plafond. Par défaut : celle du style. */
  height?: number | 'full';
}

/** Parcours thématique : une suite d'œuvres à voir dans l'ordre. */
export interface TourConfig {
  id: string;
  name: L10n;
  description: L10n;
  /** Identifiants des œuvres, dans l'ordre de visite. */
  stops: string[];
}

/** Couleurs que le musée peut imposer par-dessus celles de son style. */
export interface ThemeConfig {
  wall?: string;
  floor?: string;
  ceiling?: string;
  trim?: string;
  frame?: string;
  plinth?: string;
  wood?: string;
  /** Couleur de l'identité du musée : boutons, liens, repères. */
  accent?: string;
}

export interface MuseumConfig {
  id: string;
  name: L10n;
  langs: string[];
  defaultLang: string;
  /** Style d'architecture. Par défaut : "contemporary". */
  style?: StyleId;
  theme?: ThemeConfig;
  start: { room: string; position: [number, number]; yaw: number };
  rooms: RoomConfig[];
  doors: DoorConfig[];
  tours?: TourConfig[];
}

export function tr(text: L10n, lang: string): string {
  return text[lang] ?? Object.values(text)[0] ?? '';
}

/** Texte traduit : une valeur par code de langue ("fr", "en", ...). */
export type L10n = Record<string, string>;

export type WallId = 'north' | 'south' | 'east' | 'west';

/** Style d'architecture du musée : voir styles.ts. */
export type StyleId = 'contemporary' | 'classic';

/** Revêtement de sol : béton ciré, parquet à lames droites, parquet en chevrons (point de Hongrie), dalles de pierre. */
export type Flooring = 'concrete' | 'parquet' | 'chevron' | 'stone';
/** Finition des murs : peinture unie, ou badigeon de chaux légèrement nuagé. */
export type WallFinish = 'paint' | 'limewash';
/** Bas des murs : plinthe rapportée, joint creux, ou rien. */
export type Baseboard = 'skirting' | 'shadow-gap' | 'none';
/** Cadre des tableaux : largeur du montant, épaisseur, et vide entre la toile et le cadre. */
export interface FrameShape {
  width: number;
  depth: number;
  gap: number;
}

export type PaintingGenerator = 'geometric' | 'fields' | 'lines' | 'circles' | 'mosaic' | 'landscape';
export type SculptureGenerator = 'knot' | 'blob' | 'rings' | 'stack' | 'ribbon';
export type SculptureMaterial = 'bronze' | 'marble' | 'patina' | 'lacquer';

export type ImageSource =
  /**
   * Image fournie par le musée. `npm run images` complète les autres champs :
   * dimensions du fichier en pixels, et versions allégées disponibles (grand côté, en pixels).
   */
  | { src: string; width?: number; height?: number; variants?: number[] }
  /** Tableau fictif dessiné par le moteur à partir d'une graine. */
  | { generator: PaintingGenerator; seed: number; mono?: boolean };

interface ArtworkBase {
  id: string;
  title: L10n;
  /** Auteur, ou origine pour une œuvre anonyme. S'écrit une fois, ou dans chaque langue si le nom change. */
  artist: string | L10n;
  /** Date, telle qu'elle doit se lire : « 1889 », ou { "fr": "vers 1830", "en": "c. 1830" }. */
  year: string | L10n;
  medium: L10n;
  description: L10n;
  /** Commentaire enregistré, un fichier par langue. Sans fichier, le texte est lu par une voix de synthèse. */
  audio?: L10n;
  /** Photo de l'œuvre pour la vue simplifiée (utile surtout pour les sculptures). */
  photo?: string;
  /** Mention affichée sous la légende : lieu de conservation de l'œuvre et licence de son image. */
  credit?: L10n;
  /** Adresse de la notice de l'œuvre sur le site du musée qui la conserve. */
  link?: string;
}

export interface PaintingConfig extends ArtworkBase {
  type: 'painting';
  wall: WallId;
  /** Décalage le long du mur, en mètres, depuis son centre (positif = vers la droite quand on fait face au mur). */
  offset: number;
  width: number;
  height: number;
  image: ImageSource;
  /**
   * Largeur du passe-partout, en mètres, pour une œuvre sur papier : estampe, dessin, photographie.
   * `width` et `height` restent les dimensions de l'œuvre elle-même.
   */
  mat?: number;
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
  | { type: 'skylight'; margin?: number }
  /**
   * Plafond flottant : un panneau abaissé de `drop` mètres, détaché des murs par une gorge
   * lumineuse large de `inset` mètres. La lumière cachée dans la gorge lave le haut des murs.
   */
  | { type: 'cove'; inset?: number; drop?: number };

/** Couleurs d'une salle. Celles qui manquent sont celles du style du musée. */
export interface DecorColors {
  wall?: string;
  floor?: string;
  ceiling?: string;
  /** Plinthes, joints creux, piétement des bancs. */
  trim?: string;
  /** Cadres des tableaux. */
  frame?: string;
  /** Socles des sculptures. */
  plinth?: string;
  /** Bois du mobilier. */
  wood?: string;
  /** Rails et projecteurs. */
  fixture?: string;
}

/**
 * Décor d'une salle : ce qui lui donne son ambiance, sans toucher à son plan ni à ses œuvres.
 * On part d'un décor de la bibliothèque (`preset`, voir decors.ts), puis on corrige au besoin
 * réglage par réglage. Tout est facultatif : sans décor, la salle suit le style du musée.
 */
export interface DecorConfig {
  /** Nom d'un décor de la bibliothèque. */
  preset?: string;
  colors?: DecorColors;
  floor?: Flooring;
  walls?: WallFinish;
  /** Brillance du sol : 0 = mat, 1 = miroir. Visible au niveau de qualité le plus élevé. */
  gloss?: number;
  baseboard?: Baseboard;
  /** Plafond proposé par le décor. Celui que la salle déclare elle-même (`ceiling`) l'emporte. */
  ceiling?: Exclude<CeilingConfig, { type: 'skylight' }>;
  frame?: Partial<FrameShape>;
  light?: {
    /** Niveau général : 1 = galerie claire, moins pour une salle tamisée. */
    level?: number;
    /** Teinte de la lumière, par exemple "#fff1e0" pour une lumière chaude. */
    tint?: string;
    /** Force du faisceau des projecteurs sur les murs : 1 = normal, 0 = aucun. */
    spots?: number;
  };
  /** Cartels clairs (par défaut) ou sombres, pour une salle obscure. */
  labels?: 'light' | 'dark';
}

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
  /** Décor de la salle : le nom d'un décor de la bibliothèque, ou un décor détaillé. */
  decor?: string | DecorConfig;
  /** Couleur des murs, si différente de celle du décor. */
  wall?: string;
  /** Plafond plat par défaut. */
  ceiling?: CeilingConfig;
  /** Niveau d'éclairage de la salle : 1 = normal, moins pour une ambiance tamisée. Remplace celui du décor. */
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
  fixture?: string;
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

/** Texte qui s'écrit soit une fois pour toutes les langues, soit dans chaque langue. */
export function loc(text: string | L10n, lang: string): string {
  return typeof text === 'string' ? text : tr(text, lang);
}

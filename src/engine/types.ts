/** Texte traduit : une valeur par code de langue ("fr", "en", ...). */
export type L10n = Record<string, string>;

export type WallId = 'north' | 'south' | 'east' | 'west';

export type ImageSource =
  | { src: string }
  | { generator: 'geometric' | 'fields' | 'lines'; seed: number };

export interface ArtworkConfig {
  id: string;
  type: 'painting';
  wall: WallId;
  /** Décalage horizontal le long du mur, en mètres, depuis son centre. */
  offset: number;
  width: number;
  height: number;
  image: ImageSource;
  title: L10n;
  artist: string;
  year: string;
  medium: L10n;
  description: L10n;
}

export interface RoomConfig {
  id: string;
  name: L10n;
  /** Largeur (x), hauteur (y), profondeur (z), en mètres. */
  size: [number, number, number];
  artworks: ArtworkConfig[];
}

export interface MuseumConfig {
  id: string;
  name: L10n;
  langs: string[];
  defaultLang: string;
  theme: { wall: string; floor: string; ceiling: string; frame: string; accent: string };
  start: { room: string; position: [number, number]; yaw: number };
  rooms: RoomConfig[];
}

export function tr(text: L10n, lang: string): string {
  return text[lang] ?? Object.values(text)[0] ?? '';
}

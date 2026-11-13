import type { MuseumConfig, StyleId } from './types';

export interface Palette {
  wall: string;
  floor: string;
  ceiling: string;
  /** Plinthes, joints creux, encadrements de portes. */
  trim: string;
  /** Cadres des tableaux. */
  frame: string;
  /** Socles des sculptures. */
  plinth: string;
  /** Bois du mobilier. */
  wood: string;
  /** Couleur de l'identité du musée. */
  accent: string;
}

/**
 * Un style d'architecture : tout ce qui donne son caractère au bâtiment,
 * indépendamment du plan et des œuvres. Un même musée peut changer de style
 * sans que sa configuration bouge.
 */
export interface Style {
  id: StyleId;
  palette: Palette;
  /** Épaisseur des murs, en mètres. */
  wallThickness: number;
  /** Hauteur des portes quand la configuration n'en précise pas. */
  doorHeight: number;
  floor: 'parquet' | 'concrete';
  /** Bas des murs : plinthe rapportée, joint creux, ou rien. */
  baseboard: 'skirting' | 'shadow-gap' | 'none';
  /** Encadrement en saillie autour des portes. */
  doorCasing: boolean;
  /** Cadre des tableaux : largeur du montant, épaisseur, et vide entre la toile et le cadre. */
  frame: { width: number; depth: number; gap: number };
}

export const STYLES: Record<StyleId, Style> = {
  /** Galerie contemporaine : murs blancs épais, béton clair, ouvertures nettes, cadres fins en bois clair. */
  contemporary: {
    id: 'contemporary',
    palette: {
      wall: '#f5f4f1',
      floor: '#c8c5bf',
      ceiling: '#fbfbfa',
      trim: '#1b1b1a',
      frame: '#c9b28c',
      plinth: '#f7f6f3',
      wood: '#c9b28c',
      accent: '#a8472a',
    },
    wallThickness: 0.4,
    doorHeight: 2.9,
    floor: 'concrete',
    baseboard: 'shadow-gap',
    doorCasing: false,
    frame: { width: 0.02, depth: 0.05, gap: 0.012 },
  },
  /** Musée classique : parquet, plinthes et encadrements sombres, cadres larges. */
  classic: {
    id: 'classic',
    palette: {
      wall: '#f1ede6',
      floor: '#9a7450',
      ceiling: '#fbfaf7',
      trim: '#2b2420',
      frame: '#2b2420',
      plinth: '#f4f1eb',
      wood: '#6b4a2f',
      accent: '#a8472a',
    },
    wallThickness: 0.3,
    doorHeight: 2.7,
    floor: 'parquet',
    baseboard: 'skirting',
    doorCasing: true,
    frame: { width: 0.06, depth: 0.06, gap: 0 },
  },
};

export const DEFAULT_STYLE: StyleId = 'contemporary';

export const isStyleId = (value: unknown): value is StyleId =>
  typeof value === 'string' && Object.hasOwn(STYLES, value);

/**
 * Style effectif d'un musée : celui demandé (ou, à défaut, celui de la configuration),
 * avec les couleurs que le musée impose par-dessus.
 */
export function resolveStyle(museum: Pick<MuseumConfig, 'style' | 'theme'>, requested?: string | null): Style {
  const id = isStyleId(requested) ? requested : isStyleId(museum.style) ? museum.style : DEFAULT_STYLE;
  const base = STYLES[id];
  const overrides = Object.fromEntries(Object.entries(museum.theme ?? {}).filter(([, v]) => typeof v === 'string'));
  return { ...base, palette: { ...base.palette, ...overrides } };
}

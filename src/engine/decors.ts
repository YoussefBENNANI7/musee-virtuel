import type { Style } from './styles';
import type { Baseboard, CeilingConfig, DecorConfig, Flooring, FrameShape, L10n, MuseumConfig, RoomConfig, WallFinish } from './types';

/**
 * Décor d'une salle, tous réglages connus : c'est ce que lisent le bâtiment, l'éclairage
 * et l'accrochage. Il s'obtient avec `resolveDecor`, qui part du style du musée, applique
 * le décor choisi pour la salle, puis les corrections écrites dans sa configuration.
 */
export interface Decor {
  /** Nom du décor de la bibliothèque dont la salle est partie, ou null si elle suit le style du musée. */
  preset: string | null;
  colors: Required<NonNullable<DecorConfig['colors']>>;
  floor: Flooring;
  walls: WallFinish;
  gloss: number;
  dado: number;
  frieze: number;
  cedar: boolean;
  baseboard: Baseboard;
  ceiling: Exclude<CeilingConfig, { type: 'skylight' }>;
  frame: FrameShape;
  light: { level: number; tint: string; spots: number };
  labels: 'light' | 'dark';
}

export interface DecorPreset {
  name: L10n;
  /** En une phrase : l'ambiance et le type d'œuvres auquel le décor convient. */
  summary: L10n;
  settings: Omit<DecorConfig, 'preset'>;
}

/** Brillance du sol quand le décor n'en dit rien : celle d'un béton ciré. */
export const DEFAULT_GLOSS = 0.3;
export const COVE_DEFAULTS = { inset: 0.3, drop: 0.28 };

/**
 * Bibliothèque de décors. Un décor ne fixe que ce qui fait son caractère ;
 * le reste vient du style du musée.
 */
export const DECORS: Record<string, DecorPreset> = {
  'pierre-claire': {
    name: { fr: 'Pierre claire', en: 'Pale stone' },
    summary: {
      fr: 'Grand volume clair et minéral : dalles de pierre calcaire, murs blancs, socles de pierre. Fait pour la lumière du jour et la sculpture.',
      en: 'A bright, mineral hall: limestone slabs, white walls, stone plinths. Made for daylight and sculpture.',
    },
    settings: {
      colors: { floor: '#d6cebf', plinth: '#ddd6c9' },
      floor: 'stone',
      gloss: 0.2,
    },
  },
  'argile-claire': {
    name: { fr: 'Argile claire', en: 'Pale clay' },
    summary: {
      fr: 'Salle lumineuse et douce : badigeon rosé, parquet de chêne clair en chevrons, plafond flottant.',
      en: 'A soft, bright room: pale clay limewash, light oak chevron floor, floating ceiling.',
    },
    settings: {
      colors: { wall: '#ead7c8', ceiling: '#fbf7f1', floor: '#c7a174', trim: '#4a3a2e', frame: '#d6bf9b', plinth: '#f3ebe2', wood: '#c7a174', fixture: '#f1ece4' },
      floor: 'chevron',
      walls: 'limewash',
      gloss: 0.2,
      ceiling: { type: 'cove' },
      light: { level: 1.06, tint: '#fff6ea', spots: 1 },
    },
  },
  'terre-cuite': {
    name: { fr: 'Terre cuite', en: 'Terracotta' },
    summary: {
      fr: 'Bain de couleur : murs et plafond en terre cuite, chêne fumé en chevrons, lumière chaude concentrée sur les œuvres.',
      en: 'A bath of colour: terracotta walls and ceiling, smoked oak chevron floor, warm light gathered on the works.',
    },
    settings: {
      colors: { wall: '#a24e37', ceiling: '#934631', floor: '#6a4a33', trim: '#1d1512', frame: '#1d1512', plinth: '#8a4330', wood: '#4d3626' },
      floor: 'chevron',
      walls: 'limewash',
      gloss: 0.24,
      ceiling: { type: 'cove' },
      light: { level: 0.8, tint: '#ffefdc', spots: 1.5 },
    },
  },
  riad: {
    name: { fr: 'Riad', en: 'Riad' },
    summary: {
      fr: 'Patio marocain : soubassement de zellige, murs de chaux blanche, frise de plâtre sculpté, plafond de cèdre. Fait pour la lumière du jour.',
      en: 'A Moroccan courtyard: zellige dado, white limewashed walls, carved plaster frieze, cedar ceiling. Made for daylight.',
    },
    settings: {
      colors: { wall: '#f4eee2', ceiling: '#7b4c2c', floor: '#efe8da', trim: '#1f4f46', frame: '#4a2e1c', plinth: '#efe7d8', wood: '#6b4226' },
      floor: 'zellige',
      walls: 'limewash',
      gloss: 0.22,
      dado: 1.2,
      frieze: 1.05,
      cedar: true,
      baseboard: 'none',
      light: { level: 1, tint: '#fff5e4', spots: 1 },
    },
  },
  nuit: {
    name: { fr: 'Nuit', en: 'Night' },
    summary: {
      fr: 'Écrin sombre : murs et plafond bleu nuit, sol noir poli, les œuvres semblent éclairées de l\'intérieur.',
      en: 'A dark jewel box: midnight walls and ceiling, polished black floor, the works seem lit from within.',
    },
    settings: {
      colors: { wall: '#222c45', ceiling: '#161c2c', floor: '#26282e', trim: '#0b0c0f', frame: '#0e0f12', plinth: '#1d2231', wood: '#2b2622' },
      floor: 'concrete',
      walls: 'paint',
      gloss: 0.55,
      ceiling: { type: 'flat' },
      light: { level: 0.55, tint: '#f1f4ff', spots: 2.4 },
      labels: 'dark',
    },
  },
};

export const isDecorId = (value: unknown): value is string => typeof value === 'string' && Object.hasOwn(DECORS, value);

const asConfig = (decor: RoomConfig['decor']): DecorConfig => (typeof decor === 'string' ? { preset: decor } : (decor ?? {}));

/** Applique des réglages par-dessus un décor, sans modifier celui-ci. */
function apply(base: Decor, over: Omit<DecorConfig, 'preset'> | undefined): Decor {
  if (!over) return base;
  const defined = <T extends object>(o: T | undefined) => Object.fromEntries(Object.entries(o ?? {}).filter(([, v]) => v !== undefined && v !== null));
  return {
    ...base,
    ...(defined({ floor: over.floor, walls: over.walls, gloss: over.gloss, dado: over.dado, frieze: over.frieze, cedar: over.cedar, baseboard: over.baseboard, ceiling: over.ceiling, labels: over.labels }) as Partial<Decor>),
    colors: { ...base.colors, ...defined(over.colors) },
    frame: { ...base.frame, ...defined(over.frame) },
    light: { ...base.light, ...defined(over.light) },
  };
}

/** Décor effectif d'une salle : style du musée, puis décor de la bibliothèque, puis réglages de la salle. */
export function resolveDecor(style: Style, room: Pick<RoomConfig, 'decor' | 'wall' | 'light'>): Decor {
  const { accent: _accent, ...colors } = style.palette;
  const base: Decor = {
    preset: null,
    colors,
    floor: style.floor,
    walls: 'paint',
    gloss: DEFAULT_GLOSS,
    dado: 0,
    frieze: 0,
    cedar: false,
    baseboard: style.baseboard,
    ceiling: { type: 'flat' },
    frame: style.frame,
    light: { level: 1, tint: '#ffffff', spots: 1 },
    labels: 'light',
  };
  const config = asConfig(room.decor);
  const preset = isDecorId(config.preset) ? config.preset : null;
  let decor = apply({ ...base, preset }, preset ? DECORS[preset].settings : undefined);
  decor = apply(decor, config);
  // Réglages directs de la salle, antérieurs aux décors : ils gardent le dernier mot.
  if (room.wall) decor.colors.wall = room.wall;
  if (room.light !== undefined) decor.light.level = room.light;
  return decor;
}

/** Plafond effectif d'une salle : celui qu'elle déclare, sinon celui que propose son décor. */
export const ceilingOf = (room: Pick<RoomConfig, 'ceiling'>, decor: Pick<Decor, 'ceiling'>): CeilingConfig => room.ceiling ?? decor.ceiling;

/** Gorge lumineuse d'une salle à plafond flottant, ou null. */
export function coveOf(room: Pick<RoomConfig, 'ceiling'>, decor: Pick<Decor, 'ceiling'>): { inset: number; drop: number } | null {
  const ceiling = ceilingOf(room, decor);
  if (ceiling.type !== 'cove') return null;
  return { inset: ceiling.inset ?? COVE_DEFAULTS.inset, drop: ceiling.drop ?? COVE_DEFAULTS.drop };
}

/** Hauteur libre sous plafond, là où pendent les projecteurs. */
export function clearHeight(room: Pick<RoomConfig, 'ceiling' | 'size'>, decor: Pick<Decor, 'ceiling'>): number {
  return room.size[1] - (coveOf(room, decor)?.drop ?? 0);
}

/**
 * Lumière reçue par les objets d'une salle (cadres, socles, bancs, cartels), entre 0 et 1.
 * Ils sont éclairés par les lampes communes à tout le musée : dans une salle tamisée,
 * on assombrit leur matière pour qu'ils ne paraissent pas allumés.
 */
export const objectLight = (decor: Pick<Decor, 'light'>): number => Math.min(1, 0.22 + 0.78 * decor.light.level);

/**
 * Lit le paramètre d'adresse `?decor=` : il montre une salle dans un autre décor sans toucher
 * à la configuration du musée. `salle:décor` vise une salle, `décor` seul les vise toutes ;
 * plusieurs demandes se séparent par des virgules. Une demande inconnue est ignorée.
 */
export function withDecorOverrides(museum: MuseumConfig, param: string | null | undefined): MuseumConfig {
  if (!param) return museum;
  const byRoom = new Map<string, string>();
  let everywhere: string | null = null;
  for (const part of param.split(',')) {
    const [first, second] = part.split(':').map((s) => s.trim());
    if (second === undefined) {
      if (isDecorId(first)) everywhere = first;
    } else if (isDecorId(second)) {
      byRoom.set(first, second);
    }
  }
  if (!everywhere && byRoom.size === 0) return museum;
  return {
    ...museum,
    rooms: museum.rooms.map((room) => {
      const preset = byRoom.get(room.id) ?? everywhere;
      if (!preset) return room;
      // Le décor demandé remplace tout ce qui tenait lieu de décor ; le plan et le plafond déclaré restent.
      const { wall: _wall, light: _light, decor: _decor, ...rest } = room;
      return { ...rest, decor: preset };
    }),
  };
}

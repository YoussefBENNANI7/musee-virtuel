/**
 * Niveaux de qualité du rendu. Chaque amélioration visuelle se paie en fluidité :
 * un ordinateur reçoit le rendu complet, un téléphone ou un casque un rendu allégé.
 */
export type Tier = 'high' | 'medium' | 'low';

export interface Quality {
  tier: Tier;
  /** Plafond de la définition de l'image (pixels calculés par pixel d'écran). */
  maxPixelRatio: number;
  /** Lissage des contours. */
  antialias: boolean;
  /** Largeur des textures générées, en pixels. */
  textureSize: number;
  /** Netteté des textures vues en biais (sols, tableaux vus de côté). */
  anisotropy: number;
}

export const TIERS: Record<Tier, Quality> = {
  high: { tier: 'high', maxPixelRatio: 2, antialias: true, textureSize: 1024, anisotropy: 8 },
  medium: { tier: 'medium', maxPixelRatio: 1.5, antialias: true, textureSize: 1024, anisotropy: 4 },
  low: { tier: 'low', maxPixelRatio: 1, antialias: false, textureSize: 512, anisotropy: 2 },
};

export interface Device {
  /** Écran tactile comme moyen principal : téléphone ou tablette. */
  touch: boolean;
  /** Mémoire vive en Go, quand le navigateur la communique. */
  memory?: number;
}

const isTier = (value: unknown): value is Tier => typeof value === 'string' && Object.hasOwn(TIERS, value);

/**
 * Choisit le niveau de départ. Ce n'est qu'une estimation : pendant la visite,
 * le moteur allège encore l'image si l'appareil n'arrive pas à suivre.
 */
export function chooseTier(device: Device, forced?: string | null): Tier {
  if (isTier(forced)) return forced;
  if (!device.touch) return 'high';
  return device.memory !== undefined && device.memory <= 2 ? 'low' : 'medium';
}

/** Niveau de qualité pour l'appareil courant. `?q=high|medium|low` dans l'adresse force un niveau. */
export function detectQuality(params: URLSearchParams): Quality {
  const device: Device = {
    touch: matchMedia('(pointer: coarse)').matches,
    memory: (navigator as Navigator & { deviceMemory?: number }).deviceMemory,
  };
  return { ...TIERS[chooseTier(device, params.get('q'))] };
}

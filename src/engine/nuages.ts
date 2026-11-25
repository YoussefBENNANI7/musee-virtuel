/**
 * Nuages des textures : de grandes taches molles, à peine plus claires ou plus sombres que le fond,
 * qui donnent leur matière à la pierre, au badigeon et au béton.
 *
 * Le canvas les dessinait une à une, chacune floutée par un filtre (`g.filter = 'blur(…)'`). Sans carte
 * graphique, le navigateur calcule ces flous au processeur, en pleine définition : l'ouverture d'un musée
 * en gelait la page une quinzaine de secondes. Ici, chaque tache est floutée sur une grille plus grossière,
 * d'au moins trois cases par écart type du flou : une tache floutée n'a aucun détail plus fin que son flou,
 * la grille la décrit donc sans perte visible. Les taches se superposent dans l'ordre où elles sont données,
 * comme sur le canvas ; leur calque, agrandi en lissant, est enfin posé sur la texture.
 *
 * Sans rendu : se teste seul.
 */

/** Couleur d'une encre : rouge, vert, bleu, de 0 à 255. */
export type RGB = readonly [number, number, number];

/** Une tache, de l'encre n° `ink` : une ellipse tournée de `angle` (en radians), ou un trait aux bouts arrondis. */
export type Blot = { ink: number; alpha: number } & (
  | { shape: 'ellipse'; x: number; y: number; rx: number; ry: number; angle: number }
  | { shape: 'stroke'; x0: number; y0: number; x1: number; y1: number; width: number }
);

/** Calque de taches floutées, sur une grille de `side` × `side` cases de `step` pixels de côté, qui se répète. */
export interface BlotLayer {
  side: number;
  step: number;
  /** Part du fond qui reste visible dans chaque case : 1 tant qu'aucune tache n'y passe. */
  ground: Float32Array;
  /** Part de chaque encre déposée dans chaque case. */
  inks: Float32Array[];
}

/** Au moins trois cases par écart type du flou : assez pour décrire la tache floutée sans perte visible. */
const CELLS_PER_SIGMA = 3;
/** Points testés dans chaque case, sur chaque côté, pour mesurer la part que la tache en couvre. */
const SAMPLES = 4;

/** Pas de la grille, en pixels : la plus grande puissance de deux qui laisse trois cases par écart type et divise la texture. */
export function gridStep(size: number, sigma: number): number {
  let step = 1;
  while (sigma >= 2 * step * CELLS_PER_SIGMA && size % (2 * step) === 0) step *= 2;
  return step;
}

/** Noyau d'un flou gaussien d'écart type `s` (en cases), coupé à trois écarts types. */
function gaussian(s: number): Float32Array {
  const reach = Math.ceil(3 * s);
  const kernel = new Float32Array(2 * reach + 1);
  let sum = 0;
  for (let i = -reach; i <= reach; i++) sum += kernel[i + reach] = s > 0 ? Math.exp(-(i * i) / (2 * s * s)) : 1;
  return kernel.map((v) => v / sum);
}

/** Flou séparable, en largeur puis en hauteur. Au-delà du bord, tout compte pour zéro. */
function blur(values: Float32Array, width: number, height: number, kernel: Float32Array) {
  const reach = (kernel.length - 1) / 2;
  if (!reach) return;
  const across = new Float32Array(values.length);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const v = values[y * width + x];
      if (!v) continue;
      const to = Math.min(width - 1, x + reach);
      for (let k = Math.max(0, x - reach); k <= to; k++) across[y * width + k] += v * kernel[k - x + reach];
    }
  }
  values.fill(0);
  for (let y = 0; y < height; y++) {
    const from = Math.max(0, y - reach);
    const to = Math.min(height - 1, y + reach);
    for (let x = 0; x < width; x++) {
      const v = across[y * width + x];
      if (!v) continue;
      for (let k = from; k <= to; k++) values[k * width + x] += v * kernel[k - y + reach];
    }
  }
}

/**
 * Boîte englobante de la tache, en pixels, et sa distance au bord : positive dedans, négative dehors.
 * Pour une ellipse, c'est une borne : le bord est au moins à cette distance, ce qui suffit à savoir
 * qu'une case est entièrement dedans ou entièrement dehors.
 */
function outline(blot: Blot): { x0: number; y0: number; x1: number; y1: number; depth: (x: number, y: number) => number } {
  if (blot.shape === 'ellipse') {
    const { x, y, rx, ry, angle } = blot;
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    const ex = Math.hypot(rx * cos, ry * sin);
    const ey = Math.hypot(rx * sin, ry * cos);
    const thin = Math.min(rx, ry);
    return {
      x0: x - ex,
      y0: y - ey,
      x1: x + ex,
      y1: y + ey,
      depth: (px, py) => {
        const u = ((px - x) * cos + (py - y) * sin) / rx;
        const v = ((py - y) * cos - (px - x) * sin) / ry;
        return (1 - Math.sqrt(u * u + v * v)) * thin;
      },
    };
  }
  const { x0, y0, x1, y1, width } = blot;
  const half = width / 2;
  const dx = x1 - x0;
  const dy = y1 - y0;
  const length2 = dx * dx + dy * dy || 1;
  return {
    x0: Math.min(x0, x1) - half,
    y0: Math.min(y0, y1) - half,
    x1: Math.max(x0, x1) + half,
    y1: Math.max(y0, y1) + half,
    // Un trait aux bouts arrondis : tous les points à moins d'une demi-largeur du segment.
    depth: (px, py) => {
      const t = Math.min(1, Math.max(0, ((px - x0) * dx + (py - y0) * dy) / length2));
      return half - Math.hypot(px - x0 - t * dx, py - y0 - t * dy);
    },
  };
}

/**
 * Calque des taches d'une texture carrée de `size` pixels, chacune floutée de `sigma` pixels (l'écart type,
 * comme `blur(…px)` sur le canvas). Une tache qui dépasse un bord revient par le bord opposé : la texture
 * se raccorde quand elle se répète. `step` force le pas de la grille (en pixels), pour les tests.
 */
export function blurredBlots(size: number, sigma: number, blots: readonly Blot[], inkCount: number, step = gridStep(size, sigma)): BlotLayer {
  const side = size / step;
  const ground = new Float32Array(side * side).fill(1);
  const inks = Array.from({ length: inkCount }, () => new Float32Array(side * side));
  // Écart type du flou, en cases. Mesurer la part couverte de chaque case adoucit déjà un peu la tache : on le déduit.
  const kernel = gaussian(Math.sqrt(Math.max(0, sigma * sigma - (step * step) / 12)) / step);
  const reach = (kernel.length - 1) / 2;
  const wrap = (k: number) => ((k % side) + side) % side;
  // Une case dont le centre est plus loin que sa demi-diagonale du bord de la tache est entièrement dedans, ou dehors.
  const corner = (step * Math.SQRT2) / 2;
  for (const blot of blots) {
    const { x0, y0, x1, y1, depth } = outline(blot);
    // La tache et son flou, sur une fenêtre de la grille.
    const i0 = Math.floor(x0 / step);
    const j0 = Math.floor(y0 / step);
    const cols = Math.floor(x1 / step) - i0 + 1;
    const rows = Math.floor(y1 / step) - j0 + 1;
    const width = cols + 2 * reach;
    const height = rows + 2 * reach;
    const cover = new Float32Array(width * height);
    for (let j = 0; j < rows; j++) {
      for (let i = 0; i < cols; i++) {
        const d = depth((i0 + i + 0.5) * step, (j0 + j + 0.5) * step);
        let part = d > corner ? 1 : 0;
        if (Math.abs(d) <= corner) {
          // Case au bord de la tache : on compte les points qu'elle couvre.
          let hits = 0;
          for (let b = 0; b < SAMPLES; b++) {
            const py = (j0 + j + (b + 0.5) / SAMPLES) * step;
            for (let a = 0; a < SAMPLES; a++) if (depth((i0 + i + (a + 0.5) / SAMPLES) * step, py) >= 0) hits++;
          }
          part = hits / (SAMPLES * SAMPLES);
        }
        cover[(j + reach) * width + i + reach] = part;
      }
    }
    blur(cover, width, height, kernel);
    // La tache floutée se pose sur ce qui est déjà là, comme sur le canvas : là où elle vaut `a`, elle laisse voir 1 − a du dessous.
    for (let j = 0; j < height; j++) {
      const row = wrap(j0 - reach + j) * side;
      for (let i = 0; i < width; i++) {
        const a = blot.alpha * cover[j * width + i];
        if (a <= 0) continue;
        const cell = row + wrap(i0 - reach + i);
        ground[cell] *= 1 - a;
        for (const ink of inks) ink[cell] *= 1 - a;
        inks[blot.ink][cell] += a;
      }
    }
  }
  return { side, step, ground, inks };
}

/**
 * Pose les calques sur la texture (pixels RVBA, `size` × `size`), dans l'ordre : chaque pixel garde la part de
 * sa couleur que le calque laisse voir, et reçoit les encres déposées. Les calques sont agrandis en lissant
 * (entre les quatre cases voisines), d'un bord à l'autre. Le résultat n'est arrondi qu'une fois, à la fin.
 */
export function applyLayers(pixels: Uint8ClampedArray, size: number, layers: readonly { layer: BlotLayer; colors: readonly RGB[] }[]) {
  const count = size * size;
  const color = new Float32Array(count * 3);
  for (let p = 0; p < count; p++) for (let c = 0; c < 3; c++) color[p * 3 + c] = pixels[p * 4 + c];
  for (const { layer, colors } of layers) {
    const { side, step } = layer;
    // Entre quelles cases tombe chaque ligne et chaque colonne de pixels : le centre de la case k est à (k + ½) × step.
    const near = new Int32Array(size);
    const far = new Int32Array(size);
    const weight = new Float32Array(size);
    for (let x = 0; x < size; x++) {
      const u = (x + 0.5) / step - 0.5;
      const k = Math.floor(u);
      near[x] = ((k % side) + side) % side;
      far[x] = (near[x] + 1) % side;
      weight[x] = u - k;
    }
    // Agrandi d'abord en largeur, pour chaque ligne de la grille ; puis en hauteur, pixel par pixel.
    const [ground, ...inks] = [layer.ground, ...layer.inks].map((field) => {
      const wide = new Float32Array(side * size);
      for (let j = 0; j < side; j++) {
        for (let x = 0; x < size; x++) {
          const a = field[j * side + near[x]];
          wide[j * size + x] = a + (field[j * side + far[x]] - a) * weight[x];
        }
      }
      return wide;
    });
    const tint = colors.flat();
    for (let y = 0; y < size; y++) {
      const top = near[y] * size;
      const bottom = far[y] * size;
      const fy = weight[y];
      for (let x = 0; x < size; x++) {
        const g0 = ground[top + x];
        const through = g0 + (ground[bottom + x] - g0) * fy;
        const p = (y * size + x) * 3;
        let r = color[p] * through;
        let g = color[p + 1] * through;
        let b = color[p + 2] * through;
        for (let k = 0; k < inks.length; k++) {
          const ink = inks[k];
          const d0 = ink[top + x];
          const d = d0 + (ink[bottom + x] - d0) * fy;
          r += d * tint[k * 3];
          g += d * tint[k * 3 + 1];
          b += d * tint[k * 3 + 2];
        }
        color[p] = r;
        color[p + 1] = g;
        color[p + 2] = b;
      }
    }
  }
  // Uint8ClampedArray arrondit au plus proche et borne entre 0 et 255.
  for (let p = 0; p < count; p++) for (let c = 0; c < 3; c++) pixels[p * 4 + c] = color[p * 3 + c];
}

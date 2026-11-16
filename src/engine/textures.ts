import * as THREE from 'three';
import { imageUrl } from './images';
import { TIERS, type Quality } from './quality';
import type { ImageSource } from './types';

/** Générateur pseudo-aléatoire déterministe : une même graine donne la même œuvre. */
export function rng(seed: number) {
  let s = (seed * 2654435761) >>> 0 || 1;
  return () => {
    s ^= s << 13;
    s >>>= 0;
    s ^= s >>> 17;
    s ^= s << 5;
    s >>>= 0;
    return s / 4294967296;
  };
}

const PALETTES = [
  ['#f3ead8', '#1f2a44', '#c8432b', '#e2a72e', '#2f6f6a'],
  ['#efe6dc', '#2b2b2b', '#b5523b', '#d9b08c', '#5b7b7a'],
  ['#f5efe2', '#243b53', '#d1603d', '#f0c05a', '#829e86'],
  ['#ece4d6', '#3a2e39', '#a23e48', '#e0a458', '#4f6d7a'],
];

const MONO = ['#e9e7e2', '#1a1a1a', '#4f4e4b', '#8f8d88', '#c4c1ba'];

function canvasOf(w: number, h: number) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return { c, g: c.getContext('2d')! };
}

function grain(g: CanvasRenderingContext2D, w: number, h: number, r: () => number) {
  g.globalAlpha = 0.05;
  for (let i = 0; i < 9000; i++) {
    g.fillStyle = r() > 0.5 ? '#fff' : '#000';
    g.fillRect(r() * w, r() * h, 2, 2);
  }
  g.globalAlpha = 1;
}

function geometric(g: CanvasRenderingContext2D, w: number, h: number, r: () => number, p: string[]) {
  g.fillStyle = p[0];
  g.fillRect(0, 0, w, h);
  for (let i = 0; i < 9; i++) {
    g.fillStyle = p[1 + Math.floor(r() * 4)];
    const bw = w * (0.08 + r() * 0.3);
    const bh = h * (0.08 + r() * 0.4);
    g.fillRect(r() * (w - bw), r() * (h - bh), bw, bh);
  }
  g.fillStyle = p[2];
  g.beginPath();
  g.arc(w * (0.6 + r() * 0.25), h * (0.3 + r() * 0.3), Math.min(w, h) * 0.17, 0, Math.PI * 2);
  g.fill();
  g.strokeStyle = p[1];
  g.lineWidth = w * 0.006;
  for (let i = 0; i < 4; i++) {
    g.beginPath();
    g.moveTo(r() * w, r() * h);
    g.lineTo(r() * w, r() * h);
    g.stroke();
  }
}

function fields(g: CanvasRenderingContext2D, w: number, h: number, r: () => number, p: string[]) {
  g.fillStyle = p[1];
  g.fillRect(0, 0, w, h);
  const bands = [p[2], p[3], p[4]];
  let y = h * 0.06;
  bands.forEach((col, i) => {
    const bh = h * (0.2 + r() * 0.14);
    g.filter = `blur(${Math.round(w * 0.02)}px)`;
    g.fillStyle = col;
    g.globalAlpha = 0.92;
    g.fillRect(w * 0.08, y, w * 0.84, bh);
    g.filter = 'none';
    g.globalAlpha = 1;
    y += bh + h * (i === 2 ? 0 : 0.05);
  });
}

function lines(g: CanvasRenderingContext2D, w: number, h: number, r: () => number, p: string[]) {
  g.fillStyle = p[0];
  g.fillRect(0, 0, w, h);
  const phase = r() * 6;
  for (let i = 0; i < 140; i++) {
    const y0 = (i / 140) * h * 1.2 - h * 0.1;
    g.strokeStyle = p[1 + (i % 4)];
    g.globalAlpha = 0.35 + r() * 0.5;
    g.lineWidth = 1 + r() * 3;
    g.beginPath();
    for (let x = 0; x <= w; x += 12) {
      const y =
        y0 +
        Math.sin(x * 0.006 + phase + i * 0.05) * h * 0.06 +
        Math.sin(x * 0.019 + i * 0.3) * h * 0.012;
      if (x === 0) g.moveTo(x, y);
      else g.lineTo(x, y);
    }
    g.stroke();
  }
  g.globalAlpha = 1;
}

function circles(g: CanvasRenderingContext2D, w: number, h: number, r: () => number, p: string[]) {
  g.fillStyle = p[0];
  g.fillRect(0, 0, w, h);
  const m = Math.min(w, h);
  for (let i = 0; i < 12; i++) {
    const x = r() * w;
    const y = r() * h;
    const rad = m * (0.06 + r() * 0.22);
    g.globalAlpha = 0.82;
    g.fillStyle = p[1 + Math.floor(r() * 4)];
    g.beginPath();
    g.arc(x, y, rad, 0, Math.PI * 2);
    g.fill();
    g.globalAlpha = 1;
    g.strokeStyle = p[0];
    g.lineWidth = m * 0.008;
    for (let k = 1; k < 4; k++) {
      g.beginPath();
      g.arc(x, y, (rad * k) / 4, 0, Math.PI * 2);
      g.stroke();
    }
  }
}

function mosaic(g: CanvasRenderingContext2D, w: number, h: number, r: () => number, p: string[]) {
  const nx = 8;
  const size = w / nx;
  const ny = Math.ceil(h / size);
  for (let j = 0; j < ny; j++) {
    for (let i = 0; i < nx; i++) {
      const x = i * size;
      const y = j * size;
      g.fillStyle = p[Math.floor(r() * 5)];
      g.fillRect(x, y, size + 1, size + 1);
      if (r() > 0.45) {
        const corner = Math.floor(r() * 4);
        g.fillStyle = p[Math.floor(r() * 5)];
        g.beginPath();
        const cx = x + (corner % 2) * size;
        const cy = y + (corner > 1 ? size : 0);
        g.moveTo(cx, cy);
        g.arc(cx, cy, size, (corner === 0 ? 0 : corner === 1 ? 0.5 : corner === 2 ? 1.5 : 1) * Math.PI, (corner === 0 ? 0.5 : corner === 1 ? 1 : corner === 2 ? 2 : 1.5) * Math.PI);
        g.closePath();
        g.fill();
      }
    }
  }
}

function landscape(g: CanvasRenderingContext2D, w: number, h: number, r: () => number, p: string[]) {
  const sky = g.createLinearGradient(0, 0, 0, h);
  sky.addColorStop(0, p[3]);
  sky.addColorStop(0.7, p[0]);
  g.fillStyle = sky;
  g.fillRect(0, 0, w, h);
  g.fillStyle = p[2];
  g.beginPath();
  g.arc(w * (0.25 + r() * 0.5), h * (0.25 + r() * 0.15), Math.min(w, h) * 0.11, 0, Math.PI * 2);
  g.fill();
  const tones = [p[4], p[2], p[4], p[1]];
  for (let i = 0; i < 4; i++) {
    const base = h * (0.5 + i * 0.13);
    const amp = h * (0.05 + r() * 0.06);
    const f = 0.003 + r() * 0.006;
    const ph = r() * 9;
    g.fillStyle = tones[i];
    g.globalAlpha = i === 1 ? 0.75 : 1;
    g.beginPath();
    g.moveTo(0, h);
    for (let x = 0; x <= w; x += 8) {
      g.lineTo(x, base + Math.sin(x * f + ph) * amp + Math.sin(x * f * 2.7 + ph) * amp * 0.3);
    }
    g.lineTo(w, h);
    g.closePath();
    g.fill();
  }
  g.globalAlpha = 1;
}

/** Halo d'un projecteur sur le mur, derrière une œuvre : le faisceau vient du plafond et s'évase vers le bas. */
export function poolTexture(): THREE.Texture {
  const { c, g } = canvasOf(256, 256);
  const grad = g.createRadialGradient(128, 104, 8, 128, 128, 128);
  grad.addColorStop(0, 'rgba(255, 247, 232, 0.9)');
  grad.addColorStop(0.45, 'rgba(255, 247, 232, 0.5)');
  grad.addColorStop(0.8, 'rgba(255, 247, 232, 0.12)');
  grad.addColorStop(1, 'rgba(255, 247, 232, 0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 256, 256);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** Dessine un tableau fictif à partir de sa graine. `size` : largeur de l'image produite, en pixels. */
export function paintingCanvas(image: Extract<ImageSource, { generator: string }>, ratio: number, size = 1024): HTMLCanvasElement {
  // Le dessin est toujours composé sur 1024 unités de large, puis mis à l'échelle de l'image demandée.
  const w = 1024;
  const h = Math.round(w / ratio);
  const { c, g } = canvasOf(size, Math.round(size / ratio));
  g.scale(size / w, size / w);
  const r = rng(image.seed);
  const picked = PALETTES[Math.floor(r() * PALETTES.length)];
  const p = image.mono ? MONO : picked;
  ({ geometric, fields, lines, circles, mosaic, landscape })[image.generator](g, w, h, r, p);
  grain(g, w, h, r);
  return c;
}

/** Texture d'une œuvre : image fournie par le musée, ou tableau fictif généré. */
export function artworkTexture(image: ImageSource, ratio: number, base: string, quality: Quality, onLoad?: () => void): THREE.Texture {
  const tex =
    'src' in image
      ? new THREE.TextureLoader().load(imageUrl(image, base, quality.imageSize), onLoad, undefined, () =>
          console.error(`[musée] image introuvable : ${image.src}`),
        )
      : new THREE.CanvasTexture(paintingCanvas(image, ratio, quality.textureSize));
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = quality.anisotropy;
  return tex;
}

/** Sol à motif répétable. */
function tiling(c: HTMLCanvasElement, quality: Quality): THREE.Texture {
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = quality.anisotropy;
  return tex;
}

/**
 * Béton ciré clair : une dalle de trois mètres de côté, légèrement nuagée,
 * bordée d'un fin joint de sciage. La texture se répète d'une dalle à l'autre.
 */
export function concreteTexture(color: string, quality: Quality = TIERS.high): THREE.Texture {
  const size = quality.textureSize;
  const { c, g } = canvasOf(size, size);
  const r = rng(41);
  g.fillStyle = color;
  g.fillRect(0, 0, size, size);
  // Nuages : de grandes taches floues, plus claires ou plus sombres. Dessinées aussi
  // de l'autre côté du bord, elles se raccordent quand la texture se répète.
  g.filter = `blur(${Math.round(size * 0.05)}px)`;
  for (let i = 0; i < 40; i++) {
    const x = r() * size;
    const y = r() * size;
    const rad = size * (0.05 + r() * 0.12);
    g.fillStyle = r() > 0.5 ? '#ffffff' : '#000000';
    g.globalAlpha = 0.01 + r() * 0.018;
    for (const dx of [-size, 0, size]) {
      for (const dy of [-size, 0, size]) {
        g.beginPath();
        g.arc(x + dx, y + dy, rad, 0, Math.PI * 2);
        g.fill();
      }
    }
  }
  g.filter = 'none';
  // Grain fin du béton.
  for (let i = 0; i < size * 14; i++) {
    g.fillStyle = r() > 0.5 ? '#ffffff' : '#000000';
    g.globalAlpha = 0.03 + r() * 0.05;
    g.fillRect(r() * size, r() * size, 1.5, 1.5);
  }
  // Joint de sciage sur deux bords : la répétition dessine le quadrillage des dalles.
  g.globalAlpha = 0.16;
  g.fillStyle = '#000000';
  g.fillRect(0, 0, size, Math.max(1.5, size / 400));
  g.fillRect(0, 0, Math.max(1.5, size / 400), size);
  g.globalAlpha = 1;
  return tiling(c, quality);
}

/** Ciel vu à travers une verrière : un blanc lumineux à peine bleuté. */
export function skyTexture(): THREE.Texture {
  const { c, g } = canvasOf(64, 64);
  const grad = g.createLinearGradient(0, 0, 64, 64);
  grad.addColorStop(0, '#ffffff');
  grad.addColorStop(1, '#e6f0f8');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/**
 * Tache de soleil sous une verrière : un carreau de lumière par vitre,
 * séparés par l'ombre des traverses. Les bords sont adoucis.
 */
export function sunPatchTexture(cols: number, rows: number): THREE.Texture {
  const cell = 96;
  const pad = cell * 0.5;
  const { c, g } = canvasOf(Math.round(cols * cell + pad * 2), Math.round(rows * cell + pad * 2));
  g.filter = `blur(${Math.round(cell * 0.09)}px)`;
  g.fillStyle = '#ffffff';
  const gap = cell * 0.07;
  for (let j = 0; j < rows; j++) {
    for (let i = 0; i < cols; i++) {
      g.fillRect(pad + i * cell + gap, pad + j * cell + gap, cell - gap * 2, cell - gap * 2);
    }
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** Ombre douce posée au sol sous un objet. */
export function blobTexture(): THREE.Texture {
  const { c, g } = canvasOf(128, 128);
  const grad = g.createRadialGradient(64, 64, 6, 64, 64, 64);
  grad.addColorStop(0, 'rgba(0, 0, 0, 0.55)');
  grad.addColorStop(0.5, 'rgba(0, 0, 0, 0.3)');
  grad.addColorStop(1, 'rgba(0, 0, 0, 0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(c);
}

/** Parquet à lames décalées, teinté par la couleur du style. */
export function parquetTexture(color: string, quality: Quality = TIERS.high): THREE.Texture {
  const { c, g } = canvasOf(512, 512);
  const r = rng(99);
  g.fillStyle = color;
  g.fillRect(0, 0, 512, 512);
  const plank = 64;
  for (let row = 0; row < 8; row++) {
    const shift = row % 2 ? 128 : 0;
    for (let x = -256; x < 512; x += 256) {
      g.fillStyle = r() > 0.5 ? '#000' : '#fff';
      g.globalAlpha = 0.02 + r() * 0.05;
      g.fillRect(x + shift, row * plank, 256, plank);
    }
    g.globalAlpha = 0.22;
    g.fillStyle = '#000';
    g.fillRect(0, row * plank, 512, 1.5);
    for (let x = -256; x < 512; x += 256) g.fillRect(x + shift, row * plank, 1.5, plank);
  }
  g.globalAlpha = 1;
  return tiling(c, quality);
}

/** Éclaircit (k > 0) ou assombrit (k < 0) une couleur, pour varier la teinte d'une lame à l'autre. */
function shade(color: string, k: number, warm = 0): string {
  const c = new THREE.Color(color);
  const hsl = { h: 0, s: 0, l: 0 };
  c.getHSL(hsl, THREE.SRGBColorSpace);
  c.setHSL(hsl.h + warm, hsl.s, THREE.MathUtils.clamp(hsl.l * (1 + k), 0, 1), THREE.SRGBColorSpace);
  return `#${c.getHexString(THREE.SRGBColorSpace)}`;
}

/** Côté, en mètres, de la surface couverte par une répétition de chaque texture de sol. */
export const FLOOR_TILE = { concrete: 3, parquet: 2, chevron: 0.9, stone: 2.4, zellige: 0.8 } as const;
/** Côté, en mètres, d'une répétition du zellige et du plâtre sculpté des murs. */
export const ZELLIGE_TILE = 0.5;
export const PLASTER_TILE = 0.75;

/**
 * Étoile à huit branches : deux carrés superposés, l'un tourné d'un huitième de tour.
 * C'est le motif de base du zellige ; entre quatre étoiles voisines se dessine une croix.
 */
function star(g: CanvasRenderingContext2D, x: number, y: number, r: number) {
  g.beginPath();
  for (let i = 0; i < 16; i++) {
    const a = (i * Math.PI) / 8;
    const d = i % 2 ? r * 0.765 : r;
    g[i ? 'lineTo' : 'moveTo'](x + Math.cos(a) * d, y + Math.sin(a) * d);
  }
  g.closePath();
}

/**
 * Zellige : un semis d'étoiles à huit branches et de croix, séparées par un joint clair.
 * `colors` : le fond (les croix), puis les teintes des étoiles, prises tour à tour.
 * Une répétition couvre deux étoiles dans chaque sens.
 */
export function zelligeTexture(colors: string[], quality: Quality = TIERS.high, accent?: string): THREE.Texture {
  const size = quality.textureSize;
  const { c, g } = canvasOf(size, size);
  const cell = size / 2;
  const r = rng(57);
  const [ground, ...stars] = colors;
  g.fillStyle = ground;
  g.fillRect(0, 0, size, size);
  g.lineJoin = 'miter';
  for (let j = 0; j <= 2; j++) {
    for (let i = 0; i <= 2; i++) {
      const x = i * cell;
      const y = j * cell;
      star(g, x, y, cell / 2);
      g.fillStyle = stars[((i % 2) + (j % 2) * 2) % stars.length];
      g.fill();
      g.strokeStyle = '#f4efe2';
      g.lineWidth = size / 130;
      g.stroke();
      // Petite étoile au cœur de la grande : claire, ou de la couleur d'accent sur un sol sobre.
      star(g, x, y, cell / 6);
      g.fillStyle = accent && (i + j) % 2 === 0 ? accent : '#f4efe2';
      g.fill();
      // Carreau posé sur la pointe au centre de chaque croix.
      if (i < 2 && j < 2) {
        g.save();
        g.translate(x + cell / 2, y + cell / 2);
        g.rotate(Math.PI / 4);
        g.fillStyle = accent ?? stars[(i + j * 2 + 1) % stars.length];
        g.fillRect(-cell / 9, -cell / 9, (cell * 2) / 9, (cell * 2) / 9);
        g.strokeRect(-cell / 9, -cell / 9, (cell * 2) / 9, (cell * 2) / 9);
        g.restore();
      }
    }
  }
  // Émail irrégulier : chaque carreau est taillé et cuit à la main.
  for (let i = 0; i < size * 10; i++) {
    g.fillStyle = r() > 0.5 ? '#ffffff' : '#000000';
    g.globalAlpha = 0.02 + r() * 0.05;
    g.fillRect(r() * size, r() * size, 2, 2);
  }
  g.globalAlpha = 1;
  return tiling(c, quality);
}

/**
 * Plâtre sculpté, sur trois registres comme dans une médersa : en bas une rangée de petits arcs
 * festonnés, au milieu un réseau serré d'étoiles, en haut un bandeau de merlons.
 * La texture couvre toute la hauteur de la frise ; elle se répète seulement en largeur.
 */
export function plasterTexture(quality: Quality = TIERS.high): THREE.Texture {
  const size = quality.textureSize;
  const { c, g } = canvasOf(size, size);
  const u = size / 1024;
  const SHADOW = 'rgba(60, 45, 25, 0.6)';
  const HIGH = '#f3ecdc';
  const MID = '#e6dcc6';
  const LOW = '#c9bb9c';
  g.fillStyle = LOW;
  g.fillRect(0, 0, size, size);
  /** Forme en relief : son ombre portée, puis la forme, puis un filet de lumière. */
  const raised = (path: () => void, color: string) => {
    g.save();
    g.translate(4 * u, 4 * u);
    path();
    g.fillStyle = SHADOW;
    g.fill();
    g.restore();
    path();
    g.fillStyle = color;
    g.fill();
    g.strokeStyle = 'rgba(255, 255, 255, 0.75)';
    g.lineWidth = 2 * u;
    g.stroke();
  };
  // Registre du milieu : étoiles à huit branches, quatre par répétition.
  const top = size * 0.16;
  const bottom = size * 0.74;
  g.save();
  g.beginPath();
  g.rect(0, top, size, bottom - top);
  g.clip();
  const cell = size / 4;
  for (let j = -1; j <= 4; j++) {
    for (let i = 0; i <= 4; i++) {
      const x = i * cell;
      const y = top + cell / 2 + j * cell;
      raised(() => star(g, x, y, cell / 2.06), HIGH);
      raised(() => star(g, x, y, cell / 3.5), LOW);
      raised(() => star(g, x, y, cell / 6.5), HIGH);
      raised(() => star(g, x + cell / 2, y + cell / 2, cell / 5), MID);
    }
  }
  g.restore();
  // Registre du bas : quatre arcs festonnés, portés par de fines colonnettes.
  const arch = size / 4;
  for (let i = 0; i < 4; i++) {
    const x = i * arch + arch / 2;
    raised(() => {
      g.beginPath();
      g.moveTo(x - arch * 0.36, size);
      g.lineTo(x - arch * 0.36, bottom + arch * 0.5);
      for (let k = 0; k < 5; k++) {
        const a0 = Math.PI - (k * Math.PI) / 5;
        const a1 = Math.PI - ((k + 1) * Math.PI) / 5;
        const mid = (a0 + a1) / 2;
        g.quadraticCurveTo(x + Math.cos(mid) * arch * 0.5, bottom + arch * 0.5 - Math.sin(mid) * arch * 0.5, x + Math.cos(a1) * arch * 0.36, bottom + arch * 0.5 - Math.sin(a1) * arch * 0.36);
      }
      g.lineTo(x + arch * 0.36, size);
      g.closePath();
    }, MID);
    raised(() => {
      g.beginPath();
      g.rect(i * arch - 6 * u, bottom + 8 * u, 12 * u, size - bottom);
    }, HIGH);
  }
  // Bandeaux qui séparent les registres, et merlons du haut.
  for (const y of [top - 10 * u, bottom]) {
    raised(() => {
      g.beginPath();
      g.rect(-10, y, size + 20, 10 * u);
    }, HIGH);
  }
  for (let i = 0; i < 8; i++) {
    const x = (i + 0.5) * (size / 8);
    raised(() => {
      g.beginPath();
      g.moveTo(x - 44 * u, top - 10 * u);
      g.lineTo(x - 44 * u, 70 * u);
      g.lineTo(x - 22 * u, 70 * u);
      g.lineTo(x - 22 * u, 34 * u);
      g.lineTo(x + 22 * u, 34 * u);
      g.lineTo(x + 22 * u, 70 * u);
      g.lineTo(x + 44 * u, 70 * u);
      g.lineTo(x + 44 * u, top - 10 * u);
      g.closePath();
    }, MID);
  }
  return tiling(c, quality);
}

/**
 * Plafond de cèdre peint : des solives sombres, et entre elles des caissons ornés d'une étoile
 * rouge, verte ou or, à la manière des plafonds peints marocains.
 */
export const CEDAR_TILE = 1.2;
export function cedarTexture(color: string, quality: Quality = TIERS.high): THREE.Texture {
  const size = quality.textureSize;
  const { c, g } = canvasOf(size, size);
  const u = size / 1024;
  const r = rng(131);
  g.fillStyle = color;
  g.fillRect(0, 0, size, size);
  // Fil du bois.
  for (let i = 0; i < 260; i++) {
    g.fillStyle = r() > 0.5 ? '#000000' : '#ffd9a8';
    g.globalAlpha = 0.03 + r() * 0.05;
    g.fillRect(0, r() * size, size, 1 + r() * 3 * u);
  }
  g.globalAlpha = 1;
  const cell = size / 2;
  const paints = ['#9c2f22', '#1f5a48', '#c79a3a', '#1f3f6e'];
  for (let j = 0; j < 2; j++) {
    for (let i = 0; i < 2; i++) {
      const x = i * cell + cell / 2;
      const y = j * cell + cell / 2;
      // Caisson en creux, bordé d'un filet doré.
      g.fillStyle = 'rgba(0, 0, 0, 0.28)';
      g.fillRect(x - cell * 0.4, y - cell * 0.4, cell * 0.8, cell * 0.8);
      g.strokeStyle = '#c79a3a';
      g.lineWidth = 5 * u;
      g.strokeRect(x - cell * 0.4, y - cell * 0.4, cell * 0.8, cell * 0.8);
      star(g, x, y, cell * 0.33);
      g.fillStyle = paints[(i + j * 2) % 4];
      g.fill();
      g.stroke();
      star(g, x, y, cell * 0.17);
      g.fillStyle = paints[(i + j * 2 + 2) % 4];
      g.fill();
      g.stroke();
      star(g, x, y, cell * 0.07);
      g.fillStyle = '#efe2c0';
      g.fill();
    }
  }
  // Solives : elles passent entre les caissons, avec leur ombre.
  for (const at of [0, cell]) {
    for (const horizontal of [true, false]) {
      g.fillStyle = 'rgba(0, 0, 0, 0.45)';
      if (horizontal) g.fillRect(0, at - 26 * u, size, 60 * u);
      else g.fillRect(at - 26 * u, 0, 60 * u, size);
      g.fillStyle = shade(color, -0.25);
      if (horizontal) g.fillRect(0, at - 26 * u, size, 44 * u);
      else g.fillRect(at - 26 * u, 0, 44 * u, size);
    }
  }
  for (const [x, y] of [[0, size - 26 * u], [size - 26 * u, 0]]) {
    g.fillStyle = shade(color, -0.25);
    if (x === 0) g.fillRect(0, y, size, 26 * u);
    else g.fillRect(x, 0, 26 * u, size);
  }
  return tiling(c, quality);
}

/**
 * Parquet en chevrons (point de Hongrie) : des travées de lames coupées en biais, qui se
 * rejoignent en pointe. Une répétition couvre deux travées de 45 cm, soit des lames
 * d'environ 8 cm sur 64 cm. Chaque lame a sa nuance et son fil.
 */
export function chevronTexture(color: string, quality: Quality = TIERS.high): THREE.Texture {
  const size = quality.textureSize;
  const { c, g } = canvasOf(size, size);
  const col = size / 2;
  const rows = 8;
  const pitch = size / rows;
  const px = size / 1024;
  // Un bois sombre montre moins son fil qu'un bois clair.
  const lightness = new THREE.Color(color).getHSL({ h: 0, s: 0, l: 0 }, THREE.SRGBColorSpace).l;
  const contrast = 0.5 + 0.8 * lightness;
  g.fillStyle = color;
  g.fillRect(0, 0, size, size);

  for (let j = 0; j < 2; j++) {
    // Travée de gauche : les lames montent vers la droite ; travée de droite : elles redescendent.
    const rise = j === 0 ? -col : col;
    const x0 = j * col;
    for (let k = 0; k < rows; k++) {
      const r = rng(1 + j * 97 + k * 13);
      const tone = shade(color, (r() - 0.5) * 0.24 * contrast, (r() - 0.5) * 0.014);
      // Fil du bois : quelques veines fines, et deux ou trois plages plus larges à peine teintées.
      const veins = Array.from({ length: 9 }, () => ({ at: r(), width: (0.6 + r() * 1.2) * px, alpha: (0.025 + r() * 0.05) * contrast, light: r() > 0.7 }));
      const bands = Array.from({ length: 3 }, () => ({ at: r(), width: (0.16 + r() * 0.3) * pitch, alpha: (0.015 + r() * 0.035) * contrast, light: r() > 0.5 }));
      // La même lame est dessinée une rangée plus haut et plus bas, pour que la texture se raccorde.
      for (const wrap of [-size, 0, size]) {
        const y = k * pitch + wrap + (j === 0 ? col : 0);
        g.save();
        g.beginPath();
        g.moveTo(x0, y);
        g.lineTo(x0 + col, y + rise);
        g.lineTo(x0 + col, y + rise + pitch);
        g.lineTo(x0, y + pitch);
        g.closePath();
        g.clip();
        g.fillStyle = tone;
        g.fillRect(x0, Math.min(y, y + rise), col, Math.abs(rise) + pitch);
        // Le fil suit la longueur de la lame.
        for (const line of [...bands, ...veins]) {
          g.globalAlpha = line.alpha;
          g.strokeStyle = line.light ? '#fff4e0' : '#1a0f06';
          g.lineWidth = line.width;
          g.beginPath();
          g.moveTo(x0, y + line.at * pitch);
          g.lineTo(x0 + col, y + rise + line.at * pitch);
          g.stroke();
        }
        g.restore();
        // Joint entre deux lames : une ombre fine, doublée d'un reflet sur l'arête voisine.
        const joint = Math.max(1.2, 2.2 * px);
        g.globalAlpha = 0.55;
        g.strokeStyle = '#120a05';
        g.lineWidth = joint;
        g.beginPath();
        g.moveTo(x0, y);
        g.lineTo(x0 + col, y + rise);
        g.stroke();
        g.globalAlpha = 0.09 * contrast;
        g.strokeStyle = '#fff4e0';
        g.lineWidth = joint * 0.8;
        g.beginPath();
        g.moveTo(x0, y + joint * 1.3);
        g.lineTo(x0 + col, y + rise + joint * 1.3);
        g.stroke();
        g.globalAlpha = 1;
      }
    }
  }
  // Joints entre les travées.
  g.globalAlpha = 0.55;
  g.fillStyle = '#120a05';
  const seam = Math.max(1.2, 2.2 * px);
  g.fillRect(-seam / 2, 0, seam, size);
  g.fillRect(size - seam / 2, 0, seam, size);
  g.fillRect(col - seam / 2, 0, seam, size);
  g.globalAlpha = 1;
  return tiling(c, quality);
}

/**
 * Dalles de pierre calcaire : de grandes dalles de 120 cm sur 60, posées à joints décalés.
 * Une répétition couvre quatre rangées, soit 2,40 m de côté. Chaque dalle a sa nuance,
 * une ou deux veines pâles et un grain fin.
 */
export function stoneTexture(color: string, quality: Quality = TIERS.high): THREE.Texture {
  const size = quality.textureSize;
  const { c, g } = canvasOf(size, size);
  const px = size / 1024;
  const rows = 4;
  const rowH = size / rows;
  const slabW = size / 2;
  g.fillStyle = color;
  g.fillRect(0, 0, size, size);

  /** Dessine une dalle à sa place, et à nouveau de l'autre côté du bord pour que la texture se raccorde. */
  const eachSlab = (draw: (x: number, y: number, r: () => number) => void) => {
    for (let row = 0; row < rows; row++) {
      for (let k = 0; k < 2; k++) {
        const x = k * slabW + (row % 2 ? slabW / 2 : 0);
        for (const wrap of [-size, 0]) draw(x + wrap, row * rowH, rng(7 + row * 31 + k * 17));
      }
    }
  };
  eachSlab((x, y, r) => {
    g.fillStyle = shade(color, (r() - 0.5) * 0.09, (r() - 0.5) * 0.008);
    g.fillRect(x, y, slabW, rowH);
  });
  // Nuages de la pierre : de larges plages floues, communes à toutes les dalles.
  const r = rng(211);
  g.filter = `blur(${Math.round(size * 0.03)}px)`;
  for (let i = 0; i < 60; i++) {
    const x = r() * size;
    const y = r() * size;
    const rx = size * (0.04 + r() * 0.1);
    const ry = rx * (0.4 + r() * 0.6);
    const angle = r() * Math.PI;
    g.fillStyle = r() > 0.5 ? '#ffffff' : '#3a3024';
    g.globalAlpha = 0.02 + r() * 0.035;
    for (const dx of [-size, 0, size]) {
      for (const dy of [-size, 0, size]) {
        g.beginPath();
        g.ellipse(x + dx, y + dy, rx, ry, angle, 0, Math.PI * 2);
        g.fill();
      }
    }
  }
  g.filter = 'none';
  // Veines : une ou deux lignes pâles et sinueuses par dalle.
  eachSlab((x, y, rs) => {
    rs();
    rs();
    g.save();
    g.beginPath();
    g.rect(x, y, slabW, rowH);
    g.clip();
    const veins = 1 + Math.floor(rs() * 2);
    for (let v = 0; v < veins; v++) {
      const y0 = y + rs() * rowH;
      const slope = (rs() - 0.5) * 0.5;
      const wave = rowH * (0.03 + rs() * 0.06);
      const phase = rs() * 6;
      g.strokeStyle = rs() > 0.35 ? '#ffffff' : '#5a4c3a';
      g.globalAlpha = 0.05 + rs() * 0.07;
      g.lineWidth = (1 + rs() * 2.2) * px;
      g.beginPath();
      for (let t = 0; t <= 24; t++) {
        const xx = x + (slabW * t) / 24;
        const yy = y0 + (xx - x) * slope + Math.sin(phase + t * 0.55) * wave;
        if (t === 0) g.moveTo(xx, yy);
        else g.lineTo(xx, yy);
      }
      g.stroke();
    }
    g.restore();
  });
  // Grain fin.
  for (let i = 0; i < size * 12; i++) {
    g.fillStyle = r() > 0.5 ? '#ffffff' : '#2e261c';
    g.globalAlpha = 0.025 + r() * 0.045;
    g.fillRect(r() * size, r() * size, 1.5, 1.5);
  }
  // Joints : une ligne sombre, bordée d'un filet clair sur l'arête de la dalle voisine.
  const joint = Math.max(1.5, 2.6 * px);
  eachSlab((x, y) => {
    g.globalAlpha = 0.3;
    g.fillStyle = '#2e261c';
    g.fillRect(x, y - joint / 2, slabW, joint);
    g.fillRect(x - joint / 2, y, joint, rowH);
    g.globalAlpha = 0.1;
    g.fillStyle = '#ffffff';
    g.fillRect(x, y + joint / 2, slabW, joint * 0.7);
    g.fillRect(x + joint / 2, y, joint * 0.7, rowH);
  });
  // Le joint du bas de la dernière rangée est celui du haut de la première, une répétition plus loin.
  g.globalAlpha = 1;
  return tiling(c, quality);
}

/**
 * Badigeon de chaux : une peinture mate passée à la brosse, à peine nuagée.
 * La texture est presque blanche ; elle se multiplie avec la couleur du mur.
 */
let limewash: THREE.Texture | null = null;
export const WALL_TILE = 2.6;
export function limewashTexture(quality: Quality = TIERS.high): THREE.Texture {
  if (limewash) return limewash;
  const size = 512;
  const { c, g } = canvasOf(size, size);
  const r = rng(73);
  g.fillStyle = '#f7f7f7';
  g.fillRect(0, 0, size, size);
  const wrapped = (draw: (dx: number, dy: number) => void) => {
    for (const dx of [-size, 0, size]) for (const dy of [-size, 0, size]) draw(dx, dy);
  };
  // Nuages : des plages molles, à peine plus claires ou plus sombres que le fond.
  g.filter = `blur(${Math.round(size * 0.05)}px)`;
  for (let i = 0; i < 90; i++) {
    const x = r() * size;
    const y = r() * size;
    const rx = size * (0.04 + r() * 0.14);
    const ry = rx * (0.6 + r() * 0.8);
    const angle = r() * Math.PI;
    g.fillStyle = r() > 0.45 ? '#000000' : '#ffffff';
    g.globalAlpha = 0.004 + r() * 0.007;
    wrapped((dx, dy) => {
      g.beginPath();
      g.ellipse(x + dx, y + dy, rx, ry, angle, 0, Math.PI * 2);
      g.fill();
    });
  }
  // Passes de brosse : de courts traits en tous sens, presque invisibles un à un.
  g.filter = `blur(${Math.round(size * 0.012)}px)`;
  g.lineCap = 'round';
  for (let i = 0; i < 260; i++) {
    const x = r() * size;
    const y = r() * size;
    const length = size * (0.03 + r() * 0.07);
    const angle = r() * Math.PI;
    g.strokeStyle = r() > 0.5 ? '#000000' : '#ffffff';
    g.globalAlpha = 0.006 + r() * 0.01;
    g.lineWidth = size * (0.01 + r() * 0.02);
    wrapped((dx, dy) => {
      g.beginPath();
      g.moveTo(x + dx, y + dy);
      g.lineTo(x + dx + Math.cos(angle) * length, y + dy + Math.sin(angle) * length);
      g.stroke();
    });
  }
  g.filter = 'none';
  g.globalAlpha = 1;
  limewash = tiling(c, quality);
  return limewash;
}

/** Coupe un texte en lignes qui tiennent dans la largeur donnée, sans couper les mots. */
function wrapLabel(g: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const lines: string[] = [];
  let line = '';
  for (const word of text.split(' ')) {
    const next = line ? `${line} ${word}` : word;
    if (line && g.measureText(next).width > maxWidth) {
      lines.push(line);
      line = word;
    } else {
      line = next;
    }
  }
  if (line) lines.push(line);
  return lines;
}

/** Cartel posé à côté de l'œuvre. */
export function labelTexture(title: string, artist: string, year: string, quality: Quality = TIERS.high, dark = false): THREE.Texture {
  const { c, g } = canvasOf(512, 256);
  // Dans une salle obscure, un cartel blanc éblouirait : il devient sombre, à lettres claires.
  g.fillStyle = dark ? '#191a1d' : '#fbfaf6';
  g.fillRect(0, 0, 512, 256);
  g.fillStyle = dark ? '#ece7dc' : '#1c1b19';
  g.font = '600 40px Georgia, serif';
  g.fillText(artist, 32, 70, 448);
  // Un titre long se replie sur deux lignes plutôt que de se tasser.
  g.font = 'italic 34px Georgia, serif';
  const lines = wrapLabel(g, title, 448);
  if (lines.length > 1) g.font = 'italic 30px Georgia, serif';
  lines.slice(0, 2).forEach((line, i) => g.fillText(line, 32, (lines.length > 1 ? 118 : 128) + i * 38, 448));
  g.font = '28px Georgia, serif';
  g.fillStyle = dark ? '#a9a498' : '#5b5852';
  g.fillText(year, 32, lines.length > 1 ? 206 : 184, 448);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = quality.anisotropy;
  return tex;
}

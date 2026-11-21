import * as THREE from 'three';

/**
 * Relief d'une pièce de monnaie, déduit de sa photo.
 *
 * Une photo de monnaie est claire là où le métal est en saillie et accroche la lumière, sombre dans les creux.
 * On lit donc sa clarté comme une hauteur, et l'on en tire une carte de normales : posée sur la face de la pièce,
 * elle fait bouger les reflets quand le visiteur tourne autour. C'est une approximation, pas un relevé :
 * elle anime la surface sans prétendre la mesurer.
 */

/** Clarté de chaque pixel, de 0 à 1, à partir d'une image RVBA. */
export function luminance(pixels: ArrayLike<number>, count: number): Float32Array {
  const out = new Float32Array(count);
  for (let i = 0; i < count; i++) out[i] = (0.2126 * pixels[i * 4] + 0.7152 * pixels[i * 4 + 1] + 0.0722 * pixels[i * 4 + 2]) / 255;
  return out;
}

/** Adoucit une image de clarté (moyenne sur un carré de côté 2 × rayon + 1), pour ne pas graver le grain de la photo. */
export function soften(values: Float32Array, width: number, height: number, radius: number): Float32Array {
  if (radius < 1) return values;
  const pass = (src: Float32Array, horizontal: boolean) => {
    const out = new Float32Array(src.length);
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        let sum = 0;
        let n = 0;
        for (let k = -radius; k <= radius; k++) {
          const xx = horizontal ? x + k : x;
          const yy = horizontal ? y : y + k;
          if (xx < 0 || yy < 0 || xx >= width || yy >= height) continue;
          sum += src[yy * width + xx];
          n += 1;
        }
        out[y * width + x] = sum / n;
      }
    }
    return out;
  };
  return pass(pass(values, true), false);
}

/**
 * Carte de normales (RVBA, 0 à 255) d'un relief donné par sa hauteur. `strength` règle sa vigueur.
 * Convention de three.js : rouge vers la droite, vert vers le haut de l'image, bleu vers le visiteur.
 */
export function reliefNormals(heights: Float32Array, width: number, height: number, strength: number): Uint8ClampedArray {
  const out = new Uint8ClampedArray(width * height * 4);
  const at = (x: number, y: number) => heights[Math.min(height - 1, Math.max(0, y)) * width + Math.min(width - 1, Math.max(0, x))];
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const dx = (at(x + 1, y) - at(x - 1, y)) * strength;
      const dy = (at(x, y + 1) - at(x, y - 1)) * strength;
      const length = Math.hypot(dx, dy, 1);
      const i = (y * width + x) * 4;
      out[i] = (-dx / length) * 127.5 + 127.5;
      out[i + 1] = (dy / length) * 127.5 + 127.5;
      out[i + 2] = (1 / length) * 127.5 + 127.5;
      out[i + 3] = 255;
    }
  }
  return out;
}

/**
 * Texture de relief d'une face de pièce, calculée dans le navigateur à partir de son image. L'image est d'abord
 * adoucie : les lettres et les motifs font le relief, pas le grain du métal ni celui de la photo.
 */
export function reliefTexture(image: CanvasImageSource, size = 512, strength = 14): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const context = canvas.getContext('2d', { willReadFrequently: true })!;
  context.drawImage(image, 0, 0, size, size);
  const data = context.getImageData(0, 0, size, size);
  const heights = soften(luminance(data.data, size * size), size, size, 4);
  data.data.set(reliefNormals(heights, size, size, strength));
  context.putImageData(data, 0, 0);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.NoColorSpace;
  return texture;
}

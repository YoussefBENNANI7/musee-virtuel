import type { ImageSource } from './types';

export type FileImage = Extract<ImageSource, { src: string }>;

/**
 * Adresse de la version d'une image la mieux adaptée à une taille d'affichage
 * (grand côté, en pixels). Les versions allégées sont produites par `npm run images`
 * et rangées dans un dossier `web/` à côté de l'original : images/nom.webp → images/web/nom-1024.webp.
 * Sans version allégée, on sert l'original.
 */
export function imageUrl(image: FileImage, base: string, size: number): string {
  const variants = [...(image.variants ?? [])].sort((a, b) => a - b);
  if (variants.length === 0) return new URL(image.src, base).href;
  // La plus petite version qui suffit ; à défaut, la plus grande disponible.
  const chosen = variants.find((v) => v >= size) ?? variants[variants.length - 1];
  const slash = image.src.lastIndexOf('/');
  const folder = image.src.slice(0, slash + 1);
  const name = image.src.slice(slash + 1).replace(/\.[^.]+$/, '');
  return new URL(`${folder}web/${name}-${chosen}.webp`, base).href;
}

/** Liste « adresse largeur » de toutes les versions, pour laisser le navigateur choisir (attribut srcset). */
export function imageSrcset(image: FileImage, base: string): string | null {
  if (!image.variants?.length || !image.width || !image.height) return null;
  const landscape = image.width >= image.height;
  return image.variants
    .map((v) => `${imageUrl(image, base, v)} ${landscape ? v : Math.round((v * image.width!) / image.height!)}w`)
    .join(', ');
}

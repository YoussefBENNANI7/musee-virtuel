import * as THREE from 'three';
import type { Decor } from './decors';
import type { LetteringConfig } from './types';

/**
 * Lettrage mural : un titre de section ou un court texte, posé sur un mur comme des lettres adhésives.
 * Le texte est dessiné dans une image à fond transparent, refaite quand le visiteur change de langue.
 */

export const LETTERING = {
  /** Hauteur d'une ligne, en mètres, et hauteur du centre du lettrage, quand la configuration n'en dit rien. */
  title: { height: 0.22, y: 2.3 },
  text: { height: 0.055, y: 1.5 },
  /** Largeur d'un paragraphe, en mètres. */
  width: 1.6,
  /** Interligne d'un paragraphe, en hauteurs de ligne. */
  leading: 1.5,
};

/** Hauteur d'une ligne d'un lettrage, en mètres. */
export const lineHeight = (cfg: Pick<LetteringConfig, 'kind' | 'height'>): number => cfg.height ?? (cfg.kind === 'text' ? LETTERING.text.height : LETTERING.title.height);

/**
 * Coupe un texte en lignes qui tiennent dans une largeur. `measure` donne la largeur d'un bout de texte,
 * dans la même unité que `max`. Un retour à la ligne du texte est respecté ; un mot trop long reste entier.
 */
export function wrapLines(text: string, max: number, measure: (part: string) => number): string[] {
  const lines: string[] = [];
  for (const paragraph of text.split('\n')) {
    let line = '';
    for (const word of paragraph.split(/\s+/).filter(Boolean)) {
      const longer = line ? `${line} ${word}` : word;
      if (line && measure(longer) > max) {
        lines.push(line);
        line = word;
      } else {
        line = longer;
      }
    }
    lines.push(line);
  }
  return lines;
}

/** Couleur des lettres : celle demandée, sinon sombre sur un mur clair et claire sur un mur sombre. */
export function letteringColor(cfg: Pick<LetteringConfig, 'color'>, decor: Pick<Decor, 'colors'>): string {
  if (cfg.color) return cfg.color;
  const wall = new THREE.Color(decor.colors.wall).getHSL({ h: 0, s: 0, l: 0 }).l;
  return wall > 0.5 ? '#2b221b' : '#efe3c8';
}

/**
 * Dessine le lettrage. Renvoie sa texture et sa taille sur le mur, en mètres.
 * `sharp` : 1 pour l'image la plus fine, moins sur un appareil modeste.
 */
export function drawLettering(cfg: LetteringConfig, text: string, color: string, sharp = 1): { texture: THREE.CanvasTexture; width: number; height: number } {
  const isText = cfg.kind === 'text';
  const line = lineHeight(cfg);
  // Points de l'image par ligne de texte : un titre se lit de loin, un texte de près.
  const px = Math.round((isText ? 44 : 120) * sharp);
  const font = isText ? `400 ${Math.round(px * 0.74)}px "Helvetica Neue", Helvetica, Arial, sans-serif` : `600 ${Math.round(px * 0.8)}px Georgia, "Times New Roman", serif`;
  const canvas = document.createElement('canvas');
  const g = canvas.getContext('2d')!;
  g.font = font;
  const maxWidth = ((cfg.width ?? LETTERING.width) / line) * px;
  const lines = isText ? wrapLines(text, maxWidth, (part) => g.measureText(part).width) : [text];
  const step = isText ? px * LETTERING.leading : px;
  const widest = Math.max(1, ...lines.map((l) => g.measureText(l).width));
  // Une image ne dépasse pas 2048 points de large : au-delà, le texte est réduit dans l'image, pas sur le mur.
  const fit = Math.min(1, 2048 / (widest + 8));
  canvas.width = Math.ceil((widest + 8) * fit);
  canvas.height = Math.ceil((step * (lines.length - 1) + px * 1.25) * fit);
  g.scale(fit, fit);
  g.font = font;
  g.fillStyle = color;
  g.textBaseline = 'alphabetic';
  // Un titre est centré sur son point d'accroche ; un paragraphe est aligné à gauche.
  g.textAlign = isText ? 'left' : 'center';
  lines.forEach((l, i) => g.fillText(l, isText ? 4 : (widest + 8) / 2, px * 0.92 + step * i));
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  const height = (canvas.height / fit / px) * line;
  return { texture, width: (canvas.width / canvas.height) * height, height };
}

/** Le lettrage sur son mur : `holder` est le repère du mur (x le long du mur, y vers le haut, z vers la salle). */
export function buildLettering(cfg: LetteringConfig, holder: THREE.Object3D): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false, toneMapped: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }));
  mesh.name = 'lettrage';
  mesh.position.set(cfg.offset ?? 0, cfg.y ?? (cfg.kind === 'text' ? LETTERING.text.y : LETTERING.title.y), 0.004);
  mesh.raycast = () => {};
  holder.add(mesh);
  return mesh;
}

/**
 * Lettrage sur un mur courbe vu de l'intérieur (rotonde) : le plan est cintré pour épouser le mur, de rayon `radius`.
 * Un plan droit s'enfoncerait dans le mur par ses deux bouts. Remplace la mise à l'échelle d'un lettrage droit.
 */
export function bendLettering(mesh: THREE.Mesh, width: number, height: number, radius: number) {
  const geometry = new THREE.PlaneGeometry(width, height, Math.max(1, Math.ceil(width / 0.08)), 1);
  const position = geometry.attributes.position;
  for (let i = 0; i < position.count; i++) {
    const a = position.getX(i) / radius;
    position.setXYZ(i, radius * Math.sin(a), position.getY(i), radius * (1 - Math.cos(a)));
  }
  mesh.geometry.dispose();
  mesh.geometry = geometry;
  mesh.scale.set(1, 1, 1);
}

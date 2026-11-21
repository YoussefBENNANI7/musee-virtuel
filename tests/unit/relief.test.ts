import { describe, expect, it } from 'vitest';
import { luminance, reliefNormals, soften } from '../../src/engine/relief';

describe('relief d’une pièce, déduit de sa photo', () => {
  it('lit la clarté de chaque pixel, de 0 à 1', () => {
    const pixels = [0, 0, 0, 255, 255, 255, 255, 255, 255, 0, 0, 255];
    const clarte = luminance(pixels, 3);
    expect(clarte[0]).toBe(0);
    expect(clarte[1]).toBeCloseTo(1, 5);
    // Le rouge seul pèse peu dans la clarté.
    expect(clarte[2]).toBeCloseTo(0.2126, 4);
  });

  it('adoucit le grain sans déplacer la clarté moyenne', () => {
    const grain = new Float32Array(25).map((_, i) => (i % 2 ? 1 : 0));
    const doux = soften(grain, 5, 5, 1);
    const moyenne = (values: Float32Array) => values.reduce((a, b) => a + b, 0) / values.length;
    expect(Math.max(...doux) - Math.min(...doux)).toBeLessThan(0.5);
    expect(moyenne(doux)).toBeCloseTo(moyenne(grain), 1);
    // Sans rayon, rien ne change.
    expect(soften(grain, 5, 5, 0)).toBe(grain);
  });

  it('une surface plane donne une normale droite, partout', () => {
    const normales = reliefNormals(new Float32Array(16).fill(0.4), 4, 4, 10);
    for (let i = 0; i < 16; i++) expect([...normales.slice(i * 4, i * 4 + 4)]).toEqual([128, 128, 255, 255]);
  });

  it('une pente penche la normale du côté qui descend', () => {
    // La hauteur monte vers la droite : la surface regarde vers la gauche (rouge sous 128), ni vers le haut ni vers le bas.
    const pente = new Float32Array(9).map((_, i) => (i % 3) * 0.1);
    const normales = reliefNormals(pente, 3, 3, 10);
    const centre = 4 * 4;
    expect(normales[centre]).toBeLessThan(100);
    expect(normales[centre + 1]).toBe(128);
    expect(normales[centre + 2]).toBeLessThan(255);
    // La hauteur monte vers le bas de l'image : la surface regarde vers le haut (vert au-dessus de 128).
    const versLeBas = new Float32Array(9).map((_, i) => Math.floor(i / 3) * 0.1);
    expect(reliefNormals(versLeBas, 3, 3, 10)[centre + 1]).toBeGreaterThan(150);
    // Plus de vigueur, plus de pente.
    expect(reliefNormals(pente, 3, 3, 30)[centre]).toBeLessThan(normales[centre]);
  });
});

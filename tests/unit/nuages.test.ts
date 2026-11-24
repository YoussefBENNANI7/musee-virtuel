import { describe, expect, it } from 'vitest';
import { applyLayers, blurredBlots, gridStep, type Blot } from '../../src/engine/nuages';

const sum = (values: Float32Array) => values.reduce((a, b) => a + b, 0);
/** Texture unie et opaque, en pixels RVBA. */
const plain = (size: number, gray: number) => new Uint8ClampedArray(size * size * 4).map((_, i) => (i % 4 === 3 ? 255 : gray));
const disc = (x: number, y: number, radius: number, ink: number, alpha: number): Blot => ({ shape: 'ellipse', x, y, rx: radius, ry: radius, angle: 0, ink, alpha });

describe('nuages des textures : taches floutées sur une grille', () => {
  it('choisit une grille d’au moins trois cases par écart type du flou, qui divise la texture', () => {
    expect(gridStep(512, 26)).toBe(8);
    expect(gridStep(512, 6)).toBe(2);
    expect(gridStep(1024, 31)).toBe(8);
    expect(gridStep(1024, 51)).toBe(16);
    // Un petit flou se calcule en pleine définition.
    expect(gridStep(512, 2)).toBe(1);
    expect(gridStep(1000, 51)).toBe(8);
  });

  it('le flou étale une tache sans changer la quantité d’encre déposée', () => {
    const layer = blurredBlots(512, 26, [disc(256, 256, 40, 0, 0.02)], 1);
    const cell = layer.step * layer.step;
    // Un disque de 40 pixels de rayon, posé à 2 % : son aire × 2 %, à 1 % près.
    const expected = Math.PI * 40 * 40 * 0.02;
    expect(Math.abs(sum(layer.inks[0]) * cell - expected) / expected).toBeLessThan(0.01);
    // Ce que la tache dépose, elle le cache du fond.
    expect(sum(layer.ground.map((v) => 1 - v)) * cell).toBeCloseTo(sum(layer.inks[0]) * cell, 3);
  });

  it('le flou suit l’écart type demandé', () => {
    // Une très petite tache, floutée de 26 pixels : son encre s'étale avec un écart type de 26 pixels.
    const layer = blurredBlots(512, 26, [disc(256, 256, 2, 0, 0.5)], 1);
    const { side, step, inks } = layer;
    let mass = 0;
    let spread = 0;
    for (let j = 0; j < side; j++) {
      for (let i = 0; i < side; i++) {
        const v = inks[0][j * side + i];
        mass += v;
        spread += v * ((i + 0.5) * step - 256) ** 2;
      }
    }
    expect(Math.sqrt(spread / mass)).toBeCloseTo(26, 0);
  });

  it('une tache qui dépasse un bord revient par le bord opposé : la texture se raccorde', () => {
    const across = blurredBlots(512, 26, [disc(-20, 300, 60, 0, 0.03)], 1);
    const inside = blurredBlots(512, 26, [disc(492, 300, 60, 0, 0.03)], 1);
    for (let i = 0; i < across.inks[0].length; i++) expect(across.inks[0][i]).toBeCloseTo(inside.inks[0][i], 6);
    // Les colonnes de part et d'autre du bord se suivent sans saut.
    const pixels = plain(512, 200);
    applyLayers(pixels, 512, [{ layer: across, colors: [[0, 0, 0]] }]);
    const at = (x: number, y: number) => pixels[(y * 512 + x) * 4];
    expect(Math.abs(at(0, 300) - at(511, 300))).toBeLessThanOrEqual(1);
    expect(at(0, 300)).toBeLessThan(200);
  });

  it('les taches se posent dans l’ordre, comme sur le canvas : la dernière passe devant', () => {
    // Deux grands disques à 50 % sur un gris moyen, le blanc puis le noir. Au centre : (128 + ½ × (255 − 128)) × ½.
    const layer = blurredBlots(512, 6, [disc(256, 256, 200, 0, 0.5), disc(256, 256, 200, 1, 0.5)], 2);
    const pixels = plain(512, 128);
    applyLayers(pixels, 512, [{ layer, colors: [[255, 255, 255], [0, 0, 0]] }]);
    expect(pixels[(256 * 512 + 256) * 4]).toBe(96);
    // Loin des disques, le fond ne change pas, et la texture reste opaque.
    expect(pixels[(5 * 512 + 5) * 4]).toBe(128);
    expect(pixels[(256 * 512 + 256) * 4 + 3]).toBe(255);
  });

  it('un trait aux bouts arrondis couvre son segment et sa demi-largeur autour', () => {
    // Un trait de 100 pixels sur 10 de large : 100 × 10 plus les deux demi-disques des bouts.
    const stroke: Blot = { shape: 'stroke', x0: 200, y0: 256, x1: 300, y1: 256, width: 10, ink: 0, alpha: 0.1 };
    const layer = blurredBlots(512, 6, [stroke], 1);
    const expected = (100 * 10 + Math.PI * 25) * 0.1;
    expect(Math.abs(sum(layer.inks[0]) * layer.step ** 2 - expected) / expected).toBeLessThan(0.01);
  });

  it('calculé sur la grille puis agrandi, le calque vaut à un dixième de niveau près le calcul en pleine définition', () => {
    // Des taches comme celles du badigeon, mais vingt fois plus marquées, pour que l'écart se mesure.
    const blots: Blot[] = [
      { shape: 'ellipse', x: 40, y: 50, rx: 22, ry: 12, angle: 0.6, ink: 0, alpha: 0.2 },
      { shape: 'ellipse', x: 90, y: 70, rx: 30, ry: 20, angle: 2.1, ink: 1, alpha: 0.2 },
      { shape: 'stroke', x0: 10, y0: 110, x1: 60, y1: 95, width: 8, ink: 0, alpha: 0.2 },
    ];
    const render = (step?: number) => {
      const pixels = plain(128, 160);
      applyLayers(pixels, 128, [{ layer: blurredBlots(128, 12, blots, 2, step), colors: [[0, 0, 0], [255, 255, 255]] }]);
      return pixels;
    };
    const coarse = render();
    const fine = render(1);
    let worst = 0;
    for (let i = 0; i < coarse.length; i++) worst = Math.max(worst, Math.abs(coarse[i] - fine[i]));
    // Ici l'écart d'arrondi seul peut atteindre un niveau ; sur une vraie texture, vingt fois plus pâle, il disparaît.
    expect(worst).toBeLessThanOrEqual(1);
  });
});

import { describe, expect, it } from 'vitest';
import { inspectRange } from '../../src/inspect';

// Caméra de la visite : champ vertical de 68°, écran 16:9.
const tan = Math.tan((68 * Math.PI) / 360);
const aspect = 16 / 9;
/** Part de la hauteur de l'écran qu'occupe un objet de hauteur h, vu à la distance d. */
const fill = (h: number, d: number) => h / (2 * d * tan);

describe('examen d’un objet : distances', () => {
  it('une statue haute et étroite garde le cadrage d’origine', () => {
    // 1,70 m de haut, 50 cm d'emprise : son rayon vu de dessus compte peu devant le recul.
    const { start, min, max } = inspectRange(1.7, 0.5, 0.35, tan, aspect);
    expect(start).toBeCloseTo(1.45 * (1.7 / (2 * tan)), 1);
    expect(min).toBeCloseTo(0.5025, 3);
    expect(max).toBeCloseTo(start * 1.7, 6);
  });

  it('un coffre aussi profond que haut tient à l’écran, même vu par un angle', () => {
    // 27 cm de haut, 32 × 31 cm : son coin le plus proche est à 22 cm du centre.
    const reach = Math.hypot(0.32, 0.313) / 2;
    const { start, min } = inspectRange(0.268, 0.334, reach, tan, aspect);
    // Avant le réglage, la caméra partait à 29 cm du centre : la face avant, à 13 cm, débordait de l'écran.
    expect(start).toBeGreaterThan(0.45);
    // À la distance de son coin le plus proche, le coffre occupe moins que toute la hauteur de l'écran.
    expect(fill(0.268, start - reach)).toBeLessThan(0.9);
    // Et il reste présent : vu de face, il occupe plus du tiers de l'écran.
    expect(fill(0.268, start)).toBeGreaterThan(0.35);
    // On ne s'approche jamais jusqu'à entrer dans l'objet.
    expect(min).toBeGreaterThan(reach + 0.05);
    expect(min).toBeLessThan(start);
  });

  it('une pièce de monnaie se regarde toujours d’aussi près', () => {
    // Une pièce de 3 cm, plate : rien d'elle n'avance vers la caméra, ses distances sont celles d'avant le réglage.
    const radius = Math.max(0.03, 0.03 * 1.6) / 2;
    const before = Math.min(radius * 0.45 + 0.12, radius * 2.5 + 0.06);
    const { start, min, max } = inspectRange(0.03, 0.03 * 1.6, 0, tan, aspect);
    expect(min).toBeCloseTo(before, 9);
    expect(start).toBeCloseTo(before * 1.2, 9);
    expect(max).toBeCloseTo(before * 1.2 * 1.7, 9);
  });
});

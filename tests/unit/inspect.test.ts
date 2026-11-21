import { describe, expect, it } from 'vitest';
import { coinLens, inspectPitch, inspectRange } from '../../src/inspect';

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

  it('un très petit objet plat se regarde toujours d’aussi près', () => {
    // Un objet de 3 cm, plat : rien de lui n'avance vers la caméra, ses distances sont celles d'avant le réglage.
    // (Une pièce de monnaie, elle, se regarde à la loupe : voir plus bas.)
    const radius = Math.max(0.03, 0.03 * 1.6) / 2;
    const before = Math.min(radius * 0.45 + 0.12, radius * 2.5 + 0.06);
    const { start, min, max } = inspectRange(0.03, 0.03 * 1.6, 0, tan, aspect);
    expect(min).toBeCloseTo(before, 9);
    expect(start).toBeCloseTo(before * 1.2, 9);
    expect(max).toBeCloseTo(before * 1.2 * 1.7, 9);
  });
});

describe('examen d’une pièce de monnaie : la loupe', () => {
  /** Part de la hauteur de l'écran qu'occupe une pièce vue de face à cette distance. */
  const share = (diameter: number, fov: number, distance: number) => diameter / (2 * distance * Math.tan((fov * Math.PI) / 360));

  it('au départ, une grande pièce et une petite occupent la même part de l’écran', () => {
    const ryal = coinLens(0.037, 16 / 10);
    const denier = coinLens(0.018, 16 / 10);
    expect(share(0.037, ryal.fov, ryal.start)).toBeCloseTo(0.7, 6);
    expect(share(0.018, denier.fov, denier.start)).toBeCloseTo(0.7, 6);
    // Le champ se resserre pour la petite pièce : c'est une loupe plus forte.
    expect(denier.fov).toBeLessThan(ryal.fov);
    expect(ryal.fov).toBeLessThan(30);
  });

  it('sur un téléphone tenu en hauteur, la pièce tient dans la largeur', () => {
    const aspect = 390 / 844;
    const { fov, start } = coinLens(0.037, aspect);
    expect(share(0.037, fov, start) / aspect).toBeCloseTo(0.7, 6);
  });

  it('de près on lit les détails, sans jamais passer en deçà de ce que la caméra montre', () => {
    for (const diameter of [0.014, 0.018, 0.026, 0.037]) {
      const { fov, start, min, max } = coinLens(diameter, 16 / 10);
      expect(min).toBeLessThan(start);
      expect(max).toBeGreaterThan(start);
      // La pièce déborde de l'écran quand on s'approche au plus près : on en lit les détails.
      expect(share(diameter, fov, min)).toBeGreaterThan(1.2);
      // Vue par la tranche, son bord le plus proche reste au-delà des 5 cm que la caméra ne montre pas.
      expect(min - diameter / 2).toBeGreaterThan(0.05);
    }
  });
});

describe('examen d’un objet : angle de départ', () => {
  it('une statue, ou un objet aussi haut que large, se regarde presque de face, comme avant', () => {
    expect(inspectPitch(1.7, 0.5)).toBe(0.12);
    expect(inspectPitch(0.3, 0.3)).toBe(0.12);
  });

  it('un petit appareil posé à plat se regarde de haut : de face, on n’en verrait que la tranche', () => {
    // 7 cm d'épaisseur pour 27 cm de long : la caméra part à une quarantaine de degrés au-dessus de l'horizontale.
    const pitch = inspectPitch(0.07, 0.27);
    expect(pitch).toBeGreaterThan(0.6);
    expect(pitch).toBeLessThanOrEqual(0.8);
  });

  it('plus l’objet est plat, plus on part de haut, sans jamais passer à la verticale', () => {
    expect(inspectPitch(0.14, 0.25)).toBeGreaterThan(inspectPitch(0.22, 0.3));
    expect(inspectPitch(0.01, 1)).toBe(0.8);
    expect(inspectPitch(0.2, 0)).toBe(0.12);
  });
});

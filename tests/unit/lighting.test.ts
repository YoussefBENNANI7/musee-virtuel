import { Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { formFactor, lightAt, roomLight, skylightOpening, sunPatch } from '../../src/engine/lighting';
import type { RoomConfig } from '../../src/engine/types';

const UP = new Vector3(0, 1, 0);
const DOWN = new Vector3(0, -1, 0);
const square = (half: number, y: number) => [
  new Vector3(-half, y, -half),
  new Vector3(half, y, -half),
  new Vector3(half, y, half),
  new Vector3(-half, y, half),
];

const room = (extra: Partial<RoomConfig> = {}): RoomConfig => ({
  id: 'salle',
  name: { fr: 'Salle' },
  position: [0, 0],
  size: [10, 4, 8],
  artworks: [],
  ...extra,
});

describe('part du ciel occupée par une surface lumineuse', () => {
  it('vaut presque 1 sous un plafond immense, et diminue quand il rétrécit', () => {
    const origin = new Vector3();
    expect(formFactor(origin, UP, square(1000, 3))).toBeCloseTo(1, 3);
    const wide = formFactor(origin, UP, square(3, 3));
    const narrow = formFactor(origin, UP, square(1, 3));
    expect(wide).toBeGreaterThan(narrow);
    expect(narrow).toBeGreaterThan(0);
  });

  it('retrouve la valeur exacte pour un carré vu de face', () => {
    // Carré de côté 2 à la hauteur 1, vu depuis le dessous de son centre : valeur connue.
    const a = 1 / Math.sqrt(2);
    const exact = (4 / Math.PI) * a * Math.atan(a);
    expect(formFactor(new Vector3(), UP, square(1, 1))).toBeCloseTo(exact, 6);
  });

  it('est nulle pour une surface qui tourne le dos à la lumière', () => {
    expect(formFactor(new Vector3(), DOWN, square(3, 3))).toBe(0);
  });

  it('est nulle pour une surface située dans le plan même de la lumière', () => {
    // Un plafond lumineux n'éclaire pas le plafond, au centre comme au bord.
    expect(formFactor(new Vector3(0, 3, 0), DOWN, square(3, 3))).toBe(0);
    expect(formFactor(new Vector3(2.9, 3, 0), DOWN, square(3, 3))).toBe(0);
  });

  it('ne compte que la partie de la lumière située devant un mur', () => {
    // Mur vertical au milieu du plafond : il n'en voit que la moitié.
    const wallPoint = new Vector3(0, 1.5, 0);
    const facingEast = new Vector3(1, 0, 0);
    const half = formFactor(wallPoint, facingEast, square(4, 3));
    const eastHalf = [new Vector3(0, 3, -4), new Vector3(4, 3, -4), new Vector3(4, 3, 4), new Vector3(0, 3, 4)];
    expect(half).toBeCloseTo(formFactor(wallPoint, facingEast, eastHalf), 6);
    expect(half).toBeGreaterThan(0);
  });

  it('ne produit jamais de valeur aberrante, même au contact de la lumière', () => {
    for (const p of [new Vector3(3, 3, 3), new Vector3(3, 2.999, 0), new Vector3(0, 3, 3), new Vector3(2.5, 0, 2.5)]) {
      for (const n of [UP, DOWN, new Vector3(1, 0, 0), new Vector3(0, 0, -1)]) {
        const f = formFactor(p, n, square(3, 3));
        expect(Number.isFinite(f)).toBe(true);
        expect(f).toBeGreaterThanOrEqual(0);
        expect(f).toBeLessThanOrEqual(1);
      }
    }
  });
});

describe('éclairage d’une salle', () => {
  const light = roomLight(room(), 0.4);

  it('éclaire mieux le centre du sol que ses bords', () => {
    const center = lightAt(light, new Vector3(0, 0, 0), UP);
    const edge = lightAt(light, new Vector3(4.7, 0, 0), UP);
    const corner = lightAt(light, new Vector3(4.7, 0, 3.7), UP);
    expect(center).toBeGreaterThan(edge);
    expect(edge).toBeGreaterThan(corner);
  });

  it('assombrit le bas des murs et leurs angles', () => {
    const facingEast = new Vector3(1, 0, 0);
    const at = (y: number, z: number) => lightAt(light, new Vector3(-4.8, y, z), facingEast);
    expect(at(3, 0)).toBeGreaterThan(at(0.2, 0));
    expect(at(1.6, 0)).toBeGreaterThan(at(1.6, 3.7));
  });

  it('garde partout une lumière minimale et ne dépasse pas la pleine lumière', () => {
    for (const p of [new Vector3(0, 0, 0), new Vector3(4.8, 0.01, 3.8), new Vector3(0, 4, 0)]) {
      for (const n of [UP, DOWN, new Vector3(-1, 0, 0)]) {
        const value = lightAt(light, p, n);
        expect(value).toBeGreaterThanOrEqual(light.ambient);
        expect(value).toBeLessThanOrEqual(1.06);
      }
    }
  });

  it('tamise toute la salle quand son niveau d’éclairage baisse', () => {
    const dim = roomLight(room({ light: 0.5 }), 0.4);
    const p = new Vector3(1, 0, 1);
    expect(lightAt(dim, p, UP)).toBeCloseTo(lightAt(light, p, UP) / 2, 5);
  });

  it('concentre la lumière sous la verrière', () => {
    const sky = roomLight(room({ size: [10, 7, 10], ceiling: { type: 'skylight', margin: 2 } }), 0.4);
    expect(sky.daylight).toBe(true);
    expect(light.daylight).toBe(false);
    const under = lightAt(sky, new Vector3(0, 0, 0), UP);
    const aside = lightAt(sky, new Vector3(4.5, 0, 4.5), UP);
    expect(under).toBeGreaterThan(aside + 0.1);
  });
});

describe('verrière et tache de soleil', () => {
  it('une salle à plafond plein n’a ni verrière ni tache de soleil', () => {
    expect(skylightOpening(room())).toBeNull();
    expect(sunPatch(room())).toBeNull();
  });

  it('la tache de soleil a la taille de la verrière et reste sur le sol de la salle', () => {
    for (const margin of [0.6, 1.2, 2.5]) {
      const r = room({ position: [20, -5], size: [12, 7, 10], ceiling: { type: 'skylight', margin } });
      const opening = skylightOpening(r)!;
      const patch = sunPatch(r)!;
      expect(patch.width).toBeCloseTo(12 - margin * 2);
      expect(patch.depth).toBeCloseTo(10 - margin * 2);
      expect(Math.abs(patch.center.x - 20) + opening.width / 2).toBeLessThanOrEqual(6);
      expect(Math.abs(patch.center.z + 5) + opening.depth / 2).toBeLessThanOrEqual(5);
    }
  });
});

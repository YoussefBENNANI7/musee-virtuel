import { Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { resolveDecor } from '../../src/engine/decors';
import { MAX_LIGHT, brightness, colorAt, doorSpill, formFactor, lightAt, roomLight, skylightOpening, sunPatch } from '../../src/engine/lighting';
import { STYLES } from '../../src/engine/styles';
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

describe('éclairage selon le décor', () => {
  const style = STYLES.contemporary;
  const lightOf = (r: RoomConfig) => roomLight(r, 0.4, resolveDecor(style, r));
  const facingEast = new Vector3(1, 0, 0);

  it('sans décor particulier, rien ne change', () => {
    const plain = roomLight(room(), 0.4);
    const styled = lightOf(room());
    for (const p of [new Vector3(0, 0, 0), new Vector3(-4.8, 3, 1), new Vector3(2, 4, -3)]) {
      for (const n of [UP, DOWN, facingEast]) expect(lightAt(styled, p, n)).toBeCloseTo(lightAt(plain, p, n), 10);
    }
    expect(styled.tint).toEqual([1, 1, 1]);
    expect(styled.extra).toEqual([]);
  });

  it('le niveau d’éclairage du décor tamise toute la salle', () => {
    const dim = lightOf(room({ decor: { light: { level: 0.5 } } }));
    const full = lightOf(room());
    const p = new Vector3(1, 0, 1);
    expect(lightAt(dim, p, UP)).toBeCloseTo(lightAt(full, p, UP) / 2, 5);
    expect(brightness(dim)).toBeCloseTo(brightness(full) / 2, 5);
  });

  it('la gorge d’un plafond flottant lave le haut des murs, bien au-delà de la pleine lumière', () => {
    const cove = lightOf(room({ ceiling: { type: 'cove', inset: 0.3, drop: 0.3 } }));
    const flat = lightOf(room());
    // Mur ouest, dont la surface est en x = -4,8 ; le plafond est à 4 m.
    const at = (light: typeof cove, y: number) => lightAt(light, new Vector3(-4.8, y, 0), facingEast);
    expect(at(cove, 3.95)).toBeGreaterThan(1.3);
    expect(at(cove, 3.95)).toBeGreaterThan(at(cove, 3.4) + 0.3);
    expect(at(cove, 3.4)).toBeGreaterThan(at(cove, 2) + 0.1);
    // À hauteur d'œil, la gorge ne compte presque plus : le mur n'est guère plus clair que sous un plafond plein.
    expect(Math.abs(at(cove, 1.5) - at(flat, 1.5))).toBeLessThan(0.15);
    expect(at(cove, 3.99)).toBeLessThanOrEqual(MAX_LIGHT);
  });

  it('le panneau flottant, lui, ne reçoit rien de la gorge qui l’entoure', () => {
    const r = room({ ceiling: { type: 'cove', inset: 0.3, drop: 0.3 } });
    const cove = lightOf(r);
    const under = new Vector3(0, 3.7, 0);
    const withoutCove = { ...cove, extra: [] };
    expect(lightAt(cove, under, DOWN)).toBeCloseTo(lightAt(withoutCove, under, DOWN), 10);
  });

  it('une verrière déclarée sur la salle l’emporte sur le plafond du décor', () => {
    const sky = lightOf(room({ size: [10, 7, 10], decor: 'argile-claire', ceiling: { type: 'skylight', margin: 2 } }));
    expect(sky.daylight).toBe(true);
    expect(sky.extra).toEqual([]);
  });

  it('la teinte du décor colore la lumière sans changer sa force', () => {
    const warm = lightOf(room({ decor: { light: { tint: '#ffe0c0' } } }));
    const p = new Vector3(1, 0, 1);
    const [r, g, b] = colorAt(warm, p, UP);
    expect(r).toBeCloseTo(lightAt(warm, p, UP), 6);
    expect(g).toBeLessThan(r);
    expect(b).toBeLessThan(g);
    // Lumière blanche : les trois composantes valent la lumière reçue.
    const white = lightOf(room());
    expect(colorAt(white, p, UP)).toEqual([lightAt(white, p, UP), lightAt(white, p, UP), lightAt(white, p, UP)]);
  });
});

describe('lumière entrant par une porte', () => {
  const style = STYLES.contemporary;
  // Salle sombre de 10 × 8 m ; porte de 2,4 m au milieu de son mur sud, limite en z = 4.
  // Murs de 0,40 m : la lumière entre au nu du mur de la salle claire, en z = 4,2.
  const darkRoom = room({ decor: 'nuit' });
  const dark = roomLight(darkRoom, 0.4, resolveDecor(style, darkRoom));
  const bright = roomLight(room({ position: [0, 9], size: [10, 4, 10] }), 0.4);
  const door = { center: new Vector3(0, 0, 4.2), tangent: new Vector3(1, 0, 0) };
  const spill = doorSpill(dark, bright, door.center, door.tangent, 2.4, 2.9)!;

  it('n’existe que vers la salle la plus sombre', () => {
    expect(spill).not.toBeNull();
    expect(doorSpill(bright, dark, door.center, door.tangent, 2.4, 2.9)).toBeNull();
    expect(doorSpill(bright, bright, door.center, door.tangent, 2.4, 2.9)).toBeNull();
  });

  it('éclaire le sol près de la porte, de moins en moins en s’éloignant', () => {
    const lit = { ...dark, extra: [spill] };
    const gain = (z: number, x = 0) => lightAt(lit, new Vector3(x, 0, z), UP) - lightAt(dark, new Vector3(x, 0, z), UP);
    expect(gain(3.7)).toBeGreaterThan(0.15);
    expect(gain(3.7)).toBeGreaterThan(gain(2.5));
    expect(gain(2.5)).toBeGreaterThan(gain(0));
    expect(gain(-3)).toBeLessThan(0.02);
    // Loin sur le côté, le long du mur de la porte, il n'arrive presque rien.
    expect(gain(3.7, 4.5)).toBeLessThan(gain(3.7) / 4);
  });

  it('au seuil, le sol de la salle sombre rejoint à peu près la clarté de sa voisine', () => {
    const lit = { ...dark, extra: [spill] };
    const threshold = lightAt(lit, new Vector3(0, 0, 4), UP);
    expect(threshold).toBeGreaterThan(brightness(bright) - 0.15);
    expect(threshold).toBeLessThan(brightness(bright) + 0.15);
  });

  it('n’éclaire pas le mur dans lequel la porte est percée', () => {
    const lit = { ...dark, extra: [spill] };
    const onDoorWall = new Vector3(3, 1.5, 3.8);
    const facingNorth = new Vector3(0, 0, -1);
    expect(lightAt(lit, onDoorWall, facingNorth)).toBeCloseTo(lightAt(dark, onDoorWall, facingNorth), 10);
  });

  it('prend la teinte de la salle d’où elle vient', () => {
    const warmRoom = room({ position: [0, 9], size: [10, 4, 10], decor: { light: { tint: '#ffd0a0' } } });
    const warm = roomLight(warmRoom, 0.4, resolveDecor(style, warmRoom));
    const tinted = doorSpill(dark, warm, door.center, door.tangent, 2.4, 2.9)!;
    expect(tinted.color).toEqual(warm.tint);
    const lit = { ...dark, extra: [tinted] };
    const [r, , b] = colorAt(lit, new Vector3(0, 0, 3.7), UP);
    const [r0, , b0] = colorAt(dark, new Vector3(0, 0, 3.7), UP);
    // La salle sombre a une lumière froide : ce qui entre par la porte la réchauffe.
    expect(r - r0).toBeGreaterThan(b - b0);
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

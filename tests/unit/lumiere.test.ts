import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { DENSITY, PAD, chartsOf, layoutLightmap, packAtlas, roomContext, spotGain } from '../../src/engine/lumiere';
import { DECORS } from '../../src/engine/decors';
import { fixture } from './helpers';

/** Surface plane du bâtiment, dans le plan XY, placée et tournée dans le musée. */
const plane = (width: number, height: number, x = 0, z = 0, rotY = 0) => {
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(width, height, 3, 2));
  mesh.position.set(x, height / 2, z);
  mesh.rotation.y = rotY;
  return mesh;
};

/** Rectangle occupé par une surface dans l'atlas, en coordonnées de 0 à 1. */
const extent = (mesh: THREE.Mesh) => {
  const uv = mesh.geometry.attributes.uv1;
  let [u0, v0, u1, v1] = [Infinity, Infinity, -Infinity, -Infinity];
  for (let k = 0; k < uv.count; k++) {
    u0 = Math.min(u0, uv.getX(k));
    u1 = Math.max(u1, uv.getX(k));
    v0 = Math.min(v0, uv.getY(k));
    v1 = Math.max(v1, uv.getY(k));
  }
  return { u0, v0, u1, v1 };
};

describe('atlas de lumière', () => {
  it('range chaque surface sans chevauchement, dans une image aux côtés en puissances de deux', () => {
    const rects = [
      { width: 12, height: 9 },
      { width: 11.7, height: 4.6 },
      { width: 11.7, height: 4.6 },
      { width: 4.65, height: 4.6 },
      { width: 4.65, height: 4.6 },
      { width: 2.4, height: 1.6 },
      { width: 0.3, height: 0.3 },
    ];
    const { width, height, placements } = packAtlas(rects);
    expect(Math.log2(width) % 1).toBe(0);
    expect(Math.log2(height) % 1).toBe(0);
    placements.forEach((p, i) => {
      expect(p.x + p.w).toBeLessThanOrEqual(width);
      expect(p.y + p.h).toBeLessThanOrEqual(height);
      expect(p.w).toBe(Math.ceil(rects[i].width * DENSITY) + PAD * 2);
      placements.forEach((q, j) => {
        if (i >= j) return;
        const apart = p.x + p.w <= q.x || q.x + q.w <= p.x || p.y + p.h <= q.y || q.y + q.h <= p.y;
        expect(apart, `surfaces ${i} et ${j}`).toBe(true);
      });
    });
  });

  it('prend la plus petite image possible, et donne toujours le même rangement', () => {
    expect(packAtlas([{ width: 1, height: 1 }])).toMatchObject({ width: 256, height: 64 });
    const rects = [3, 1, 2, 5, 4].map((n) => ({ width: n, height: 6 - n }));
    expect(packAtlas(rects)).toEqual(packAtlas(rects));
  });

  it('refuse une salle trop grande pour un seul atlas', () => {
    expect(() => packAtlas([{ width: 120, height: 2 }])).toThrow(/trop grande/);
  });

  it('donne à chaque surface ses coordonnées dans l’atlas, à l’intérieur de sa place et sans déborder sur une autre', () => {
    const meshes = [plane(12, 9), plane(11.7, 4.6, 0, -4.5), plane(4.6, 4.6, 6, 0, -Math.PI / 2)];
    const { width, height } = layoutLightmap(meshes, '');
    const boxes = meshes.map(extent);
    for (const b of boxes) {
      expect(b.u0).toBeGreaterThanOrEqual(PAD / width);
      expect(b.v0).toBeGreaterThanOrEqual(PAD / height);
      expect(b.u1).toBeLessThanOrEqual(1);
      expect(b.v1).toBeLessThanOrEqual(1);
    }
    // La surface garde ses proportions : un point de l'atlas couvre 2,5 cm dans les deux sens.
    const floor = boxes[0];
    expect((floor.u1 - floor.u0) * width).toBeCloseTo(12 * DENSITY, 0);
    expect((floor.v1 - floor.v0) * height).toBeCloseTo(9 * DENSITY, 0);
    boxes.forEach((p, i) =>
      boxes.forEach((q, j) => {
        if (i < j) expect(p.u1 <= q.u0 || q.u1 <= p.u0 || p.v1 <= q.v0 || q.v1 <= p.v0).toBe(true);
      }),
    );
  });

  it('les surfaces d’un même plan partagent une place dans l’atlas, et la lumière passe de l’une à l’autre sans couture', () => {
    // Un mur de 6 m percé d'une porte : un pan de chaque côté, et le linteau au-dessus. Dans le repère du mur.
    const panel = (width: number, height: number, x: number, y: number, z = 0) => {
      const mesh = new THREE.Mesh(new THREE.PlaneGeometry(width, height));
      mesh.position.set(x, y, z);
      return mesh;
    };
    const left = panel(2, 4, -2, 2);
    const lintel = panel(2, 1, 0, 3.5);
    const right = panel(2, 4, 2, 2);
    // Une bande de zellige plaquée 3 mm devant le pan de gauche, et le mur d'en face, tourné vers le premier.
    const band = panel(2, 1.2, -2, 0.6, 0.003);
    const opposite = panel(6, 4, 0, 2, 5);
    opposite.rotation.y = Math.PI;
    const charts = chartsOf([left, lintel, right, band, opposite]);
    expect(charts.map((c) => c.meshes.length)).toEqual([4, 1]);
    // Le repère du plan est celui de sa première surface : le pan de gauche, centré en (-2 ; 2) sur le mur.
    expect(charts[0].family).toBe('murs');
    expect(charts[0].minX).toBeCloseTo(-1, 6);
    expect(charts[0].minY).toBeCloseTo(-2, 6);
    expect(charts[0].width).toBeCloseTo(6, 6);
    expect(charts[0].height).toBeCloseTo(4, 6);

    const { width, height } = layoutLightmap([left, lintel, right, band, opposite], '');
    const uvAt = (mesh: THREE.Mesh, x: number, y: number) => {
      const pos = mesh.geometry.attributes.position;
      for (let k = 0; k < pos.count; k++) {
        if (Math.abs(pos.getX(k) + mesh.position.x - x) < 1e-6 && Math.abs(pos.getY(k) + mesh.position.y - y) < 1e-6) {
          return [mesh.geometry.attributes.uv1.getX(k) * width, mesh.geometry.attributes.uv1.getY(k) * height];
        }
      }
      throw new Error(`pas de sommet en (${x}, ${y})`);
    };
    // Au bord commun de deux pans, les coordonnées sont les mêmes des deux côtés.
    const seam = uvAt(left, -1, 4);
    expect(uvAt(lintel, -1, 4)[0]).toBeCloseTo(seam[0], 4);
    expect(uvAt(lintel, -1, 4)[1]).toBeCloseTo(seam[1], 4);
    // La bande lit la lumière du mur qu'elle recouvre.
    expect(uvAt(band, -3, 0)[0]).toBeCloseTo(uvAt(left, -3, 0)[0], 4);
    expect(uvAt(band, -3, 0)[1]).toBeCloseTo(uvAt(left, -3, 0)[1], 4);
    // Un mètre de mur occupe autant de points partout dans le plan.
    expect(uvAt(right, 3, 0)[0] - uvAt(left, -3, 0)[0]).toBeCloseTo(6 * DENSITY, 0);
  });

  it('reconnaît le sol, les murs et le plafond à leur orientation', () => {
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(4, 4));
    floor.rotation.x = -Math.PI / 2;
    const ceiling = new THREE.Mesh(new THREE.PlaneGeometry(4, 4));
    ceiling.rotation.x = Math.PI / 2;
    ceiling.position.y = 3;
    expect(chartsOf([floor, ceiling, plane(4, 3)]).map((c) => c.family)).toEqual(['sol', 'plafond', 'murs']);
  });

  it('le faisceau d’un projecteur reste discret dans une salle claire et domine dans une salle sombre', () => {
    const gain = (preset: string) => spotGain(DECORS[preset].settings as never);
    expect(gain('argile-claire')).toBeCloseTo(0.42, 6);
    expect(gain('terre-cuite')).toBeGreaterThan(1);
    expect(gain('nuit')).toBeGreaterThan(4);
  });

  it('l’empreinte d’une salle change quand une surface bouge ou que son contexte change, et seulement alors', () => {
    const build = (x = 0) => [plane(12, 9), plane(11.7, 4.6, x, -4.5)];
    const a = layoutLightmap(build(), 'décor A').fingerprint;
    expect(layoutLightmap(build(), 'décor A').fingerprint).toBe(a);
    expect(layoutLightmap(build(0.2), 'décor A').fingerprint).not.toBe(a);
    expect(layoutLightmap(build(), 'décor B').fingerprint).not.toBe(a);
  });

  it('le contexte d’une salle suit son décor, ses œuvres et ses bancs', () => {
    const museum = fixture();
    const room = museum.rooms.find((r) => r.artworks.some((a) => a.type === 'painting'))!;
    const decor = { preset: 'argile-claire', ...DECORS['argile-claire'].settings } as never;
    const before = roomContext(room, decor, 'contemporary');
    expect(roomContext(room, decor, 'contemporary')).toBe(before);
    const painting = room.artworks.find((a) => a.type === 'painting')!;
    if (painting.type === 'painting') painting.offset += 0.5;
    expect(roomContext(room, decor, 'contemporary')).not.toBe(before);
    expect(roomContext(fixture().rooms.find((r) => r.id === room.id)!, decor, 'classic')).not.toBe(before);
  });
});

import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { FRAMES, Section, frameScale, mouldingGeometry, sectionOpenness, type SectionPoint } from '../../src/engine/cadres';

/** Baguette de 2 cm de large et 3 cm de haut, œuvre à 1 cm du mur. */
const BAGUETTE: SectionPoint[] = [
  [0, 0.01],
  [0, 0.03],
  [0.02, 0.03],
  [0.02, 0],
];

describe('cadres en relief', () => {
  it('promène la coupe autour de l’œuvre : la moulure l’entoure, de la feuillure au mur', () => {
    const geometry = mouldingGeometry(1, 0.6, BAGUETTE);
    geometry.computeBoundingBox();
    const box = geometry.boundingBox!;
    // L'ouverture fait 1 m × 0,60 m ; la baguette ajoute 2 cm de chaque côté et monte à 3 cm du mur.
    expect(box.min.toArray().map((v) => +v.toFixed(4))).toEqual([-0.52, -0.32, 0]);
    expect(box.max.toArray().map((v) => +v.toFixed(4))).toEqual([0.52, 0.32, 0.03]);
    // Quatre côtés, trois pans par côté, deux triangles par pan.
    expect(geometry.index!.count).toBe(4 * 3 * 6);
  });

  it('tourne chaque face vers l’extérieur de la moulure, avec la normale qui lui correspond', () => {
    const geometry = mouldingGeometry(1, 0.6, BAGUETTE);
    const position = geometry.attributes.position;
    const normal = geometry.attributes.normal;
    const index = geometry.index!;
    const at = (i: number) => new THREE.Vector3().fromBufferAttribute(position, i);
    for (let t = 0; t < index.count; t += 3) {
      const [a, b, c] = [index.getX(t), index.getX(t + 1), index.getX(t + 2)];
      const face = at(b).sub(at(a)).cross(at(c).sub(at(a))).normalize();
      const stored = new THREE.Vector3().fromBufferAttribute(normal, a);
      expect(face.dot(stored), `triangle ${t / 3}`).toBeGreaterThan(0.99);
    }
    // La face du dessus regarde le visiteur ; le chant extérieur du bas regarde le sol.
    const normals = Array.from({ length: normal.count }, (_, i) => new THREE.Vector3().fromBufferAttribute(normal, i));
    expect(normals.some((n) => n.z > 0.99)).toBe(true);
    expect(normals.some((n) => n.y < -0.99)).toBe(true);
  });

  it('assemble les angles d’onglet : deux montants voisins se rejoignent exactement', () => {
    const geometry = mouldingGeometry(1, 0.6, BAGUETTE);
    const position = geometry.attributes.position;
    const points = Array.from({ length: position.count }, (_, i) => new THREE.Vector3().fromBufferAttribute(position, i));
    // Le coin extérieur en bas à droite appartient au montant du bas et à celui de droite.
    const corner = new THREE.Vector3(0.52, -0.32, 0.03);
    expect(points.filter((p) => p.distanceTo(corner) < 1e-6).length).toBeGreaterThanOrEqual(2);
    // Et l'onglet part bien du coin de l'ouverture.
    const inner = new THREE.Vector3(0.5, -0.3, 0.03);
    expect(points.filter((p) => p.distanceTo(inner) < 1e-6).length).toBeGreaterThanOrEqual(2);
  });

  it('lisse les courbes et garde vives les arêtes franches', () => {
    // Un quart de rond : une seule normale par point, partagée par les deux pans voisins.
    const round = new Section(0, 0.01).to(0, 0.02).curve(0, 0.03, 0.01, 0.03, 8).to(0.02, 0.03).to(0.02, 0).points;
    const geometry = mouldingGeometry(1, 0.6, round);
    const normal = geometry.attributes.normal;
    const position = geometry.attributes.position;
    const seen = new Map<string, THREE.Vector3[]>();
    for (let i = 0; i < position.count; i++) {
      // Seulement le montant du bas, hors des onglets : y < -0,3 et x = ±0,5 + u.
      const p = new THREE.Vector3().fromBufferAttribute(position, i);
      const n = new THREE.Vector3().fromBufferAttribute(normal, i);
      if (Math.abs(n.x) > 1e-6 || p.x > 0) continue;
      const key = `${p.y.toFixed(5)} ${p.z.toFixed(5)}`;
      seen.set(key, [...(seen.get(key) ?? []), n]);
    }
    const sharp = [...seen.values()].filter((list) => list.some((n) => n.distanceTo(list[0]) > 1e-3)).length;
    // Trois arêtes vives seulement : au pied du quart de rond, puis les deux arêtes du chant extérieur… ici le pied et les deux bords.
    expect(sharp).toBeLessThanOrEqual(3);
    expect(seen.size).toBeGreaterThan(10);
  });

  it('mesure ce que chaque point de la coupe voit du ciel : moins au fond d’une rainure', () => {
    const flat: SectionPoint[] = [[0, 0.03], [0.02, 0.03], [0.04, 0.03], [0.06, 0.03]];
    for (const open of sectionOpenness(flat)) expect(open).toBeGreaterThan(0.99);
    // Une rainure de 4 mm de large et 8 mm de profondeur au milieu d'un plat.
    const grooved: SectionPoint[] = [[0, 0.03], [0.028, 0.03], [0.028, 0.022], [0.03, 0.022], [0.032, 0.022], [0.032, 0.03], [0.06, 0.03]];
    const open = sectionOpenness(grooved);
    expect(open[3]).toBeLessThan(0.45);
    expect(open[0]).toBeGreaterThan(0.95);
    expect(open.every((v) => v >= 0 && v <= 1)).toBe(true);
  });

  it('élargit la moulure des grands tableaux, pas celle des baguettes', () => {
    const gilt = FRAMES['dore-classique'];
    expect(frameScale(gilt, 0.4)).toBe(1);
    expect(frameScale(gilt, 1)).toBe(1);
    expect(frameScale(gilt, 2)).toBeCloseTo(1.3, 6);
    expect(frameScale(gilt, 3.1)).toBeCloseTo(1.6, 6);
    expect(frameScale(FRAMES['baguette-noire'], 3)).toBe(1);
  });

  it('chaque modèle est une coupe continue, de la feuillure au mur, aux mesures annoncées', () => {
    expect(Object.keys(FRAMES).length).toBeGreaterThanOrEqual(8);
    for (const [id, style] of Object.entries(FRAMES)) {
      expect(style.id, id).toBe(id);
      expect(style.name.fr, id).toBeTruthy();
      const points = style.parts.flatMap((p) => p.section);
      // Elle part du bord de l'œuvre et finit contre le mur, au bord extérieur.
      expect(points[0][0], id).toBe(0);
      expect(points[0][1], id).toBeLessThanOrEqual(style.rabbet + 1e-9);
      expect(points.at(-1), id).toEqual([style.width, 0]);
      expect(Math.max(...points.map((p) => p[1])), id).toBeCloseTo(style.depth, 6);
      expect(Math.max(...points.map((p) => p[0])), id).toBeCloseTo(style.width, 6);
      // L'œuvre est en retrait : le cadre la dépasse.
      expect(style.depth, id).toBeGreaterThan(style.rabbet);
      // Les pièces se suivent sans trou.
      style.parts.slice(1).forEach((part, k) => expect(part.section[0], id).toEqual(style.parts[k].section.at(-1)));
      for (const p of points) expect(p.every(Number.isFinite), id).toBe(true);
    }
  });
});

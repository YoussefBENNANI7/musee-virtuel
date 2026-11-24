import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import {
  BASIN,
  BOWL,
  FOUNTAIN_RADIUS,
  SPILL_LANDING,
  STAR_INNER,
  lobe,
  lobedLathe,
  rimGeometry,
  sideWalls,
  spillProfile,
  starOutline,
  starRadius,
} from '../../src/engine/fontaine';

const at = (geometry: THREE.BufferGeometry, i: number, name = 'position') => new THREE.Vector3().fromBufferAttribute(geometry.attributes[name] as THREE.BufferAttribute, i);
/** Distance du centre à la droite qui passe par a et b. */
const lineDistance = (a: THREE.Vector2, b: THREE.Vector2) => Math.abs(a.x * b.y - a.y * b.x) / a.distanceTo(b);

describe('fontaine : le bassin en étoile', () => {
  it('dessine une étoile de deux carrés croisés : chaque creux est sur le côté d’un carré', () => {
    const star = starOutline(2);
    expect(star).toHaveLength(16);
    expect(star[0].length()).toBeCloseTo(2, 9);
    expect(star[1].length()).toBeCloseTo(2 * STAR_INNER, 9);
    // Le creux à 22,5° est sur le côté qui relie les pointes à 0° et à 90°.
    const [a, b, c] = [star[0], star[1], star[4]];
    expect((b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x)).toBeCloseTo(0, 9);
  });

  it('met les côtés d’une étoile en retrait de la distance voulue', () => {
    for (const d of [0, 0.03, 0.15]) {
      const star = starOutline(starRadius(d));
      expect(lineDistance(star[0], star[1])).toBeCloseTo(FOUNTAIN_RADIUS * Math.SQRT1_2 - d, 9);
    }
  });

  it('arrondit la margelle sans dépasser le rayon de la fontaine, au-dessus du zellige et de l’eau', () => {
    const geometry = rimGeometry();
    geometry.computeBoundingBox();
    const box = geometry.boundingBox!;
    expect(box.max.y).toBeCloseTo(BASIN.rim, 6);
    expect(box.min.y).toBeCloseTo(BASIN.rim - BASIN.rimThickness, 6);
    let outer = 0;
    let inner = Infinity;
    const position = geometry.attributes.position;
    for (let i = 0; i < position.count; i++) {
      const p = at(geometry, i);
      // Sur l'axe d'une pointe : le bord extérieur et le bord du trou.
      if (Math.abs(p.z) < 1e-6 && p.x > 0) {
        outer = Math.max(outer, p.x);
        inner = Math.min(inner, p.x);
      }
    }
    expect(outer).toBeCloseTo(FOUNTAIN_RADIUS, 5);
    // Elle couvre les parois de zellige et déborde au-dessus de l'eau, contre la paroi intérieure.
    expect(outer).toBeGreaterThan(starRadius(BASIN.outer));
    expect(inner).toBeCloseTo(starRadius(BASIN.inner + BASIN.lip), 5);
    expect(BASIN.rim - BASIN.rimThickness).toBeGreaterThan(BASIN.water);
  });

  it('tourne les parois vers l’extérieur, ou vers l’eau, et met un nombre entier de motifs sur chaque côté', () => {
    const outline = starOutline(1);
    for (const inward of [false, true]) {
      const walls = sideWalls(outline, 0, 0.4, 3, 1, inward);
      const index = walls.index!;
      expect(walls.attributes.position.count).toBe(16 * 4);
      for (let t = 0; t < index.count; t += 3) {
        const [a, b, c] = [0, 1, 2].map((k) => at(walls, index.getX(t + k)));
        const face = b.clone().sub(a).cross(c.clone().sub(a)).normalize();
        const normal = at(walls, index.getX(t), 'normal');
        // Le sens des triangles et la normale donnée s'accordent.
        expect(face.dot(normal)).toBeCloseTo(1, 6);
        // Normale horizontale, tournée vers l'extérieur de l'étoile, ou vers son centre.
        const middle = a.clone().add(b).add(c).setY(0);
        expect(Math.sign(normal.dot(middle))).toBe(inward ? -1 : 1);
      }
      const u = walls.attributes.uv;
      for (let k = 0; k < u.count; k += 4) {
        expect([u.getX(k), u.getX(k + 1)]).toEqual([0, 3]);
      }
    }
  });
});

describe('fontaine : la vasque et l’eau', () => {
  it('gonfle douze godrons, dont les pointes sont aux angles 2πk/12', () => {
    expect(lobe(0, 12)).toBeCloseTo(1, 9);
    expect(lobe(Math.PI / 6, 12)).toBeCloseTo(1, 9);
    expect(lobe(Math.PI / 12, 12)).toBeCloseTo(0, 9);
    const geometry = lobedLathe([[[0.5, 1, 0.08], [0.5, 1.1, 0.08]]], 12, 144);
    const radius = (j: number) => Math.hypot(at(geometry, j).x, at(geometry, j).z);
    // Le sommet 0 est sur une pointe (θ = 0), le sommet 6 au fond d'une cannelure (θ = π/12).
    expect(radius(0)).toBeGreaterThan(0.5);
    expect(radius(6)).toBeLessThan(0.5);
  });

  it('referme le tour sans couture : pas de sommets en double, des normales lisses', () => {
    const segments = 40;
    const geometry = lobedLathe([[[0.3, 0, 0], [0.3, 0.2, 0]]], 12, segments);
    expect(geometry.attributes.position.count).toBe(2 * segments);
    // Sur un cylindre lisse, chaque normale pointe vers l'extérieur, et pas moins là où le tour se referme qu'ailleurs.
    const outward = (j: number) => at(geometry, j, 'normal').dot(at(geometry, j).setY(0).normalize());
    expect(outward(segments / 2)).toBeGreaterThan(0.999);
    for (const j of [0, segments - 1]) expect(outward(j)).toBeCloseTo(outward(segments / 2), 6);
  });

  it('fait tomber les filets de la vasque dans l’eau du bassin, loin de ses bords', () => {
    const profile = spillProfile();
    const last = profile[profile.length - 1];
    expect(last.y).toBeCloseTo(BASIN.water, 6);
    expect(last.x).toBeCloseTo(SPILL_LANDING, 6);
    // Ils partent du bord de la vasque et s'en écartent en tombant.
    expect(profile[0].y).toBeGreaterThan(BOWL.lip);
    for (let i = 1; i < profile.length; i++) expect(profile[i].y).toBeLessThan(profile[i - 1].y);
    // Le point de chute est dans l'eau, même au creux de l'étoile.
    expect(SPILL_LANDING).toBeLessThan(starRadius(BASIN.inner) * STAR_INNER - 0.15);
  });
});

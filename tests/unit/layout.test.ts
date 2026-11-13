import { describe, expect, it } from 'vitest';
import { MARGIN, wallFrame } from '../../src/engine/layout';
import { STYLES } from '../../src/engine/styles';
import { classic, fixture, layoutOf } from './helpers';

/**
 * Plan du musée de test :
 *   hall     12 × 9  centré en (0, 0)        — salle de départ
 *   galerie   8 × 12 centrée en (10, 0)      — à l'est du hall
 *   cabinet  10 × 8  centré en (0, -8.5)     — au nord du hall
 *   rotonde   9 × 9  centrée en (-10.5, 0)   — à l'ouest du hall
 * Murs de 0,30 m d'épaisseur (style classique).
 */
describe('murs', () => {
  it('place la surface visible d’un mur en retrait d’une demi-épaisseur', () => {
    const hall = fixture().rooms[0];
    const limit = wallFrame(hall, 'north');
    const face = wallFrame(hall, 'north', 0.15);
    expect(limit.center.z).toBe(-4.5);
    expect(face.center.z).toBeCloseTo(-4.35);
    expect(limit.length).toBe(12);
    expect(face.length).toBeCloseTo(11.7);
  });

  it('oriente chaque mur vers l’intérieur de sa salle', () => {
    const hall = fixture().rooms[0];
    for (const wall of ['north', 'south', 'east', 'west'] as const) {
      const f = wallFrame(hall, wall);
      // En avançant le long de la normale depuis le mur, on se rapproche du centre de la salle.
      expect(f.center.clone().add(f.normal).length()).toBeLessThan(f.center.length());
      expect(f.normal.dot(f.tangent)).toBeCloseTo(0);
    }
  });
});

describe('portes', () => {
  it('déduit l’ouverture dans la salle voisine à partir d’une seule déclaration', () => {
    const layout = layoutOf(fixture());
    // Porte déclarée sur le mur nord du hall, décalée de 3,5 m vers l'est.
    expect(layout.openings('hall', 'north')).toEqual([{ offset: 3.5, width: 2.2, height: 2.7 }]);
    // Vue du cabinet, la même porte est sur son mur sud ; l'axe des décalages y est inversé.
    expect(layout.openings('cabinet', 'south')).toEqual([{ offset: -3.5, width: 2.2, height: 2.7 }]);
    expect(layout.passages).toHaveLength(3);
    expect(layout.deadEnds).toEqual([]);
  });

  it('place le passage au milieu de l’épaisseur du mur', () => {
    const passage = layoutOf(fixture()).passages.find((p) => p.door.wall === 'east')!;
    expect(passage.center.x).toBe(6);
    expect(passage.center.z).toBe(0);
    expect(passage.rooms.map((r) => r.id)).toEqual(['hall', 'galerie']);
  });

  it('limite la hauteur d’une porte au plafond le plus bas des deux salles', () => {
    const museum = fixture();
    museum.rooms.find((r) => r.id === 'galerie')!.size[1] = 2.5;
    museum.doors[1].height = 'full';
    const layout = layoutOf(museum);
    expect(layout.openings('hall', 'east')[0].height).toBe(2.5);
    expect(layout.openings('galerie', 'west')[0].height).toBe(2.5);
  });

  it('signale une porte qui ne débouche sur aucune salle', () => {
    const museum = fixture();
    museum.doors.push({ room: 'hall', wall: 'south', offset: 0, width: 2 });
    const layout = layoutOf(museum);
    expect(layout.deadEnds).toHaveLength(1);
    expect(layout.passages).toHaveLength(3);
  });
});

describe('déplacement', () => {
  const layout = layoutOf(fixture());
  const half = classic.wallThickness / 2;

  it('autorise le centre des salles', () => {
    expect(layout.walkable(0, 0)).toBe(true);
    expect(layout.walkable(10, 0)).toBe(true);
    expect(layout.walkable(-10.5, 3)).toBe(true);
  });

  it('tient le visiteur à distance des murs', () => {
    // Mur ouest du hall : limite en x = -6, surface en x = -5,85.
    const closest = -6 + half + MARGIN;
    expect(layout.walkable(closest + 0.01, 3)).toBe(true);
    expect(layout.walkable(closest - 0.01, 3)).toBe(false);
  });

  it('interdit l’intérieur des murs et l’extérieur du musée', () => {
    expect(layout.walkable(-6, 3)).toBe(false);
    expect(layout.walkable(0, 30)).toBe(false);
  });

  it('laisse passer par les portes, et seulement par elles', () => {
    // Porte ouest du hall : centrée en z = 0, large de 2,2 m.
    for (const x of [-5.5, -5.85, -6, -6.15, -6.5]) expect(layout.walkable(x, 0)).toBe(true);
    expect(layout.walkable(-6, 0.7)).toBe(true);
    // Trop près du montant de la porte, puis franchement dans le mur.
    expect(layout.walkable(-6, 1.0)).toBe(false);
    expect(layout.walkable(-6, 2)).toBe(false);
  });

  it('reconnaît la salle où se trouve le visiteur', () => {
    expect(layout.roomAt(0, 0)?.id).toBe('hall');
    expect(layout.roomAt(0, -8)?.id).toBe('cabinet');
    expect(layout.roomAt(40, 40)).toBeNull();
  });

  it('fait arriver le visiteur dans la salle, face à l’intérieur, à un endroit praticable', () => {
    for (const room of fixture().rooms) {
      const s = layout.spawn(room.id);
      expect(layout.roomAt(s.x, s.z)?.id, room.id).toBe(room.id);
      expect(layout.walkable(s.x, s.z), room.id).toBe(true);
    }
    // Dans le salon des sculptures, on entre par l'est : on regarde donc vers l'ouest.
    const s = layout.spawn('rotonde');
    expect(-Math.sin(s.yaw)).toBeCloseTo(-1);
  });

  it('sait quelles salles sont accessibles à pied', () => {
    expect([...layout.reachable('hall')].sort()).toEqual(['cabinet', 'galerie', 'hall', 'rotonde']);
    const museum = fixture();
    museum.doors = museum.doors.filter((d) => d.wall !== 'north');
    expect(layoutOf(museum).reachable('hall').has('cabinet')).toBe(false);
  });

  it('élargit la zone interdite quand les murs sont plus épais', () => {
    const thick = layoutOf(fixture(), STYLES.contemporary);
    const x = -6 + half + MARGIN + 0.02;
    expect(layout.walkable(x, 3)).toBe(true);
    expect(thick.walkable(x, 3)).toBe(false);
  });
});

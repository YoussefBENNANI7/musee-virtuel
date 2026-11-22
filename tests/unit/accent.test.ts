import { describe, expect, it } from 'vitest';
import { accentBeam } from '../../src/engine/artworks';

describe('éclairage d’accent : le faisceau selon la lumière de la salle', () => {
  const room = (level: number) => ({ light: { level, tint: '#ffffff', spots: 1 } });

  it('se voit en entier dans une salle tamisée', () => {
    expect(accentBeam(room(0.3))).toBe(1);
    expect(accentBeam(room(0.5))).toBe(1);
  });

  it('disparaît dans une salle claire, où seules les flaques de lumière restent', () => {
    expect(accentBeam(room(0.85))).toBe(0);
    expect(accentBeam(room(1))).toBe(0);
  });

  it('s’estompe entre les deux', () => {
    const middle = accentBeam(room(0.7));
    expect(middle).toBeGreaterThan(0);
    expect(middle).toBeLessThan(1);
    expect(accentBeam(room(0.6))).toBeGreaterThan(middle);
  });
});

import { describe, expect, it } from 'vitest';
import { chooseTier, TIERS } from '../../src/engine/quality';
import { resolveStyle, STYLES } from '../../src/engine/styles';

describe('styles', () => {
  it('retient le style contemporain quand le musée n’en précise pas', () => {
    expect(resolveStyle({}).id).toBe('contemporary');
  });

  it('prend le style du musée, sauf si un autre est demandé dans l’adresse', () => {
    expect(resolveStyle({ style: 'classic' }).id).toBe('classic');
    expect(resolveStyle({ style: 'classic' }, 'contemporary').id).toBe('contemporary');
    // Une demande farfelue est ignorée.
    expect(resolveStyle({ style: 'classic' }, 'rococo').id).toBe('classic');
  });

  it('applique les couleurs du musée par-dessus celles du style, sans modifier le style', () => {
    const style = resolveStyle({ style: 'classic', theme: { accent: '#123456', wall: '#ffffff' } });
    expect(style.palette.accent).toBe('#123456');
    expect(style.palette.wall).toBe('#ffffff');
    expect(style.palette.floor).toBe(STYLES.classic.palette.floor);
    expect(STYLES.classic.palette.accent).not.toBe('#123456');
  });
});

describe('qualité du rendu', () => {
  it('donne le rendu complet à un ordinateur et un rendu allégé à un téléphone', () => {
    expect(chooseTier({ touch: false })).toBe('high');
    expect(chooseTier({ touch: true })).toBe('medium');
    expect(chooseTier({ touch: true, memory: 8 })).toBe('medium');
    expect(chooseTier({ touch: true, memory: 2 })).toBe('low');
  });

  it('respecte un niveau imposé dans l’adresse, et ignore une valeur inconnue', () => {
    expect(chooseTier({ touch: false }, 'low')).toBe('low');
    expect(chooseTier({ touch: true, memory: 1 }, 'high')).toBe('high');
    expect(chooseTier({ touch: false }, 'ultra')).toBe('high');
  });

  it('allège chaque réglage d’un niveau au suivant', () => {
    expect(TIERS.high.maxPixelRatio).toBeGreaterThan(TIERS.medium.maxPixelRatio);
    expect(TIERS.medium.maxPixelRatio).toBeGreaterThan(TIERS.low.maxPixelRatio);
    expect(TIERS.low.textureSize).toBeLessThan(TIERS.high.textureSize);
  });
});

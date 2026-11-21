import { describe, expect, it } from 'vitest';
import { DECORS, ceilingOf, clearHeight, coveOf, objectLight, resolveDecor, withDecorOverrides } from '../../src/engine/decors';
import { STYLES } from '../../src/engine/styles';
import type { RoomConfig } from '../../src/engine/types';
import { fixture } from './helpers';

const { contemporary, classic } = STYLES;

const room = (extra: Partial<RoomConfig> = {}): RoomConfig => ({
  id: 'salle',
  name: { fr: 'Salle' },
  position: [0, 0],
  size: [10, 4.2, 8],
  artworks: [],
  ...extra,
});

describe('éclairage d’accent des objets', () => {
  it('n’existe que si le décor le demande : l’empreinte de lumière des autres salles ne change pas', () => {
    expect('accents' in resolveDecor(STYLES.contemporary, { decor: 'nuit' }).light).toBe(false);
    expect(resolveDecor(STYLES.contemporary, {}).light).toEqual({ level: 1, tint: '#ffffff', spots: 1 });
    expect(resolveDecor(STYLES.contemporary, { decor: { preset: 'nuit', light: { accents: 1.2 } } }).light.accents).toBe(1.2);
  });
});

describe('décor d’une salle', () => {
  it('sans décor, la salle suit exactement le style du musée', () => {
    const decor = resolveDecor(classic, room());
    expect(decor.preset).toBeNull();
    const { accent: _accent, ...colors } = classic.palette;
    expect(decor.colors).toEqual(colors);
    expect(decor.floor).toBe('parquet');
    expect(decor.baseboard).toBe('skirting');
    expect(decor.frames).toEqual({ plain: 'baguette-noyer', mat: 'baguette-noyer' });
    expect(decor.walls).toBe('paint');
    expect(decor.ceiling).toEqual({ type: 'flat' });
    expect(decor.light).toEqual({ level: 1, tint: '#ffffff', spots: 1 });
    expect(decor.labels).toBe('light');
  });

  it('un décor de la bibliothèque fixe ce qui fait son caractère, et laisse le reste au style', () => {
    const decor = resolveDecor(contemporary, room({ decor: 'terre-cuite' }));
    expect(decor.preset).toBe('terre-cuite');
    expect(decor.floor).toBe('chevron');
    expect(decor.walls).toBe('limewash');
    expect(decor.colors.wall).toBe(DECORS['terre-cuite'].settings.colors!.wall);
    expect(decor.light.level).toBeLessThan(1);
    // Ce que le décor ne précise pas vient du style : ici le bas de mur et les cadres.
    expect(decor.baseboard).toBe(contemporary.baseboard);
    expect(decor.frames).toEqual({ plain: 'caisse-noire', mat: 'baguette-noire' });
    // Les décors de l'exposition des 120 ans ont leurs propres cadres, en laiton.
    expect(resolveDecor(contemporary, room({ decor: 'nef' })).frames).toEqual({ plain: 'baguette-laiton', mat: 'baguette-laiton' });
    expect(resolveDecor(classic, room({ decor: 'terre-cuite' })).baseboard).toBe('skirting');
  });

  it('la salle corrige son décor réglage par réglage, sans modifier la bibliothèque', () => {
    const before = structuredClone(DECORS.nuit);
    const decor = resolveDecor(
      contemporary,
      room({ decor: { preset: 'nuit', colors: { wall: '#102030' }, light: { level: 0.7 }, frames: { mat: 'baguette-chene' }, floor: 'chevron' } }),
    );
    expect(decor.colors.wall).toBe('#102030');
    expect(decor.colors.ceiling).toBe(DECORS.nuit.settings.colors!.ceiling);
    expect(decor.light.level).toBe(0.7);
    expect(decor.light.spots).toBe(DECORS.nuit.settings.light!.spots);
    expect(decor.frames).toEqual({ plain: 'caisse-noire', mat: 'baguette-chene' });
    expect(decor.floor).toBe('chevron');
    expect(decor.labels).toBe('dark');
    expect(DECORS.nuit).toEqual(before);
  });

  it('un décor peut s’écrire en entier, sans partir de la bibliothèque', () => {
    const decor = resolveDecor(contemporary, room({ decor: { colors: { wall: '#445566' }, walls: 'limewash', gloss: 0.6 } }));
    expect(decor.preset).toBeNull();
    expect(decor.colors.wall).toBe('#445566');
    expect(decor.colors.floor).toBe(contemporary.palette.floor);
    expect(decor.walls).toBe('limewash');
    expect(decor.gloss).toBe(0.6);
  });

  it('la couleur de mur et le niveau d’éclairage écrits sur la salle gardent le dernier mot', () => {
    const decor = resolveDecor(contemporary, room({ decor: 'terre-cuite', wall: '#123456', light: 0.5 }));
    expect(decor.colors.wall).toBe('#123456');
    expect(decor.light.level).toBe(0.5);
    // Sans décor, ces deux réglages suffisent, comme avant.
    const plain = resolveDecor(contemporary, room({ wall: '#9c4a35', light: 0.92 }));
    expect(plain.colors.wall).toBe('#9c4a35');
    expect(plain.light.level).toBe(0.92);
    expect(plain.floor).toBe('concrete');
  });

  it('un décor peut ne changer que le sol et les socles : la pierre claire garde les murs du style', () => {
    const decor = resolveDecor(contemporary, room({ decor: 'pierre-claire' }));
    expect(decor.floor).toBe('stone');
    expect(decor.colors.wall).toBe(contemporary.palette.wall);
    expect(decor.colors.ceiling).toBe(contemporary.palette.ceiling);
    expect(decor.colors.plinth).not.toBe(contemporary.palette.plinth);
    expect(decor.light.level).toBe(1);
  });

  it('un nom de décor inconnu laisse la salle dans le style du musée', () => {
    const decor = resolveDecor(contemporary, room({ decor: 'rococo' }));
    expect(decor.preset).toBeNull();
    expect(decor.colors.wall).toBe(contemporary.palette.wall);
  });

  it('chaque décor de la bibliothèque a un nom et un résumé dans les deux langues', () => {
    for (const [id, preset] of Object.entries(DECORS)) {
      for (const text of [preset.name, preset.summary]) {
        expect(text.fr?.trim(), id).toBeTruthy();
        expect(text.en?.trim(), id).toBeTruthy();
      }
    }
  });
});

describe('plafond d’une salle', () => {
  it('le décor propose un plafond, celui que la salle déclare l’emporte', () => {
    const cove = resolveDecor(contemporary, room({ decor: 'argile-claire' }));
    expect(ceilingOf(room(), cove)).toEqual({ type: 'cove' });
    const skylight = room({ ceiling: { type: 'skylight', margin: 1.5 } });
    expect(ceilingOf(skylight, cove)).toEqual({ type: 'skylight', margin: 1.5 });
    expect(coveOf(skylight, cove)).toBeNull();
    expect(coveOf(room({ ceiling: { type: 'flat' } }), cove)).toBeNull();
  });

  it('sous un plafond flottant, les projecteurs pendent plus bas', () => {
    const plain = resolveDecor(contemporary, room());
    expect(clearHeight(room(), plain)).toBe(4.2);
    const floating = room({ ceiling: { type: 'cove', inset: 0.4, drop: 0.5 } });
    expect(coveOf(floating, plain)).toEqual({ inset: 0.4, drop: 0.5 });
    expect(clearHeight(floating, plain)).toBeCloseTo(3.7);
    // Sans dimensions, la gorge prend ses mesures habituelles.
    const byDefault = coveOf(room({ ceiling: { type: 'cove' } }), plain)!;
    expect(byDefault.inset).toBeGreaterThan(0);
    expect(byDefault.drop).toBeGreaterThan(0);
  });
});

describe('lumière reçue par les objets', () => {
  it('est entière dans une salle claire, réduite dans une salle tamisée, jamais nulle', () => {
    expect(objectLight(resolveDecor(contemporary, room()))).toBe(1);
    const night = objectLight(resolveDecor(contemporary, room({ decor: 'nuit' })));
    expect(night).toBeLessThan(0.8);
    expect(night).toBeGreaterThan(0.3);
    expect(objectLight(resolveDecor(contemporary, room({ light: 0 })))).toBeGreaterThan(0);
    expect(objectLight(resolveDecor(contemporary, room({ light: 2 })))).toBe(1);
  });
});

describe('décor demandé dans l’adresse', () => {
  const presets = (param: string | null) => {
    const museum = withDecorOverrides(fixture(), param);
    return Object.fromEntries(museum.rooms.map((r) => [r.id, resolveDecor(classic, r).preset]));
  };

  it('change le décor d’une seule salle', () => {
    expect(presets('cabinet:nuit')).toEqual({ hall: null, galerie: null, cabinet: 'nuit', rotonde: null });
  });

  it('change plusieurs salles, ou toutes à la fois', () => {
    expect(presets('cabinet:nuit,galerie:argile-claire')).toEqual({ hall: null, galerie: 'argile-claire', cabinet: 'nuit', rotonde: null });
    expect(presets('terre-cuite')).toEqual({ hall: 'terre-cuite', galerie: 'terre-cuite', cabinet: 'terre-cuite', rotonde: 'terre-cuite' });
    // Une salle nommée garde sa demande, les autres suivent la demande générale.
    expect(presets('nuit,hall:argile-claire')).toEqual({ hall: 'argile-claire', galerie: 'nuit', cabinet: 'nuit', rotonde: 'nuit' });
  });

  it('remplace la couleur de mur et le niveau d’éclairage de la salle, mais garde son plan et son plafond', () => {
    const base = fixture();
    const cabinet = base.rooms.find((r) => r.id === 'cabinet')!;
    cabinet.light = 0.9;
    cabinet.ceiling = { type: 'skylight', margin: 1.5 };
    const shown = withDecorOverrides(base, 'cabinet:nuit').rooms.find((r) => r.id === 'cabinet')!;
    const decor = resolveDecor(classic, shown);
    expect(decor.colors.wall).toBe(DECORS.nuit.settings.colors!.wall);
    expect(decor.light.level).toBe(DECORS.nuit.settings.light!.level);
    expect(shown.ceiling).toEqual({ type: 'skylight', margin: 1.5 });
    expect(shown.size).toEqual(cabinet.size);
    expect(shown.artworks).toBe(cabinet.artworks);
  });

  it('ne touche jamais à la configuration d’origine', () => {
    const base = fixture();
    const copy = structuredClone(base);
    withDecorOverrides(base, 'terre-cuite,cabinet:nuit');
    expect(base).toEqual(copy);
  });

  it('ignore une demande absente, une salle inconnue ou un décor inconnu', () => {
    const base = fixture();
    expect(withDecorOverrides(base, null)).toBe(base);
    expect(withDecorOverrides(base, '')).toBe(base);
    expect(withDecorOverrides(base, 'rococo')).toBe(base);
    expect(withDecorOverrides(base, 'cabinet:rococo')).toBe(base);
    expect(presets('grenier:nuit')).toEqual({ hall: null, galerie: null, cabinet: null, rotonde: null });
  });
});

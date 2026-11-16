import { describe, expect, it } from 'vitest';
import { closestView } from '../../src/engine/artworks';
import { modelUrl } from '../../src/engine/sculptures';
import { loc, tr } from '../../src/engine/types';
import { demo } from './helpers';

describe('textes dans plusieurs langues', () => {
  it('un texte écrit une seule fois vaut pour toutes les langues', () => {
    expect(loc('Rembrandt', 'fr')).toBe('Rembrandt');
    expect(loc('Rembrandt', 'en')).toBe('Rembrandt');
  });

  it('un texte écrit par langue se lit dans la langue demandée, sinon dans la première', () => {
    const date = { fr: 'vers 1830–1832', en: 'c. 1830–32' };
    expect(loc(date, 'en')).toBe('c. 1830–32');
    expect(loc(date, 'ar')).toBe('vers 1830–1832');
    expect(tr({}, 'fr')).toBe('');
  });
});

describe('distance de regard', () => {
  it('reste à 1,20 m pour un tableau, et se raccourcit pour une petite estampe', () => {
    expect(closestView(1.6)).toBe(1.2);
    expect(closestView(0.8)).toBe(1.2);
    expect(closestView(0.38)).toBeCloseTo(0.61, 2);
    expect(closestView(0.1)).toBe(0.55);
  });
});

describe('fichier d’un modèle 3D', () => {
  const base = 'https://exemple.org/museums/demo/';

  it('sert l’original tant que les versions allégées n’ont pas été préparées', () => {
    expect(modelUrl({ src: 'models/venus.glb' }, base, true)).toBe(`${base}models/venus.glb`);
  });

  it('sert la version complète, ou la version légère sur un appareil modeste', () => {
    const model = { src: 'models/venus.glb', web: true };
    expect(modelUrl(model, base, false)).toBe(`${base}models/web/venus.glb`);
    expect(modelUrl(model, base, true)).toBe(`${base}models/web/venus-leger.glb`);
  });
});

describe('œuvres du musée de démonstration', () => {
  const works = demo().rooms.flatMap((room) => room.artworks);
  const paintings = works.filter((a) => a.type === 'painting');

  it('chaque tableau cite le musée qui le conserve et renvoie à sa notice', () => {
    expect(paintings).toHaveLength(29);
    for (const a of paintings) {
      expect(a.credit?.fr, a.id).toMatch(/domaine public/);
      expect(a.credit?.en, a.id).toMatch(/public domain/);
      expect(a.link, a.id).toMatch(/^https:\/\/(www\.metmuseum\.org|www\.artic\.edu|clevelandart\.org)\//);
    }
  });

  it('la sculpture numérisée cite son musée et a ses versions allégées', () => {
    const scanned = works.filter((a) => a.type === 'sculpture' && 'src' in a.model);
    expect(scanned.map((a) => a.id)).toEqual(['l-esclave-grecque']);
    for (const a of scanned) {
      expect(a.type === 'sculpture' && a.model).toEqual({ src: 'models/l-esclave-grecque.glb', web: true });
      expect(a.credit?.fr).toMatch(/Smithsonian/);
      expect(a.link).toMatch(/^https:\/\/americanart\.si\.edu\//);
    }
  });

  it('les œuvres sur papier sont sous passe-partout, les peintures non', () => {
    for (const a of paintings) {
      if (a.type !== 'painting') continue;
      const onPaper = /Estampe|Gravure|Eau-forte|Photographie|Dessin/.test(a.medium.fr);
      expect(Boolean(a.mat), a.id).toBe(onPaper);
    }
  });

  it('chaque œuvre est à sa taille réelle : aucune ne dépasse 3,20 m, les estampes font moins de 45 cm', () => {
    for (const a of paintings) {
      if (a.type !== 'painting') continue;
      expect(Math.max(a.width, a.height), a.id).toBeLessThanOrEqual(3.2);
      if (a.mat) expect(Math.max(a.width, a.height), a.id).toBeLessThan(0.45);
    }
  });
});

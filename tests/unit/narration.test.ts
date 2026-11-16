import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { centuryFr, narrationText, spoken } from '../../src/engine/narration';
import type { MuseumConfig } from '../../src/engine/types';

describe('texte lu par l’audioguide', () => {
  it('écrit les siècles en toutes lettres', () => {
    expect([2, 4, 5, 9, 11, 14, 15, 16, 17, 19, 20, 21].map(centuryFr)).toEqual([
      'deuxième',
      'quatrième',
      'cinquième',
      'neuvième',
      'onzième',
      'quatorzième',
      'quinzième',
      'seizième',
      'dix-septième',
      'dix-neuvième',
      'vingtième',
      'vingt et unième',
    ]);
    expect(spoken('XIVe siècle, époque mérinide', 'fr')).toBe('quatorzième siècle, époque mérinide');
    expect(spoken('XVIe–XVIIe siècle', 'fr')).toBe('seizième au dix-septième siècle');
    expect(spoken('XIVe – début du XVe siècle', 'fr')).toBe('quatorzième au début du quinzième siècle');
    expect(spoken('XVIIe ou XVIIIe siècle', 'fr')).toBe('dix-septième ou dix-huitième siècle');
  });

  it('laisse les mots ordinaires tranquilles', () => {
    expect(spoken('Ce panneau. Le tableau.', 'fr')).toBe('Ce panneau. Le tableau.');
  });

  it('lit les intervalles de dates et les abréviations', () => {
    expect(spoken('vers 1830–1832', 'fr')).toBe('entre 1830 et 1832');
    expect(spoken('1875–1900', 'fr')).toBe('de 1875 à 1900');
    expect(spoken('Improvisation n° 30', 'fr')).toBe('Improvisation numéro 30');
    expect(spoken('c. 1830–32', 'en')).toBe('around 1830 to 1832');
    expect(spoken('c. 1902–6', 'en')).toBe('around 1902 to 1906');
    expect(spoken('1875–1900', 'en')).toBe('1875 to 1900');
    expect(spoken('14th–early 15th century', 'en')).toBe('14th to early 15th century');
  });

  it('commence par le cartel, puis le commentaire', () => {
    const art = { title: { fr: 'Les Moissonneurs', en: 'The Harvesters' }, artist: { fr: "Pieter Bruegel l'Ancien", en: 'Pieter Bruegel the Elder' }, year: '1565', description: { fr: 'Un panneau.', en: 'A panel.' } };
    expect(narrationText(art, 'fr')).toBe("Les Moissonneurs. Pieter Bruegel l'Ancien, 1565. Un panneau.");
    expect(narrationText(art, 'en')).toBe('The Harvesters. Pieter Bruegel the Elder, 1565. A panel.');
  });

  it('ne laisse aucun chiffre romain ni aucun tiret de dates dans les textes de la démo', () => {
    const museum: MuseumConfig = JSON.parse(readFileSync(new URL('../../public/museums/demo/museum.json', import.meta.url), 'utf8'));
    for (const room of museum.rooms) {
      for (const art of room.artworks) {
        for (const lang of museum.langs) {
          const text = narrationText(art, lang);
          expect(text, `${art.id} (${lang})`).not.toMatch(/\b[IVX]{2,}e\b|\d–\d|n°/);
        }
      }
    }
  });
});

import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
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

  it('lit le texte écrit pour l’audioguide plutôt que le cartel, et saute ce qui manque', () => {
    const art = { title: { fr: 'Le Grand Livre' }, artist: 'Exposition', year: '2025', description: { fr: 'Texte du cartel.' }, narration: { fr: 'Texte dit par la voix.' } };
    expect(narrationText(art, 'fr')).toBe('Le Grand Livre. Exposition, 2025. Texte dit par la voix.');
    expect(narrationText({ ...art, narration: undefined }, 'fr')).toBe('Le Grand Livre. Exposition, 2025. Texte du cartel.');
    // Une présentation de salle n'a ni auteur ni date : pas de point en trop.
    expect(narrationText({ title: { fr: 'La Chambre forte' }, artist: '', year: '', description: { fr: 'Bienvenue.' } }, 'fr')).toBe('La Chambre forte. Bienvenue.');
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

const demo = new URL('../../public/museums/demo/', import.meta.url);
// Ces tests s'activent dès que les voix de la démo ont été produites (npm run voix).
describe.skipIf(!existsSync(new URL('audio/voix.json', demo)))('voix enregistrées de la démo', () => {
  // Lus au moment des tests : un bloc ignoré ne doit rien charger.
  const root = demo;
  const load = () => ({
    museum: JSON.parse(readFileSync(new URL('museum.json', root), 'utf8')) as MuseumConfig,
    manifest: JSON.parse(readFileSync(new URL('audio/voix.json', root), 'utf8')),
  });

  it('chaque œuvre a sa voix dans chaque langue, et le fichier existe', () => {
    const { museum } = load();
    for (const art of museum.rooms.flatMap((r) => r.artworks)) {
      for (const lang of museum.langs) {
        const file = art.audio?.[lang];
        expect(file, `${art.id} (${lang}) : relancer npm run voix`).toBe(`audio/${art.id}.${lang}.mp3`);
        expect(existsSync(new URL(file!, root)), file).toBe(true);
      }
    }
  });

  it('aucun fichier de voix n’est resté d’une œuvre retirée', () => {
    const { museum, manifest } = load();
    const expected = museum.rooms.flatMap((r) => r.artworks).flatMap((a) => museum.langs.map((lang) => `audio/${a.id}.${lang}.mp3`)).sort();
    expect(Object.keys(manifest.files).sort()).toEqual(expected);
    expect(readdirSync(new URL('audio/', root)).filter((f) => f.endsWith('.mp3')).map((f) => `audio/${f}`).sort()).toEqual(expected);
  });

  it('chaque voix correspond au texte actuel de l’œuvre', () => {
    // Un texte corrigé sans relancer « npm run voix » ferait entendre l'ancienne version.
    const { museum, manifest } = load();
    for (const art of museum.rooms.flatMap((r) => r.artworks)) {
      for (const lang of museum.langs) {
        const voice = voiceOf(manifest.voice, lang);
        const print = createHash('sha256').update(JSON.stringify([manifest.model, voice, manifest.style, narrationText(art, lang)])).digest('hex').slice(0, 16);
        expect(manifest.files[`audio/${art.id}.${lang}.mp3`], `${art.id} (${lang}) : relancer npm run voix`).toBe(print);
      }
    }
  });
});

function voiceOf(spec: string, lang: string): string {
  if (!spec.includes(':')) return spec;
  return Object.fromEntries(spec.split('+').map((p) => p.split(':')))[lang];
}

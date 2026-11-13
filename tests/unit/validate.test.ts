import { describe, expect, it } from 'vitest';
import { resolveStyle, STYLES } from '../../src/engine/styles';
import type { MuseumConfig, PaintingConfig } from '../../src/engine/types';
import { validateMuseum } from '../../src/engine/validate';
import { classic, demo, fixture } from './helpers';

const errorsOf = (museum: MuseumConfig, style = classic) =>
  validateMuseum(museum, style)
    .filter((i) => i.level === 'error')
    .map((i) => `${i.where} : ${i.message}`);
const warningsOf = (museum: MuseumConfig, style = classic) =>
  validateMuseum(museum, style)
    .filter((i) => i.level === 'warning')
    .map((i) => `${i.where} : ${i.message}`);

const painting = (museum: MuseumConfig, id: string) =>
  museum.rooms.flatMap((r) => r.artworks).find((a) => a.id === id) as PaintingConfig;

describe('configurations livrées', () => {
  it('le musée de démonstration est valide, sans avertissement', () => {
    const museum = demo();
    expect(validateMuseum(museum, resolveStyle(museum))).toEqual([]);
  });

  it('le musée de démonstration reste valide dans chaque style', () => {
    for (const style of Object.values(STYLES)) {
      expect(errorsOf(demo(), style), style.id).toEqual([]);
    }
  });

  it('le musée de test est valide', () => {
    expect(validateMuseum(fixture(), classic)).toEqual([]);
  });
});

describe('erreurs détectées', () => {
  it('une porte qui ne mène nulle part', () => {
    const museum = fixture();
    museum.doors.push({ room: 'hall', wall: 'south', offset: 0, width: 2 });
    expect(errorsOf(museum)).toContain('Porte de "hall" (mur south) : ne débouche sur aucune salle voisine');
  });

  it('une porte trop étroite, trop large pour son mur, ou dans une salle inconnue', () => {
    const museum = fixture();
    museum.doors[0].width = 0.5;
    museum.doors[1].offset = 4;
    museum.doors.push({ room: 'grenier', wall: 'north', offset: 0, width: 2 });
    const errors = errorsOf(museum);
    expect(errors).toContain('Porte de "hall" (mur north) : trop étroite (minimum 0.9 m)');
    expect(errors).toContain('Porte de "hall" (mur east) : dépasse du mur');
    expect(errors).toContain('Porte de "grenier" (mur north) : salle inconnue');
  });

  it('une salle que plus aucune porte ne dessert', () => {
    const museum = fixture();
    museum.doors = museum.doors.filter((d) => d.wall !== 'west');
    expect(errorsOf(museum)).toContain(
      'Salle "rotonde" : inaccessible depuis la salle de départ : aucune porte n\'y mène',
    );
  });

  it('deux salles qui se chevauchent', () => {
    const museum = fixture();
    museum.rooms[1].position = [8, 0];
    expect(errorsOf(museum)).toContain('Salle "hall" : chevauche la salle "galerie"');
  });

  it('un tableau accroché en travers d’une porte, hors du mur, ou trop haut', () => {
    const museum = fixture();
    painting(museum, 'equilibre-no-7').offset = 3;
    painting(museum, 'petite-fugue').offset = -5.6;
    painting(museum, 'midi-plein').height = 5.5;
    const errors = errorsOf(museum);
    expect(errors).toContain('Œuvre "equilibre-no-7" : accrochée en travers d\'une porte');
    expect(errors).toContain('Œuvre "petite-fugue" : dépasse du mur');
    expect(errors).toContain('Œuvre "midi-plein" : trop haute pour le plafond de la salle');
  });

  it('un tableau gêné par la porte déclarée dans la salle voisine', () => {
    const museum = fixture();
    // Le mur sud du cabinet ne porte aucune déclaration de porte : l'ouverture vient du hall.
    const stray = { ...painting(museum, 'zellige-imaginaire'), id: 'intrus', wall: 'south' as const, offset: -3.5 };
    museum.rooms.find((r) => r.id === 'cabinet')!.artworks.push(stray);
    expect(errorsOf(museum)).toContain('Œuvre "intrus" : accrochée en travers d\'une porte');
  });

  it('une sculpture posée dans un mur', () => {
    const museum = fixture();
    const sculpture = museum.rooms.flatMap((r) => r.artworks).find((a) => a.id === 'ruban')!;
    if (sculpture.type === 'sculpture') sculpture.position = [4.4, 0];
    expect(errorsOf(museum)).toContain('Œuvre "ruban" : posée hors de la salle ou trop près d\'un mur');
  });

  it('des identifiants en double et une étape de parcours inconnue', () => {
    const museum = fixture();
    painting(museum, 'petite-fugue').id = 'equilibre-no-7';
    museum.tours![0].stops.push('fantome');
    const errors = errorsOf(museum);
    expect(errors).toContain('Œuvre "equilibre-no-7" : identifiant utilisé par plusieurs œuvres');
    expect(errors).toContain('Parcours "essentiels" : étape inconnue : "fantome"');
  });

  it('une image sans fichier ni générateur, un style et une salle de départ inconnus', () => {
    const museum = fixture();
    painting(museum, 'equilibre-no-7').image = {} as never;
    museum.style = 'baroque' as never;
    museum.start.room = 'jardin';
    const errors = errorsOf(museum);
    expect(errors).toContain('Œuvre "equilibre-no-7" : image : indiquez "src" (fichier) ou un "generator" connu');
    expect(errors).toContain('Musée : style inconnu : "baroque"');
    expect(errors).toContain('Départ : salle inconnue : "jardin"');
  });

  it('une configuration incomplète produit une erreur lisible plutôt qu’un plantage', () => {
    expect(errorsOf({} as MuseumConfig)).toContain('Musée : aucune salle');
    const museum = fixture();
    delete (museum.rooms[0] as Partial<(typeof museum.rooms)[0]>).size;
    expect(errorsOf(museum).some((e) => e.startsWith('Configuration : structure illisible'))).toBe(true);
  });
});

describe('avertissements', () => {
  it('une traduction manquante', () => {
    const museum = fixture();
    delete painting(museum, 'equilibre-no-7').title.en;
    expect(warningsOf(museum)).toEqual(['Œuvre "equilibre-no-7" : titre : traduction manquante (en)']);
    expect(errorsOf(museum)).toEqual([]);
  });

  it('deux tableaux qui se recouvrent', () => {
    const museum = fixture();
    painting(museum, 'petite-fugue').offset = -2.4;
    expect(warningsOf(museum)).toEqual(['Œuvre "equilibre-no-7" : recouvre l\'œuvre "petite-fugue" sur le mur north']);
  });
});

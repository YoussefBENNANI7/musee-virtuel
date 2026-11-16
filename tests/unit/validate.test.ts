import { describe, expect, it } from 'vitest';
import { DECORS, withDecorOverrides } from '../../src/engine/decors';
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

  it('chaque salle du musée de démonstration a son décor', () => {
    const decors = Object.fromEntries(demo().rooms.map((r) => [r.id, r.decor]));
    expect(decors).toEqual({ atrium: 'pierre-claire', horizons: 'argile-claire', cabinet: 'terre-cuite', galerie: 'nuit', cour: 'pierre-claire' });
  });

  it('les deux musées restent valides dans chaque décor de la bibliothèque', () => {
    for (const decor of Object.keys(DECORS)) {
      for (const style of Object.values(STYLES)) {
        expect(errorsOf(withDecorOverrides(demo(), decor), style), `démo, ${decor}, ${style.id}`).toEqual([]);
        expect(errorsOf(withDecorOverrides(fixture(), decor), style), `test, ${decor}, ${style.id}`).toEqual([]);
      }
    }
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

  it('un banc posé dans un mur, ou un niveau d’éclairage hors limites', () => {
    const museum = fixture();
    const galerie = museum.rooms.find((r) => r.id === 'galerie')!;
    galerie.benches = [{ position: [0, 3.6], rotated: true }, { position: [3.6, 0], rotated: true }, { position: [3.2, 0] }];
    galerie.light = 3;
    const errors = errorsOf(museum);
    // Le premier banc est bien placé ; le deuxième touche le mur est ; le troisième, en long, dépasse.
    expect(errors.filter((e) => e.includes('banc'))).toEqual([
      'Salle "galerie" : banc n° 2 : posé hors de la salle ou trop près d\'un mur',
      'Salle "galerie" : banc n° 3 : posé hors de la salle ou trop près d\'un mur',
    ]);
    expect(errors).toContain('Salle "galerie" : niveau d\'éclairage invalide (entre 0 et 2)');
  });

  it('un décor inconnu, ou un décor dont un réglage est faux', () => {
    const museum = fixture();
    const [hall, galerie, cabinet, rotonde] = museum.rooms;
    hall.decor = 'rococo';
    galerie.decor = { preset: 'nuit', colors: { wall: 'bleu' }, floor: 'moquette' as never, light: { level: 5, tint: 'chaud' }, gloss: 2 };
    cabinet.decor = { walls: 'crépi' as never, ceiling: { type: 'skylight' } as never, labels: 'fluo' as never, frame: { width: 0.8 } };
    rotonde.wall = 'rouge';
    const errors = errorsOf(museum);
    expect(errors).toContain('Salle "hall" : décor inconnu : "rococo" (décors disponibles : pierre-claire, argile-claire, terre-cuite, nuit)');
    expect(errors).toContain('Salle "galerie" : décor : couleur invalide pour "wall" : "bleu" (attendu : "#rrggbb")');
    expect(errors).toContain('Salle "galerie" : décor : sol inconnu : "moquette"');
    expect(errors).toContain('Salle "galerie" : décor : niveau d\'éclairage invalide (entre 0 et 2)');
    expect(errors).toContain('Salle "galerie" : décor : teinte de lumière invalide : "chaud" (attendu : "#rrggbb")');
    expect(errors).toContain('Salle "galerie" : décor : brillance du sol invalide (entre 0 et 1)');
    expect(errors).toContain('Salle "cabinet" : décor : finition de mur inconnue : "crépi"');
    expect(errors).toContain('Salle "cabinet" : décor : plafond inconnu : "skylight" (une verrière se déclare sur la salle)');
    expect(errors).toContain('Salle "cabinet" : décor : cartels inconnus : "fluo"');
    expect(errors).toContain('Salle "cabinet" : décor : cadre invalide (largeur et épaisseur entre 0 et 0,3 m, vide entre 0 et 0,1 m)');
    expect(errors).toContain('Salle "rotonde" : couleur de mur invalide : "rouge" (attendu : "#rrggbb")');
  });

  it('un plafond flottant trop large ou trop bas pour la salle', () => {
    const museum = fixture();
    museum.rooms[0].ceiling = { type: 'cove', inset: 4.5 };
    museum.rooms[1].ceiling = { type: 'cove', drop: 2 };
    museum.rooms[2].ceiling = { type: 'voûte' } as never;
    const errors = errorsOf(museum);
    expect(errors).toContain('Salle "hall" : plafond flottant : gorge trop large pour la taille de la salle');
    expect(errors).toContain('Salle "galerie" : plafond flottant : trop bas (minimum 2,4 m sous le panneau)');
    expect(errors).toContain('Salle "cabinet" : plafond inconnu : "voûte"');
  });

  it('le cadre du décor compte dans la place qu’un tableau prend sur le mur', () => {
    const museum = fixture();
    const hall = museum.rooms[0];
    // Avec le cadre du style, deux tableaux se touchent presque ; un cadre large les fait se recouvrir.
    const a = painting(museum, 'le-pays-d-avant');
    const b = painting(museum, 'carreaux-de-l-atelier');
    b.offset = a.offset + a.width / 2 + b.width / 2 + 0.16;
    expect(warningsOf(museum).filter((w) => w.includes('recouvre'))).toEqual([]);
    hall.decor = { frame: { width: 0.12 } };
    expect(warningsOf(museum).filter((w) => w.includes('recouvre'))).toEqual([
      'Œuvre "le-pays-d-avant" : recouvre l\'œuvre "carreaux-de-l-atelier" sur le mur south',
    ]);
  });

  it('un passe-partout hors limites, ou un lien qui n’est pas une adresse sûre', () => {
    const museum = fixture();
    painting(museum, 'portee').mat = 0.6;
    painting(museum, 'maree-basse').link = 'http://exemple.org/notice';
    painting(museum, 'petite-fugue').link = 'https://exemple.org/notice';
    const errors = errorsOf(museum);
    expect(errors).toContain('Œuvre "portee" : passe-partout invalide (entre 0 et 0,4 m)');
    expect(errors).toContain('Œuvre "maree-basse" : lien invalide : "http://exemple.org/notice" (attendu : une adresse en https://)');
    expect(errors.filter((e) => e.includes('petite-fugue'))).toEqual([]);
  });

  it('le passe-partout compte dans la place qu’une œuvre prend sur le mur', () => {
    const museum = fixture();
    const a = painting(museum, 'le-pays-d-avant');
    const b = painting(museum, 'carreaux-de-l-atelier');
    b.offset = a.offset + a.width / 2 + b.width / 2 + 0.3;
    expect(warningsOf(museum).filter((w) => w.includes('recouvre'))).toEqual([]);
    // Dix centimètres de carton de chaque côté : les deux œuvres se touchent désormais.
    a.mat = 0.1;
    b.mat = 0.1;
    expect(warningsOf(museum).filter((w) => w.includes('recouvre'))).toHaveLength(1);
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

  it('un auteur, une date ou une mention qui manquent dans une langue', () => {
    const museum = fixture();
    const art = painting(museum, 'petite-fugue');
    art.artist = { fr: 'Hélène Varga' };
    art.year = { fr: 'vers 1958', en: 'c. 1958' };
    art.credit = { fr: 'Musée des Horizons' };
    const warnings = warningsOf(museum);
    expect(warnings).toContain('Œuvre "petite-fugue" : artiste : traduction manquante (en)');
    expect(warnings).toContain('Œuvre "petite-fugue" : mention : traduction manquante (en)');
    expect(warnings.filter((w) => w.includes('date'))).toEqual([]);
  });

  it('un tableau dont les proportions ne sont plus celles de son image', () => {
    const museum = fixture();
    // « Portée » est accrochée avec les proportions de son image (300 × 450) : aucun avertissement.
    expect(warningsOf(museum)).toEqual([]);
    painting(museum, 'portee').width = 1.5;
    expect(warningsOf(museum)).toEqual([
      'Œuvre "portee" : ses proportions ne sont pas celles de son image, qui sera déformée : relancez « npm run images »',
    ]);
  });

  it('deux tableaux qui se recouvrent', () => {
    const museum = fixture();
    painting(museum, 'petite-fugue').offset = -2.4;
    expect(warningsOf(museum)).toEqual(['Œuvre "equilibre-no-7" : recouvre l\'œuvre "petite-fugue" sur le mur north']);
  });
});

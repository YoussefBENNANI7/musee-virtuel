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
    expect(decors).toEqual({ atrium: 'pierre-claire', horizons: 'argile-claire', cabinet: 'terre-cuite', galerie: 'nuit', cour: 'pierre-claire', riad: 'riad' });
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

  it('un socle dont le côté est donné : une longueur plausible, en mètres', () => {
    const museum = fixture();
    const works = museum.rooms.flatMap((r) => r.artworks);
    const ruban = works.find((a) => a.id === 'ruban')!;
    const orbites = works.find((a) => a.id === 'orbites')!;
    if (ruban.type === 'sculpture') ruban.plinthSide = 12;
    if (orbites.type === 'sculpture') orbites.plinthSide = 0.65;
    const errors = errorsOf(museum);
    expect(errors).toContain('Œuvre "ruban" : côté du socle : indiquez une longueur en mètres, de 0,2 à 2 ("plinthSide")');
    expect(errors.filter((e) => e.includes('orbites'))).toEqual([]);
  });

  it('un cartel de socle tourné vers un mur inconnu, ou une photographie de l’objet sans fichier', () => {
    const museum = fixture();
    const works = museum.rooms.flatMap((r) => r.artworks);
    const ruban = works.find((a) => a.id === 'ruban')!;
    const orbites = works.find((a) => a.id === 'orbites')!;
    if (ruban.type === 'sculpture') ruban.cardSide = 'nord' as never;
    if (orbites.type === 'sculpture') {
      orbites.cardSide = 'north';
      orbites.sourcePhoto = ' ';
    }
    const errors = errorsOf(museum);
    expect(errors).toContain('Œuvre "ruban" : côté du cartel inconnu : "nord" (north, south, east ou west)');
    expect(errors).toContain('Œuvre "orbites" : photographie de l\'objet réel : indiquez son fichier dans "sourcePhoto"');
    // Un côté connu et une photographie nommée ne posent aucun problème.
    if (orbites.type === 'sculpture') orbites.sourcePhoto = 'images/orbites.webp';
    expect(errorsOf(museum).filter((e) => e.includes('"orbites"'))).toEqual([]);
  });

  it('une sculpture posée dans un mur', () => {
    const museum = fixture();
    const sculpture = museum.rooms.flatMap((r) => r.artworks).find((a) => a.id === 'ruban')!;
    if (sculpture.type === 'sculpture') sculpture.position = [4.4, 0];
    expect(errorsOf(museum)).toContain('Œuvre "ruban" : posée hors de la salle ou trop près d\'un mur');
  });

  it('un modèle 3D qui n’est pas un fichier GLB, ou une sculpture sans modèle', () => {
    const museum = fixture();
    const works = museum.rooms.flatMap((r) => r.artworks);
    const ruban = works.find((a) => a.id === 'ruban')!;
    const orbites = works.find((a) => a.id === 'orbites')!;
    const galet = works.find((a) => a.id === 'galet-qui-respire')!;
    if (ruban.type === 'sculpture') ruban.model = { src: 'models/ruban.obj' };
    if (orbites.type === 'sculpture') orbites.model = {} as never;
    // Un modèle numérisé porte sa propre matière : le matériau n'est plus exigé.
    if (galet.type === 'sculpture') {
      galet.model = { src: 'models/galet.glb' };
      delete galet.material;
    }
    const errors = errorsOf(museum);
    expect(errors).toContain('Œuvre "ruban" : modèle : le fichier doit être au format GLB');
    expect(errors).toContain('Œuvre "orbites" : modèle : indiquez "src" (fichier GLB) ou un "generator" connu');
    expect(errors.filter((e) => e.includes('galet-qui-respire'))).toEqual([]);
  });

  it('un arc inconnu ou trop étroit, une fontaine contre un mur, un objet sans cadre trop bas', () => {
    const museum = fixture();
    museum.doors[0].arch = 'ogive' as never;
    museum.doors[1].arch = 'horseshoe';
    museum.doors[1].width = 1.2;
    museum.rooms[0].fountain = { position: [4.5, 0] };
    museum.rooms[3].fountain = { position: [0, 0] };
    const door = painting(museum, 'maree-basse');
    door.frameless = true;
    door.height = 3;
    door.y = 1.4;
    const errors = errorsOf(museum);
    expect(errors).toContain('Porte de "hall" (mur north) : arc inconnu : "ogive"');
    expect(errors).toContain('Porte de "hall" (mur east) : trop étroite pour un arc outrepassé (minimum 1,6 m)');
    expect(errors).toContain('Salle "hall" : fontaine : posée hors de la salle ou trop près d\'un mur');
    expect(errors.filter((e) => e.includes('rotonde') && e.includes('fontaine'))).toEqual([]);
    expect(errors).toContain('Œuvre "maree-basse" : trop haute : elle toucherait le sol');
    // Relevée de quinze centimètres, la même pièce tient : un objet sans cadre peut frôler le sol.
    door.y = 1.55;
    expect(errorsOf(museum).filter((e) => e.includes('maree-basse'))).toEqual([]);
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
    cabinet.decor = { walls: 'crépi' as never, ceiling: { type: 'skylight' } as never, labels: 'fluo' as never, frames: { plain: 'rococo', mat: 'baguette-chene' } };
    rotonde.wall = 'rouge';
    const errors = errorsOf(museum);
    expect(errors).toContain('Salle "hall" : décor inconnu : "rococo" (décors disponibles : pierre-claire, argile-claire, terre-cuite, riad, chambre-forte, guichets, nef, nuit)');
    expect(errors).toContain('Salle "galerie" : décor : couleur invalide pour "wall" : "bleu" (attendu : "#rrggbb")');
    expect(errors).toContain('Salle "galerie" : décor : sol inconnu : "moquette"');
    expect(errors).toContain('Salle "galerie" : décor : niveau d\'éclairage invalide (entre 0 et 2)');
    expect(errors).toContain('Salle "galerie" : décor : teinte de lumière invalide : "chaud" (attendu : "#rrggbb")');
    expect(errors).toContain('Salle "galerie" : décor : brillance du sol invalide (entre 0 et 1)');
    expect(errors).toContain('Salle "cabinet" : décor : finition de mur inconnue : "crépi"');
    expect(errors).toContain('Salle "cabinet" : décor : plafond inconnu : "skylight" (une verrière se déclare sur la salle)');
    expect(errors).toContain('Salle "cabinet" : décor : cartels inconnus : "fluo"');
    expect(errors.filter((e) => e.includes('cadre inconnu'))).toHaveLength(1);
    expect(errors.find((e) => e.includes('cadre inconnu'))).toMatch(/^Salle "cabinet" : décor : cadre inconnu pour "plain" : "rococo" \(cadres disponibles : dore-classique, /);
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
    // Avec la baguette du style, deux tableaux se touchent presque ; un cadre large les fait se recouvrir.
    const a = painting(museum, 'le-pays-d-avant');
    const b = painting(museum, 'carreaux-de-l-atelier');
    b.offset = a.offset + a.width / 2 + b.width / 2 + 0.16;
    expect(warningsOf(museum).filter((w) => w.includes('recouvre'))).toEqual([]);
    hall.decor = { frames: { plain: 'dore-ancien' } };
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

  it('un cadre doré est plus large que celui de la salle, et un cadre inconnu est refusé', () => {
    const museum = fixture();
    const a = painting(museum, 'le-pays-d-avant');
    const b = painting(museum, 'carreaux-de-l-atelier');
    b.offset = a.offset + a.width / 2 + b.width / 2 + 0.16;
    expect(warningsOf(museum).filter((w) => w.includes('recouvre'))).toEqual([]);
    a.frame = 'gilt';
    b.frame = 'gilt';
    expect(warningsOf(museum).filter((w) => w.includes('recouvre'))).toHaveLength(1);
    painting(museum, 'portee').frame = 'rococo';
    expect(errorsOf(museum)).toContain('Œuvre "portee" : cadre inconnu : "rococo"');
    // Une œuvre peut aussi demander un modèle par son nom.
    painting(museum, 'portee').frame = 'noir-filet-or';
    expect(errorsOf(museum).filter((e) => e.includes('cadre'))).toEqual([]);
  });

  it('le passe-partout compte dans la place qu’une œuvre prend sur le mur', () => {
    const museum = fixture();
    const a = painting(museum, 'le-pays-d-avant');
    const b = painting(museum, 'carreaux-de-l-atelier');
    b.offset = a.offset + a.width / 2 + b.width / 2 + 0.2;
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

describe('verso d’un objet à deux faces', () => {
  it('accepte un verso donné en fichier, et refuse un verso sans fichier', () => {
    const museum = fixture();
    const portee = painting(museum, 'portee');
    portee.back = { src: 'images/portee-verso.webp' };
    expect(validateMuseum(museum, classic)).toEqual([]);
    (portee as { back?: unknown }).back = { src: '  ' };
    expect(errorsOf(museum)).toEqual(['Œuvre "portee" : le verso ("back") doit donner un fichier image : { "src": "images/….webp" }']);
    (portee as { back?: unknown }).back = 'images/portee-verso.webp';
    expect(errorsOf(museum)).toHaveLength(1);
  });

  it('signale un verso sur un tableau dessiné par le moteur : il ne se montrerait pas', () => {
    const museum = fixture();
    const fictif = museum.rooms.flatMap((r) => r.artworks).find((a) => a.type === 'painting' && 'generator' in a.image) as PaintingConfig;
    fictif.back = { src: 'images/verso.webp' };
    expect(warningsOf(museum)).toEqual([`Œuvre "${fictif.id}" : le verso ne se montre que pour une œuvre fournie en fichier image`]);
  });
});

describe('pièce de monnaie à deux faces', () => {
  /** Le musée de test, avec une vitrine et une pièce dans le hall. */
  const withCoin = (model: Record<string, unknown>) => {
    const museum = fixture();
    const hall = museum.rooms[0];
    hall.vitrines = [{ id: 'tresor', position: [3, 2] }];
    hall.artworks.push({ id: 'piece', type: 'sculpture', title: { fr: 'Pièce', en: 'Coin' }, artist: 'Atelier', year: '1900', medium: { fr: 'Argent', en: 'Silver' }, description: { fr: 'Une pièce.', en: 'A coin.' }, position: [0, 0], height: 0.03, plinth: 0.92, vitrine: { id: 'tresor', slot: 0 }, model } as never);
    return museum;
  };

  it('accepte une pièce avec ou sans revers', () => {
    expect(errorsOf(withCoin({ coin: 'images/piece.webp', metal: 'silver' }))).toEqual([]);
    expect(errorsOf(withCoin({ coin: 'images/piece.webp', coinBack: 'images/piece-revers.webp', metal: 'silver' }))).toEqual([]);
  });

  it('refuse un revers qui ne donne pas d’image', () => {
    expect(errorsOf(withCoin({ coin: 'images/piece.webp', coinBack: '', metal: 'silver' }))).toEqual(['Œuvre "piece" : pièce : "model.coinBack" doit donner l\'image de son autre face']);
    expect(errorsOf(withCoin({ coin: 'images/piece.webp', coinBack: 3, metal: 'silver' }))).toHaveLength(1);
  });
});

describe('scénographie : éclairage d’accent, cloche, zones au sol, lettrage mural', () => {
  /** Le musée de test, dont la rotonde (9 m sur 9, des sculptures sur socle) reçoit une scénographie. */
  const staged = (change: (room: MuseumConfig['rooms'][number]) => void) => {
    const museum = fixture();
    change(museum.rooms.find((r) => r.id === 'rotonde')!);
    return museum;
  };

  it('accepte une salle mise en scène', () => {
    const museum = staged((room) => {
      room.decor = { preset: 'nuit', light: { accents: 1 } };
      room.zones = [{ position: [0, 0], size: [3, 2], color: '#3a2618', border: '#b9944a' }];
      room.lettering = [
        { wall: 'north', offset: 0, text: { fr: 'Compter', en: 'Counting' } },
        { wall: 'east', offset: 1, kind: 'text', width: 1.4, text: { fr: 'Un court texte.', en: 'A short text.' } },
      ];
      const sculpture = room.artworks.find((a) => a.type === 'sculpture')!;
      if (sculpture.type === 'sculpture') sculpture.hood = true;
    });
    expect(errorsOf(museum)).toEqual([]);
    expect(warningsOf(museum)).toEqual([]);
  });

  it('accepte une verrière à traverses fines, et refuse un autre mot', () => {
    expect(errorsOf(staged((room) => (room.ceiling = { type: 'skylight', bars: 'fine' })))).toEqual([]);
    const museum = staged((room) => (room.ceiling = { type: 'skylight', bars: 'épaisses' as 'fine' }));
    expect(errorsOf(museum)).toEqual(['Salle "rotonde" : verrière : pour des traverses fines, indiquez "fine" dans "bars"']);
  });

  it('refuse un éclairage d’accent hors limites et une cloche mal écrite', () => {
    expect(errorsOf(staged((room) => (room.decor = { preset: 'nuit', light: { accents: 3 } })))).toEqual(['Salle "rotonde" : décor : force de l\'éclairage d\'accent des objets invalide (entre 0 et 2)']);
    const museum = staged((room) => {
      (room.artworks.find((a) => a.type === 'sculpture') as unknown as { hood: unknown }).hood = 'oui';
    });
    expect(errorsOf(museum)).toHaveLength(1);
    expect(errorsOf(museum)[0]).toContain('cloche de verre');
  });

  it('refuse une zone au sol qui dépasse de la salle ou dont la couleur est illisible', () => {
    expect(errorsOf(staged((room) => (room.zones = [{ position: [3.5, 0], size: [3, 2] }])))).toEqual(['Salle "rotonde", zone au sol n° 1 : elle dépasse de la salle']);
    expect(errorsOf(staged((room) => (room.zones = [{ position: [0, 0], size: [0, 2] }])))).toEqual(['Salle "rotonde", zone au sol n° 1 : dimensions invalides']);
    expect(errorsOf(staged((room) => (room.zones = [{ position: [0, 0], size: [2, 2], color: 'brun' }])))).toEqual(['Salle "rotonde", zone au sol n° 1 : couleur invalide : "brun" (attendu : "#rrggbb")']);
  });

  it('refuse un lettrage hors du mur, sur un mur inconnu ou d’un genre inconnu, et signale une traduction manquante', () => {
    const text = { fr: 'Compter', en: 'Counting' };
    expect(errorsOf(staged((room) => (room.lettering = [{ wall: 'north', offset: 6, text }])))).toEqual(['Salle "rotonde", lettrage n° 1 : placé hors du mur']);
    expect(errorsOf(staged((room) => (room.lettering = [{ wall: 'north', offset: 0, y: 9, text }])))).toEqual(['Salle "rotonde", lettrage n° 1 : placé hors du mur, en hauteur']);
    expect(errorsOf(staged((room) => (room.lettering = [{ wall: 'haut' as never, offset: 0, text }])))).toEqual(['Salle "rotonde", lettrage n° 1 : mur inconnu : "haut"']);
    expect(errorsOf(staged((room) => (room.lettering = [{ wall: 'north', offset: 0, kind: 'affiche' as never, text }])))).toEqual(['Salle "rotonde", lettrage n° 1 : genre inconnu : "affiche" (title ou text)']);
    expect(errorsOf(staged((room) => (room.lettering = [{ wall: 'north', offset: 0, height: 2, text }])))).toEqual(['Salle "rotonde", lettrage n° 1 : hauteur de ligne invalide (entre 2 cm et 1 m)']);
    expect(warningsOf(staged((room) => (room.lettering = [{ wall: 'north', offset: 0, text: { fr: 'Compter' } }])))).toEqual(['Salle "rotonde", lettrage n° 1 : texte : traduction manquante (en)']);
  });
});

describe('audioguide : textes, témoignages et présentations de salle', () => {
  it('accepte un musée qui les déclare, et signale un témoignage sans fichier', () => {
    const museum = demo();
    const room = museum.rooms[0];
    room.intro = { text: { fr: 'Bienvenue.', en: 'Welcome.' } };
    const art = room.artworks[0];
    art.narration = { fr: 'Texte dit.', en: 'Spoken text.' };
    art.testimony = { audio: { fr: 'audio/temoin.fr.mp3' }, label: { fr: 'Écouter', en: 'Listen' } };
    expect(errorsOf(museum)).toEqual([]);
    art.testimony = { audio: {}, label: { fr: 'Écouter', en: 'Listen' } };
    expect(errorsOf(museum)).toContain(`Œuvre "${art.id}" : témoignage : indiquez son fichier audio`);
  });
});

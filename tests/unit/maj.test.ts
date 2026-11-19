import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { resolveStyle } from '../../src/engine/styles';
import { validateMuseum } from '../../src/engine/validate';
// @ts-expect-error Module JavaScript sans déclaration de types.
import { applyUpdate, openPackage, patchArtwork, planUpdate, safePath } from '../../scripts/maj.mjs';

const demo = fileURLToPath(new URL('../../public/museums/demo/museum.json', import.meta.url));
let root = '';
let museums = '';
let backups = '';
let pack = '';

/** Un petit musée sur le disque : une salle, un tableau avec son image, une pièce en vitrine. */
function museum() {
  return {
    id: 'essai',
    name: { fr: 'Essai' },
    rooms: [
      {
        id: 'salle',
        artworks: [
          { id: 'tableau', type: 'painting', title: { fr: 'Tableau' }, year: '', image: { src: 'images/tableau.webp', width: 800 }, width: 0.5, height: 0.4 },
          { id: 'piece', type: 'sculpture', title: { fr: 'Pièce' }, model: { coin: 'images/piece.webp', metal: 'silver' }, credit: { fr: 'Ancienne mention' } },
        ],
      },
    ],
  };
}

function write(path: string, content: string | Buffer) {
  mkdirSync(join(path, '..'), { recursive: true });
  writeFileSync(path, content);
}

/** Écrit un paquet : son maj.json et ses fichiers. */
function makePackage(manifest: unknown, files: Record<string, string> = {}) {
  write(join(pack, 'maj.json'), JSON.stringify(manifest));
  for (const [path, content] of Object.entries(files)) write(join(pack, path), content);
}

const config = () => JSON.parse(readFileSync(join(museums, 'essai', 'museum.json'), 'utf8'));
const options = () => ({ museumsDir: museums, backupDir: backups, now: new Date('2026-11-19T16:30:05Z') });

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'maj-'));
  museums = join(root, 'museums');
  backups = join(root, 'sauvegardes');
  pack = join(root, 'paquet');
  write(join(museums, 'essai', 'museum.json'), `${JSON.stringify(museum(), null, 2)}\n`);
  write(join(museums, 'essai', 'images', 'tableau.webp'), 'ancienne image');
  write(join(museums, 'essai', 'images', 'piece.webp'), 'ancienne pièce');
  mkdirSync(pack, { recursive: true });
});
afterEach(() => rmSync(root, { recursive: true, force: true }));

describe('paquet de mise à jour d’un musée', () => {
  it('n’accepte que des chemins sans danger, dans les dossiers d’un musée', () => {
    for (const good of ['images/a.webp', 'models/web/livre.glb', 'audio/voix.fr.mp3']) expect(safePath(good), good).not.toBeNull();
    for (const bad of ['', 'a.webp', 'museum.json', '../images/a.webp', 'images/../museum.json', '/images/a.webp', 'images\\a.webp', 'images/.cache', 'lumiere/a.png', 'images//a.webp', null, 3])
      expect(safePath(bad), String(bad)).toBeNull();
  });

  it('retouche une œuvre : remplace un champ, fusionne un objet, retire sur null', () => {
    const art = { id: 'a', year: '', image: { src: 'x.webp', width: 800 }, credit: { fr: 'c' }, tags: ['un'] };
    expect(patchArtwork(art, { year: '1970', image: { src: 'y.webp' }, credit: null, tags: ['deux'] })).toEqual({ id: 'a', year: '1970', image: { src: 'y.webp', width: 800 }, tags: ['deux'] });
    // L'œuvre d'origine n'est pas modifiée.
    expect(art.image.src).toBe('x.webp');
  });

  it('pose les fichiers, retouche les œuvres et garde l’état précédent', () => {
    makePackage(
      { musee: 'essai', titre: 'Deux images', fichiers: ['images/tableau.webp', 'images/nouvelle.webp'], oeuvres: { tableau: { year: '1970 (1390 H)' }, piece: { credit: { fr: 'Exemplaire du même type' }, model: { coin: 'images/nouvelle.webp' } } } },
      { 'images/tableau.webp': 'nouvelle image', 'images/nouvelle.webp': 'nouvelle pièce' },
    );
    const result = applyUpdate('essai', pack, options());

    expect(readFileSync(join(museums, 'essai', 'images', 'tableau.webp'), 'utf8')).toBe('nouvelle image');
    expect(readFileSync(join(museums, 'essai', 'images', 'nouvelle.webp'), 'utf8')).toBe('nouvelle pièce');
    const [tableau, piece] = config().rooms[0].artworks;
    expect(tableau.year).toBe('1970 (1390 H)');
    // Le reste de l'œuvre est intact, y compris les champs voisins d'un objet fusionné.
    expect(tableau.image).toEqual({ src: 'images/tableau.webp', width: 800 });
    expect(piece.model).toEqual({ coin: 'images/nouvelle.webp', metal: 'silver' });
    expect(piece.credit).toEqual({ fr: 'Exemplaire du même type' });

    // La sauvegarde contient la configuration et l'image remplacée, pas le fichier ajouté.
    expect(result.backup).toBe(join(backups, 'essai', '2026-11-19-16-30-05'));
    expect(JSON.parse(readFileSync(join(result.backup, 'museum.json'), 'utf8'))).toEqual(museum());
    expect(readFileSync(join(result.backup, 'images', 'tableau.webp'), 'utf8')).toBe('ancienne image');
    expect(existsSync(join(result.backup, 'images', 'nouvelle.webp'))).toBe(false);
    expect(result.copies.map((c: { path: string; replaces: boolean }) => [c.path, c.replaces])).toEqual([['images/tableau.webp', true], ['images/nouvelle.webp', false]]);
    // Aucun fichier provisoire ne traîne.
    expect(readdirSync(join(museums, 'essai', 'images')).filter((name) => name.endsWith('.tmp'))).toEqual([]);
  });

  it('appliqué deux fois, un paquet donne le même musée, avec deux sauvegardes distinctes', () => {
    makePackage({ musee: 'essai', fichiers: ['images/tableau.webp'], oeuvres: { tableau: { year: '1970' } } }, { 'images/tableau.webp': 'nouvelle image' });
    applyUpdate('essai', pack, options());
    const first = readFileSync(join(museums, 'essai', 'museum.json'), 'utf8');
    const second = applyUpdate('essai', pack, options());
    expect(readFileSync(join(museums, 'essai', 'museum.json'), 'utf8')).toBe(first);
    expect(second.backup).toBe(join(backups, 'essai', '2026-11-19-16-30-05-2'));
    expect(second.changed).toBe(false);
  });

  it('un essai décrit la mise à jour sans rien écrire', () => {
    makePackage({ musee: 'essai', titre: 'Essai', fichiers: ['images/tableau.webp'], oeuvres: { tableau: { year: '1970' } } }, { 'images/tableau.webp': 'nouvelle image' });
    const before = readFileSync(join(museums, 'essai', 'museum.json'), 'utf8');
    const plan = planUpdate('essai', pack, museums);
    expect(plan.title).toBe('Essai');
    expect(plan.artworks).toEqual([{ id: 'tableau', room: 'salle', fields: ['year'] }]);
    expect(readFileSync(join(museums, 'essai', 'museum.json'), 'utf8')).toBe(before);
    expect(readFileSync(join(museums, 'essai', 'images', 'tableau.webp'), 'utf8')).toBe('ancienne image');
    expect(existsSync(backups)).toBe(false);
  });

  it('refuse un paquet douteux, et laisse alors le musée intact', () => {
    const before = readFileSync(join(museums, 'essai', 'museum.json'), 'utf8');
    const cases: [string, unknown, Record<string, string>, RegExp][] = [
      ['autre musée', { musee: 'autre', fichiers: ['images/tableau.webp'] }, { 'images/tableau.webp': 'x' }, /destiné au musée « autre »/],
      ['œuvre inconnue', { musee: 'essai', oeuvres: { inconnue: { year: '1' } } }, {}, /œuvre inconnue/],
      ['fichier absent', { musee: 'essai', fichiers: ['images/absent.webp'] }, {}, /absent du paquet/],
      ['chemin dangereux', { musee: 'essai', fichiers: ['../museum.json'] }, {}, /fichier refusé/],
      ['fichier non déclaré', { musee: 'essai', fichiers: ['images/tableau.webp'] }, { 'images/tableau.webp': 'x', 'images/oublie.webp': 'y' }, /absent de maj\.json : images\/oublie\.webp/],
      ['image promise mais introuvable', { musee: 'essai', oeuvres: { tableau: { image: { src: 'images/nulle-part.webp' } } } }, {}, /fichier qui n'existe pas : images\/nulle-part\.webp/],
      ['changement d’identifiant', { musee: 'essai', oeuvres: { tableau: { id: 'autre' } } }, {}, /identifiant/],
      ['paquet vide', { musee: 'essai' }, {}, /rien à appliquer/],
    ];
    for (const [name, manifest, files, message] of cases) {
      rmSync(pack, { recursive: true, force: true });
      mkdirSync(pack, { recursive: true });
      makePackage(manifest, files);
      expect(() => applyUpdate('essai', pack, options()), name).toThrow(message);
      expect(readFileSync(join(museums, 'essai', 'museum.json'), 'utf8'), name).toBe(before);
      expect(readFileSync(join(museums, 'essai', 'images', 'tableau.webp'), 'utf8'), name).toBe('ancienne image');
    }
    expect(existsSync(backups)).toBe(false);
    // Un dossier sans maj.json, un musée absent, un nom de musée dangereux.
    rmSync(join(pack, 'maj.json'));
    expect(() => planUpdate('essai', pack, museums)).toThrow(/pas de fichier maj\.json/);
    expect(() => planUpdate('absent', pack, museums)).toThrow(/musée introuvable/);
    expect(() => planUpdate('../essai', pack, museums)).toThrow(/nom de musée invalide/);
  });

  it('transforme un tableau en objet 3D : le modèle, ses versions pour le web et sa photographie doivent être là', () => {
    const change = { type: 'sculpture', image: null, width: null, position: [0, 1], height: 0.3, plinth: 0.95, model: { src: 'models/tableau.glb', web: true }, photo: 'images/tableau.webp', sourcePhoto: 'images/tableau.webp' };
    const fresh = (manifest: unknown, files: Record<string, string> = {}) => {
      rmSync(pack, { recursive: true, force: true });
      mkdirSync(pack, { recursive: true });
      makePackage(manifest, files);
    };
    // Sans les versions préparées pour le web, le musée chercherait des fichiers absents : le paquet est refusé.
    fresh({ musee: 'essai', fichiers: ['models/tableau.glb'], oeuvres: { tableau: change } }, { 'models/tableau.glb': 'modèle' });
    expect(() => applyUpdate('essai', pack, options())).toThrow(/fichier qui n'existe pas : models\/web\/tableau\.glb/);

    fresh(
      { musee: 'essai', fichiers: ['models/tableau.glb', 'models/web/tableau.glb', 'models/web/tableau-leger.glb'], oeuvres: { tableau: change } },
      { 'models/tableau.glb': 'modèle', 'models/web/tableau.glb': 'web', 'models/web/tableau-leger.glb': 'léger' },
    );
    applyUpdate('essai', pack, options());
    // Les champs du tableau (image, largeur) ont disparu ; ceux qui restent valables sont gardés.
    expect(config().rooms[0].artworks[0]).toEqual({
      id: 'tableau',
      type: 'sculpture',
      title: { fr: 'Tableau' },
      year: '',
      position: [0, 1],
      height: 0.3,
      plinth: 0.95,
      model: { src: 'models/tableau.glb', web: true },
      photo: 'images/tableau.webp',
      sourcePhoto: 'images/tableau.webp',
    });
    expect(readFileSync(join(museums, 'essai', 'models', 'web', 'tableau-leger.glb'), 'utf8')).toBe('léger');

    // Une photographie annoncée mais absente du musée est refusée elle aussi.
    fresh({ musee: 'essai', oeuvres: { tableau: { sourcePhoto: 'images/ailleurs.webp' } } });
    expect(() => applyUpdate('essai', pack, options())).toThrow(/fichier qui n'existe pas : images\/ailleurs\.webp/);
  });

  it('ouvre une archive .zip, même quand elle contient un dossier qui contient le paquet', () => {
    makePackage({ musee: 'essai', fichiers: ['images/tableau.webp'] }, { 'images/tableau.webp': 'nouvelle image' });
    const zip = join(root, 'paquet.zip');
    // L'archive contient « paquet/maj.json », comme lorsqu'on compresse un dossier entier.
    execFileSync('zip', ['-q', '-r', zip, 'paquet'], { cwd: root });
    const opened = openPackage(zip);
    try {
      expect(existsSync(join(opened.dir, 'maj.json'))).toBe(true);
      applyUpdate('essai', opened.dir, options());
    } finally {
      opened.close();
    }
    expect(existsSync(opened.dir)).toBe(false);
    expect(readFileSync(join(museums, 'essai', 'images', 'tableau.webp'), 'utf8')).toBe('nouvelle image');
    expect(() => openPackage(join(root, 'absent.zip'))).toThrow(/introuvable/);
    expect(() => openPackage(demo)).toThrow(/dossier ou une archive/);
  });

  it('retouché par un paquet, le musée de démonstration reste valide', () => {
    const original = JSON.parse(readFileSync(demo, 'utf8'));
    type Art = { id: string; type: string; image: { src: string }; audio?: Record<string, string> };
    const first: Art = original.rooms.flatMap((room: { artworks: Art[] }) => room.artworks).find((art: Art) => art.type === 'painting');
    write(join(museums, 'demo', 'museum.json'), JSON.stringify(original));
    // Les fichiers de l'œuvre retouchée doivent exister : le paquet vérifie qu'elle les retrouvera.
    for (const file of [first.image.src, ...Object.values(first.audio ?? {})]) write(join(museums, 'demo', file), 'fichier');
    makePackage({ musee: 'demo', oeuvres: { [first.id]: { year: '1970 (1390 H)', credit: { fr: 'Image : exemplaire du même type.' } } } });
    const plan = planUpdate('demo', pack, museums);
    expect(plan.changed).toBe(true);
    expect(validateMuseum(plan.museum, resolveStyle(plan.museum))).toEqual([]);
  });
});

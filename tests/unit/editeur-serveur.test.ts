import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  cleanImages,
  isSlug,
  listMuseums,
  lumiereStatus,
  parseCrop,
  readIndex,
  removeMuseum,
  restoreDemo,
  saveMuseum,
  setShowcase,
  startLumiere,
  storeCover,
  storeImage,
  syncShowcase,
  // @ts-expect-error Module JavaScript sans déclaration de types.
} from '../../scripts/editeur-serveur.mjs';

const photo = readFileSync(fileURLToPath(new URL('../fixtures/image.webp', import.meta.url)));
let dir = '';
beforeEach(() => (dir = mkdtempSync(join(tmpdir(), 'musees-'))));
afterEach(() => rmSync(dir, { recursive: true, force: true }));

describe('service local de l’éditeur', () => {
  it('n’accepte que des identifiants sans danger pour le disque', () => {
    expect(['demo', 'mon-musee-2', 'a'].every(isSlug)).toBe(true);
    for (const bad of ['', '../demo', 'Musee', 'mon musee', '-x', 'a/b', 'a.b', 'é', 'x'.repeat(60), null, 3]) expect(isSlug(bad), String(bad)).toBe(false);
  });

  it('lit une zone de recadrage, et refuse celle qui sort de l’image', () => {
    expect(parseCrop('0.1,0.2,0.5,0.6')).toEqual({ x: 0.1, y: 0.2, w: 0.5, h: 0.6 });
    expect(parseCrop('0,0,1,1')).toEqual({ x: 0, y: 0, w: 1, h: 1 });
    for (const bad of ['', '0.5,0,0.6,1', '0,0,0.001,1', '-0.1,0,0.5,0.5', '1,2,3', 'a,b,c,d']) expect(parseCrop(bad), bad).toBeNull();
  });

  it('enregistre un musée dans son dossier et le retrouve dans la liste', () => {
    saveMuseum('essai', { id: 'autre', name: { fr: 'Essai' }, rooms: [{ id: 's', artworks: [{ id: 'a' }, { id: 'b' }] }], reserve: [{ id: 'c' }] }, dir);
    const saved = JSON.parse(readFileSync(join(dir, 'essai', 'museum.json'), 'utf8'));
    // L'identifiant est toujours celui du dossier.
    expect(saved.id).toBe('essai');
    expect(listMuseums(dir)).toMatchObject([{ id: 'essai', name: { fr: 'Essai' }, rooms: 1, works: 3 }]);
    expect(() => saveMuseum('essai', { name: 'sans salles' }, dir)).toThrow(/illisible/);
  });

  it('supprime un musée en rangeant son dossier à part, sauf la démonstration', () => {
    const trash = join(dir, 'corbeille');
    const museums = join(dir, 'musees');
    saveMuseum('essai', { name: { fr: 'Essai' }, rooms: [] }, museums);
    saveMuseum('demo', { name: { fr: 'Démo' }, rooms: [] }, museums);
    expect(listMuseums(museums).map((m: { id: string; locked: boolean }) => [m.id, m.locked]).sort()).toEqual([['demo', true], ['essai', false]]);

    const when = new Date('2026-11-17T09:30:05Z');
    expect(removeMuseum('essai', museums, trash, when)).toEqual({ kept: 'musees-supprimes/essai-2026-11-17-09-30-05' });
    expect(existsSync(join(museums, 'essai'))).toBe(false);
    // Rien n'est effacé : la configuration est intacte dans la corbeille.
    expect(JSON.parse(readFileSync(join(trash, 'essai-2026-11-17-09-30-05', 'museum.json'), 'utf8')).name).toEqual({ fr: 'Essai' });
    // Un second musée du même nom, supprimé dans la même seconde, ne remplace pas le premier.
    saveMuseum('essai', { name: { fr: 'Essai 2' }, rooms: [] }, museums);
    expect(removeMuseum('essai', museums, trash, when).kept).toBe('musees-supprimes/essai-2026-11-17-09-30-05-2');

    expect(() => removeMuseum('demo', museums, trash)).toThrow(/démonstration/);
    expect(existsSync(join(museums, 'demo', 'museum.json'))).toBe(true);
    expect(() => removeMuseum('absent', museums, trash)).toThrow(/introuvable/);
  });

  it('prépare une photo déposée : source, image et versions allégées, puis la recadre', async () => {
    const first = await storeImage('essai', 'toile', photo, null, dir);
    expect(first.image).toMatchObject({ width: 300, height: 450, variants: [450] });
    expect(first.image.src).toMatch(/^images\/toile-[a-z0-9]+\.jpg$/);
    const images = join(dir, 'essai', 'images');
    expect(existsSync(join(images, 'sources', 'toile.jpg'))).toBe(true);
    expect(existsSync(join(dir, 'essai', first.image.src))).toBe(true);
    expect(readdirSync(join(images, 'web'))).toHaveLength(1);

    // Recadrer repart de la source et produit un fichier au nom nouveau.
    await new Promise((r) => setTimeout(r, 5));
    const cropped = await storeImage('essai', 'toile', null, { x: 0, y: 0, w: 0.5, h: 0.5 }, dir);
    expect(cropped.image).toMatchObject({ width: 150, height: 225, variants: [225] });
    expect(cropped.image.src).not.toBe(first.image.src);
    expect(cropped.source).toMatchObject({ width: 300, height: 450 });
  });

  it('refuse un fichier qui n’est pas une image, et un recadrage sans photo', async () => {
    await expect(storeImage('essai', 'toile', Buffer.from('ceci n’est pas une image'), null, dir)).rejects.toThrow(/image illisible/);
    await expect(storeImage('essai', 'absente', null, { x: 0, y: 0, w: 1, h: 1 }, dir)).rejects.toThrow(/aucune image/);
  });

  it('fait le ménage des anciennes versions au bout d’un jour, jamais avant', async () => {
    const old = await storeImage('essai', 'toile', photo, null, dir);
    await new Promise((r) => setTimeout(r, 5));
    const current = await storeImage('essai', 'toile', null, { x: 0, y: 0, w: 0.5, h: 0.5 }, dir);
    const gone = await storeImage('essai', 'supprimee', photo, null, dir);
    const folder = join(dir, 'essai');
    const museum = { rooms: [{ artworks: [{ id: 'toile', image: current.image }] }] };
    const files = () => readdirSync(join(folder, 'images')).filter((f) => f.endsWith('.jpg')).sort();

    cleanImages(folder, museum);
    expect(files()).toHaveLength(3);
    // Deux jours plus tard : l'ancienne version et la photo de l'œuvre supprimée disparaissent.
    cleanImages(folder, museum, Date.now() + 2 * 24 * 3600 * 1000);
    expect(files()).toEqual([current.image.src.split('/')[1]]);
    expect(readdirSync(join(folder, 'images', 'sources'))).toEqual(['toile.jpg']);
    expect(readdirSync(join(folder, 'images', 'web'))).toHaveLength(1);
    expect(existsSync(join(folder, old.image.src))).toBe(false);
    expect(existsSync(join(folder, gone.image.src))).toBe(false);
  });

  it('ne touche jamais aux images qu’il n’a pas déposées lui-même', () => {
    // Le musée de démonstration range ses images à la main : l'éditeur n'y fait aucun ménage.
    const demo = fileURLToPath(new URL('../../public/museums/demo/', import.meta.url));
    const before = readdirSync(join(demo, 'images')).length;
    cleanImages(demo, { rooms: [] }, Date.now() + 10 * 24 * 3600 * 1000);
    expect(readdirSync(join(demo, 'images')).length).toBe(before);
  });
});

describe('page de choix des musées, depuis l’éditeur', () => {
  const art = { id: 'a', image: { src: 'images/a-x1.jpg', width: 10, height: 10, variants: [640, 1024, 1600] } };
  const entry = (id: string) => readIndex(dir).find((e: { id: string }) => e.id === id);

  it('propose un musée : la liste naît avec la démonstration, et un musée retiré garde sa présentation', () => {
    saveMuseum('demo', { name: { fr: 'Démo' }, rooms: [] }, dir);
    saveMuseum('expo', { name: { fr: 'Expo' }, theme: { accent: '#123456' }, rooms: [{ id: 's', artworks: [art] }] }, dir);
    expect(readIndex(dir)).toEqual([]);

    // Sans couverture, la carte montre la première œuvre, dans sa version allégée.
    const shown = setShowcase('expo', { shown: true, summary: { fr: 'Une expo', en: 3, '../x': 'non' } }, dir);
    expect(shown).toEqual({ shown: true, summary: { fr: 'Une expo' }, image: 'expo/images/web/a-x1-1024.webp' });
    expect(readIndex(dir).map((e: { id: string }) => e.id)).toEqual(['demo', 'expo']);
    expect(entry('demo').summary.fr).toMatch(/Six salles/);
    expect(entry('expo')).toMatchObject({ name: { fr: 'Expo' }, accent: '#123456' });
    expect(listMuseums(dir).map((m: { id: string; shown: boolean }) => [m.id, m.shown]).sort()).toEqual([['demo', true], ['expo', true]]);

    // Retiré, puis revenu : sa présentation n'est jamais perdue.
    expect(setShowcase('expo', { shown: false }, dir)).toMatchObject({ shown: false, summary: { fr: 'Une expo' } });
    expect(entry('expo').hidden).toBe(true);
    expect(setShowcase('expo', { shown: true }, dir).shown).toBe(true);
    expect(entry('expo')).not.toHaveProperty('hidden');

    // Renommé dans l'éditeur : la page de choix suit.
    saveMuseum('expo', { name: { fr: 'Expo renommée' }, rooms: [] }, dir);
    expect(entry('expo').name).toEqual({ fr: 'Expo renommée' });
    expect(() => setShowcase('absent', { shown: true }, dir)).toThrow(/introuvable/);
  });

  it('ne remplace jamais une liste devenue illisible', () => {
    saveMuseum('expo', { name: { fr: 'Expo' }, rooms: [] }, dir);
    writeFileSync(join(dir, 'index.json'), '[{ "id": "expo", }');
    expect(() => setShowcase('expo', { shown: true }, dir)).toThrow(/illisible/);
    expect(readFileSync(join(dir, 'index.json'), 'utf8')).toBe('[{ "id": "expo", }');
    // L'enregistrement du musée, lui, se fait quand même.
    saveMuseum('expo', { name: { fr: 'Expo 2' }, rooms: [] }, dir);
    expect(readFileSync(join(dir, 'index.json'), 'utf8')).toBe('[{ "id": "expo", }');
  });

  it('enregistre une couverture au format des cartes, et retire l’ancienne', async () => {
    saveMuseum('expo', { name: { fr: 'Expo' }, rooms: [{ id: 's', artworks: [art] }] }, dir);
    setShowcase('expo', { shown: true }, dir);
    const first = await storeCover('expo', photo, dir);
    expect(first.image).toMatch(/^expo\/couverture-[a-z0-9]+\.webp$/);
    expect(await sharp(join(dir, first.image)).metadata()).toMatchObject({ format: 'webp', width: 1600, height: 1000 });
    expect(entry('expo').image).toBe(first.image);

    await new Promise((r) => setTimeout(r, 5));
    const second = await storeCover('expo', photo, dir);
    expect(existsSync(join(dir, first.image))).toBe(false);
    expect(entry('expo').image).toBe(second.image);
    await expect(storeCover('expo', Buffer.from('pas une image'), dir)).rejects.toThrow(/illisible/);
    await expect(storeCover('absent', photo, dir)).rejects.toThrow(/introuvable/);
  });

  it('au démarrage, la page de choix reprend la couverture que chaque musée a dans son dossier', () => {
    saveMuseum('demo', { name: { fr: 'Démo' }, rooms: [] }, dir);
    writeFileSync(join(dir, 'index.json'), JSON.stringify([{ id: 'demo', name: { fr: 'Démo' }, summary: {}, image: 'demo/images/web/x-640.webp' }]));
    // Sans couverture dans son dossier, la carte garde son image.
    expect(syncShowcase(dir)).toBe(false);
    writeFileSync(join(dir, 'demo', 'couverture.webp'), 'image');
    expect(syncShowcase(dir)).toBe(true);
    expect(entry('demo').image).toBe('demo/couverture.webp');
    expect(syncShowcase(dir)).toBe(false);
    // Sans liste, rien n'est créé.
    rmSync(join(dir, 'index.json'));
    expect(syncShowcase(dir)).toBe(false);
    expect(existsSync(join(dir, 'index.json'))).toBe(false);
  });
});

describe('lumière précalculée, depuis l’éditeur', () => {
  it('un enregistrement de l’éditeur garde la lumière déclarée entre-temps par le calcul', () => {
    saveMuseum('expo', { name: { fr: 'Expo' }, rooms: [] }, dir);
    const file = join(dir, 'expo', 'museum.json');
    // « npm run lumiere » a déclaré la lumière pendant que l'éditeur était ouvert sur l'ancienne version.
    writeFileSync(file, JSON.stringify({ ...JSON.parse(readFileSync(file, 'utf8')), lumiere: 'lumiere/lumiere.json' }));
    saveMuseum('expo', { name: { fr: 'Expo modifiée' }, rooms: [] }, dir);
    expect(JSON.parse(readFileSync(file, 'utf8'))).toMatchObject({ name: { fr: 'Expo modifiée' }, lumiere: 'lumiere/lumiere.json' });
  });

  it('lance le calcul, suit son avancement, et n’en lance jamais deux à la fois', async () => {
    saveMuseum('expo', { name: { fr: 'Expo' }, rooms: [] }, dir);
    saveMuseum('autre', { name: { fr: 'Autre' }, rooms: [] }, dir);
    // Le vrai calcul (Blender, plusieurs minutes) est remplacé par une commande qui parle comme lui.
    const talk = (lines: string[], code = 0, delay = 300) => [process.execPath, '-e', `${lines.map((l) => `console.log(${JSON.stringify(l)});`).join('')} setTimeout(() => process.exit(${code}), ${delay});`];
    const started = startLumiere('expo', { dir, command: talk(['Ouverture du musée « expo »…', 'Salles à calculer : s, t.', 'Salle « t » (2 sur 2) : calcul par Blender…']) });
    expect(started).toMatchObject({ running: true, busy: null });
    expect(() => startLumiere('autre', { dir, command: talk([]) })).toThrow(/déjà en cours/);
    expect(lumiereStatus('autre').busy).toBe('expo');
    await vi.waitFor(() => expect(lumiereStatus('expo').running).toBe(false), { timeout: 10_000 });
    expect(lumiereStatus('expo')).toMatchObject({ ok: true, progress: { room: 't', index: 2, total: 2 }, step: 'Salle « t » (2 sur 2) : calcul par Blender…' });

    // Un échec garde ce qu'a dit la commande, pour comprendre.
    startLumiere('autre', { dir, command: talk(['✗ Salle inconnue'], 1, 10) });
    await vi.waitFor(() => expect(lumiereStatus('autre').running).toBe(false), { timeout: 10_000 });
    expect(lumiereStatus('autre')).toMatchObject({ ok: false, step: '✗ Salle inconnue' });
    expect(lumiereStatus('autre').lines.at(-1)).toMatch(/arrêté/);
    expect(() => startLumiere('absent', { dir, command: talk([]) })).toThrow(/introuvable/);
  });

  it('sans Blender, dit comment l’installer', () => {
    saveMuseum('expo', { name: { fr: 'Expo' }, rooms: [] }, dir);
    vi.stubEnv('LUMIERE_PYTHON', join(dir, 'pas-de-blender'));
    try {
      expect(lumiereStatus('expo').installed).toBe(false);
      expect(() => startLumiere('expo', { dir })).toThrow(/npm run lumiere:installer/);
    } finally {
      vi.unstubAllEnvs();
    }
  });
});

describe('rétablir la démonstration', () => {
  it('remet ses fichiers tels qu’ils sont dans le projet, sans toucher aux autres', () => {
    const git = (...args: string[]) => execFileSync('git', ['-c', 'user.name=Essai', '-c', 'user.email=essai@exemple.invalid', ...args], { cwd: dir, stdio: 'pipe' });
    const demo = join(dir, 'public', 'museums', 'demo');
    mkdirSync(demo, { recursive: true });
    writeFileSync(join(demo, 'museum.json'), '{"decor":"pierre-claire"}');
    git('init', '-q');
    git('add', '.');
    git('commit', '-qm', 'démonstration');
    writeFileSync(join(demo, 'museum.json'), '{"decor":"nuit"}');
    mkdirSync(join(dir, 'public', 'museums', 'expo'));
    writeFileSync(join(dir, 'public', 'museums', 'expo', 'museum.json'), '{}');
    expect(restoreDemo(dir)).toEqual({ restored: true });
    expect(readFileSync(join(demo, 'museum.json'), 'utf8')).toBe('{"decor":"pierre-claire"}');
    expect(existsSync(join(dir, 'public', 'museums', 'expo', 'museum.json'))).toBe(true);
    // Hors d'un projet git, le rétablissement est refusé, avec la raison.
    expect(() => restoreDemo(tmpdir())).toThrow(/n’a pas pu être rétabli/);
  });
});

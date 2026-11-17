import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
// @ts-expect-error Module JavaScript sans déclaration de types.
import { cleanImages, isSlug, listMuseums, parseCrop, saveMuseum, storeImage } from '../../scripts/editeur-serveur.mjs';

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

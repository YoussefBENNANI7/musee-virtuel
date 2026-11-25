import { existsSync, mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
// @ts-expect-error Module JavaScript sans déclaration de types.
import { cheminInterdit, retirerDepots } from '../../scripts/protection-depots.mjs';

describe('adresses refusées par le serveur du musée', () => {
  it.each([
    '/museums/120-ans/.git/config',
    '/museums/120-ans/.git/HEAD',
    '/museums/120-ans/.git',
    '/museums/120-ans/.git/',
    '/museums/120-ans/.git/objects/ab/cdef?import',
    // Majuscules : le disque d'un Mac ne fait pas la différence.
    '/museums/120-ans/.GIT/config',
    // Encodée une fois, deux fois, ou avec la barre encodée.
    '/museums/120-ans/%2Egit/config',
    '/museums/120-ans/%252Egit/config',
    '/museums/120-ans/.git%2Fconfig',
    '/museums/120-ans/.git%20/config',
    // Un « % » ailleurs dans l'adresse n'empêche pas de voir le .git.
    '/museums/120-ans/%252Egit/remise%252050%25.txt',
    '/./museums/120-ans/.git/HEAD',
    // Une adresse mal encodée n'est jamais celle d'un fichier du musée.
    '/museums/%E0%A4%A/museum.json',
  ])('%s', (url) => {
    expect(cheminInterdit(url)).toBe(true);
  });
});

describe('adresses servies normalement', () => {
  it.each([
    '/',
    '/?m=120-ans',
    '/editeur.html',
    '/museums/120-ans/museum.json',
    '/museums/120-ans/images/web/tableau-450.webp',
    '/museums/120-ans/images/git.webp',
    '/museums/120-ans/.gitignore',
    '/museums/120-ans/models/digit.glb',
    // Un nom de fichier qui contient « % » : une fois décodé, il ne se décode plus.
    '/museums/120-ans/images/remise%2050%25.webp',
  ])('%s', (url) => {
    expect(cheminInterdit(url)).toBe(false);
  });
});

describe('version publiable', () => {
  let root = '';
  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'protection-'));
  });
  afterEach(() => rmSync(root, { recursive: true, force: true }));

  const write = (path: string, content = '') => {
    mkdirSync(join(path, '..'), { recursive: true });
    writeFileSync(path, content);
  };

  it('perd tous ses dossiers et fichiers .git, et rien d’autre', () => {
    const dist = join(root, 'dist');
    write(join(dist, 'museums', 'a', '.git', 'config'), '[remote "origin"]');
    write(join(dist, 'museums', 'a', 'museum.json'), '{}');
    write(join(dist, 'museums', 'a', '.gitignore'), '.DS_Store');
    // Un dépôt dont les fichiers internes sont rangés ailleurs ne laisse qu'un fichier .git.
    write(join(dist, 'museums', 'b', '.git'), 'gitdir: /Users/porteur/depots/b');
    write(join(dist, 'museums', 'b', 'images', '.GIT', 'HEAD'), 'ref: refs/heads/main');
    write(join(dist, 'index.html'), '<!doctype html>');

    const removed = retirerDepots(dist);

    expect(removed).toHaveLength(3);
    expect(existsSync(join(dist, 'museums', 'a', '.git'))).toBe(false);
    expect(existsSync(join(dist, 'museums', 'b', '.git'))).toBe(false);
    expect(existsSync(join(dist, 'museums', 'b', 'images', '.GIT'))).toBe(false);
    for (const kept of ['museums/a/museum.json', 'museums/a/.gitignore', 'museums/b/images', 'index.html']) {
      expect(existsSync(join(dist, kept)), kept).toBe(true);
    }
  });

  it('ne sort jamais du dossier par un lien symbolique', () => {
    const dist = join(root, 'dist');
    const outside = join(root, 'ailleurs');
    write(join(outside, '.git', 'config'), 'à garder');
    mkdirSync(dist, { recursive: true });
    symlinkSync(outside, join(dist, 'lien'));

    expect(retirerDepots(dist)).toEqual([]);
    expect(existsSync(join(outside, '.git', 'config'))).toBe(true);
  });

  it('accepte un dossier absent', () => {
    expect(retirerDepots(join(root, 'absent'))).toEqual([]);
  });
});

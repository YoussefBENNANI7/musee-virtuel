import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, unlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
// @ts-expect-error Module JavaScript sans déclaration de types.
import { MuseeError, linkedMuseums, relier, synchroniser } from '../../scripts/musee.mjs';

let root = '';
let museums = '';
let remote = '';

/** git, avec l'identité d'une autre copie du dépôt (une conversation dans le cloud, par exemple). */
const git = (cwd: string, ...args: string[]) =>
  execFileSync('git', ['-c', 'user.name=Ailleurs', '-c', 'user.email=ailleurs@essai.invalid', ...args], {
    cwd,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();

function write(path: string, content: string) {
  mkdirSync(join(path, '..'), { recursive: true });
  writeFileSync(path, content);
}
const read = (path: string) => readFileSync(path, 'utf8');
const options = () => ({ museumsDir: museums });
/** Les fichiers enregistrés dans le dépôt GitHub (ici, un dépôt sur le disque). */
const onRemote = (bare = remote) => git(bare, 'ls-tree', '-r', '--name-only', 'main').split('\n').filter(Boolean).sort();
const remoteFile = (path: string) => git(remote, 'show', `main:${path}`);

let copies = 0;
/** Une autre copie du dépôt, qui y envoie ses propres changements. */
function elsewhere() {
  const dir = join(root, `ailleurs-${++copies}`);
  git(root, 'clone', '--quiet', remote, dir);
  return dir;
}
function send(dir: string, message: string) {
  git(dir, 'add', '--all');
  git(dir, 'commit', '--quiet', '--message', message);
  git(dir, 'push', '--quiet', 'origin', 'main');
}

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'musee-'));
  museums = join(root, 'museums');
  remote = join(root, 'musee-essai.git');
  git(root, 'init', '--quiet', '--bare', '--initial-branch', 'main', remote);
  write(join(museums, 'essai', 'museum.json'), '{"id":"essai","titre":"Avant"}\n');
  write(join(museums, 'essai', 'images', 'tableau.webp'), 'image');
  write(join(museums, 'demo', 'museum.json'), '{"id":"demo"}\n');
});
afterEach(() => rmSync(root, { recursive: true, force: true }));

describe('relier un musée à son dépôt', () => {
  it('envoie tout le contenu du musée dans le dépôt vide, sans les fichiers propres au Mac', () => {
    write(join(museums, 'essai', '.DS_Store'), 'réglages du Finder');
    write(join(museums, 'essai', 'images', '._tableau.webp'), 'copie cachée du Mac');

    expect(relier('essai', remote, options())).toEqual({ id: 'essai', action: 'relié' });

    expect(onRemote()).toEqual(['.gitignore', 'images/tableau.webp', 'museum.json']);
    expect(remoteFile('museum.json')).toContain('Avant');
    expect(linkedMuseums(museums)).toEqual(['essai']);
  });

  it('refuse un dépôt qui n’est pas vide, et laisse le dossier exactement comme avant', () => {
    const other = elsewhere();
    write(join(other, 'README.md'), 'Créé sur GitHub');
    send(other, 'README');

    expect(() => relier('essai', remote, options())).toThrow(MuseeError);

    expect(existsSync(join(museums, 'essai', '.git'))).toBe(false);
    expect(existsSync(join(museums, 'essai', '.gitignore'))).toBe(false);
    expect(read(join(museums, 'essai', 'museum.json'))).toContain('Avant');
    expect(onRemote()).toEqual(['README.md']);
  });

  it('refuse une adresse de dépôt qui n’existe pas, sans rien laisser derrière lui', () => {
    expect(() => relier('essai', join(root, 'absent.git'), options())).toThrow(/envoi refusé/);
    expect(existsSync(join(museums, 'essai', '.git'))).toBe(false);
  });

  it('télécharge le musée sur un ordinateur qui ne l’a pas encore', () => {
    relier('essai', remote, options());
    const second = join(root, 'autre-ordinateur');
    mkdirSync(second);

    expect(relier('essai', remote, { museumsDir: second })).toEqual({ id: 'essai', action: 'téléchargé' });

    expect(read(join(second, 'essai', 'museum.json'))).toContain('Avant');
    expect(read(join(second, 'essai', 'images', 'tableau.webp'))).toBe('image');
  });

  it('refuse de télécharger un dépôt qui ne contient pas de musée', () => {
    const other = elsewhere();
    write(join(other, 'notes.txt'), 'pas un musée');
    send(other, 'notes');
    const second = join(root, 'autre-ordinateur');
    mkdirSync(second);

    expect(() => relier('essai', remote, { museumsDir: second })).toThrow(/pas un musée/);
    expect(existsSync(join(second, 'essai'))).toBe(false);
  });

  it('ne relie pas deux fois, et jamais à un autre dépôt', () => {
    relier('essai', remote, options());
    expect(relier('essai', remote, options()).action).toBe('déjà relié');
    expect(() => relier('essai', join(root, 'autre.git'), options())).toThrow(/déjà relié à un autre dépôt/);
  });

  it('refuse le musée de démonstration, un nom invalide, un dossier qui n’est pas un musée', () => {
    expect(() => relier('demo', remote, options())).toThrow(/démonstration/);
    expect(() => relier('../essai', remote, options())).toThrow(/nom de musée invalide/);
    expect(() => relier('essai', 'nulle-part', options())).toThrow(/adresse du dépôt/);
    mkdirSync(join(museums, 'vide'));
    expect(() => relier('vide', remote, options())).toThrow(/pas un musée/);
    expect(linkedMuseums(museums)).toEqual([]);
  });
});

describe('synchroniser un musée relié', () => {
  beforeEach(() => {
    relier('essai', remote, options());
  });

  it('ne fait rien quand tout est déjà à jour', () => {
    expect(synchroniser('essai', options())).toEqual({ id: 'essai', local: false, received: false, sent: false });
  });

  it('envoie les changements faits sur cet ordinateur : modifié, ajouté, supprimé', () => {
    write(join(museums, 'essai', 'museum.json'), '{"id":"essai","titre":"Après"}\n');
    write(join(museums, 'essai', 'audio', 'fr.mp3'), 'voix');
    unlinkSync(join(museums, 'essai', 'images', 'tableau.webp'));

    expect(synchroniser('essai', options())).toMatchObject({ local: true, received: false, sent: true });

    expect(onRemote()).toEqual(['.gitignore', 'audio/fr.mp3', 'museum.json']);
    expect(remoteFile('museum.json')).toContain('Après');
  });

  it('reçoit les changements faits ailleurs', () => {
    const other = elsewhere();
    write(join(other, 'images', 'nouvelle.webp'), 'nouvelle image');
    send(other, 'Une image de plus');

    expect(synchroniser('essai', options())).toMatchObject({ local: false, received: true, sent: false });

    expect(read(join(museums, 'essai', 'images', 'nouvelle.webp'))).toBe('nouvelle image');
  });

  it('réunit des changements faits des deux côtés sur des fichiers différents', () => {
    const other = elsewhere();
    write(join(other, 'images', 'nouvelle.webp'), 'nouvelle image');
    send(other, 'Une image de plus');
    write(join(museums, 'essai', 'museum.json'), '{"id":"essai","titre":"Après"}\n');

    expect(synchroniser('essai', options())).toMatchObject({ local: true, received: true, sent: true });

    expect(onRemote()).toEqual(['.gitignore', 'images/nouvelle.webp', 'images/tableau.webp', 'museum.json']);
    expect(remoteFile('museum.json')).toContain('Après');
    expect(read(join(museums, 'essai', 'images', 'nouvelle.webp'))).toBe('nouvelle image');
  });

  it('s’arrête sans rien écraser quand le même fichier a changé des deux côtés', () => {
    const other = elsewhere();
    write(join(other, 'museum.json'), '{"id":"essai","titre":"Ailleurs"}\n');
    send(other, 'Titre changé ailleurs');
    write(join(museums, 'essai', 'museum.json'), '{"id":"essai","titre":"Ici"}\n');

    expect(() => synchroniser('essai', options())).toThrow(/Rien n’est perdu/);

    // Ici, la version de cet ordinateur, enregistrée ; là-bas, celle d'ailleurs, intacte.
    expect(read(join(museums, 'essai', 'museum.json'))).toContain('Ici');
    expect(git(join(museums, 'essai'), 'status', '--porcelain')).toBe('');
    expect(existsSync(join(museums, 'essai', '.git', 'MERGE_HEAD'))).toBe(false);
    expect(remoteFile('museum.json')).toContain('Ailleurs');
  });

  it('refuse un musée qui n’est pas relié', () => {
    write(join(museums, 'autre', 'museum.json'), '{"id":"autre"}\n');
    expect(() => synchroniser('autre', options())).toThrow(/pas encore relié/);
    expect(() => synchroniser('absent', options())).toThrow(/aucun musée/);
    expect(() => synchroniser('demo', options())).toThrow(/démonstration/);
  });
});

import { describe, expect, it } from 'vitest';
import { HANGING, distribute, framedWidth, hangingHeight, wallSpans } from '../../src/engine/accrochage';
import { resolveDecor } from '../../src/engine/decors';
import { buildLayout } from '../../src/engine/layout';
import { PLANS } from '../../src/engine/plans';
import { resolveStyle } from '../../src/engine/styles';
import type { MuseumConfig, PaintingConfig } from '../../src/engine/types';
import { validateMuseum } from '../../src/engine/validate';
import { createMuseum, hangIn, newPainting, rehang, removeWork, shift, slugify, titleFromFile, toReserve, unique } from '../../src/editeur/modele';

const errorsOf = (museum: MuseumConfig) => validateMuseum(museum, resolveStyle(museum)).filter((i) => i.level === 'error').map((i) => `${i.where} : ${i.message}`);
const warningsOf = (museum: MuseumConfig) => validateMuseum(museum, resolveStyle(museum)).filter((i) => i.level === 'warning').map((i) => `${i.where} : ${i.message}`);
const layoutOf = (museum: MuseumConfig) => {
  const style = resolveStyle(museum);
  return buildLayout(museum, { wallThickness: style.wallThickness, doorHeight: style.doorHeight });
};
/** Ajoute au musée une œuvre de la taille voulue, comme le ferait le dépôt d'une photo. */
function add(museum: MuseumConfig, name: string, width = 1, height = 0.7): PaintingConfig {
  const art = newPainting(museum, `${name}.jpg`, { src: `images/${name}.jpg`, width: Math.round(width * 1000), height: Math.round(height * 1000) });
  art.width = width;
  art.height = height;
  return art;
}

describe('plans tout faits', () => {
  it.each(PLANS.map((p) => [p.id, p] as const))('le plan « %s » donne un musée valide, où toutes les salles sont accessibles', (id, plan) => {
    const museum = createMuseum('Essai', id);
    expect(errorsOf(museum)).toEqual([]);
    expect(museum.rooms.length).toBe(plan.build().rooms.length);
    expect(layoutOf(museum).reachable(museum.start.room).size).toBe(museum.rooms.length);
    expect(museum.rooms.every((r) => r.autoHang && r.artworks.length === 0)).toBe(true);
  });

  it('un musée se crée avec un identifiant lisible et unique', () => {
    expect(createMuseum('Musée de l’Été à Fès', 'une-salle').id).toBe('musee-de-l-ete-a-fes');
    expect(createMuseum('Démo', 'une-salle', ['demo', 'demo-2']).id).toBe('demo-3');
    expect(createMuseum('   ', 'une-salle').name.fr).toBe('Mon musée');
  });
});

describe('identifiants et titres', () => {
  it('fabrique des identifiants sans accents ni signes', () => {
    expect(slugify('La Nuit étoilée (détail) n° 2')).toBe('la-nuit-etoilee-detail-n-2');
    expect(slugify('***')).toBe('sans-nom');
    expect(unique('vase', ['vase', 'vase-2'])).toBe('vase-3');
  });

  it('propose un titre à partir du nom du fichier, sauf pour un nom d’appareil photo', () => {
    expect(titleFromFile('portrait_de_femme.jpg')).toBe('Portrait de femme');
    expect(titleFromFile('IMG_4521.HEIC')).toBe('Sans titre');
    expect(titleFromFile('20261117_101502.jpg')).toBe('Sans titre');
    expect(titleFromFile('DSC00231.png')).toBe('Sans titre');
  });
});

describe('accrochage automatique', () => {
  it('découpe un mur autour de sa porte, à distance des angles', () => {
    const museum = createMuseum('Essai', 'enfilade');
    const layout = layoutOf(museum);
    const [first] = museum.rooms;
    // Mur nord de 9 m, sans porte : toute la longueur visible, moins les deux angles.
    const north = wallSpans(first, 'north', layout);
    expect(north).toHaveLength(1);
    expect(north[0].to - north[0].from).toBeCloseTo(9 - 0.4 - 2 * HANGING.corner, 5);
    // Mur est de 8 m, percé d'une porte de 2,20 m en son milieu : deux portions égales.
    const east = wallSpans(first, 'east', layout);
    expect(east).toHaveLength(2);
    expect(east[0].to).toBeCloseTo(-1.1 - HANGING.door, 5);
    expect(east[1].from).toBeCloseTo(1.1 + HANGING.door, 5);
  });

  it('répartit les œuvres à intervalles égaux, bords compris', () => {
    expect(distribute([1], [{ from: -3, to: 3 }])).toEqual([0]);
    expect(distribute([1, 1], [{ from: -3, to: 3 }])).toEqual([-1.167, 1.167]);
    // Trois œuvres de 1 m sur 7 m : quatre intervalles de 1 m.
    expect(distribute([1, 1, 1], [{ from: 0, to: 7 }])).toEqual([1.5, 3.5, 5.5]);
  });

  it('équilibre les deux côtés d’une porte, et signale ce qui ne tient pas', () => {
    const spans = [{ from: -4, to: -1 }, { from: 1, to: 4 }];
    const four = distribute([1, 1, 1, 1], spans) as number[];
    expect(four.filter((o) => o < 0)).toHaveLength(2);
    expect(four.filter((o) => o > 0)).toHaveLength(2);
    // Deux œuvres de 2,5 m : une de chaque côté. Une troisième ne tient nulle part.
    expect(distribute([2.5, 2.5], spans)).toEqual([-2.5, 2.5]);
    expect(distribute([2.5, 2.5, 2.5], spans)).toEqual([-2.5, 2.5, null]);
    // Jamais deux œuvres à moins de la distance minimale l'une de l'autre.
    const tight = distribute([1.2, 1.2, 1.2, 1.2], [{ from: 0, to: 5.8 }]) as number[];
    for (let i = 1; i < tight.length; i++) expect(tight[i] - tight[i - 1] - 1.2).toBeGreaterThanOrEqual(HANGING.minGap - 1e-6);
  });

  it('descend une œuvre trop haute, et refuse celle qui ne tient pas sous le plafond', () => {
    const museum = createMuseum('Essai', 'une-salle');
    const [room] = museum.rooms;
    const decor = resolveDecor(resolveStyle(museum), room);
    expect(hangingHeight(add(museum, 'petit', 1, 0.7), room, decor)).toBeUndefined();
    // Plafond à 4,40 m : une œuvre de 3,80 m doit descendre, une de 4,30 m ne tient pas.
    const tall = hangingHeight(add(museum, 'grand', 2, 3.8), room, decor);
    expect(tall).toBeGreaterThan(1.9);
    expect(tall).toBeLessThan(2.3);
    expect(hangingHeight(add(museum, 'geant', 2, 4.3), room, decor)).toBeNull();
  });

  it('un musée rempli par dépôt de photos reste valide, sans recouvrement ni œuvre en travers d’une porte', () => {
    for (const plan of PLANS) {
      const museum = createMuseum('Essai', plan.id);
      let hung = 0;
      for (let i = 0; i < 60; i++) {
        const art = add(museum, `oeuvre-${i}`, 0.6 + (i % 5) * 0.35, 0.5 + (i % 3) * 0.3);
        const room = museum.rooms[i % museum.rooms.length];
        if (hangIn(museum, room, art)) hung++;
        else toReserve(museum, art);
      }
      expect(errorsOf(museum), plan.id).toEqual([]);
      expect(warningsOf(museum).filter((w) => /recouvre/.test(w)), plan.id).toEqual([]);
      // Les salles finissent par être pleines : le reste attend en réserve, rien n'est perdu.
      expect(hung).toBeGreaterThan(8);
      expect(hung + museum.reserve!.length).toBe(60);
      expect(new Set([...museum.rooms.flatMap((r) => r.artworks), ...museum.reserve!].map((a) => a.id)).size).toBe(60);
    }
  });

  it('choisit le mur le plus libre, et laisse la personne en changer', () => {
    const museum = createMuseum('Essai', 'une-salle');
    const [room] = museum.rooms;
    const a = add(museum, 'a');
    const b = add(museum, 'b');
    expect(hangIn(museum, room, a)).toBe(true);
    expect(hangIn(museum, room, b)).toBe(true);
    // Deux murs de 12 m : la seconde œuvre va sur l'autre, encore vide.
    expect(new Set([a.wall, b.wall])).toEqual(new Set(['north', 'south']));
    expect(a.offset).toBe(0);

    expect(hangIn(museum, room, b, a.wall)).toBe(true);
    expect(b.wall).toBe(a.wall);
    expect(a.offset).toBeLessThan(0);
    expect(b.offset).toBeGreaterThan(0);
    // L'ordre sur le mur se change d'un cran.
    shift(room, b, -1);
    rehang(museum);
    expect(b.offset).toBeLessThan(a.offset);
  });

  it('refuse un mur plein sans rien déplacer, et garde en réserve ce qui ne tient plus', () => {
    const museum = createMuseum('Essai', 'une-salle');
    const [room] = museum.rooms;
    // Le mur est fait 9 m, percé de rien : environ 7,70 m utiles.
    const works = [add(museum, 'a', 3), add(museum, 'b', 3)];
    for (const art of works) expect(hangIn(museum, room, art, 'east')).toBe(true);
    const c = add(museum, 'c', 3);
    toReserve(museum, c);
    expect(hangIn(museum, room, c, 'east')).toBe(false);
    expect(museum.reserve).toContain(c);
    expect(room.artworks).toHaveLength(2);

    // Une œuvre qui grandit après coup chasse sa voisine vers la réserve, au lieu de la recouvrir.
    works[0].width = 6;
    expect(rehang(museum).map((a) => a.id)).toEqual(['b']);
    expect(museum.reserve!.map((a) => a.id).sort()).toEqual(['b', 'c']);
    expect(errorsOf(museum)).toEqual([]);
  });

  it('supprimer une œuvre la retire aussi des parcours', () => {
    const museum = createMuseum('Essai', 'une-salle');
    const a = add(museum, 'a');
    hangIn(museum, museum.rooms[0], a);
    museum.tours = [{ id: 't', name: { fr: 'Parcours' }, description: { fr: '' }, stops: [a.id, 'autre'] }];
    removeWork(museum, a);
    expect(museum.rooms[0].artworks).toEqual([]);
    expect(museum.tours[0].stops).toEqual(['autre']);
  });

  it('tient compte du cadre dans la largeur occupée', () => {
    const museum = createMuseum('Essai', 'une-salle');
    const decor = resolveDecor(resolveStyle(museum), museum.rooms[0]);
    const art = add(museum, 'a', 1);
    const plain = framedWidth(art, decor);
    expect(plain).toBeGreaterThan(1);
    expect(framedWidth({ ...art, frame: 'gilt' }, decor)).toBeGreaterThan(plain);
    expect(framedWidth({ ...art, frameless: true }, decor)).toBe(1);
  });
});

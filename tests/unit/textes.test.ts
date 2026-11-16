import { existsSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { closestView } from '../../src/engine/artworks';
import { horseshoe } from '../../src/engine/building';
import { modelUrl } from '../../src/engine/sculptures';
import { loc, tr } from '../../src/engine/types';
import { demo } from './helpers';

describe('textes dans plusieurs langues', () => {
  it('un texte écrit une seule fois vaut pour toutes les langues', () => {
    expect(loc('Rembrandt', 'fr')).toBe('Rembrandt');
    expect(loc('Rembrandt', 'en')).toBe('Rembrandt');
  });

  it('un texte écrit par langue se lit dans la langue demandée, sinon dans la première', () => {
    const date = { fr: 'vers 1830–1832', en: 'c. 1830–32' };
    expect(loc(date, 'en')).toBe('c. 1830–32');
    expect(loc(date, 'ar')).toBe('vers 1830–1832');
    expect(tr({}, 'fr')).toBe('');
  });
});

describe('distance de regard', () => {
  it('reste à 1,20 m pour un tableau, et se raccourcit pour une petite estampe', () => {
    expect(closestView(1.6)).toBe(1.2);
    expect(closestView(0.8)).toBe(1.2);
    expect(closestView(0.38)).toBeCloseTo(0.61, 2);
    expect(closestView(0.1)).toBe(0.55);
  });
});

describe('arc outrepassé', () => {
  it('tient dans l’ouverture, se referme sous son centre et laisse passer un visiteur', () => {
    for (const [width, height] of [[2.2, 3.3], [1.6, 2.4], [3, 2.6]]) {
      const arc = horseshoe(width, height);
      expect(arc.centerY + arc.radius).toBeLessThanOrEqual(height);
      expect(arc.radius).toBeLessThanOrEqual(width / 2);
      // Le passage entre les piédroits est plus étroit que le cercle : c'est le fer à cheval.
      expect(arc.halfClear).toBeLessThan(arc.radius);
      expect(arc.springY).toBeLessThan(arc.centerY);
      expect(arc.springY).toBeGreaterThan(0.4);
      expect(arc.halfClear * 2).toBeGreaterThan(0.9);
    }
  });
});

describe('fichier d’un modèle 3D', () => {
  const base = 'https://exemple.org/museums/demo/';

  it('sert l’original tant que les versions allégées n’ont pas été préparées', () => {
    expect(modelUrl({ src: 'models/venus.glb' }, base, true)).toBe(`${base}models/venus.glb`);
  });

  it('sert la version complète, ou la version légère sur un appareil modeste', () => {
    const model = { src: 'models/venus.glb', web: true };
    expect(modelUrl(model, base, false)).toBe(`${base}models/web/venus.glb`);
    expect(modelUrl(model, base, true)).toBe(`${base}models/web/venus-leger.glb`);
  });
});

describe('œuvres du musée de démonstration', () => {
  const works = demo().rooms.flatMap((room) => room.artworks);
  const paintings = works.filter((a) => a.type === 'painting');

  it('chaque tableau cite le musée qui le conserve et renvoie à sa notice', () => {
    expect(paintings).toHaveLength(42);
    for (const a of paintings) {
      expect(a.credit?.fr, a.id).toMatch(/domaine public/);
      expect(a.credit?.en, a.id).toMatch(/public domain/);
      expect(a.link, a.id).toMatch(/^https:\/\/(www\.metmuseum\.org|www\.artic\.edu|clevelandart\.org)\//);
    }
  });

  it('toutes les sculptures sont de vrais modèles numérisés, avec leur musée et leurs versions allégées', () => {
    const sculptures = works.filter((a) => a.type === 'sculpture');
    expect(sculptures.map((a) => a.id).sort()).toEqual(['bouddha-cosmique', 'danseuse', 'defense-sculptee', 'l-esclave-grecque', 'vase-fangyi']);
    for (const a of sculptures) {
      // Plus aucune sculpture dessinée par le code dans la démo.
      expect(a.type === 'sculpture' && a.model, a.id).toEqual({ src: `models/${a.id}.glb`, web: true });
      for (const file of [`models/${a.id}.glb`, `models/web/${a.id}.glb`, `models/web/${a.id}-leger.glb`, `thumbs/${a.id}.jpg`]) {
        expect(existsSync(new URL(`../../public/museums/demo/${file}`, import.meta.url)), file).toBe(true);
      }
      expect(a.credit?.fr, a.id).toMatch(/Smithsonian/);
      expect(a.credit?.fr, a.id).toMatch(/domaine public|conditions d’utilisation/);
      expect(a.link, a.id).toMatch(/^https:\/\//);
    }
  });

  it('les peintures anciennes ont un cadre doré, les abstraites du XXe siècle non', () => {
    const framed = paintings.filter((a) => a.type === 'painting' && a.frame === 'gilt').map((a) => a.id);
    expect(framed).toHaveLength(20);
    expect(framed).toContain('les-moissonneurs');
    expect(framed).not.toContain('improvisation-no-30');
    expect(framed).not.toContain('composition-rouge-jaune-bleu');
    expect(framed).not.toContain('la-grande-vague');
  });

  it('les œuvres sur papier sont sous passe-partout, les peintures non', () => {
    for (const a of paintings) {
      if (a.type !== 'painting') continue;
      if (/Estampe|Gravure|Eau-forte|Photographie|Dessin|Aquarelle|parchemin|papier/.test(a.medium.fr)) expect(a.mat, a.id).toBeGreaterThan(0);
      if (/^Huile/.test(a.medium.fr)) expect(a.mat, a.id).toBeUndefined();
    }
  });

  it('chaque œuvre est à sa taille réelle : aucune ne dépasse 3,20 m, les œuvres sous passe-partout font moins de 60 cm', () => {
    for (const a of paintings) {
      // Portes, tapis et tentures, accrochés sans cadre, peuvent être bien plus grands.
      if (a.type !== 'painting' || a.frameless) continue;
      expect(Math.max(a.width, a.height), a.id).toBeLessThanOrEqual(3.2);
      if (a.mat) expect(Math.max(a.width, a.height), a.id).toBeLessThan(0.6);
    }
  });
});

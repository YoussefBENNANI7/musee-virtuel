import { describe, expect, it } from 'vitest';
import { imageSrcset, imageUrl } from '../../src/engine/images';

const BASE = 'https://exemple.fr/museums/demo/';
const image = { src: 'images/portee.webp', width: 1867, height: 2800, variants: [640, 1024, 1600] };

describe('choix de la version d’une image', () => {
  it('sert l’original quand aucune version allégée n’a été préparée', () => {
    expect(imageUrl({ src: 'images/portee.webp' }, BASE, 1024)).toBe('https://exemple.fr/museums/demo/images/portee.webp');
  });

  it('prend la plus petite version qui suffit à la taille demandée', () => {
    expect(imageUrl(image, BASE, 640)).toBe('https://exemple.fr/museums/demo/images/web/portee-640.webp');
    expect(imageUrl(image, BASE, 700)).toBe('https://exemple.fr/museums/demo/images/web/portee-1024.webp');
    expect(imageUrl(image, BASE, 1600)).toBe('https://exemple.fr/museums/demo/images/web/portee-1600.webp');
  });

  it('se contente de la plus grande version quand aucune n’est assez grande', () => {
    expect(imageUrl(image, BASE, 4000)).toBe('https://exemple.fr/museums/demo/images/web/portee-1600.webp');
  });

  it('retrouve le dossier des versions allégées quel que soit l’emplacement de l’original', () => {
    expect(imageUrl({ src: 'salle-2/vue.d-ensemble.JPG', variants: [640] }, BASE, 100)).toBe(
      'https://exemple.fr/museums/demo/salle-2/web/vue.d-ensemble-640.webp',
    );
    expect(imageUrl({ src: 'portee.png', variants: [640] }, BASE, 100)).toBe('https://exemple.fr/museums/demo/web/portee-640.webp');
  });

  it('ne dépend pas de l’ordre dans lequel les versions sont déclarées', () => {
    expect(imageUrl({ ...image, variants: [1600, 640, 1024] }, BASE, 800)).toContain('portee-1024.webp');
  });
});

describe('liste des versions proposées au navigateur', () => {
  it('annonce la largeur réelle de chaque version, pour un tableau en hauteur comme en largeur', () => {
    // Tableau en hauteur : le grand côté est la hauteur, la largeur est donc plus petite.
    expect(imageSrcset(image, BASE)).toBe(
      [
        'https://exemple.fr/museums/demo/images/web/portee-640.webp 427w',
        'https://exemple.fr/museums/demo/images/web/portee-1024.webp 683w',
        'https://exemple.fr/museums/demo/images/web/portee-1600.webp 1067w',
      ].join(', '),
    );
    const wide = { src: 'images/dunes.webp', width: 2880, height: 1920, variants: [640, 1024] };
    expect(imageSrcset(wide, BASE)).toBe(
      'https://exemple.fr/museums/demo/images/web/dunes-640.webp 640w, https://exemple.fr/museums/demo/images/web/dunes-1024.webp 1024w',
    );
  });

  it('s’abstient quand les dimensions ou les versions manquent', () => {
    expect(imageSrcset({ src: 'images/portee.webp' }, BASE)).toBeNull();
    expect(imageSrcset({ src: 'images/portee.webp', variants: [640] }, BASE)).toBeNull();
  });
});

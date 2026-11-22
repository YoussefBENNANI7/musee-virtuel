import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { resolveDecor } from '../../src/engine/decors';
import { LETTERING, bendLettering, letteringColor, lineHeight, wrapLines } from '../../src/engine/lettrage';
import { classic } from './helpers';

describe('lettrage mural', () => {
  /** Une largeur de texte factice : dix unités par caractère. */
  const measure = (part: string) => part.length * 10;

  it('coupe un paragraphe en lignes qui tiennent dans la largeur, sans couper un mot', () => {
    expect(wrapLines('Avant les ordinateurs, la banque comptait à la main', 220, measure)).toEqual(['Avant les ordinateurs,', 'la banque comptait à', 'la main']);
    // Un mot plus long que la ligne reste entier, sur sa propre ligne.
    expect(wrapLines('un anticonstitutionnellement long', 100, measure)).toEqual(['un', 'anticonstitutionnellement', 'long']);
  });

  it('respecte les retours à la ligne du texte', () => {
    expect(wrapLines('Compter\nVérifier', 500, measure)).toEqual(['Compter', 'Vérifier']);
  });

  it('un titre est plus grand qu’un texte, sauf hauteur demandée', () => {
    expect(lineHeight({})).toBe(LETTERING.title.height);
    expect(lineHeight({ kind: 'text' })).toBe(LETTERING.text.height);
    expect(lineHeight({ kind: 'text', height: 0.08 })).toBe(0.08);
    expect(LETTERING.title.height).toBeGreaterThan(LETTERING.text.height * 2);
  });

  it('les lettres sont sombres sur un mur clair, claires sur un mur sombre, ou de la couleur demandée', () => {
    const clair = resolveDecor(classic, { decor: 'pierre-claire' });
    const sombre = resolveDecor(classic, { decor: 'nuit' });
    expect(letteringColor({}, clair)).toBe('#2b221b');
    expect(letteringColor({}, sombre)).toBe('#efe3c8');
    expect(letteringColor({ color: '#b9944a' }, sombre)).toBe('#b9944a');
  });

  it('sur un mur courbe, le lettrage épouse le mur : ses bouts suivent l’arc, sans s’y enfoncer', () => {
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1));
    mesh.scale.set(2.4, 0.3, 1);
    bendLettering(mesh, 2.4, 0.3, 7);
    expect(mesh.scale.toArray()).toEqual([1, 1, 1]);
    const position = mesh.geometry.attributes.position;
    let left = 0;
    for (let i = 0; i < position.count; i++) {
      const [x, z] = [position.getX(i), position.getZ(i)];
      // Chaque point est sur le cercle de rayon 7 dont le centre est à 7 m devant le mur.
      expect(Math.hypot(x, 7 - z)).toBeCloseTo(7, 6);
      left = Math.min(left, x);
    }
    // La longueur de l'arc est celle du texte : le bout gauche est à 1,2 m le long du mur.
    expect(Math.asin(-left / 7) * 7).toBeCloseTo(1.2, 6);
  });
});

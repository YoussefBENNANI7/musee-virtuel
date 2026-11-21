import { describe, expect, it } from 'vitest';
import { resolveDecor } from '../../src/engine/decors';
import { LETTERING, letteringColor, lineHeight, wrapLines } from '../../src/engine/lettrage';
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
});

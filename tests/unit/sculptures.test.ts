import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { lightModel } from '../../src/engine/sculptures';

describe('modèle 3D mis à la lumière de sa salle', () => {
  it('n’assombrit qu’une fois une matière partagée par plusieurs pièces', () => {
    const paper = new THREE.MeshStandardMaterial({ color: new THREE.Color(0.8, 0.8, 0.8) });
    const cover = new THREE.MeshStandardMaterial({ color: new THREE.Color(0.4, 0.4, 0.4) });
    const scene = new THREE.Group();
    // Vingt feuilles de papier, une couverture, et une pièce faite des deux matières.
    for (let i = 0; i < 20; i++) scene.add(new THREE.Mesh(new THREE.BoxGeometry(), paper));
    scene.add(new THREE.Mesh(new THREE.BoxGeometry(), cover), new THREE.Mesh(new THREE.BoxGeometry(), [paper, cover]));
    lightModel(scene, null, 0.5);
    expect(paper.color.r).toBeCloseTo(0.4, 6);
    expect(cover.color.r).toBeCloseTo(0.2, 6);
    expect(paper.envMapIntensity).toBe(0.5);
  });
});

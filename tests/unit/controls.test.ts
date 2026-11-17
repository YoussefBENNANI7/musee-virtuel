import { PerspectiveCamera } from 'three';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Controls } from '../../src/engine/controls';
import type { Walkable } from '../../src/engine/marche';
import { fixture, layoutOf } from './helpers';

/**
 * Déplacement au clavier, image par image, sans navigateur.
 * Plan du musée de test : voir layout.test.ts. Dans le hall, le visiteur peut se tenir
 * entre x = -5,40 et x = 5,40, et entre z = -3,90 et z = 3,90 (murs de 0,30 m).
 */
const WEST_LIMIT = -5.4;
const SOUTH_LIMIT = 3.9;
/** Regard vers l'ouest, puis vers le sud-ouest (en biais vers le mur ouest). */
const WEST = Math.PI / 2;
const SOUTH_WEST = (3 * Math.PI) / 4;
/** Durées d'une image : appareil très lent (le plus long que la visite accorde à une image), 60 images par seconde, et très rapide. */
const SLOW = 0.1;
const SMOOTH = 1 / 60;
const TINY = 0.001;

/** Un visiteur dans un faux navigateur : juste de quoi créer les contrôles et enfoncer des touches. */
function visitor(walkable: Walkable, x: number, z: number, yaw: number) {
  const listeners = new Map<string, (event: unknown) => void>();
  vi.stubGlobal('window', { addEventListener: (type: string, listener: (event: unknown) => void) => listeners.set(type, listener) });
  const element = { addEventListener() {}, firstElementChild: {} } as unknown as HTMLElement;
  const camera = new PerspectiveCamera();
  const controls = new Controls(camera, element, element);
  controls.walkable = walkable;
  controls.teleport(x, z, yaw);
  const at = () => ({ x: camera.position.x, z: camera.position.z });
  return {
    controls,
    at,
    press: (code: string) => listeners.get('keydown')!({ code, target: { closest: () => null }, preventDefault() {} }),
    release: (code: string) => listeners.get('keyup')!({ code }),
    /** Fait passer des images de `dt` secondes pendant la durée voulue, et renvoie la position après chacune. */
    run(dt: number, seconds: number) {
      const trace: { x: number; z: number }[] = [];
      for (let i = Math.round(seconds / dt); i > 0; i--) {
        controls.update(dt);
        trace.push(at());
      }
      return trace;
    },
  };
}

afterEach(() => vi.unstubAllGlobals());

const hall = () => layoutOf(fixture()).walkable;
/** Une grande salle vide avec un socle rond en son centre, que le visiteur contourne à 0,80 m. */
const RADIUS = 0.8;
const pedestal: Walkable = (x, z) => Math.abs(x) <= 6 && Math.abs(z) <= 6 && Math.hypot(x, z) >= RADIUS;

describe('marche vers un mur', () => {
  it('avance à 2,40 m par seconde tant que rien ne gêne', () => {
    for (const dt of [SLOW, SMOOTH, TINY]) {
      const v = visitor(hall(), 0, 3, WEST);
      v.press('KeyW');
      v.run(dt, 1);
      expect(v.at().x, `images de ${dt} s`).toBeCloseTo(-2.4, 6);
      expect(v.at().z, `images de ${dt} s`).toBeCloseTo(3, 6);
    }
  });

  it('s’arrête au ras du mur, à grands pas comme à petits pas', () => {
    const stops = [SLOW, SMOOTH, TINY].map((dt) => {
      const v = visitor(hall(), -4, 3, WEST);
      v.press('KeyW');
      v.run(dt, 3);
      return v.at();
    });
    for (const stop of stops) {
      // À moins d'un centimètre de la limite, et jamais au-delà.
      expect(stop.x).toBeGreaterThanOrEqual(WEST_LIMIT);
      expect(stop.x).toBeLessThan(WEST_LIMIT + 0.01);
      expect(stop.z).toBeCloseTo(3, 6);
    }
  });

  it('atteint le mur dans l’image même où le pas entier ne passe plus', () => {
    // À 1,40 m du mur, par pas de 24 cm : cinq pas entiers, puis un sixième de 20 cm seulement.
    const v = visitor(hall(), -4, 3, WEST);
    v.press('KeyW');
    const trace = v.run(SLOW, 1);
    expect(trace[4].x).toBeCloseTo(-5.2, 6);
    expect(trace[5].x).toBeGreaterThanOrEqual(WEST_LIMIT);
    expect(trace[5].x).toBeLessThan(WEST_LIMIT + 0.01);
  });

  it('une fois contre le mur, ne s’en approche plus par à-coups', () => {
    const v = visitor(hall(), -4, 3, WEST);
    v.press('KeyW');
    v.run(SLOW, 1);
    const stopped = v.at();
    // Des images de toutes durées se succèdent : le visiteur ne bouge plus du tout.
    for (const dt of [TINY, SMOOTH, 0.03, SLOW, 0.004, TINY]) {
      v.run(dt, 0.5);
      expect(v.at(), `images de ${dt} s`).toEqual(stopped);
    }
  });

  it('repart dès que le visiteur recule', () => {
    const v = visitor(hall(), -4, 3, WEST);
    v.press('KeyW');
    v.run(SLOW, 1);
    v.release('KeyW');
    v.press('KeyS');
    v.run(SLOW, 0.5);
    expect(v.at().x).toBeCloseTo(WEST_LIMIT + 1.2, 4);
  });
});

describe('glissement le long d’un mur', () => {
  it('garde l’allure le long du mur, à grands pas comme à petits pas', () => {
    const ends = [SLOW, SMOOTH, TINY].map((dt) => {
      // En biais vers le mur ouest : le visiteur le touche après 1,40 m, puis le longe vers le sud.
      const v = visitor(hall(), -4, 1, SOUTH_WEST);
      v.press('KeyW');
      v.run(dt, 1);
      return v.at();
    });
    const along = 2.4 * Math.SQRT1_2;
    for (const end of ends) {
      expect(end.x).toBeGreaterThanOrEqual(WEST_LIMIT);
      expect(end.x).toBeLessThan(WEST_LIMIT + 0.01);
      // Le long du mur, il a parcouru en une seconde ce que donne sa vitesse dans cette direction.
      expect(end.z).toBeCloseTo(1 + along, 4);
    }
  });

  it('s’arrête dans l’angle de la salle', () => {
    for (const dt of [SLOW, SMOOTH, TINY]) {
      const v = visitor(hall(), -4, 1, SOUTH_WEST);
      v.press('KeyW');
      v.run(dt, 4);
      expect(v.at().x, `images de ${dt} s`).toBeCloseTo(WEST_LIMIT, 4);
      expect(v.at().z, `images de ${dt} s`).toBeCloseTo(SOUTH_LIMIT, 4);
    }
  });

  it('ne sort jamais de la zone de marche, et ne traverse une porte que par son passage', () => {
    const walkable = hall();
    for (const dt of [SLOW, SMOOTH, TINY]) {
      // En biais vers le mur nord, à gauche de la porte (passage entre x = 2,70 et x = 4,30) :
      // le visiteur longe le mur vers l'est, puis entre dans le cabinet par la porte.
      const v = visitor(walkable, 0, -2, -Math.PI / 4);
      v.press('KeyW');
      const trace = v.run(dt, 4);
      for (const p of trace) {
        expect(walkable(p.x, p.z), `images de ${dt} s, en (${p.x.toFixed(3)} ; ${p.z.toFixed(3)})`).toBe(true);
        // Dans l'épaisseur du mur (entre z = -3,90 et z = -5,10), il est forcément dans le passage.
        if (p.z < -3.9 - 1e-9 && p.z > -5.1 + 1e-9) {
          expect(p.x).toBeGreaterThanOrEqual(2.7);
          expect(p.x).toBeLessThanOrEqual(4.3);
        }
      }
      expect(v.at().z, `images de ${dt} s`).toBeLessThan(-5.1);
    }
  });
});

describe('obstacle rond', () => {
  it('arrête le visiteur au ras du socle, à grands pas comme à petits pas', () => {
    for (const dt of [SLOW, SMOOTH, TINY]) {
      const v = visitor(pedestal, 3, 0, WEST);
      v.press('KeyW');
      v.run(dt, 2);
      const gap = Math.hypot(v.at().x, v.at().z) - RADIUS;
      expect(gap, `images de ${dt} s`).toBeGreaterThanOrEqual(0);
      expect(gap, `images de ${dt} s`).toBeLessThan(0.01);
    }
  });

  it('se laisse contourner : le visiteur glisse autour sans jamais y entrer', () => {
    const ends = [SLOW, SMOOTH, TINY].map((dt) => {
      // Vers l'ouest et un peu vers le sud, sur une ligne qui passe à 60 cm du centre du socle :
      // le visiteur le touche de biais, puis le contourne par le sud.
      const v = visitor(pedestal, 3, -0.3, WEST + 0.3);
      v.press('KeyW');
      const trace = v.run(dt, 2.5);
      for (const p of trace) expect(Math.hypot(p.x, p.z), `images de ${dt} s`).toBeGreaterThanOrEqual(RADIUS);
      return v.at();
    });
    // Le socle est dépassé, et le visiteur arrive au même endroit quelle que soit la durée des images.
    for (const end of ends) {
      expect(end.x).toBeLessThan(-RADIUS);
      expect(Math.hypot(end.x - ends[0].x, end.z - ends[0].z)).toBeLessThan(0.01);
    }
  });
});

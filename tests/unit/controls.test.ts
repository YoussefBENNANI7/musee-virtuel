import { PerspectiveCamera, Vector3 } from 'three';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Controls } from '../../src/engine/controls';
import { PRECISION, type Walkable } from '../../src/engine/marche';
import { fixture, layoutOf } from './helpers';

/**
 * Déplacement au clavier, à la souris et à la manette virtuelle, image par image, sans navigateur.
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

type Listener = (event: unknown) => void;

/** Un faux élément de la page, de 100 pixels de côté : il retient ses écouteurs, pour que le test lui envoie des événements. */
function fakeElement() {
  const heard = new Map<string, Listener>();
  const node = {
    addEventListener: (type: string, listener: Listener) => heard.set(type, listener),
    setPointerCapture() {},
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 100, height: 100 }),
    firstElementChild: { style: {} },
  } as unknown as HTMLElement;
  return { node, send: (type: string, event: object) => heard.get(type)!({ type, ...event }) };
}

/** Un visiteur dans un faux navigateur : juste de quoi créer les contrôles, enfoncer des touches, faire glisser la vue et toucher la manette. */
function visitor(walkable: Walkable, x: number, z: number, yaw: number) {
  const listeners = new Map<string, Listener>();
  vi.stubGlobal('window', { addEventListener: (type: string, listener: Listener) => listeners.set(type, listener) });
  const canvas = fakeElement();
  const joystick = fakeElement();
  const camera = new PerspectiveCamera();
  const controls = new Controls(camera, canvas.node, joystick.node);
  controls.walkable = walkable;
  controls.teleport(x, z, yaw);
  const at = () => ({ x: camera.position.x, z: camera.position.z });
  return {
    controls,
    at,
    press: (code: string) => listeners.get('keydown')!({ code, target: { closest: () => null }, preventDefault() {} }),
    release: (code: string) => listeners.get('keyup')!({ code }),
    /** Fait glisser la vue de `dx` pixels vers la droite : bouton enfoncé, déplacement, bouton relâché. */
    drag(dx: number) {
      canvas.send('pointerdown', { pointerId: 1, clientX: 50, clientY: 50 });
      canvas.send('pointermove', { pointerId: 1, clientX: 50 + dx, clientY: 50 });
      canvas.send('pointerup', { pointerId: 1, clientX: 50 + dx, clientY: 50 });
    },
    /** Pose le doigt sur la manette virtuelle : au centre, ou poussée de (x, y), de -1 à 1 ; (0, -1) fait avancer. */
    touchStick: (x = 0, y = 0) => joystick.send('pointerdown', { pointerId: 2, clientX: 50 + 50 * x, clientY: 50 + 50 * y }),
    releaseStick: () => joystick.send('pointerup', { pointerId: 2 }),
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

/**
 * Le musée de test meublé, comme dans marche.test.ts : un banc dans le hall (zone rectangulaire),
 * et un socle rond dans le salon des sculptures.
 */
const BENCH = { x: 2, z: 2, hx: 1.2, hz: 0.5 };
const ROUND = { x: -10.5, z: 0, r: 0.8 };
const museum = hall();
const furnished: Walkable = (x, z) =>
  museum(x, z) && !(Math.abs(x - BENCH.x) < BENCH.hx && Math.abs(z - BENCH.z) < BENCH.hz) && Math.hypot(x - ROUND.x, z - ROUND.z) >= ROUND.r;

type Point = { x: number; z: number };
type Visitor = ReturnType<typeof visitor>;
const gap = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.z - b.z);
const standable = (p: Point) => furnished(p.x, p.z);

/**
 * Trois déplacements en douceur qui traversent un endroit où le visiteur ne peut pas se tenir.
 * `out` : le premier endroit praticable de la trajectoire, de l'autre côté.
 */
const CROSSINGS: { name: string; from: Point; to: Point; out: Point }[] = [
  // Du hall au cabinet, à travers le mur nord, impraticable entre z = -3,90 et z = -5,10 : le cas signalé.
  { name: 'l’épaisseur d’un mur', from: { x: 0, z: 0 }, to: { x: 0, z: -8 }, out: { x: 0, z: -5.1 } },
  // En biais à travers la zone du banc : la trajectoire y entre en (1 ; 1,50) et en sort en (3 ; 2,50).
  { name: 'la zone d’un banc', from: { x: -1, z: 0.5 }, to: { x: 4, z: 3 }, out: { x: 3, z: 2.5 } },
  // Par le centre du socle rond : la trajectoire quitte sa zone 0,80 m plus loin.
  {
    name: 'la zone d’un socle',
    from: { x: -8, z: 0.5 },
    to: { x: -13, z: -0.5 },
    out: { x: ROUND.x - (ROUND.r * 5) / Math.sqrt(26), z: ROUND.z - ROUND.r / Math.sqrt(26) },
  },
];

/** Les gestes par lesquels le visiteur reprend la main pendant un déplacement en douceur. */
const GESTURES: { name: string; start(v: Visitor): void; end(v: Visitor): void }[] = [
  { name: 'une touche de déplacement', start: (v) => v.press('KeyW'), end: (v) => v.release('KeyW') },
  { name: 'une touche de rotation', start: (v) => v.press('KeyQ'), end: (v) => v.release('KeyQ') },
  { name: 'un glissement de la vue', start: (v) => v.drag(40), end: () => {} },
  { name: 'un doigt posé sur la manette', start: (v) => v.touchStick(), end: (v) => v.releaseStick() },
];

/** Lance un déplacement en douceur vers `to`, comme un clic sur une œuvre. */
const glide = (v: Visitor, to: Point, yaw = 0, pitch = 0) => v.controls.glideTo(new Vector3(to.x, 0, to.z), yaw, pitch);

/** Fait passer des images jusqu'à la première où le visiteur n'est plus à un endroit praticable. */
function untilOutside(v: Visitor, dt: number) {
  for (let i = 0; i < 20000 && standable(v.at()); i++) v.controls.update(dt);
  expect(standable(v.at()), 'le déplacement aurait dû passer par un endroit non praticable').toBe(false);
  expect(v.controls.gliding).toBe(true);
}

/** Laisse le déplacement s'achever, sans autre geste, et renvoie les positions successives et la durée. */
function settle(v: Visitor, dt: number) {
  const trace = [v.at()];
  let seconds = 0;
  while (v.controls.gliding && seconds < 10) {
    v.controls.update(dt);
    seconds += dt;
    trace.push(v.at());
  }
  expect(v.controls.gliding, 'le déplacement aurait dû s’achever').toBe(false);
  return { trace, seconds };
}

/** Regard dans le sens du trajet de `from` à `to` : la touche « avancer » y emmène. */
const heading = (from: Point, to: Point) => Math.atan2(from.x - to.x, from.z - to.z);

describe('déplacement en douceur interrompu', () => {
  it('le cas signalé : interrompu dans l’épaisseur d’un mur, le visiteur n’y reste pas coincé', () => {
    const v = visitor(museum, 0, 0, 0);
    glide(v, { x: 0, z: -8 });
    while (v.at().z > -4.5) v.controls.update(SMOOTH);
    // Il est dans le mur nord du hall. Avant la correction, les quatre touches l'y laissaient, à 0,000 m près.
    expect(museum(v.at().x, v.at().z)).toBe(false);
    for (const key of ['KeyW', 'KeyS', 'KeyA', 'KeyD']) {
      const before = v.at();
      v.press(key);
      v.run(SMOOTH, 2);
      v.release(key);
      expect(museum(v.at().x, v.at().z), key).toBe(true);
      expect(gap(before, v.at()), key).toBeGreaterThan(1);
    }
  });

  for (const crossing of CROSSINGS) {
    it(`dans ${crossing.name}, il va de lui-même jusqu’au premier endroit praticable de son trajet, quel que soit le geste`, () => {
      for (const gesture of GESTURES) {
        for (const dt of [SLOW, SMOOTH, TINY]) {
          const label = `${gesture.name}, images de ${dt} s`;
          const v = visitor(furnished, crossing.from.x, crossing.from.z, 0);
          glide(v, crossing.to);
          untilOutside(v, dt);
          const entry = v.at();
          gesture.start(v);
          // Sans autre geste, il arrive en un quart de seconde au plus (à une image près), sans rebrousser chemin...
          const { trace, seconds } = settle(v, dt);
          expect(seconds, label).toBeLessThanOrEqual(0.25 + dt);
          for (let i = 1; i < trace.length; i++) expect(gap(trace[i], crossing.to), label).toBeLessThan(gap(trace[i - 1], crossing.to));
          // ... au ras de l'obstacle, de l'autre côté : au même endroit quelle que soit la durée des images.
          const end = v.at();
          expect(standable(end), label).toBe(true);
          expect(gap(end, crossing.out), label).toBeLessThan(2 * PRECISION);
          expect(gap(end, crossing.to), label).toBeLessThan(gap(entry, crossing.to));
          gesture.end(v);

          // Et il peut marcher : tout droit dans le sens de son trajet, à 2,40 m par seconde.
          v.controls.yaw = heading(crossing.from, crossing.to);
          v.press('KeyW');
          v.run(dt, 0.5);
          v.release('KeyW');
          expect(gap(end, v.at()), label).toBeCloseTo(1.2, 4);
          expect(standable(v.at()), label).toBe(true);
        }
      }
    });
  }

  it('à quelque instant de la traversée qu’il reprenne la main, il arrive au même endroit', () => {
    for (const crossing of CROSSINGS) {
      // Toutes les images où le visiteur est hors zone de marche, une à une.
      let tried = 0;
      for (let frame = 1; frame < 200; frame++) {
        const v = visitor(furnished, crossing.from.x, crossing.from.z, 0);
        glide(v, crossing.to);
        v.run(SMOOTH, frame * SMOOTH);
        if (standable(v.at())) continue;
        tried++;
        v.drag(40);
        settle(v, SMOOTH);
        expect(gap(v.at(), crossing.out), `${crossing.name}, image ${frame}`).toBeLessThan(2 * PRECISION);
      }
      expect(tried, crossing.name).toBeGreaterThan(3);
    }
  });

  it('pendant qu’il achève de traverser, son regard lui obéit déjà', () => {
    // Le déplacement tourne aussi le regard, ici vers la gauche et vers le haut.
    const v = visitor(furnished, 0, 0, 0);
    glide(v, { x: 0, z: -8 }, 1, 0.4);
    untilOutside(v, SMOOTH);
    const turned = v.controls.yaw;
    expect(turned).toBeGreaterThan(0);
    expect(turned).toBeLessThan(1);
    // Glissement de 100 pixels : le regard tourne aussitôt d'autant (0,0032 radian par pixel)...
    v.drag(100);
    const yaw = v.controls.yaw;
    const pitch = v.controls.pitch;
    expect(yaw).toBeCloseTo(turned + 0.32, 9);
    // ... et le déplacement ne le fait plus tourner, alors que les pieds finissent d'avancer.
    const { trace } = settle(v, SMOOTH);
    expect(trace.length).toBeGreaterThan(2);
    expect(v.controls.yaw).toBe(yaw);
    expect(v.controls.pitch).toBe(pitch);
    expect(gap(v.at(), CROSSINGS[0].out)).toBeLessThan(2 * PRECISION);

    // Au clavier, la touche de rotation tourne le regard pendant la fin de la traversée, à 1,60 radian par seconde.
    const w = visitor(furnished, 0, 0, 0);
    glide(w, { x: 0, z: -8 }, 1, 0.4);
    untilOutside(w, TINY);
    const before = w.controls.yaw;
    w.press('KeyQ');
    const { seconds } = settle(w, TINY);
    expect(seconds).toBeGreaterThan(0.01);
    expect(w.controls.yaw - before).toBeCloseTo(1.6 * seconds, 6);
  });

  it('là où il peut se tenir, il s’arrête sur place, comme avant', () => {
    for (const gesture of GESTURES.slice(1)) {
      // Avant le mur, puis après : dans le hall, puis dans le cabinet.
      for (const seconds of [0.05, 0.4]) {
        const v = visitor(furnished, 0, 0, 0);
        glide(v, { x: 0, z: -8 });
        v.run(SMOOTH, seconds);
        const here = v.at();
        expect(standable(here)).toBe(true);
        expect(v.controls.gliding).toBe(true);
        gesture.start(v);
        v.run(SMOOTH, 0.5);
        expect(v.controls.gliding, gesture.name).toBe(false);
        expect(v.at(), gesture.name).toEqual(here);
      }
    }
    // Une touche de déplacement l'arrête de même, puis le fait marcher de là où il est.
    const v = visitor(furnished, 0, 0, 0);
    glide(v, { x: 0, z: -8 });
    v.run(SMOOTH, 0.05);
    const here = v.at();
    v.press('KeyS');
    v.run(SMOOTH, 0.5);
    expect(v.at().x).toBe(0);
    expect(v.at().z).toBeCloseTo(here.z + 1.2, 6);
  });

  it('si rien n’est praticable devant lui, il revient au dernier endroit praticable qu’il a traversé', () => {
    // Deux destinations où l'on ne peut pas se tenir : dans l'épaisseur du mur nord, puis hors du bâtiment.
    for (const to of [{ x: 0, z: -4.6 }, { x: 0, z: 9 }]) {
      const limit = to.z < 0 ? -3.9 : 3.9;
      for (const dt of [SLOW, SMOOTH, TINY]) {
        const v = visitor(furnished, 0, 0, 0);
        glide(v, to);
        untilOutside(v, dt);
        const entry = v.at();
        v.drag(40);
        // Il fait demi-tour à l'allure de la marche : 2,40 m par seconde.
        const { seconds } = settle(v, dt);
        expect(seconds).toBeLessThanOrEqual(Math.abs(entry.z - limit) / 2.4 + dt);
        // Il s'arrête au ras de la limite de marche du hall, du bon côté.
        expect(standable(v.at())).toBe(true);
        expect(v.at().x).toBe(0);
        expect(Math.abs(v.at().z)).toBeLessThanOrEqual(3.9);
        expect(Math.abs(v.at().z)).toBeGreaterThan(3.9 - 2 * PRECISION);
      }
    }
  });

  it('parti hors de la zone de marche vers un endroit impraticable, il s’arrête sur place : son trajet n’offre aucune issue', () => {
    // Cas limite : il faut que le visiteur ait déjà été hors zone avant le déplacement. La règle n'y peut rien.
    const v = visitor(furnished, 0, -4.3, 0);
    glide(v, { x: -2, z: -4.6 });
    v.run(SMOOTH, 0.1);
    const here = v.at();
    v.drag(40);
    expect(v.controls.gliding).toBe(false);
    v.run(SMOOTH, 0.5);
    expect(v.at()).toEqual(here);
  });

  it('une marche vers un point du sol qui rase l’angle d’un banc ne coince pas non plus le visiteur', () => {
    // Le trajet d'un clic au sol est contrôlé tous les 10 cm : il peut couper de quelques centimètres l'angle
    // d'une zone, ici celle du banc, dont l'angle est en (0,80 ; 1,50).
    const v = visitor(furnished, 0.5, 1.83, 0);
    const end = v.controls.walkTo(1.5, 0.83)!;
    expect(gap(end, { x: 1.5, z: 0.83 })).toBeLessThan(1e-9);
    untilOutside(v, TINY);
    v.drag(40);
    settle(v, TINY);
    // Il sort de l'angle par où il allait, sur le bord de la zone (z = 1,50).
    expect(standable(v.at())).toBe(true);
    expect(gap(v.at(), { x: 0.83, z: 1.5 })).toBeLessThan(2 * PRECISION);
  });

  it('quels que soient le trajet, l’instant et le geste, il finit à un endroit praticable sans quitter son trajet', () => {
    const next = random(7);
    const anywhere = () => ({ x: -16 + 31 * next(), z: -13 + 20 * next() });
    const frame = () => [SLOW, SMOOTH, 0.03, 0.004][Math.floor(next() * 4)];
    let ahead = 0;
    let back = 0;
    let onTheSpot = 0;
    for (let i = 0; i < 4000; i++) {
      // Un départ praticable ; une destination quelconque, praticable ou non, jusque hors du bâtiment.
      let from = anywhere();
      while (!standable(from)) from = anywhere();
      const to = anywhere();
      const v = visitor(furnished, from.x, from.z, 2 * Math.PI * next());
      if (next() < 0.25) {
        // Un clic au sol plutôt qu'une œuvre ; sans effet si un obstacle est tout proche.
        if (!v.controls.walkTo(to.x, to.z)) continue;
      } else {
        glide(v, to, 2 * Math.PI * next(), next() - 0.5);
      }
      // Le geste arrive à un instant quelconque, le plus souvent pendant que le visiteur est hors zone de marche.
      for (let f = 0; f < 400 && v.controls.gliding && next() > (standable(v.at()) ? 0.03 : 0.4); f++) v.controls.update(frame());
      if (!v.controls.gliding) continue;
      const here = v.at();
      const outside = !standable(here);
      const gesture = GESTURES[Math.floor(next() * GESTURES.length)];
      gesture.start(v);
      let seconds = 0;
      const line = Math.hypot(to.x - from.x, to.z - from.z);
      while (v.controls.gliding && seconds < 20) {
        const dt = frame();
        v.controls.update(dt);
        seconds += dt;
        // Hors zone de marche, il reste sur son trajet, entre le départ et la destination.
        if (!outside) continue;
        const p = v.at();
        const along = ((p.x - from.x) * (to.x - from.x) + (p.z - from.z) * (to.z - from.z)) / line;
        const aside = ((p.x - from.x) * (to.z - from.z) - (p.z - from.z) * (to.x - from.x)) / line;
        expect(Math.abs(aside), `trajet n° ${i}`).toBeLessThan(1e-6);
        expect(along, `trajet n° ${i}`).toBeGreaterThanOrEqual(-1e-6);
        expect(along, `trajet n° ${i}`).toBeLessThanOrEqual(line + 1e-6);
      }
      expect(v.controls.gliding, `trajet n° ${i}`).toBe(false);
      const end = v.at();
      expect(standable(end), `trajet n° ${i}, arrêt en (${end.x} ; ${end.z})`).toBe(true);
      if (!outside) {
        // Là où il pouvait se tenir : arrêt sur place, à un pas de marche près si une touche est enfoncée.
        expect(gap(here, end), `trajet n° ${i}`).toBeLessThanOrEqual(2.4 * SLOW + 1e-9);
        onTheSpot++;
        continue;
      }
      // Hors zone : il n'a marché que le temps d'en sortir, sans traîner.
      const forward = gap(end, to) < gap(here, to);
      if (forward) ahead++;
      else back++;
      expect(seconds, `trajet n° ${i}`).toBeLessThanOrEqual((forward ? 0.25 : gap(here, end) / 2.4) + SLOW);
    }
    // Le tirage a bien couvert les trois issues : arrêt sur place, sortie par l'avant, retour en arrière.
    expect(onTheSpot).toBeGreaterThan(300);
    expect(ahead).toBeGreaterThan(300);
    expect(back).toBeGreaterThan(300);
  });
});

describe('déplacement en douceur mené à son terme', () => {
  it('garde son allure : il ralentit à mesure qu’il approche, et s’achève à moins d’un centimètre du but', () => {
    for (const dt of [SLOW, SMOOTH, TINY]) {
      const v = visitor(furnished, 0, 0, 0);
      glide(v, { x: 3, z: -1.5 }, 0.8, -0.2);
      // Après une demi-seconde, il reste à parcourir la distance de départ multipliée par e^-2.
      v.run(dt, 0.5);
      const left = Math.exp(-2);
      expect(v.at().x, `images de ${dt} s`).toBeCloseTo(3 * (1 - left), 9);
      expect(v.at().z, `images de ${dt} s`).toBeCloseTo(-1.5 * (1 - left), 9);
      expect(v.controls.yaw, `images de ${dt} s`).toBeCloseTo(0.8 * (1 - left), 9);
      expect(v.controls.pitch, `images de ${dt} s`).toBeCloseTo(-0.2 * (1 - left), 9);
      const { seconds } = settle(v, dt);
      expect(seconds).toBeLessThan(2);
      expect(gap(v.at(), { x: 3, z: -1.5 })).toBeLessThan(0.01);
    }
  });

  it('arrivé par un mur à une destination posée au bord de la zone de marche, le visiteur peut s’y tenir', () => {
    // Le déplacement s'achève à moins d'un centimètre du but. Abordé par le mur, ce centimètre
    // laisserait le visiteur hors de la zone de marche du cabinet, qui commence en z = -5,10.
    for (const dt of [SLOW, SMOOTH, TINY]) {
      const v = visitor(furnished, 0, 0, 0);
      glide(v, { x: 0, z: -5.1 });
      settle(v, dt);
      expect(v.at(), `images de ${dt} s`).toEqual({ x: 0, z: -5.1 });
      expect(standable(v.at()), `images de ${dt} s`).toBe(true);
    }
  });
});

describe('déplacement en douceur achevé d’un coup (entrée en casque VR)', () => {
  it('pose le visiteur à sa destination, tourné comme il devait l’être', () => {
    const v = visitor(furnished, 0, 0, 0);
    glide(v, { x: 0, z: -8 }, 1, 0.4);
    untilOutside(v, SMOOTH);
    v.controls.finishGlide();
    expect(v.controls.gliding).toBe(false);
    expect(v.at()).toEqual({ x: 0, z: -8 });
    expect(v.controls.yaw).toBe(1);
    expect(v.controls.pitch).toBe(0.4);
    // Plus rien ne bouge ensuite, et rien ne se passe s'il n'y a pas de déplacement en cours.
    v.controls.finishGlide();
    v.run(SMOOTH, 0.5);
    expect(v.at()).toEqual({ x: 0, z: -8 });
  });

  it('après une interruption hors de la zone de marche, le pose au premier endroit praticable, sans toucher à son regard', () => {
    const v = visitor(furnished, 0, 0, 0);
    glide(v, { x: 0, z: -8 }, 1, 0.4);
    untilOutside(v, SMOOTH);
    v.drag(40);
    const yaw = v.controls.yaw;
    expect(v.controls.gliding).toBe(true);
    v.controls.finishGlide();
    expect(v.controls.gliding).toBe(false);
    expect(gap(v.at(), CROSSINGS[0].out)).toBeLessThan(2 * PRECISION);
    expect(standable(v.at())).toBe(true);
    expect(v.controls.yaw).toBe(yaw);
  });
});

/** Suite de nombres pseudo-aléatoires, toujours la même d'une exécution à l'autre. */
function random(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

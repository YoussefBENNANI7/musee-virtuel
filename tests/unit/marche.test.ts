import { describe, expect, it } from 'vitest';
import { advance, follow, MAX_STEP, PRECISION, type Walkable } from '../../src/engine/marche';
import { fixture, layoutOf } from './helpers';

/**
 * Règle de marche, sans navigateur. Plan du musée de test : voir layout.test.ts.
 * Dans le hall, le visiteur peut se tenir entre x = -5,40 et x = 5,40, et entre z = -3,90 et z = 3,90.
 */
const layout = layoutOf(fixture());
const hall = layout.walkable;
const WEST_LIMIT = -5.4;
const NORTH_LIMIT = -3.9;

/** Le musée de test meublé : un banc (zone rectangulaire) dans le hall, et un socle rond dans la rotonde. */
const BENCH = { x: 2, z: 2, hx: 1.2, hz: 0.5 };
const PEDESTAL = { x: -10.5, z: 0, r: 0.8 };
const furnished: Walkable = (x, z) =>
  hall(x, z) && !(Math.abs(x - BENCH.x) < BENCH.hx && Math.abs(z - BENCH.z) < BENCH.hz) && Math.hypot(x - PEDESTAL.x, z - PEDESTAL.z) >= PEDESTAL.r;

/** Longueurs de pas : une image très lente au clavier (24 cm), une image à 60 par seconde (4 cm), une image très rapide. */
const STRIDES = [0.24, 0.04, 0.0024];

/**
 * Marche tout droit sur `distance` mètres, par pas de `stride`, et renvoie la position après chaque pas.
 * Les distances des tests sont des multiples de 24 cm : le même trajet se fait en un nombre entier de pas, quel que soit le pas.
 */
function walk(walkable: Walkable, from: { x: number; z: number }, dirX: number, dirZ: number, distance: number, stride: number, options = {}) {
  const norm = Math.hypot(dirX, dirZ);
  const trace = [from];
  for (let i = Math.round(distance / stride); i > 0; i--) {
    const p = trace[trace.length - 1];
    trace.push(advance(walkable, p.x, p.z, (dirX / norm) * stride, (dirZ / norm) * stride, options));
  }
  return trace;
}
const last = <T>(list: T[]) => list[list.length - 1];

/** Ancienne règle, gardée ici comme référence : chaque pas est fait ou refusé en entier. */
function allOrNothing(walkable: Walkable, x: number, z: number, dx: number, dz: number) {
  if (walkable(x + dx, z + dz)) return { x: x + dx, z: z + dz };
  if (walkable(x + dx, z)) return { x: x + dx, z };
  if (walkable(x, z + dz)) return { x, z: z + dz };
  return { x, z };
}

/** Suite de nombres pseudo-aléatoires, toujours la même d'une exécution à l'autre. */
function random(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

describe('marche libre', () => {
  it('fait tout le déplacement quand rien ne gêne, en un pas ou en plusieurs', () => {
    expect(advance(hall, 0, 0, 0, 0)).toEqual({ x: 0, z: 0 });
    const once = advance(hall, 4, 3, -3, -2);
    expect(once.x).toBeCloseTo(1, 9);
    expect(once.z).toBeCloseTo(1, 9);
    for (const stride of STRIDES) {
      const end = last(walk(hall, { x: 4, z: 3 }, -3, -2, 3.6, stride));
      expect(Math.hypot(end.x - (4 - 3.6 * (3 / Math.hypot(3, 2))), end.z - (3 - 3.6 * (2 / Math.hypot(3, 2)))), `pas de ${stride} m`).toBeLessThan(1e-9);
    }
  });
});

describe('arrêt au ras d’un obstacle', () => {
  it('amène le visiteur au ras du mur, quelle que soit la longueur du pas', () => {
    // D'un seul coup, puis à grands pas, puis à petits pas : toujours le même endroit, au micron près.
    const stops = [advance(hall, -4, 3, -2, 0), ...STRIDES.map((stride) => last(walk(hall, { x: -4, z: 3 }, -1, 0, 2.4, stride)))];
    for (const stop of stops) {
      expect(stop.x).toBeGreaterThanOrEqual(WEST_LIMIT);
      expect(stop.x).toBeLessThan(WEST_LIMIT + 2 * PRECISION);
      expect(stop.z).toBe(3);
    }
  });

  it('l’y amène dès le premier pas trop long', () => {
    const trace = walk(hall, { x: -4, z: 3 }, -1, 0, 2.4, 0.24);
    // Cinq pas entiers de 24 cm, puis un sixième raccourci à 20 cm : le mur est atteint.
    expect(trace[5].x).toBeCloseTo(-5.2, 9);
    expect(trace[6].x).toBeLessThan(WEST_LIMIT + 2 * PRECISION);
  });

  it('une fois au ras, le visiteur ne bouge plus du tout', () => {
    const stop = advance(hall, -4, 3, -2, 0);
    // Des pas de toutes longueurs, droit sur le mur puis en biais dans l'angle : aucun ne le déplace.
    for (const stride of [0.24, 0.0024, 0.04, 0.001, 0.1, 0.00001]) {
      expect(advance(hall, stop.x, stop.z, -stride, 0), `pas de ${stride} m`).toEqual(stop);
    }
    const corner = advance(hall, -4, 3, -3, 3);
    expect(corner.x).toBeLessThan(WEST_LIMIT + 2 * PRECISION);
    expect(corner.z).toBeGreaterThan(3.9 - 2 * PRECISION);
    for (const stride of [0.24, 0.0024, 0.04, 0.001, 0.1, 0.00001]) {
      expect(advance(hall, corner.x, corner.z, -stride, stride), `pas de ${stride} m`).toEqual(corner);
    }
  });

  it('s’arrête au ras d’un banc et d’un socle rond', () => {
    for (const stride of STRIDES) {
      // Vers le banc, depuis l'ouest : sa zone commence en x = 0,80.
      const bench = last(walk(furnished, { x: -1, z: 2 }, 1, 0, 2.4, stride));
      expect(bench.x, `pas de ${stride} m`).toBeLessThanOrEqual(BENCH.x - BENCH.hx);
      expect(bench.x, `pas de ${stride} m`).toBeGreaterThan(BENCH.x - BENCH.hx - 2 * PRECISION);
      // Vers le socle, depuis l'est, droit sur son centre.
      const round = last(walk(furnished, { x: -8, z: 0 }, -1, 0, 2.4, stride));
      const gap = Math.hypot(round.x - PEDESTAL.x, round.z - PEDESTAL.z) - PEDESTAL.r;
      expect(gap, `pas de ${stride} m`).toBeGreaterThanOrEqual(0);
      expect(gap, `pas de ${stride} m`).toBeLessThan(2 * PRECISION);
    }
  });
});

describe('glissement', () => {
  it('longe le mur sans perdre de temps, et finit dans l’angle', () => {
    for (const stride of STRIDES) {
      // En biais vers le mur ouest : contact après 1,40 m vers l'ouest, puis glissement vers le sud.
      const trace = walk(hall, { x: -4, z: 1 }, -1, 1, 2.4, stride);
      const end = last(trace);
      expect(end.x, `pas de ${stride} m`).toBeGreaterThanOrEqual(WEST_LIMIT);
      expect(end.x, `pas de ${stride} m`).toBeLessThan(WEST_LIMIT + 2 * PRECISION);
      // Vers le sud, rien n'a freiné le visiteur.
      expect(end.z, `pas de ${stride} m`).toBeCloseTo(1 + 2.4 * Math.SQRT1_2, 9);
      // Plus loin, l'angle sud-ouest l'arrête pour de bon.
      const corner = last(walk(hall, end, -1, 1, 2.4, stride));
      expect(corner.x, `pas de ${stride} m`).toBeLessThan(WEST_LIMIT + 2 * PRECISION);
      expect(corner.z, `pas de ${stride} m`).toBeLessThanOrEqual(3.9);
      expect(corner.z, `pas de ${stride} m`).toBeGreaterThan(3.9 - 2 * PRECISION);
    }
  });

  it('longe le mur jusqu’à la porte, puis la franchit par son passage', () => {
    for (const stride of STRIDES) {
      // En biais vers le mur nord, à gauche de la porte (passage entre x = 2,70 et x = 4,30).
      const trace = walk(hall, { x: 0, z: -2 }, 1, -1, 6, stride);
      for (const p of trace) expect(hall(p.x, p.z), `pas de ${stride} m, en (${p.x} ; ${p.z})`).toBe(true);
      // Il a longé le mur au ras, puis l'a quitté en biais devant le passage : en remontant sa trajectoire
      // depuis sa première position dans la porte, on trouve l'endroit où il a quitté le mur.
      // C'est le bord du passage, à un petit pas près : l'angle n'est pas coupé davantage.
      const entry = trace.find((p) => p.z < NORTH_LIMIT - 1e-9)!;
      const left = entry.x - (NORTH_LIMIT - entry.z);
      expect(left, `pas de ${stride} m`).toBeGreaterThan(2.7 - MAX_STEP);
      expect(left, `pas de ${stride} m`).toBeLessThan(2.7 + 2 * PRECISION);
      // De l'autre côté, il est dans le cabinet.
      expect(last(trace).z, `pas de ${stride} m`).toBeLessThan(-5.1);
    }
  });

  it('loin de toute porte, ne traverse pas le mur', () => {
    for (const stride of STRIDES) {
      const trace = walk(hall, { x: -5, z: -2 }, 1, -1, 4.8, stride);
      for (const p of trace) expect(p.z, `pas de ${stride} m`).toBeGreaterThanOrEqual(NORTH_LIMIT);
      // Il a longé le mur vers l'est sans ralentir.
      expect(last(trace).x, `pas de ${stride} m`).toBeCloseTo(-5 + 4.8 * Math.SQRT1_2, 9);
    }
  });

  it('contourne un socle rond en le serrant au plus près, et arrive au même endroit à tous les pas', () => {
    // Sur une ligne qui passe à 60 cm du centre du socle (rayon de 0,80 m) : contact de biais, puis contournement.
    const start = { x: PEDESTAL.x + 3, z: -0.3 };
    const ends = STRIDES.map((stride) => {
      const trace = walk(furnished, start, -Math.cos(0.3), Math.sin(0.3), 4.8, stride);
      let closest = Infinity;
      for (const p of trace) {
        const gap = Math.hypot(p.x - PEDESTAL.x, p.z - PEDESTAL.z) - PEDESTAL.r;
        expect(gap, `pas de ${stride} m`).toBeGreaterThanOrEqual(0);
        closest = Math.min(closest, gap);
      }
      expect(closest, `pas de ${stride} m`).toBeLessThan(2 * PRECISION);
      return last(trace);
    });
    for (const end of ends) {
      expect(end.x).toBeLessThan(PEDESTAL.x - PEDESTAL.r);
      expect(Math.hypot(end.x - ends[0].x, end.z - ends[0].z)).toBeLessThan(0.001);
    }
  });
});

describe('sans arrêt au ras (visite en casque)', () => {
  const steps = { flush: false };

  it('s’arrête à moins d’un petit pas de l’obstacle, quelle que soit la longueur du pas', () => {
    // Pas d'une image très lente en casque (18 cm), d'une image à 90 par seconde (2 cm), et d'un seul coup.
    const stops = [advance(hall, 0, -1.4, 0, -3, steps), ...[0.18, 0.02].map((stride) => last(walk(hall, { x: 0, z: -1.4 }, 0, -1, 3.6, stride, steps)))];
    for (const stop of stops) {
      expect(stop.z).toBeGreaterThanOrEqual(NORTH_LIMIT);
      expect(stop.z).toBeLessThan(NORTH_LIMIT + MAX_STEP);
    }
  });

  it('pour un pas d’un seul petit pas, applique exactement l’ancienne règle', () => {
    // Départs au hasard dans tout le musée de test, murs et meubles compris ; pas de 5 cm au plus.
    const next = random(1);
    let blocked = 0;
    for (let i = 0; i < 20000; i++) {
      const x = -16 + 31 * next();
      const z = -13 + 20 * next();
      const angle = 2 * Math.PI * next();
      const length = 0.0499 * next();
      const dx = Math.cos(angle) * length;
      const dz = Math.sin(angle) * length;
      const expected = allOrNothing(furnished, x, z, dx, dz);
      expect(advance(furnished, x, z, dx, dz, steps)).toEqual(expected);
      if (expected.x !== x + dx || expected.z !== z + dz) blocked++;
    }
    // Le tirage a bien couvert des pas gênés par un obstacle, pas seulement des pas libres.
    expect(blocked).toBeGreaterThan(1000);
  });
});

/**
 * Un visiteur en casque, sans casque. `rig` est l'endroit du musée où se trouve le centre de sa pièce réelle,
 * `offset` l'écart de sa tête à ce centre : ses mouvements réels. Le joystick déplace le rig, et la tête avec lui.
 * Chaque image se déroule comme dans src/vr.ts : le point d'appui suit la tête, puis la règle de marche part de lui.
 */
function headset(walkable: Walkable, x: number, z: number) {
  const rig = { x, z };
  const offset = { x: 0, z: 0 };
  let support = { x, z };
  const head = () => ({ x: rig.x + offset.x, z: rig.z + offset.z });
  const visitor = {
    head,
    rig: () => ({ ...rig }),
    support: () => support,
    /** Le visiteur déplace réellement sa tête : il se penche, il fait un pas. Le joystick est au repos. */
    move(dx: number, dz: number) {
      offset.x += dx;
      offset.z += dz;
      visitor.frame(0, 0);
    },
    /** Une image, joystick poussé de (dx, dz) mètres. */
    frame(dx: number, dz: number) {
      const h = head();
      support = follow(walkable, support.x, support.z, h.x, h.z);
      if (!dx && !dz) return;
      const to = advance(walkable, support.x, support.z, dx, dz, JOYSTICK);
      rig.x += to.x - support.x;
      rig.z += to.z - support.z;
      support = to;
    },
    /** Joystick tenu pendant `frames` images. Renvoie le déplacement du visiteur. */
    push(dx: number, dz: number, frames: number) {
      const from = { ...rig };
      for (let i = 0; i < frames; i++) visitor.frame(dx, dz);
      return { x: rig.x - from.x, z: rig.z - from.z };
    },
    /** Gâchette vers le sol : la tête arrive au point visé. */
    teleport(toX: number, toZ: number) {
      const h = head();
      rig.x += toX - h.x;
      rig.z += toZ - h.z;
      support = { x: toX, z: toZ };
    },
  };
  return visitor;
}
/** Réglage du joystick en casque : pour l'instant, il n'amène pas le visiteur au ras de l'obstacle. */
const JOYSTICK = { flush: false };
/** Pas d'une image en casque (1,80 m par seconde) : image très lente, 90 images par seconde, 144 images par seconde. */
const HEADSET_STRIDES = [0.18, 0.02, 0.0125];
/** Le cabinet, au nord du hall : le visiteur peut s'y tenir à partir de z = -5,10. */
const CABINET_LIMIT = -5.1;

describe('point d’appui (visite en casque)', () => {
  it('est la tête tant qu’elle est en zone praticable, où que soit l’ancien point d’appui', () => {
    for (const from of [{ x: 1, z: 1 }, { x: 0, z: NORTH_LIMIT }, { x: 10, z: 0 }, { x: 0, z: -4.5 }]) {
      expect(follow(hall, from.x, from.z, -2, 3)).toEqual({ x: -2, z: 3 });
    }
  });

  it('reste au ras de la limite quand la tête passe un mur, et la suit le long de ce mur', () => {
    let support = { x: 0, z: -3.5 };
    // La tête passe la limite nord, s'enfonce, se déplace le long du mur dans les deux sens.
    for (const head of [{ x: 0, z: -3.95 }, { x: 0.3, z: -4 }, { x: 0.31, z: -4.3 }, { x: -1, z: -4.4 }, { x: -2.5, z: -3.91 }]) {
      support = follow(hall, support.x, support.z, head.x, head.z);
      expect(support.x).toBeCloseTo(head.x, 9);
      expect(support.z).toBeGreaterThanOrEqual(NORTH_LIMIT);
      expect(support.z).toBeLessThan(NORTH_LIMIT + 2 * PRECISION);
    }
    // Dans l'angle nord-ouest, la tête au-delà des deux murs : il reste dans l'angle.
    support = follow(hall, support.x, support.z, -6, -4.2);
    expect(support.x).toBeGreaterThanOrEqual(WEST_LIMIT);
    expect(support.x).toBeLessThan(WEST_LIMIT + 2 * PRECISION);
    expect(support.z).toBeGreaterThanOrEqual(NORTH_LIMIT);
    expect(support.z).toBeLessThan(NORTH_LIMIT + 2 * PRECISION);
  });

  it('serre un banc et un socle rond sans y entrer', () => {
    // La tête se penche au-dessus du banc, depuis l'ouest (sa zone commence en x = 0,80), puis glisse le long.
    let support = { x: 0.5, z: 2 };
    for (const head of [{ x: 0.9, z: 2 }, { x: 1, z: 2.3 }, { x: 1.5, z: 1.7 }]) {
      support = follow(furnished, support.x, support.z, head.x, head.z);
      expect(support.x).toBeLessThanOrEqual(BENCH.x - BENCH.hx);
      expect(support.x).toBeGreaterThan(BENCH.x - BENCH.hx - 2 * PRECISION);
      expect(support.z).toBeCloseTo(head.z, 9);
    }
    // La tête entre dans la zone du socle par l'est, puis s'y déplace : il reste au bord, du même côté.
    support = { x: PEDESTAL.x + 1.2, z: 0.1 };
    for (const head of [{ x: PEDESTAL.x + 0.6, z: 0.1 }, { x: PEDESTAL.x + 0.5, z: 0.4 }, { x: PEDESTAL.x + 0.2, z: 0.5 }]) {
      support = follow(furnished, support.x, support.z, head.x, head.z);
      const gap = Math.hypot(support.x - PEDESTAL.x, support.z - PEDESTAL.z) - PEDESTAL.r;
      expect(gap).toBeGreaterThanOrEqual(0);
      expect(gap).toBeLessThan(2 * PRECISION);
      expect(support.z).toBeCloseTo(head.z, 9);
      expect(support.x).toBeGreaterThan(PEDESTAL.x);
    }
  });

  it('sans point d’appui praticable, est la tête, même hors zone', () => {
    // Visiteur entré en casque dans l'épaisseur d'un mur : rien ne dit où il pourrait s'appuyer.
    expect(follow(hall, 0, -4.5, 0.2, -4.4)).toEqual({ x: 0.2, z: -4.4 });
  });

  it('tête penchée au-delà du mur, le joystick répond : il longe le mur et recule, sans pousser la tête plus loin', () => {
    for (const stride of HEADSET_STRIDES) {
      // Joystick vers le mur nord jusqu'à l'arrêt, puis le visiteur se penche de 10 cm : sa tête passe la limite de marche.
      const v = headset(hall, 0, -1.4);
      v.push(0, -stride, Math.ceil(3 / stride));
      v.move(0, -0.1);
      const leaning = v.head();
      expect(hall(leaning.x, leaning.z), `pas de ${stride} m`).toBe(false);
      // L'ancienne règle partait de la tête : aucun pas le long du mur ne passait, quelle que soit sa longueur.
      expect(allOrNothing(hall, leaning.x, leaning.z, stride, 0)).toEqual(leaning);
      expect(allOrNothing(hall, leaning.x, leaning.z, -stride, 0)).toEqual(leaning);

      // Le long du mur, vers l'ouest puis vers l'est (du côté sans porte) : à pleine allure, et sans changer de profondeur.
      const frames = Math.round(1.8 / stride);
      const west = v.push(-stride, 0, frames);
      expect(west.x, `pas de ${stride} m`).toBeCloseTo(-1.8, 9);
      expect(west.z, `pas de ${stride} m`).toBe(0);
      const east = v.push(stride, 0, frames);
      expect(east.x, `pas de ${stride} m`).toBeCloseTo(1.8, 9);
      expect(east.z, `pas de ${stride} m`).toBe(0);
      // Vers le mur : il ne bouge pas. En biais vers le mur : il le longe, sans s'en approcher.
      expect(v.push(0, -stride, frames), `pas de ${stride} m`).toEqual({ x: 0, z: 0 });
      const slide = v.push(-stride * Math.SQRT1_2, -stride * Math.SQRT1_2, frames);
      expect(slide.x, `pas de ${stride} m`).toBeCloseTo(-1.8 * Math.SQRT1_2, 9);
      expect(slide.z, `pas de ${stride} m`).toBe(0);
      expect(v.head().z, `pas de ${stride} m`).toBe(leaning.z);
      // Vers l'arrière : il recule dès la première image, à pleine allure.
      const back = v.push(0, stride, 3);
      expect(back.x, `pas de ${stride} m`).toBe(0);
      expect(back.z, `pas de ${stride} m`).toBeCloseTo(3 * stride, 9);
    }
  });

  it('la tête bouge sans cesse, comme sur un vrai casque : le visiteur longe quand même le mur à pleine allure', () => {
    const FRAMES = 90;
    const stride = 1.8 / FRAMES;
    /** La tête oscille de 2 cm autour de sa place, dans les deux directions. */
    const sway = (frame: number) => ({ x: 0.02 * Math.sin((2 * Math.PI * 0.4 * frame) / FRAMES), z: 0.02 * Math.sin((2 * Math.PI * 0.55 * frame) / FRAMES + 1) });
    const v = headset(hall, 0, -1.4);
    let old = { x: 0, z: -1.4 }; // le même visiteur avec l'ancienne règle, qui partait de la tête
    let last = { x: 0, z: 0 };
    let frame = 0;
    /** Joue des images, joystick poussé, et compte celles où il est resté sans effet : avec le point d'appui, puis avec l'ancienne règle. */
    const play = (dx: number, dz: number, seconds: number) => {
      const idle = { now: 0, before: 0 };
      for (let i = 0; i < seconds * FRAMES; i++) {
        const now = sway(++frame);
        v.move(now.x - last.x, now.z - last.z);
        last = now;
        const step = v.push(dx, dz, 1);
        if (!step.x && !step.z) idle.now++;
        const to = allOrNothing(hall, old.x + now.x, old.z + now.z, dx, dz);
        if (to.x === old.x + now.x && to.z === old.z + now.z) idle.before++;
        old = { x: to.x - now.x, z: to.z - now.z };
      }
      return idle;
    };
    // Trois secondes vers le mur nord, puis deux secondes le long du mur, vers l'ouest (du côté sans porte).
    play(0, -stride, 3);
    const from = v.rig().x;
    const idle = play(-stride, 0, 2);
    expect(idle.now).toBe(0);
    expect(v.rig().x - from).toBeCloseTo(-3.6, 9);
    // Avec l'ancienne règle, la tête repassait la limite à chaque oscillation : le joystick restait sans effet une image sur deux au moins.
    expect(idle.before).toBeGreaterThan(FRAMES);
  });

  it('penché, le visiteur fait un vrai pas de côté : le point d’appui suit, et le joystick ne lui fait pas passer le mur voisin', () => {
    for (const stride of HEADSET_STRIDES) {
      const v = headset(hall, -3, -3.5);
      v.push(0, -stride, Math.ceil(1 / stride));
      v.move(0, -0.1);
      // Un mètre de vrais pas vers l'ouest, toujours penché au-delà du mur nord.
      for (let i = 0; i < 50; i++) v.move(-0.02, 0);
      expect(v.support().x, `pas de ${stride} m`).toBeCloseTo(v.head().x, 9);
      // Joystick vers l'ouest jusqu'à l'arrêt : c'est sa tête qui s'arrête devant le mur ouest, pas un point resté un mètre derrière elle.
      v.push(-stride, 0, Math.ceil(3 / stride));
      expect(v.head().x, `pas de ${stride} m`).toBeGreaterThanOrEqual(WEST_LIMIT);
      expect(v.head().x, `pas de ${stride} m`).toBeLessThan(WEST_LIMIT + MAX_STEP);
    }
  });

  it('entré en casque la tête déjà au-delà d’un mur, le visiteur s’appuie là où il se tenait', () => {
    // Il se tenait au ras du mur nord ; le casque le voit 30 cm plus loin, dans la zone interdite.
    const v = headset(hall, -3, NORTH_LIMIT);
    v.move(0.1, -0.3);
    expect(v.support().x).toBeCloseTo(-2.9, 9);
    expect(v.support().z).toBe(NORTH_LIMIT);
    expect(v.push(0.02, 0, 10).x).toBeCloseTo(0.2, 9);
    expect(v.push(0, -0.02, 10)).toEqual({ x: 0, z: 0 });
  });

  it('après une téléportation, le visiteur s’appuie au point visé', () => {
    const v = headset(hall, 0, -3.5);
    v.push(0, -0.02, 60);
    v.move(0, -0.3);
    // Tête au-delà du mur nord, il vise le sol au milieu du hall.
    v.teleport(2, 1);
    expect(v.support()).toEqual({ x: 2, z: 1 });
    v.frame(0, 0);
    expect(v.head().x).toBeCloseTo(2, 9);
    expect(v.head().z).toBeCloseTo(1, 9);
    expect(v.support()).toEqual(v.head());
    expect(v.push(0, 0.02, 10).z).toBeCloseTo(0.2, 9);
  });

  it('un mur traversé en marchant pour de bon : le joystick n’y pousse pas, puis le visiteur est dans la salle voisine', () => {
    const v = headset(hall, 0, -3.52);
    // De vrais pas vers le nord, loin de la porte : la tête passe la limite du hall, puis toute l'épaisseur du mur.
    let inWall = 0;
    for (;;) {
      v.move(0, -0.05);
      const head = v.head();
      if (hall(head.x, head.z)) {
        if (head.z < NORTH_LIMIT) break;
        continue;
      }
      inWall++;
      expect(v.support().z, `tête en z = ${head.z}`).toBeGreaterThanOrEqual(NORTH_LIMIT);
      expect(v.support().z, `tête en z = ${head.z}`).toBeLessThan(NORTH_LIMIT + 2 * PRECISION);
      // Dans le mur, le joystick ne l'enfonce pas vers le cabinet, mais répond encore le long du mur.
      expect(v.push(0, -0.02, 5), `tête en z = ${head.z}`).toEqual({ x: 0, z: 0 });
      expect(v.push(0.02, 0, 5).x, `tête en z = ${head.z}`).toBeCloseTo(0.1, 9);
    }
    // Entre les deux salles, 1,20 m ne sont pas praticables : l'épaisseur du mur et la marge gardée de chaque côté.
    expect(inWall).toBe(24);
    // Sa tête est maintenant dans le cabinet. Il s'y appuie, et le joystick l'y promène.
    expect(layout.roomAt(v.head().x, v.head().z)!.id).toBe('cabinet');
    expect(v.head().z).toBeLessThanOrEqual(CABINET_LIMIT);
    expect(v.support()).toEqual(v.head());
    expect(v.push(0, -0.02, 50).z).toBeCloseTo(-1, 9);
    // De retour vers le hall au joystick, c'est le mur du cabinet qui l'arrête.
    v.push(0, 0.02, 200);
    expect(v.head().z).toBeLessThanOrEqual(CABINET_LIMIT);
    expect(v.head().z).toBeGreaterThan(CABINET_LIMIT - MAX_STEP);
  });

  it('entré en casque depuis un endroit non praticable, le visiteur garde l’ancienne règle jusqu’à en sortir', () => {
    // Dans l'épaisseur du mur nord, à 30 cm de la limite du hall.
    const v = headset(hall, 0, -4.2);
    v.frame(0, 0);
    expect(v.support()).toEqual({ x: 0, z: -4.2 });
    // À petits pas, rien ne bouge ; un grand pas le ramène dans le hall.
    expect(v.push(0, 0.02, 20)).toEqual({ x: 0, z: 0 });
    expect(v.push(0.02, 0, 20)).toEqual({ x: 0, z: 0 });
    expect(v.push(0, 0.4, 1).z).toBeCloseTo(0.4, 9);
    // Il a maintenant un point d'appui : s'il se penche de nouveau au-delà du mur, le joystick répond.
    v.move(0, -0.2);
    expect(hall(v.head().x, v.head().z)).toBe(false);
    expect(v.push(0.02, 0, 10).x).toBeCloseTo(0.2, 9);
  });

  it('ne quitte jamais la zone praticable, quoi que fassent la tête et le joystick', () => {
    const next = random(5);
    const v = headset(furnished, 0, 2.5);
    let offset = { x: 0, z: 0 };
    let outside = 0;
    let moved = 0;
    const visited = new Set<string>();
    for (let i = 0; i < 30000; i++) {
      // La tête : de petits mouvements, et de temps en temps un grand pas réel, à travers un mur ou un meuble s'il le faut.
      // Elle reste à moins de 1,50 m du centre de la pièce réelle.
      const reach = next() < 0.02 ? 1.5 : 0.04;
      const to = { x: Math.max(-1.5, Math.min(1.5, offset.x + (next() - 0.5) * reach)), z: Math.max(-1.5, Math.min(1.5, offset.z + (next() - 0.5) * reach)) };
      const before = v.support();
      v.move(to.x - offset.x, to.z - offset.z);
      offset = to;
      const head = v.head();
      const support = v.support();
      expect(furnished(support.x, support.z), `image ${i}, appui en (${support.x} ; ${support.z})`).toBe(true);
      if (furnished(head.x, head.z)) {
        expect(support).toEqual(head);
      } else {
        outside++;
        // Le long de chaque axe, le point d'appui s'est rapproché de la tête, sans la dépasser.
        expect((support.x - before.x) * Math.sign(head.x - before.x)).toBeGreaterThanOrEqual(0);
        expect((support.z - before.z) * Math.sign(head.z - before.z)).toBeGreaterThanOrEqual(0);
        expect(Math.abs(support.x - before.x)).toBeLessThanOrEqual(Math.abs(head.x - before.x) + 1e-12);
        expect(Math.abs(support.z - before.z)).toBeLessThanOrEqual(Math.abs(head.z - before.z) + 1e-12);
      }
      // Le joystick : une direction qui tourne peu à peu, des images de toutes durées.
      const angle = i / 700 + next();
      const length = [0.18, 0.05, 0.02, 0.0125][Math.floor(next() * 4)];
      const step = v.push(Math.cos(angle) * length, Math.sin(angle) * length, 1);
      const after = v.support();
      expect(furnished(after.x, after.z), `image ${i}, appui en (${after.x} ; ${after.z})`).toBe(true);
      // La tête s'est déplacée d'autant que le point d'appui : elle a gardé son écart.
      expect(v.head().x - after.x).toBeCloseTo(head.x - support.x, 9);
      expect(v.head().z - after.z).toBeCloseTo(head.z - support.z, 9);
      if (step.x || step.z) moved++;
      visited.add(layout.roomAt(after.x, after.z)!.id);
    }
    // La promenade a bien éprouvé la règle : des milliers d'images la tête hors zone, et les quatre salles visitées.
    expect(outside).toBeGreaterThan(3000);
    expect(moved).toBeGreaterThan(10000);
    expect([...visited].sort()).toEqual(['cabinet', 'galerie', 'hall', 'rotonde']);
  });
});

describe('robustesse', () => {
  it('ne quitte jamais la zone de marche, ne recule jamais et ne dépasse jamais le déplacement demandé', () => {
    for (const flush of [true, false]) {
      const next = random(flush ? 2 : 3);
      let p = { x: 0, z: 2.5 };
      let angle = 0;
      let hindered = 0;
      const visited = new Set<string>();
      for (let i = 0; i < 30000; i++) {
        // Le visiteur tourne un peu à chaque image, et la durée des images varie beaucoup.
        angle += (next() - 0.5) * 0.8;
        const length = [0.24, 0.1, 0.04, 0.0024][Math.floor(next() * 4)] * (0.5 + next());
        const dx = Math.cos(angle) * length;
        const dz = Math.sin(angle) * length;
        const to = advance(furnished, p.x, p.z, dx, dz, { flush });
        expect(furnished(to.x, to.z), `image ${i}, en (${to.x} ; ${to.z})`).toBe(true);
        // Le long de chaque axe : dans le sens demandé, et pas plus loin que demandé.
        expect((to.x - p.x) * Math.sign(dx)).toBeGreaterThanOrEqual(0);
        expect((to.z - p.z) * Math.sign(dz)).toBeGreaterThanOrEqual(0);
        expect(Math.abs(to.x - p.x)).toBeLessThanOrEqual(Math.abs(dx) + 1e-12);
        expect(Math.abs(to.z - p.z)).toBeLessThanOrEqual(Math.abs(dz) + 1e-12);
        if (Math.abs(to.x - p.x - dx) > 1e-12 || Math.abs(to.z - p.z - dz) > 1e-12) hindered++;
        p = to;
        visited.add(layout.roomAt(p.x, p.z)!.id);
      }
      // La promenade a bien éprouvé la règle : des milliers de pas gênés, et les quatre salles visitées par leurs portes.
      const mode = flush ? 'au ras' : 'par petits pas';
      expect(hindered, mode).toBeGreaterThan(5000);
      expect([...visited].sort(), mode).toEqual(['cabinet', 'galerie', 'hall', 'rotonde']);
    }
  });

  it('parti d’un endroit non praticable, le visiteur n’avance que vers un endroit praticable', () => {
    // Deux centimètres au-delà de la limite ouest (en casque, le visiteur s'est penché vers le mur).
    const x = WEST_LIMIT - 0.02;
    for (const flush of [true, false]) {
      // Le long du mur ou vers lui : rien ne bouge.
      expect(advance(hall, x, 3, 0, 0.04, { flush })).toEqual({ x, z: 3 });
      expect(advance(hall, x, 3, -0.04, 0.04, { flush })).toEqual({ x, z: 3 });
      // En s'écartant du mur d'un pas suffisant : le visiteur revient en zone praticable.
      const back = advance(hall, x, 3, 0.04, 0, { flush });
      expect(back.x).toBeCloseTo(WEST_LIMIT + 0.02, 9);
    }
  });

  it('parti d’un endroit non praticable, applique exactement l’ancienne règle, même pour un grand pas', () => {
    // Un grand pas (image lente) garde ainsi toutes ses chances de ramener le visiteur en zone praticable.
    const next = random(4);
    let rescued = 0;
    let tried = 0;
    for (let i = 0; i < 40000; i++) {
      const x = -16 + 31 * next();
      const z = -13 + 20 * next();
      if (furnished(x, z)) continue;
      tried++;
      const angle = 2 * Math.PI * next();
      const length = 0.24 * next();
      const dx = Math.cos(angle) * length;
      const dz = Math.sin(angle) * length;
      const expected = allOrNothing(furnished, x, z, dx, dz);
      for (const flush of [true, false]) expect(advance(furnished, x, z, dx, dz, { flush })).toEqual(expected);
      if (expected.x !== x || expected.z !== z) rescued++;
    }
    // Le tirage a couvert des milliers de départs hors zone, dont une part ramenée en zone praticable.
    expect(tried).toBeGreaterThan(10000);
    expect(rescued).toBeGreaterThan(300);
  });
});

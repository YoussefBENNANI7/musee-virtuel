import { describe, expect, it } from 'vitest';
import { advance, MAX_STEP, PRECISION, type Walkable } from '../../src/engine/marche';
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

/*
 * Règle de marche : comment le visiteur avance, s'arrête devant un obstacle et glisse le long d'un mur.
 * Elle sert au clavier, à la manette virtuelle et au casque. Ce module ne dessine rien et ne dépend pas
 * du navigateur : il se teste seul.
 */

/** Le visiteur peut-il se tenir en ce point ? */
export type Walkable = (x: number, z: number) => boolean;

/**
 * Longueur maximale d'un petit pas, en mètres. Le déplacement d'une image est découpé en petits pas :
 * à 60 images par seconde il tient en un seul, sur un appareil lent il en faut jusqu'à cinq.
 */
export const MAX_STEP = 0.05;
/** Précision de l'arrêt au ras d'un obstacle, en mètres : un millième de millimètre. */
export const PRECISION = 1e-6;

/**
 * Avance le visiteur de (dx, dz) depuis (x, z) et renvoie l'endroit où il arrive.
 *
 * Le trajet est découpé en petits pas égaux, pour que le résultat ne dépende pas de la durée des images.
 * Tant que rien ne gêne, chaque petit pas est fait en entier. Devant un obstacle, le visiteur avance
 * le long de chaque axe séparément, aussi loin que possible : il vient au ras de l'obstacle, puis glisse
 * le long au lieu de s'arrêter net. Parti d'un endroit praticable, il n'en sort jamais.
 *
 * Parti d'un endroit non praticable, il fait le déplacement d'un bloc ou pas du tout, le long des deux axes
 * puis de chacun : un grand pas a ainsi plus de chances de le ramener en zone praticable. Ce cas ne devrait
 * plus se présenter : un déplacement en douceur interrompu ne laisse plus le visiteur en pareil endroit
 * (voir `firstWalkable`), et en casque la règle part de son point d'appui (voir `follow`).
 */
export function advance(walkable: Walkable, x: number, z: number, dx: number, dz: number): { x: number; z: number } {
  const inside = walkable(x, z);
  const precision = inside ? PRECISION : Infinity;
  const steps = inside ? Math.ceil(Math.hypot(dx, dz) / MAX_STEP) : 1;
  const sx = dx / steps;
  const sz = dz / steps;
  for (let i = 0; i < steps; i++) {
    if (walkable(x + sx, z + sz)) {
      x += sx;
      z += sz;
      continue;
    }
    const fromX = x;
    const fromZ = z;
    // Ce qu'il reste du petit pas le long de chaque axe. Deux tours : avancer le long d'un axe
    // peut dégager l'autre, par exemple en contournant un socle rond ou en arrivant devant une porte.
    let restX = sx;
    let restZ = sz;
    for (let turn = 0; turn < 2; turn++) {
      const partX = freePart(walkable, x, z, restX, 0, precision);
      x += restX * partX;
      restX -= restX * partX;
      const partZ = freePart(walkable, x, z, 0, restZ, precision);
      z += restZ * partZ;
      restZ -= restZ * partZ;
    }
    // Arrêté sur place : les petits pas suivants le seraient aussi.
    if (x === fromX && z === fromZ) break;
  }
  return { x, z };
}

/**
 * Point d'appui d'un visiteur en casque : l'endroit du musée où il est tenu pour debout.
 *
 * En casque, la tête va où le visiteur la porte. Il se penche pour regarder une œuvre de près, il fait
 * un pas de côté : rien ne l'empêche de passer la limite de marche. Si la règle de marche partait de sa
 * tête, le joystick ne répondrait plus dès qu'elle a passé cette limite. Elle part donc de son point
 * d'appui, qui ne quitte jamais la zone praticable :
 * - tant que la tête est en zone praticable, le point d'appui est la tête ;
 * - quand elle en sort, il la suit à pied, selon la règle de marche : il s'arrête au ras de la limite
 *   qu'elle a passée et la longe à mesure qu'elle se déplace, pour rester au plus près d'elle ;
 * - quand elle revient en zone praticable, même ailleurs (le visiteur a traversé un mur en marchant
 *   pour de bon), il la rejoint.
 * Le joystick déplace le point d'appui avec `advance`, et le visiteur d'autant. Sa tête garde ainsi son
 * écart au point d'appui : poussée vers l'obstacle, elle ne s'y enfonce pas davantage.
 *
 * (x, z) est le point d'appui à l'image précédente, (headX, headZ) l'endroit où se trouve la tête ;
 * la fonction renvoie le nouveau point d'appui. Sans point d'appui praticable (visiteur entré en casque
 * depuis un endroit qui ne l'est pas), elle renvoie la tête : la règle de marche part alors de la tête,
 * comme hors du casque.
 */
export function follow(walkable: Walkable, x: number, z: number, headX: number, headZ: number): { x: number; z: number } {
  if (walkable(headX, headZ) || !walkable(x, z)) return { x: headX, z: headZ };
  return advance(walkable, x, z, headX - x, headZ - z);
}

/**
 * Part du déplacement (dx, dz), de 0 à 1, que le visiteur peut faire depuis (x, z) : 1 si l'arrivée est
 * praticable, sinon la plus grande part praticable, cherchée par dichotomie à `precision` mètres près.
 */
function freePart(walkable: Walkable, x: number, z: number, dx: number, dz: number, precision: number): number {
  const length = Math.hypot(dx, dz);
  if (length === 0) return 0;
  if (walkable(x + dx, z + dz)) return 1;
  // Déjà au ras de l'obstacle : même le plus petit déplacement qui compte ne passe pas.
  let free = precision / length;
  if (free >= 1 || !walkable(x + dx * free, z + dz * free)) return 0;
  let closed = 1;
  while ((closed - free) * length > precision) {
    const middle = (free + closed) / 2;
    if (walkable(x + dx * middle, z + dz * middle)) free = middle;
    else closed = middle;
  }
  return free;
}

/**
 * Premier endroit praticable sur le trajet en ligne droite de (x, z) à (toX, toZ), arrivée comprise :
 * le départ s'il est praticable, `null` si rien ne l'est sur tout le trajet.
 *
 * Sert à dégager le visiteur qu'un déplacement en douceur interrompu laisserait dans l'épaisseur d'un mur
 * ou dans la zone d'un banc ou d'un socle. Le trajet est parcouru par petits pas, puis la limite est
 * cherchée par dichotomie : l'endroit renvoyé est au ras de l'obstacle, du côté praticable.
 */
export function firstWalkable(walkable: Walkable, x: number, z: number, toX: number, toZ: number): { x: number; z: number } | null {
  if (walkable(x, z)) return { x, z };
  const length = Math.hypot(toX - x, toZ - z);
  const steps = Math.ceil(length / MAX_STEP);
  // L'arrivée est prise telle quelle : recalculée, elle pourrait tomber un cheveu à côté d'une limite.
  const at = (part: number) => (part === 1 ? { x: toX, z: toZ } : { x: x + (toX - x) * part, z: z + (toZ - z) * part });
  for (let i = 1; i <= steps; i++) {
    let free = i / steps;
    let spot = at(free);
    if (!walkable(spot.x, spot.z)) continue;
    let closed = (i - 1) / steps;
    while ((free - closed) * length > PRECISION) {
      const middle = (free + closed) / 2;
      const candidate = at(middle);
      if (walkable(candidate.x, candidate.z)) {
        free = middle;
        spot = candidate;
      } else {
        closed = middle;
      }
    }
    return spot;
  }
  return null;
}

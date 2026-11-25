import * as THREE from 'three';
import { objectLight, type Decor } from './decors';
import { groundShadow } from './furniture';
import { SUN_AZIMUTH } from './lighting';
import type { Quality } from './quality';
import { rng } from './textures';
import type { RoomConfig } from './types';

/**
 * Fontaine de patio, dans l'esprit des riads et des médersas : un bassin bas en étoile à huit branches,
 * paré de zellige et coiffé d'une margelle de marbre ; au centre, une vasque à godrons sur son balustre.
 * Un petit jet s'élève de la vasque et y retombe ; la vasque déborde par la pointe de ses douze lobes,
 * en douze filets qui rident la surface du bassin. L'eau laisse voir le fond carrelé, reflète la verrière
 * et scintille au soleil.
 *
 * L'eau bouge : la visite redessine l'image tant que la fontaine est en vue (voir `Fountain.flow`).
 * Pour qui a demandé moins d'animations, ou sur un appareil modeste, elle reste immobile.
 */

/** Rayon au sol de la fontaine, pointes de l'étoile de la margelle comprises. */
export const FOUNTAIN_RADIUS = 1.3;

/** Rapport entre les creux et les pointes d'une étoile faite de deux carrés croisés. */
export const STAR_INNER = Math.cos(Math.PI / 4) / Math.cos(Math.PI / 8);

/**
 * Rayon d'une étoile dont les côtés sont en retrait de `d` mètres sur ceux de l'étoile de la margelle.
 * Les côtés d'une telle étoile sont ceux de deux carrés : les écarter de d éloigne leurs pointes de d·√2.
 */
export const starRadius = (d: number): number => FOUNTAIN_RADIUS - d * Math.SQRT2;

/** Mesures du bassin et de la vasque, en mètres depuis le sol. */
export const BASIN = {
  /** Dessus de la margelle. */
  rim: 0.46,
  /** Épaisseur de la margelle, et son arrondi. */
  rimThickness: 0.064,
  bevel: 0.012,
  /** Retrait des parois de zellige sous la margelle, côté extérieur. */
  outer: 0.03,
  /** Retrait de la paroi intérieure du bassin : la margelle fait 15 cm de large. */
  inner: 0.15,
  /** La margelle déborde aussi un peu au-dessus de l'eau. */
  lip: 0.015,
  /** Surface de l'eau, et fond du bassin. */
  water: 0.385,
  floor: 0.12,
};

/** Vasque : nombre de lobes, eau, bord, et point le plus haut du jet. */
export const BOWL = { lobes: 12, water: 0.992, lip: 1.0, jet: 0.175 };

/** Contour d'une étoile à huit branches de rayon `radius` (ses pointes), dans le plan (x, y) : seize sommets, en partant d'une pointe. */
export function starOutline(radius: number): THREE.Vector2[] {
  return Array.from({ length: 16 }, (_, i) => {
    const d = i % 2 ? radius * STAR_INNER : radius;
    return new THREE.Vector2(Math.cos((i * Math.PI) / 8) * d, Math.sin((i * Math.PI) / 8) * d);
  });
}

/**
 * Parois verticales le long d'un contour fermé (x, y du contour = x, z du monde), de `y0` à `y1`.
 * Chaque côté a ses propres sommets : les arêtes restent vives. En largeur, chaque côté porte `repeats`
 * motifs entiers, si bien que le dessin tombe juste à chaque angle ; en hauteur, v va de 0 à `v1`.
 * `inward` : les faces regardent vers le centre (paroi intérieure du bassin).
 */
export function sideWalls(outline: THREE.Vector2[], y0: number, y1: number, repeats: number, v1: number, inward: boolean): THREE.BufferGeometry {
  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];
  const index: number[] = [];
  outline.forEach((a, i) => {
    const b = outline[(i + 1) % outline.length];
    // Normale horizontale du côté, tournée vers l'extérieur, puis retournée au besoin.
    const n = new THREE.Vector2(b.y - a.y, a.x - b.x).normalize();
    if (n.dot(a.clone().add(b)) < 0) n.negate();
    if (inward) n.negate();
    const k = positions.length / 3;
    for (const [p, u, y, v] of [
      [a, 0, y0, 0],
      [b, repeats, y0, 0],
      [b, repeats, y1, v1],
      [a, 0, y1, v1],
    ] as const) {
      positions.push(p.x, y, p.y);
      normals.push(n.x, 0, n.y);
      uvs.push(u, v);
    }
    // Sens des triangles : celui qui donne la normale voulue.
    const e1 = new THREE.Vector3(b.x - a.x, 0, b.y - a.y);
    const e2 = new THREE.Vector3(0, y1 - y0, 0);
    const front = e1.cross(e2).dot(new THREE.Vector3(n.x, 0, n.y)) > 0;
    index.push(...(front ? [k, k + 1, k + 2, k, k + 2, k + 3] : [k, k + 2, k + 1, k, k + 3, k + 2]));
  });
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(index);
  return geometry;
}

/** Relief d'un godron, entre 0 (au fond de la cannelure) et 1 (au sommet du lobe). Sommets aux angles 2πk/lobes. */
export const lobe = (theta: number, lobes: number): number => Math.abs(Math.cos((lobes * theta) / 2)) ** 0.6;
/** Valeur moyenne de `lobe` : les godrons gonflent ou creusent autour du rayon donné, sans changer la taille d'ensemble. */
const LOBE_MEAN = 0.75;

/** Point d'un profil de révolution : rayon, hauteur, et force des godrons en ce point (0 : surface lisse). */
export type ProfilePoint = [radius: number, y: number, amplitude: number];

/**
 * Corps de révolution autour de l'axe vertical, à godrons : le rayon de chaque point du profil se gonfle
 * en `lobes` côtes régulières selon son amplitude. Le profil est donné en morceaux : les sommets ne sont
 * partagés qu'à l'intérieur d'un morceau, si bien que les arêtes entre deux morceaux restent vives.
 * L'angle θ se compte comme pour `THREE.LatheGeometry` (x = r·sin θ, z = r·cos θ). Le tour se referme
 * sur ses premiers sommets, sans couture.
 */
export function lobedLathe(pieces: ProfilePoint[][], lobes: number, segments: number): THREE.BufferGeometry {
  const positions: number[] = [];
  const index: number[] = [];
  for (const piece of pieces) {
    const start = positions.length / 3;
    for (const [r, y, amp] of piece) {
      for (let j = 0; j < segments; j++) {
        const theta = (j / segments) * Math.PI * 2;
        const radius = r * (1 + amp * (lobe(theta, lobes) - LOBE_MEAN));
        positions.push(Math.sin(theta) * radius, y, Math.cos(theta) * radius);
      }
    }
    for (let k = 0; k < piece.length - 1; k++) {
      for (let j = 0; j < segments; j++) {
        const a = start + k * segments + j;
        const b = start + k * segments + ((j + 1) % segments);
        const c = a + segments;
        const d = b + segments;
        index.push(a, b, c, b, d, c);
      }
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(index);
  geometry.computeVertexNormals();
  return geometry;
}

/** Contour (plan x, y) d'une surface d'eau à godrons, de rayon moyen `radius`. Même sens d'angle que `lobedLathe`. */
function lobedOutline(radius: number, amp: number, lobes: number, segments: number): THREE.Vector2[] {
  return Array.from({ length: segments }, (_, j) => {
    const theta = (j / segments) * Math.PI * 2;
    const r = radius * (1 + amp * (lobe(theta, lobes) - LOBE_MEAN));
    // La forme est posée à plat par une rotation de -90° autour de x : le y du plan devient -z.
    return new THREE.Vector2(Math.sin(theta) * r, -Math.cos(theta) * r);
  });
}

/** Profil de la vasque : dessous, bord, puis creux. */
const BOWL_PROFILE: ProfilePoint[][] = [
  [
    [0.1, 0.8, 0],
    [0.18, 0.815, 0.03],
    [0.28, 0.842, 0.06],
    [0.38, 0.882, 0.08],
    [0.46, 0.928, 0.085],
    [0.51, 0.968, 0.085],
    [0.525, 0.99, 0.08],
  ],
  [
    [0.525, 0.99, 0.08],
    [0.522, 0.997, 0.08],
    [0.512, 1.0, 0.08],
    [0.497, 0.996, 0.08],
  ],
  [
    [0.497, 0.996, 0.08],
    [0.47, 0.962, 0.07],
    [0.4, 0.927, 0.05],
    [0.28, 0.897, 0.02],
    [0.12, 0.882, 0],
    [0.001, 0.878, 0],
  ],
];

/** Balustre qui porte la vasque, posé sur un socle à huit pans au fond du bassin. */
const PEDESTAL_PROFILE: ProfilePoint[][] = [
  [
    [0.15, 0.262, 0],
    [0.15, 0.29, 0],
    [0.135, 0.302, 0],
    [0.12, 0.325, 0],
  ],
  [
    [0.12, 0.325, 0],
    [0.1, 0.36, 0],
    [0.086, 0.42, 0],
    [0.08, 0.5, 0],
    [0.092, 0.522, 0],
  ],
  [
    [0.092, 0.522, 0],
    [0.104, 0.535, 0],
    [0.104, 0.552, 0],
    [0.088, 0.565, 0],
  ],
  [
    [0.088, 0.565, 0],
    [0.072, 0.6, 0],
    [0.068, 0.66, 0],
    [0.075, 0.72, 0],
    [0.092, 0.758, 0],
    [0.115, 0.785, 0],
    [0.1, 0.802, 0],
  ],
];

/** Rayon de la pointe d'un lobe, au bord de la vasque : c'est de là que l'eau déborde. */
const LIP_TIP = BOWL_PROFILE[0][BOWL_PROFILE[0].length - 1][0] * (1 + 0.08 * (1 - LOBE_MEAN));

/** Trajectoire de l'eau qui déborde : elle quitte le bord à `SPILL_SPEED` m/s, puis tombe. */
const SPILL_SPEED = 0.25;
const fallTime = (drop: number) => Math.sqrt((2 * drop) / 9.81);
/** Rayon auquel les filets de la vasque touchent l'eau du bassin. */
export const SPILL_LANDING = LIP_TIP + 0.004 + SPILL_SPEED * fallTime(BOWL.lip - BASIN.water);

/** Profil (rayon, hauteur) d'un filet qui déborde de la vasque jusqu'au bassin. */
export function spillProfile(): THREE.Vector2[] {
  const t1 = fallTime(BOWL.lip - BASIN.water);
  const points = [new THREE.Vector2(LIP_TIP - 0.01, BOWL.lip + 0.003)];
  for (let i = 0; i <= 10; i++) {
    const t = (t1 * i) / 10;
    points.push(new THREE.Vector2(LIP_TIP + 0.004 + SPILL_SPEED * t, BOWL.lip - 4.905 * t * t));
  }
  return points;
}

/**
 * Margelle : une étoile évidée, extrudée, aux arêtes arrondies. L'arrondi élargit la forme de son épaisseur
 * de tous côtés : le contour dessiné est donc en retrait d'autant, et la margelle finie touche juste
 * le rayon de la fontaine. Elle déborde de 3 cm sur le zellige et de 1,5 cm au-dessus de l'eau.
 */
export function rimGeometry(): THREE.BufferGeometry {
  const shape = new THREE.Shape(starOutline(starRadius(BASIN.bevel)));
  shape.holes.push(new THREE.Path(starOutline(starRadius(BASIN.inner + BASIN.lip - BASIN.bevel)).reverse()));
  const depth = BASIN.rimThickness - BASIN.bevel * 2;
  const geometry = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: true, bevelThickness: BASIN.bevel, bevelSize: BASIN.bevel, bevelSegments: 3, curveSegments: 1 });
  // Posée à plat : l'épaisseur devient la hauteur, et le dessus affleure à la hauteur de la margelle.
  geometry.rotateX(-Math.PI / 2);
  geometry.translate(0, BASIN.rim - BASIN.bevel - depth, 0);
  return geometry;
}

// --- Textures ---------------------------------------------------------------

function canvas(w: number, h: number) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return { c, g: c.getContext('2d')! };
}

function texture(c: HTMLCanvasElement, quality: Quality, repeatT: boolean): THREE.Texture {
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = repeatT ? THREE.RepeatWrapping : THREE.ClampToEdgeWrapping;
  tex.anisotropy = quality.anisotropy;
  return tex;
}

/** Étoile à huit branches centrée en (x, y), de rayon r, sur le canvas. */
function starPath(g: CanvasRenderingContext2D, x: number, y: number, r: number) {
  g.beginPath();
  starOutline(r).forEach((p, i) => g[i ? 'lineTo' : 'moveTo'](x + p.x, y + p.y));
  g.closePath();
}

/** Émail irrégulier : chaque carreau est taillé et cuit à la main. */
function glaze(g: CanvasRenderingContext2D, w: number, h: number, seed: number) {
  const r = rng(seed);
  for (let i = 0; i < (w * h) / 40; i++) {
    g.fillStyle = r() > 0.5 ? '#ffffff' : '#000000';
    g.globalAlpha = 0.02 + r() * 0.05;
    g.fillRect(r() * w, r() * h, 2, 2);
  }
  g.globalAlpha = 1;
}

const TILE = {
  white: '#f1ead9',
  green: '#1f6b55',
  deep: '#1b5546',
  blue: '#1f4f8a',
  ochre: '#c8902f',
  black: '#1c2a26',
  joint: '#e9e1cf',
  turquoise: '#2f8f8b',
  turquoise2: '#3c9f98',
};

/**
 * Zellige des parois extérieures, sur toute leur hauteur et la largeur d'un motif. De bas en haut :
 * une plinthe sombre, une frise de dents de scie, un champ d'étoiles sur fond vert profond (trois rangs,
 * deux étoiles par motif), puis la même frise renversée. Les couleurs sont celles des murs, mais le fond
 * est sombre : la fontaine se détache du soubassement au lieu de s'y fondre.
 */
function basinTiles(width: number, height: number, quality: Quality): THREE.Texture {
  const W = quality.textureSize / 2;
  const k = W / width;
  const H = Math.round(height * k);
  const { c, g } = canvas(W, H);
  /** Hauteur depuis le sol (m) → ordonnée sur le canvas. */
  const Y = (y: number) => (height - y) * k;
  const band = (y0: number, y1: number, color: string) => {
    g.fillStyle = color;
    g.fillRect(0, Y(y1), W, Y(y0) - Y(y1));
  };
  const cell = width / 2;
  const field0 = 0.091;
  const field1 = field0 + cell * 3;
  const joint = Math.max(1, k * 0.0035);
  g.lineJoin = 'miter';
  g.strokeStyle = TILE.joint;
  g.lineWidth = joint;
  band(0, height, TILE.white);
  band(0, 0.045, TILE.black);
  band(height - 0.012, height, TILE.black);
  // Frises de dents de scie : quatre dents par motif, pointées vers le champ.
  const teeth = (y0: number, y1: number, up: boolean) => {
    const n = 4;
    for (let i = 0; i < n; i++) {
      const x0 = (i * W) / n;
      const x1 = ((i + 1) * W) / n;
      g.beginPath();
      g.moveTo(x0, Y(up ? y0 : y1));
      g.lineTo(x1, Y(up ? y0 : y1));
      g.lineTo((x0 + x1) / 2, Y(up ? y1 : y0));
      g.closePath();
      g.fillStyle = TILE.green;
      g.fill();
      g.stroke();
    }
  };
  teeth(0.053, 0.083, true);
  teeth(field1 + 0.008, field1 + 0.036, false);
  // Le champ : des étoiles qui se touchent par leurs pointes, et entre elles des croix de fond vert.
  g.save();
  g.beginPath();
  g.rect(0, Y(field1), W, Y(field0) - Y(field1));
  g.clip();
  band(field0, field1, TILE.deep);
  for (let j = 0; j < 3; j++) {
    for (let i = 0; i < 2; i++) {
      const x = (i + 0.5) * cell * k;
      const y = Y(field0 + (j + 0.5) * cell);
      const light = (i + j) % 2 === 0;
      starPath(g, x, y, (cell / 2) * k);
      g.fillStyle = light ? TILE.white : TILE.blue;
      g.fill();
      g.stroke();
      starPath(g, x, y, (cell / 5) * k);
      g.fillStyle = light ? TILE.ochre : TILE.white;
      g.fill();
      g.stroke();
    }
  }
  // Petit carreau sur la pointe au cœur de chaque croix.
  for (let j = 1; j < 3; j++) {
    for (let i = 0; i <= 2; i++) {
      g.save();
      g.translate(i * cell * k, Y(field0 + j * cell));
      g.rotate(Math.PI / 4);
      const s = cell * 0.2 * k;
      g.fillStyle = TILE.ochre;
      g.fillRect(-s / 2, -s / 2, s, s);
      g.strokeRect(-s / 2, -s / 2, s, s);
      g.restore();
    }
  }
  g.restore();
  // Filets de joint entre les registres.
  for (const y of [0.045, 0.053, 0.083, field0, field1, field1 + 0.008, field1 + 0.036, height - 0.012]) {
    g.fillStyle = TILE.joint;
    g.fillRect(0, Y(y) - joint / 2, W, joint);
  }
  glaze(g, W, H, 91);
  return texture(c, quality, false);
}

/** Carreaux de l'intérieur du bassin : un damier de deux turquoises, qui donne sa couleur à l'eau. Deux carreaux par côté. */
function poolTiles(quality: Quality): THREE.Texture {
  const S = quality.textureSize / 4;
  const { c, g } = canvas(S, S);
  for (let j = 0; j < 2; j++) {
    for (let i = 0; i < 2; i++) {
      g.fillStyle = (i + j) % 2 ? TILE.turquoise : TILE.turquoise2;
      g.fillRect((i * S) / 2, (j * S) / 2, S / 2, S / 2);
    }
  }
  g.strokeStyle = TILE.joint;
  g.lineWidth = Math.max(1, S / 64);
  for (let i = 0; i <= 2; i++) {
    g.beginPath();
    g.moveTo((i * S) / 2, 0);
    g.lineTo((i * S) / 2, S);
    g.moveTo(0, (i * S) / 2);
    g.lineTo(S, (i * S) / 2);
    g.stroke();
  }
  glaze(g, S, S, 17);
  return texture(c, quality, true);
}

/**
 * Fond du bassin : une rosace d'étoiles emboîtées, qui reprend la forme du bassin, sur un damier turquoise.
 * La texture couvre le carré de côté 2·`radius` centré sur la fontaine.
 */
function poolFloor(radius: number, quality: Quality): THREE.Texture {
  const S = quality.textureSize;
  const { c, g } = canvas(S, S);
  const k = S / (radius * 2);
  const tile = 0.09 * k;
  for (let y = 0; y < S; y += tile) {
    for (let x = 0; x < S; x += tile) {
      g.fillStyle = (Math.round(x / tile) + Math.round(y / tile)) % 2 ? TILE.turquoise : TILE.turquoise2;
      g.fillRect(x, y, tile, tile);
    }
  }
  g.strokeStyle = TILE.joint;
  g.lineWidth = Math.max(1, S / 300);
  for (let x = 0; x <= S; x += tile) {
    g.beginPath();
    g.moveTo(x, 0);
    g.lineTo(x, S);
    g.moveTo(0, x);
    g.lineTo(S, x);
    g.stroke();
  }
  g.lineJoin = 'miter';
  const rings: [number, string][] = [
    [0.86, TILE.white],
    [0.8, TILE.blue],
    [0.64, TILE.white],
    [0.58, TILE.green],
    [0.44, TILE.white],
    [0.38, TILE.ochre],
    [0.25, TILE.white],
  ];
  for (const [f, color] of rings) {
    starPath(g, S / 2, S / 2, f * radius * k);
    g.fillStyle = color;
    g.fill();
    g.stroke();
  }
  glaze(g, S, S, 23);
  const tex = texture(c, quality, false);
  // Les coordonnées de la forme sont en mètres, depuis le centre.
  tex.repeat.set(1 / (radius * 2), 1 / (radius * 2));
  tex.offset.set(0.5, 0.5);
  return tex;
}

/** Marbre blanc à peine veiné, pour la margelle : une répétition par mètre. */
function marbleTexture(quality: Quality): THREE.Texture {
  const S = quality.textureSize / 2;
  const { c, g } = canvas(S, S);
  const r = rng(7);
  g.fillStyle = '#f3efe6';
  g.fillRect(0, 0, S, S);
  // Nuages très doux, puis quelques veines grises qui serpentent.
  for (let i = 0; i < 40; i++) {
    g.fillStyle = r() > 0.5 ? 'rgba(255,255,255,0.08)' : 'rgba(150,140,120,0.035)';
    g.beginPath();
    g.ellipse(r() * S, r() * S, S * (0.05 + r() * 0.15), S * (0.03 + r() * 0.08), r() * Math.PI, 0, Math.PI * 2);
    g.fill();
  }
  // Chaque veine est tracée deux fois (un halo large et pâle, puis le trait) et répétée sur les bords,
  // pour que le marbre se raccorde d'une répétition à l'autre.
  for (let v = 0; v < 7; v++) {
    const start = [r() * S, r() * S, r() * Math.PI * 2];
    for (const [alpha, width] of [
      [0.05, 4],
      [0.12, 1.5],
    ]) {
      g.strokeStyle = `rgba(120,112,100,${alpha})`;
      g.lineWidth = width * (S / 512);
      for (const dx of [-S, 0, S]) {
        for (const dy of [-S, 0, S]) {
          const turn = rng(100 + v);
          let [x, y, a] = start;
          g.beginPath();
          g.moveTo(x + dx, y + dy);
          for (let s = 0; s < 30; s++) {
            a += (turn() - 0.5) * 0.6;
            x += Math.cos(a) * S * 0.02;
            y += Math.sin(a) * S * 0.02;
            g.lineTo(x + dx, y + dy);
          }
          g.stroke();
        }
      }
    }
  }
  return texture(c, quality, true);
}

// --- Eau ---------------------------------------------------------------------

const WATER_VERTEX = /* glsl */ `
  varying vec3 vWorld;
  void main() {
    vec4 world = modelMatrix * vec4(position, 1.0);
    vWorld = world.xyz;
    gl_Position = projectionMatrix * viewMatrix * world;
  }`;

/**
 * Surface de l'eau. Sa hauteur est une somme de petites vagues, plus les rides qui partent du cercle
 * où l'eau retombe (`ring`). On en tire la pente en chaque point ; la lumière s'y reflète selon la loi
 * de Fresnel : de près et de haut, on voit surtout le fond ; en rasant, surtout le reflet. Le reflet
 * imite la salle : le soubassement de zellige en bas, les murs clairs, le plafond de cèdre, et droit
 * au-dessus la verrière. Le soleil y allume des éclats.
 */
const WATER_FRAGMENT = /* glsl */ `
  uniform float time;
  uniform vec3 center;
  uniform float ring;
  uniform float spots;
  uniform float strength;
  uniform vec3 tint;
  uniform float depth;
  uniform float absorb;
  uniform vec3 sky;
  uniform vec3 wall;
  uniform vec3 dado;
  uniform vec3 ceiling;
  uniform vec3 sunDir;
  uniform vec3 foam;
  varying vec3 vWorld;

  float height(vec2 p) {
    float t = time;
    float h = sin(dot(p, vec2(5.1, 3.7)) + t * 1.3) * 0.5
            + sin(dot(p, vec2(-4.3, 6.2)) + t * 1.7) * 0.35
            + sin(dot(p, vec2(9.7, -6.1)) - t * 2.3) * 0.2
            + sin(dot(p, vec2(-13.1, -9.4)) + t * 2.9) * 0.12;
    h *= 0.0012 * strength;
    // Rides du point de chute : elles s'éloignent du cercle où l'eau retombe, en s'amortissant.
    float d = abs(length(p) - ring);
    h += 0.0016 * strength * sin(d * 70.0 - t * 7.0) * exp(-d * 9.0);
    return h;
  }

  vec3 reflection(vec3 r) {
    float up = r.y;
    vec3 c = mix(dado, wall, smoothstep(0.08, 0.2, up));
    // Les murs ne sont pas unis : œuvres, portes et lanternes y font des taches plus sombres.
    float around = atan(r.x, r.z);
    c *= 0.8 + 0.2 * sin(around * 7.0) * sin(around * 3.0 + 1.0);
    c = mix(c, ceiling, smoothstep(0.68, 0.78, up));
    return mix(c, sky, smoothstep(0.86, 0.92, up));
  }

  float hash(float n) { return fract(sin(n * 127.1) * 43758.5453); }

  void main() {
    vec2 p = vWorld.xz - center.xz;
    float e = 0.004;
    float dx = (height(p + vec2(e, 0.0)) - height(p - vec2(e, 0.0))) / (2.0 * e);
    float dz = (height(p + vec2(0.0, e)) - height(p - vec2(0.0, e))) / (2.0 * e);
    vec3 n = normalize(vec3(-dx, 1.0, -dz));
    vec3 v = normalize(cameraPosition - vWorld);
    float cosi = max(dot(n, v), 0.0);
    float fresnel = 0.035 + 0.965 * pow(1.0 - cosi, 5.0);
    vec3 r = reflect(-v, n);
    vec3 env = reflection(r);
    float glint = pow(max(dot(r, sunDir), 0.0), 400.0) * 3.0;
    // Écume au point de chute : douze taches, une sous chaque filet, ou un anneau sous le jet.
    float a = atan(p.x, p.y);
    float dr = length(p) - ring;
    float froth;
    if (spots > 0.0) {
      float pitch = 6.2831853 / spots;
      float k = floor(a / pitch + 0.5);
      float arc = (a - k * pitch) * ring;
      float d = length(vec2(arc, dr));
      froth = smoothstep(0.05, 0.0, d) * (0.55 + 0.45 * sin(time * 11.0 + hash(k) * 6.28));
    } else {
      froth = smoothstep(0.022, 0.0, abs(dr)) * (0.6 + 0.4 * sin(time * 13.0 + a * 5.0));
    }
    froth *= 0.75;
    // Couleur de l'eau : plus le chemin de la lumière jusqu'au fond est long, plus elle cache le fond.
    // Ce chemin s'allonge quand on regarde en biais, moins qu'on ne croirait : l'eau redresse les rayons.
    float sinT = sqrt(max(1.0 - v.y * v.y, 0.0)) / 1.33;
    float path = depth / sqrt(1.0 - sinT * sinT);
    float body = (1.0 - exp(-path * absorb)) * (1.0 - fresnel);
    float alpha = clamp(body + fresnel + glint + froth, 0.0, 1.0);
    vec3 color = (tint * body + env * fresnel + vec3(glint) + foam * froth) / max(alpha, 0.001);
    gl_FragColor = vec4(color, alpha);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }`;

const FLOW_VERTEX = /* glsl */ `
  uniform vec3 center;
  varying vec2 vUv;
  varying vec3 vLocal;
  varying vec3 vNormal;
  varying vec3 vWorld;
  void main() {
    vUv = uv;
    vec4 world = modelMatrix * vec4(position, 1.0);
    vWorld = world.xyz;
    vLocal = world.xyz - center;
    vNormal = normalize(mat3(modelMatrix) * normal);
    gl_Position = projectionMatrix * viewMatrix * world;
  }`;

/**
 * Eau qui coule : le jet, et les filets qui débordent de la vasque. Des traînées plus claires défilent
 * dans le sens du courant ; la nappe est plus visible vue par la tranche. Avec `lobes`, seuls restent
 * les filets qui tombent de la pointe des lobes, de plus en plus fins à mesure qu'ils accélèrent.
 */
const FLOW_FRAGMENT = /* glsl */ `
  uniform float time;
  uniform float speed;
  uniform float lobes;
  uniform float width;
  uniform float opacity;
  uniform float broken;
  uniform vec3 color;
  uniform vec3 sunDir;
  varying vec2 vUv;
  varying vec3 vLocal;
  varying vec3 vNormal;
  varying vec3 vWorld;

  float hash(float n) { return fract(sin(n * 127.1) * 43758.5453); }

  void main() {
    float a = atan(vLocal.x, vLocal.z);
    float mask = 1.0;
    if (lobes > 0.0) {
      float pitch = 6.2831853 / lobes;
      float d = abs(a - pitch * floor(a / pitch + 0.5));
      float w = width * (1.0 - 0.5 * vUv.y);
      mask = smoothstep(w, w * 0.3, d);
    }
    // Traînées : chaque couloir d'angle a sa phase et sa vitesse.
    float lanes = 64.0;
    float lane = floor((a / 6.2831853 + 0.5) * lanes);
    float run = fract(vUv.y * 2.5 - time * speed * (0.8 + 0.4 * hash(lane)) + hash(lane + 7.0));
    float streak = 0.55 + 0.45 * smoothstep(0.0, 0.3, run) * smoothstep(1.0, 0.55, run);
    vec3 v = normalize(cameraPosition - vWorld);
    float edge = 1.0 - abs(dot(normalize(vNormal), v));
    float alpha = opacity * mask * mix(0.5, 1.0, edge) * streak;
    // Couronne du jet : l'eau retombe en filets séparés, puis en gouttes.
    if (broken > 0.0) {
      alpha *= step(broken, hash(lane + 3.0));
      alpha *= smoothstep(0.15, 0.45, fract(vUv.y * 5.0 - time * speed * 1.3 + hash(lane + 11.0))) * (1.0 - 0.6 * vUv.y);
    }
    if (alpha < 0.01) discard;
    vec3 r = reflect(-v, normalize(vNormal));
    float glint = pow(max(abs(dot(r, sunDir)), 0.0), 60.0) * 0.8;
    gl_FragColor = vec4(color * (0.85 + 0.3 * streak) + glint, alpha);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }`;

/** Lueur mouvante que la lumière, déviée par les rides, dessine au fond du bassin. Ajoutée à la couleur du fond. */
const CAUSTICS_FRAGMENT = /* glsl */ `
  uniform float time;
  uniform vec3 center;
  uniform vec3 color;
  uniform float shade;
  varying vec3 vWorld;

  float lines(float x) { return pow(1.0 - abs(sin(x)), 7.0); }

  void main() {
    vec2 p = (vWorld.xz - center.xz) * 9.0;
    float t = time * 0.6;
    vec2 q = p + 0.9 * vec2(sin(p.y * 0.7 + t), sin(p.x * 0.8 - t * 1.1));
    q += 0.6 * vec2(sin(q.y * 1.3 - t * 1.3), sin(q.x * 1.1 + t * 0.9));
    float c = lines(q.x) + lines(q.y) + 0.6 * lines((q.x + q.y) * 0.7);
    // Sous la vasque, le fond est à l'ombre.
    float r = length(vWorld.xz - center.xz);
    c *= smoothstep(shade * 0.7, shade * 1.15, r);
    gl_FragColor = vec4(color * c, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }`;

// --- La fontaine ---------------------------------------------------------------

export interface Fountain {
  group: THREE.Group;
  /** Sphère qui contient la fontaine : la visite n'anime l'eau que si elle est en vue. */
  bounds: THREE.Sphere;
  /** Place l'eau à l'instant `t`, en secondes. */
  flow(t: number): void;
}

/** Instant montré par une fontaine immobile : les rides y sont bien visibles. */
const STILL = 4.2;

/**
 * Construit la fontaine d'une salle. `env` : l'environnement reflété par le marbre et les carreaux émaillés.
 */
export function buildFountain(position: [number, number], room: RoomConfig, decor: Decor, quality: Quality, env: THREE.Texture | null): Fountain {
  const group = new THREE.Group();
  group.name = 'fontaine';
  const center = new THREE.Vector3(room.position[0] + position[0], 0, room.position[1] + position[1]);
  group.position.copy(center);
  const lit = (color: string, gain = 1) => new THREE.Color(color).multiplyScalar(objectLight(decor) * gain).multiply(new THREE.Color(decor.light.tint));
  const time = { value: STILL };
  const centre = { value: center };
  const sunDir = { value: SUN_AZIMUTH.clone().multiplyScalar(3).setY(7).normalize() };
  const silent = (mesh: THREE.Mesh, order: number) => {
    mesh.raycast = () => {};
    mesh.renderOrder = order;
    return mesh;
  };

  // Margelle de marbre poli, aux arêtes arrondies.
  const marble = new THREE.MeshStandardMaterial({ color: lit('#ffffff', 0.97), map: marbleTexture(quality), roughness: 0.22, envMap: env, envMapIntensity: 0.35 });
  const plain = new THREE.MeshStandardMaterial({ color: lit('#f1ede4'), roughness: 0.25, envMap: env, envMapIntensity: 0.35 });
  const rim = new THREE.Mesh(rimGeometry(), marble);

  // Parois extérieures de zellige : trois motifs par côté de l'étoile.
  const wallTop = BASIN.rim - BASIN.rimThickness + 0.004;
  const outline = starOutline(starRadius(BASIN.outer));
  const side = outline[0].distanceTo(outline[1]);
  const glazed = (map: THREE.Texture) => new THREE.MeshStandardMaterial({ map, color: lit('#ffffff', 1.05), roughness: 0.35, envMap: env, envMapIntensity: 0.3 });
  const walls = new THREE.Mesh(sideWalls(outline, 0, wallTop, 3, 1, false), glazed(basinTiles(side / 3, wallTop, quality)));

  // Intérieur du bassin : parois et fond carrelés de turquoise, sous l'eau.
  const innerOutline = starOutline(starRadius(BASIN.inner));
  const innerSide = innerOutline[0].distanceTo(innerOutline[1]);
  const across = Math.max(1, Math.round(innerSide / 0.18));
  /**
   * Carreaux vus à travers l'eau : leur dessin ondule au gré des rides, comme au fond d'un vrai bassin.
   * `uvPerMeter` : combien la coordonnée de texture avance par mètre, pour que l'ondulation ait partout la même ampleur.
   */
  const underwater = (map: THREE.Texture, uvPerMeter: number) => {
    const material = glazed(map);
    material.onBeforeCompile = (shader) => {
      shader.uniforms.time = time;
      shader.uniforms.uvPerMeter = { value: uvPerMeter };
      shader.uniforms.waterLevel = { value: BASIN.water };
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vWater;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvWater = (modelMatrix * vec4(transformed, 1.0)).xyz;');
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', '#include <common>\nuniform float time;\nuniform float uvPerMeter;\nuniform float waterLevel;\nvarying vec3 vWater;')
        .replace(
          '#include <map_fragment>',
          `vec2 wobble = vec2(sin(vWater.z * 23.0 + time * 1.9) + sin(vWater.x * 17.0 - time * 1.3),
                              sin(vWater.x * 21.0 - time * 1.7) + sin(vWater.z * 15.0 + time * 1.1));
          wobble *= 0.0016 * uvPerMeter * step(vWater.y, waterLevel);
          diffuseColor *= texture2D(map, vMapUv + wobble);`,
        );
    };
    return material;
  };
  const inside = new THREE.Mesh(
    sideWalls(innerOutline, BASIN.floor, wallTop, across, (wallTop - BASIN.floor) / (innerSide / across), true),
    underwater(poolTiles(quality), across / innerSide),
  );
  const floorShape = new THREE.Shape(innerOutline);
  const bottom = new THREE.Mesh(new THREE.ShapeGeometry(floorShape), underwater(poolFloor(starRadius(BASIN.inner), quality), 1 / (2 * starRadius(BASIN.inner))));
  bottom.rotation.x = -Math.PI / 2;
  bottom.position.y = BASIN.floor;

  // Lueurs mouvantes au fond, ajoutées à la couleur des carreaux.
  const caustics = silent(
    new THREE.Mesh(
      new THREE.ShapeGeometry(floorShape),
      new THREE.ShaderMaterial({
        uniforms: { time, center: centre, color: { value: lit('#fff6dc', 0.16) }, shade: { value: LIP_TIP } },
        vertexShader: WATER_VERTEX,
        fragmentShader: CAUSTICS_FRAGMENT,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
    ),
    1,
  );
  caustics.rotation.x = -Math.PI / 2;
  caustics.position.y = BASIN.floor + 0.004;

  // L'eau du bassin, et celle de la vasque.
  const water = (ring: number, spots: number, strength: number, depth: number, absorb: number, tint: string) =>
    new THREE.ShaderMaterial({
      uniforms: {
        time,
        center: centre,
        ring: { value: ring },
        spots: { value: spots },
        strength: { value: strength },
        tint: { value: lit(tint) },
        depth: { value: depth },
        absorb: { value: absorb },
        sky: { value: lit('#fffaf0', 1.6) },
        wall: { value: lit(decor.colors.wall, 0.95) },
        dado: { value: lit('#5d7f8c', 0.9) },
        ceiling: { value: lit(decor.colors.ceiling, 0.8) },
        sunDir,
        foam: { value: lit('#ffffff', 1.1) },
      },
      vertexShader: WATER_VERTEX,
      fragmentShader: WATER_FRAGMENT,
      transparent: true,
      depthWrite: false,
    });
  const basinWater = silent(new THREE.Mesh(new THREE.ShapeGeometry(new THREE.Shape(starOutline(starRadius(BASIN.inner - 0.002)))), water(SPILL_LANDING, BOWL.lobes, 1, BASIN.water - BASIN.floor, 3.2, '#0e4a4a')), 2);
  basinWater.rotation.x = -Math.PI / 2;
  basinWater.position.y = BASIN.water;

  // Socle à huit pans, balustre et vasque à godrons.
  const base = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.175, 0.142, 8), plain);
  base.position.y = BASIN.floor + 0.071;
  base.rotation.y = Math.PI / 8;
  const pedestal = new THREE.Mesh(lobedLathe(PEDESTAL_PROFILE, BOWL.lobes, 40), plain);
  const bowl = new THREE.Mesh(lobedLathe(BOWL_PROFILE, BOWL.lobes, 144), plain);
  const bowlWater = silent(
    new THREE.Mesh(new THREE.ShapeGeometry(new THREE.Shape(lobedOutline(0.5, 0.075, BOWL.lobes, 144))), water(0.085, 0, 1.3, BOWL.water - 0.878, 4, '#8fc4bc')),
    4,
  );
  bowlWater.rotation.x = -Math.PI / 2;
  bowlWater.position.y = BOWL.water;

  // Le jet, puis les filets qui débordent de la vasque.
  const flowing = (speed: number, lobes: number, opacity: number, broken = 0) =>
    new THREE.ShaderMaterial({
      uniforms: { time, center: centre, speed: { value: speed }, lobes: { value: lobes }, width: { value: 0.045 }, opacity: { value: opacity }, broken: { value: broken }, color: { value: lit('#eef7f4', 1.05) }, sunDir },
      vertexShader: FLOW_VERTEX,
      fragmentShader: FLOW_FRAGMENT,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
  const spill = silent(new THREE.Mesh(new THREE.LatheGeometry(spillProfile(), 144), flowing(1.6, BOWL.lobes, 0.85)), 3);
  const column = [
    [0.013, 0],
    [0.011, 0.06],
    [0.008, 0.13],
    [0.004, BOWL.jet - 0.005],
    [0.0, BOWL.jet],
  ].map(([r, y]) => new THREE.Vector2(r, BOWL.water + y));
  const crown = [
    [0.0, BOWL.jet],
    [0.03, BOWL.jet - 0.003],
    [0.055, BOWL.jet - 0.02],
    [0.07, BOWL.jet - 0.055],
    [0.08, BOWL.jet - 0.11],
    [0.085, 0.0],
  ].map(([r, y]) => new THREE.Vector2(r, BOWL.water + y));
  const jet = silent(new THREE.Mesh(new THREE.LatheGeometry(column, 24), flowing(2.6, 0, 0.85)), 5);
  const umbrella = silent(new THREE.Mesh(new THREE.LatheGeometry(crown, 48), flowing(1.8, 0, 0.6, 0.45)), 5);

  group.add(walls, rim, inside, bottom, caustics, basinWater, base, pedestal, bowl, bowlWater, spill, jet, umbrella);
  group.add(groundShadow(FOUNTAIN_RADIUS * 1.5, FOUNTAIN_RADIUS * 1.5));
  return {
    group,
    bounds: new THREE.Sphere(center.clone().setY(0.6), FOUNTAIN_RADIUS + 0.2),
    flow(t) {
      time.value = t;
    },
  };
}

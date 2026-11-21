import * as THREE from 'three';
import { ALONE_LAYER } from './engine/artworks';
import type { PlacedArtwork } from './engine/world';
import { $ } from './ui';

const BACKGROUND = new THREE.Color('#1c2b26');
const SPIN = 0.35; // rad/s, rotation automatique
const LOOK = 0.008; // rad par pixel de glissement
const FLIP = 5; // rad/s, quand on retourne une pièce : un demi-tour en un peu plus d'une demi-seconde

/**
 * Distances de l'examen d'un objet, comptées depuis son centre : celle de départ, la plus proche, la plus lointaine.
 * `flat` cadre l'objet comme s'il était plat. Mais sa partie la plus proche de la caméra est en avant de son
 * centre, de `reach` (son rayon vu de dessus) : sans en tenir compte, un objet aussi profond que haut, comme un
 * coffre, déborde de l'écran, et l'on pourrait s'approcher jusqu'à entrer dedans.
 */
export function inspectRange(height: number, span: number, reach: number, tan: number, aspect: number): { start: number; min: number; max: number } {
  const flat = Math.max(height / (2 * tan), span / (2 * tan * aspect));
  const radius = Math.max(height, span) / 2;
  // Un très petit objet s'approche de plus près qu'une sculpture.
  const min = Math.max(Math.min(radius * 0.45 + 0.12, radius * 2.5 + 0.06), reach + 0.08);
  // Un très petit objet se regarde de près, mais jamais en deçà de ce que la caméra peut montrer.
  const start = Math.max(1.45 * flat, 1.2 * flat + reach, min * 1.2);
  return { start, min, max: start * 1.7 };
}

/** Part de l'écran (de son plus petit côté) qu'une pièce de monnaie occupe au début de son examen. */
const COIN_FILL = 0.7;
/** Distance du centre d'une pièce au début de son examen, en mètres. */
const COIN_START = 0.16;

/**
 * Examen d'une pièce de monnaie : une loupe. Avec le champ de la visite, une pièce de 2 cm n'occuperait qu'un
 * dixième de l'écran, à moins d'approcher la caméra plus près qu'elle ne sait montrer. On resserre donc le champ
 * (`fov`, en degrés), d'autant plus que la pièce est petite : au départ, toute pièce occupe la même part de l'écran,
 * et de près on lit ses détails.
 */
export function coinLens(diameter: number, aspect: number): { fov: number; start: number; min: number; max: number } {
  // Sur un écran en hauteur, c'est la largeur qui limite.
  const tan = diameter / (2 * COIN_FILL * COIN_START * Math.min(1, aspect));
  const fov = THREE.MathUtils.clamp(THREE.MathUtils.radToDeg(2 * Math.atan(tan)), 4, 60);
  // La caméra ne montre rien à moins de 5 cm : la pièce, même vue par la tranche, reste au-delà.
  const min = Math.max(0.07, diameter / 2 + 0.055);
  return { fov, start: COIN_START, min, max: COIN_START * 1.8 };
}

/**
 * Angle de départ de l'examen, en radians au-dessus de l'horizontale. Une statue se regarde presque de face.
 * Un objet plus large que haut, posé à plat sur son socle, se regarde de plus haut : de face, on n'en verrait
 * que la tranche.
 */
export function inspectPitch(height: number, span: number): number {
  const ratio = span > 0 ? height / span : 1;
  return Math.min(0.8, Math.max(0.12, 0.12 + (1 - ratio) * 0.75));
}

export interface Inspect {
  open(art: PlacedArtwork): void;
  close(): void;
  /** À appeler à chaque image tant que l'examen est ouvert ; vrai si l'image doit être redessinée. */
  update(dt: number): boolean;
  readonly isOpen: boolean;
  readonly state: { yaw: number; pitch: number; distance: number; spinning: boolean };
  /** Champ de vision (en degrés) que l'examen en cours impose à la caméra, pour un écran de ces proportions ; `null` s'il n'en impose pas. */
  lens(aspect: number): number | null;
}

/**
 * Examen d'une sculpture : elle apparaît seule sur un fond sombre, et le visiteur tourne
 * autour d'elle dans tous les sens, s'approche et recule. La caméra de la visite sert aussi
 * à l'examen ; la position du visiteur dans le musée est rendue à la fermeture.
 */
export function setupInspect(options: {
  camera: THREE.PerspectiveCamera;
  scene: THREE.Scene;
  labels(): { close: string; zoomIn: string; zoomOut: string; inspectHint: string; inspectSpin: string; flip: string; zoomHintFlip: string };
  onOpen(): void;
  onClose(): void;
}): Inspect {
  const { camera, scene } = options;
  const box = $('inspect');
  const stillMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

  let art: PlacedArtwork | null = null;
  let yaw = 0;
  let pitch = 0;
  let distance = 2;
  let wanted = 2; // distance visée : l'approche se fait en douceur
  let min = 0.5;
  let max = 6;
  let spinning = false;
  /** Angle qu'il reste à parcourir pour montrer l'autre face d'une pièce que l'on retourne. */
  let flipLeft = 0;
  /** Ce dont le regard monte ou descend par radian parcouru pendant ce demi-tour : on finit bien en face de l'autre face. */
  let flipSlope = 0;
  /** Diamètre de la pièce de monnaie examinée, ou 0 pour un autre objet. */
  let coin = 0;
  /** Champ de vision de la visite, à rendre en fermant l'examen d'une pièce. */
  let fovBefore = 0;
  /** Vrai quand l'objet examiné a deux faces à montrer (une pièce de monnaie dont le revers est photographié). */
  let twoFaced = false;
  let dirty = false;
  let opener: HTMLElement | null = null;
  const home = new THREE.Vector3();
  let background: THREE.Scene['background'] = null;

  const zoomBy = (factor: number) => {
    wanted = THREE.MathUtils.clamp(wanted * factor, min, max);
    dirty = true;
  };
  const turn = (dx: number, dy: number) => {
    yaw -= dx;
    // On peut la voir du dessus comme d'en dessous, sans passer de l'autre côté.
    pitch = THREE.MathUtils.clamp(pitch + dy, -1.2, 1.45);
    dirty = true;
  };
  const setSpin = (on: boolean) => {
    spinning = on;
    $('inspect-spin').setAttribute('aria-pressed', String(on));
  };

  // Un doigt ou la souris fait tourner ; deux doigts ou la molette approchent.
  const pointers = new Map<number, { x: number; y: number }>();
  let pinch = 0;
  box.addEventListener('pointerdown', (e) => {
    if ((e.target as HTMLElement).closest('button')) return;
    box.setPointerCapture(e.pointerId);
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    pinch = 0;
    setSpin(false);
  });
  box.addEventListener('pointermove', (e) => {
    const last = pointers.get(e.pointerId);
    if (!last) return;
    if (pointers.size === 1) turn((e.clientX - last.x) * LOOK, (e.clientY - last.y) * LOOK);
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      const spread = Math.hypot(a.x - b.x, a.y - b.y);
      if (pinch) zoomBy(pinch / spread);
      pinch = spread;
    }
  });
  const release = (e: PointerEvent) => {
    pointers.delete(e.pointerId);
    pinch = 0;
  };
  box.addEventListener('pointerup', release);
  box.addEventListener('pointercancel', release);
  box.addEventListener('wheel', (e) => {
    e.preventDefault();
    setSpin(false);
    zoomBy(e.deltaY < 0 ? 1 / 1.15 : 1.15);
  }, { passive: false });

  /**
   * Retourne la pièce : un demi-tour autour d'elle, pour voir son autre face. La pièce est penchée sur son cube :
   * le regard passe en même temps du dessus au dessous (ou l'inverse), pour retrouver l'autre face aussi droite.
   */
  const flip = () => {
    if (!twoFaced) return;
    setSpin(false);
    const goal = flipLeft > 0 ? pitch + flipSlope * flipLeft : pitch; // l'angle où menait le demi-tour en cours
    flipLeft += Math.PI;
    flipSlope = (-goal - pitch) / flipLeft;
    dirty = true;
  };
  $('inspect-flip').addEventListener('click', flip);
  $('inspect-in').addEventListener('click', () => zoomBy(1 / 1.3));
  $('inspect-out').addEventListener('click', () => zoomBy(1.3));
  $('inspect-spin').addEventListener('click', () => setSpin(!spinning));
  $('inspect-close').addEventListener('click', () => api.close());
  box.addEventListener('keydown', (e) => {
    // Tant que l'examen est ouvert, les touches ne déplacent pas le visiteur derrière lui.
    if (e.key !== 'Escape' && e.key !== 'Tab') e.stopPropagation();
    const step = 0.12;
    if (e.key === 'ArrowLeft') turn(step, 0);
    else if (e.key === 'ArrowRight') turn(-step, 0);
    else if (e.key === 'ArrowUp') turn(0, step);
    else if (e.key === 'ArrowDown') turn(0, -step);
    else if (e.key === '+' || e.key === '=') zoomBy(1 / 1.3);
    else if (e.key === '-') zoomBy(1.3);
    else if ((e.key === 'r' || e.key === 'R') && twoFaced) flip();
    else return;
    setSpin(false);
    e.preventDefault();
  });

  const api: Inspect = {
    get isOpen() {
      return art !== null;
    },
    get state() {
      return { yaw, pitch, distance, spinning };
    },
    lens(aspect) {
      return coin ? coinLens(coin, aspect).fov : null;
    },
    open(target) {
      if (art) return;
      opener = document.activeElement as HTMLElement | null;
      art = target;
      options.onOpen();
      const t = options.labels();
      $('inspect-close').setAttribute('aria-label', t.close);
      $('inspect-in').setAttribute('aria-label', t.zoomIn);
      $('inspect-out').setAttribute('aria-label', t.zoomOut);
      $('inspect-spin').setAttribute('aria-label', t.inspectSpin);
      const model = target.config.type === 'sculpture' ? (target.config.model as { coinBack?: string }) : null;
      twoFaced = Boolean(model?.coinBack);
      flipLeft = 0;
      coin = 0;
      $('inspect-flip').hidden = !twoFaced;
      $('inspect-flip').setAttribute('aria-label', t.flip);
      $('inspect-flip').title = t.flip;
      $('inspect-hint').textContent = twoFaced ? `${t.zoomHintFlip} · ${t.inspectHint}` : t.inspectHint;

      // Recul pour que la sculpture entière tienne à l'écran, en hauteur comme en largeur, d'où qu'on la regarde.
      const tan = Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2);
      target.shape?.updateWorldMatrix(true, true);
      const size = target.shape ? new THREE.Box3().setFromObject(target.shape).getSize(new THREE.Vector3()) : null;
      // Une pièce de monnaie est plate : elle n'avance pas vers la caméra.
      const flatCoin = target.config.type === 'sculpture' && target.config.vitrine !== undefined;
      const reach = flatCoin ? 0 : size ? Math.hypot(size.x, size.z) / 2 : target.span / 2;
      const range = flatCoin ? coinLens(target.config.height, camera.aspect) : inspectRange(target.config.height, target.span, reach, tan, camera.aspect);
      min = range.min;
      max = range.max;
      distance = wanted = range.start;
      home.copy(camera.position);
      if (flatCoin && target.shape) {
        // Une pièce se regarde à la loupe, bien en face : sa face avant regarde le long de l'axe z de sa forme.
        coin = target.config.height;
        fovBefore = camera.fov;
        camera.fov = coinLens(coin, camera.aspect).fov;
        camera.updateProjectionMatrix();
        const facing = target.shape.getWorldDirection(new THREE.Vector3());
        yaw = Math.atan2(facing.x, facing.z);
        pitch = Math.asin(THREE.MathUtils.clamp(facing.y, -1, 1));
      } else {
        // On part du côté où se tenait le visiteur.
        yaw = Math.atan2(home.x - target.center.x, home.z - target.center.z);
        pitch = !size ? 0.12 : inspectPitch(size.y, Math.max(size.x, size.z));
      }
      setSpin(!stillMotion);

      background = scene.background;
      scene.background = BACKGROUND;
      // Seule cette sculpture passe sur le calque que regarde la caméra : ni la salle, ni les autres œuvres.
      target.shape?.traverse((node) => node.layers.enable(ALONE_LAYER));
      camera.layers.set(ALONE_LAYER);
      document.body.classList.add('inspecting');
      box.hidden = false;
      dirty = true;
      $('inspect-close').focus();
    },
    close() {
      if (!art) return;
      art.shape?.traverse((node) => node.layers.disable(ALONE_LAYER));
      art = null;
      pointers.clear();
      box.hidden = true;
      document.body.classList.remove('inspecting');
      camera.layers.set(0);
      scene.background = background;
      if (coin) {
        coin = 0;
        camera.fov = fovBefore;
        camera.updateProjectionMatrix();
      }
      camera.position.copy(home);
      options.onClose();
      opener?.focus?.();
    },
    update(dt) {
      if (!art) return false;
      if (spinning) {
        yaw += SPIN * dt;
        dirty = true;
      }
      if (flipLeft > 0) {
        const step = Math.min(flipLeft, FLIP * dt);
        yaw += step;
        pitch = THREE.MathUtils.clamp(pitch + flipSlope * step, -1.2, 1.45);
        flipLeft -= step;
        dirty = true;
      }
      if (Math.abs(wanted - distance) > 0.001) {
        distance += (wanted - distance) * (1 - Math.exp(-dt * 8));
        dirty = true;
      }
      const c = art.center;
      const flat = Math.cos(pitch) * distance;
      camera.position.set(c.x + Math.sin(yaw) * flat, c.y + Math.sin(pitch) * distance, c.z + Math.cos(yaw) * flat);
      camera.lookAt(c);
      const changed = dirty;
      dirty = false;
      return changed;
    },
  };
  return api;
}

import * as THREE from 'three';
import { ALONE_LAYER } from './engine/artworks';
import type { PlacedArtwork } from './engine/world';
import { $ } from './ui';

const BACKGROUND = new THREE.Color('#1c2b26');
const SPIN = 0.35; // rad/s, rotation automatique
const LOOK = 0.008; // rad par pixel de glissement

export interface Inspect {
  open(art: PlacedArtwork): void;
  close(): void;
  /** À appeler à chaque image tant que l'examen est ouvert ; vrai si l'image doit être redessinée. */
  update(dt: number): boolean;
  readonly isOpen: boolean;
  readonly state: { yaw: number; pitch: number; distance: number; spinning: boolean };
}

/**
 * Examen d'une sculpture : elle apparaît seule sur un fond sombre, et le visiteur tourne
 * autour d'elle dans tous les sens, s'approche et recule. La caméra de la visite sert aussi
 * à l'examen ; la position du visiteur dans le musée est rendue à la fermeture.
 */
export function setupInspect(options: {
  camera: THREE.PerspectiveCamera;
  scene: THREE.Scene;
  labels(): { close: string; zoomIn: string; zoomOut: string; inspectHint: string; inspectSpin: string };
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
      $('inspect-hint').textContent = t.inspectHint;

      // Recul pour que la sculpture entière tienne à l'écran, en hauteur comme en largeur.
      const tan = Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2);
      const fit = 1.45 * Math.max(target.config.height / (2 * tan), target.span / (2 * tan * camera.aspect));
      const radius = Math.max(target.config.height, target.span) / 2;
      // Une pièce de monnaie s'approche de plus près qu'une sculpture.
      min = Math.min(radius * 0.45 + 0.12, radius * 2.5 + 0.06);
      // Un très petit objet (une pièce de monnaie) se regarde de près, mais jamais en deçà de ce que la caméra peut montrer.
      const start = Math.max(fit, min * 1.2);
      max = start * 1.7;
      distance = wanted = start;
      // On part du côté où se tenait le visiteur.
      home.copy(camera.position);
      yaw = Math.atan2(home.x - target.center.x, home.z - target.center.z);
      pitch = 0.12;
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

import * as THREE from 'three';
import { EYE_HEIGHT } from './layout';

const SPEED = 2.4; // m/s
const TURN_SPEED = 1.6; // rad/s, rotation au clavier
const LOOK = 0.0032; // rad par pixel de glissement
const WALK_SPEED = 4.5; // m/s au plus, quand le visiteur a cliqué au sol
const STEP = 0.1; // m, pas de contrôle d'un trajet

/**
 * Déplacement libre à la première personne.
 * - Souris / doigt : glisser pour regarder, toucher une œuvre pour l'ouvrir, toucher le sol pour s'y rendre.
 * - Clavier : ZQSD / WASD ou flèches pour avancer, A/E ou Q/E pour tourner.
 * - Tactile : manette virtuelle pour avancer.
 */
export class Controls {
  yaw = 0;
  pitch = 0;
  /** Indique si le visiteur peut se tenir en ce point (salles, portes, obstacles). */
  walkable: (x: number, z: number) => boolean = () => true;
  /** Appelé lors d'un clic sans glissement, avec les coordonnées normalisées. */
  onTap: (ndc: THREE.Vector2) => void = () => {};
  onHover: (ndc: THREE.Vector2) => void = () => {};

  private keys = new Set<string>();
  private stick = new THREE.Vector2();
  private drag: { id: number; x: number; y: number; moved: number } | null = null;
  private glide: { pos: THREE.Vector3; yaw: number; pitch: number; maxSpeed: number } | null = null;

  constructor(
    private camera: THREE.PerspectiveCamera,
    private dom: HTMLElement,
    joystick: HTMLElement,
  ) {
    camera.rotation.order = 'YXZ';
    camera.position.y = EYE_HEIGHT;

    window.addEventListener('keydown', (e) => {
      if ((e.target as HTMLElement).closest('input, textarea, button, [role="dialog"]')) return;
      this.keys.add(e.code);
      if (e.code.startsWith('Arrow')) e.preventDefault();
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => this.keys.clear());

    dom.addEventListener('pointerdown', (e) => {
      if (this.drag) return;
      this.drag = { id: e.pointerId, x: e.clientX, y: e.clientY, moved: 0 };
      dom.setPointerCapture(e.pointerId);
    });
    dom.addEventListener('pointermove', (e) => {
      if (!this.drag || this.drag.id !== e.pointerId) {
        if (e.pointerType === 'mouse') this.onHover(this.ndc(e));
        return;
      }
      const dx = e.clientX - this.drag.x;
      const dy = e.clientY - this.drag.y;
      this.drag.x = e.clientX;
      this.drag.y = e.clientY;
      this.drag.moved += Math.abs(dx) + Math.abs(dy);
      if (this.drag.moved > 6) {
        this.glide = null;
        this.yaw += dx * LOOK;
        this.pitch = THREE.MathUtils.clamp(this.pitch + dy * LOOK, -1.1, 1.1);
      }
    });
    const end = (e: PointerEvent) => {
      if (!this.drag || this.drag.id !== e.pointerId) return;
      if (this.drag.moved <= 6 && e.type === 'pointerup') this.onTap(this.ndc(e));
      this.drag = null;
    };
    dom.addEventListener('pointerup', end);
    dom.addEventListener('pointercancel', end);

    this.bindJoystick(joystick);
  }

  private ndc(e: PointerEvent) {
    const r = this.dom.getBoundingClientRect();
    return new THREE.Vector2(
      ((e.clientX - r.left) / r.width) * 2 - 1,
      -((e.clientY - r.top) / r.height) * 2 + 1,
    );
  }

  private bindJoystick(el: HTMLElement) {
    const knob = el.firstElementChild as HTMLElement;
    let id: number | null = null;
    const set = (e: PointerEvent) => {
      const r = el.getBoundingClientRect();
      const v = new THREE.Vector2(
        (e.clientX - r.left - r.width / 2) / (r.width / 2),
        (e.clientY - r.top - r.height / 2) / (r.height / 2),
      );
      if (v.length() > 1) v.normalize();
      this.stick.copy(v);
      knob.style.transform = `translate(${v.x * 32}px, ${v.y * 32}px)`;
    };
    el.addEventListener('pointerdown', (e) => {
      id = e.pointerId;
      el.setPointerCapture(id);
      this.glide = null;
      set(e);
    });
    el.addEventListener('pointermove', (e) => e.pointerId === id && set(e));
    const end = (e: PointerEvent) => {
      if (e.pointerId !== id) return;
      id = null;
      this.stick.set(0, 0);
      knob.style.transform = '';
    };
    el.addEventListener('pointerup', end);
    el.addEventListener('pointercancel', end);
  }

  /** Place le visiteur sans animation. */
  teleport(x: number, z: number, yaw: number) {
    // Un déplacement en douceur encore en cours ramènerait le visiteur à son ancienne destination.
    this.glide = null;
    this.camera.position.set(x, EYE_HEIGHT, z);
    this.yaw = yaw;
    this.pitch = 0;
  }

  /** Amène le visiteur en douceur devant un point d'intérêt. */
  glideTo(pos: THREE.Vector3, yaw: number, pitch = 0) {
    // Tourne par le plus court chemin.
    const delta = Math.atan2(Math.sin(yaw - this.yaw), Math.cos(yaw - this.yaw));
    this.glide = { pos: pos.clone().setY(EYE_HEIGHT), yaw: this.yaw + delta, pitch, maxSpeed: Infinity };
  }

  /**
   * Point le plus loin que le visiteur peut atteindre en marchant tout droit vers (x, z) :
   * le point lui-même si rien ne gêne, sinon le dernier endroit libre avant l'obstacle.
   */
  reach(x: number, z: number): { x: number; z: number } {
    const p = this.camera.position;
    const length = Math.hypot(x - p.x, z - p.z);
    const steps = Math.ceil(length / STEP);
    let last = { x: p.x, z: p.z };
    for (let i = 1; i <= steps; i++) {
      const t = i / steps;
      const next = { x: p.x + (x - p.x) * t, z: p.z + (z - p.z) * t };
      if (!this.walkable(next.x, next.z)) break;
      last = next;
    }
    return last;
  }

  /**
   * Marche tout droit vers un point du sol, sans changer la direction du regard.
   * Renvoie la destination retenue, ou null si le visiteur ne peut pas avancer vers ce point.
   */
  walkTo(x: number, z: number): { x: number; z: number } | null {
    const end = this.reach(x, z);
    const p = this.camera.position;
    if (Math.hypot(end.x - p.x, end.z - p.z) < 0.3) return null;
    this.glide = { pos: new THREE.Vector3(end.x, EYE_HEIGHT, end.z), yaw: this.yaw, pitch: this.pitch, maxSpeed: WALK_SPEED };
    return end;
  }

  /** Vrai tant qu'un déplacement en douceur est en cours. */
  get gliding() {
    return this.glide !== null;
  }

  update(dt: number) {
    const k = this.keys;
    const has = (...codes: string[]) => codes.some((c) => k.has(c));
    let forward = (has('KeyW', 'ArrowUp') ? 1 : 0) - (has('KeyS', 'ArrowDown') ? 1 : 0);
    let strafe = (has('KeyD') ? 1 : 0) - (has('KeyA') ? 1 : 0);
    const turn = (has('ArrowLeft', 'KeyQ') ? 1 : 0) - (has('ArrowRight', 'KeyE') ? 1 : 0);
    forward -= this.stick.y;
    strafe += this.stick.x;

    if (forward || strafe || turn) this.glide = null;

    if (this.glide) {
      let t = 1 - Math.exp(-dt * 4);
      // Une marche vers un point du sol garde une allure de promenade, même de loin.
      const left = this.camera.position.distanceTo(this.glide.pos);
      if (left * t > this.glide.maxSpeed * dt) t = (this.glide.maxSpeed * dt) / left;
      this.camera.position.lerp(this.glide.pos, t);
      this.yaw += (this.glide.yaw - this.yaw) * t;
      this.pitch += (this.glide.pitch - this.pitch) * t;
      if (this.camera.position.distanceTo(this.glide.pos) < 0.01) this.glide = null;
    } else {
      this.yaw += turn * TURN_SPEED * dt;
      const len = Math.hypot(forward, strafe);
      if (len > 0) {
        const scale = (SPEED * dt) / Math.max(1, len);
        const sin = Math.sin(this.yaw);
        const cos = Math.cos(this.yaw);
        const p = this.camera.position;
        const nx = p.x + (-sin * forward + cos * strafe) * scale;
        const nz = p.z + (-cos * forward - sin * strafe) * scale;
        // En cas d'obstacle, on glisse le long du mur plutôt que de s'arrêter net.
        if (this.walkable(nx, nz)) p.set(nx, EYE_HEIGHT, nz);
        else if (this.walkable(nx, p.z)) p.x = nx;
        else if (this.walkable(p.x, nz)) p.z = nz;
      }
    }

    this.camera.position.y = EYE_HEIGHT;
    this.camera.rotation.set(this.pitch, this.yaw, 0);
  }
}

import { $ } from './ui';

/**
 * Agrandissement d'une œuvre : son image d'origine, en haute définition, que l'on fait
 * glisser et grossir à la souris, au doigt ou au clavier. Une seule visionneuse pour toute la page.
 */
export interface Zoom {
  open(src: string, alt: string): void;
  close(): void;
  readonly isOpen: boolean;
}

const MAX_SCALE = 8;

export function setupZoom(labels: () => { close: string; zoomIn: string; zoomOut: string; zoomHint: string }): Zoom {
  const box = $('zoom');
  const stage = $('zoom-stage');
  const img = $<HTMLImageElement>('zoom-img');
  let scale = 1;
  let x = 0;
  let y = 0;
  let opener: HTMLElement | null = null;

  /** Garde l'image à l'écran : centrée tant qu'elle tient, sinon jamais plus loin que son bord. */
  function apply() {
    const maxX = Math.max(0, (img.clientWidth * scale - stage.clientWidth) / 2);
    const maxY = Math.max(0, (img.clientHeight * scale - stage.clientHeight) / 2);
    x = Math.min(maxX, Math.max(-maxX, x));
    y = Math.min(maxY, Math.max(-maxY, y));
    img.style.transform = `translate(${x}px, ${y}px) scale(${scale})`;
    stage.classList.toggle('zoomed', scale > 1);
  }
  /** Change le grossissement en gardant fixe le point de l'écran visé (par défaut le centre). */
  function zoomTo(next: number, cx = stage.clientWidth / 2, cy = stage.clientHeight / 2) {
    next = Math.min(MAX_SCALE, Math.max(1, next));
    const px = cx - stage.clientWidth / 2;
    const py = cy - stage.clientHeight / 2;
    x = px - ((px - x) * next) / scale;
    y = py - ((py - y) * next) / scale;
    scale = next;
    // Revenue à sa taille normale, l'image se recentre.
    if (scale === 1) x = y = 0;
    apply();
  }
  const local = (e: { clientX: number; clientY: number }) => {
    const r = stage.getBoundingClientRect();
    return [e.clientX - r.left, e.clientY - r.top] as const;
  };

  stage.addEventListener('wheel', (e) => {
    e.preventDefault();
    zoomTo(scale * (e.deltaY < 0 ? 1.2 : 1 / 1.2), ...local(e));
  }, { passive: false });
  stage.addEventListener('dblclick', (e) => zoomTo(scale > 1 ? 1 : 3, ...local(e)));

  // Un doigt ou la souris déplace l'image ; deux doigts la grossissent.
  const pointers = new Map<number, { x: number; y: number }>();
  let pinch = 0;
  stage.addEventListener('pointerdown', (e) => {
    stage.setPointerCapture(e.pointerId);
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    pinch = 0;
  });
  stage.addEventListener('pointermove', (e) => {
    const last = pointers.get(e.pointerId);
    if (!last) return;
    if (pointers.size === 1) {
      x += e.clientX - last.x;
      y += e.clientY - last.y;
      apply();
    }
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      const distance = Math.hypot(a.x - b.x, a.y - b.y);
      if (pinch) zoomTo((scale * distance) / pinch, ...local({ clientX: (a.x + b.x) / 2, clientY: (a.y + b.y) / 2 }));
      pinch = distance;
    }
  });
  const release = (e: PointerEvent) => {
    pointers.delete(e.pointerId);
    pinch = 0;
  };
  stage.addEventListener('pointerup', release);
  stage.addEventListener('pointercancel', release);

  $('zoom-in').addEventListener('click', () => zoomTo(scale * 1.5));
  $('zoom-out').addEventListener('click', () => zoomTo(scale / 1.5));
  $('zoom-close').addEventListener('click', () => api.close());
  box.addEventListener('keydown', (e) => {
    // Tant que l'agrandissement est ouvert, les touches ne déplacent pas le visiteur derrière lui.
    if (e.key !== 'Escape' && e.key !== 'Tab') e.stopPropagation();
    const step = 60;
    if (e.key === '+' || e.key === '=') zoomTo(scale * 1.5);
    else if (e.key === '-') zoomTo(scale / 1.5);
    else if (e.key === 'ArrowLeft') x += step;
    else if (e.key === 'ArrowRight') x -= step;
    else if (e.key === 'ArrowUp') y += step;
    else if (e.key === 'ArrowDown') y -= step;
    else return;
    e.preventDefault();
    apply();
  });
  img.addEventListener('load', () => {
    box.classList.remove('loading');
    apply();
  });
  window.addEventListener('resize', () => !box.hidden && apply());

  const api: Zoom = {
    get isOpen() {
      return !box.hidden;
    },
    open(src, alt) {
      opener = document.activeElement as HTMLElement | null;
      const t = labels();
      $('zoom-close').setAttribute('aria-label', t.close);
      $('zoom-in').setAttribute('aria-label', t.zoomIn);
      $('zoom-out').setAttribute('aria-label', t.zoomOut);
      $('zoom-hint').textContent = t.zoomHint;
      box.setAttribute('aria-label', alt);
      scale = 1;
      x = 0;
      y = 0;
      box.classList.add('loading');
      img.alt = alt;
      img.src = src;
      box.hidden = false;
      apply();
      $('zoom-close').focus();
    },
    close() {
      if (box.hidden) return;
      box.hidden = true;
      img.removeAttribute('src');
      pointers.clear();
      opener?.focus?.();
    },
  };
  return api;
}

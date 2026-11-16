import { $ } from './ui';

/**
 * Agrandissement d'une œuvre : son image d'origine, en haute définition, que l'on fait
 * glisser et grossir à la souris, au doigt ou au clavier. Une seule visionneuse pour toute la page.
 */
/** Un détail commenté : sa position dans l'image (de 0 à 1) et son texte, déjà dans la langue du visiteur. */
export interface ZoomDetail {
  x: number;
  y: number;
  title: string;
  text: string;
}

export interface Zoom {
  open(src: string, alt: string, details?: ZoomDetail[]): void;
  close(): void;
  readonly isOpen: boolean;
}

const MAX_SCALE = 8;
/** Grossissement auquel un détail commenté est montré. */
const DETAIL_SCALE = 3;

type Labels = { close: string; zoomIn: string; zoomOut: string; zoomHint: string; zoomHintDetails: string; detailCount: string; overview: string; prev: string; next: string };

export function setupZoom(labels: () => Labels): Zoom {
  const box = $('zoom');
  const stage = $('zoom-stage');
  // La feuille porte l'image et ses points numérotés : ils se déplacent et grossissent ensemble.
  const sheet = $('zoom-sheet');
  const dots = $('zoom-dots');
  const card = $('zoom-detail');
  const img = $<HTMLImageElement>('zoom-img');
  let details: ZoomDetail[] = [];
  let shown = -1;
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
    sheet.style.transform = `translate(${x}px, ${y}px) scale(${scale})`;
    // Les points gardent leur taille à l'écran, quel que soit le grossissement.
    sheet.style.setProperty('--inv', String(1 / scale));
    stage.classList.toggle('zoomed', scale > 1);
  }
  /** Le visiteur reprend la main : l'image suit son geste sans délai. */
  const manual = () => sheet.classList.remove('glide');

  /** Montre un détail : l'image s'en approche en douceur et son commentaire s'affiche. */
  function showDetail(index: number) {
    const d = details[index];
    if (!d) return;
    shown = index;
    const t = labels();
    $('zoom-detail-count').textContent = t.detailCount.replace('{i}', String(index + 1)).replace('{n}', String(details.length));
    $('zoom-detail-title').textContent = d.title;
    $('zoom-detail-text').textContent = d.text;
    $<HTMLButtonElement>('zoom-detail-prev').disabled = index === 0;
    $<HTMLButtonElement>('zoom-detail-next').disabled = index === details.length - 1;
    card.hidden = false;
    $('zoom-hint').hidden = true;
    for (const [i, dot] of [...dots.children].entries()) dot.setAttribute('aria-current', String(i === index));
    // Le détail vient au centre de la place laissée libre au-dessus de son commentaire.
    const free = (stage.clientHeight - card.getBoundingClientRect().height) / 2 - stage.clientHeight / 2;
    scale = DETAIL_SCALE;
    x = -(d.x - 0.5) * img.clientWidth * scale;
    y = -(d.y - 0.5) * img.clientHeight * scale + Math.min(0, free);
    sheet.classList.add('glide');
    apply();
  }
  function overview() {
    shown = -1;
    card.hidden = true;
    $('zoom-hint').hidden = false;
    for (const dot of dots.children) dot.setAttribute('aria-current', 'false');
    scale = 1;
    x = y = 0;
    sheet.classList.add('glide');
    apply();
  }
  $('zoom-detail-prev').addEventListener('click', () => showDetail(shown - 1));
  $('zoom-detail-next').addEventListener('click', () => showDetail(shown + 1));
  $('zoom-detail-all').addEventListener('click', overview);
  /** Change le grossissement en gardant fixe le point de l'écran visé (par défaut le centre). */
  function zoomTo(next: number, cx = stage.clientWidth / 2, cy = stage.clientHeight / 2) {
    next = Math.min(MAX_SCALE, Math.max(1, next));
    manual();
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
    // Un point numéroté se clique : il ne déplace pas l'image.
    if ((e.target as HTMLElement).closest('.zoom-dot')) return;
    manual();
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
    manual();
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
    open(src, alt, list = []) {
      opener = document.activeElement as HTMLElement | null;
      const t = labels();
      details = list;
      shown = -1;
      card.hidden = true;
      sheet.classList.remove('glide');
      dots.replaceChildren(
        ...details.map((d, i) => {
          const dot = document.createElement('button');
          dot.type = 'button';
          dot.className = 'zoom-dot';
          dot.textContent = String(i + 1);
          dot.style.left = `${d.x * 100}%`;
          dot.style.top = `${d.y * 100}%`;
          dot.setAttribute('aria-label', `${t.detailCount.replace('{i}', String(i + 1)).replace('{n}', String(details.length))} : ${d.title}`);
          dot.addEventListener('click', () => showDetail(i));
          return dot;
        }),
      );
      $('zoom-detail-prev').textContent = t.prev;
      $('zoom-detail-next').textContent = t.next;
      $('zoom-detail-all').textContent = t.overview;
      $('zoom-hint').hidden = false;
      $('zoom-close').setAttribute('aria-label', t.close);
      $('zoom-in').setAttribute('aria-label', t.zoomIn);
      $('zoom-out').setAttribute('aria-label', t.zoomOut);
      $('zoom-hint').textContent = details.length ? `${t.zoomHintDetails} · ${t.zoomHint}` : t.zoomHint;
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

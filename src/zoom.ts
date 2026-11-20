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

/** Le verso d'un objet à deux faces (un billet, une carte) : son image et son texte de remplacement. */
export interface ZoomBack {
  src: string;
  alt: string;
}

export interface Zoom {
  /** `back` : verso de l'œuvre, s'il y en a un ; le visiteur la retourne alors d'un bouton ou de la touche R. */
  open(src: string, alt: string, details?: ZoomDetail[], back?: ZoomBack): void;
  close(): void;
  readonly isOpen: boolean;
}

const MAX_SCALE = 8;
/** Grossissement auquel un détail commenté est montré. */
const DETAIL_SCALE = 3;
/** Durée d'un demi-tour de l'œuvre que l'on retourne, en millisecondes : elle se met de profil, puis revient de face. */
const FLIP_MS = 200;

type Labels = {
  close: string;
  zoomIn: string;
  zoomOut: string;
  zoomHint: string;
  zoomHintDetails: string;
  zoomHintFlip: string;
  detailCount: string;
  overview: string;
  prev: string;
  next: string;
  flip: string;
  recto: string;
  verso: string;
};

export function setupZoom(labels: () => Labels): Zoom {
  const box = $('zoom');
  const stage = $('zoom-stage');
  // La feuille porte l'image et ses points numérotés : ils se déplacent et grossissent ensemble.
  const sheet = $('zoom-sheet');
  const dots = $('zoom-dots');
  const card = $('zoom-detail');
  const img = $<HTMLImageElement>('zoom-img');
  let details: ZoomDetail[] = [];
  /** Les détails commentés du recto : le verso n'en a pas. */
  let rectoDetails: ZoomDetail[] = [];
  /** Les faces de l'œuvre ouverte : le recto, puis le verso s'il y en a un. */
  let faces: ZoomBack[] = [];
  let face = 0;
  /** Angle de l'œuvre pendant qu'on la retourne, en degrés : 90 = de profil. */
  let turn = 0;
  let flipping = false;
  let shown = -1;
  let scale = 1;
  let x = 0;
  let y = 0;
  let opener: HTMLElement | null = null;

  /** Garde l'image à l'écran : centrée tant qu'elle tient, sinon jamais plus loin que son bord. */
  function apply() {
    const maxX = Math.max(0, (img.clientWidth * scale - stage.clientWidth) / 2);
    const maxY = Math.max(0, (img.clientHeight * scale - stage.clientHeight) / 2);
    // Quand le commentaire d'un détail occupe le bas de l'écran, l'image peut monter d'autant :
    // un détail du bas du tableau reste ainsi visible au-dessus de son texte.
    const lift = card.hidden ? 0 : card.getBoundingClientRect().height + 24;
    x = Math.min(maxX, Math.max(-maxX, x));
    y = Math.min(maxY, Math.max(-maxY - lift, y));
    sheet.style.transform = `translate(${x}px, ${y}px) scale(${scale})${turn ? ` rotateY(${turn}deg)` : ''}`;
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
  /** Montre la face courante : son image, son nom, et ses points de détail s'il s'agit du recto. */
  function showFace() {
    const t = labels();
    const current = faces[face];
    details = face === 0 ? rectoDetails : [];
    dots.hidden = face !== 0;
    $('zoom-face').textContent = face === 0 ? t.recto : t.verso;
    $('zoom-flip').setAttribute('aria-pressed', String(face === 1));
    const hint = details.length ? `${t.zoomHintDetails} · ${t.zoomHint}` : t.zoomHint;
    $('zoom-hint').textContent = faces.length > 1 ? `${t.zoomHintFlip} · ${hint}` : hint;
    box.setAttribute('aria-label', current.alt);
    img.alt = current.alt;
    if (img.src !== current.src) {
      box.classList.add('loading');
      img.src = current.src;
    }
  }
  /** Retourne l'œuvre : elle se met de profil, change de face, puis revient vers le visiteur. */
  function flip() {
    if (faces.length < 2 || flipping) return;
    shown = -1;
    card.hidden = true;
    $('zoom-hint').hidden = false;
    for (const dot of dots.children) dot.setAttribute('aria-current', 'false');
    scale = 1;
    x = y = 0;
    sheet.classList.remove('glide');
    const swap = () => {
      face = 1 - face;
      showFace();
    };
    // Sans animation, pour qui l'a demandé à son appareil : la face change d'un coup.
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      swap();
      apply();
      return;
    }
    flipping = true;
    sheet.classList.add('flip');
    turn = 90;
    apply();
    window.setTimeout(() => {
      swap();
      // De profil de l'autre côté, sans transition, puis retour de face en douceur.
      sheet.classList.remove('flip');
      turn = -90;
      apply();
      void sheet.offsetWidth;
      sheet.classList.add('flip');
      turn = 0;
      apply();
      window.setTimeout(() => {
        sheet.classList.remove('flip');
        flipping = false;
      }, FLIP_MS);
    }, FLIP_MS);
  }
  $('zoom-flip').addEventListener('click', flip);
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
    else if (e.key === 'r' || e.key === 'R') flip();
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
    open(src, alt, list = [], back) {
      opener = document.activeElement as HTMLElement | null;
      const t = labels();
      details = rectoDetails = list;
      faces = back ? [{ src, alt }, back] : [{ src, alt }];
      face = 0;
      turn = 0;
      flipping = false;
      sheet.classList.remove('flip');
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
      $('zoom-flip').hidden = $('zoom-face').hidden = !back;
      $('zoom-flip').setAttribute('aria-label', t.flip);
      $('zoom-flip').title = t.flip;
      // Le verso se charge d'avance : retourner l'œuvre ne fait pas attendre.
      if (back) new Image().src = back.src;
      scale = 1;
      x = 0;
      y = 0;
      img.removeAttribute('src');
      showFace();
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

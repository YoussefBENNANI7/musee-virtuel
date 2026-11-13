import { imageSrcset, imageUrl } from './engine/images';
import { paintingCanvas } from './engine/textures';
import { tr, type ArtworkConfig } from './engine/types';
import { $, metaLine, type App, type View } from './ui';

function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: Partial<HTMLElementTagNameMap[K]> & { class?: string } = {},
  ...children: (Node | string)[]
): HTMLElementTagNameMap[K] {
  const { class: cls, ...rest } = props;
  const node = Object.assign(document.createElement(tag), rest);
  if (cls) node.className = cls;
  node.append(...children);
  return node;
}

/**
 * Vue simplifiée : le même musée sous forme de page à lire, sans 3D.
 * Pensée pour les lecteurs d'écran, la navigation au clavier, les téléphones
 * anciens et les connexions lentes.
 */
export function startSimple(app: App, fallback: boolean): View {
  const root = $('simple');
  root.hidden = false;
  const { museum, guide } = app;
  const all = new Map<string, ArtworkConfig>();
  for (const room of museum.rooms) for (const a of room.artworks) all.set(a.id, a);

  // Les tableaux générés ne sont dessinés que lorsqu'ils approchent de l'écran.
  const lazy = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        const img = entry.target as HTMLImageElement;
        const a = all.get(img.dataset.art!);
        if (a?.type === 'painting' && 'generator' in a.image) {
          img.src = paintingCanvas(a.image, a.width / a.height).toDataURL('image/jpeg', 0.85);
        }
        lazy.unobserve(img);
      }
    },
    { rootMargin: '400px' },
  );

  function picture(a: ArtworkConfig): HTMLElement | null {
    const alt = `${tr(a.title, app.lang)}, ${a.artist}`;
    if (a.type === 'painting') {
      const img = h('img', { alt });
      img.style.aspectRatio = `${a.width} / ${a.height}`;
      if ('src' in a.image) {
        // Le navigateur choisit la version la plus légère qui suffit à la taille affichée.
        img.loading = 'lazy';
        const srcset = imageSrcset(a.image, app.base);
        if (srcset) {
          img.srcset = srcset;
          img.sizes = '(max-width: 560px) 100vw, 260px';
        }
        img.src = imageUrl(a.image, app.base, 640);
      } else {
        img.dataset.art = a.id;
        lazy.observe(img);
      }
      return h('figure', {}, img);
    }
    if (!a.photo) return null;
    return h('figure', {}, h('img', { alt, loading: 'lazy', src: new URL(a.photo, app.base).href }));
  }

  function audioLabel(id: string) {
    return guide.playingId === id ? app.ui().stopAudio : app.ui().listen;
  }

  function render() {
    lazy.disconnect();
    const ui = app.ui();
    root.replaceChildren();
    if (fallback) root.append(h('p', { class: 'notice' }, ui.noWebgl));
    root.append(h('p', { class: 'intro' }, ui.simpleIntro));

    if (museum.tours?.length) {
      const section = h('section', {}, h('h2', {}, ui.toursTitle));
      for (const tour of museum.tours) {
        const list = h('ol');
        for (const id of tour.stops) {
          const a = all.get(id);
          if (a) list.append(h('li', {}, h('a', { href: `#art-${id}` }, `${tr(a.title, app.lang)}, ${a.artist}`)));
        }
        section.append(h('h3', {}, tr(tour.name, app.lang)), h('p', {}, tr(tour.description, app.lang)), list);
      }
      root.append(section);
    }

    for (const room of museum.rooms) {
      const cards = h('div', { class: 'cards' });
      for (const a of room.artworks) {
        const body = h(
          'div',
          {},
          h('p', { class: 'artist' }, a.artist),
          h('h3', {}, tr(a.title, app.lang)),
          h('p', { class: 'meta' }, metaLine(app, a)),
          h('p', { class: 'desc' }, tr(a.description, app.lang)),
        );
        if (guide.available(a, app.lang)) {
          const btn = h('button', { class: 'btn', type: 'button' }, audioLabel(a.id));
          btn.dataset.audio = a.id;
          btn.addEventListener('click', () => guide.toggle(a, app.lang, app.base));
          body.append(btn);
        }
        const card = h('article', { id: `art-${a.id}`, class: 'card' });
        const fig = picture(a);
        if (fig) card.append(fig);
        card.append(body);
        cards.append(card);
      }
      root.append(h('section', {}, h('h2', {}, tr(room.name, app.lang)), cards));
    }
  }

  guide.onChange = () => {
    for (const btn of root.querySelectorAll<HTMLButtonElement>('button[data-audio]')) {
      btn.textContent = audioLabel(btn.dataset.audio!);
      btn.setAttribute('aria-pressed', String(guide.playingId === btn.dataset.audio));
    }
  };

  render();
  return {
    setLang() {
      guide.stop();
      render();
    },
  };
}

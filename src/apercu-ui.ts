import './apercu-ui.css';
import { $, type App } from './ui';

/**
 * Aperçu des directions d'interface, pour les comparer avant d'en retenir une.
 * `?ui=cimaise`, `?ui=nocturne` ou `?ui=zellige` habille l'interface et ajoute un écran d'accueil.
 * Sans ce paramètre, rien ne change. Ce fichier disparaîtra une fois la direction choisie.
 */
export const UI_PREVIEWS = ['cimaise', 'nocturne', 'zellige'];

const TEXTS: Record<string, Record<string, string>> = {
  fr: {
    kicker: 'Visite virtuelle · entrée libre',
    stats: '{rooms} salles · {works} œuvres · {tours} parcours',
    enter: 'Entrer dans le musée',
    look: 'Glissez pour regarder autour de vous',
    move: 'Flèches ou ZQSD pour avancer',
    moveTouch: 'La manette pour avancer',
    open: 'Cliquez sur une œuvre pour la découvrir',
    openTouch: 'Touchez une œuvre pour la découvrir',
    simple: 'Vue simplifiée, sans 3D',
  },
  en: {
    kicker: 'Virtual visit · free entry',
    stats: '{rooms} rooms · {works} works · {tours} tours',
    enter: 'Enter the museum',
    look: 'Drag to look around',
    move: 'Arrows or WASD to move',
    moveTouch: 'Use the joystick to move',
    open: 'Click an artwork to discover it',
    openTouch: 'Tap an artwork to discover it',
    simple: 'Simple view, without 3D',
  },
};

export function setupUiPreview(app: App, params: URLSearchParams, langSelect: HTMLSelectElement) {
  const ui = params.get('ui');
  if (!ui || !UI_PREVIEWS.includes(ui) || document.body.classList.contains('simple')) return;
  document.body.dataset.ui = ui;
  // ?accueil=non ouvre directement la visite, pour juger l'habillage seul.
  if (params.get('accueil') === 'non') return;

  const touch = matchMedia('(pointer: coarse)').matches;
  const box = document.createElement('div');
  box.id = 'welcome';
  box.className = 'welcome';
  box.setAttribute('role', 'dialog');
  box.setAttribute('aria-modal', 'true');
  document.body.append(box);
  document.body.classList.add('welcoming');

  const el = <K extends keyof HTMLElementTagNameMap>(tag: K, cls: string, text = '') => {
    const node = document.createElement(tag);
    node.className = cls;
    node.textContent = text;
    return node;
  };

  function render() {
    const t = TEXTS[app.lang] ?? TEXTS.en;
    const { museum } = app;
    const works = museum.rooms.reduce((n, r) => n + r.artworks.length, 0);
    const card = el('div', 'welcome-card');
    const title = el('h2', 'welcome-title', museum.name[app.lang] ?? Object.values(museum.name)[0]);
    title.id = 'welcome-title';
    box.setAttribute('aria-labelledby', 'welcome-title');
    const enter = el('button', 'welcome-enter', t.enter);
    enter.type = 'button';
    enter.addEventListener('click', close);
    const how = el('ul', 'welcome-how');
    for (const line of [t.look, touch ? t.moveTouch : t.move, touch ? t.openTouch : t.open]) how.append(el('li', '', line));
    const foot = el('div', 'welcome-foot');
    const simple = el('button', 'welcome-simple', t.simple);
    simple.type = 'button';
    simple.addEventListener('click', () => $('mode').click());
    const langs = el('span', 'welcome-langs');
    for (const code of museum.langs) {
      const b = el('button', '', code.toUpperCase());
      b.type = 'button';
      b.setAttribute('aria-pressed', String(code === app.lang));
      b.addEventListener('click', () => {
        langSelect.value = code;
        langSelect.dispatchEvent(new Event('change'));
        render();
      });
      langs.append(b);
    }
    foot.append(simple, langs);
    card.append(
      el('div', 'welcome-emblem'),
      el('p', 'welcome-kicker', t.kicker),
      title,
      el('p', 'welcome-stats', t.stats.replace('{rooms}', String(museum.rooms.length)).replace('{works}', String(works)).replace('{tours}', String(museum.tours?.length ?? 0))),
      enter,
      how,
      foot,
    );
    box.replaceChildren(card);
    enter.focus();
  }

  function close() {
    box.classList.add('leaving');
    document.body.classList.remove('welcoming');
    setTimeout(() => box.remove(), 500);
    $('scene').focus?.();
  }
  render();
}

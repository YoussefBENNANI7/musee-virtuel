import { tr } from './engine/types';
import type { App } from './ui';

/**
 * Écran d'accueil de la visite 3D : le nom du musée, ce qu'il contient, les gestes à connaître,
 * puis le bouton d'entrée. Le musée reste visible derrière un voile clair.
 * `?accueil=non` dans l'adresse ouvre directement la visite.
 */
export function showWelcome(app: App, actions: { setLang(lang: string): void; simpleView(): void }) {
  const touch = matchMedia('(pointer: coarse)').matches;
  const box = document.createElement('div');
  box.id = 'welcome';
  box.className = 'welcome';
  box.setAttribute('role', 'dialog');
  box.setAttribute('aria-modal', 'true');
  box.setAttribute('aria-labelledby', 'welcome-title');
  document.body.append(box);
  document.body.classList.add('welcoming');

  const el = <K extends keyof HTMLElementTagNameMap>(tag: K, cls: string, text = '') => {
    const node = document.createElement(tag);
    if (cls) node.className = cls;
    node.textContent = text;
    return node;
  };
  const button = (cls: string, text: string, action: () => void) => {
    const node = el('button', cls, text);
    node.type = 'button';
    node.addEventListener('click', action);
    return node;
  };

  function render() {
    const t = app.ui();
    const { museum } = app;
    const count = (n: number, one: string, many: string) => `${n} ${n > 1 ? many : one}`;
    const works = museum.rooms.reduce((n, r) => n + r.artworks.length, 0);
    const tours = museum.tours?.length ?? 0;
    const stats = [count(museum.rooms.length, t.room, t.rooms), count(works, t.work, t.works)];
    if (tours) stats.push(count(tours, t.tourCount, t.toursCount));

    const title = el('h2', 'welcome-title', tr(museum.name, app.lang));
    title.id = 'welcome-title';
    const enter = button('welcome-enter', t.enter, close);
    const how = el('ul', 'welcome-how');
    for (const line of [t.welcomeLook, touch ? t.welcomeMoveTouch : t.welcomeMove, touch ? t.welcomeOpenTouch : t.welcomeOpen]) how.append(el('li', '', line));
    const langs = el('span', 'welcome-langs');
    for (const code of museum.langs) {
      const b = button('', code.toUpperCase(), () => {
        actions.setLang(code);
        render();
      });
      b.setAttribute('aria-pressed', String(code === app.lang));
      langs.append(b);
    }
    const foot = el('div', 'welcome-foot');
    foot.append(button('welcome-simple', t.welcomeSimple, actions.simpleView), langs);
    const card = el('div', 'welcome-card');
    const emblem = el('div', 'welcome-emblem');
    emblem.setAttribute('aria-hidden', 'true');
    card.append(emblem, el('p', 'welcome-kicker', t.welcomeKicker), title, el('p', 'welcome-stats', stats.join(' · ')), enter, how, foot);
    box.replaceChildren(card);
    enter.focus();
  }

  function close() {
    window.removeEventListener('keydown', onKey, true);
    box.classList.add('leaving');
    document.body.classList.remove('welcoming');
    setTimeout(() => box.remove(), 500);
    // Le clavier revient à la visite : les flèches déplacent le visiteur.
    (document.activeElement as HTMLElement | null)?.blur();
  }
  // Tant que l'accueil est affiché, Échap fait entrer, et aucune touche n'atteint la visite.
  function onKey(e: KeyboardEvent) {
    if (e.key === 'Escape') close();
    e.stopPropagation();
  }
  window.addEventListener('keydown', onKey, true);
  render();
}

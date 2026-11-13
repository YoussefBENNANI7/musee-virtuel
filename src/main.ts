import './style.css';
import { AudioGuide } from './audio';
import { detectQuality } from './engine/quality';
import { resolveStyle } from './engine/styles';
import { tr, type MuseumConfig } from './engine/types';
import { validateMuseum, type Issue } from './engine/validate';
import { startSimple } from './simple';
import { $, UI, type App } from './ui';
import { startVisit } from './visit3d';

/** La configuration du musée contient des erreurs qui empêchent de le construire. */
class ConfigError extends Error {
  constructor(readonly issues: Issue[]) {
    super('configuration invalide');
  }
}

function hasWebGL(): boolean {
  try {
    return Boolean(document.createElement('canvas').getContext('webgl2'));
  } catch {
    return false;
  }
}

async function start() {
  // Chaque musée client est un dossier de configuration : ?m=identifiant
  const params = new URLSearchParams(location.search);
  const museumId = params.get('m') ?? 'demo';
  const base = new URL(`museums/${encodeURIComponent(museumId)}/`, document.baseURI).href;
  const res = await fetch(new URL('museum.json', base));
  if (!res.ok) throw new Error(`museum.json: ${res.status}`);
  const museum: MuseumConfig = await res.json();

  // ?style=… montre le même musée dans un autre style d'architecture, sans toucher à sa configuration.
  const style = resolveStyle(museum, params.get('style'));
  const issues = validateMuseum(museum, style);
  for (const issue of issues) {
    (issue.level === 'error' ? console.error : console.warn)(`[musée] ${issue.where} : ${issue.message}`);
  }
  const errors = issues.filter((i) => i.level === 'error');
  if (errors.length) throw new ConfigError(errors);

  const browserLang = navigator.language.slice(0, 2);
  const app: App = {
    museum,
    style,
    quality: detectQuality(params),
    base,
    lang: museum.langs.includes(browserLang) ? browserLang : museum.defaultLang,
    ui: () => UI[app.lang] ?? UI.en,
    guide: new AudioGuide(),
  };
  document.documentElement.style.setProperty('--accent', style.palette.accent);

  // La vue simplifiée est choisie par le visiteur (?vue=simple) ou imposée si la 3D est impossible.
  const webgl = hasWebGL();
  const simple = params.get('vue') === 'simple' || !webgl;
  document.body.classList.toggle('simple', simple);
  const view = simple ? startSimple(app, !webgl) : startVisit(app);

  const mode = $('mode');
  mode.hidden = !webgl;
  mode.addEventListener('click', () => {
    if (simple) params.delete('vue');
    else params.set('vue', 'simple');
    location.search = params.toString();
  });

  const langSelect = $<HTMLSelectElement>('lang');
  for (const code of museum.langs) langSelect.add(new Option(code.toUpperCase(), code));
  function applyLang() {
    document.documentElement.lang = app.lang;
    document.title = tr(museum.name, app.lang);
    $('museum-name').textContent = tr(museum.name, app.lang);
    mode.textContent = simple ? app.ui().view3d : app.ui().simpleView;
    langSelect.setAttribute('aria-label', app.ui().lang);
    langSelect.value = app.lang;
  }
  langSelect.addEventListener('change', () => {
    app.lang = langSelect.value;
    applyLang();
    view.setLang(app.lang);
  });
  applyLang();
  window.addEventListener('pagehide', () => app.guide.stop());
  document.body.classList.add('ready');
}

start().catch((err) => {
  console.error(err);
  const ui = UI[navigator.language.startsWith('fr') ? 'fr' : 'en'];
  // Le détail des erreurs n'est montré qu'à la personne qui configure le musée :
  // pendant le développement, ou avec ?debug dans l'adresse. Un visiteur voit un message simple.
  const detailed = import.meta.env.DEV || new URLSearchParams(location.search).has('debug');
  if (err instanceof ConfigError && detailed) {
    const box = $('config-errors');
    const title = document.createElement('h2');
    title.textContent = ui.configErrors;
    const list = document.createElement('ul');
    for (const issue of err.issues) {
      const item = document.createElement('li');
      const where = document.createElement('strong');
      where.textContent = issue.where;
      item.append(where, ` : ${issue.message}`);
      list.append(item);
    }
    box.replaceChildren(title, list);
    box.hidden = false;
  } else {
    $('help').textContent = ui.error;
  }
});

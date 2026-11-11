import './style.css';
import { AudioGuide } from './audio';
import { tr, type MuseumConfig } from './engine/types';
import { startSimple } from './simple';
import { $, UI, type App } from './ui';
import { startVisit } from './visit3d';

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

  const browserLang = navigator.language.slice(0, 2);
  const app: App = {
    museum,
    base,
    lang: museum.langs.includes(browserLang) ? browserLang : museum.defaultLang,
    ui: () => UI[app.lang] ?? UI.en,
    guide: new AudioGuide(),
  };
  document.documentElement.style.setProperty('--accent', museum.theme.accent);

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
  const lang = navigator.language.startsWith('fr') ? 'fr' : 'en';
  $('help').textContent = UI[lang].error;
});

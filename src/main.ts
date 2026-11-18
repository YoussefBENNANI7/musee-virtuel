import './style.css';
import { showWelcome } from './accueil';
import { AudioGuide } from './audio';
import { loadMuseumList, showChooser } from './choix';
import { withDecorOverrides } from './engine/decors';
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
  // Sans aucun réglage dans l'adresse, et si plusieurs musées sont proposés, on laisse choisir.
  const list = await loadMuseumList();
  if (!location.search && list.length > 1) {
    showChooser(list);
    document.body.classList.add('ready');
    return;
  }
  const museumId = params.get('m') ?? 'demo';
  const base = new URL(`museums/${encodeURIComponent(museumId)}/`, document.baseURI).href;
  // ?apercu : le musée est montré dans l'éditeur, qui vient peut-être de le modifier. On relit toujours le fichier.
  const preview = params.has('apercu');
  const res = await fetch(new URL('museum.json', base), preview ? { cache: 'no-store' } : undefined);
  if (!res.ok) throw new Error(`museum.json: ${res.status}`);
  // ?decor=… montre une salle dans un autre décor, et ?style=… tout le musée dans un autre
  // style d'architecture, sans toucher à sa configuration.
  const museum: MuseumConfig = withDecorOverrides(await res.json(), params.get('decor'));
  const style = resolveStyle(museum, params.get('style'));
  const issues = validateMuseum(museum, style);
  for (const issue of issues) {
    // Dans l'aperçu de l'éditeur, les points à compléter sont déjà listés par l'éditeur lui-même.
    if (preview && issue.level !== 'error') continue;
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
    preview,
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

  // Un lien ramène à la page de choix quand plusieurs musées sont proposés.
  const others = $<HTMLAnchorElement>('museums-link');
  others.hidden = list.length < 2;
  others.textContent = app.ui().allMuseums;
  const mode = $('mode');
  mode.hidden = !webgl;
  const switchView = () => {
    if (simple) params.delete('vue');
    else params.set('vue', 'simple');
    location.search = params.toString();
  };
  mode.addEventListener('click', switchView);

  const langSelect = $<HTMLSelectElement>('lang');
  for (const code of museum.langs) langSelect.add(new Option(code.toUpperCase(), code));
  function applyLang() {
    document.documentElement.lang = app.lang;
    document.title = tr(museum.name, app.lang);
    $('museum-name').textContent = tr(museum.name, app.lang);
    mode.textContent = simple ? app.ui().view3d : app.ui().simpleView;
    others.textContent = app.ui().allMuseums;
    langSelect.setAttribute('aria-label', app.ui().lang);
    langSelect.value = app.lang;
  }
  const setLang = (lang: string) => {
    app.lang = lang;
    applyLang();
    view.setLang(app.lang);
  };
  langSelect.addEventListener('change', () => setLang(langSelect.value));
  applyLang();
  window.addEventListener('pagehide', () => app.guide.stop());
  // La visite 3D s'ouvre sur un écran d'accueil ; ?accueil=non mène droit dans le musée.
  // ?presentation=identifiant-du-parcours lance ce parcours en mode présentation dès l'entrée.
  const enter = () => {
    view.intro?.(false);
    const tourId = params.get('presentation');
    if (tourId) view.present?.(tourId);
  };
  if (simple) {
    // La vue simplifiée n'a ni accueil ni présentation.
  } else if (params.get('accueil') !== 'non' && !preview) {
    view.intro?.(true);
    showWelcome(app, { setLang, simpleView: switchView, progress: () => view.progress?.() ?? 1, onEnter: enter });
  } else {
    enter();
  }
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
  document.body.classList.add('failed');
});

import './editeur.css';
import { freeLength } from '../engine/accrochage';
import { DECORS, resolveDecor } from '../engine/decors';
import { imageUrl } from '../engine/images';
import { WALLS, buildLayout } from '../engine/layout';
import { buildMap } from '../engine/map';
import { PLANS } from '../engine/plans';
import { STYLES, resolveStyle } from '../engine/styles';
import type { ArtworkConfig, L10n, MuseumConfig, PaintingConfig, StyleId, WallId } from '../engine/types';
import { validateMuseum, type Issue } from '../engine/validate';
import * as api from './api';
import { allWorks, createMuseum, hangIn, newPainting, newWorkId, rehang, removeWork, shift, toReserve } from './modele';

/*
 * Éditeur de musée : il crée et modifie un musée sans que personne ne touche au fichier de
 * configuration. À gauche, les réglages ; à droite, le musée lui-même, rechargé à chaque
 * enregistrement. Tout est enregistré au fur et à mesure dans public/museums/<identifiant>/.
 */

// --- Petits outils d'affichage ---------------------------------------------------
type Child = Node | string | null | undefined | false;
type Props = Record<string, unknown>;

function h<K extends keyof HTMLElementTagNameMap>(tag: K, props: Props = {}, ...children: Child[]): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(props)) {
    if (value === undefined || value === null || value === false) continue;
    if (key === 'class') node.className = String(value);
    else if (key.startsWith('on') && typeof value === 'function') node.addEventListener(key.slice(2), value as EventListener);
    else if (key in node && key !== 'list') (node as unknown as Props)[key] = value;
    else node.setAttribute(key, String(value));
  }
  node.append(...children.filter((c): c is Node | string => c !== null && c !== undefined && c !== false));
  return node;
}
const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
/** Remplace le contenu d'un élément, en ignorant les emplacements laissés vides. */
const fill = (node: HTMLElement, children: Child[]) => node.replaceChildren(...children.filter((c): c is Node | string => c !== null && c !== undefined && c !== false));

const WALL_NAMES: Record<WallId, string> = { north: 'Mur nord', east: 'Mur est', south: 'Mur sud', west: 'Mur ouest' };
const LANG_NAMES: Record<string, string> = { fr: 'français', en: 'anglais' };
const STYLE_NAMES: Record<StyleId, string> = {
  contemporary: 'Contemporain : murs blancs épais, béton clair, cadres fins',
  classic: 'Classique : parquet, plinthes sombres, cadres larges',
};
const metres = (value: number) => `${value.toFixed(1).replace('.', ',')} m`;
const plural = (n: number, one: string, many: string) => `${n} ${n > 1 ? many : one}`;

// --- État de l'éditeur -------------------------------------------------------------
type Tab = 'musee' | 'salles' | 'oeuvres' | 'controle';
let museum: MuseumConfig;
let issues: Issue[] = [];
let tab: Tab = 'oeuvres';
let roomId = '';
/** Œuvre dont la fiche est ouverte, ou null pour la liste. */
let editing: string | null = null;
const undoStack: string[] = [];

const base = () => new URL(`museums/${museum.id}/`, document.baseURI).href;
const room = () => museum.rooms.find((r) => r.id === roomId) ?? museum.rooms[0];
const text = (value: L10n | string | undefined, lang = museum.defaultLang) => (typeof value === 'string' ? value : (value?.[lang] ?? Object.values(value ?? {})[0] ?? ''));
const titleOf = (art: ArtworkConfig) => text(art.title).trim() || 'Sans titre';

// --- Messages ----------------------------------------------------------------------
let noticeTimer = 0;
function notify(message: string) {
  const box = $('notice');
  box.textContent = message;
  box.hidden = false;
  clearTimeout(noticeTimer);
  noticeTimer = window.setTimeout(() => (box.hidden = true), 7000);
}
function status(message: string, kind: 'ok' | 'busy' | 'error' = 'ok') {
  const node = $('status');
  node.textContent = message;
  node.dataset.kind = kind;
}

// --- Enregistrement et aperçu --------------------------------------------------------
let saveTimer = 0;
let pendingFocus: { art?: string; room?: string } | null = null;
const frame = () => $<HTMLIFrameElement>('preview');
type PreviewWindow = Window & { __apercu?: { goToRoom(id: string): boolean; showArtwork(id: string): boolean } };

/** Demande à l'aperçu de montrer une œuvre ou une salle ; si le musée se recharge, la demande attend sa nouvelle version. */
function focusPreview(target: { art?: string; room?: string }) {
  pendingFocus = target;
  if (!previewLoading && !saving && !saveTimer && !previewStale) applyFocus();
}
function applyFocus(since = performance.now()) {
  if (!pendingFocus || previewLoading) return;
  const view = (frame().contentWindow as PreviewWindow | null)?.__apercu;
  if (!view) {
    // Le musée de l'aperçu n'est pas encore construit : on réessaie pendant une vingtaine de secondes.
    if (performance.now() - since < 20000) window.setTimeout(() => applyFocus(since), 150);
    return;
  }
  const { art, room: target } = pendingFocus;
  pendingFocus = null;
  if (art) view.showArtwork(art);
  else if (target) view.goToRoom(target);
}

/** Qualité d'image de l'aperçu : « ?apercu=low » dans l'adresse de l'éditeur l'allège sur un ordinateur modeste. */
const previewQuality = ['low', 'medium', 'high'].find((q) => q === new URLSearchParams(location.search).get('apercu')) ?? 'medium';
let previewLoading = false;
function reloadPreview() {
  clearTimeout(previewTimer);
  previewStale = false;
  previewLoading = true;
  const view = frame();
  const url = `./?m=${encodeURIComponent(museum.id)}&apercu=1&q=${previewQuality}`;
  if (view.dataset.museum === museum.id && view.contentWindow) view.contentWindow.location.reload();
  else {
    view.dataset.museum = museum.id;
    view.src = url;
  }
}

// L'enregistrement est rapide ; reconstruire l'aperçu en 3D l'est moins. Pendant la saisie d'un
// texte, on enregistre donc au fil de l'eau, et l'aperçu ne se recharge qu'une fois la saisie finie.
let previewStale = false;
let previewTimer = 0;
let saving = false;
let unsaved = false;
function refreshPreview() {
  clearTimeout(previewTimer);
  if (!previewStale) return;
  if (typing) previewTimer = window.setTimeout(reloadPreview, 2500);
  else reloadPreview();
}

async function save() {
  clearTimeout(saveTimer);
  saveTimer = 0;
  unsaved = true;
  // Un seul envoi à la fois : une modification arrivée entre-temps part aussitôt après.
  if (saving) return;
  saving = true;
  try {
    while (unsaved) {
      unsaved = false;
      status('Enregistrement…', 'busy');
      await api.saveMuseum(museum);
    }
    previewStale = true;
    // Une nouvelle modification attend déjà : elle donnera elle-même la suite.
    if (!saveTimer) {
      status('Enregistré');
      refreshPreview();
    }
  } catch (error) {
    unsaved = false;
    status(`Non enregistré : ${(error as Error).message}`, 'error');
  } finally {
    saving = false;
  }
}
// Fermer la page pendant qu'une modification attend d'être enregistrée : le navigateur demande confirmation.
window.addEventListener('beforeunload', (e) => {
  if (saveTimer || saving) e.preventDefault();
});
function scheduleSave() {
  status('Modification en cours…', 'busy');
  clearTimeout(saveTimer);
  clearTimeout(previewTimer);
  saveTimer = window.setTimeout(save, 700);
}

function check() {
  issues = validateMuseum(museum, resolveStyle(museum));
  renderTabs();
}
function snapshot() {
  undoStack.push(JSON.stringify(museum));
  if (undoStack.length > 60) undoStack.shift();
  $('undo').hidden = false;
}

/** Applique un changement qui déplace ou transforme des œuvres : on raccroche, on contrôle, on enregistre. */
function commit(change: () => void, redraw = true) {
  snapshot();
  change();
  const moved = rehang(museum);
  if (moved.length) notify(`${plural(moved.length, 'œuvre ne tient plus', 'œuvres ne tiennent plus')} sur son mur : ${moved.length > 1 ? 'elles sont rangées' : 'elle est rangée'} en réserve.`);
  check();
  if (redraw) renderPane();
  scheduleSave();
}

/** Un champ de texte vient de changer : on enregistre sans redessiner, pour ne pas gêner la saisie. */
let typing = false;
function touched() {
  if (!typing) {
    typing = true;
    snapshot();
  }
  check();
  scheduleSave();
}
document.addEventListener('focusout', () => {
  if (!typing) return;
  typing = false;
  // Le champ est quitté : inutile d'attendre davantage pour enregistrer et montrer le résultat.
  if (saveTimer) void save();
  else refreshPreview();
});

$('undo').addEventListener('click', () => {
  const last = undoStack.pop();
  if (!last) return;
  museum = JSON.parse(last);
  $('undo').hidden = undoStack.length === 0;
  if (editing && !allWorks(museum).some((a) => a.id === editing)) editing = null;
  check();
  renderPane();
  renderHeader();
  scheduleSave();
});

// --- Champs de saisie ---------------------------------------------------------------
function field(label: string, value: string, onInput: (value: string) => void, options: { multiline?: boolean; placeholder?: string; type?: string; hint?: string } = {}) {
  const input = options.multiline
    ? h('textarea', { rows: 6, placeholder: options.placeholder, value })
    : h('input', { type: options.type ?? 'text', placeholder: options.placeholder, value });
  input.addEventListener('input', () => onInput(input.value));
  return h('label', { class: 'field' }, h('span', {}, label), input, options.hint ? h('small', {}, options.hint) : null);
}

/** Un texte du musée : un champ par langue. */
function l10nFields(label: string, target: L10n, options: { multiline?: boolean; placeholder?: string } = {}, after: () => void = touched) {
  return museum.langs.map((lang) =>
    field(museum.langs.length > 1 ? `${label} (${LANG_NAMES[lang] ?? lang})` : label, target[lang] ?? '', (value) => {
      target[lang] = value;
      after();
    }, options),
  );
}

/** Artiste et date s'écrivent une seule fois, sauf s'ils ont déjà une version par langue. */
function plainOrL10n(label: string, art: ArtworkConfig, key: 'artist' | 'year', placeholder: string) {
  const value = art[key];
  if (typeof value !== 'string') return l10nFields(label, value, { placeholder });
  return [field(label, value, (v) => {
    art[key] = v;
    touched();
  }, { placeholder })];
}

// --- En-tête et onglets ---------------------------------------------------------------
function renderHeader() {
  $('museum-title').textContent = text(museum.name);
  document.title = `${text(museum.name)} · Éditeur de musée`;
  const open = $<HTMLAnchorElement>('open');
  open.href = `./?m=${encodeURIComponent(museum.id)}`;
  open.hidden = false;
}

function renderTabs() {
  const errors = issues.filter((i) => i.level === 'error').length;
  const warnings = summarize(issues.filter((i) => i.level === 'warning')).size;
  const tabs: [Tab, string][] = [
    ['oeuvres', 'Œuvres'],
    ['salles', 'Salles'],
    ['musee', 'Musée'],
    ['controle', errors ? `Contrôle (${errors})` : warnings ? `À compléter (${warnings})` : 'Contrôle'],
  ];
  $('tabs').replaceChildren(
    ...tabs.map(([id, label]) =>
      h('button', {
        type: 'button',
        class: id === 'controle' && errors ? 'alert' : '',
        'aria-pressed': String(tab === id),
        onclick: () => {
          tab = id;
          editing = null;
          renderTabs();
          renderPane();
        },
      }, label),
    ),
  );
}

let shownView = '';
let listScroll = 0;
function renderPane() {
  const pane = $('pane');
  const view = `${tab}:${tab === 'oeuvres' ? (editing ?? '') : ''}`;
  const scroll = pane.scrollTop;
  // On retient où en était la liste des œuvres, pour y revenir au même endroit après une fiche.
  if (shownView === 'oeuvres:') listScroll = scroll;
  if (tab === 'musee') fill(pane, museumPane());
  else if (tab === 'salles') fill(pane, roomsPane());
  else if (tab === 'controle') fill(pane, checkPane());
  else fill(pane, editing ? workForm() : worksPane());
  // Même vue redessinée : on ne bouge pas. Autre vue : elle s'ouvre en haut.
  pane.scrollTop = view === shownView ? scroll : view === 'oeuvres:' ? listScroll : 0;
  shownView = view;
}

// --- Onglet Musée ----------------------------------------------------------------------
function museumPane(): Child[] {
  const english = museum.langs.includes('en');
  return [
    h('h2', {}, 'Le musée'),
    ...l10nFields('Nom du musée', museum.name, {}, () => {
      touched();
      renderHeader();
    }),
    h('label', { class: 'check' },
      h('input', {
        type: 'checkbox',
        checked: english,
        onchange: (e: Event) =>
          commit(() => {
            museum.langs = (e.target as HTMLInputElement).checked ? ['fr', 'en'] : ['fr'];
            museum.defaultLang = 'fr';
          }),
      }),
      h('span', {}, 'Proposer aussi le musée en anglais'),
    ),
    english ? h('p', { class: 'hint' }, 'Chaque texte a maintenant un champ en anglais. Ceux qui restent vides sont listés dans l’onglet « À compléter ».') : null,
    h('label', { class: 'field' },
      h('span', {}, 'Couleur du musée'),
      h('input', {
        type: 'color',
        value: museum.theme?.accent ?? resolveStyle(museum).palette.accent,
        oninput: (e: Event) => {
          museum.theme = { ...museum.theme, accent: (e.target as HTMLInputElement).value };
          touched();
        },
      }),
      h('small', {}, 'Elle sert aux titres, aux liens et aux repères de l’interface.'),
    ),
    h('label', { class: 'field' },
      h('span', {}, 'Style d’architecture'),
      h('select', { onchange: (e: Event) => commit(() => (museum.style = (e.target as HTMLSelectElement).value as StyleId)) },
        ...(Object.keys(STYLES) as StyleId[]).map((id) => h('option', { value: id, selected: (museum.style ?? 'contemporary') === id }, STYLE_NAMES[id])),
      ),
      h('small', {}, 'Le style règle l’épaisseur des murs et la forme des portes. Chaque salle garde son propre décor.'),
    ),
    h('p', { class: 'hint' }, `Dossier du musée : public/museums/${museum.id}/. C’est ce dossier, avec le moteur, qui se met en ligne.`),
  ];
}

// --- Onglet Salles ----------------------------------------------------------------------
function roomsPane(): Child[] {
  return [
    h('h2', {}, plural(museum.rooms.length, 'salle', 'salles')),
    planView(),
    ...museum.rooms.map((r) => {
      const preset = typeof r.decor === 'string' ? r.decor : (r.decor?.preset ?? '');
      const custom = typeof r.decor === 'object' && r.decor !== null;
      const summary = h('small', {}, preset && DECORS[preset] ? DECORS[preset].summary.fr : 'La salle suit le style du musée.');
      return h('section', { class: 'card' },
        ...l10nFields('Nom de la salle', r.name),
        h('label', { class: 'field' },
          h('span', {}, 'Décor'),
          h('select', {
            disabled: custom,
            onchange: (e: Event) =>
              commit(() => {
                const value = (e.target as HTMLSelectElement).value;
                if (value) r.decor = value;
                else delete r.decor;
              }),
          },
            h('option', { value: '', selected: !preset }, 'Style du musée'),
            ...Object.entries(DECORS).map(([id, d]) => h('option', { value: id, selected: preset === id }, d.name.fr)),
          ),
          custom ? h('small', {}, 'Cette salle a un décor réglé à la main dans sa configuration : l’éditeur le conserve tel quel.') : summary,
        ),
        h('div', { class: 'row' },
          h('span', { class: 'muted' }, plural(r.artworks.length, 'œuvre', 'œuvres')),
          h('button', { type: 'button', onclick: () => focusPreview({ room: r.id }) }, 'Voir cette salle'),
          h('button', {
            type: 'button',
            onclick: () => {
              roomId = r.id;
              tab = 'oeuvres';
              renderTabs();
              renderPane();
              focusPreview({ room: r.id });
            },
          }, 'Ses œuvres'),
        ),
      );
    }),
  ];
}

/** Petit plan du musée, nord en haut : la salle choisie y est mise en valeur. */
function planView() {
  const box = h('div', { class: 'plan' });
  const map = buildMap(box, museum, () => {}, true);
  map.setCurrent(roomId);
  return box;
}

// --- Onglet Œuvres : la liste -------------------------------------------------------------
function thumb(art: ArtworkConfig) {
  if (art.type === 'painting' && 'src' in art.image) return h('img', { class: 'thumb', alt: '', loading: 'lazy', src: imageUrl(art.image, base(), 640) });
  if (art.type === 'sculpture' && art.photo) return h('img', { class: 'thumb', alt: '', loading: 'lazy', src: new URL(art.photo, base()).href });
  return h('span', { class: 'thumb empty' }, art.type === 'sculpture' ? 'Sculpture' : 'Image');
}

function workRow(art: ArtworkConfig, actions: Child[]) {
  return h('li', { class: 'work' },
    thumb(art),
    h('div', { class: 'work-text' },
      h('button', { type: 'button', class: 'work-title', onclick: () => openWork(art.id) }, titleOf(art)),
      h('span', { class: 'muted' }, text(art.artist) || 'Artiste à préciser'),
    ),
    h('div', { class: 'work-actions' }, ...actions),
  );
}

function openWork(id: string) {
  editing = id;
  renderPane();
  $('pane').scrollTop = 0;
  focusPreview({ art: id });
}

function worksPane(): Child[] {
  const r = room();
  roomId = r.id;
  const style = resolveStyle(museum);
  const layout = buildLayout(museum, { wallThickness: style.wallThickness, doorHeight: style.doorHeight });
  const decor = resolveDecor(style, r);
  const paintings = r.artworks.filter((a): a is PaintingConfig => a.type === 'painting');
  const others = r.artworks.filter((a) => a.type !== 'painting');
  const reserve = museum.reserve ?? [];

  const picker = h('input', { type: 'file', accept: 'image/*,.heic,.heif', multiple: true, hidden: true, id: 'photos', onchange: (e: Event) => addPhotos([...((e.target as HTMLInputElement).files ?? [])]) });
  const drop = h('div', { class: 'drop', id: 'drop' },
    h('strong', {}, 'Déposez ici les photos des œuvres'),
    h('span', {}, 'ou'),
    h('button', { type: 'button', class: 'primary', onclick: () => picker.click() }, 'Choisir des photos'),
    h('small', {}, 'Chaque photo devient une œuvre, accrochée sur le mur le plus libre de cette salle.'),
    picker,
  );
  drop.addEventListener('dragover', (e) => {
    e.preventDefault();
    drop.classList.add('over');
  });
  drop.addEventListener('dragleave', () => drop.classList.remove('over'));
  drop.addEventListener('drop', (e) => {
    e.preventDefault();
    drop.classList.remove('over');
    addPhotos([...(e.dataTransfer?.files ?? [])].filter((f) => f.type.startsWith('image/') || /\.(heic|heif)$/i.test(f.name)));
  });

  const walls = WALLS.map((wall) => {
    const hung = paintings.filter((a) => a.wall === wall);
    const free = freeLength(r, wall, layout, decor);
    return h('section', { class: 'wall' },
      h('h3', {}, WALL_NAMES[wall], h('span', { class: 'muted' }, ` · ${plural(hung.length, 'œuvre', 'œuvres')} · ${free < 0.6 ? 'plein' : `${metres(free)} libres`}`)),
      hung.length === 0 ? h('p', { class: 'muted empty-wall' }, 'Aucune œuvre sur ce mur.') : null,
      h('ul', { class: 'works' },
        ...hung.map((art, i) =>
          workRow(art, [
            h('button', { type: 'button', title: 'Vers la gauche du mur', 'aria-label': `Déplacer « ${titleOf(art)} » vers la gauche`, disabled: i === 0, onclick: () => commit(() => shift(r, art, -1)) }, '←'),
            h('button', { type: 'button', title: 'Vers la droite du mur', 'aria-label': `Déplacer « ${titleOf(art)} » vers la droite`, disabled: i === hung.length - 1, onclick: () => commit(() => shift(r, art, 1)) }, '→'),
            h('select', {
              'aria-label': `Mur de « ${titleOf(art)} »`,
              onchange: (e: Event) => {
                const value = (e.target as HTMLSelectElement).value;
                if (value === 'reserve') return commit(() => toReserve(museum, art));
                let done = true;
                commit(() => (done = hangIn(museum, r, art, value as WallId)));
                if (!done) notify(`Le ${WALL_NAMES[value as WallId].toLowerCase()} est plein : l’œuvre reste où elle était.`);
              },
            },
              ...WALLS.map((w) => h('option', { value: w, selected: w === wall }, WALL_NAMES[w])),
              h('option', { value: 'reserve' }, 'Mettre en réserve'),
            ),
          ]),
        ),
      ),
    );
  });

  return [
    h('div', { class: 'room-pick' },
      h('label', { class: 'field' },
        h('span', {}, 'Salle'),
        h('select', {
          id: 'room-select',
          onchange: (e: Event) => {
            roomId = (e.target as HTMLSelectElement).value;
            renderPane();
            focusPreview({ room: roomId });
          },
        }, ...museum.rooms.map((x) => h('option', { value: x.id, selected: x.id === r.id }, `${text(x.name)} (${x.artworks.length})`))),
      ),
      planView(),
    ),
    r.autoHang
      ? drop
      : h('div', { class: 'callout' },
          h('p', {}, 'Les œuvres de cette salle ont été placées à la main, une par une. L’éditeur conserve leur emplacement ; vous pouvez modifier leurs textes.'),
          h('button', {
            type: 'button',
            onclick: () => {
              if (confirm('Répartir automatiquement les œuvres de cette salle ? Leur emplacement actuel sera remplacé.')) commit(() => (r.autoHang = true));
            },
          }, 'Passer cette salle en accrochage automatique'),
        ),
    ...(r.autoHang ? walls : [h('ul', { class: 'works' }, ...paintings.map((art) => workRow(art, [h('span', { class: 'muted' }, WALL_NAMES[art.wall])])))]),
    others.length ? h('section', { class: 'wall' }, h('h3', {}, 'Sculptures'), h('ul', { class: 'works' }, ...others.map((art) => workRow(art, [])))) : null,
    h('section', { class: 'wall reserve' },
      h('h3', {}, 'Réserve', h('span', { class: 'muted' }, ` · ${plural(reserve.length, 'œuvre non accrochée', 'œuvres non accrochées')}`)),
      reserve.length === 0 ? h('p', { class: 'muted empty-wall' }, 'Les œuvres retirées d’un mur, ou qui ne tiennent nulle part, attendent ici.') : null,
      h('ul', { class: 'works' },
        ...reserve.map((art) =>
          workRow(art, [
            art.type === 'painting' && r.autoHang
              ? h('button', {
                  type: 'button',
                  onclick: () => {
                    let done = true;
                    commit(() => (done = hangIn(museum, r, art)));
                    if (!done) notify('Cette salle est pleine, ou l’œuvre est trop haute pour son plafond.');
                  },
                }, 'Accrocher ici')
              : null,
            h('button', {
              type: 'button',
              class: 'danger',
              onclick: () => {
                if (confirm(`Supprimer définitivement « ${titleOf(art)} » ?`)) commit(() => removeWork(museum, art));
              },
            }, 'Supprimer'),
          ]),
        ),
      ),
    ),
  ];
}

/** Dépose des photos : chacune devient une œuvre de la salle affichée. */
async function addPhotos(files: File[]) {
  if (files.length === 0) return;
  const r = room();
  let added = 0;
  let kept = 0;
  snapshot();
  for (const [i, file] of files.entries()) {
    status(`Dépôt des photos… ${i + 1} sur ${files.length}`, 'busy');
    try {
      const id = newWorkId(museum, file.name);
      const image = await api.uploadImage(museum.id, id, file);
      const art = newPainting(museum, file.name, image, id);
      if (hangIn(museum, r, art)) added++;
      else {
        toReserve(museum, art);
        kept++;
      }
    } catch (error) {
      notify((error as Error).message);
    }
  }
  if (kept) notify(`La salle est pleine : ${plural(kept, 'œuvre est rangée', 'œuvres sont rangées')} en réserve. Choisissez une autre salle pour ${kept > 1 ? 'les' : 'l’'}accrocher.`);
  check();
  renderPane();
  if (added + kept) await save();
  else status('Enregistré');
  // L'aperçu se place devant la dernière œuvre accrochée, pour voir tout de suite le résultat.
  const last = r.artworks.at(-1);
  if (added && last) focusPreview({ art: last.id });
}

// --- Onglet Œuvres : la fiche d'une œuvre ------------------------------------------------------
function workForm(): Child[] {
  const art = allWorks(museum).find((a) => a.id === editing);
  if (!art) {
    editing = null;
    return worksPane();
  }
  const home = museum.rooms.find((r) => r.artworks.includes(art));
  const painting = art.type === 'painting' ? art : null;
  const managed = painting && 'src' in painting.image ? painting.image : null;
  const ratio = managed?.width && managed.height ? managed.width / managed.height : painting ? painting.width / painting.height : 1;

  const heightInput = h('input', { type: 'number', min: 5, max: 600, step: 1, value: String(Math.round(art.height * 100)) });
  const widthInput = painting ? h('input', { type: 'number', min: 5, max: 900, step: 1, value: String(Math.round(painting.width * 100)) }) : null;
  const resize = (from: 'height' | 'width') => {
    if (!painting || !widthInput) return;
    const cm = Number((from === 'height' ? heightInput : widthInput).value);
    if (!(cm >= 5)) return;
    // Les deux dimensions restent liées par les proportions de la photo.
    const height = from === 'height' ? cm / 100 : cm / 100 / ratio;
    commit(() => {
      painting.height = Math.round(height * 1000) / 1000;
      painting.width = Math.round(height * ratio * 1000) / 1000;
    }, false);
    if (from === 'height') widthInput.value = String(Math.round(painting.width * 100));
    else heightInput.value = String(Math.round(painting.height * 100));
    if (!allWorks(museum).some((a) => a === art && museum.rooms.some((r) => r.artworks.includes(a))) && home) renderPane();
    focusPreview({ art: art.id });
  };
  heightInput.addEventListener('change', () => (painting ? resize('height') : commit(() => (art.height = Number(heightInput.value) / 100), false)));
  widthInput?.addEventListener('change', () => resize('width'));

  const credit: L10n = { ...(art.credit ?? {}) };
  const frameValue = painting?.frameless ? 'none' : painting?.frame === 'gilt' ? 'gilt' : 'room';
  return [
    h('button', { type: 'button', class: 'back', onclick: () => ((editing = null), renderPane()) }, '← Toutes les œuvres de la salle'),
    h('h2', { id: 'work-title' }, titleOf(art)),
    h('p', { class: 'muted' }, home ? `${text(home.name)}${painting ? ` · ${WALL_NAMES[painting.wall].toLowerCase()}` : ''}` : 'En réserve : cette œuvre n’est accrochée nulle part.'),
    managed
      ? h('div', { class: 'picture' },
          h('img', { alt: '', src: imageUrl(managed, base(), 1024) }),
          h('div', { class: 'row' },
            h('button', { type: 'button', id: 'crop-open', onclick: () => openCrop(painting!) }, 'Recadrer la photo'),
            h('button', { type: 'button', onclick: () => focusPreview({ art: art.id }) }, 'Voir dans le musée'),
          ),
        )
      : h('div', { class: 'row' }, h('button', { type: 'button', onclick: () => focusPreview({ art: art.id }) }, 'Voir dans le musée')),
    ...l10nFields('Titre', art.title, { placeholder: 'Titre de l’œuvre' }, () => {
      touched();
      $('work-title').textContent = titleOf(art);
    }),
    ...plainOrL10n('Artiste', art, 'artist', 'Nom de l’artiste, ou origine'),
    ...plainOrL10n('Date', art, 'year', '1924, ou « vers 1900 »'),
    ...l10nFields('Technique', (art.medium ??= {}), { placeholder: 'Huile sur toile' }),
    h('div', { class: 'dims' },
      h('label', { class: 'field' }, h('span', {}, 'Hauteur (cm)'), heightInput),
      widthInput ? h('label', { class: 'field' }, h('span', {}, 'Largeur (cm)'), widthInput) : null,
    ),
    painting ? h('small', { class: 'hint' }, 'Indiquez la vraie taille de l’œuvre : elle aura cette taille dans le musée. La largeur suit les proportions de la photo.') : null,
    painting
      ? h('label', { class: 'field' },
          h('span', {}, 'Cadre'),
          h('select', {
            onchange: (e: Event) =>
              commit(() => {
                const value = (e.target as HTMLSelectElement).value;
                delete painting.frame;
                delete painting.frameless;
                if (value === 'gilt') painting.frame = 'gilt';
                if (value === 'none') painting.frameless = true;
              }, false),
          },
            h('option', { value: 'room', selected: frameValue === 'room' }, 'Cadre de la salle'),
            h('option', { value: 'gilt', selected: frameValue === 'gilt' }, 'Cadre doré mouluré'),
            h('option', { value: 'none', selected: frameValue === 'none' }, 'Sans cadre (objet, textile, panneau)'),
          ),
        )
      : null,
    painting
      ? h('label', { class: 'check' },
          h('input', {
            type: 'checkbox',
            checked: Boolean(painting.mat),
            onchange: (e: Event) =>
              commit(() => {
                if ((e.target as HTMLInputElement).checked) painting.mat = 0.1;
                else delete painting.mat;
              }, false),
          }),
          h('span', {}, 'Passe-partout (pour une œuvre sur papier : dessin, estampe, photographie)'),
        )
      : null,
    ...l10nFields('Commentaire', (art.description ??= {}), { multiline: true, placeholder: 'Quelques phrases pour le visiteur. Ce texte est aussi lu par l’audioguide.' }),
    // La mention est facultative : vide, elle disparaît de la configuration au lieu d'y laisser un texte manquant.
    ...l10nFields('Mention', credit, { placeholder: 'Collection, crédit photographique' }, () => {
      if (Object.values(credit).some((v) => v.trim())) art.credit = credit;
      else delete art.credit;
      touched();
    }),
    field('Lien vers une notice', art.link ?? '', (value) => {
      if (value.trim()) art.link = value.trim();
      else delete art.link;
      touched();
    }, { placeholder: 'https://…', type: 'url' }),
    painting && museum.rooms.length > 1
      ? h('label', { class: 'field' },
          h('span', {}, 'Salle'),
          h('select', {
            onchange: (e: Event) => {
              const target = museum.rooms.find((r) => r.id === (e.target as HTMLSelectElement).value)!;
              let done = true;
              commit(() => (done = hangIn(museum, target, painting)));
              if (done) {
                roomId = target.id;
                focusPreview({ art: art.id });
              } else notify(`« ${text(target.name)} » est pleine, ou son plafond est trop bas pour cette œuvre.`);
            },
          },
            home ? null : h('option', { value: '', selected: true, disabled: true }, 'En réserve'),
            ...museum.rooms.filter((r) => r.autoHang || r === home).map((r) => h('option', { value: r.id, selected: r === home }, text(r.name))),
          ),
        )
      : null,
    h('div', { class: 'row end' },
      home ? h('button', { type: 'button', onclick: () => commit(() => toReserve(museum, art)) }, 'Mettre en réserve') : null,
      h('button', {
        type: 'button',
        class: 'danger',
        onclick: () => {
          if (!confirm(`Supprimer définitivement « ${titleOf(art)} » ?`)) return;
          editing = null;
          commit(() => removeWork(museum, art));
        },
      }, 'Supprimer l’œuvre'),
    ),
  ];
}

// --- Recadrage -------------------------------------------------------------------------------
let cropTarget: PaintingConfig | null = null;
const cropBox = { x: 0, y: 0, w: 1, h: 1 };

function drawCrop() {
  const box = $('crop-box');
  box.style.left = `${cropBox.x * 100}%`;
  box.style.top = `${cropBox.y * 100}%`;
  box.style.width = `${cropBox.w * 100}%`;
  box.style.height = `${cropBox.h * 100}%`;
}
function openCrop(art: PaintingConfig) {
  cropTarget = art;
  Object.assign(cropBox, { x: 0.04, y: 0.04, w: 0.92, h: 0.92 });
  const img = $<HTMLImageElement>('crop-img');
  img.onerror = () => {
    $('crop').hidden = true;
    notify('La photo d’origine de cette œuvre n’a pas été déposée par l’éditeur : elle ne peut pas y être recadrée.');
  };
  img.src = `${api.sourceUrl(museum.id, art.id)}?t=${Date.now()}`;
  drawCrop();
  $('crop').hidden = false;
  $('crop-apply').focus();
}
async function applyCrop(full: boolean) {
  const art = cropTarget;
  if (!art) return;
  $('crop').hidden = true;
  try {
    status('Recadrage…', 'busy');
    const image = await api.cropImage(museum.id, art.id, full ? null : { ...cropBox });
    commit(() => {
      art.image = image;
      // La hauteur de l'œuvre fait foi : sa largeur suit les nouvelles proportions.
      art.width = Math.round(((art.height * image.width!) / image.height!) * 1000) / 1000;
    });
    focusPreview({ art: art.id });
  } catch (error) {
    notify((error as Error).message);
    status('Enregistré');
  }
}
$('crop-apply').addEventListener('click', () => applyCrop(false));
$('crop-full').addEventListener('click', () => applyCrop(true));
$('crop-cancel').addEventListener('click', () => ($('crop').hidden = true));
window.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && !$('crop').hidden) $('crop').hidden = true;
});
{
  // Poignées : on tire un coin, ou le cadre entier.
  const stage = $('crop-stage');
  let drag: { handle: string; startX: number; startY: number; box: typeof cropBox } | null = null;
  stage.addEventListener('pointerdown', (e) => {
    const target = e.target as HTMLElement;
    const handle = target.dataset.h ?? (target.id === 'crop-box' ? 'move' : '');
    if (!handle) return;
    e.preventDefault();
    stage.setPointerCapture(e.pointerId);
    drag = { handle, startX: e.clientX, startY: e.clientY, box: { ...cropBox } };
  });
  stage.addEventListener('pointermove', (e) => {
    if (!drag) return;
    const rect = $('crop-img').getBoundingClientRect();
    const dx = (e.clientX - drag.startX) / rect.width;
    const dy = (e.clientY - drag.startY) / rect.height;
    const b = drag.box;
    const min = 0.05;
    let { x, y, w, h: height } = b;
    if (drag.handle === 'move') {
      x = Math.min(1 - w, Math.max(0, b.x + dx));
      y = Math.min(1 - height, Math.max(0, b.y + dy));
    } else {
      if (drag.handle.includes('w')) {
        x = Math.min(b.x + b.w - min, Math.max(0, b.x + dx));
        w = b.x + b.w - x;
      }
      if (drag.handle.includes('e')) w = Math.min(1 - b.x, Math.max(min, b.w + dx));
      if (drag.handle.includes('n')) {
        y = Math.min(b.y + b.h - min, Math.max(0, b.y + dy));
        height = b.y + b.h - y;
      }
      if (drag.handle.includes('s')) height = Math.min(1 - b.y, Math.max(min, b.h + dy));
    }
    Object.assign(cropBox, { x, y, w, h: height });
    drawCrop();
  });
  const end = () => (drag = null);
  stage.addEventListener('pointerup', end);
  stage.addEventListener('pointercancel', end);
}

// --- Onglet Contrôle ---------------------------------------------------------------------------
/** Noms des champs dans les mots de l'éditeur. */
const FIELD_NAMES: Record<string, string> = { description: 'commentaire' };

/**
 * Les points relevés par le contrôle, regroupés par salle ou par œuvre et dits simplement :
 * « à renseigner : artiste, technique » plutôt qu'une ligne par champ et par langue.
 */
function summarize(items: Issue[]) {
  const groups = new Map<string, { missing: string[]; other: string[] }>();
  for (const issue of items) {
    const group = groups.get(issue.where) ?? { missing: [], other: [] };
    groups.set(issue.where, group);
    const untranslated = /^(.+) : traduction manquante \((.+)\)$/.exec(issue.message);
    if (untranslated) {
      const name = FIELD_NAMES[untranslated[1]] ?? untranslated[1];
      const langs = untranslated[2].split(', ').map((l) => LANG_NAMES[l] ?? l);
      group.missing.push(museum.langs.length > 1 ? `${name} (${langs.join(', ')})` : name);
    } else if (issue.message === 'artiste manquant') group.missing.push('artiste');
    else group.other.push(issue.message);
  }
  return groups;
}

function checkPane(): Child[] {
  const names = new Map<string, string>();
  for (const art of allWorks(museum)) names.set(art.id, titleOf(art));
  for (const r of museum.rooms) names.set(r.id, text(r.name));
  // « Œuvre "vase-2" » devient « Œuvre « Vase bleu » » : la personne ne connaît pas les identifiants.
  const readable = (where: string) => where.replace(/"([^"]+)"/g, (_, id: string) => `« ${names.get(id) ?? id} »`);
  const errors = issues.filter((i) => i.level === 'error');
  const warnings = summarize(issues.filter((i) => i.level === 'warning'));
  const list = (groups: ReturnType<typeof summarize>) =>
    h('ul', { class: 'issues' },
      ...[...groups].map(([where, group]) => {
        const artId = /^Œuvre "([^"]+)"/.exec(where)?.[1];
        const parts = [group.missing.length ? `à renseigner : ${group.missing.join(', ')}` : '', ...group.other].filter(Boolean);
        return h('li', {},
          h('span', {}, h('strong', {}, readable(where)), ` · ${parts.join(' ; ')}`),
          artId && allWorks(museum).some((a) => a.id === artId)
            ? h('button', {
                type: 'button',
                onclick: () => {
                  tab = 'oeuvres';
                  renderTabs();
                  openWork(artId);
                },
              }, 'Compléter')
            : null,
        );
      }),
    );
  return [
    h('h2', {}, 'Contrôle du musée'),
    issues.length === 0 ? h('p', { class: 'callout ok' }, 'Tout est en ordre : le musée est complet.') : null,
    errors.length ? h('section', { class: 'callout error' }, h('h3', {}, plural(errors.length, 'erreur empêche', 'erreurs empêchent') + ' le musée de s’ouvrir'), list(summarize(errors))) : null,
    warnings.size ? h('section', {}, h('h3', {}, plural(warnings.size, 'fiche à compléter', 'fiches à compléter')), h('p', { class: 'hint' }, 'Le musée fonctionne déjà. Ces textes manquent encore sur les cartels.'), list(warnings)) : null,
  ];
}

// --- Accueil de l'éditeur : mes musées, créer un musée ---------------------------------------------
async function showHome(missing = false) {
  $('workspace').hidden = true;
  const home = $('home');
  home.hidden = false;
  if (!(await api.available())) {
    home.replaceChildren(
      h('h1', {}, 'Éditeur de musée'),
      h('p', { class: 'callout error' }, 'L’éditeur fonctionne sur votre ordinateur. Lancez la commande « npm run dev » dans le dossier du projet, puis ouvrez http://localhost:5173/editeur.html'),
    );
    return;
  }
  const museums = await api.listMuseums();
  let plan = PLANS[0].id;
  const name = h('input', { type: 'text', id: 'new-name', placeholder: 'Nom du musée', required: true });
  const plans = h('div', { class: 'plans', role: 'radiogroup', 'aria-label': 'Plan du musée' },
    ...PLANS.map((p) => {
      const sketch = h('div', { class: 'plan' });
      buildMap(sketch, { ...p.build(), id: p.id, name: {}, langs: ['fr'], defaultLang: 'fr' }, () => {}, true);
      const card = h('button', { type: 'button', class: 'plan-card', role: 'radio', 'aria-checked': String(p.id === plan), 'data-plan': p.id },
        sketch,
        h('strong', {}, p.name),
        h('small', {}, p.summary),
      );
      card.addEventListener('click', () => {
        plan = p.id;
        for (const other of plans.children) other.setAttribute('aria-checked', String(other === card));
      });
      return card;
    }),
  );
  const form = h('form', { class: 'create', id: 'create' },
    h('h2', {}, 'Créer un musée'),
    h('label', { class: 'field' }, h('span', {}, 'Nom du musée'), name),
    h('p', { class: 'field-label' }, 'Plan'),
    plans,
    h('button', { type: 'submit', class: 'primary' }, 'Créer le musée'),
    h('p', { class: 'hint' }, 'Le plan se choisit à la création. Les salles pourront ensuite être renommées et changer de décor.'),
  );
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const created = createMuseum(name.value, plan, museums.map((m) => m.id));
    try {
      await api.saveMuseum(created);
      location.search = `?m=${created.id}`;
    } catch (error) {
      notify((error as Error).message);
    }
  });
  fill(home, [
    h('h1', {}, 'Mes musées'),
    missing ? h('p', { class: 'callout error' }, 'Ce musée est introuvable. Il a peut-être été renommé ou supprimé.') : null,
    museums.length === 0 ? h('p', { class: 'muted' }, 'Aucun musée pour l’instant.') : null,
    h('ul', { class: 'museums' },
      ...museums.map((m) =>
        h('li', {},
          h('a', { href: `?m=${m.id}` },
            h('strong', {}, text(m.name, 'fr') || m.id),
            h('span', { class: 'muted' }, `${plural(m.rooms, 'salle', 'salles')} · ${plural(m.works, 'œuvre', 'œuvres')}`),
            h('span', { class: 'go' }, 'Modifier'),
          ),
        ),
      ),
    ),
    form,
  ]);
}

// --- Démarrage ----------------------------------------------------------------------------------
async function start() {
  const id = new URLSearchParams(location.search).get('m');
  if (!id) return showHome();
  try {
    museum = await api.loadMuseum(id);
  } catch {
    return showHome(true);
  }
  museum.id = id;
  roomId = museum.rooms[0]?.id ?? '';
  $('home').hidden = true;
  $('workspace').hidden = false;
  renderHeader();
  check();
  renderPane();
  status('Enregistré');
  frame().addEventListener('load', () => {
    previewLoading = false;
    applyFocus();
  });
  reloadPreview();
}
void start();

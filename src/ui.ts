import type { AudioGuide } from './audio';
import type { Quality } from './engine/quality';
import type { Style } from './engine/styles';
import { loc, type MuseumConfig } from './engine/types';

/** Textes de l'interface. Les textes du musée, eux, viennent de sa configuration. */
export const UI: Record<string, Record<string, string>> = {
  fr: {
    help: 'Glissez pour regarder · cliquez au sol ou utilisez les flèches pour avancer · cliquez sur une œuvre',
    helpTouch: 'Glissez pour regarder · touchez le sol ou la manette pour avancer · touchez une œuvre',
    welcomeKicker: 'Visite virtuelle · entrée libre',
    room: 'salle',
    rooms: 'salles',
    work: 'œuvre',
    works: 'œuvres',
    tourCount: 'parcours',
    toursCount: 'parcours',
    enter: 'Entrer dans le musée',
    welcomeLook: 'Glissez pour regarder autour de vous',
    welcomeMove: 'Cliquez au sol, ou utilisez les flèches, pour avancer',
    welcomeMoveTouch: 'Touchez le sol, ou utilisez la manette, pour avancer',
    welcomeOpen: 'Cliquez sur une œuvre pour la découvrir',
    welcomeOpenTouch: 'Touchez une œuvre pour la découvrir',
    welcomeSimple: 'Vue simplifiée, sans 3D',
    close: 'Fermer',
    lang: 'Langue',
    map: 'Plan',
    mapTitle: 'Plan du musée',
    mapHint: 'Choisissez une salle pour vous y rendre.',
    carnet: 'Carnet',
    carnetTitle: 'Carnet de visite',
    carnetCount: '{n} œuvres vues sur {total}',
    carnetRoomDone: 'salle terminée',
    carnetRoomToast: 'Salle terminée : {room}',
    carnetAllDone: 'Bravo, vous avez vu toutes les œuvres du musée.',
    carnetReset: 'Recommencer le carnet',
    tours: 'Parcours',
    toursTitle: 'Parcours de visite',
    toursHint: 'Un parcours vous conduit d’œuvre en œuvre, à votre rythme. « Présentation » le déroule tout seul, avec la voix.',
    stops: 'étapes',
    present: 'Présentation',
    presentStart: 'Lancer la présentation automatique',
    presentStop: 'Arrêter la présentation automatique',
    presentDone: 'La présentation est terminée.',
    loading: 'Les œuvres s’installent…',
    sound: 'Son d’ambiance',
    startTour: 'Commencer',
    step: 'Étape {i} sur {n}',
    prev: 'Précédent',
    next: 'Suivant',
    finish: 'Terminer',
    quitTour: 'Quitter le parcours',
    resume: 'Reprendre le parcours',
    listen: 'Écouter le commentaire',
    roomIntro: 'Écouter la présentation de la salle',
    stopAudio: 'Arrêter la lecture',
    simpleView: 'Vue simplifiée',
    allMuseums: 'Musées',
    view3d: 'Visite 3D',
    vr: 'Casque VR',
    simpleIntro: 'Toutes les œuvres du musée, salle par salle, sans visite en 3D.',
    noWebgl: 'La visite en 3D n’est pas disponible sur cet appareil. Voici le musée en vue simplifiée.',
    height: 'H.',
    record: 'Voir la notice du musée',
    enlarge: 'Agrandir',
    sourcePhoto: 'Photographie de l’objet exposé',
    examine: 'Examiner',
    explore: 'Explorer les détails',
    detailCount: 'Détail {i} sur {n}',
    detailsTitle: 'Détails à regarder',
    overview: 'Vue d’ensemble',
    zoomHintDetails: 'Touchez un point numéroté pour découvrir un détail',
    inspectHint: 'Glissez pour faire tourner · molette ou deux doigts pour approcher · Échap pour fermer',
    inspectSpin: 'Rotation automatique',
    zoomIn: 'Grossir',
    zoomOut: 'Réduire',
    zoomHint: 'Molette ou deux doigts pour grossir · glissez pour déplacer · Échap pour fermer',
    error: 'Impossible de charger ce musée.',
    configErrors: 'La configuration de ce musée contient des erreurs',
  },
  en: {
    help: 'Drag to look · click the floor or use the arrow keys to move · click an artwork',
    helpTouch: 'Drag to look · tap the floor or use the joystick to move · tap an artwork',
    welcomeKicker: 'Virtual visit · free entry',
    room: 'room',
    rooms: 'rooms',
    work: 'work',
    works: 'works',
    tourCount: 'tour',
    toursCount: 'tours',
    enter: 'Enter the museum',
    welcomeLook: 'Drag to look around',
    welcomeMove: 'Click the floor, or use the arrow keys, to move',
    welcomeMoveTouch: 'Tap the floor, or use the joystick, to move',
    welcomeOpen: 'Click an artwork to discover it',
    welcomeOpenTouch: 'Tap an artwork to discover it',
    welcomeSimple: 'Simple view, without 3D',
    close: 'Close',
    lang: 'Language',
    map: 'Map',
    mapTitle: 'Museum map',
    mapHint: 'Choose a room to go there.',
    carnet: 'Journal',
    carnetTitle: 'Visit journal',
    carnetCount: '{n} of {total} works seen',
    carnetRoomDone: 'room completed',
    carnetRoomToast: 'Room completed: {room}',
    carnetAllDone: 'Well done, you have seen every work in the museum.',
    carnetReset: 'Start the journal again',
    tours: 'Tours',
    toursTitle: 'Guided tours',
    toursHint: 'A tour takes you from one artwork to the next, at your own pace. “Presentation” plays it by itself, with the voice.',
    stops: 'stops',
    present: 'Presentation',
    presentStart: 'Start the automatic presentation',
    presentStop: 'Stop the automatic presentation',
    presentDone: 'The presentation is over.',
    loading: 'The artworks are settling in…',
    sound: 'Ambient sound',
    startTour: 'Start',
    step: 'Stop {i} of {n}',
    prev: 'Previous',
    next: 'Next',
    finish: 'Finish',
    quitTour: 'Leave the tour',
    resume: 'Resume the tour',
    listen: 'Listen to the commentary',
    roomIntro: 'Listen to the room introduction',
    stopAudio: 'Stop playback',
    simpleView: 'Simple view',
    allMuseums: 'Museums',
    view3d: '3D visit',
    vr: 'VR headset',
    simpleIntro: 'Every artwork in the museum, room by room, without the 3D visit.',
    noWebgl: 'The 3D visit is not available on this device. Here is the museum in simple view.',
    height: 'H.',
    record: 'View the museum record',
    enlarge: 'Enlarge',
    sourcePhoto: 'Photograph of the object on display',
    examine: 'Examine',
    explore: 'Explore the details',
    detailCount: 'Detail {i} of {n}',
    detailsTitle: 'Details to look at',
    overview: 'Whole picture',
    zoomHintDetails: 'Tap a numbered point to discover a detail',
    inspectHint: 'Drag to turn · scroll or pinch to move closer · Esc to close',
    inspectSpin: 'Automatic rotation',
    zoomIn: 'Zoom in',
    zoomOut: 'Zoom out',
    zoomHint: 'Scroll or pinch to zoom · drag to move · Esc to close',
    error: 'This museum could not be loaded.',
    configErrors: 'This museum’s configuration contains errors',
  },
};

export const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

/** Ce que partagent la visite 3D et la vue simplifiée. */
export interface App {
  museum: MuseumConfig;
  /** Style d'architecture effectif, couleurs du musée comprises. */
  style: Style;
  /** Niveau de qualité du rendu pour cet appareil. */
  quality: Quality;
  /** Adresse du dossier du musée, pour résoudre images et sons. */
  base: string;
  /** Aperçu dans l'éditeur : pas d'écran d'accueil, et le visiteur retrouve sa place à chaque rechargement. */
  preview?: boolean;
  lang: string;
  ui(): Record<string, string>;
  guide: AudioGuide;
}

export interface View {
  setLang(lang: string): void;
  /** Part des œuvres déjà chargées, de 0 à 1. */
  progress?(): number;
  /** Ouverture : tant que l'accueil est affiché, le regard parcourt lentement la salle. */
  intro?(on: boolean): void;
  /** Lance un parcours en mode présentation : il se déroule seul, avec la voix. */
  present?(tourId: string): void;
}

type Artwork = MuseumConfig['rooms'][number]['artworks'][number];

/**
 * Remplit la mention d'une œuvre : son lieu de conservation, la licence de son image,
 * et un lien vers sa notice sur le site du musée. Sans mention ni lien, la ligne disparaît.
 */
export function renderCredit(node: HTMLElement, app: App, a: Artwork) {
  const text = a.credit ? (a.credit[app.lang] ?? Object.values(a.credit)[0] ?? '') : '';
  node.replaceChildren();
  node.hidden = !text && !a.link;
  if (text) node.append(text);
  if (a.link && /^https:\/\//.test(a.link)) {
    if (text) node.append(' · ');
    const link = Object.assign(document.createElement('a'), { href: a.link, target: '_blank', rel: 'noopener', textContent: app.ui().record });
    node.append(link);
  }
}

/**
 * Montre la photographie de l'objet réel dans la fiche d'un objet reconstitué en 3D.
 * Sans elle, la figure disparaît. Renvoie l'adresse de la photographie, ou null.
 */
export function renderSourcePhoto(node: HTMLElement, app: App, a: Artwork): string | null {
  const file = a.type === 'sculpture' ? a.sourcePhoto : undefined;
  const img = node.querySelector('img')!;
  node.hidden = !file;
  if (!file) {
    img.removeAttribute('src');
    return null;
  }
  const src = new URL(file, app.base).href;
  const caption = app.ui().sourcePhoto;
  // L'adresse n'est réécrite que si elle change : rouvrir la même fiche ne recharge pas l'image.
  if (img.src !== src) img.src = src;
  img.alt = caption;
  node.querySelector('button')!.setAttribute('aria-label', `${app.ui().enlarge} : ${caption}`);
  node.querySelector('figcaption')!.textContent = caption;
  return src;
}

/** Ligne de légende d'une œuvre : date, technique, dimensions. */
export function metaLine(app: App, a: Artwork): string {
  const size =
    a.type === 'painting'
      ? `${Math.round(a.height * 100)} × ${Math.round(a.width * 100)} cm`
      : `${app.ui().height} ${Math.round(a.height * 100)} cm`;
  // Un cartel encore incomplet n'affiche que ce qu'il sait.
  return [loc(a.year, app.lang), a.medium?.[app.lang] ?? Object.values(a.medium ?? {})[0], size].filter((part) => part?.trim()).join(' · ');
}

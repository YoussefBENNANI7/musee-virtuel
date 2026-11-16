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
    tours: 'Parcours',
    toursTitle: 'Parcours de visite',
    toursHint: 'Un parcours vous conduit d’œuvre en œuvre, à votre rythme.',
    stops: 'étapes',
    startTour: 'Commencer',
    step: 'Étape {i} sur {n}',
    prev: 'Précédent',
    next: 'Suivant',
    finish: 'Terminer',
    quitTour: 'Quitter le parcours',
    resume: 'Reprendre le parcours',
    listen: 'Écouter le commentaire',
    stopAudio: 'Arrêter la lecture',
    simpleView: 'Vue simplifiée',
    view3d: 'Visite 3D',
    vr: 'Casque VR',
    simpleIntro: 'Toutes les œuvres du musée, salle par salle, sans visite en 3D.',
    noWebgl: 'La visite en 3D n’est pas disponible sur cet appareil. Voici le musée en vue simplifiée.',
    height: 'H.',
    record: 'Voir la notice du musée',
    enlarge: 'Agrandir',
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
    tours: 'Tours',
    toursTitle: 'Guided tours',
    toursHint: 'A tour takes you from one artwork to the next, at your own pace.',
    stops: 'stops',
    startTour: 'Start',
    step: 'Stop {i} of {n}',
    prev: 'Previous',
    next: 'Next',
    finish: 'Finish',
    quitTour: 'Leave the tour',
    resume: 'Resume the tour',
    listen: 'Listen to the commentary',
    stopAudio: 'Stop playback',
    simpleView: 'Simple view',
    view3d: '3D visit',
    vr: 'VR headset',
    simpleIntro: 'Every artwork in the museum, room by room, without the 3D visit.',
    noWebgl: 'The 3D visit is not available on this device. Here is the museum in simple view.',
    height: 'H.',
    record: 'View the museum record',
    enlarge: 'Enlarge',
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
  lang: string;
  ui(): Record<string, string>;
  guide: AudioGuide;
}

export interface View {
  setLang(lang: string): void;
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

/** Ligne de légende d'une œuvre : date, technique, dimensions. */
export function metaLine(app: App, a: Artwork): string {
  const size =
    a.type === 'painting'
      ? `${Math.round(a.height * 100)} × ${Math.round(a.width * 100)} cm`
      : `${app.ui().height} ${Math.round(a.height * 100)} cm`;
  return `${loc(a.year, app.lang)} · ${a.medium[app.lang] ?? Object.values(a.medium)[0]} · ${size}`;
}

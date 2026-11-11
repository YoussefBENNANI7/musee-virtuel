import type { AudioGuide } from './audio';
import type { MuseumConfig } from './engine/types';

/** Textes de l'interface. Les textes du musée, eux, viennent de sa configuration. */
export const UI: Record<string, Record<string, string>> = {
  fr: {
    help: 'Glissez pour regarder · ZQSD ou flèches pour avancer · cliquez sur une œuvre',
    helpTouch: 'Glissez pour regarder · manette pour avancer · touchez une œuvre',
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
    simpleIntro: 'Toutes les œuvres du musée, salle par salle, sans visite en 3D.',
    noWebgl: 'La visite en 3D n’est pas disponible sur cet appareil. Voici le musée en vue simplifiée.',
    height: 'H.',
    error: 'Impossible de charger ce musée.',
  },
  en: {
    help: 'Drag to look · WASD or arrows to move · click an artwork',
    helpTouch: 'Drag to look · joystick to move · tap an artwork',
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
    simpleIntro: 'Every artwork in the museum, room by room, without the 3D visit.',
    noWebgl: 'The 3D visit is not available on this device. Here is the museum in simple view.',
    height: 'H.',
    error: 'This museum could not be loaded.',
  },
};

export const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

/** Ce que partagent la visite 3D et la vue simplifiée. */
export interface App {
  museum: MuseumConfig;
  /** Adresse du dossier du musée, pour résoudre images et sons. */
  base: string;
  lang: string;
  ui(): Record<string, string>;
  guide: AudioGuide;
}

export interface View {
  setLang(lang: string): void;
}

/** Ligne de légende d'une œuvre : date, technique, dimensions. */
export function metaLine(app: App, a: MuseumConfig['rooms'][number]['artworks'][number]): string {
  const size =
    a.type === 'painting'
      ? `${Math.round(a.height * 100)} × ${Math.round(a.width * 100)} cm`
      : `${app.ui().height} ${Math.round(a.height * 100)} cm`;
  return `${a.year} · ${a.medium[app.lang] ?? Object.values(a.medium)[0]} · ${size}`;
}

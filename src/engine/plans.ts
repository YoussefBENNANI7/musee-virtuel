import type { DoorConfig, MuseumConfig, RoomConfig } from './types';

/*
 * Plans tout faits : des musées vides, prêts à recevoir des œuvres. L'éditeur en propose le choix
 * à la création d'un musée. Les salles se touchent bord à bord, comme l'exige le moteur.
 */

export interface PlanPreset {
  id: string;
  name: string;
  /** En une phrase : pour quel musée ce plan convient. */
  summary: string;
  build(): Pick<MuseumConfig, 'rooms' | 'doors' | 'start'>;
}

const room = (id: string, fr: string, en: string, position: [number, number], size: [number, number, number], decor: string, extra: Partial<RoomConfig> = {}): RoomConfig => ({
  id,
  name: { fr, en },
  position,
  size,
  decor,
  autoHang: true,
  ...extra,
  artworks: [],
});
const door = (roomId: string, wall: DoorConfig['wall'], offset = 0, width = 2.2): DoorConfig => ({ room: roomId, wall, offset, width });
const EAST = -Math.PI / 2;

export const PLANS: PlanPreset[] = [
  {
    id: 'une-salle',
    name: 'Une grande salle',
    summary: 'Pour une exposition courte : une dizaine d’œuvres autour d’une seule salle.',
    build: () => ({
      rooms: [room('salle-1', 'Salle d’exposition', 'Exhibition room', [0, 0], [12, 4.4, 9], 'pierre-claire', { benches: [{ position: [0, 0] }] })],
      doors: [],
      start: { room: 'salle-1', position: [0, 2.6], yaw: 0 },
    }),
  },
  {
    id: 'enfilade',
    name: 'Trois salles en enfilade',
    summary: 'Un parcours simple, d’une salle à la suivante : idéal pour raconter une histoire en trois temps.',
    build: () => ({
      rooms: [
        room('salle-1', 'Première salle', 'First room', [-9, 0], [9, 4.2, 8], 'pierre-claire'),
        room('salle-2', 'Deuxième salle', 'Second room', [0, 0], [9, 4.2, 8], 'argile-claire'),
        room('salle-3', 'Troisième salle', 'Third room', [9, 0], [9, 4.2, 8], 'terre-cuite'),
      ],
      doors: [door('salle-1', 'east'), door('salle-2', 'east')],
      start: { room: 'salle-1', position: [-2.6, 0], yaw: EAST },
    }),
  },
  {
    id: 'galerie',
    name: 'Une galerie et deux cabinets',
    summary: 'Une longue galerie pour les grandes pièces, et deux petites salles pour les œuvres à regarder de près.',
    build: () => ({
      rooms: [
        room('galerie', 'Grande galerie', 'Great gallery', [0, 0], [18, 4.8, 7], 'pierre-claire', { benches: [{ position: [0, 1.2] }] }),
        room('cabinet-1', 'Premier cabinet', 'First cabinet', [-4.5, -7], [9, 4, 7], 'argile-claire'),
        room('cabinet-2', 'Second cabinet', 'Second cabinet', [4.5, -7], [9, 4, 7], 'nuit'),
      ],
      doors: [door('galerie', 'north', -4.5), door('galerie', 'north', 4.5)],
      start: { room: 'galerie', position: [0, 2], yaw: 0 },
    }),
  },
  {
    id: 'atrium',
    name: 'Un atrium et quatre salles',
    summary: 'Un grand musée : un atrium central qui distribue trois salles, et une dernière salle au fond.',
    build: () => ({
      rooms: [
        room('atrium', 'Atrium', 'Atrium', [0, 0], [10, 5.5, 10], 'pierre-claire', { ceiling: { type: 'skylight', margin: 2 } }),
        room('salle-nord', 'Salle nord', 'North room', [0, -9], [9, 4.2, 8], 'argile-claire'),
        room('salle-est', 'Salle est', 'East room', [9, 0], [8, 4.2, 9], 'terre-cuite'),
        room('salle-ouest', 'Salle ouest', 'West room', [-9, 0], [8, 4.2, 9], 'nuit'),
        room('salle-du-fond', 'Salle du fond', 'Far room', [0, -17], [9, 4.2, 8], 'pierre-claire'),
      ],
      doors: [door('atrium', 'north', 0, 2.6), door('atrium', 'east'), door('atrium', 'west'), door('salle-nord', 'north')],
      start: { room: 'atrium', position: [0, 3.4], yaw: 0 },
    }),
  },
];

export const planById = (id: string): PlanPreset => PLANS.find((p) => p.id === id) ?? PLANS[0];

import type { ImageSource, L10n, MuseumConfig } from '../engine/types';

/* Échanges entre l'éditeur et le service local qui écrit sur le disque (scripts/editeur-serveur.mjs). */

export interface MuseumSummary {
  id: string;
  name: L10n;
  rooms: number;
  works: number;
  /** Vrai pour la démonstration, qui ne se supprime pas depuis l'éditeur. */
  locked?: boolean;
  /** Vrai si le musée est proposé sur la page de choix des musées. */
  shown?: boolean;
}

/** Ce que la page de choix des musées montre d'un musée. */
export interface Showcase {
  shown: boolean;
  summary: L10n;
  /** Image de la carte, depuis le dossier des musées ; null si le musée n'en a pas encore. */
  image: string | null;
}

/** Où en est le calcul de la lumière précalculée d'un musée (npm run lumiere, lancé par l'éditeur). */
export interface LumiereJob {
  /** Blender est installé sur cet ordinateur. */
  installed: boolean;
  running: boolean;
  /** Autre musée dont la lumière est en train d'être calculée, s'il y en a un. */
  busy: string | null;
  started: number | null;
  ended: number | null;
  ok: boolean | null;
  /** Dernière étape annoncée par le calcul. */
  step: string | null;
  /** Salle en cours de calcul (identifiant), et son rang parmi les salles à calculer. */
  progress: { room: string; index: number; total: number } | null;
  /** Dernières lignes affichées par le calcul, pour comprendre un échec. */
  lines: string[];
}
export type StoredImage = Extract<ImageSource, { src: string }>;
export interface Crop {
  x: number;
  y: number;
  w: number;
  h: number;
}

// Cet en-tête prouve que la demande vient de la page de l'éditeur.
const HEADERS = { 'X-Musee-Editeur': '1' };

async function ask<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`__editeur/${path}`, { ...init, headers: { ...HEADERS, ...init?.headers } });
  } catch {
    throw new Error('le service de l’éditeur ne répond pas : la commande « npm run dev » tourne-t-elle encore ?');
  }
  const body = await res.json().catch(() => null);
  if (!res.ok) throw new Error(body?.error ?? `erreur ${res.status}`);
  return body as T;
}

/** Vrai si le service local répond : l'éditeur ne fonctionne qu'avec « npm run dev ». */
export async function available(): Promise<boolean> {
  try {
    const res = await fetch('__editeur/museums');
    return res.ok && (res.headers.get('content-type') ?? '').includes('json');
  } catch {
    return false;
  }
}

export const listMuseums = () => ask<{ museums: MuseumSummary[] }>('museums').then((r) => r.museums);

export async function loadMuseum(id: string): Promise<MuseumConfig> {
  const res = await fetch(`museums/${encodeURIComponent(id)}/museum.json`, { cache: 'no-store' });
  if (!res.ok) throw new Error('musée introuvable');
  return res.json();
}

/** Supprime un musée : son dossier est rangé à part. Renvoie l'endroit où il est gardé. */
export const deleteMuseum = (id: string) => ask<{ kept: string }>(`museums/${id}`, { method: 'DELETE' }).then((r) => r.kept);

export const saveMuseum = (museum: MuseumConfig) =>
  ask<{ saved: boolean }>(`museums/${museum.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(museum) });

/** Les formats que le service sait lire tels quels. Les autres sont d'abord convertis par le navigateur. */
const DIRECT = ['image/jpeg', 'image/png', 'image/webp'];

/** Photo prête à l'envoi : telle quelle, ou convertie en JPEG si le navigateur sait la lire (HEIC sur Safari). */
async function prepare(file: File): Promise<Blob> {
  if (DIRECT.includes(file.type)) return file;
  try {
    const bitmap = await createImageBitmap(file);
    const canvas = document.createElement('canvas');
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    canvas.getContext('2d')!.drawImage(bitmap, 0, 0);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.93));
    if (blob) return blob;
  } catch {
    // Le navigateur ne sait pas lire ce format : le message ci-dessous l'explique.
  }
  throw new Error(`« ${file.name} » : format non pris en charge. Exportez la photo en JPEG ou en PNG.`);
}

export async function uploadImage(museumId: string, artId: string, file: File): Promise<StoredImage> {
  const body = await prepare(file);
  return ask<{ image: StoredImage }>(`museums/${museumId}/images/${artId}`, { method: 'POST', headers: { 'Content-Type': 'application/octet-stream' }, body }).then((r) => r.image);
}

/** Recadre la photo d'origine d'une œuvre ; sans zone, garde toute la photo. */
export const cropImage = (museumId: string, artId: string, crop: Crop | null) =>
  ask<{ image: StoredImage }>(`museums/${museumId}/images/${artId}?crop=${crop ? [crop.x, crop.y, crop.w, crop.h].map((n) => n.toFixed(4)).join(',') : '0,0,1,1'}`, { method: 'POST' }).then((r) => r.image);

/** Place du musée sur la page de choix des musées. */
export const showcase = (id: string) => ask<Showcase>(`museums/${id}/vitrine`);
export const setShowcase = (id: string, change: { shown?: boolean; summary?: L10n }) =>
  ask<Showcase>(`museums/${id}/vitrine`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(change) });

/** Photo de couverture du musée, déposée ou prise dans l'aperçu. Renvoie son chemin depuis le dossier des musées. */
export async function uploadCover(id: string, picture: File | Blob): Promise<string> {
  const body = picture instanceof File ? await prepare(picture) : picture;
  return ask<{ image: string }>(`museums/${id}/couverture`, { method: 'POST', headers: { 'Content-Type': 'application/octet-stream' }, body }).then((r) => r.image);
}

export const lumiereStatus = (id: string) => ask<LumiereJob>(`museums/${id}/lumiere`);
/** Lance le calcul de la lumière des salles modifiées (ou jamais calculées) du musée. */
export const startLumiere = (id: string) => ask<LumiereJob>(`museums/${id}/lumiere`, { method: 'POST' });

/** Rétablit le musée de démonstration tel qu'il est dans le projet. */
export const restoreDemo = () => ask<{ restored: boolean }>('museums/demo/retablir', { method: 'POST' });

export const sourceUrl = (museumId: string, artId: string) => `museums/${museumId}/images/sources/${artId}.jpg`;

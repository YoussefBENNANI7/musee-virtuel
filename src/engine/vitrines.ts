import * as THREE from 'three';
import { litColor, type ArtworkContext, type PlacedArtwork } from './artworks';
import { objectLight, type Decor } from './decors';
import { groundShadow } from './furniture';
import { lightBeam } from './rotonde';
import { reliefTexture } from './relief';
import { poolTexture } from './textures';
import type { CoinMetal, RoomConfig, SculptureConfig, VitrineConfig } from './types';

/**
 * Vitrine à pièces de monnaie : un socle, un plateau, une cloche de verre, et jusqu'à cinq cubes
 * noirs de hauteurs différentes. Chaque pièce est une œuvre à part entière : on clique dessus pour
 * ouvrir sa fiche, et on l'examine seule sous tous les angles.
 */
export const VITRINE = { side: 0.66, plinth: 0.92, glass: 0.6 };
/** Titre lettré sur la face avant du socle : hauteur de son centre, hauteur de ligne, couleur de laiton. */
export const VITRINE_TITLE = { y: 0.66, height: 0.05, color: '#c9a45a' };
/** Rayon au sol que le visiteur contourne. */
export const VITRINE_RADIUS = VITRINE.side * 0.71 + 0.22;
/** Places des pièces sur le plateau : position, côté et hauteur du cube. La face avant de la vitrine regarde le centre de la salle. */
export const SLOTS = [
  { x: 0, z: -0.03, side: 0.2, height: 0.3 },
  { x: -0.2, z: 0.17, side: 0.18, height: 0.13 },
  { x: 0.2, z: 0.17, side: 0.18, height: 0.13 },
  { x: -0.21, z: -0.2, side: 0.18, height: 0.2 },
  { x: 0.21, z: -0.2, side: 0.18, height: 0.2 },
];
const METALS: Record<CoinMetal, { color: string; roughness: number }> = {
  gold: { color: '#e3b34a', roughness: 0.32 },
  silver: { color: '#d2d2cc', roughness: 0.38 },
  bronze: { color: '#9a6a38', roughness: 0.45 },
};
/**
 * Relief d'une face de pièce : part de métal qui reflète la salle, vigueur du relief déduit de la photo, force des
 * reflets. La photo garde toutes ses couleurs ; les reflets s'y ajoutent, discrets : plus forts, ils la délavent
 * et la pièce prend l'air d'un papier d'aluminium froissé (essais du 21 novembre 2026).
 */
const RELIEF = { metal: 0.22, depth: 0.8, glints: 0.4 };
/** Inclinaison des pièces vers le visiteur, en radians : couchées à plat, on ne les verrait pas. */
const TILT = 0.5;
/** Grossissement des pièces dans leur vitrine : 1 = taille réelle, choix du porteur (18 novembre 2026). */
const DISPLAY_SCALE = 1;
const noRaycast = () => {};

/** Construit la vitrine vide. `beamTop` : hauteur d'où tombe son faisceau de lumière, ou 0 pour aucun. */
export function buildVitrine(cfg: VitrineConfig, room: RoomConfig, decor: Decor, beamTop = 0): THREE.Group {
  const group = new THREE.Group();
  group.position.set(room.position[0] + cfg.position[0], 0, room.position[1] + cfg.position[1]);
  // La face avant regarde le centre de la salle ; une vitrine placée au centre regarde le sud.
  if (Math.hypot(cfg.position[0], cfg.position[1]) > 0.01) group.rotation.y = Math.atan2(-cfg.position[0], -cfg.position[1]);
  const { side, plinth, glass } = VITRINE;
  const body = new THREE.Mesh(new THREE.BoxGeometry(side, plinth, side), new THREE.MeshStandardMaterial({ color: litColor(decor.colors.plinth, decor), roughness: 0.85 }));
  body.position.y = plinth / 2;
  const tray = new THREE.Mesh(new THREE.BoxGeometry(side + 0.03, 0.025, side + 0.03), new THREE.MeshStandardMaterial({ color: litColor('#0c0b0a', decor), roughness: 0.9 }));
  tray.position.y = plinth + 0.0125;
  // Cloche de verre : presque invisible, on la devine à ses arêtes.
  const box = new THREE.BoxGeometry(side - 0.02, glass, side - 0.02);
  const pane = new THREE.Mesh(box, new THREE.MeshStandardMaterial({ color: '#cfe8e2', transparent: true, opacity: 0.07, roughness: 0.05, depthWrite: false }));
  const edges = new THREE.LineSegments(new THREE.EdgesGeometry(box), new THREE.LineBasicMaterial({ color: '#a9d6cb', transparent: true, opacity: 0.45 * objectLight(decor) + 0.2 }));
  pane.position.y = edges.position.y = plinth + 0.025 + glass / 2;
  pane.raycast = noRaycast;
  edges.raycast = noRaycast;
  // Lumière concentrée sur le plateau, et faisceau qui tombe de la coupole.
  const pool = new THREE.Mesh(
    new THREE.PlaneGeometry(side * 1.7, side * 1.7),
    new THREE.MeshBasicMaterial({ map: poolTexture(), color: '#ffe2b0', opacity: 0.5, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }),
  );
  pool.rotation.x = -Math.PI / 2;
  pool.position.y = plinth + 0.027;
  pool.raycast = noRaycast;
  group.add(body, tray, pane, edges, pool, groundShadow(side, side));
  if (beamTop > plinth + 1) group.add(lightBeam(plinth + 0.03, beamTop, side * 0.62));
  return group;
}

/** Pose une pièce dans sa vitrine, sur son cube. `holder` : la vitrine construite par `buildVitrine`. */
export function placeCoin(cfg: SculptureConfig, room: RoomConfig, holder: THREE.Group, ctx: ArtworkContext): PlacedArtwork {
  const model = cfg.model as { coin: string; coinBack?: string; metal: CoinMetal; square?: boolean };
  const decor = ctx.decor(room.id);
  const slot = SLOTS[cfg.vitrine!.slot] ?? SLOTS[0];
  const top = VITRINE.plinth + 0.025 + slot.height;
  const radius = (cfg.height / 2) * DISPLAY_SCALE;
  const art = new THREE.Group();
  holder.add(art);

  const cube = new THREE.Mesh(new THREE.BoxGeometry(slot.side, slot.height, slot.side), new THREE.MeshStandardMaterial({ color: litColor('#111010', decor), roughness: 0.92 }));
  cube.position.set(slot.x, top - slot.height / 2, slot.z);
  const card = new THREE.Mesh(new THREE.PlaneGeometry(slot.side * 0.82, slot.side * 0.41), new THREE.MeshBasicMaterial({ color: '#ffffff', toneMapped: false }));
  card.position.set(slot.x, top - Math.min(slot.height / 2, 0.08), slot.z + slot.side / 2 + 0.001);

  // La pièce : un disque de métal, sa face photographiée, relevée vers le visiteur sur le bord du cube.
  const metal = METALS[model.metal] ?? METALS.bronze;
  // Une pièce reste en pleine lumière, même dans une salle tamisée : c'est elle qu'on vient voir.
  const light = Math.min(1, 0.55 + 0.45 * objectLight(decor));
  const edgeMaterial = new THREE.MeshStandardMaterial({ color: new THREE.Color(metal.color).multiplyScalar(light * 0.7), metalness: 0.9, roughness: metal.roughness, envMap: ctx.env, envMapIntensity: 1.1 });
  // Une face est montrée dans les couleurs de sa photo, comme un tableau : la photo est sa propre lumière, que l'éclairage
  // de la salle ne change pas. En attendant l'image, elle a la teinte du métal.
  const faceMaterial = () =>
    new THREE.MeshStandardMaterial({ color: '#000000', emissive: new THREE.Color(metal.color).multiplyScalar(0.8), metalness: 1, roughness: 0.36, envMap: ctx.env, envMapIntensity: 0, toneMapped: false });
  /**
   * Habille une face de sa photo. Sur un appareil qui le permet, s'y ajoute un relief déduit de la photo : de fins
   * reflets de métal, qui bougent quand le visiteur tourne autour de la pièce.
   */
  const dress = (material: THREE.MeshStandardMaterial, texture: THREE.Texture) => {
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = ctx.quality.anisotropy;
    material.emissiveMap = texture;
    material.emissive.set('#ffffff');
    if (!ctx.quality.lightModels) {
      // Le métal reflète la salle à la mesure de la photo : les creux sombres de la patine restent sombres.
      material.map = texture;
      material.color.set(metal.color).multiplyScalar(RELIEF.metal);
      material.normalMap = reliefTexture(texture.image as CanvasImageSource);
      material.normalScale.setScalar(RELIEF.depth);
      material.envMapIntensity = RELIEF.glints;
    }
    material.needsUpdate = true;
  };
  const front = faceMaterial();
  const thickness = Math.max(0.0018, radius * 0.11);
  const coin = new THREE.Group();
  // Une monnaie carrée est une plaquette ; les autres sont des disques.
  const rim = model.square
    ? new THREE.Mesh(new THREE.BoxGeometry(radius * 2, radius * 2, thickness), edgeMaterial)
    : new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, thickness, 64), edgeMaterial);
  if (!model.square) rim.rotation.x = Math.PI / 2;
  rim.position.z = -thickness / 2;
  const faceGeometry = model.square ? new THREE.PlaneGeometry(radius * 1.97, radius * 1.97) : new THREE.CircleGeometry(radius * 0.985, 64);
  const face = new THREE.Mesh(faceGeometry, front);
  face.position.z = 0.0003;
  coin.add(rim, face);
  // L'autre face, quand sa photo est donnée : on la découvre en tournant autour de la pièce.
  const backMaterial = model.coinBack ? faceMaterial() : null;
  if (backMaterial) {
    const back = new THREE.Mesh(faceGeometry, backMaterial);
    back.rotation.y = Math.PI;
    back.position.z = -thickness - 0.0003;
    coin.add(back);
  }
  coin.rotation.x = -TILT;
  coin.position.set(slot.x, top + radius * Math.cos(TILT) + 0.002, slot.z + 0.02);
  art.add(cube, card, coin);

  holder.updateMatrixWorld(true);
  const center = coin.getWorldPosition(new THREE.Vector3());
  const placed: PlacedArtwork = {
    config: cfg,
    room,
    center,
    span: cfg.height * 1.6,
    depth: VITRINE.side / 2,
    closest: 0.4,
    label: card,
    ready: false,
    obstacle: { x: holder.position.x, z: holder.position.z, r: VITRINE_RADIUS },
    shape: coin,
  };
  new THREE.TextureLoader().load(
    new URL(model.coin, ctx.base).href,
    (texture) => {
      dress(front, texture);
      placed.ready = true;
      ctx.onLoad();
    },
    undefined,
    () => console.error(`[musée] image de pièce introuvable : ${model.coin}`),
  );
  if (backMaterial && model.coinBack) {
    new THREE.TextureLoader().load(
      new URL(model.coinBack, ctx.base).href,
      (texture) => {
        dress(backMaterial, texture);
        ctx.onLoad();
      },
      undefined,
      () => console.error(`[musée] image du revers introuvable : ${model.coinBack}`),
    );
  }
  art.userData.artwork = placed;
  return placed;
}

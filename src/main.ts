import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import './style.css';
import { Controls } from './engine/controls';
import { buildMap } from './engine/map';
import { tr, type MuseumConfig, type RoomConfig } from './engine/types';
import { buildWorld, type PlacedArtwork } from './engine/world';

const UI: Record<string, Record<string, string>> = {
  fr: {
    help: 'Glissez pour regarder · ZQSD ou flèches pour avancer · cliquez sur une œuvre',
    helpTouch: 'Glissez pour regarder · manette pour avancer · touchez une œuvre',
    close: 'Fermer',
    lang: 'Langue',
    map: 'Plan',
    mapTitle: 'Plan du musée',
    mapHint: 'Choisissez une salle pour vous y rendre.',
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
    height: 'H.',
    error: 'This museum could not be loaded.',
  },
};

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

async function start() {
  // Chaque musée client est un dossier de configuration : ?m=identifiant
  const museumId = new URLSearchParams(location.search).get('m') ?? 'demo';
  const base = new URL(`museums/${encodeURIComponent(museumId)}/`, document.baseURI).href;
  const res = await fetch(new URL('museum.json', base));
  if (!res.ok) throw new Error(`museum.json: ${res.status}`);
  const museum: MuseumConfig = await res.json();

  let lang = museum.langs.includes(navigator.language.slice(0, 2))
    ? navigator.language.slice(0, 2)
    : museum.defaultLang;
  const ui = () => UI[lang] ?? UI.en;
  const touch = matchMedia('(pointer: coarse)').matches;
  document.documentElement.style.setProperty('--accent', museum.theme.accent);

  const canvas = $<HTMLCanvasElement>('scene');
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.toneMapping = THREE.NeutralToneMapping;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(museum.theme.ceiling);
  scene.add(new THREE.HemisphereLight(0xffffff, 0xe9e1d6, 2.7));
  const sun = new THREE.DirectionalLight(0xfff3e0, 1.1);
  sun.position.set(2, 6, 3);
  scene.add(sun);
  // Reflets des sculptures : un environnement neutre, calculé une fois.
  const env = new THREE.PMREMGenerator(renderer).fromScene(new RoomEnvironment(), 0.04).texture;

  const camera = new THREE.PerspectiveCamera(68, 1, 0.05, 120);
  const controls = new Controls(camera, canvas, $('joystick'));

  const world = buildWorld(museum, lang, base, env);
  scene.add(world.group);
  controls.walkable = world.walkable;
  const first = world.spawn(museum.start.room);
  controls.teleport(first.x, first.z, first.yaw);

  // --- Fiche d'œuvre -------------------------------------------------------
  const panel = $('panel');
  let current: PlacedArtwork | null = null;

  function renderPanel() {
    if (!current) return;
    const a = current.config;
    const size =
      a.type === 'painting'
        ? `${Math.round(a.height * 100)} × ${Math.round(a.width * 100)} cm`
        : `${ui().height} ${Math.round(a.height * 100)} cm`;
    $('p-title').textContent = tr(a.title, lang);
    $('p-artist').textContent = a.artist;
    $('p-meta').textContent = `${a.year} · ${tr(a.medium, lang)} · ${size}`;
    $('p-desc').textContent = tr(a.description, lang);
  }
  /** Part de l'écran laissée libre par la fiche : [largeur, hauteur], entre 0 et 1. */
  function freeArea(): [number, number] {
    if (panel.hidden) return [1, 1];
    const r = panel.getBoundingClientRect();
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    return r.width >= w ? [1, 1 - r.height / h] : [1 - r.width / w, 1];
  }
  /** Décale l'image pour que le centre du regard tombe au milieu de la zone libre. */
  function applyViewOffset() {
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    const [fw, fh] = freeArea();
    if (fw === 1 && fh === 1) camera.clearViewOffset();
    else camera.setViewOffset(w, h, ((1 - fw) * w) / 2, ((1 - fh) * h) / 2, w, h);
  }
  function openArtwork(art: PlacedArtwork) {
    current = art;
    renderPanel();
    panel.hidden = false;
    $('help').hidden = true;
    applyViewOffset();
    // Recul nécessaire pour que l'œuvre entière tienne dans la zone libre.
    const [fw, fh] = freeArea();
    const a = art.config;
    const tan = Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2);
    const distance =
      art.depth + Math.max(1.2, 1.5 * Math.max(a.height / (2 * tan * fh), art.span / (2 * tan * camera.aspect * fw)));
    const view = world.viewpoint(art, camera.position, distance);
    controls.glideTo(view.pos, view.yaw, view.pitch);
    $('p-close').focus({ preventScroll: true });
  }
  function closePanel() {
    current = null;
    panel.hidden = true;
    applyViewOffset();
  }
  $('p-close').addEventListener('click', closePanel);

  // --- Sélection des œuvres ------------------------------------------------
  // On teste toute la scène : un mur placé devant une œuvre bloque le clic.
  const raycaster = new THREE.Raycaster();
  const pick = (ndc: THREE.Vector2): PlacedArtwork | null => {
    raycaster.setFromCamera(ndc, camera);
    let node: THREE.Object3D | null = raycaster.intersectObject(world.group, true)[0]?.object ?? null;
    while (node && !node.userData.artwork) node = node.parent;
    return node?.userData.artwork ?? null;
  };
  controls.onTap = (ndc) => {
    const art = pick(ndc);
    if (art) openArtwork(art);
    else closePanel();
  };
  controls.onHover = (ndc) => {
    canvas.style.cursor = pick(ndc) ? 'pointer' : 'grab';
  };

  // --- Plan du musée -------------------------------------------------------
  const mapDialog = $('map');
  const map = buildMap($('map-body'), museum, (roomId) => {
    closeMap();
    closePanel();
    const s = world.spawn(roomId);
    canvas.classList.add('fade');
    setTimeout(() => {
      controls.teleport(s.x, s.z, s.yaw);
      canvas.classList.remove('fade');
    }, 220);
  });
  function closeMap() {
    mapDialog.hidden = true;
  }
  $('map-open').addEventListener('click', () => {
    mapDialog.hidden = false;
    $('map-close').focus();
  });
  $('map-close').addEventListener('click', closeMap);
  mapDialog.addEventListener('click', (e) => e.target === mapDialog && closeMap());
  window.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    if (!mapDialog.hidden) closeMap();
    else closePanel();
  });

  // --- Langue --------------------------------------------------------------
  let room: RoomConfig | null = null;
  const langSelect = $<HTMLSelectElement>('lang');
  for (const code of museum.langs) langSelect.add(new Option(code.toUpperCase(), code));
  function applyLang() {
    document.documentElement.lang = lang;
    document.title = tr(museum.name, lang);
    $('museum-name').textContent = tr(museum.name, lang);
    $('room-name').textContent = room ? tr(room.name, lang) : '';
    $('help').textContent = touch ? ui().helpTouch : ui().help;
    $('p-close').setAttribute('aria-label', ui().close);
    $('map-close').setAttribute('aria-label', ui().close);
    $('map-open').textContent = ui().map;
    $('map-title').textContent = ui().mapTitle;
    $('map-hint').textContent = ui().mapHint;
    langSelect.setAttribute('aria-label', ui().lang);
    langSelect.value = lang;
    world.setLang(lang);
    map.setLang(lang);
    renderPanel();
  }
  langSelect.addEventListener('change', () => {
    lang = langSelect.value;
    applyLang();
  });
  applyLang();

  // L'aide disparaît dès que le visiteur commence à se déplacer.
  const hideHelp = () => ($('help').hidden = true);
  canvas.addEventListener('pointerdown', hideHelp, { once: true });
  $('joystick').addEventListener('pointerdown', hideHelp, { once: true });
  window.addEventListener('keydown', hideHelp, { once: true });

  // --- Boucle de rendu -----------------------------------------------------
  function resize() {
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    // Sur un écran étroit, on élargit le champ pour garder la salle lisible.
    camera.fov = w < h ? 82 : 68;
    applyViewOffset();
    camera.updateProjectionMatrix();
  }
  new ResizeObserver(resize).observe(canvas);
  resize();

  const clock = new THREE.Clock();
  renderer.setAnimationLoop(() => {
    controls.update(Math.min(clock.getDelta(), 0.1));
    const p = camera.position;
    const here = world.roomAt(p.x, p.z);
    if (here && here !== room) {
      room = here;
      $('room-name').textContent = tr(room.name, lang);
      map.setCurrent(room.id);
    }
    if (!mapDialog.hidden) map.update(p.x, p.z, controls.yaw);
    renderer.render(scene, camera);
  });
  // Accès réservé aux tests automatisés, absent de la version publiée.
  if (import.meta.env.DEV) Object.assign(window, { __museum: { controls, world, camera } });
  document.body.classList.add('ready');
}

start().catch((err) => {
  console.error(err);
  const lang = navigator.language.startsWith('fr') ? 'fr' : 'en';
  $('help').textContent = UI[lang].error;
});

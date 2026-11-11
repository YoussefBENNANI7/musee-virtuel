import * as THREE from 'three';
import './style.css';
import { Controls } from './engine/controls';
import { buildRoom, updateLabels, type PlacedArtwork } from './engine/room';
import { tr, type MuseumConfig } from './engine/types';

const UI: Record<string, Record<string, string>> = {
  fr: {
    help: 'Glissez pour regarder · ZQSD ou flèches pour avancer · cliquez sur une œuvre',
    helpTouch: 'Glissez pour regarder · manette pour avancer · touchez une œuvre',
    close: 'Fermer',
    lang: 'Langue',
    error: 'Impossible de charger ce musée.',
  },
  en: {
    help: 'Drag to look · WASD or arrows to move · click an artwork',
    helpTouch: 'Drag to look · joystick to move · tap an artwork',
    close: 'Close',
    lang: 'Language',
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
  const touch = matchMedia('(pointer: coarse)').matches;
  document.documentElement.style.setProperty('--accent', museum.theme.accent);

  const canvas = $<HTMLCanvasElement>('scene');
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.toneMapping = THREE.NeutralToneMapping;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(museum.theme.ceiling);
  scene.add(new THREE.HemisphereLight(0xffffff, 0xe9e1d6, 2.6));

  const camera = new THREE.PerspectiveCamera(68, 1, 0.05, 100);
  const controls = new Controls(camera, canvas, $('joystick'));

  const roomCfg = museum.rooms.find((r) => r.id === museum.start.room) ?? museum.rooms[0];
  const room = buildRoom(roomCfg, museum, lang, base);
  scene.add(room.group);
  controls.bounds = room.bounds;
  controls.teleport(museum.start.position[0], museum.start.position[1], museum.start.yaw);

  // --- Fiche d'œuvre -------------------------------------------------------
  const panel = $('panel');
  let current: PlacedArtwork | null = null;

  function renderPanel() {
    if (!current) return;
    const a = current.config;
    $('p-title').textContent = tr(a.title, lang);
    $('p-artist').textContent = a.artist;
    $('p-meta').textContent = `${a.year} · ${tr(a.medium, lang)} · ${Math.round(a.height * 100)} × ${Math.round(a.width * 100)} cm`;
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
    const tan = Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2);
    const distance = Math.max(
      1.2,
      1.5 * Math.max(art.config.height / (2 * tan * fh), art.config.width / (2 * tan * camera.aspect * fw)),
    );
    controls.glideTo(art.anchor.clone().addScaledVector(art.normal, distance), art.viewYaw);
    $('p-close').focus({ preventScroll: true });
  }
  function closePanel() {
    current = null;
    panel.hidden = true;
    applyViewOffset();
  }
  $('p-close').addEventListener('click', closePanel);
  window.addEventListener('keydown', (e) => e.key === 'Escape' && closePanel());

  // --- Sélection des œuvres ------------------------------------------------
  const raycaster = new THREE.Raycaster();
  const targets = room.artworks.map((a) => a.mesh);
  const pick = (ndc: THREE.Vector2): PlacedArtwork | null => {
    raycaster.setFromCamera(ndc, camera);
    return raycaster.intersectObjects(targets)[0]?.object.userData.artwork ?? null;
  };
  controls.onTap = (ndc) => {
    const art = pick(ndc);
    if (art) openArtwork(art);
    else closePanel();
  };
  controls.onHover = (ndc) => {
    canvas.style.cursor = pick(ndc) ? 'pointer' : 'grab';
  };

  // --- Langue --------------------------------------------------------------
  const langSelect = $<HTMLSelectElement>('lang');
  for (const code of museum.langs) langSelect.add(new Option(code.toUpperCase(), code));
  function applyLang() {
    const ui = UI[lang] ?? UI.en;
    document.documentElement.lang = lang;
    document.title = tr(museum.name, lang);
    $('museum-name').textContent = tr(museum.name, lang);
    $('room-name').textContent = tr(roomCfg.name, lang);
    $('help').textContent = touch ? ui.helpTouch : ui.help;
    $('p-close').setAttribute('aria-label', ui.close);
    langSelect.setAttribute('aria-label', ui.lang);
    langSelect.value = lang;
    updateLabels(room, lang);
    renderPanel();
  }
  langSelect.addEventListener('change', () => {
    lang = langSelect.value;
    applyLang();
  });
  applyLang();

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
    renderer.render(scene, camera);
  });
  document.body.classList.add('ready');
}

start().catch((err) => {
  console.error(err);
  const lang = navigator.language.startsWith('fr') ? 'fr' : 'en';
  $('help').textContent = UI[lang].error;
});

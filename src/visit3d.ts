import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { Controls } from './engine/controls';
import { buildMap } from './engine/map';
import { tr, type RoomConfig, type TourConfig } from './engine/types';
import { buildWorld, type PlacedArtwork } from './engine/world';
import { $, metaLine, type App, type View } from './ui';
import { setupVR } from './vr';

/** Visite en 3D : déplacement libre, fiches d'œuvres, plan, parcours et audioguide. */
export function startVisit(app: App): View {
  const { museum, guide } = app;
  const ui = () => app.ui();
  const touch = matchMedia('(pointer: coarse)').matches;

  const canvas = $<HTMLCanvasElement>('scene');
  const { style, quality } = app;
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: quality.antialias, powerPreference: 'high-performance' });
  // La définition de l'image part du plafond fixé par le niveau de qualité, puis baisse
  // d'elle-même si l'appareil peine (voir la boucle de rendu).
  let pixelRatio = Math.min(devicePixelRatio, quality.maxPixelRatio);
  renderer.setPixelRatio(pixelRatio);
  renderer.xr.enabled = true;

  // On ne redessine l'image que lorsqu'elle change : un visiteur immobile ne consomme presque rien.
  let renderUntil = performance.now() + 3000;
  const invalidate = (ms = 600) => {
    renderUntil = Math.max(renderUntil, performance.now() + ms);
  };
  renderer.toneMapping = THREE.NeutralToneMapping;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(style.palette.ceiling);
  scene.add(new THREE.HemisphereLight(0xffffff, 0xe9e1d6, 2.7));
  const sun = new THREE.DirectionalLight(0xfff3e0, 1.1);
  sun.position.set(2, 6, 3);
  scene.add(sun);
  // Reflets des sculptures : un environnement neutre, calculé une fois.
  const env = new THREE.PMREMGenerator(renderer).fromScene(new RoomEnvironment(), 0.04).texture;

  const camera = new THREE.PerspectiveCamera(68, 1, 0.05, 120);
  const rig = new THREE.Group();
  rig.add(camera);
  scene.add(rig);
  const controls = new Controls(camera, canvas, $('joystick'));

  const world = buildWorld(museum, { lang: app.lang, base: app.base, style, quality, env, onLoad: invalidate });
  scene.add(world.group);
  controls.walkable = world.walkable;
  const first = world.spawn(museum.start.room);
  controls.teleport(first.x, first.z, first.yaw);
  const byId = new Map(world.artworks.map((a) => [a.config.id, a]));

  // --- Casque VR -----------------------------------------------------------
  const vr = setupVR({
    renderer,
    scene,
    rig,
    camera,
    controls,
    world,
    app,
    button: $('vr'),
    onStart() {
      closePanel();
      camera.clearViewOffset();
    },
    onEnd() {
      resize();
    },
  });

  // --- Fiche d'œuvre -------------------------------------------------------
  const panel = $('panel');
  let current: PlacedArtwork | null = null;

  function renderAudio() {
    const btn = $('p-audio');
    btn.hidden = !current || !guide.available(current.config, app.lang);
    const playing = current !== null && guide.playingId === current.config.id;
    btn.textContent = playing ? ui().stopAudio : ui().listen;
    btn.setAttribute('aria-pressed', String(playing));
  }
  function renderPanel() {
    if (!current) return;
    const a = current.config;
    $('p-title').textContent = tr(a.title, app.lang);
    $('p-artist').textContent = a.artist;
    $('p-meta').textContent = metaLine(app, a);
    $('p-desc').textContent = tr(a.description, app.lang);
    renderAudio();
  }
  guide.onChange = () => {
    renderAudio();
    vr.refresh();
  };
  $('p-audio').addEventListener('click', () => current && guide.toggle(current.config, app.lang, app.base));

  /**
   * Zone de l'écran où l'œuvre reste visible quand la fiche est ouverte :
   * sa part de l'écran (largeur, hauteur, entre 0 et 1) et son centre en pixels.
   */
  function freeArea() {
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    if (panel.hidden) return { fw: 1, fh: 1, cx: w / 2, cy: h / 2 };
    const r = panel.getBoundingClientRect();
    if (r.width < w) return { fw: 1 - r.width / w, fh: 1, cx: (w - r.width) / 2, cy: h / 2 };
    // Fiche en bas d'écran (téléphone) : l'œuvre se loge entre l'en-tête et la fiche.
    const top = $('bar').getBoundingClientRect().bottom;
    return { fw: 1, fh: (r.top - top) / h, cx: w / 2, cy: (top + r.top) / 2 };
  }
  /** Décale l'image pour que le centre du regard tombe au milieu de la zone libre. */
  function applyViewOffset() {
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    const { cx, cy } = freeArea();
    if (panel.hidden) camera.clearViewOffset();
    else camera.setViewOffset(w, h, w / 2 - cx, h / 2 - cy, w, h);
    invalidate();
  }
  /** Ouvre la fiche et amène le visiteur devant l'œuvre, en douceur ou d'un coup. */
  function openArtwork(art: PlacedArtwork, instant = false) {
    guide.stop();
    current = art;
    panel.hidden = false;
    $('help').hidden = true;
    renderPanel();
    renderTour();
    applyViewOffset();
    // Recul nécessaire pour que l'œuvre entière tienne dans la zone libre.
    const { fw, fh } = freeArea();
    const tan = Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2);
    const distance =
      art.depth +
      Math.max(1.2, 1.5 * Math.max(art.config.height / (2 * tan * fh), art.span / (2 * tan * camera.aspect * fw)));
    const view = world.viewpoint(art, camera.position, distance);
    if (instant) {
      controls.teleport(view.pos.x, view.pos.z, view.yaw);
      controls.pitch = view.pitch;
    } else {
      controls.glideTo(view.pos, view.yaw, view.pitch);
    }
    $('p-close').focus({ preventScroll: true });
  }
  function closePanel() {
    guide.stop();
    current = null;
    panel.hidden = true;
    applyViewOffset();
    renderTour();
  }
  $('p-close').addEventListener('click', closePanel);

  /** Fondu au noir le temps de changer de salle. */
  function fade(action: () => void) {
    canvas.classList.add('fade');
    setTimeout(() => {
      action();
      canvas.classList.remove('fade');
    }, 220);
  }

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

  // --- Parcours thématiques ------------------------------------------------
  const tours = (museum.tours ?? [])
    .map((t) => ({ ...t, stops: t.stops.filter((id) => byId.has(id)) }))
    .filter((t) => t.stops.length > 0);
  let tour: { cfg: TourConfig; index: number } | null = null;
  const toursDialog = $('tours');
  $('tours-open').hidden = tours.length === 0;

  function renderTour() {
    const nav = $('tour-nav');
    nav.hidden = !tour;
    $('tour-resume').hidden = !tour || !panel.hidden;
    if (!tour) return;
    const n = tour.cfg.stops.length;
    const step = ui().step.replace('{i}', String(tour.index + 1)).replace('{n}', String(n));
    $('tour-status').textContent = `${tr(tour.cfg.name, app.lang)} · ${step}`;
    $<HTMLButtonElement>('tour-prev').disabled = tour.index === 0;
    $('tour-prev').textContent = ui().prev;
    $('tour-next').textContent = tour.index === n - 1 ? ui().finish : ui().next;
    $('tour-quit').textContent = ui().quitTour;
    $('tour-resume-btn').textContent = `${ui().resume} · ${step}`;
    $('tour-resume-quit').setAttribute('aria-label', ui().quitTour);
  }
  function showStop() {
    if (!tour) return;
    const art = byId.get(tour.cfg.stops[tour.index])!;
    const p = camera.position;
    if (world.roomAt(p.x, p.z) === art.room) openArtwork(art);
    else fade(() => openArtwork(art, true));
    renderTour();
  }
  function endTour() {
    tour = null;
    renderTour();
  }
  function renderTourList() {
    const body = $('tours-body');
    body.replaceChildren();
    for (const cfg of tours) {
      const item = document.createElement('div');
      item.className = 'tour-item';
      const text = document.createElement('div');
      const name = document.createElement('h3');
      name.textContent = tr(cfg.name, app.lang);
      const desc = document.createElement('p');
      desc.textContent = `${tr(cfg.description, app.lang)} (${cfg.stops.length} ${ui().stops})`;
      text.append(name, desc);
      const go = document.createElement('button');
      go.type = 'button';
      go.className = 'btn primary';
      go.textContent = ui().startTour;
      go.setAttribute('aria-label', `${ui().startTour} : ${tr(cfg.name, app.lang)}`);
      go.addEventListener('click', () => {
        toursDialog.hidden = true;
        tour = { cfg, index: 0 };
        showStop();
      });
      item.append(text, go);
      body.append(item);
    }
  }
  $('tours-open').addEventListener('click', () => {
    toursDialog.hidden = false;
    $('tours-close').focus();
  });
  $('tours-close').addEventListener('click', () => (toursDialog.hidden = true));
  toursDialog.addEventListener('click', (e) => e.target === toursDialog && (toursDialog.hidden = true));
  $('tour-prev').addEventListener('click', () => {
    if (!tour || tour.index === 0) return;
    tour.index--;
    showStop();
  });
  $('tour-next').addEventListener('click', () => {
    if (!tour) return;
    if (tour.index === tour.cfg.stops.length - 1) return endTour();
    tour.index++;
    showStop();
  });
  $('tour-quit').addEventListener('click', endTour);
  $('tour-resume-btn').addEventListener('click', showStop);
  $('tour-resume-quit').addEventListener('click', endTour);

  // --- Plan du musée -------------------------------------------------------
  const mapDialog = $('map');
  const map = buildMap($('map-body'), museum, (roomId) => {
    mapDialog.hidden = true;
    closePanel();
    const s = world.spawn(roomId);
    fade(() => controls.teleport(s.x, s.z, s.yaw));
  });
  $('map-open').addEventListener('click', () => {
    mapDialog.hidden = false;
    $('map-close').focus();
  });
  $('map-close').addEventListener('click', () => (mapDialog.hidden = true));
  mapDialog.addEventListener('click', (e) => e.target === mapDialog && (mapDialog.hidden = true));
  window.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    if (!mapDialog.hidden) mapDialog.hidden = true;
    else if (!toursDialog.hidden) toursDialog.hidden = true;
    else closePanel();
  });

  // --- Textes --------------------------------------------------------------
  let room: RoomConfig | null = null;
  function applyTexts() {
    $('room-name').textContent = room ? tr(room.name, app.lang) : '';
    $('help').textContent = touch ? ui().helpTouch : ui().help;
    for (const id of ['p-close', 'map-close', 'tours-close']) $(id).setAttribute('aria-label', ui().close);
    $('map-open').textContent = ui().map;
    $('map-title').textContent = ui().mapTitle;
    $('map-hint').textContent = ui().mapHint;
    $('tours-open').textContent = ui().tours;
    $('tours-title').textContent = ui().toursTitle;
    $('tours-hint').textContent = ui().toursHint;
    $('vr').textContent = ui().vr;
    world.setLang(app.lang);
    map.setLang(app.lang);
    vr.refresh();
    invalidate();
    renderPanel();
    renderTour();
    renderTourList();
  }
  applyTexts();

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
    invalidate();
  }
  new ResizeObserver(resize).observe(canvas);
  resize();

  const timer = new THREE.Timer();
  let lastPose = '';
  let slowTime = 0;
  let slowFrames = 0;
  renderer.setAnimationLoop(() => {
    timer.update();
    const raw = timer.getDelta();
    const dt = Math.min(raw, 0.1);
    if (renderer.xr.isPresenting) {
      vr.update(dt);
      renderer.render(scene, camera);
      return;
    }
    controls.update(dt);
    const p = camera.position;
    const here = world.roomAt(p.x, p.z);
    if (here && here !== room) {
      room = here;
      $('room-name').textContent = tr(room.name, app.lang);
      map.setCurrent(room.id);
    }
    if (!mapDialog.hidden) map.update(p.x, p.z, controls.yaw);

    const pose = `${p.x.toFixed(3)} ${p.z.toFixed(3)} ${controls.yaw.toFixed(4)} ${controls.pitch.toFixed(4)}`;
    const moving = pose !== lastPose;
    lastPose = pose;
    if (moving) invalidate(300);
    if (performance.now() > renderUntil) return;
    renderer.render(scene, camera);

    // Si l'appareil reste sous 36 images par seconde en mouvement, on allège l'image par paliers.
    if (moving && pixelRatio > 1) {
      slowTime += raw;
      if (++slowFrames >= 45) {
        if (slowTime / slowFrames > 0.028) {
          pixelRatio = Math.max(1, pixelRatio - 0.25);
          renderer.setPixelRatio(pixelRatio);
          resize();
        }
        slowTime = 0;
        slowFrames = 0;
      }
    }
  });

  // Accès réservé aux tests et à la génération des vignettes, absent de la version publiée.
  if (import.meta.env.DEV) {
    const thumb = (id: string) => {
      const art = byId.get(id)!;
      renderer.setAnimationLoop(null);
      renderer.setSize(640, 640, false);
      camera.clearViewOffset();
      camera.aspect = 1;
      camera.fov = 42;
      camera.updateProjectionMatrix();
      const fit = Math.max(art.config.height, art.span) * 1.25;
      const view = world.viewpoint(art, new THREE.Vector3(art.room.position[0], 0, art.room.position[1]), art.depth + fit / (2 * Math.tan(THREE.MathUtils.degToRad(21))));
      camera.position.copy(view.pos);
      camera.rotation.set(view.pitch, view.yaw, 0);
      renderer.render(scene, camera);
      return canvas.toDataURL('image/jpeg', 0.86);
    };
    /** Place le visiteur face à une œuvre, à la distance voulue. */
    const standBefore = (id: string, distance = 3) => {
      const view = world.viewpoint(byId.get(id)!, camera.position, distance);
      controls.teleport(view.pos.x, view.pos.z, view.yaw);
    };
    /** Position à l'écran, en pixels, d'un point cliquable de l'œuvre. */
    const screenOf = (id: string) => {
      const art = byId.get(id)!;
      const target = art.center.clone();
      // Une sculpture peut être ajourée en son centre : on vise son socle.
      if (art.config.type === 'sculpture') target.y = art.config.plinth / 2;
      camera.updateMatrixWorld();
      const v = target.project(camera);
      return { x: ((v.x + 1) / 2) * canvas.clientWidth, y: ((1 - v.y) / 2) * canvas.clientHeight };
    };
    Object.assign(window, {
      __museum: { style: style.id, quality: quality.tier, controls, world, camera, rig, renderer, thumb, standBefore, screenOf, ids: () => [...byId.keys()], pixelRatio: () => pixelRatio, vrPanel: () => vr.panel },
    });
  }

  return {
    setLang() {
      guide.stop();
      applyTexts();
    },
  };
}

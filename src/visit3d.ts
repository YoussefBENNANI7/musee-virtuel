import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { Controls } from './engine/controls';
import { ALONE_LAYER } from './engine/artworks';
import { SUN_AZIMUTH } from './engine/lighting';
import { buildMap } from './engine/map';
import { buildFloorReflection } from './engine/reflection';
import { spoken } from './engine/narration';
import { loc, tr, type ArtworkConfig, type RoomConfig, type TourConfig } from './engine/types';
import { buildWorld, type PlacedArtwork } from './engine/world';
import { setupAmbiance } from './ambiance';
import { setupCarnet } from './carnet';
import { setupInspect } from './inspect';
import { $, metaLine, renderCredit, type App, type View } from './ui';
import { setupVR } from './vr';
import { setupZoom } from './zoom';

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
  // Le bâtiment porte son propre éclairage (voir engine/lighting.ts). Ces deux lampes
  // n'éclairent que les objets : sculptures, socles, cadres, mobilier.
  const sky = new THREE.HemisphereLight(0xffffff, 0xe0dbd3, 2.0);
  scene.add(sky);
  const sun = new THREE.DirectionalLight(0xfff1dd, 1.2);
  // Ces lampes éclairent aussi une sculpture montrée seule, pendant son examen.
  sky.layers.enable(ALONE_LAYER);
  sun.layers.enable(ALONE_LAYER);
  sun.position.copy(SUN_AZIMUTH).multiplyScalar(3).setY(7);
  scene.add(sun);
  // Reflets des sculptures : un environnement neutre, calculé une fois.
  const env = new THREE.PMREMGenerator(renderer).fromScene(new RoomEnvironment(), 0.04).texture;

  const camera = new THREE.PerspectiveCamera(68, 1, 0.05, 120);
  const rig = new THREE.Group();
  rig.add(camera);
  scene.add(rig);
  const controls = new Controls(camera, canvas, $('joystick'));

  const world = buildWorld(museum, {
    lang: app.lang,
    base: app.base,
    style,
    quality,
    env,
    onLoad() {
      // Une sculpture vient d'arriver : son ombre est à calculer.
      renderer.shadowMap.needsUpdate = true;
      invalidate();
      // Si sa fiche est déjà ouverte, le bouton « Examiner » peut maintenant s'afficher.
      renderPanel();
    },
  });
  scene.add(world.group);
  if (quality.shadows) {
    // Ombres portées des sculptures : le soleil les dessine une seule fois, puisque rien ne bouge.
    let minX = Infinity;
    let maxX = -Infinity;
    let minZ = Infinity;
    let maxZ = -Infinity;
    for (const r of museum.rooms) {
      minX = Math.min(minX, r.position[0] - r.size[0] / 2);
      maxX = Math.max(maxX, r.position[0] + r.size[0] / 2);
      minZ = Math.min(minZ, r.position[1] - r.size[2] / 2);
      maxZ = Math.max(maxZ, r.position[1] + r.size[2] / 2);
    }
    const centre = new THREE.Vector3((minX + maxX) / 2, 0, (minZ + maxZ) / 2);
    const reach = Math.hypot(maxX - minX, maxZ - minZ) / 2 + 4;
    sun.target.position.copy(centre);
    sun.position.copy(centre).add(new THREE.Vector3().copy(SUN_AZIMUTH).multiplyScalar(3).setY(7).normalize().multiplyScalar(60));
    scene.add(sun.target);
    sun.castShadow = true;
    sun.shadow.mapSize.set(4096, 4096);
    Object.assign(sun.shadow.camera, { left: -reach, right: reach, top: reach, bottom: -reach, near: 1, far: 120 });
    sun.shadow.camera.updateProjectionMatrix();
    sun.shadow.bias = -0.0004;
    sun.shadow.normalBias = 0.03;
    sun.shadow.radius = 4;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFShadowMap;
    renderer.shadowMap.autoUpdate = false;
    renderer.shadowMap.needsUpdate = true;
  }
  const reflection = quality.reflections ? buildFloorReflection(museum, world.decors, world.layout.wallThickness) : null;
  if (reflection) scene.add(reflection.object);
  controls.walkable = world.walkable;
  const first = world.spawn(museum.start.room);
  controls.teleport(first.x, first.z, first.yaw);
  const byId = new Map(world.artworks.map((a) => [a.config.id, a]));
  // Aperçu dans l'éditeur : chaque modification recharge le musée, et le visiteur retrouve sa place.
  const poseKey = `apercu:${museum.id}`;
  let poseSaved = 0;
  if (app.preview) {
    try {
      const saved = JSON.parse(sessionStorage.getItem(poseKey) ?? 'null');
      if (saved && world.walkable(saved.x, saved.z)) {
        controls.teleport(saved.x, saved.z, saved.yaw);
        controls.pitch = saved.pitch ?? 0;
      }
    } catch {
      // Stockage indisponible : on part de l'entrée.
    }
  }
  // Ambiance sonore : l'eau des fontaines, plus forte à mesure qu'on s'en approche.
  const ambiance = setupAmbiance(
    museum.rooms.filter((r) => r.fountain).map((r) => ({ x: r.position[0] + r.fountain!.position[0], z: r.position[1] + r.fountain!.position[1], room: r.id })),
    new URL('sons/fontaine.mp3', document.baseURI).href,
  );
  const hear = () => ambiance.update({ x: camera.position.x, z: camera.position.z, yaw: controls.yaw, room: world.roomAt(camera.position.x, camera.position.z)?.id ?? null });
  const soundButton = $('sound');
  soundButton.hidden = !museum.rooms.some((r) => r.fountain);
  soundButton.setAttribute('aria-pressed', String(!ambiance.muted));
  soundButton.addEventListener('click', () => soundButton.setAttribute('aria-pressed', String(!ambiance.toggle())));
  // Le son ne peut commencer qu'après un geste du visiteur.
  const startSound = () => {
    ambiance.start();
    hear();
  };
  window.addEventListener('pointerdown', startSound, { once: true });
  window.addEventListener('keydown', startSound, { once: true });
  let intro = false;
  // Pas de mouvement d'ouverture pour qui a demandé moins d'animations, ni sur un appareil modeste.
  const calm = matchMedia('(prefers-reduced-motion: reduce)').matches || quality.tier === 'low';

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
      inspect.close();
      closePanel();
      marker.visible = false;
      camera.clearViewOffset();
      // Le reflet du sol n'est pas calculé dans le casque.
      if (reflection) reflection.object.visible = false;
    },
    onEnd() {
      if (reflection) reflection.object.visible = quality.reflections;
      resize();
    },
  });

  // --- Fiche d'œuvre -------------------------------------------------------
  const panel = $('panel');
  let current: PlacedArtwork | null = null;

  /** Salle où se trouve le visiteur. */
  let room: RoomConfig | null = null;
  /** Témoignage de l'œuvre ouverte, et présentation de la salle où l'on se trouve. */
  const witnessId = (a: ArtworkConfig) => `${a.id}#temoignage`;
  const introId = (r: RoomConfig) => `salle:${r.id}`;
  function renderExtras() {
    const w = $('p-witness');
    const t = current?.config.testimony;
    const file = t ? (t.audio[app.lang] ?? Object.values(t.audio)[0]) : undefined;
    w.hidden = !current || !file;
    if (current && t && file) {
      const playing = guide.playingId === witnessId(current.config);
      w.textContent = playing ? ui().stopAudio : tr(t.label, app.lang);
      w.setAttribute('aria-pressed', String(playing));
    }
    const ri = $('room-intro');
    ri.hidden = !room?.intro;
    if (room?.intro) {
      const playing = guide.playingId === introId(room);
      ri.textContent = playing ? ui().stopAudio : ui().roomIntro;
      ri.setAttribute('aria-pressed', String(playing));
    }
  }
  $('p-witness').addEventListener('click', () => {
    const t = current?.config.testimony;
    if (!current || !t) return;
    const id = witnessId(current.config);
    if (guide.playingId === id) return guide.stop();
    guide.playFile(id, t.audio[app.lang] ?? Object.values(t.audio)[0], app.base);
  });
  $('room-intro').addEventListener('click', () => {
    const intro = room?.intro;
    if (!room || !intro) return;
    const id = introId(room);
    if (guide.playingId === id) return guide.stop();
    const file = intro.audio?.[app.lang];
    if (file) guide.playFile(id, file, app.base);
    else guide.speak(id, spoken(`${tr(room.name, app.lang)}. ${tr(intro.text, app.lang)}`, app.lang), app.lang);
  });
  function renderAudio() {
    renderExtras();
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
    $('p-artist').textContent = loc(a.artist, app.lang);
    $('p-meta').textContent = metaLine(app, a);
    $('p-desc').textContent = tr(a.description, app.lang);
    renderCredit($('p-credit'), app, a);
    // Un tableau fourni en fichier s'agrandit ; une sculpture, une fois chargée, s'examine sous tous les angles.
    $('p-zoom').hidden = a.type === 'painting' ? !('src' in a.image) : !current.shape;
    $('p-zoom').textContent = a.type === 'sculpture' ? ui().examine : a.details?.length ? ui().explore : ui().enlarge;
    renderAudio();
  }
  guide.onChange = () => {
    renderAudio();
    vr.refresh();
    ambiance.duck(guide.playingId !== null);
    // Mode présentation : le commentaire terminé, on passe à l'œuvre suivante après une pause.
    if (presenting && awaiting && guide.playingId === null) {
      // Une lecture qui s'arrête à peine commencée a été refusée par le navigateur : on laisse le temps de regarder.
      const refused = performance.now() - spokeAt < 2000;
      awaiting = null;
      presentTimer = window.setTimeout(advance, refused ? SILENT_STOP : PAUSE);
    }
  };
  $('p-audio').addEventListener('click', () => current && guide.toggle(current.config, app.lang, app.base));
  const zoom = setupZoom(() => ui() as never);
  const inspect = setupInspect({
    camera,
    scene,
    labels: () => ui() as never,
    onOpen() {
      // Le commentaire continue : on l'écoute en tournant autour de la sculpture.
      showMarker(null);
      camera.clearViewOffset();
      $('inspect').setAttribute('aria-label', current ? `${tr(current.config.title, app.lang)}, ${loc(current.config.artist, app.lang)}` : '');
    },
    onClose() {
      applyViewOffset();
      invalidate();
    },
  });
  $('p-zoom').addEventListener('click', () => {
    const a = current?.config;
    if (!current || !a) return;
    if (a.type === 'sculpture') inspect.open(current);
    else if ('src' in a.image) {
      const details = (a.details ?? []).map((d) => ({ x: d.at[0], y: d.at[1], title: tr(d.title, app.lang), text: tr(d.text, app.lang) }));
      zoom.open(new URL(a.image.src, app.base).href, `${tr(a.title, app.lang)}, ${loc(a.artist, app.lang)}`, details);
    }
  });

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
    carnet.see(art.config.id, art.room.id);
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
      Math.max(art.closest, 1.5 * Math.max(art.config.height / (2 * tan * fh), art.span / (2 * tan * camera.aspect * fw)));
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
    stopPresentation();
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

  // --- Sélection des œuvres et marche vers un point du sol -------------------
  // On teste toute la scène : un mur placé devant une œuvre bloque le clic.
  const raycaster = new THREE.Raycaster();
  const up = new THREE.Vector3();
  /** Ce que désigne un point de l'écran : une œuvre, un point du sol, ou rien. */
  const pick = (ndc: THREE.Vector2): { art: PlacedArtwork | null; ground: THREE.Vector3 | null } => {
    raycaster.setFromCamera(ndc, camera);
    const hit = raycaster.intersectObject(world.group, true)[0];
    if (!hit) return { art: null, ground: null };
    let node: THREE.Object3D | null = hit.object;
    while (node && !node.userData.artwork) node = node.parent;
    if (node) return { art: node.userData.artwork, ground: null };
    // Le sol : une surface tournée vers le haut, au niveau zéro (ni banc, ni socle, ni bassin).
    const flat = hit.face ? up.copy(hit.face.normal).transformDirection(hit.object.matrixWorld).y > 0.9 : false;
    return { art: null, ground: flat && hit.point.y < 0.06 ? hit.point : null };
  };

  // Repère posé au sol : il montre où le visiteur ira s'il clique, puis sa destination.
  const marker = new THREE.Group();
  const ring = (inner: number, outer: number, color: number, opacity: number) =>
    new THREE.Mesh(
      new THREE.RingGeometry(inner, outer, 48),
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false, toneMapped: false }),
    );
  marker.add(ring(0.15, 0.21, 0x1f5a48, 0.9), ring(0.21, 0.25, 0xffffff, 0.9));
  marker.rotation.x = -Math.PI / 2;
  marker.position.y = 0.02;
  marker.visible = false;
  scene.add(marker);
  let walking = false;
  const showMarker = (at: { x: number; z: number } | null) => {
    if (!at && !marker.visible) return;
    marker.visible = at !== null;
    if (at) marker.position.set(at.x, 0.02, at.z);
    invalidate(200);
  };
  /** Endroit où mènerait un clic sur ce point du sol, s'il vaut le déplacement. */
  const destination = (ground: THREE.Vector3) => {
    const end = controls.reach(ground.x, ground.z);
    return Math.hypot(end.x - camera.position.x, end.z - camera.position.z) < 0.3 ? null : end;
  };

  controls.onTap = (ndc) => {
    // Le visiteur reprend la main : la présentation automatique s'arrête.
    stopPresentation();
    const { art, ground } = pick(ndc);
    if (art) return openArtwork(art);
    // Fiche ouverte : un clic à côté la referme, sans déplacer le visiteur.
    const open = !panel.hidden;
    closePanel();
    if (open || !ground) return;
    const end = controls.walkTo(ground.x, ground.z);
    walking = end !== null;
    showMarker(end);
  };
  controls.onHover = (ndc) => {
    const { art, ground } = pick(ndc);
    canvas.style.cursor = art || (ground && panel.hidden) ? 'pointer' : 'grab';
    if (!walking) showMarker(ground && panel.hidden ? destination(ground) : null);
  };
  canvas.addEventListener('pointerleave', () => !walking && showMarker(null));

  // --- Parcours thématiques ------------------------------------------------
  const tours = (museum.tours ?? [])
    .map((t) => ({ ...t, stops: t.stops.filter((id) => byId.has(id)) }))
    .filter((t) => t.stops.length > 0);
  let tour: { cfg: TourConfig; index: number } | null = null;
  const toursDialog = $('tours');
  $('tours-open').hidden = tours.length === 0;

  // --- Mode présentation : le parcours se déroule seul, avec la voix ---------------
  const ARRIVAL = 2600; // ms, le temps d'arriver devant l'œuvre avant de parler
  const PAUSE = 1800; // ms de silence après un commentaire
  const SILENT_STOP = 12000; // ms devant une œuvre sans voix
  let presenting = false;
  let awaiting: string | null = null;
  let spokeAt = 0;
  let presentTimer = 0;
  /** Devant l'œuvre de l'étape : attend l'arrivée, puis lance son commentaire. */
  function narrate() {
    window.clearTimeout(presentTimer);
    awaiting = null;
    presentTimer = window.setTimeout(() => {
      if (!presenting || !current) return;
      if (!guide.available(current.config, app.lang)) {
        presentTimer = window.setTimeout(advance, SILENT_STOP);
        return;
      }
      awaiting = current.config.id;
      spokeAt = performance.now();
      guide.play(current.config, app.lang, app.base);
    }, ARRIVAL);
  }
  function advance() {
    if (!presenting || !tour) return;
    if (tour.index === tour.cfg.stops.length - 1) {
      endTour();
      closePanel();
      carnet.announce(ui().presentDone);
      return;
    }
    tour.index++;
    showStop();
    narrate();
  }
  function startPresentation(cfg: TourConfig) {
    tour = { cfg, index: 0 };
    presenting = true;
    document.body.classList.add('presenting');
    showStop();
    narrate();
  }
  function stopPresentation() {
    if (!presenting) return;
    presenting = false;
    awaiting = null;
    window.clearTimeout(presentTimer);
    document.body.classList.remove('presenting');
    renderTour();
  }
  $('tour-auto').addEventListener('click', () => {
    if (presenting) return stopPresentation();
    presenting = true;
    document.body.classList.add('presenting');
    renderTour();
    narrate();
  });

  function renderTour() {
    const nav = $('tour-nav');
    nav.hidden = !tour;
    $('tour-auto').textContent = presenting ? ui().presentStop : ui().presentStart;
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
    stopPresentation();
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
      // Le même parcours, déroulé tout seul : pour une démonstration, ou pour se laisser guider.
      const auto = document.createElement('button');
      auto.type = 'button';
      auto.className = 'btn';
      auto.textContent = ui().present;
      auto.setAttribute('aria-label', `${ui().present} : ${tr(cfg.name, app.lang)}`);
      auto.addEventListener('click', () => {
        toursDialog.hidden = true;
        startPresentation(cfg);
      });
      const actions = document.createElement('span');
      actions.className = 'tour-actions';
      actions.append(go, auto);
      item.append(text, actions);
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
    if (presenting) narrate();
  });
  $('tour-next').addEventListener('click', () => {
    if (!tour) return;
    if (tour.index === tour.cfg.stops.length - 1) return endTour();
    tour.index++;
    showStop();
    if (presenting) narrate();
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
  // Carnet de visite : les œuvres vues, salle par salle.
  const carnet = setupCarnet(app, {
    goToRoom(roomId) {
      closePanel();
      const s = world.spawn(roomId);
      fade(() => controls.teleport(s.x, s.z, s.yaw));
    },
  });
  const openMap = () => {
    mapDialog.hidden = false;
    $('map-close').focus();
  };
  $('map-open').addEventListener('click', openMap);
  // Mini-plan permanent : où l'on est dans le musée ; un clic ouvre le plan complet.
  const miniMap = buildMap($('minimap'), museum, () => {}, true);
  $('minimap').addEventListener('click', openMap);
  $('map-close').addEventListener('click', () => (mapDialog.hidden = true));
  mapDialog.addEventListener('click', (e) => e.target === mapDialog && (mapDialog.hidden = true));
  window.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    if (zoom.isOpen) zoom.close();
    else if (inspect.isOpen) inspect.close();
    else if (carnet.close()) return;
    else if (!mapDialog.hidden) mapDialog.hidden = true;
    else if (!toursDialog.hidden) toursDialog.hidden = true;
    else closePanel();
  });

  // --- Textes --------------------------------------------------------------
  function applyTexts() {
    $('room-name').textContent = room ? tr(room.name, app.lang) : '';
    renderExtras();
    $('help').textContent = touch ? ui().helpTouch : ui().help;
    for (const id of ['p-close', 'map-close', 'tours-close']) $(id).setAttribute('aria-label', ui().close);
    $('map-open').textContent = ui().map;
    $('minimap').setAttribute('aria-label', ui().mapTitle);
    soundButton.setAttribute('aria-label', ui().sound);
    $('map-title').textContent = ui().mapTitle;
    $('map-hint').textContent = ui().mapHint;
    $('tours-open').textContent = ui().tours;
    $('tours-title').textContent = ui().toursTitle;
    $('tours-hint').textContent = ui().toursHint;
    $('vr').textContent = ui().vr;
    carnet.render();
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
    reflection?.resize(w * pixelRatio, h * pixelRatio);
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
    if (inspect.isOpen) {
      // Examen d'une sculpture : la caméra tourne autour d'elle, la visite attend.
      if (inspect.update(dt)) invalidate(200);
      if (performance.now() <= renderUntil) renderer.render(scene, camera);
      return;
    }
    // Ouverture : derrière l'écran d'accueil, le regard parcourt lentement la salle.
    if (intro && !calm) controls.yaw += dt * 0.07;
    controls.update(dt);
    const p = camera.position;
    const here = world.roomAt(p.x, p.z);
    if (here && here !== room) {
      room = here;
      $('room-name').textContent = tr(room.name, app.lang);
      renderExtras();
      map.setCurrent(room.id);
      miniMap.setCurrent(room.id);
    }
    if (!mapDialog.hidden) map.update(p.x, p.z, controls.yaw);

    const pose = `${p.x.toFixed(3)} ${p.z.toFixed(3)} ${controls.yaw.toFixed(4)} ${controls.pitch.toFixed(4)}`;
    const moving = pose !== lastPose;
    lastPose = pose;
    if (moving) {
      invalidate(300);
      miniMap.update(p.x, p.z, controls.yaw);
      hear();
      if (app.preview && performance.now() - poseSaved > 300) {
        poseSaved = performance.now();
        try {
          sessionStorage.setItem(poseKey, JSON.stringify({ x: p.x, z: p.z, yaw: controls.yaw, pitch: controls.pitch }));
        } catch {
          // Voir plus haut.
        }
      }
    }
    // Arrivé au point cliqué (ou détourné en chemin) : le repère du sol s'efface.
    if (walking && !controls.gliding) {
      walking = false;
      showMarker(null);
    }
    if (performance.now() > renderUntil) return;
    renderer.render(scene, camera);

    // Si l'appareil reste sous 36 images par seconde en mouvement, on allège l'image par paliers.
    if (moving && pixelRatio > 1) {
      slowTime += raw;
      if (++slowFrames >= 45) {
        if (slowTime / slowFrames > 0.028) {
          pixelRatio = Math.max(1, pixelRatio - 0.25);
          renderer.setPixelRatio(pixelRatio);
          // Au dernier palier, on renonce aussi au reflet du sol, qui double le travail de dessin.
          if (pixelRatio === 1 && reflection) {
            quality.reflections = false;
            reflection.object.visible = false;
          }
          resize();
        }
        slowTime = 0;
        slowFrames = 0;
      }
    }
  });

  // Commandes que l'éditeur envoie à son aperçu : aller dans une salle, se placer devant une œuvre.
  if (app.preview) {
    Object.assign(window, {
      __apercu: {
        goToRoom(roomId: string) {
          if (!museum.rooms.some((r) => r.id === roomId)) return false;
          closePanel();
          const s = world.spawn(roomId);
          controls.teleport(s.x, s.z, s.yaw);
          return true;
        },
        showArtwork(artId: string) {
          const art = byId.get(artId);
          if (!art) return false;
          closePanel();
          const tan = Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2);
          const distance = art.depth + Math.max(art.closest, 1.7 * Math.max(art.config.height / (2 * tan), art.span / (2 * tan * camera.aspect)));
          const view = world.viewpoint(art, camera.position, distance);
          // On y est porté d'un coup : dans un outil de travail, le résultat doit se voir tout de suite.
          controls.teleport(view.pos.x, view.pos.z, view.yaw);
          controls.pitch = view.pitch;
          return true;
        },
      },
    });
  }

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
    /** Position à l'écran, en pixels, d'un point du sol. */
    const screenAt = (x: number, z: number) => {
      camera.updateMatrixWorld();
      const v = new THREE.Vector3(x, 0, z).project(camera);
      return { x: ((v.x + 1) / 2) * canvas.clientWidth, y: ((1 - v.y) / 2) * canvas.clientHeight };
    };
    Object.assign(window, {
      __museum: { screenAt, marker, inspect, carnet, ambiance, presenting: () => presenting, style: style.id, decors: Object.fromEntries([...world.decors].map(([id, d]) => [id, d.preset])), quality: quality.tier, reflections: () => Boolean(reflection?.object.visible), controls, world, camera, rig, renderer, thumb, standBefore, screenOf, ids: () => [...byId.keys()], pixelRatio: () => pixelRatio, vrPanel: () => vr.panel, vrUpdate: (dt: number) => vr.update(dt), vrSupport: () => vr.support() },
    });
  }

  return {
    setLang() {
      guide.stop();
      applyTexts();
    },
    progress: () => world.artworks.filter((a) => a.ready).length / Math.max(1, world.artworks.length),
    intro(on) {
      if (intro && !on && !calm) controls.glideTo(new THREE.Vector3(first.x, 0, first.z), first.yaw);
      intro = on;
    },
    present(tourId) {
      const cfg = tours.find((t) => t.id === tourId);
      if (cfg) startPresentation(cfg);
    },
  };
}

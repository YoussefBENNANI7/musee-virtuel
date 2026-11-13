import * as THREE from 'three';
import type { Controls } from './engine/controls';
import { tr } from './engine/types';
import type { PlacedArtwork, World } from './engine/world';
import { metaLine, type App } from './ui';

const MOVE_SPEED = 1.8; // m/s, volontairement lent pour le confort
const SNAP_ANGLE = Math.PI / 6;
const PANEL_W = 1024;
const PANEL_H = 768;
/** Part basse de la fiche occupée par le bouton d'écoute. */
const BUTTON_ZONE = 0.2;

interface Options {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  /** Groupe qui porte la caméra : c'est lui qu'on déplace dans le musée. */
  rig: THREE.Group;
  camera: THREE.PerspectiveCamera;
  controls: Controls;
  world: World;
  app: App;
  button: HTMLElement;
  onStart(): void;
  onEnd(): void;
}

/**
 * Visite en casque de réalité virtuelle (WebXR).
 * - Manette gauche : le joystick fait avancer dans la direction du regard.
 * - Manette droite : le joystick fait pivoter par crans.
 * - Gâchette : viser le sol pour s'y téléporter, viser une œuvre pour ouvrir sa fiche.
 */
export function setupVR(o: Options) {
  const { renderer, scene, rig, camera, controls, world, app } = o;
  const idle = { update(_dt: number) {}, refresh() {}, panel: new THREE.Object3D() };
  const xr = navigator.xr;
  if (!xr) return idle;

  void xr.isSessionSupported('immersive-vr').then((ok) => (o.button.hidden = !ok)).catch(() => {});
  o.button.addEventListener('click', async () => {
    try {
      const session = await xr.requestSession('immersive-vr', { optionalFeatures: ['local-floor'] });
      renderer.xr.setReferenceSpaceType('local-floor');
      await renderer.xr.setSession(session);
    } catch (err) {
      console.warn('VR indisponible', err);
    }
  });

  const head = new THREE.Vector3();
  const headPosition = () => camera.getWorldPosition(head);

  renderer.xr.addEventListener('sessionstart', () => {
    // Le visiteur démarre en VR là où il se trouvait, tourné dans la même direction.
    rig.position.set(camera.position.x, 0, camera.position.z);
    rig.rotation.set(0, controls.yaw, 0);
    o.onStart();
  });
  renderer.xr.addEventListener('sessionend', () => {
    const p = headPosition().clone();
    const yaw = rig.rotation.y;
    rig.position.set(0, 0, 0);
    rig.rotation.set(0, 0, 0);
    controls.teleport(p.x, p.z, yaw);
    hidePanel();
    o.onEnd();
  });

  // --- Fiche d'œuvre flottante ----------------------------------------------
  const canvas = document.createElement('canvas');
  canvas.width = PANEL_W;
  canvas.height = PANEL_H;
  const g = canvas.getContext('2d')!;
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const panel = new THREE.Mesh(
    new THREE.PlaneGeometry(0.92, 0.69),
    new THREE.MeshBasicMaterial({ map: texture, toneMapped: false }),
  );
  panel.visible = false;
  scene.add(panel);
  let current: PlacedArtwork | null = null;

  function wrap(text: string, x: number, y: number, maxWidth: number, lineHeight: number, maxY: number) {
    let line = '';
    for (const word of text.split(' ')) {
      const next = line ? `${line} ${word}` : word;
      if (g.measureText(next).width > maxWidth && line) {
        if (y + lineHeight > maxY) {
          g.fillText(`${line}…`, x, y);
          return;
        }
        g.fillText(line, x, y);
        line = word;
        y += lineHeight;
      } else {
        line = next;
      }
    }
    g.fillText(line, x, y);
  }

  function drawPanel() {
    if (!current) return;
    const a = current.config;
    const accent = app.museum.theme.accent;
    const buttonTop = PANEL_H * (1 - BUTTON_ZONE);
    g.fillStyle = '#fbfaf6';
    g.fillRect(0, 0, PANEL_W, PANEL_H);
    g.fillStyle = accent;
    g.fillRect(0, 0, PANEL_W, 14);
    g.textBaseline = 'top';
    g.font = '600 30px system-ui, sans-serif';
    g.fillText(a.artist.toUpperCase(), 56, 56);
    g.fillStyle = '#1c1b19';
    g.font = 'italic 58px Georgia, serif';
    g.fillText(tr(a.title, app.lang), 56, 104, PANEL_W - 112);
    g.fillStyle = '#5b5852';
    g.font = '28px system-ui, sans-serif';
    g.fillText(metaLine(app, a), 56, 184, PANEL_W - 112);
    g.fillStyle = '#1c1b19';
    g.font = '34px Georgia, serif';
    wrap(tr(a.description, app.lang), 56, 250, PANEL_W - 112, 50, buttonTop - 60);

    if (app.guide.available(a, app.lang)) {
      const playing = app.guide.playingId === a.id;
      g.fillStyle = playing ? '#1c1b19' : accent;
      g.fillRect(56, buttonTop + 16, PANEL_W - 112, PANEL_H * BUTTON_ZONE - 48);
      g.fillStyle = '#fff';
      g.font = '600 36px system-ui, sans-serif';
      g.textAlign = 'center';
      g.fillText(playing ? app.ui().stopAudio : app.ui().listen, PANEL_W / 2, buttonTop + 50);
      g.textAlign = 'left';
    }
    texture.needsUpdate = true;
  }

  function showPanel(art: PlacedArtwork) {
    app.guide.stop();
    current = art;
    drawPanel();
    // La fiche apparaît devant le visiteur, un peu sur sa droite, tournée vers lui.
    const dir = camera.getWorldDirection(new THREE.Vector3()).setY(0).normalize();
    dir.applyAxisAngle(THREE.Object3D.DEFAULT_UP, -0.45);
    headPosition();
    panel.position.copy(head).addScaledVector(dir, 1.25);
    panel.position.y = head.y - 0.1;
    panel.lookAt(head);
    panel.visible = true;
  }
  function hidePanel() {
    if (current) app.guide.stop();
    current = null;
    panel.visible = false;
  }

  // --- Manettes -------------------------------------------------------------
  const raycaster = new THREE.Raycaster();
  const rotation = new THREE.Matrix4();
  const rayLine = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3(0, 0, -1)]);
  const reticleGeo = new THREE.RingGeometry(0.16, 0.22, 40).rotateX(-Math.PI / 2);
  const reticleMat = new THREE.MeshBasicMaterial({ color: app.museum.theme.accent, toneMapped: false });

  function cast(controller: THREE.Object3D) {
    rotation.identity().extractRotation(controller.matrixWorld);
    raycaster.ray.origin.setFromMatrixPosition(controller.matrixWorld);
    raycaster.ray.direction.set(0, 0, -1).applyMatrix4(rotation);
    const targets: THREE.Object3D[] = panel.visible ? [panel, world.group] : [world.group];
    return raycaster.intersectObjects(targets, true)[0] ?? null;
  }
  const isFloor = (hit: THREE.Intersection) => Boolean(hit.object.userData.floor) && world.walkable(hit.point.x, hit.point.z);

  function onSelect(controller: THREE.Object3D) {
    const hit = cast(controller);
    if (!hit) return hidePanel();
    if (hit.object === panel) {
      if (current && hit.uv && hit.uv.y < BUTTON_ZONE && app.guide.available(current.config, app.lang)) {
        app.guide.toggle(current.config, app.lang, app.base);
      } else {
        hidePanel();
      }
      return;
    }
    let node: THREE.Object3D | null = hit.object;
    while (node && !node.userData.artwork) node = node.parent;
    if (node) return showPanel(node.userData.artwork);
    if (isFloor(hit)) {
      headPosition();
      rig.position.x += hit.point.x - head.x;
      rig.position.z += hit.point.z - head.z;
    } else {
      hidePanel();
    }
  }

  const hands = [0, 1].map((i) => {
    const controller = renderer.xr.getController(i);
    const line = new THREE.Line(rayLine, new THREE.LineBasicMaterial({ color: 0xffffff, toneMapped: false }));
    controller.add(line);
    controller.visible = false;
    controller.addEventListener('connected', () => (controller.visible = true));
    controller.addEventListener('disconnected', () => (controller.visible = false));
    controller.addEventListener('selectstart', () => onSelect(controller));
    rig.add(controller);
    const reticle = new THREE.Mesh(reticleGeo, reticleMat);
    reticle.visible = false;
    scene.add(reticle);
    return { controller, line, reticle };
  });

  let turned = false;
  const forward = new THREE.Vector3();

  return {
    /** À appeler à chaque image pendant la session VR. */
    update(dt: number) {
      for (const { controller, line, reticle } of hands) {
        const hit = controller.visible ? cast(controller) : null;
        line.scale.z = hit ? hit.distance : 6;
        reticle.visible = Boolean(hit && hit.object !== panel && isFloor(hit));
        if (reticle.visible) reticle.position.copy(hit!.point).setY(0.02);
      }

      for (const source of renderer.xr.getSession()?.inputSources ?? []) {
        const axes = source.gamepad?.axes;
        if (!axes) continue;
        const x = axes[2] ?? axes[0] ?? 0;
        const y = axes[3] ?? axes[1] ?? 0;
        if (source.handedness === 'left') {
          if (Math.hypot(x, y) < 0.15) continue;
          camera.getWorldDirection(forward).setY(0).normalize();
          const dx = (forward.x * -y + -forward.z * x) * MOVE_SPEED * dt;
          const dz = (forward.z * -y + forward.x * x) * MOVE_SPEED * dt;
          headPosition();
          if (world.walkable(head.x + dx, head.z + dz)) {
            rig.position.x += dx;
            rig.position.z += dz;
          } else if (world.walkable(head.x + dx, head.z)) {
            rig.position.x += dx;
          } else if (world.walkable(head.x, head.z + dz)) {
            rig.position.z += dz;
          }
        } else if (source.handedness === 'right') {
          if (Math.abs(x) > 0.6 && !turned) {
            // On pivote autour de la tête, pas autour du centre de la pièce réelle.
            turned = true;
            const angle = -Math.sign(x) * SNAP_ANGLE;
            headPosition();
            rig.position.sub(head).applyAxisAngle(THREE.Object3D.DEFAULT_UP, angle).add(head);
            rig.position.y = 0;
            rig.rotation.y += angle;
          } else if (Math.abs(x) < 0.3) {
            turned = false;
          }
        }
      }
    },
    /** Redessine la fiche (changement de langue, lecture audio démarrée ou terminée). */
    refresh: drawPanel,
    /** La fiche flottante, exposée pour les tests. */
    panel: panel as THREE.Object3D,
  };
}

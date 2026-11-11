import type { MuseumConfig } from './types';
import { tr } from './types';
import { wallFrame } from './world';

const NS = 'http://www.w3.org/2000/svg';

function el(name: string, attrs: Record<string, string | number>, parent?: Element) {
  const node = document.createElementNS(NS, name);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
  parent?.appendChild(node);
  return node;
}

/** Plan du musée vu de dessus : salles cliquables, portes, œuvres et position du visiteur. */
export function buildMap(container: HTMLElement, museum: MuseumConfig, onRoom: (roomId: string) => void) {
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
  const pad = 0.8;
  const svg = el('svg', { viewBox: `${minX - pad} ${minZ - pad} ${maxX - minX + pad * 2} ${maxZ - minZ + pad * 2}`, class: 'map-svg' });
  container.replaceChildren(svg);

  const labels = new Map<string, { group: Element; text: Element }>();
  for (const r of museum.rooms) {
    const [w, , d] = r.size;
    const g = el('g', { class: 'map-room', tabindex: 0, role: 'button' }, svg);
    el('rect', { x: r.position[0] - w / 2, y: r.position[1] - d / 2, width: w, height: d }, g);
    const text = el('text', { x: r.position[0], y: r.position[1] - d / 2 + 1.1, 'text-anchor': 'middle', 'font-size': 0.62 }, g);
    labels.set(r.id, { group: g, text });
    g.addEventListener('click', () => onRoom(r.id));
    g.addEventListener('keydown', (e) => {
      const key = (e as KeyboardEvent).key;
      if (key === 'Enter' || key === ' ') {
        e.preventDefault();
        onRoom(r.id);
      }
    });

    for (const a of r.artworks) {
      if (a.type === 'sculpture') {
        el('circle', { class: 'map-art', cx: r.position[0] + a.position[0], cy: r.position[1] + a.position[1], r: 0.28 }, g);
      } else {
        const f = wallFrame(r, a.wall);
        const p = f.center.clone().addScaledVector(f.tangent, a.offset).addScaledVector(f.normal, 0.28);
        const along = Math.abs(f.tangent.x) > 0.5;
        const len = a.width;
        el('rect', { class: 'map-art', x: p.x - (along ? len / 2 : 0.09), y: p.z - (along ? 0.09 : len / 2), width: along ? len : 0.18, height: along ? 0.18 : len }, g);
      }
    }
  }

  for (const door of museum.doors ?? []) {
    const room = museum.rooms.find((r) => r.id === door.room);
    if (!room) continue;
    const f = wallFrame(room, door.wall);
    const a = f.center.clone().addScaledVector(f.tangent, door.offset - door.width / 2);
    const b = f.center.clone().addScaledVector(f.tangent, door.offset + door.width / 2);
    el('line', { class: 'map-door', x1: a.x, y1: a.z, x2: b.x, y2: b.z }, svg);
  }

  const you = el('g', { class: 'map-you' }, svg);
  el('circle', { r: 0.75, class: 'map-you-halo' }, you);
  el('path', { d: 'M0,-0.72 L0.46,0.5 L0,0.22 L-0.46,0.5 Z' }, you);

  return {
    update(x: number, z: number, yaw: number) {
      you.setAttribute('transform', `translate(${x.toFixed(2)} ${z.toFixed(2)}) rotate(${((-yaw * 180) / Math.PI).toFixed(1)})`);
    },
    setLang(lang: string) {
      for (const r of museum.rooms) {
        const l = labels.get(r.id)!;
        l.text.textContent = tr(r.name, lang);
        l.group.setAttribute('aria-label', tr(r.name, lang));
      }
    },
    setCurrent(roomId: string | null) {
      for (const [id, l] of labels) l.group.classList.toggle('current', id === roomId);
    },
  };
}

import * as THREE from 'three';
import type { ImageSource } from './types';

/** Générateur pseudo-aléatoire déterministe : une même graine donne la même œuvre. */
function rng(seed: number) {
  let s = (seed * 2654435761) >>> 0 || 1;
  return () => {
    s ^= s << 13;
    s >>>= 0;
    s ^= s >>> 17;
    s ^= s << 5;
    s >>>= 0;
    return s / 4294967296;
  };
}

const PALETTES = [
  ['#f3ead8', '#1f2a44', '#c8432b', '#e2a72e', '#2f6f6a'],
  ['#efe6dc', '#2b2b2b', '#b5523b', '#d9b08c', '#5b7b7a'],
  ['#f5efe2', '#243b53', '#d1603d', '#f0c05a', '#829e86'],
  ['#ece4d6', '#3a2e39', '#a23e48', '#e0a458', '#4f6d7a'],
];

function canvasOf(w: number, h: number) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return { c, g: c.getContext('2d')! };
}

function grain(g: CanvasRenderingContext2D, w: number, h: number, r: () => number) {
  g.globalAlpha = 0.05;
  for (let i = 0; i < 9000; i++) {
    g.fillStyle = r() > 0.5 ? '#fff' : '#000';
    g.fillRect(r() * w, r() * h, 2, 2);
  }
  g.globalAlpha = 1;
}

function geometric(g: CanvasRenderingContext2D, w: number, h: number, r: () => number, p: string[]) {
  g.fillStyle = p[0];
  g.fillRect(0, 0, w, h);
  for (let i = 0; i < 9; i++) {
    g.fillStyle = p[1 + Math.floor(r() * 4)];
    const bw = w * (0.08 + r() * 0.3);
    const bh = h * (0.08 + r() * 0.4);
    g.fillRect(r() * (w - bw), r() * (h - bh), bw, bh);
  }
  g.fillStyle = p[2];
  g.beginPath();
  g.arc(w * (0.6 + r() * 0.25), h * (0.3 + r() * 0.3), Math.min(w, h) * 0.17, 0, Math.PI * 2);
  g.fill();
  g.strokeStyle = p[1];
  g.lineWidth = w * 0.006;
  for (let i = 0; i < 4; i++) {
    g.beginPath();
    g.moveTo(r() * w, r() * h);
    g.lineTo(r() * w, r() * h);
    g.stroke();
  }
}

function fields(g: CanvasRenderingContext2D, w: number, h: number, r: () => number, p: string[]) {
  g.fillStyle = p[1];
  g.fillRect(0, 0, w, h);
  const bands = [p[2], p[3], p[4]];
  let y = h * 0.06;
  bands.forEach((col, i) => {
    const bh = h * (0.2 + r() * 0.14);
    g.filter = `blur(${Math.round(w * 0.02)}px)`;
    g.fillStyle = col;
    g.globalAlpha = 0.92;
    g.fillRect(w * 0.08, y, w * 0.84, bh);
    g.filter = 'none';
    g.globalAlpha = 1;
    y += bh + h * (i === 2 ? 0 : 0.05);
  });
}

function lines(g: CanvasRenderingContext2D, w: number, h: number, r: () => number, p: string[]) {
  g.fillStyle = p[0];
  g.fillRect(0, 0, w, h);
  const phase = r() * 6;
  for (let i = 0; i < 140; i++) {
    const y0 = (i / 140) * h * 1.2 - h * 0.1;
    g.strokeStyle = p[1 + (i % 4)];
    g.globalAlpha = 0.35 + r() * 0.5;
    g.lineWidth = 1 + r() * 3;
    g.beginPath();
    for (let x = 0; x <= w; x += 12) {
      const y =
        y0 +
        Math.sin(x * 0.006 + phase + i * 0.05) * h * 0.06 +
        Math.sin(x * 0.019 + i * 0.3) * h * 0.012;
      if (x === 0) g.moveTo(x, y);
      else g.lineTo(x, y);
    }
    g.stroke();
  }
  g.globalAlpha = 1;
}

/** Texture d'une œuvre : image fournie par le musée, ou tableau fictif généré. */
export function artworkTexture(image: ImageSource, ratio: number, base: string): THREE.Texture {
  let tex: THREE.Texture;
  if ('src' in image) {
    tex = new THREE.TextureLoader().load(new URL(image.src, base).href);
  } else {
    const w = 1024;
    const h = Math.round(w / ratio);
    const { c, g } = canvasOf(w, h);
    const r = rng(image.seed);
    const p = PALETTES[Math.floor(r() * PALETTES.length)];
    ({ geometric, fields, lines })[image.generator](g, w, h, r, p);
    grain(g, w, h, r);
    tex = new THREE.CanvasTexture(c);
  }
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

/** Parquet à chevrons simples, teinté par la couleur du thème. */
export function floorTexture(color: string): THREE.Texture {
  const { c, g } = canvasOf(512, 512);
  const r = rng(99);
  g.fillStyle = color;
  g.fillRect(0, 0, 512, 512);
  const plank = 64;
  for (let row = 0; row < 8; row++) {
    const shift = row % 2 ? 128 : 0;
    for (let x = -256; x < 512; x += 256) {
      g.fillStyle = r() > 0.5 ? '#000' : '#fff';
      g.globalAlpha = 0.02 + r() * 0.05;
      g.fillRect(x + shift, row * plank, 256, plank);
    }
    g.globalAlpha = 0.22;
    g.fillStyle = '#000';
    g.fillRect(0, row * plank, 512, 1.5);
    for (let x = -256; x < 512; x += 256) g.fillRect(x + shift, row * plank, 1.5, plank);
  }
  g.globalAlpha = 1;
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = 8;
  return tex;
}

/** Cartel posé à côté de l'œuvre. */
export function labelTexture(title: string, artist: string, year: string): THREE.Texture {
  const { c, g } = canvasOf(512, 256);
  g.fillStyle = '#fbfaf6';
  g.fillRect(0, 0, 512, 256);
  g.fillStyle = '#1c1b19';
  g.font = '600 40px Georgia, serif';
  g.fillText(artist, 32, 78, 448);
  g.font = 'italic 34px Georgia, serif';
  g.fillText(title, 32, 136, 448);
  g.font = '28px Georgia, serif';
  g.fillStyle = '#5b5852';
  g.fillText(year, 32, 190, 448);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

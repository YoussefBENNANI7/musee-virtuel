/**
 * Ambiance sonore : le bruit de l'eau des fontaines. Il grandit quand le visiteur s'approche,
 * vient du côté où se trouve la fontaine, et s'étouffe quand on l'entend d'une salle voisine.
 * Le son ne démarre qu'au premier geste du visiteur, comme l'exigent les navigateurs.
 */
export interface Listener {
  x: number;
  z: number;
  yaw: number;
  room: string | null;
}

export interface Ambiance {
  /** À appeler lors d'un geste du visiteur (clic, touche) : prépare et lance le son. */
  start(): void;
  update(listener: Listener): void;
  /** Baisse l'ambiance pendant qu'un commentaire est lu. */
  duck(on: boolean): void;
  toggle(): boolean;
  readonly muted: boolean;
  readonly state: { started: boolean; muted: boolean; level: number; pan: number };
}

const KEY = 'musee-virtuel:son';
const VOLUME = 0.9;
const DUCKED = 0.25;
/**
 * Le fichier contient une boucle de 20 s, précédée et suivie de 0,3 s de la même eau :
 * on boucle sur la partie centrale, sans dépendre du silence qu'un fichier MP3 ajoute à ses bords.
 */
const LOOP_START = 0.3;
const LOOP_LENGTH = 20;

export function setupAmbiance(sources: { x: number; z: number; room: string }[], url: string): Ambiance {
  let muted = false;
  try {
    muted = localStorage.getItem(KEY) === 'coupé';
  } catch {
    // Stockage indisponible : le son suit le réglage par défaut.
  }
  let ctx: AudioContext | null = null;
  let master: GainNode | null = null;
  let ducked = false;
  let level = 0;
  let pan = 0;
  const voices: { gain: GainNode; filter: BiquadFilterNode; panner: StereoPannerNode }[] = [];
  let last: Listener | null = null;

  const applyMaster = () => master?.gain.setTargetAtTime(muted ? 0 : ducked ? DUCKED : VOLUME, ctx!.currentTime, 0.25);

  function place(listener: Listener) {
    last = listener;
    if (!ctx || voices.length === 0) return;
    for (const [i, source] of sources.entries()) {
      const dx = source.x - listener.x;
      const dz = source.z - listener.z;
      const distance = Math.hypot(dx, dz);
      const same = listener.room === source.room;
      // Plein volume au bord du bassin, la moitié à 2,50 m ; d'une autre salle, le son arrive assourdi.
      const gain = (same ? 1 : 0.45) / (1 + (distance / 2.5) ** 2);
      // Côté d'où vient le son : à droite du regard, positif.
      const side = distance > 0.01 ? (dx * Math.cos(listener.yaw) - dz * Math.sin(listener.yaw)) / distance : 0;
      const voice = voices[i];
      const now = ctx.currentTime;
      voice.gain.gain.setTargetAtTime(gain, now, 0.2);
      voice.panner.pan.setTargetAtTime(0.8 * side * Math.min(1, distance / 1.5), now, 0.2);
      voice.filter.frequency.setTargetAtTime(same ? 14000 : 900, now, 0.3);
      if (i === 0) {
        level = gain;
        pan = 0.8 * side * Math.min(1, distance / 1.5);
      }
    }
  }

  return {
    get muted() {
      return muted;
    },
    get state() {
      return { started: ctx !== null, muted, level, pan };
    },
    start() {
      if (ctx || sources.length === 0) return;
      const Context = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Context) return;
      const context = (ctx = new Context());
      master = context.createGain();
      master.gain.value = 0;
      master.connect(context.destination);
      void fetch(url)
        .then((res) => (res.ok ? res.arrayBuffer() : Promise.reject(new Error(String(res.status)))))
        .then((data) => context.decodeAudioData(data))
        .then((buffer) => {
          for (const _ of sources) {
            const node = context.createBufferSource();
            node.buffer = buffer;
            node.loop = true;
            node.loopStart = LOOP_START;
            node.loopEnd = LOOP_START + LOOP_LENGTH;
            const filter = context.createBiquadFilter();
            filter.type = 'lowpass';
            const gain = context.createGain();
            gain.gain.value = 0;
            const panner = context.createStereoPanner();
            node.connect(filter).connect(gain).connect(panner).connect(master!);
            // Chaque fontaine commence ailleurs dans l'enregistrement : deux bassins ne chantent pas à l'unisson.
            node.start(0, LOOP_START + Math.random() * LOOP_LENGTH);
            voices.push({ gain, filter, panner });
          }
          applyMaster();
          if (last) place(last);
        })
        .catch(() => console.warn('[musée] son d’ambiance introuvable'));
    },
    update: place,
    duck(on) {
      ducked = on;
      if (ctx) applyMaster();
    },
    toggle() {
      muted = !muted;
      try {
        localStorage.setItem(KEY, muted ? 'coupé' : 'actif');
      } catch {
        // Voir plus haut.
      }
      if (ctx) applyMaster();
      return muted;
    },
  };
}

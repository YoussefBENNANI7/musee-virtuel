/**
 * Ambiance sonore : le bruit de l'eau des fontaines, et la musique de chaque salle.
 * L'eau grandit quand le visiteur s'approche, vient du côté où se trouve la fontaine, et s'étouffe quand on
 * l'entend d'une salle voisine. La musique est celle de la salle où l'on se trouve : en changeant de salle, elle
 * se fond dans la suivante (ou continue, si c'est la même). Toutes deux baissent quand une voix parle.
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
  /**
   * `level`, `pan` : l'eau de la première fontaine. `music` : adresse de la musique que l'on entend (ou vers
   * laquelle on se fond), `musicGain` : son volume visé, mise en sourdine et baisse sous les voix comprises.
   */
  readonly state: { started: boolean; muted: boolean; level: number; pan: number; music: string | null; musicGain: number };
}

/** Musique d'une salle, telle que l'ambiance la joue. */
export interface RoomMusic {
  url: string;
  volume: number;
  loop?: [number, number];
}

const KEY = 'musee-virtuel:son';
const VOLUME = 0.9;
const DUCKED = 0.25;
/**
 * Volume de la musique, pour un fichier égalisé à -23 LUFS : environ 16 dB sous les voix enregistrées
 * (-18 LUFS), réglage écouté et retenu par le porteur le 25 novembre 2026. Sous une voix, elle baisse encore
 * de 12 dB (DUCKED), comme l'eau.
 */
const MUSIC = 0.25;
/** Temps du fondu d'une musique dans la suivante, en secondes (constante de temps : le fondu est fait en trois fois plus). */
const FADE = 1.2;
/**
 * Le fichier contient une boucle de 20 s, précédée et suivie de 0,3 s de la même eau :
 * on boucle sur la partie centrale, sans dépendre du silence qu'un fichier MP3 ajoute à ses bords.
 */
const LOOP_START = 0.3;
const LOOP_LENGTH = 20;

export function setupAmbiance(sources: { x: number; z: number; room: string }[], url: string, music: Map<string, RoomMusic> = new Map()): Ambiance {
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
  /** Musiques décodées, par adresse : chacune n'est chargée qu'une fois, à la première salle qui la demande. */
  const buffers = new Map<string, Promise<AudioBuffer | null>>();
  /** La musique qui joue (ou qui se fond vers le volume voulu), et celles qui s'éteignent. */
  type Track = { url: string; source: AudioBufferSourceNode | null; gain: GainNode };
  let track: Track | null = null;
  let wanted: RoomMusic | null = null;

  const applyMaster = () => master?.gain.setTargetAtTime(muted ? 0 : ducked ? DUCKED : VOLUME, ctx!.currentTime, 0.25);

  function load(context: AudioContext, address: string) {
    let buffer = buffers.get(address);
    if (!buffer) {
      buffer = fetch(address)
        .then((res) => (res.ok ? res.arrayBuffer() : Promise.reject(new Error(String(res.status)))))
        .then((data) => context.decodeAudioData(data))
        .catch(() => {
          console.warn(`[musée] musique introuvable : ${address}`);
          return null;
        });
      buffers.set(address, buffer);
    }
    return buffer;
  }

  /** Se fond vers la musique de la salle où se trouve le visiteur ; ne fait rien si c'est déjà elle. */
  function follow(room: string | null) {
    const next = (room !== null && music.get(room)) || null;
    if (!ctx || !master || (next?.url ?? null) === (track?.url ?? null)) {
      wanted = next;
      return;
    }
    wanted = next;
    const now = ctx.currentTime;
    if (track) {
      const old = track;
      old.gain.gain.cancelScheduledValues(now);
      old.gain.gain.setTargetAtTime(0, now, FADE);
      window.setTimeout(() => {
        old.source?.stop();
        old.gain.disconnect();
      }, FADE * 6000);
      track = null;
    }
    if (!next) return;
    const context = ctx;
    const gain = context.createGain();
    gain.gain.value = 0;
    gain.connect(master);
    const current: Track = { url: next.url, source: null, gain };
    track = current;
    void load(context, next.url).then((buffer) => {
      // Entre-temps, le visiteur a pu changer de salle : on ne lance que la musique encore voulue.
      if (!buffer || track !== current) return;
      const source = context.createBufferSource();
      source.buffer = buffer;
      source.loop = true;
      if (next.loop) {
        source.loopStart = next.loop[0];
        source.loopEnd = Math.min(next.loop[1], buffer.duration);
      }
      source.connect(gain);
      source.start(0, next.loop ? next.loop[0] : 0);
      current.source = source;
      gain.gain.setTargetAtTime(MUSIC * next.volume, context.currentTime, FADE);
    });
  }

  function place(listener: Listener) {
    last = listener;
    follow(listener.room);
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
      const musicGain = track && wanted ? (muted ? 0 : (ducked ? DUCKED : VOLUME) * MUSIC * wanted.volume) : 0;
      return { started: ctx !== null, muted, level, pan, music: track?.url ?? null, musicGain };
    },
    start() {
      if (ctx || (sources.length === 0 && music.size === 0)) return;
      const Context = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Context) return;
      const context = (ctx = new Context());
      master = context.createGain();
      master.gain.value = 0;
      master.connect(context.destination);
      applyMaster();
      if (last) follow(last.room);
      if (sources.length === 0) return;
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

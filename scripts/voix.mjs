// Produit les voix de l'audioguide avec le service de voix de Google Gemini.
//
// Usage :
//   npm run voix -- demo --voix Sulafat                Produit toutes les voix du musée avec cette voix
//   npm run voix -- demo                               Complète ou met à jour, avec la voix déjà choisie
//   npm run voix -- demo --essai --voix Sulafat,Achernar --oeuvres les-moissonneurs,la-grande-vague
//                                                      Extraits à écouter, rangés dans essais-voix/ (hors du musée)
//   npm run voix -- --catalogue fr-FR                  Liste les voix féminines du catalogue pour une langue
//
// Options : --modele <id> (gemini-3.8-flash-tts par défaut), --style "<consigne>" (ton de lecture, en anglais).
//
// Pour chaque œuvre et chaque langue du musée, le script envoie le texte lu (src/engine/narration.ts),
// reçoit un WAV, le compresse en MP3 (ffmpeg) dans audio/, et renseigne le champ "audio" de l'œuvre.
// Un fichier audio/voix.json retient la voix, le ton et l'empreinte de chaque texte : relancé, le script
// ne refait que les textes modifiés. S'il atteint la limite du jour, il s'arrête proprement ; on le relance
// le lendemain et il reprend là où il en était.
//
// La clé d'accès : variable d'environnement GEMINI_API_KEY. Dans l'environnement de travail cloud,
// elle est ajoutée par le réseau, et la variable n'est pas nécessaire.
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { narrationText } from '../src/engine/narration.ts';

const API = 'https://generativelanguage.googleapis.com/v1beta';
const DEFAULT_MODEL = 'gemini-3.8-flash-tts';
const DEFAULT_STYLE = 'warm and gentle, unhurried, like a museum guide telling a story';
const BITRATE = '48k';

// --- Arguments ---------------------------------------------------------------
const argv = process.argv.slice(2);
const flag = (name) => argv.includes(`--${name}`);
const option = (name) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : null;
};
const optionValues = new Set(['voix', 'oeuvres', 'modele', 'style', 'catalogue'].map((n) => option(n)).filter(Boolean));
const museumId = argv.find((a) => !a.startsWith('--') && !optionValues.has(a)) ?? 'demo';

const headers = { 'Content-Type': 'application/json', 'x-goog-api-key': process.env.GEMINI_API_KEY || 'cle-ajoutee-par-le-reseau' };

async function call(path, init) {
  const res = await fetch(`${API}${path}`, { ...init, headers });
  const body = await res.text();
  if (!res.ok) {
    const error = new Error(`${res.status} ${body.slice(0, 400)}`);
    error.status = res.status;
    error.body = body;
    throw error;
  }
  return JSON.parse(body);
}

/** Message clair pour les erreurs les plus probables. */
function explain(error) {
  if (/API key not valid|API_KEY_INVALID/.test(error.body ?? '')) return 'la clé d’accès est absente ou invalide (variable GEMINI_API_KEY, ou secret réseau de l’environnement cloud).';
  if (error.status === 403) return 'accès refusé : la clé n’a pas accès à ce service, ou le réseau bloque generativelanguage.googleapis.com.';
  return error.message;
}

// --- Catalogue des voix ---------------------------------------------------------
if (flag('catalogue')) {
  const lang = option('catalogue') ?? 'fr-FR';
  const query = new URLSearchParams({ language_code: lang, gender: 'female', page_size: '200' });
  const { voices = [] } = await call(`/voices?${query}`, { method: 'GET' }).catch((error) => {
    console.error(`Erreur : ${explain(error)}`);
    process.exit(1);
  });
  for (const v of voices) {
    console.log(`${v.id ?? v.name} | ${v.display_name ?? v.displayName ?? ''} | ${v.accent ?? ''} | ${v.pitch ?? ''} | ${(v.contexts ?? []).join(', ')} | ${v.description ?? ''}`);
  }
  console.log(`${voices.length} voix féminines pour ${lang}.`);
  process.exit(0);
}

// --- Musée ----------------------------------------------------------------------
const dir = fileURLToPath(new URL(`../public/museums/${museumId}/`, import.meta.url));
const configPath = join(dir, 'museum.json');
const museum = JSON.parse(readFileSync(configPath, 'utf8'));
const essai = flag('essai');
const manifestPath = join(dir, 'audio', 'voix.json');
const manifest = existsSync(manifestPath) ? JSON.parse(readFileSync(manifestPath, 'utf8')) : { files: {} };

const voices = (option('voix') ?? manifest.voice ?? '').split(',').filter(Boolean);
if (voices.length === 0) {
  console.error('Indiquez une voix : npm run voix -- demo --voix <nom>');
  process.exit(1);
}
if (!essai && voices.length > 1) {
  console.error('Une seule voix pour tout le musée. Pour comparer plusieurs voix, ajoutez --essai.');
  process.exit(1);
}
const model = option('modele') ?? manifest.model ?? DEFAULT_MODEL;
const style = option('style') ?? manifest.style ?? DEFAULT_STYLE;

const wanted = option('oeuvres')?.split(',');
const artworks = museum.rooms.flatMap((r) => r.artworks).filter((a) => !wanted || wanted.includes(a.id));
if (wanted) {
  for (const id of wanted) if (!artworks.some((a) => a.id === id)) console.error(`✗ œuvre inconnue : ${id}`);
}

try {
  execFileSync('ffmpeg', ['-version'], { stdio: 'ignore' });
} catch {
  console.error('ffmpeg est nécessaire pour compresser les voix. Sur Mac : brew install ffmpeg');
  process.exit(1);
}

// --- Production -----------------------------------------------------------------
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const fingerprint = (text, voice) => createHash('sha256').update(JSON.stringify([model, voice, style, text])).digest('hex').slice(0, 16);

/** Demande la voix d'un texte ; réessaie quand le service demande de patienter. */
async function synthesize(text, voice) {
  for (let attempt = 1; ; attempt++) {
    try {
      const out = await call('/interactions', {
        method: 'POST',
        body: JSON.stringify({
          model,
          input: [{ type: 'user_input', content: [{ type: 'text', text, annotations: style ? [{ type: 'speech_metadata', style }] : [] }] }],
          response_format: { type: 'audio', mime_type: 'audio/wav' },
          generation_config: { speech_config: [{ voice }] },
        }),
      });
      const audio = (out.steps ?? [])
        .filter((s) => s.type === 'model_output')
        .flatMap((s) => s.content ?? [])
        .filter((c) => c.type === 'audio')
        .at(-1);
      if (!audio?.data) throw Object.assign(new Error(`réponse sans audio : ${JSON.stringify(out).slice(0, 300)}`), { status: 0 });
      return Buffer.from(audio.data, 'base64');
    } catch (error) {
      // Limite du jour atteinte : inutile d'insister, on reprendra demain.
      if (error.status === 429 && /per.?day|PerDay|daily/i.test(error.body ?? '')) throw Object.assign(error, { daily: true });
      const retriable = error.status === 429 || error.status >= 500 || error.status === 0;
      if (!retriable || attempt >= 6) throw error;
      const hinted = Number(/"retryDelay":\s*"(\d+)/.exec(error.body ?? '')?.[1]);
      const wait = (hinted || 10 * attempt) * 1000;
      console.log(`  … le service demande de patienter, nouvel essai dans ${Math.round(wait / 1000)} s`);
      await sleep(wait);
    }
  }
}

/** Compresse un WAV en MP3 mono et renvoie sa durée en secondes. */
function encode(wav, out) {
  const tmp = join(tmpdir(), `voix-${process.pid}.wav`);
  writeFileSync(tmp, wav);
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', tmp, '-ac', '1', '-c:a', 'libmp3lame', '-b:a', BITRATE, out]);
  rmSync(tmp);
  const duration = execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', out]).toString();
  return Number(duration);
}

function saveConfig() {
  if (essai) return;
  writeFileSync(manifestPath, `${JSON.stringify({ voice: voices[0], model, style, files: manifest.files }, null, 2)}\n`);
  writeFileSync(configPath, `${JSON.stringify(museum, null, 2)}\n`);
}

// Changer de voix, de modèle ou de ton refait tout : sinon le musée mêlerait deux voix.
if (!essai && (manifest.voice !== voices[0] || manifest.model !== model || manifest.style !== style)) manifest.files = {};

const outDir = essai ? fileURLToPath(new URL('../essais-voix/', import.meta.url)) : join(dir, 'audio');
let made = 0;
let kept = 0;
let seconds = 0;
let stopped = null;
outer: for (const voice of voices) {
  for (const art of artworks) {
    for (const lang of museum.langs) {
      const text = narrationText(art, lang);
      const name = `${art.id}.${lang}.mp3`;
      const rel = essai ? join(voice, name) : `audio/${name}`;
      const out = join(outDir, essai ? join(voice, name) : name);
      const print = fingerprint(text, voice);
      if (!essai && manifest.files[rel] === print && existsSync(out)) {
        kept++;
        continue;
      }
      try {
        const wav = await synthesize(text, voice);
        mkdirSync(join(out, '..'), { recursive: true });
        const duration = encode(wav, out);
        seconds += duration;
        made++;
        console.log(`✓ ${essai ? `${voice} · ` : ''}${art.id} (${lang}) : ${duration.toFixed(1)} s`);
        if (!essai) {
          manifest.files[rel] = print;
          art.audio = { ...(art.audio ?? {}), [lang]: rel };
          saveConfig();
        }
      } catch (error) {
        stopped = error.daily
          ? 'limite du jour atteinte : relancez la même commande demain, le travail reprendra là où il s’est arrêté.'
          : `${art.id} (${lang}) : ${explain(error)}`;
        break outer;
      }
      await sleep(1200);
    }
  }
}

const minutes = Math.floor(seconds / 60);
console.log(`\n${made} voix produite(s), ${kept} déjà à jour, ${minutes} min ${Math.round(seconds % 60)} s d'audio.`);
if (essai) console.log(`Extraits rangés dans ${outDir}`);
if (stopped) {
  console.error(`Arrêt : ${stopped}`);
  process.exitCode = 1;
}

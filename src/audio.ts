import type { ArtworkConfig } from './engine/types';
import { tr } from './engine/types';

const VOICE_LANG: Record<string, string> = { fr: 'fr-FR', en: 'en-GB', ar: 'ar-SA', es: 'es-ES' };

/**
 * Audioguide. Lit l'enregistrement fourni par le musée s'il existe pour la langue,
 * sinon fait lire le texte par la voix de synthèse du navigateur.
 */
export class AudioGuide {
  /** Identifiant de l'œuvre en cours de lecture. */
  playingId: string | null = null;
  onChange: () => void = () => {};
  private audio: HTMLAudioElement | null = null;

  available(cfg: ArtworkConfig, lang: string): boolean {
    return Boolean(cfg.audio?.[lang]) || 'speechSynthesis' in window;
  }

  toggle(cfg: ArtworkConfig, lang: string, base: string) {
    if (this.playingId === cfg.id) this.stop();
    else this.play(cfg, lang, base);
  }

  play(cfg: ArtworkConfig, lang: string, base: string) {
    this.stop();
    const done = () => {
      if (this.playingId !== cfg.id) return;
      this.playingId = null;
      this.onChange();
    };
    const file = cfg.audio?.[lang];
    if (file) {
      this.audio = new Audio(new URL(file, base).href);
      this.audio.addEventListener('ended', done);
      this.audio.addEventListener('error', done);
      void this.audio.play().catch(done);
    } else if ('speechSynthesis' in window) {
      const text = `${tr(cfg.title, lang)}. ${cfg.artist}, ${cfg.year}. ${tr(cfg.description, lang)}`;
      const speech = new SpeechSynthesisUtterance(text);
      speech.lang = VOICE_LANG[lang] ?? lang;
      const voice = speechSynthesis.getVoices().find((v) => v.lang.toLowerCase().startsWith(lang));
      if (voice) speech.voice = voice;
      speech.rate = 0.95;
      speech.onend = done;
      speech.onerror = done;
      speechSynthesis.speak(speech);
    } else {
      return;
    }
    this.playingId = cfg.id;
    this.onChange();
  }

  stop() {
    if (this.audio) {
      this.audio.pause();
      this.audio = null;
    }
    if ('speechSynthesis' in window) speechSynthesis.cancel();
    if (this.playingId !== null) {
      this.playingId = null;
      this.onChange();
    }
  }
}

import type { ArtworkConfig, L10n } from './types';

/*
 * Texte lu par l'audioguide : le cartel (titre, artiste, date), puis le commentaire.
 * Il sert à la voix du navigateur comme aux voix enregistrées (scripts/voix.mjs), qui
 * l'importe directement : ce fichier ne dépend donc d'aucun autre à l'exécution.
 */

const pick = (text: string | L10n, lang: string): string =>
  typeof text === 'string' ? text : (text[lang] ?? Object.values(text)[0] ?? '');

const ROMAN: Record<string, number> = { I: 1, V: 5, X: 10, L: 50, C: 100 };
function roman(numeral: string): number {
  let total = 0;
  for (let i = 0; i < numeral.length; i++) {
    const value = ROMAN[numeral[i]];
    const next = ROMAN[numeral[i + 1]] ?? 0;
    total += value < next ? -value : value;
  }
  return total;
}

const UNITS = ['', 'premier', 'deux', 'trois', 'quatre', 'cinq', 'six', 'sept', 'huit', 'neuf', 'dix', 'onze', 'douze', 'treize', 'quatorze', 'quinze', 'seize'];
/** Siècle en toutes lettres, en français : 14 → « quatorzième ». Jusqu'au XXIe siècle. */
export function centuryFr(n: number): string {
  if (n === 1) return 'premier';
  const base =
    n <= 16 ? UNITS[n] : n < 20 ? `dix-${UNITS[n - 10]}` : n === 20 ? 'vingt' : n === 21 ? 'vingt et un' : String(n);
  // quatre → quatrième, neuf → neuvième, cinq → cinquième, onze → onzième…
  return `${base.replace(/e$/, '').replace(/f$/, 'v').replace(/q$/, 'qu')}ième`;
}

/** Réécrit ce qu'une voix de synthèse lit mal : siècles en chiffres romains, intervalles de dates, abréviations. */
export function spoken(text: string, lang: string): string {
  let t = text;
  if (lang === 'fr') {
    // « XIVe » → « quatorzième ». Un mot ordinaire écrit avec ces lettres (« Ce », « Le ») vaut plus de 21 : il reste tel quel.
    t = t.replace(/\b([IVXLC]+)e\b/g, (word: string, r: string) => {
      const n = roman(r);
      return n >= 2 && n <= 21 ? centuryFr(n) : word;
    });
    t = t.replace(/\bvers (\d{3,4}) ?– ?(\d{3,4})\b/g, 'entre $1 et $2');
    t = t.replace(/\b(\d{3,4}) ?– ?(\d{3,4})\b/g, 'de $1 à $2');
    t = t.replace(/ ?– ?(début|fin|milieu)/g, ' au $1');
    t = t.replace(/(ième) ?– ?/g, '$1 au ');
    t = t.replace(/\bn° ?/g, 'numéro ');
  } else {
    t = t.replace(/\bc\. ?(\d)/g, 'around $1');
    // « 1830–32 » : l'année de fin s'écrit en entier.
    t = t.replace(/\b(\d{2})(\d{2}) ?– ?(\d{1,2})\b/g, (_, c: string, y: string, end: string) => {
      const full = end.length === 2 ? `${c}${end}` : `${c}${y[0]}${end}`;
      return `${c}${y} to ${full}`;
    });
    t = t.replace(/\b(\d{3,4}) ?– ?(\d{3,4})\b/g, '$1 to $2');
    t = t.replace(/(\d(?:st|nd|rd|th)) ?– ?/g, '$1 to ');
    t = t.replace(/\bNo\. ?(\d)/g, 'number $1');
  }
  return t;
}

/** Texte complet lu pour une œuvre, dans une langue. */
export function narrationText(a: Pick<ArtworkConfig, 'title' | 'artist' | 'year' | 'description'>, lang: string): string {
  const title = pick(a.title, lang);
  const artist = pick(a.artist, lang);
  const year = pick(a.year, lang);
  const label = [artist, year].filter(Boolean).join(', ');
  return spoken(`${title}. ${label}. ${pick(a.description, lang)}`, lang);
}

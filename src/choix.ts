/**
 * Page de choix : quand l'adresse ne désigne aucun musée, on propose ceux de `museums/index.json`.
 * C'est une liste tenue à la main : elle dit quels musées se présentent au public. Un musée créé
 * dans l'éditeur n'y figure qu'une fois ajouté ici. S'il y en a un seul (ou aucune liste), on ouvre
 * directement le musée de démonstration, comme avant.
 */
export interface MuseumEntry {
  id: string;
  name: Record<string, string>;
  summary: Record<string, string>;
  /** Image de couverture, depuis le dossier des musées. */
  image: string;
  accent?: string;
}

/** La liste des musées proposés, ou une liste vide si elle est absente ou illisible. */
export async function loadMuseumList(): Promise<MuseumEntry[]> {
  try {
    const res = await fetch(new URL('museums/index.json', document.baseURI));
    if (!res.ok) return [];
    const list = await res.json();
    return Array.isArray(list) ? list.filter((m) => m && typeof m.id === 'string' && m.name) : [];
  } catch {
    return [];
  }
}

const TEXT: Record<string, { title: string; subtitle: string; open: string }> = {
  fr: { title: 'Musées virtuels', subtitle: 'Choisissez le musée à visiter.', open: 'Entrer' },
  en: { title: 'Virtual museums', subtitle: 'Choose a museum to visit.', open: 'Enter' },
};

/** Affiche la page de choix à la place de la visite. */
export function showChooser(list: MuseumEntry[]) {
  const lang = navigator.language.startsWith('fr') ? 'fr' : 'en';
  const t = TEXT[lang];
  const pick = (text: Record<string, string> | undefined) => text?.[lang] ?? Object.values(text ?? {})[0] ?? '';
  document.title = t.title;
  document.documentElement.lang = lang;
  document.body.classList.add('choosing');

  const page = document.createElement('main');
  page.className = 'chooser';
  const head = document.createElement('header');
  const title = document.createElement('h1');
  title.textContent = t.title;
  const subtitle = document.createElement('p');
  subtitle.textContent = t.subtitle;
  head.append(title, subtitle);
  const cards = document.createElement('div');
  cards.className = 'chooser-cards';
  for (const museum of list) {
    const card = document.createElement('a');
    card.className = 'chooser-card';
    card.href = `?m=${encodeURIComponent(museum.id)}`;
    if (museum.accent) card.style.setProperty('--card', museum.accent);
    const picture = document.createElement('img');
    picture.src = new URL(`museums/${museum.image}`, document.baseURI).href;
    picture.alt = '';
    picture.loading = 'lazy';
    const body = document.createElement('div');
    const name = document.createElement('h2');
    name.textContent = pick(museum.name);
    const summary = document.createElement('p');
    summary.textContent = pick(museum.summary);
    const go = document.createElement('span');
    go.textContent = t.open;
    body.append(name, summary, go);
    card.append(picture, body);
    cards.append(card);
  }
  page.append(head, cards);
  document.body.append(page);
}

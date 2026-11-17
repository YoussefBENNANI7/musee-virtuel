// Dresse l'inventaire des licences du projet, dans docs/licences.md.
//
// Usage :
//   npm run licences            Inventaire du moteur et du musée « demo »
//   npm run licences -- mon-musee
//
// À relancer après avoir ajouté un outil, un son ou une œuvre : c'est le document qu'un
// juriste ou un acquéreur du moteur demandera en premier. Il sépare ce qui fait partie du
// moteur (cessible) de ce qui appartient à un musée donné (les œuvres et leurs droits).
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = new URL('../', import.meta.url);
const read = (path) => JSON.parse(readFileSync(new URL(path, root), 'utf8'));
const museumId = process.argv.slice(2).find((a) => !a.startsWith('--')) ?? 'demo';
const pkg = read('package.json');
const museum = read(`public/museums/${museumId}/museum.json`);

const licenceOf = (name) => {
  const info = read(`node_modules/${name}/package.json`);
  return { name, version: info.version, licence: info.license ?? '?', site: info.homepage ?? '' };
};
const row = (cells) => `| ${cells.join(' | ')} |`;
const table = (head, rows) => [row(head), row(head.map(() => '---')), ...rows.map(row)].join('\n');
const fr = (text) => (typeof text === 'string' ? text : (text?.fr ?? Object.values(text ?? {})[0] ?? ''));

const shipped = Object.keys(pkg.dependencies ?? {}).map(licenceOf);
const tools = Object.keys(pkg.devDependencies ?? {}).map(licenceOf);

// Œuvres du musée : la licence est la dernière partie de la mention (après « · »).
const works = museum.rooms.flatMap((room) => room.artworks.map((art) => ({ room: fr(room.name), art })));
const licenceText = (art) => fr(art.credit).split('·').at(-1)?.trim() || 'aucune mention';
const restricted = (art) => /non commercial|conditions d.utilisation|tous droits|NC\b/i.test(fr(art.credit)) || !art.credit;
const counts = new Map();
for (const { art } of works) counts.set(licenceText(art), (counts.get(licenceText(art)) ?? 0) + 1);
const flagged = works.filter(({ art }) => restricted(art));

const voicesPath = new URL(`public/museums/${museumId}/audio/voix.json`, root);
const voices = existsSync(voicesPath) ? JSON.parse(readFileSync(voicesPath, 'utf8')) : null;
const soundsPath = new URL('public/sons/LISEZMOI.md', root);
const sounds = existsSync(soundsPath) ? readFileSync(soundsPath, 'utf8').split('\n').filter((l) => l.startsWith('| `')) : [];

const out = `# Inventaire des licences

Document produit par \`npm run licences\` : ne pas le modifier à la main, le relancer.
Il ne remplace pas l'avis d'un juriste.

## 1. Ce qu'est « le moteur »

Le moteur est le logiciel qui construit et fait visiter un musée à partir d'un dossier de configuration :
le code de \`src/\`, la page \`index.html\`, les commandes de \`scripts/\`, les tests et la documentation.
C'est lui qui peut être offert ou vendu. **Un musée (ses images, ses modèles 3D, ses textes, ses voix)
n'en fait pas partie** : chaque musée apporte ses propres contenus et ses propres droits.

## 2. Logiciels tiers livrés avec le moteur

Ce sont les seuls logiciels tiers présents dans le site que reçoit le visiteur.

${table(['Logiciel', 'Version', 'Licence', 'Site'], shipped.map((d) => [d.name, d.version, d.licence, d.site]))}

Ces licences autorisent l'usage, la modification et la vente, à condition de conserver leur mention
de droit d'auteur et leur texte de licence. Le dossier \`node_modules/<logiciel>/\` contient ce texte.

## 3. Outils de fabrication

Ils servent à construire, tester et préparer les fichiers. Ils ne sont pas livrés au visiteur ;
la commande \`npm install\` les télécharge chez qui reprend le projet.

${table(['Outil', 'Version', 'Licence'], tools.map((d) => [d.name, d.version, d.licence]))}

## 4. Sons livrés avec le moteur

${sounds.length ? `${row(['Fichier', 'Origine', 'Licence'])}\n${row(['---', '---', '---'])}\n${sounds.join('\n')}` : 'Aucun.'}

## 5. Polices et icônes

Le moteur n'embarque aucune police : il utilise celles de l'appareil du visiteur. Les icônes et
l'emblème sont dessinés dans le code du projet.

## 6. Musée « ${fr(museum.name)} » (dossier \`public/museums/${museumId}/\`)

Ce musée est une démonstration. Il ne fait pas partie du moteur.

${[...counts].map(([licence, n]) => `- ${n} œuvre(s) : ${licence}`).join('\n')}

${
  flagged.length
    ? `**À retirer ou à faire autoriser avant toute vente ou diffusion publique de ce musée :**\n\n${flagged.map(({ art }) => `- « ${fr(art.title)} » (\`${art.id}\`) : ${fr(art.credit) || 'aucune mention de provenance'}`).join('\n')}`
    : 'Aucune œuvre de ce musée ne porte de restriction d’usage.'
}

${table(['Salle', 'Œuvre', 'Auteur', 'Conservation et licence', 'Notice'], works.map(({ room, art }) => [room, fr(art.title), fr(art.artist), fr(art.credit) || '—', art.link ? `[lien](${art.link})` : '—']))}

### Voix de l'audioguide

${
  voices
    ? `Produites par le service de voix de Google (modèle \`${voices.model}\`, voix \`${voices.voice}\`), ${Object.keys(voices.files).length} fichiers. Leur usage dépend des conditions du service Google au moment de la production, et du compte qui les a produites : à vérifier avant une vente de ce musée. Le moteur ne contient que la commande \`npm run voix\` ; chaque musée produit ses voix avec son propre compte.`
    : 'Ce musée n’a pas de voix enregistrées.'
}

### Textes

Les cartels, commentaires, détails et parcours de ce musée ont été rédigés pour le projet avec l'aide
d'une IA, d'après les notices des musées. Ils n'ont pas été comparés un par un à ces notices.

## 7. Points à faire vérifier par un juriste avant une cession du moteur

- **La titularité du code** : qui en est propriétaire (son auteur, ou son employeur s'il a été écrit dans le cadre d'un poste).
- **Le code a été écrit avec l'aide d'une IA** : les conditions du fournisseur attribuent en général les résultats à l'utilisateur, mais la protection par le droit d'auteur d'un contenu produit par une IA varie selon les pays.
- **La forme de la cession** : licence libre, licence d'utilisation, ou cession des droits ; garanties et limites de responsabilité.
- **Le nom du produit** : vérifier qu'il n'est pas déjà déposé comme marque.
`;

writeFileSync(new URL('docs/licences.md', root), out);
console.log(`Inventaire écrit dans ${fileURLToPath(new URL('docs/licences.md', root))} : ${shipped.length} logiciel(s) livré(s), ${tools.length} outil(s), ${works.length} œuvre(s), dont ${flagged.length} à usage restreint.`);

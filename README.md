# Musée virtuel personnalisable

Une visite de musée en 3D, dans le navigateur, sur ordinateur, téléphone et casque VR. Chaque musée est décrit par un simple dossier de configuration : ses salles, ses œuvres, ses textes et ses couleurs. Le même moteur sert tous les musées.

Le dépôt contient un musée de démonstration complet, le « Musée des Horizons ». Ses tableaux, estampes et photographie sont de vraies œuvres en accès libre (Bruegel, Van Gogh, Monet, Hokusai, Seurat…), avec leur musée d'origine. Une première sculpture est un vrai modèle numérisé en 3D ; les autres sont encore dessinées par le code.

Pour la vision du projet, les décisions prises et l'avancement, voir [`docs/etat-du-projet.md`](docs/etat-du-projet.md).

## Installer

Il faut [Node.js](https://nodejs.org/fr) version 22 ou plus récente, et Git. Dans le Terminal du Mac :

```bash
git clone https://github.com/YoussefBENNANI7/musee-virtuel.git
```

```bash
cd musee-virtuel
```

```bash
npm install
```

La dernière commande télécharge les outils du projet. Elle se relance après chaque mise à jour du code.

## Lancer le musée

```bash
npm run dev
```

Ouvrir ensuite http://localhost:5173/ dans le navigateur. Pour arrêter, revenir dans le Terminal et appuyer sur `Ctrl` + `C`.

Pour voir le musée sur un téléphone branché au même réseau wifi, utiliser l'adresse « Network » que la commande affiche au démarrage.

### Options à ajouter à l'adresse

| Ajout à l'adresse | Effet |
|---|---|
| `?m=demo` | Musée à ouvrir : nom de son dossier dans `public/museums/` |
| `?style=classic` | Montre le musée dans un autre style d'architecture |
| `?decor=cabinet:nuit` | Montre une salle dans un autre décor (`?decor=nuit` pour toutes les salles) |
| `?q=high`, `?q=medium`, `?q=low` | Force un niveau de qualité du rendu |
| `?vue=simple` | Ouvre la vue simplifiée, sans 3D |
| `?debug` | Affiche le détail des erreurs de configuration |

Plusieurs options se combinent avec `&`, par exemple `http://localhost:5173/?m=demo&q=low`.

## Configurer un musée

Chaque musée est un dossier dans `public/museums/` :

```
public/museums/demo/
  museum.json     Toute la configuration : salles, portes, œuvres, textes, parcours
  images/         Images originales des tableaux et photographies
  images/web/     Versions allégées, fabriquées par « npm run images »
  thumbs/         Photos des sculptures pour la vue simplifiée
```

### Créer un nouveau musée

1. Copier le dossier `public/museums/demo` et renommer la copie, par exemple `mon-musee`.
2. Modifier `mon-musee/museum.json` : nom du musée, salles, portes, œuvres, parcours.
3. Déposer les images dans `mon-musee/images/`, une par tableau, nommée comme l'identifiant de l'œuvre (`le-pays-d-avant.webp` pour l'œuvre `le-pays-d-avant`). Puis les préparer :

   ```bash
   npm run images -- mon-musee --attach
   ```

4. Ouvrir http://localhost:5173/?m=mon-musee

À l'ouverture, la configuration est contrôlée. Une erreur (une porte qui ne mène nulle part, un tableau en travers d'une porte, une salle inaccessible) s'affiche à l'écran, en français, à la place du musée.

### L'essentiel de `museum.json`

- **Repère** : le nord est en haut du plan. Une position s'écrit `[x, z]` en mètres ; une taille de salle `[largeur, hauteur, profondeur]`.
- **Salles** (`rooms`) : nom, position, taille, plafond (plat, verrière ou plafond flottant), bancs, et la liste des œuvres.
- **Décor d'une salle** (`decor`) : le nom d'un décor de la bibliothèque, par exemple `"decor": "terre-cuite"`. Il règle d'un coup le sol, les murs, le plafond, la lumière et les cadres. Décors disponibles : `pierre-claire`, `argile-claire`, `terre-cuite`, `nuit`. Sans décor, la salle suit le style du musée.
- **Portes** (`doors`) : déclarées une seule fois, sur le mur d'une salle. L'ouverture dans la salle voisine est déduite.
- **Tableaux** : mur, décalage le long du mur, taille en mètres, image, titre, artiste, date, technique, texte. On peut ajouter un passe-partout (`mat`), la mention du musée qui conserve l'œuvre (`credit`) et un lien vers sa notice (`link`). Un enregistrement audio par langue est facultatif : sans lui, le texte est lu par une voix de synthèse.
- **Sculptures** : position dans la salle, hauteur, socle, et un modèle 3D au format GLB (`"model": {"src": "models/nom.glb"}`) ou une forme dessinée par le moteur. Après avoir déposé un modèle dans `models/`, lancer `npm run modeles -- mon-musee`.
- **Parcours** (`tours`) : nom, description et liste ordonnée d'œuvres.
- **Langues** : chaque texte s'écrit dans toutes les langues du musée, par exemple `{ "fr": "Atrium", "en": "Atrium" }`.

Le détail de chaque réglage est décrit dans [`docs/etat-du-projet.md`](docs/etat-du-projet.md), et le format exact dans [`src/engine/types.ts`](src/engine/types.ts).

## Vérifier que tout fonctionne

```bash
npm run check
```

Contrôle le code et lance les tests rapides (quelques secondes).

```bash
npm run test:e2e
```

Ouvre le musée dans un vrai navigateur et le parcourt automatiquement (environ 3 minutes). La première fois, installer ce navigateur de test :

```bash
npx playwright install chromium
```

## Autres commandes

| Commande | Effet |
|---|---|
| `npm run build` | Fabrique la version publiable, dans le dossier `dist/` |
| `npm run preview` | Montre cette version publiable sur l'ordinateur |
| `npm run images -- demo --attach` | Associe et prépare les images déposées dans `images/` |
| `npm run modeles -- demo` | Prépare les modèles 3D déposés dans `models/` (versions allégées) |
| `npm run vignettes -- demo` | Photographie les sculptures pour la vue simplifiée (le musée doit tourner) |

## Mise en ligne

Le musée est un site statique : le contenu du dossier `dist/` suffit. L'hébergement prévu est Vercel (fichier `vercel.json`). Il n'est pas encore relié.

## Organisation du code

```
src/main.ts        Démarrage : chargement et contrôle de la configuration
src/visit3d.ts     Visite 3D
src/simple.ts      Vue simplifiée, sans 3D
src/vr.ts          Visite en casque VR
src/audio.ts       Audioguide
src/engine/        Moteur : plan, bâtiment, éclairage, œuvres, déplacement
scripts/           Préparation des images et des vignettes
tests/             Tests automatiques
docs/              État du projet, prompts des images
```

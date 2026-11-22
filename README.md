# Musée virtuel personnalisable

Une visite de musée en 3D, dans le navigateur, sur ordinateur, téléphone et casque VR. Chaque musée est décrit par un simple dossier de configuration : ses salles, ses œuvres, ses textes et ses couleurs. Le même moteur sert tous les musées.

Le dépôt contient un musée de démonstration complet, le « Musée des Horizons ». Ses tableaux, estampes et photographie sont de vraies œuvres en accès libre (Bruegel, Van Gogh, Monet, Hokusai, Seurat…), avec leur musée d'origine. Ses cinq sculptures sont de vrais modèles numérisés en 3D, que l'on peut examiner sous tous les angles.

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
| `?accueil=non` | Ouvre la visite sans passer par l'écran d'accueil |
| `?presentation=essentiels` | Lance un parcours en mode présentation : il se déroule seul, avec la voix |
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

### Créer un musée avec l'éditeur

L'éditeur crée et remplit un musée sans toucher au code. Il s'utilise sur ordinateur, pendant que le musée tourne (`npm run dev`) :

http://localhost:5173/editeur.html

1. **Créer le musée** : lui donner un nom et choisir un plan (une grande salle, trois salles en enfilade, une galerie et deux cabinets, un atrium et quatre salles).
2. **Déposer les photos des œuvres** dans une salle : elles s'accrochent seules, réparties sur les murs, à la bonne hauteur. Une salle pleine range le surplus en réserve.
3. **Remplir le cartel** de chaque œuvre : titre, artiste, date, technique, commentaire, vraie taille en centimètres, cadre. La photo se recadre dans l'éditeur ; l'originale est gardée.
4. **Régler les salles** (nom, décor) et **le musée** (nom, couleur, style d'architecture, ajout de l'anglais).
5. L'onglet **« À compléter »** liste ce qui manque encore, œuvre par œuvre.

Tout s'enregistre au fur et à mesure, et le vrai musée s'affiche à droite. Le bouton « Annuler la dernière modification » revient en arrière.

À savoir :

- Le musée est rangé dans `public/museums/<son-nom>/`, sur cet ordinateur. Il n'est pas envoyé sur GitHub : pour le sauvegarder, copier ce dossier.
- **Supprimer un musée** : bouton « Supprimer » sur la page d'accueil de l'éditeur. Rien n'est effacé : son dossier part dans `musees-supprimes/`, à la racine du projet. Pour le récupérer, le remettre dans `public/museums/` en retirant la date de son nom. Le musée de démonstration ne se supprime pas depuis l'éditeur.
- **Page de choix des musées** : quand plusieurs musées sont proposés, l'adresse `http://localhost:5173/` les présente côte à côte. Son bouton « Mode administrateur » ouvre l'éditeur, et le lien « ← Page des musées » de l'éditeur y ramène. Dans l'onglet Musée, la section « Page de choix des musées » y propose le musée, avec une courte présentation et une photo de couverture (« Prendre la vue de l'aperçu », ou une photo choisie).
- **Lumière précalculée** : quand une modification rend la lumière calculée d'une salle périmée, un bandeau le signale ; le bouton « Recalculer la lumière » lance le calcul sur cet ordinateur (Blender doit y être installé une fois : `npm run lumiere:installer`). Voir `docs/lumiere.md`.
- **Billets et objets à deux faces** : dans la fiche d'une œuvre, le bloc « Verso » dépose la photo de l'autre face. Le mur garde le recto ; le visiteur retourne l'œuvre dans son agrandissement.
- **Musée de démonstration protégé** : l'éditeur demande confirmation avant sa première modification, et le bouton « Rétablir la démonstration d'origine » (onglet Musée) le remet comme dans le projet.
- L'éditeur n'existe que sur l'ordinateur où tourne `npm run dev` : il ne fait pas partie de la version publiée.
- Sur un ordinateur modeste, `http://localhost:5173/editeur.html?apercu=low` allège l'aperçu.
- L'éditeur ne permet pas encore d'ajouter une sculpture, de composer un parcours, de poser des détails commentés ni de dessiner librement le plan : cela se règle dans `museum.json`, comme décrit plus bas.

### Créer un musée à la main

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
- **Décor d'une salle** (`decor`) : le nom d'un décor de la bibliothèque, par exemple `"decor": "terre-cuite"`. Il règle d'un coup le sol, les murs, le plafond, la lumière et les cadres. Décors disponibles : `pierre-claire`, `argile-claire`, `terre-cuite`, `riad`, `nuit`. Sans décor, la salle suit le style du musée.
- **Portes** (`doors`) : déclarées une seule fois, sur le mur d'une salle. L'ouverture dans la salle voisine est déduite.
- **Tableaux** : mur, décalage le long du mur, taille en mètres, image, titre, artiste, date, technique, texte. On peut ajouter un passe-partout (`mat`), un cadre particulier (`frame` : `"gilt"` pour le doré classique, ou un autre modèle comme `"noir-filet-or"` ou `"baguette-chene"` ; sans lui, l'œuvre prend le cadre de sa salle), la mention du musée qui conserve l'œuvre (`credit`) et un lien vers sa notice (`link`). Un enregistrement audio par langue est facultatif : sans lui, le texte est lu par une voix de synthèse.
- **Détails commentés** d'un tableau (`details`) : des points à regarder de près dans l'agrandissement, chacun avec sa position dans l'image (de 0 à 1, depuis la gauche puis depuis le haut), un titre et un texte.
- **Verso** d'un objet à deux faces (`back`) : pour un billet de banque, une carte ou une lettre, `"back": {"src": "images/billet-verso.webp"}`. Le mur montre le recto ; dans l'agrandissement, le bouton ⇄ ou la touche R retourne l'objet. Dans l'éditeur : fiche de l'œuvre, bloc « Verso ».
- **Sculptures et objets** : position dans la salle, hauteur, socle, rotation (`turn`), clarté (`tone`), et un modèle 3D au format GLB (`"model": {"src": "models/nom.glb"}`) ou une forme dessinée par le moteur. Après avoir déposé un modèle dans `models/`, lancer `npm run modeles -- mon-musee`. On peut choisir le côté du socle qui porte le cartel (`cardSide` : `north`, `south`, `east` ou `west`), donner au socle une largeur (`plinthSide`, en mètres, pour un objet posé à plat qui ne doit pas en dépasser) et, pour un objet reconstitué en 3D, montrer dans sa fiche la photographie de l'objet réel (`sourcePhoto`).
- **Pièces de monnaie** : une vitrine (`vitrines`) porte jusqu'à cinq pièces. Une pièce est une sculpture dont le modèle est une photo et un métal : `"model": {"coin": "images/piece.webp", "metal": "silver"}` (`gold`, `silver` ou `bronze` ; `"square": true` pour une monnaie carrée), placée par `"vitrine": {"id": "…", "slot": 0}`. L'image est carrée, la pièce au ras du cadre. Avec la photo de l'autre face (`"coinBack": "images/piece-revers.webp"`), le visiteur retourne la pièce dans son examen, par le bouton ⇄ ou la touche R. Le moteur déduit de chaque photo un léger relief : les reflets du métal bougent quand on tourne la pièce.
- **Mise en scène d'une salle** (facultatif, à écrire dans `museum.json`) :
  - **éclairage d'accent** des objets sur socle : `"decor": {"preset": "nuit", "light": {"accents": 1}}` fait tomber un faisceau sur chacun, dans une salle tamisée ; dans une salle claire, le faisceau ne se voit pas, seule une flaque de lumière éclaire le socle et le sol ;
  - **verrière à traverses fines**, claires comme le plafond : `"ceiling": {"type": "skylight", "bars": "fine"}` ;
  - **cloche de verre** sur un objet : `"hood": true` (le socle prend alors la mesure de l'objet) ;
  - **zones au sol** (`zones`), pour réunir des objets en îlots : `{"position": [x, z], "size": [largeur, profondeur], "color": "#24443b", "border": "#b9944a"}` ; le visiteur marche dessus ;
  - **lettrage mural** (`lettering`) : un titre (`{"wall": "north", "offset": 2, "text": {"fr": "Compter"}}`) ou un court texte (`"kind": "text"`, `"width"` en mètres), posé sur le mur comme des lettres adhésives. Ce n'est pas une œuvre : on ne clique pas dessus.
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
| `npm run maj -- mon-musee paquet.zip` | Applique un paquet de mise à jour (images, modèles, retouches de fiches, mise en scène d'une salle) à un musée de l'ordinateur ; plusieurs paquets peuvent être donnés à la suite, ils sont appliqués dans l'ordre ; `--essai` montre sans rien écrire |
| `npm run voix -- demo --voix Sulafat` | Produit les voix de l'audioguide avec le service de voix de Google (clé dans `GEMINI_API_KEY`, ffmpeg nécessaire) |
| `npm run licences` | Dresse l'inventaire des licences du moteur et du musée, dans `docs/licences.md` |
| `npm run vignettes -- demo` | Photographie les sculptures pour la vue simplifiée (le musée doit tourner) |
| `npm run lumiere:installer` | Installe, une fois par ordinateur, ce qu'il faut pour calculer la lumière (Blender, hors du projet) |
| `npm run lumiere -- demo` | Calcule avec Blender la lumière des salles modifiées (rendu premium) : voir `docs/lumiere.md` |

## Mise en ligne

Le musée est un site statique : le contenu du dossier `dist/` suffit. L'hébergement prévu est Vercel (fichier `vercel.json`). Il n'est pas encore relié.

## Organisation du code

```
src/main.ts        Démarrage : chargement et contrôle de la configuration
src/accueil.ts     Écran d'accueil
src/visit3d.ts     Visite 3D
src/simple.ts      Vue simplifiée, sans 3D
src/vr.ts          Visite en casque VR
src/audio.ts       Audioguide
src/engine/        Moteur : plan, bâtiment, éclairage, œuvres, accrochage automatique, déplacement
src/editeur/       Éditeur de musée (page editeur.html)
scripts/           Préparation des images et des vignettes, service local de l'éditeur
tests/             Tests automatiques
docs/              État du projet, prompts des images
```

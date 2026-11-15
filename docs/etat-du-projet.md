# Musée virtuel personnalisable : état du projet

Mis à jour le 15 novembre 2026. Ce document permet de reprendre le projet dans une nouvelle conversation sans rien perdre : vision, décisions prises, avancement, points en attente et organisation du code.

---

## 1. Le projet

Une plateforme de visites virtuelles en 3D, en marque blanche, vendue à des musées, en priorité de petits musées peu connus. Le porteur du projet configure lui-même chaque musée pour son client (salles, œuvres, textes, couleurs), puis le lui commercialise.

La visite est **gratuite pour le public**, dans une logique d'inclusion : démocratiser l'accès à l'art. La démonstration commerciale utilise des œuvres et des artistes **fictifs**.

## 2. Décisions prises

| Sujet | Décision |
|---|---|
| Type de visite | 3D, déplacement libre dans des salles |
| Qui configure | Le porteur du projet, pour chaque client (pas de back-office client au départ) |
| Œuvres | Tableaux, photographies, sculptures et objets 3D |
| Fonctionnalités | Le maximum, visite gratuite |
| Appareils | Ordinateur, téléphone et casque VR, dans le navigateur |
| Objectif final | Plateforme complète avec comptes clients et hébergement |
| Contraintes | Aucune contrainte technique, de délai ou de budget |
| Technique | Three.js et WebXR, en TypeScript ; site statique, peu coûteux à héberger |
| Salles | Modules assemblés (pas de reproduction fidèle de bâtiments réels) |
| Langues | Français et anglais ; structure prévue pour l'arabe |
| Audioguide | Voix de synthèse, remplaçable par des enregistrements du musée |
| Inclusion | Vue simplifiée sans 3D, utilisable au clavier et au lecteur d'écran |
| Hébergement | Vercel, mis en pause : à faire après la modernisation |
| Direction artistique | Galerie contemporaine claire, immersive, moderne, créative |
| Ambiance des salles | Chaque salle a son propre décor, accordé aux œuvres qu'elle expose (décision du 15 novembre 2026) |
| Images de la démo | Produites par le porteur avec son générateur d'images, à partir des prompts de `docs/prompts-images.md` |

### Les trois étapes du produit

1. **Moteur de visite** : un musée de démonstration complet. *Terminé, en cours de modernisation.*
2. **Personnalisation** : un outil de configuration (éditeur visuel) et plusieurs musées sur le même socle.
3. **Plateforme** : comptes clients, statistiques de visite, hébergement multi-clients (un sous-domaine ou le domaine du musée).

## 3. Avancement

### Étape 1, moteur de visite : terminée

1. Salle 3D, déplacement libre (souris, clavier, tactile), fiches d'œuvres.
2. Musée de démonstration : plusieurs salles reliées par des portes, sculptures, plan du musée.
3. Audioguide, parcours thématiques, vue simplifiée sans 3D.
4. Visite en casque VR, optimisation du rendu sur téléphone.

### Modernisation avant l'hébergement : en cours

Déjà fait :

| Lot | Contenu |
|---|---|
| Fondations logicielles | Tests automatiques dans le dépôt, murs épais, styles d'architecture, niveaux de qualité, contrôle de la configuration |
| Bâtiment et lumière | Nouveau plan (atrium sous verrière, enfilade, cour des sculptures), éclairage calculé par salle, tache de soleil, projecteurs sur rail, bancs, reflets au sol |
| Images des œuvres | Images réelles des 16 tableaux et photographies |

Le 15 novembre 2026, le porteur a donné son avis sur l'ambiance : la base lui plaît, mais l'architecture intérieure et l'ambiance artistique doivent progresser, avec des salles adaptées à ce qu'elles exposent. Il a aussi relevé cinq manques : pas d'enregistrement pour l'audioguide, sculptures dessinées par le code, pas d'outil pour qu'un musée ajoute ses œuvres, pas de version en ligne vérifiée, pas de README. L'ordre de travail convenu avec lui :

| Étape | Contenu | État |
|---|---|---|
| 1. README | Installer, lancer et configurer le projet | Fait |
| 2. Décor par salle | Chaque salle reçoit un décor : sol, murs, plafond, lumière, cadres, mobilier | **Salle pilote faite**, voir ci-dessous. Attend le choix du porteur avant d'être étendu aux quatre autres salles |
| 3. Œuvres | Sculptures issues de vrais modèles 3D (format GLB) avec de vraies ombres, cadres variés, zoom haute définition, salle immersive sombre au sud de l'atrium | À faire |
| 4. Interface | Écran d'accueil du musée, nouvelle identité visuelle (typographie, icônes, commandes discrètes, fiches animées), clic au sol pour se déplacer, mini-plan permanent | À faire, après le décor pour s'accorder à l'ambiance définitive |
| 5. Mise en ligne | Hébergement sur Vercel, puis vérification sur de vrais appareils | À faire, avec l'accord du porteur |
| 6. Outil d'administration | L'éditeur de l'étape 2 du produit. Les réglages de décor y deviendront des options | À faire |

Les voix de l'audioguide peuvent se faire à tout moment : le moteur lit déjà un enregistrement par œuvre et par langue quand on lui en fournit un. Il ne manque que les fichiers.

Viendront aussi : ambiance sonore par salle, contenus enrichis (lien direct vers une œuvre, favoris, vidéos).

### Décor par salle : la salle pilote

Le moteur sait désormais donner un décor à chaque salle. Un décor réunit le revêtement et la couleur du sol, la finition et la couleur des murs, le plafond, le niveau et la teinte de la lumière, la force des projecteurs, les cadres, les socles, les bancs et les cartels. Une salle sans décor suit le style du musée, comme avant.

Nouveautés du moteur :

- **Sols** : parquet de chêne en chevrons (point de Hongrie), en plus du béton ciré et du parquet droit. Brillance du sol réglable par salle.
- **Murs** : badigeon de chaux légèrement nuagé, en plus de la peinture unie.
- **Plafond flottant** : un panneau abaissé, détaché des murs par une gorge lumineuse qui lave le haut des murs.
- **Lumière** : niveau et teinte par salle. Une salle sombre reçoit par ses portes la lumière de sa voisine plus claire. Les cadres, les bancs et les socles s'assombrissent avec leur salle.
- **Cartels sombres** à lettres claires pour une salle obscure, rails et projecteurs de la couleur voulue, barre de seuil entre deux sols différents.

La salle pilote est le **Cabinet des Couleurs**. Trois décors y sont proposés. Aucun n'est encore appliqué : la configuration de la démo garde l'ancien décor (murs terre cuite, sol en béton, plafond blanc), avec seulement un banc en plus.

| Décor | Ambiance | Adresse pour le voir |
|---|---|---|
| `argile-claire` | Salle lumineuse et douce : badigeon rosé, chêne clair en chevrons, plafond flottant blanc | `?decor=cabinet:argile-claire` |
| `terre-cuite` | Bain de couleur : murs et plafond terre cuite, chêne fumé en chevrons, lumière chaude sur les œuvres | `?decor=cabinet:terre-cuite` |
| `nuit` | Écrin sombre : murs et plafond bleu nuit, sol noir poli, œuvres comme éclairées de l'intérieur | `?decor=cabinet:nuit` |

## 4. En attente du porteur du projet

- **Son choix parmi les trois décors** du Cabinet des Couleurs (`argile-claire`, `terre-cuite`, `nuit`), ou ses remarques. Le principe retenu sera ensuite appliqué aux quatre autres salles, chacune selon ses œuvres.
- **Les voix de l'audioguide** : service de voix de qualité ou vraie personne, à décider.
- **Deux images à refaire** avec un vrai générateur d'images : `dunes-04h12` et `ronds-dans-l-eau`. Présentées comme des photographies argentiques, elles n'en ont pas l'aspect, et la seconde apparaît presque noire dans la galerie. Garder les mêmes noms de fichiers.
- **La licence** du générateur d'images : elle doit autoriser l'usage commercial.
- **Des essais sur de vrais appareils** : téléphone (de préférence ancien), casque VR, lecteur d'écran (VoiceOver, TalkBack), voix de l'audioguide. Le casque exige une adresse HTTPS, donc l'hébergement.
- **L'hébergement** : créer un compte Vercel et y relier le dépôt GitHub, le moment venu.

## 5. Limites connues

- Les sculptures sont générées par code ; le chargement de modèles 3D réels n'est pas encore branché.
- Les sculptures ne projettent pas de vraie ombre, seulement une ombre douce au sol.
- L'arabe (écriture de droite à gauche) n'est pas encore géré par l'interface.
- Dans le casque VR, ni les parcours ni le plan ne sont disponibles.
- La VR n'a été testée qu'en émulation (casque Meta Quest 3 émulé).
- La voix de synthèse n'est pas garantie sur les navigateurs de casque : sans elle, le bouton d'écoute ne s'affiche pas.

---

## 6. Organisation du code

Dépôt GitHub : `YoussefBENNANI7/musee-virtuel`, branche `main`.

```
public/museums/<musée>/     Un dossier par musée client
  museum.json               Toute la configuration du musée
  images/                   Images originales des œuvres (servent au futur zoom)
  images/web/               Versions allégées, produites par « npm run images »
  thumbs/                   Photos des sculptures pour la vue simplifiée (« npm run vignettes »)

src/main.ts                 Démarrage : chargement et contrôle de la configuration, choix de la vue
src/visit3d.ts              Visite 3D : fiches, parcours, plan, boucle de rendu
src/simple.ts               Vue simplifiée, sans 3D
src/vr.ts                   Visite en casque VR
src/audio.ts                Audioguide
src/ui.ts                   Textes de l'interface (français, anglais)
src/style.css               Styles de l'interface

src/engine/types.ts         Format de la configuration d'un musée
src/engine/validate.ts      Contrôle de la configuration, erreurs lisibles
src/engine/styles.ts        Styles d'architecture : contemporain (par défaut), classique
src/engine/decors.ts        Décors des salles : bibliothèque, réglages, décor demandé dans l'adresse
src/engine/quality.ts       Niveaux de qualité selon l'appareil
src/engine/layout.ts        Géométrie du plan : murs, portes, zones de marche (sans rendu, testée seule)
src/engine/lighting.ts      Calcul de l'éclairage des salles
src/engine/building.ts      Construction du bâtiment : sols, murs, plafonds, verrières
src/engine/artworks.ts      Accrochage des tableaux, pose des sculptures
src/engine/world.ts         Assemblage du musée, règles de déplacement, points de vue
src/engine/...              Contrôles, plan, mobilier, sculptures, textures, reflets, images

scripts/images.mjs          Préparation des images d'un musée
scripts/vignettes.mjs       Photos des sculptures pour la vue simplifiée
tests/unit/                 Tests unitaires (Vitest) : 87 tests
tests/e2e/                  Tests dans un navigateur (Playwright) : 39 tests
tests/fixtures/             Musée de test figé, indépendant de la démo
docs/prompts-images.md      Prompts de génération des 16 images
vercel.json                 Configuration de l'hébergement (pas encore relié)
```

### Options d'adresse

| Ajout à l'adresse | Effet |
|---|---|
| `?m=demo` | Musée à ouvrir : nom de son dossier dans `public/museums/` |
| `?style=classic` | Montre le musée dans un autre style d'architecture, sans toucher à sa configuration |
| `?decor=cabinet:nuit` | Montre une salle dans un autre décor, sans toucher à sa configuration. `?decor=nuit` l'applique à toutes les salles ; plusieurs demandes se séparent par des virgules |
| `?q=high`, `?q=medium`, `?q=low` | Force un niveau de qualité |
| `?vue=simple` | Ouvre la vue simplifiée |
| `?debug` | Affiche le détail des erreurs de configuration, même dans la version publiée |

### Configurer un musée (`museum.json`)

- **Repère** : le nord est vers les `z` négatifs. Une position s'écrit `[x, z]` en mètres ; une taille de salle `[largeur, hauteur, profondeur]`.
- **Salles** : nom, position, taille, décor (facultatif), plafond plat, verrière (`{"type": "skylight", "margin": 1.8}`) ou plafond flottant (`{"type": "cove"}`), bancs.
- **Décor d'une salle** : le nom d'un décor de la bibliothèque (`"decor": "terre-cuite"`), ou ce décor corrigé réglage par réglage (`"decor": {"preset": "terre-cuite", "colors": {"wall": "#8e3f2c"}, "light": {"level": 0.9}}`). Réglages possibles : couleurs (`colors` : mur, sol, plafond, cadres, socles, bois, finitions, rails), sol (`floor` : `concrete`, `parquet`, `chevron`), murs (`walls` : `paint`, `limewash`), brillance du sol (`gloss`), plafond, cadre, lumière (`light` : niveau, teinte, force des projecteurs), cartels (`labels`). Les anciens réglages `wall` (couleur des murs) et `light` (niveau d'éclairage) de la salle restent acceptés.
- **Portes** : déclarées une seule fois, sur le mur d'une salle (`room`, `wall`, `offset`, `width`, hauteur facultative). L'ouverture dans la salle voisine est déduite.
- **Tableaux** : mur, décalage le long du mur (positif vers la droite quand on fait face au mur), largeur et hauteur en mètres, image (`{"src": "images/nom.webp"}`), titre, artiste, date, technique, texte. Enregistrement audio facultatif.
- **Sculptures** : position dans la salle, hauteur, hauteur du socle, forme et matériau (bronze, marbre, bronze patiné, bois laqué).
- **Parcours** : nom, description et liste ordonnée des œuvres.
- **Contrôle** : à l'ouverture, la configuration est vérifiée (porte qui ne mène nulle part, tableau en travers d'une porte, salle inaccessible, décor inconnu, traduction manquante, etc.).

## 7. Commandes

```bash
npm install                       # une seule fois, puis après chaque mise à jour des dépendances
npm run dev                       # lance le musée sur http://localhost:5173/
npm run check                     # contrôle du code et tests unitaires
npm run test:e2e                  # tests dans un navigateur (environ 3 minutes)
npm run build                     # version publiable, dans dist/
npm run images -- demo --attach   # associe et prépare les images déposées dans images/
npm run vignettes -- demo         # photographie les sculptures (le musée doit tourner)
```

## 8. Méthode de travail retenue

- **Tout en français** : interface, commentaires du code, messages de commit, documentation. Les textes du musée existent en français et en anglais.
- **Le porteur du projet n'est pas développeur** : commandes exactes à copier, explications simples, sur Mac.
- **Avant et après chaque modification du moteur** : les tests doivent passer, puis le rendu est vérifié par des captures sur ordinateur et sur téléphone.
- **Un aperçu à la fin de chaque lot**, et pas de lot touchant à l'identité visuelle sans l'avis du porteur.
- **Œuvres** : les prompts d'images sont fournis par Claude ; le porteur génère les images et les dépose (format, nommage et règles dans `docs/prompts-images.md`).

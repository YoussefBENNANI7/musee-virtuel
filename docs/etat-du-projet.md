# Musée virtuel personnalisable : état du projet

Mis à jour le 16 novembre 2026. Ce document permet de reprendre le projet dans une nouvelle conversation sans rien perdre : vision, décisions prises, avancement, points en attente et organisation du code.

---

## 1. Le projet

Une plateforme de visites virtuelles en 3D, en marque blanche, vendue à des musées, en priorité de petits musées peu connus. Le porteur du projet configure lui-même chaque musée pour son client (salles, œuvres, textes, couleurs), puis le lui commercialise.

La visite est **gratuite pour le public**, dans une logique d'inclusion : démocratiser l'accès à l'art.

Le musée de démonstration sert d'abord à une **présentation interne** : le porteur le montre à sa hiérarchie pour proposer des musées virtuels gratuits et inclusifs. Il doit donc être aussi réaliste que possible, avec de **vraies œuvres** (décision du 15 novembre 2026, qui remplace l'ancienne règle des œuvres fictives).

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
| Ambiance des salles | Chaque salle a son propre décor, accordé aux œuvres qu'elle expose. Les décors proposés sont tous utilisés, pour alterner salles claires et salles de caractère (décisions du 15 novembre 2026) |
| Œuvres de la démo | De vraies œuvres en accès libre **remplacent** les 16 tableaux fictifs et les sculptures dessinées par le code. Les cartels portent les vrais titres, auteurs, dates et le musée d'origine. Chaque œuvre est à sa taille réelle |
| Licences des œuvres | La démo étant une présentation interne, les licences « non commerciales » sont acceptées. À qualité égale, on prend le domaine public. La licence de chaque œuvre est notée ; la question sera revue avant toute mise en ligne publique |
| Salle marocaine | Une **nouvelle salle** d'ambiance marocaine historique et traditionnelle (zellige, plâtre sculpté, plafond de cèdre, arcs, fontaine), avec de nouveaux objets traditionnels. Sobre et inspirée de vrais lieux ; salle pilote à valider d'abord |

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
| 2. Décor par salle | Chaque salle reçoit un décor : sol, murs, plafond, lumière, cadres, mobilier | Fait : les cinq salles ont leur décor, voir ci-dessous |
| 3. Œuvres réelles | Recherche de vraies œuvres en accès libre, puis remplacement des œuvres fictives : tableaux, vrais modèles 3D (format GLB) avec de vraies ombres, nouveaux cartels, textes et parcours. Aussi : cadres variés, zoom haute définition | Sélection validée en entier par le porteur le 16 novembre 2026. **Les 29 tableaux, estampes, dessin et photographie sont intégrés, ainsi qu'une première sculpture numérisée.** Restent quatre sculptures, voir ci-dessous |
| 3 bis. Salle marocaine | Nouvelle salle au plan, avec ses éléments d'architecture (arcs, zellige, plâtre sculpté, plafond de cèdre, fontaine) et ses objets traditionnels | **Salle pilote faite**, voir ci-dessous. Attend l'avis du porteur |
| 4. Interface | Écran d'accueil du musée, nouvelle identité visuelle (typographie, icônes, commandes discrètes, fiches animées), clic au sol pour se déplacer, mini-plan permanent | **Fait** : identité choisie par le porteur et appliquée partout, écran d'accueil, clic au sol, mini-plan. Voir ci-dessous. Attend son avis |
| 5. Mise en ligne | Hébergement sur Vercel, puis vérification sur de vrais appareils | À faire, avec l'accord du porteur |
| 6. Outil d'administration | L'éditeur de l'étape 2 du produit. Les réglages de décor y deviendront des options | À faire |

Les voix de l'audioguide peuvent se faire à tout moment : le moteur lit déjà un enregistrement par œuvre et par langue quand on lui en fournit un. Il ne manque que les fichiers.

Viendront aussi : salle immersive sombre au sud de l'atrium, ambiance sonore par salle, contenus enrichis (lien direct vers une œuvre, favoris, vidéos).

### Décor par salle

Le moteur donne un décor à chaque salle. Un décor réunit le revêtement et la couleur du sol, la finition et la couleur des murs, le plafond, le niveau et la teinte de la lumière, la force des projecteurs, les cadres, les socles, les bancs et les cartels. Une salle sans décor suit le style du musée.

Ce que le moteur sait faire :

- **Sols** : béton ciré, parquet droit, parquet de chêne en chevrons (point de Hongrie), dalles de pierre calcaire. Brillance du sol réglable par salle.
- **Murs** : peinture unie ou badigeon de chaux légèrement nuagé.
- **Plafond flottant** : un panneau abaissé, détaché des murs par une gorge lumineuse qui lave le haut des murs.
- **Lumière** : niveau et teinte par salle. Une salle sombre reçoit par ses portes la lumière de sa voisine plus claire. Les cadres, les bancs et les socles s'assombrissent avec leur salle.
- **Cartels sombres** à lettres claires pour une salle obscure, rails et projecteurs de la couleur voulue, barre de seuil entre deux sols différents.

La bibliothèque compte quatre décors. Le porteur a choisi de les utiliser tous, pour alterner les ambiances :

| Salle | Décor | Ambiance |
|---|---|---|
| Atrium | `pierre-claire` | Grand volume clair sous verrière : dalles de pierre calcaire, murs blancs, socle de pierre |
| Salle des Horizons | `argile-claire` | Salle lumineuse et douce : badigeon rosé, chêne clair en chevrons, plafond flottant blanc |
| Cabinet des Couleurs | `terre-cuite` | Bain de couleur : murs et plafond terre cuite, chêne fumé en chevrons, lumière chaude sur les œuvres |
| Galerie des Lignes | `nuit` | Écrin sombre : murs et plafond bleu nuit, sol noir poli, œuvres comme éclairées de l'intérieur |
| Cour des Sculptures | `pierre-claire` | Comme l'atrium : la lumière du jour ne va pas avec un décor sombre |

Pour essayer un autre décor sans rien modifier : `?decor=galerie:terre-cuite` (une salle) ou `?decor=nuit` (toutes).

### Œuvres réelles

La sélection compte 73 pièces, variantes comprises, toutes vérifiées à la source : 59 en domaine public, 12 libres si l'on cite l'auteur, 2 réservées à un usage non commercial. La liste complète, avec la source et la licence de chaque pièce, est dans `docs/selection-oeuvres.md` ; les mêmes données sont dans `docs/selection-oeuvres.json`. Le porteur l'a validée en entier.

**Fait : les 16 tableaux, estampes et photographie.** Les œuvres fictives et leurs images ont été retirées du dépôt (elles restent dans son historique). Les images viennent du Metropolitan Museum, de l'Art Institute of Chicago et du musée de Cleveland, en haute définition, recadrées sur l'œuvre. Pour chaque œuvre : titre, auteur, date, technique et texte en français et en anglais, musée d'origine, lien vers sa notice. Les deux parcours ont été refaits.

Pour ces œuvres, le moteur a appris à :

- dessiner un **passe-partout** autour d'une œuvre sur papier (`mat`) ;
- afficher une **mention** sous la légende, avec le musée qui conserve l'œuvre et la licence de son image (`credit`), et un **lien** vers sa notice (`link`) ;
- écrire un **auteur** ou une **date** différemment selon la langue (« vers 1830–1832 », « c. 1830–32 ») ;
- **approcher le visiteur** à une soixantaine de centimètres d'une petite estampe, au lieu de 1,20 m ;
- replier un titre long sur deux lignes dans les cartels.

**Fait ensuite : les 13 œuvres gardées en réserve**, ajoutées aux murs avec l'accord du porteur pour mieux les garnir (Gauguin, Van Gogh, Turner, Monet, Courbet, Mondrian, Dürer, Hokusai, Caillebotte). Le musée compte 29 tableaux et œuvres sur papier.

**Fait : la première sculpture numérisée**, le *Modèle de L'Esclave grecque* de Hiram Powers (Smithsonian American Art Museum, domaine public), au centre de l'atrium à la place du « Nœud sans fin ». Le moteur charge désormais des modèles 3D au format GLB. `npm run modeles -- demo` en prépare deux versions allégées : une complète (100 000 triangles, 2,2 Mo ici) et une légère pour les appareils modestes (30 000 triangles, 0,8 Mo).

**Reste à faire :** les quatre autres sculptures, qui viennent de Sketchfab et attendent la clé d'accès du porteur (prévue à un prochain jalon) ; en attendant, la Cour des Sculptures garde ses quatre sculptures dessinées par le code. Puis les vraies ombres des sculptures et la salle marocaine.

| Salle | Proposition |
|---|---|
| Atrium | Renoir, *Deux sœurs* ; Degas, *La Classe de danse* |
| Salle des Horizons | Bruegel, *Les Moissonneurs* ; Van Gogh, *Champ de blé avec cyprès* ; Church, *Crépuscule dans la nature sauvage* ; Cézanne, *La Montagne Sainte-Victoire* |
| Cabinet des Couleurs | Deux *Meules* de Monet ; Kandinsky, *Improvisation n° 30* ; Gauguin, *Mahana no atua* |
| Galerie des Lignes | Hokusai, *La Grande Vague* ; Hiroshige, *Averse soudaine* ; Dürer, *Le Rhinocéros* ; Rembrandt, *Les Trois Arbres* ; Le Gray, *La Grande Vague, Sète* (photographie) |
| Cour des Sculptures | Seurat, *Un dimanche à la Grande Jatte* |
| Sculptures en 3D | Vénus de Milo (moulage), tête d'Amenhotep III, Shiva Nataraja, tête de Pierre de Wissant par Rodin, *L'Esclave grecque* de Powers |
| Salle marocaine | 20 pièces du Metropolitan Museum, de l'Art Institute of Chicago et du musée de Cleveland (portes et panneaux mérinides, zelliges, tapis, textiles, manuscrits, bijoux, instruments), et des modèles 3D d'artistes (fontaine, lanterne, théière, tajine) |

Ce que la recherche a montré :

- Aucun musée ne publie de pièce marocaine numérisée en 3D. Les modèles 3D proposés sont des créations d'artistes, sauf un relevé de tombe du Chellah, à Rabat.
- Les estampes et gravures mesurent 25 à 40 cm : elles sont présentées sous passe-partout.
- Les modèles 3D de Sketchfab se téléchargent avec un compte gratuit ; celui de la Smithsonian se télécharge directement. Plusieurs sont lourds et devront être allégés pour le téléphone.

### Finitions des œuvres

Faites le 16 novembre 2026, avec l'accord du porteur :

- **Cadres dorés moulurés** pour les vingt peintures anciennes (`"frame": "gilt"` sur une œuvre). Kandinsky et Mondrian gardent le cadre fin de leur salle ; les œuvres sur papier, leur passe-partout.
- **Ombres portées des sculptures**, au sol et sur leur socle. Elles sont calculées une seule fois, puisque rien ne bouge, et désactivées au niveau de qualité le plus bas.
- **Agrandissement en haute définition** : le bouton « Agrandir » de la fiche ouvre l'image d'origine, que l'on grossit jusqu'à huit fois et que l'on déplace à la souris, au doigt ou au clavier. Il n'existe pas encore dans la vue simplifiée ni en casque.

### Salle marocaine : la salle pilote

Le « Patio marocain » est une nouvelle salle de 11 m sur 11, haute de 6,50 m, au bout de l'enfilade, après le Cabinet des Couleurs. On y entre par un arc outrepassé, visible depuis le Cabinet.

Ce que le moteur a appris pour elle :

- **Arc outrepassé** sur une porte (`"arch": "horseshoe"`).
- **Zellige** : un motif d'étoiles à huit branches et de croix, en soubassement des murs (`dado` dans le décor) et au sol (`"floor": "zellige"`, version plus sobre).
- **Frise de plâtre sculpté** en haut des murs (`frieze`), sur trois registres : petits arcs festonnés, réseau d'étoiles, merlons. Le même plâtre encadre l'arc d'entrée, côté patio.
- **Plafond de cèdre peint**, à solives et caissons ornés d'étoiles (`cedar`).
- **Lanternes de laiton** suspendues, avec leur halo (`lanterns` sur la salle).
- **Fontaine** à bassin en étoile, que le visiteur contourne (`fountain` sur la salle).
- **Objets accrochés sans cadre** (`frameless`) et à la hauteur voulue (`y`) : une porte posée presque au sol, un tapis de 4,70 m.
- Le décor `riad` réunit le tout : chaux blanche, zellige, plâtre, plafond de cèdre peint, lumière chaude.

Le porteur a vu la première version le 16 novembre 2026 et a demandé une ambiance plus riche : le plafond peint, la frise à registres, l'encadrement de l'arc et les lanternes en sont la réponse.

Treize pièces y sont exposées, toutes en domaine public : la paire de portes mérinides, un tapis, un panneau de soie, deux panneaux de bois sculpté, un moucharabieh, une tenture de Tétouan, deux manuscrits, des carreaux, et deux vues du Maroc par Sargent et Delacroix. Un troisième parcours, « Arts du Maroc », les relie.

Limites de cette salle pilote :

- Le zellige, le plâtre et la fontaine sont dessinés par le code : ce sont des motifs justes mais simples, loin de la finesse d'une vraie médersa.
- Les objets en volume de la sélection (plat, poignard, instruments, bijoux) ne sont pas exposés : ils n'existent qu'en photographie. Les modèles 3D d'artistes (lanterne, théière, tajine) attendent la clé Sketchfab.
- La largeur du tapis vient de son image : elle dépasse celle que donne le musée (1,79 m).

### Interface : l'identité retenue

Trois directions ont été proposées au porteur (Cimaise, Nocturne, Zellige ; page de comparaison : https://claude.ai/artifact/5ZaXQyHAFdN3Vex22X2aKG). Il a retenu un mélange, le 16 novembre 2026 :

| Élément | Choix |
|---|---|
| Écran d'accueil | Cimaise : titre centré en lettres à empattements, sur un voile clair qui laisse voir le musée |
| Commandes de la visite | Zellige : une barre en bas de l'écran, de grandes icônes avec leur nom |
| Fiche d'œuvre | Cimaise : une page de catalogue, colonne ivoire, titre en italique, filets fins |
| Couleurs et emblème | Crème et vert profond, étoile à huit branches seule, sans frise multicolore |

Ce mélange est maintenant l'interface du musée, appliquée partout : accueil, en-tête, commandes, fiche, liste des parcours, plan, reprise du parcours, vue simplifiée. Le code d'aperçu (`?ui=`) a été supprimé.

- **Écran d'accueil** (`src/accueil.ts`) : nom du musée, nombre de salles, d'œuvres et de parcours, bouton « Entrer dans le musée », rappel des trois gestes, accès à la vue simplifiée, choix de la langue. Tant qu'il est affiché, le clavier ne déplace pas le visiteur ; Échap fait entrer. `?accueil=non` dans l'adresse ouvre directement la visite. La vue simplifiée n'a pas d'écran d'accueil.
- **Barre de commandes** : Parcours, Plan, Casque VR (s'il existe), Vue simplifiée, langue. En bas de l'écran, sous le pouce sur téléphone. Quand une fiche est ouverte sur ordinateur, elle se recentre dans la place restante ; sur téléphone, la fiche la recouvre.
- **Clic au sol** : un clic ou un toucher sur le sol y amène le visiteur, en ligne droite, à l'allure d'une promenade (4,5 m/s au plus), sans changer la direction du regard. Un repère rond montre la destination ; sur ordinateur il suit déjà la souris. Si un obstacle barre le chemin (banc, socle, fontaine), le visiteur s'arrête devant. Avec une fiche ouverte, un clic au sol la referme sans déplacer le visiteur. Code : `Controls.reach` et `Controls.walkTo`, puis `pick` dans `src/visit3d.ts`.
- **Mini-plan permanent** : en haut à droite, il montre les salles, la salle où l'on est et la direction du regard. Un clic ouvre le plan complet. Il s'efface quand une fiche est ouverte. C'est le plan de `src/engine/map.ts` en version compacte.
- **Couleurs** : définies en tête de `src/style.css` (`--paper`, `--green`, `--ink`, `--line`). L'accent (`--accent`) vient toujours du style du musée. Le vert et l'étoile ne sont pas encore réglables par musée : ce sera une option de l'outil d'administration.
- Piège rencontré : sur téléphone, une fiche pleine largeur, défilante et sans aucune bordure fait disparaître la vue 3D dans Chrome. La fiche garde donc toujours un filet en haut.
- Reste hors de ce lot : le panneau affiché dans le casque VR et l'agrandissement gardent leur habillage sombre d'origine ; les fiches ne sont pas animées.

## 4. En attente du porteur du projet

- **Son avis sur la nouvelle interface** : accueil, barre de commandes, fiche, clic au sol, mini-plan.

- **Son avis sur le Patio marocain enrichi** : couleurs du zellige, choix des pièces, présentation des objets en volume.

- **Un compte Sketchfab gratuit**, pour intégrer les quatre sculptures restantes : le porteur le créera à un prochain jalon. Sa clé d'accès se saisira dans un formulaire sécurisé.
- **Sa relecture des textes des œuvres** : ils sont rédigés par Claude et n'ont pas été confrontés un par un aux notices des musées. Les textes des 43 œuvres réelles et des 3 parcours sont réunis dans un document à corriger en ligne : https://claude.ai/artifact/9VirMxjKKbA2dtJQ6hewSd. Une fois la relecture finie, reporter ses corrections dans `museum.json`, puis produire les voix de l'audioguide.
- **Les voix de l'audioguide** : service de voix de qualité ou vraie personne, à décider.
- **Des essais sur de vrais appareils** : téléphone (de préférence ancien), casque VR, lecteur d'écran (VoiceOver, TalkBack), voix de l'audioguide. Le casque exige une adresse HTTPS, donc l'hébergement.
- **L'hébergement** : créer un compte Vercel et y relier le dépôt GitHub, le moment venu.

## 5. Limites connues

- L'agrandissement en haute définition n'existe que dans la visite 3D, pas dans la vue simplifiée ni en casque.
- Quatre sculptures sur cinq sont encore dessinées par le code.
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
src/zoom.ts                 Agrandissement d'une œuvre en haute définition
src/ui.ts                   Textes de l'interface (français, anglais)
src/style.css               Styles de l'interface
src/accueil.ts              Écran d'accueil de la visite 3D

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
scripts/modeles.mjs         Préparation des modèles 3D d'un musée
scripts/vignettes.mjs       Photos des sculptures pour la vue simplifiée
tests/unit/                 Tests unitaires (Vitest) : 106 tests
tests/e2e/                  Tests dans un navigateur (Playwright) : 52 tests
tests/fixtures/             Musée de test figé, indépendant de la démo
docs/selection-oeuvres.md   Sélection d'œuvres réelles : source et licence de chaque pièce
docs/selection-oeuvres.json Les mêmes données, pour l'intégration
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
| `?accueil=non` | Ouvre la visite 3D sans passer par l'écran d'accueil |
| `?debug` | Affiche le détail des erreurs de configuration, même dans la version publiée |

### Configurer un musée (`museum.json`)

- **Repère** : le nord est vers les `z` négatifs. Une position s'écrit `[x, z]` en mètres ; une taille de salle `[largeur, hauteur, profondeur]`.
- **Salles** : nom, position, taille, décor (facultatif), plafond plat, verrière (`{"type": "skylight", "margin": 1.8}`) ou plafond flottant (`{"type": "cove"}`), bancs.
- **Décor d'une salle** : le nom d'un décor de la bibliothèque (`"decor": "terre-cuite"` ; décors disponibles : `pierre-claire`, `argile-claire`, `terre-cuite`, `riad`, `nuit`), ou ce décor corrigé réglage par réglage (`"decor": {"preset": "terre-cuite", "colors": {"wall": "#8e3f2c"}, "light": {"level": 0.9}}`). Réglages possibles : couleurs (`colors` : mur, sol, plafond, cadres, socles, bois, finitions, rails), sol (`floor` : `concrete`, `parquet`, `chevron`, `stone`, `zellige`), soubassement de zellige (`dado`) et frise de plâtre (`frieze`), en mètres, plafond de cèdre peint (`cedar`), murs (`walls` : `paint`, `limewash`), brillance du sol (`gloss`), plafond, cadre, lumière (`light` : niveau, teinte, force des projecteurs), cartels (`labels`). Les anciens réglages `wall` (couleur des murs) et `light` (niveau d'éclairage) de la salle restent acceptés.
- **Portes** : déclarées une seule fois, sur le mur d'une salle (`room`, `wall`, `offset`, `width`, hauteur facultative). L'ouverture dans la salle voisine est déduite.
- **Tableaux** : mur, décalage le long du mur (positif vers la droite quand on fait face au mur), largeur et hauteur en mètres, image (`{"src": "images/nom.webp"}`), titre, artiste, date, technique, texte. Facultatifs : cadre doré (`"frame": "gilt"`), passe-partout (`"mat": 0.12`, en mètres), mention du musée d'origine (`credit`, par langue), lien vers la notice (`link`), enregistrement audio. L'artiste et la date s'écrivent une fois, ou par langue (`{"fr": "vers 1830", "en": "c. 1830"}`).
- **Sculptures** : position dans la salle, hauteur, hauteur du socle, et soit un modèle 3D numérisé (`"model": {"src": "models/nom.glb"}`, à préparer avec `npm run modeles`), soit une forme dessinée par le moteur avec son matériau (bronze, marbre, bronze patiné, bois laqué).
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
npm run modeles -- demo           # prépare les modèles 3D déposés dans models/
npm run vignettes -- demo         # photographie les sculptures (le musée doit tourner)
```

## 8. Méthode de travail retenue

- **Tout en français** : interface, commentaires du code, messages de commit, documentation. Les textes du musée existent en français et en anglais.
- **Le porteur du projet n'est pas développeur** : commandes exactes à copier, explications simples, sur Mac.
- **Avant et après chaque modification du moteur** : les tests doivent passer, puis le rendu est vérifié par des captures sur ordinateur et sur téléphone.
- **Un aperçu à la fin de chaque lot**, et pas de lot touchant à l'identité visuelle sans l'avis du porteur.
- **Œuvres** : Claude cherche de vraies œuvres en accès libre et vérifie la licence de chacune à la source ; le porteur valide la sélection avant toute intégration.
- **Accès aux collections des musées** : les sessions dans le cloud passent par l'environnement « musee-virtuel », qui autorise les sites du Metropolitan Museum, de l'Art Institute of Chicago, du musée de Cleveland, de Wikimedia Commons, de la Smithsonian et de Sketchfab.

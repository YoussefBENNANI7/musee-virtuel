# Musée virtuel personnalisable : état du projet

Mis à jour le 18 novembre 2026. Ce document permet de reprendre le projet dans une nouvelle conversation sans rien perdre : vision, décisions prises, avancement, points en attente et organisation du code.

---

## 1. Le projet

Une plateforme de visites virtuelles en 3D, en marque blanche, vendue à des musées, en priorité de petits musées peu connus. Le porteur du projet configure lui-même chaque musée pour son client (salles, œuvres, textes, couleurs), puis le lui commercialise.

La visite est **gratuite pour le public**, dans une logique d'inclusion : démocratiser l'accès à l'art.

Le musée de démonstration sert d'abord à une **présentation interne** : le porteur le montre à sa hiérarchie pour proposer des musées virtuels gratuits et inclusifs. Il doit donc être aussi réaliste que possible, avec de **vraies œuvres** (décision du 15 novembre 2026, qui remplace l'ancienne règle des œuvres fictives).

### Versions

- **Version 1** (18 novembre 2026) : la branche `main`, commit `5aeaa69`, et l'étiquette `v1`, créée par le porteur sur GitHub le même jour (l'environnement de travail de Claude ne peut pas publier d'étiquette). Elle réunit le travail de toutes les conversations jusqu'au 17 novembre 2026 (moteur, éditeur, musée de démonstration à six salles, voix de l'audioguide), plus la correction « Déplacement en douceur interrompu ». Pour la retrouver telle quelle : `git checkout v1`.
- **Les musées créés avec l'éditeur ne sont pas dans GitHub** (voir « Outil d'administration ») : la salle des 120 ans (`120-ans`) et le musée d'essai (`musee-test`) n'existent que sur le Mac du porteur. Leur sauvegarde de la version 1 est le dossier `musees-sauvegarde-v1`, sur son Bureau (copie de `public/museums/`, faite le 18 novembre 2026). À garder aussi hors du Mac (clé USB ou iCloud Drive).
- **Version 2** : rendu premium du même moteur (lumière précalculée, finitions, reflets, matières), toujours dans le navigateur, sur la branche `claude/optimistic-davinci-kqpqmj` (voir « Version 2, rendu premium : lumière précalculée des six salles »). Choix du porteur, le 18 novembre 2026, plutôt qu'une version sous Unreal Engine, dont les limites lui ont été présentées : pas de visite par simple lien, ni dans le navigateur du téléphone, coût de diffusion par visiteur, accessibilité à refaire, et travail surtout manuel dans l'éditeur d'Unreal. Le pilote sur une salle a été validé par le porteur, puis étendu aux six salles.

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
2. **Personnalisation** : un outil de configuration (éditeur visuel) et plusieurs musées sur le même socle. *Première version de l'éditeur livrée (novembre 2026).*
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
| 6. Outil d'administration | L'éditeur de l'étape 2 du produit. Les réglages de décor y deviendront des options | **Première version faite**, voir « Outil d'administration ». Premier essai du porteur le 17 novembre 2026 |

### Version 2, rendu premium : lumière précalculée des six salles (18 novembre 2026)

Sur la branche `claude/optimistic-davinci-kqpqmj`, pas sur `main` : la version 1 reste intacte tant que le porteur n'a pas validé. Détail, réglages et installation : `docs/lumiere.md`.

Déroulé : un pilote sur la Salle des Horizons, validé par le porteur le 18 novembre 2026 (« oui, l'étendre à toutes les salles, avec plus de chaleur »), puis l'extension aux six salles le même jour. Sa troisième question, la force des faisceaux, est restée sans réponse : ils gardent la force du pilote.

- **Ce qui est fait** : Blender (moteur Cycles, utilisé comme module Python `bpy` 5.3, sans interface) calcule la lumière de chaque salle. Le résultat est un atlas de lumière par salle (un point tous les 2,5 cm ; 105 Ko en WebP pour les six salles, de 13 à 23 Ko chacune), que la visite plaque sur les murs, le sol et le plafond. Sur un appareil modeste, l'atlas est réduit de moitié.
- **Ce que chaque salle y gagne** :

| Salle | Ce que le calcul apporte |
|---|---|
| Atrium, Cour des Sculptures | Lumière du ciel par la verrière, vraie tache de soleil au sol avec l'ombre adoucie des traverses, murs d'un blanc chaud qui s'assombrissent doucement vers les angles |
| Salle des Horizons | Faisceaux des projecteurs, gorge lumineuse, murs plus dorés que dans le pilote |
| Cabinet des Couleurs | Faisceaux chauds sur la terre cuite, lumière du patio qui entre par l'arc |
| Galerie des Lignes | Vrais faisceaux allongés sur les murs bleu nuit, à la place des halos ronds |
| Patio marocain | Lumière chaude des quatre lanternes sur les murs, soleil, ombres des objets accrochés et de la fontaine ; les bandes de zellige et de plâtre lisent la lumière du mur |

- **Plus de chaleur** (demande du porteur) : la lumière des murs est réchauffée (réglage `--chaleur`, 0,07 par défaut ; moitié au plafond, rien au sol), et les projecteurs ont une lumière plus dorée. Sous une verrière, les murs n'en reçoivent que 60 % : le soleil réchauffe déjà la salle. La Galerie des Lignes, à lumière froide par choix du décor, n'est pas réchauffée.
- **Le décor reste celui qui a été choisi** : chaque famille de surfaces (sol, murs, plafond) garde la clarté et la teinte que lui donne son décor. Le calcul n'apporte que les variations. Les murs sont 6 % plus clairs, pour compenser les halos peints disparus.
- **Un plan, une place dans l'atlas** : les pans d'un mur, le linteau, l'arc outrepassé et les bandes de revêtement partagent une place, côte à côte comme dans le musée. Le pilote rangeait chaque pan à part, d'où une couture visible au-dessus des portes : elle a disparu.
- **Quatre passes** calculées à part, puis réunies : la base (ambiance, gorge, ciel, lanternes), l'accent (projecteurs, ou soleil), la lumière des salles voisines par les portes, les ombres de contact. La force d'un faisceau se règle ainsi par rapport à la clarté du mur, celle de la tache de soleil par rapport à celle du sol, quelle que soit la salle. Les passes sont gardées hors du projet (`~/.cache/musee-virtuel/lumiere/`) : changer la chaleur ou la force d'un faisceau se refait en 3 à 20 secondes par salle, au lieu de plusieurs minutes.
- **Défauts rencontrés et corrigés** en étendant le pilote, tous visibles sur les captures d'essai :
  - *Gorge rouge vif sur la terre cuite* : la lumière renvoyée par des murs colorés sature. On ne garde qu'un tiers de la couleur propre au calcul.
  - *Liseré clair au bord du plafond de la salle sombre* : le plafond va jusqu'aux limites de la salle, dans l'épaisseur des murs, où le dos des murs voisins l'éclairait. Les surfaces voisines n'éclairent plus que du côté où elles sont tournées, et la partie cachée du sol et du plafond ne compte plus.
  - *Tache de soleil trop pâle* au premier essai (42 % de la clarté du sol, contre 77 % pour la tache peinte de la version 1) : portée à 75 %.
  - *Murs tachetés* dans les salles blanches : lissage plus large là où aucun faisceau n'est à garder net.
  - *Salle sombre* : ses faisceaux sont huit fois plus clairs que ses murs. L'image garde donc la lumière divisée par 2, 4 ou 8 selon la salle, et les lumières les plus fortes sont arrondies en douceur.
- **Effets peints retirés** dans une salle calculée : les halos autour des œuvres, les ombres douces sous les bancs, les socles et la fontaine, et la tache de soleil dessinée. L'ombre que le soleil de la visite fait porter aux sculptures est gardée : sans elle, les statues paraissaient moins posées.
- **Sécurité** : une empreinte de la salle (surfaces, décor, œuvres, mobilier, style) accompagne l'atlas. Si la salle change ensuite, par exemple un tableau déplacé dans l'éditeur, la visite garde l'éclairage par formule pour cette salle et l'écrit dans la console. `npm run lumiere -- demo` ne recalcule que les salles modifiées. `?lumiere=0` montre le musée sans les atlas, pour comparer.
- **Durée du calcul** : 27 minutes pour les six salles (de 1 min 30 pour la Galerie des Lignes à 7 minutes pour l'Atrium), à 256 échantillons, sur les 4 cœurs de l'environnement de travail. Les passes gardées occupent 49 Mo hors du projet.
- **Vérifié** : 9 tests unitaires (rangement de l'atlas, plans partagés, coordonnées, empreinte, force des faisceaux) et 6 tests dans un navigateur (les six salles éclairées et leurs effets peints retirés, comparaison, salle modifiée, atlas réduit sur appareil modeste, scène exportée pour Blender, fichier manquant). Captures avant et après de chaque salle, sur ordinateur et sur téléphone.
- **Limites** : les objets (cadres, bancs, socles, sculptures, fontaine) et les embrasures des portes gardent leur éclairage d'avant ; le calcul se fait sur le processeur (la carte graphique du Mac irait plus vite) ; un musée créé avec l'éditeur se calcule sur le Mac du porteur, et l'éditeur ne signale pas encore qu'une salle modifiée est à recalculer.
- **Suite possible** : l'avertissement « lumière à recalculer » dans l'éditeur, puis les autres améliorations de la version 2 (finitions de l'image sur ordinateur, vrais reflets, matières plus riches, objets éclairés par la lumière calculée).

### Voix de l'audioguide : décisions prises, production à venir

Le moteur lit déjà un enregistrement par œuvre et par langue quand on lui en fournit un (champ `audio` de l'œuvre) ; sans lui, il fait lire le texte par la voix du navigateur. Il ne manque que les fichiers.

- **Textes validés** : le porteur a relu les textes des œuvres et des parcours et les garde tels quels (16 novembre 2026). Le document de relecture (https://claude.ai/artifact/9VirMxjKKbA2dtJQ6hewSd) n'a reçu aucune correction. Les textes n'ont pas pour autant été confrontés un par un aux notices des musées : à refaire avant une diffusion publique.
- **Choix du porteur** : un service de voix (pas d'enregistrement par une personne), une **voix féminine chaleureuse**, en **français et en anglais**. L'arabe viendra dans un lot à part (traduction des textes, écriture de droite à gauche).
- **Service retenu** : les voix de Google Gemini, par son accès développeur (« Gemini API »), car le porteur a déjà un abonnement Google. L'abonnement ne donne pas de crédit pour cet accès : il faut une clé, créée dans Google AI Studio dans un projet réservé au musée (fait le 16 novembre 2026).
- **Modèle et tarifs** (documentation officielle lue le 16 novembre 2026, https://aistudio.google.com/docs/pricing) : `gemini-3.8-flash-tts`, le plus fidèle des deux modèles de voix. Il a une formule gratuite, dont les quotas journaliers s'affichent dans AI Studio ; avec la formule gratuite, Google peut utiliser les textes envoyés pour améliorer ses produits. En payant : 9 $ par million de jetons audio jusqu'au 31 décembre 2026 (18 $ ensuite), à 25 jetons par seconde d'audio. Une demi-heure d'audio coûte donc environ 0,40 $.
- **Voix** : 30 voix de base (par exemple Sulafat, « chaleureuse » ; Achernar, « douce » ; Vindemiatrix, « bienveillante »), plus une bibliothèque de centaines de voix filtrables par langue et par genre. La langue est reconnue d'elle-même dans le texte.
- **Volume mesuré** : 47 œuvres, 21 600 caractères de commentaires pour les deux langues (11 100 en français, 10 600 en anglais), le plus long faisant 346 caractères. Avec le titre, l'artiste et la date lus en tête, compter environ 27 000 caractères, soit une demi-heure d'audio.
- **Texte lu** (`src/engine/narration.ts`) : le cartel (titre, artiste, date) puis le commentaire. Les siècles en chiffres romains, les intervalles de dates et « n° » sont réécrits en toutes lettres pour être bien prononcés. La voix du navigateur lit désormais le même texte.
- **Commande `npm run voix`** (`scripts/voix.mjs`) : produit un MP3 par œuvre et par langue dans `audio/` (mono, 48 kb/s), renseigne le champ `audio` des œuvres, et retient dans `audio/voix.json` la voix, le ton et l'empreinte de chaque texte. Relancée, elle ne refait que les textes modifiés ; à la limite du jour, elle s'arrête et reprend le lendemain. `--essai` produit des extraits dans `essais-voix/`, hors du musée ; `--catalogue fr-FR` liste les voix féminines du catalogue. Elle demande ffmpeg (`brew install ffmpeg` sur Mac) et la clé dans la variable `GEMINI_API_KEY` (dans l'environnement cloud, le réseau l'ajoute).
- **Clé** : enregistrée par le porteur comme secret réseau de l'environnement cloud (`generativelanguage.googleapis.com`, en-tête `x-goog-api-key`, sans préfixe). Elle fonctionne (16 novembre 2026).
- **Quota gratuit constaté** : 10 extraits par jour pour `gemini-3.8-flash-tts`. Tout le musée demande 94 extraits (47 œuvres, 2 langues) : une dizaine de jours en restant gratuit, ou quelques minutes en activant le paiement à l'usage dans AI Studio (environ 0,40 $).
- **Catalogue** : 48 voix féminines natives en français, 69 en anglais britannique, 104 en anglais américain (`npm run voix -- --catalogue fr-FR`).
- **Trois voix proposées au porteur**, sur une page d'écoute (https://claude.ai/artifact/Jx5VYkFSDNBGQXornja2Zi) : A `sulafat` (voix de studio, la même dans les deux langues) ; B `fr:fr-fr-tutor-4+en:en-gb-tutor-11` (voix natives chaleureuses, ton de radio) ; C `fr:fr-fr-tutor-2+en:en-gb-tutor-12` (voix natives graves et posées).
- **Choix du porteur (16 novembre 2026) : la voix B**, et le paiement à l'usage. La facturation est activée sur le projet Google : il passe au niveau « Tier 1 », limité à **100 extraits par jour**.
- **Production terminée le 16 novembre 2026** : les 47 œuvres ont leur voix en français et en anglais, soit 94 extraits et environ 45 minutes d'audio (18 à 42 s par extrait, 16 Mo). Le volume est égalisé (EBU R128, -18 LUFS). Le quota de 100 extraits par jour glisse sur 24 heures : il se libère peu à peu, ce qui a permis de finir le jour même.
- **Contrôles** : aucun extrait de durée anormale ; un seul silence de plus d'une seconde, une pause naturelle d'1,3 s après le cartel des *Trois Arbres*. Les tests vérifient que chaque voix déclarée existe et correspond au texte actuel de l'œuvre ; un test de bout en bout vérifie que la démo joue bien le fichier enregistré, en français puis en anglais. Un test exige une voix pour chaque œuvre dans chaque langue, et refuse tout fichier resté d'une œuvre retirée : après une correction de texte ou l'ajout d'une œuvre, `npm run check` rappelle de relancer `npm run voix -- demo`.
- Claude ne peut pas écouter le résultat : la prononciation des noms propres se contrôle à l'oreille, par le porteur.

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

**Fait le 16 novembre 2026 : quatre vraies sculptures dans la Cour**, à la place des quatre sculptures dessinées par le code. Elles viennent toutes de la Smithsonian, dont les modèles 3D se téléchargent sans compte (`3d-api.si.edu`), à leur taille réelle :

| Œuvre | Origine | Licence |
|---|---|---|
| *Bouddha à la robe des royaumes de l'existence*, dit « Bouddha cosmique », Chine, 550–577, calcaire, 1,51 m | Freer Gallery of Art, F1923.15 | Domaine public (CC0) |
| *Vase rituel à vin (fangyi)*, Chine, Luoyang, vers 1100 av. J.-C., bronze, 35 cm | Freer Gallery of Art, F1930.54a-b | Domaine public (CC0) |
| *Défense sculptée*, artiste kongo, côte de Loango, vers 1860, ivoire, 72 cm | National Museum of African Art, 96-28-1 | Domaine public (CC0) |
| *Danseuse*, Agathon Léonard pour la Manufacture de Sèvres, vers 1900, biscuit de porcelaine, 45 cm | Cooper Hewitt, 1910-41-1 | **Conditions d'utilisation de la Smithsonian (usage non commercial)** : à revoir avant une diffusion publique |

- Le vase est fourni en deux parties (corps et couvercle), réunies en un seul fichier.
- Deux réglages de sculpture ont été ajoutés : `turn` (rotation sur le socle, en degrés) et `tone` (part de lumière gardée, pour une matière très claire : la danseuse est à 0,62, sinon son biscuit blanc perdait tout relief).
- Leurs textes sont rédigés par Claude d'après les notices des musées ; le porteur ne les a pas relus. La défense montre, entre autres scènes, une file de captifs enchaînés : le texte le dit sobrement.
- Leurs voix sont enregistrées (voix B).
- Autres modèles repérés à la Smithsonian, non retenus : *The Dying Tecumseh* de Ferdinand Pettrich (marbre de 2 m de long, demanderait un grand socle bas), un buste de George Washington, un masque mortuaire de Lincoln, deux reliefs bouddhiques.

**Reste à faire :** les sculptures de la sélection d'origine qui viennent de Sketchfab (Vénus de Milo, Amenhotep III, Shiva Nataraja, tête de Rodin) attendent la clé d'accès du porteur ; elles pourront s'ajouter ou remplacer certaines des quatre ci-dessus.

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

Ce mélange est maintenant l'interface du musée, appliquée partout : accueil, en-tête, commandes, fiche, liste des parcours, plan, reprise du parcours, vue simplifiée. Le code d'aperçu (`?ui=`) a été supprimé. Aperçu en images, sur ordinateur et sur téléphone : https://claude.ai/artifact/B7qcZNTVymFQVLDf3P9ck6.

- **Écran d'accueil** (`src/accueil.ts`) : nom du musée, nombre de salles, d'œuvres et de parcours, bouton « Entrer dans le musée », rappel des trois gestes, accès à la vue simplifiée, choix de la langue. Tant qu'il est affiché, le clavier ne déplace pas le visiteur ; Échap fait entrer. `?accueil=non` dans l'adresse ouvre directement la visite. La vue simplifiée n'a pas d'écran d'accueil.
- **Barre de commandes** : Parcours, Plan, Casque VR (s'il existe), Vue simplifiée, langue. En bas de l'écran, sous le pouce sur téléphone. Quand une fiche est ouverte sur ordinateur, elle se recentre dans la place restante ; sur téléphone, la fiche la recouvre.
- **Clic au sol** : un clic ou un toucher sur le sol y amène le visiteur, en ligne droite, à l'allure d'une promenade (4,5 m/s au plus), sans changer la direction du regard. Un repère rond montre la destination ; sur ordinateur il suit déjà la souris. Si un obstacle barre le chemin (banc, socle, fontaine), le visiteur s'arrête devant. Avec une fiche ouverte, un clic au sol la referme sans déplacer le visiteur. Code : `Controls.reach` et `Controls.walkTo`, puis `pick` dans `src/visit3d.ts`.
- **Mini-plan permanent** : en haut à droite, il montre les salles, la salle où l'on est et la direction du regard. Un clic ouvre le plan complet. Il s'efface quand une fiche est ouverte. C'est le plan de `src/engine/map.ts` en version compacte.
- **Couleurs** : définies en tête de `src/style.css` (`--paper`, `--green`, `--ink`, `--line`). L'accent (`--accent`) vient toujours du style du musée. Le vert et l'étoile ne sont pas encore réglables par musée : ce sera une option de l'outil d'administration.
- Piège rencontré : sur téléphone, une fiche pleine largeur, défilante et sans aucune bordure fait disparaître la vue 3D dans Chrome. La fiche garde donc toujours un filet en haut.
- Reste hors de ce lot : le panneau affiché dans le casque VR et l'agrandissement gardent leur habillage sombre d'origine ; les fiches ne sont pas animées.

### Marche : arrêt au ras des obstacles

Correction du 17 novembre 2026. Aperçu, avec les mesures avant et après et des captures sur ordinateur et sur téléphone : https://claude.ai/artifact/LHG9faHLxhGGtdWtf1Db31.

- **Le défaut** : au clavier ou à la manette virtuelle, le pas d'une image (2,40 m par seconde, donc jusqu'à 24 cm quand les images sont lentes) était fait ou refusé en entier. Le visiteur s'arrêtait jusqu'à 24 cm avant un mur, un socle ou un banc, puis s'en approchait par à-coups.
- **La règle de marche** (`advance`, dans `src/engine/marche.ts`) sert maintenant au clavier, à la manette et au casque. Le déplacement d'une image est découpé en petits pas de 5 cm au plus. Devant un obstacle, le visiteur avance le long de chaque axe aussi loin que possible, au millième de millimètre près (recherche par dichotomie). Il arrive donc au ras de l'obstacle dans l'image même, quelle que soit la cadence ; il glisse le long des murs comme avant, et contourne un socle rond en le serrant.
- **Mesuré** dans le navigateur des tests, vers un mur : avec des images toutes lentes, arrêt à 20 cm avant la correction, au ras après ; à la cadence des tests, le mur est atteint en 0,9 s, alors qu'il ne l'était toujours pas après 8 s.
- **En casque**, la même règle s'applique, arrêt au ras compris. Elle n'y part pas de la tête du visiteur mais de son point d'appui : voir « Casque : le joystick répond toujours, et amène au ras des obstacles ». Le casque a d'abord gardé une marge de 5 cm devant les obstacles, retirée le jour même.
- **Parti d'un endroit non praticable**, le visiteur garde l'ancienne règle, à l'identique : le pas se fait d'un bloc ou pas du tout. Ce cas ne devrait plus se présenter : un déplacement en douceur interrompu ne laisse plus le visiteur dans un mur (voir « Déplacement en douceur interrompu »), et l'entrée en casque achève d'abord tout déplacement en cours.
- **Le clic au sol** n'est pas concerné : le visiteur s'y arrête jusqu'à 10 cm avant un obstacle, quelle que soit la cadence (`Controls.reach`).
- **Tests** : `tests/unit/marche.test.ts` et `tests/unit/controls.test.ts` (24 tests). Dans un navigateur, deux tests ralentissent de vraies images (`slowFrames`, dans `tests/e2e/helpers.ts`), au clavier sur ordinateur et à la manette sur téléphone.

### Casque : le joystick répond toujours, et amène au ras des obstacles

Correction du 17 novembre 2026, en deux temps : d'abord le joystick qui répond toujours, ensuite seulement l'arrêt au ras. **Elle n'a été vérifiée qu'en casque émulé. L'essai sur un vrai casque reste à faire, et le travail n'est pas terminé tant qu'il ne l'est pas** (voir « En attente du porteur du projet »). Aperçu, avec un schéma, les mesures avant et après et des captures : https://claude.ai/artifact/EVxutfoGjPGGkkNkzufvok.

- **Le défaut** : en casque, le joystick déplace le visiteur, mais la règle de marche partait de sa tête : un pas n'était fait que s'il menait la tête à un endroit praticable. Or la tête va où le visiteur la porte. Dès qu'elle passait la limite de marche (il se penche vers une œuvre, ou sa tête bouge simplement au ras d'un mur), le joystick ne répondait plus, ni le long du mur ni vers l'arrière, sauf par un pas assez long pour ramener la tête d'un coup en zone praticable ; à 90 images par seconde, un pas ne fait que 2 cm.
- **Le point d'appui** (`follow`, dans `src/engine/marche.ts`) : la règle de marche part maintenant de l'endroit où le visiteur est tenu pour debout. C'est sa tête tant qu'elle est en zone praticable. Quand elle en sort, le point d'appui la suit à pied, selon la règle de marche : il s'arrête au ras de la limite qu'elle a passée et la longe à mesure qu'elle se déplace, pour rester au plus près d'elle. Quand elle revient en zone praticable, il la rejoint. Le joystick déplace le point d'appui, et le visiteur d'autant : sa tête garde son écart, et n'est donc pas poussée plus loin en zone interdite.
- **L'arrêt au ras** : la marge de 5 cm gardée en casque n'avait qu'une raison. Arrêté au ras, le visiteur passait la limite au moindre mouvement de tête, et ne pouvait plus longer le mur. Le point d'appui la rend inutile : le joystick amène maintenant le visiteur au ras de l'obstacle, comme au clavier, quelle que soit la cadence. L'option `flush` de la règle de marche, qui ne servait qu'au casque, est supprimée avec ses deux tests.
- **Mesuré en casque émulé**, à la cadence d'un casque (90 images par seconde, soit 2 cm par image), sur le code d'origine puis sur le code corrigé :

| Situation | Avant | Après |
|---|---|---|
| Arrêt devant un mur, au joystick | 2,5 cm avant la limite à grands pas (images lentes), 0,5 cm à la cadence d'un casque | Au ras dans les deux cas |
| Tête penchée de 10 cm au-delà de la limite, une seconde de joystick le long du mur | 0 m | 1,80 m, dans un sens comme dans l'autre |
| La même, une seconde de joystick vers l'arrière | 0 m | 1,80 m |
| La même, une seconde de joystick vers le mur | 0 m | 0 m : la tête n'est pas poussée plus loin |
| Tête qui bouge sans cesse, deux secondes le long d'un mur | Joystick sans effet 168 images sur 180 ; 0,23 m parcourus | Aucune image sans effet ; 3,54 m parcourus |
| Sortie du casque la tête penchée, puis une seconde au clavier (60 images par seconde) | 0 m : le visiteur reste coincé | 2,40 m |
| Première image de la session, avant que le casque ait donné sa position | Tête vue à 1,40 m de sa place | Tête à sa place |

- **La tête qui bouge sans cesse** est simulée : elle oscille de 2 cm, le visiteur regarde à droite et à gauche (le casque tourne autour du cou), et il se penche de 10 cm vers ce qu'il regarde. C'est ce que l'émulateur ne fait pas de lui-même, et ce que l'essai sur un vrai casque doit confirmer.
- **Cas particuliers**, vérifiés un par un :
  - *Entrée en session* : le visiteur s'appuie là où il se tenait à l'écran, même si le casque le voit d'emblée au-delà d'un mur.
  - *Téléportation à la gâchette* : le visiteur s'appuie au point visé.
  - *Pivot par crans* : la tête ne change pas de place dans le musée, le point d'appui non plus.
  - *Mur traversé en marchant pour de bon* : tant que la tête est dans l'épaisseur du mur, le joystick ne l'y enfonce pas, mais répond encore le long du mur et vers l'arrière. Dès qu'elle est en zone praticable de l'autre côté, le visiteur est dans la salle voisine, comme avant.
  - *Sortie du casque* : le visiteur retrouve la visite à l'écran à son point d'appui.
  - *Entrée en casque depuis un endroit non praticable* : ne devrait plus arriver, car l'entrée en casque achève d'abord tout déplacement en douceur (voir « Déplacement en douceur interrompu »). Par sécurité, rien ne disant où le visiteur pourrait s'appuyer, il garderait l'ancienne règle jusqu'à revenir en zone praticable.
- **Tests** : 13 tests unitaires dans `tests/unit/marche.test.ts` (la règle du point d'appui, puis un visiteur en casque simulé) et 3 tests en casque émulé de plus dans `tests/e2e/casque-vr.spec.ts` (le scénario du défaut, la tête qui bouge sans cesse, les cas particuliers).
- **Contre-épreuves** : si la règle repart de la tête, 9 de ces tests unitaires et les 3 tests en casque échouent. Si le joystick garde sa marge, 3 tests en casque échouent (arrêt à 2,5 et 3,6 cm de la limite).
- **Point à surveiller, non corrigé : les portes.** Voir « Limites connues ».

### Déplacement en douceur interrompu : le visiteur n'est plus coincé

Correction du 17 novembre 2026. Aperçu, avec les mesures avant et après et des captures sur ordinateur et sur téléphone : https://claude.ai/artifact/HDZqNd4G47k2H2Byhzp424.

- **Le défaut** : pour amener le visiteur devant une œuvre, le musée le déplace en ligne droite, à travers les murs et le mobilier (`Controls.glideTo`). S'il reprenait la main à cet instant (touche, glissement de la vue, doigt sur la manette), il s'arrêtait où il était, parfois dans l'épaisseur d'un mur ou dans la zone réservée autour d'un banc ou d'un socle. De là, aucune touche ne le faisait plus bouger, et le clic au sol non plus.
- **La règle** (`Controls.interrupt`, dans `src/engine/controls.ts`) : là où le visiteur peut se tenir, il s'arrête sur place, comme avant. Ailleurs, son déplacement **se poursuit jusqu'au premier endroit praticable de sa trajectoire**, sur sa lancée et au moins à l'allure de la marche : un quart de seconde au plus. Il s'arrête alors au ras de l'obstacle, de l'autre côté, et peut marcher. Si rien n'est praticable devant lui, il revient au dernier endroit praticable qu'il a traversé.
- **Le regard** obéit au visiteur dès qu'il reprend la main, y compris pendant ce quart de seconde : le déplacement ne le fait plus tourner. Faire glisser la vue arrête donc toujours un déplacement, comme avant : c'est le choix retenu par défaut, **à confirmer par le porteur**. L'autre possibilité : ce geste ne ferait que tourner le regard, et le visiteur irait au bout de son déplacement.
- **L'endroit où il s'arrête ne dépend pas de la cadence des images** : il est calculé sur la trajectoire (`firstWalkable`, dans `src/engine/marche.ts`), par petits pas puis par dichotomie, au millième de millimètre.
- **Trois cas voisins corrigés du même coup** : un clic au sol dont le trajet rase l'angle d'un banc (le trajet n'est contrôlé que tous les 10 cm) ; un déplacement mené à son terme, qui s'achève à moins d'un centimètre du but et pouvait laisser le visiteur juste avant la zone de marche ; l'entrée en casque VR pendant un déplacement, qui faisait démarrer le visiteur dans un mur (le déplacement s'achève maintenant d'un coup, `Controls.finishGlide`).
- **Ce qui ne change pas** : un déplacement que rien n'interrompt, la marche au clavier et à la manette, le clic au sol. Parti d'un endroit non praticable, `advance` garde l'ancienne règle.
- **Mesuré** sur le cas signalé (du hall vers le cabinet du musée de test, interruption dans le mur nord) : avant, 0,000 m de déplacement en deux secondes, dans les quatre directions ; après, le visiteur est dans le cabinet en moins d'un dixième de seconde et y marche à 2,40 m par seconde.
- **Vérifié aussi dans le musée de démonstration**, avec un vrai clic puis un vrai glissement de la vue (de l'atrium vers la Grande Jatte, aperçue par la porte de la Cour : le trajet passe par le mur sur 1,28 m). Avant : le visiteur reste dans le mur, 0 m aux quatre touches. Après : il s'arrête 63 cm plus loin, dans la Cour, en deux centièmes de seconde, et marche. Vu de l'intérieur, un mur ne se voit pas : rien n'indiquait au visiteur où il était.
- **L'endroit où le visiteur est emmené devant une œuvre est toujours praticable**, dans la démonstration comme dans le musée de test (mesuré dans un navigateur sur plus de 440 000 combinaisons d'œuvre, de point de départ et de recul) : il a donc toujours un endroit praticable devant lui. Le retour en arrière n'existe que par sécurité.
- **Tests** : 21 tests unitaires (`tests/unit/marche.test.ts`, `tests/unit/controls.test.ts`), pour un mur, un banc et un socle, avec les quatre gestes (touche de déplacement, touche de rotation, glissement de la vue, manette) et trois durées d'image, plus 4 000 trajets tirés au hasard (avec l'ancien moteur, 1 748 visiteurs y restaient coincés ; aucun avec le nouveau). Quatre tests dans un navigateur, avec de vrais gestes : la souris dans un mur, le clavier près d'un socle, le doigt sur la manette près d'un banc (tablette), et l'entrée en casque émulé. Sans la correction, 12 des tests unitaires et ces quatre tests échouent.
- **Constat au passage** : sur un téléphone tenu droit, la fiche ouverte recouvre la manette ; le visiteur ne peut donc pas la toucher pendant qu'il est emmené devant une œuvre. Il le peut sur une tablette ou un téléphone couché, où la fiche s'ouvre sur le côté.

### Autour de l'œuvre, et pack présentation

Lot demandé par le porteur le 16 novembre 2026, fait en autonomie, pour impressionner lors de la présentation à sa hiérarchie. Aperçu en images, sur ordinateur et sur téléphone : https://claude.ai/artifact/Uea2TDhDisxa2BCQVwTcrx.

**Autour de l'œuvre**

- **Examiner une sculpture** (`src/inspect.ts`) : le bouton « Examiner » de la fiche montre la sculpture seule, sur un fond sombre. On tourne autour d'elle à la souris, au doigt ou au clavier, on s'approche et on recule ; une rotation lente la présente d'elle-même. La caméra de la visite sert à l'examen (un calque à part ne montre que la sculpture) et la position du visiteur est rendue à la fermeture. L'intérêt grandira avec de vrais modèles numérisés : il n'y en a qu'un aujourd'hui.
- **Détails commentés** : dans l'agrandissement d'un tableau, des points numérotés ; un clic s'approche du détail (3 fois) et affiche son commentaire, avec « Précédent », « Suivant » et « Vue d'ensemble ». Ils s'écrivent dans `museum.json` (champ `details` du tableau : position de 0 à 1 dans l'image, titre, texte). Le bouton de la fiche devient « Explorer les détails ». La vue simplifiée les liste sous le commentaire. Sept œuvres de la démo en ont trois ou quatre : *Les Moissonneurs*, *La Grande Vague*, *La Grande Jatte*, *Champ de blé avec cyprès*, *La Classe de danse*, *Rue de Paris, temps de pluie*, la *Paire de portes*. **Ces textes sont rédigés par Claude, d'après ce que montrent les images : le porteur ne les a pas encore relus.** Ils ne sont pas lus par la voix.
- **Carnet de visite** (`src/carnet.ts`) : chaque fiche ouverte compte une œuvre vue. Le bouton « Carnet » de la barre de commandes montre le compte ; sa fenêtre détaille l'avancée par salle (l'étoile marque une salle terminée) et conduit à une salle. Un message salue une salle terminée, puis le musée entier. Le carnet est gardé dans le navigateur, sur l'appareil.

**Pack présentation**

- **Écran de chargement** : l'étoile du musée, écrite dans `index.html` pour s'afficher avant tout le reste. Sur l'accueil, une ligne montre l'arrivée des œuvres, puis s'efface.
- **Ouverture** : derrière l'accueil, le regard parcourt lentement la salle d'entrée, puis revient à sa direction de départ quand on entre. Immobile pour qui a demandé moins d'animations au système, et sur les appareils modestes.
- **Mode présentation** : un parcours se déroule seul. À chaque étape, la visite attend l'arrivée devant l'œuvre, lance son commentaire, marque une pause, puis passe à la suivante ; à la fin, l'interface revient. L'écran se vide (barre de commandes, mini-plan, aide) : il reste le musée et la fiche. Le premier geste du visiteur lui rend la main. Il se lance par le bouton « Présentation » de la liste des parcours, par le lien du bas de la fiche pendant un parcours, ou par l'adresse : `?presentation=essentiels` (l'identifiant du parcours) le lance dès l'entrée.
- **Ambiance sonore** (`src/ambiance.ts`) : l'eau de la fontaine du patio. Le son grandit quand on s'approche, vient du côté où se trouve la fontaine, s'étouffe depuis une autre salle, et baisse pendant un commentaire. Il ne démarre qu'au premier geste du visiteur. Un bouton de la barre de commandes le coupe, et le choix est retenu. Le son est un vrai enregistrement du domaine public (Wikimedia Commons, « Fountain in toulouse »), monté en boucle de 20 secondes : voir `public/sons/LISEZMOI.md`. **Claude ne peut pas l'écouter : son niveau et son agrément sont à juger par le porteur.**

Pour la réunion : ouvrir le musée, cliquer « Entrer », puis Parcours → « Présentation » sur « Les essentiels ». Ou ouvrir directement `http://localhost:5173/?presentation=essentiels` et cliquer « Entrer ».

### Outil d'administration : première version (novembre 2026)

Demande du porteur : qu'un client crée son musée **sans toucher au code**, avant la salle des 120 ans, qui sera le premier musée créé avec l'outil.

**Ce que fait l'éditeur** (`http://localhost:5173/editeur.html`, pendant que `npm run dev` tourne) :

- **Créer un musée** : un nom, et un plan à choisir parmi quatre (une grande salle ; trois salles en enfilade ; une galerie et deux cabinets ; un atrium et quatre salles).
- **Déposer des photos** dans une salle : chaque photo devient une œuvre, **accrochée automatiquement**. Les œuvres sont réparties sur les murs, espacées régulièrement, loin des angles et des portes. Une salle pleine range le surplus en **réserve**.
- **Remplir le cartel** : titre, artiste, date, technique, commentaire, mention, lien, vraie taille en centimètres (la largeur suit les proportions de la photo), cadre.
- **Recadrer la photo** dans l'éditeur ; l'originale est gardée et l'on peut y revenir.
- **Déplacer une œuvre** : vers la gauche ou la droite sur son mur, sur un autre mur, dans une autre salle, en réserve.
- **Régler les salles** (nom, décor) et **le musée** (nom, couleur, style d'architecture, ajout de l'anglais).
- **Contrôler** : l'onglet « À compléter » dit en clair ce qui manque, œuvre par œuvre.
- **Voir le résultat** : le vrai musée s'affiche à côté et se recharge après chaque modification. « Voir dans le musée » place l'aperçu devant l'œuvre.
- Tout s'enregistre seul. « Annuler la dernière modification » revient en arrière (60 pas).
- **Supprimer un musée**, depuis la page d'accueil, après confirmation. Rien n'est effacé : le dossier part dans `musees-supprimes/<nom>-<date>/`, à la racine du projet, hors du site et hors de GitHub. On le récupère en le remettant dans `public/museums/`. La démonstration n'a pas de bouton « Supprimer », et le service refuse de la supprimer.

**Choix retenus, à confirmer par le porteur** (il n'a pas répondu aux trois questions posées, les valeurs proposées ont été prises) :

- L'éditeur est une page du navigateur, **sur ordinateur**, **sans compte** : il écrit dans le dossier du musée, sur l'ordinateur où tourne `npm run dev`. Il vise d'abord le porteur lui-même. Un client non technicien aura besoin d'une version hébergée avec comptes : c'est l'étape 3.
- **Le plan se choisit à la création.** Le dessin libre des salles viendra plus tard.
- **Les musées créés ne sont pas envoyés sur GitHub** (fichier `.gitignore`) : seul le musée de démonstration fait partie du dépôt. C'est la séparation convenue entre le moteur et le contenu de la banque. Conséquence : un musée créé n'existe que sur l'ordinateur ; il se sauvegarde en copiant son dossier.

**Comment c'est fait :**

- L'accrochage automatique (`src/engine/accrochage.ts`) est une règle rangée dans le moteur et appliquée par l'éditeur : une salle marquée `"autoHang": true` est raccrochée à chaque modification, et le mur et la position de chaque œuvre sont écrits dans `museum.json`. Le musée les lit ensuite comme ceux d'une salle réglée à la main. Les salles de la démonstration, placées à la main, ne sont pas touchées.
- Les œuvres sans mur sont gardées dans `"reserve"`, à la racine de `museum.json` : le musée ne les montre pas.
- L'écriture sur le disque passe par un petit service ajouté au serveur de développement (`scripts/editeur-serveur.mjs`). Il ne répond qu'à l'ordinateur lui-même et qu'à la page de l'éditeur, et n'écrit que dans `public/museums/`. Il n'existe pas dans la version publiée, pas plus que la page de l'éditeur.
- Les photos déposées sont converties en JPEG et en versions allégées. L'originale va dans `images/sources/`.
- L'aperçu est le vrai musée, ouvert avec `?apercu` : pas d'écran d'accueil, position gardée d'un rechargement à l'autre. Pendant la saisie d'un texte, l'enregistrement est immédiat mais l'aperçu ne se recharge qu'une fois le champ quitté.

**Ce que l'éditeur ne fait pas encore** : ajouter une sculpture (modèle 3D), composer un parcours, poser des détails commentés, produire les voix en un clic, dessiner librement le plan, exporter un musée en un fichier, fonctionner sur téléphone. Tout cela reste possible dans `museum.json`.

**Vérifié** : 24 tests unitaires (accrochage, plans, modèle de l'éditeur, service d'écriture) et 7 tests dans un navigateur.

**Premier essai du porteur (17 novembre 2026)** : il a ouvert l'éditeur sur son Mac et créé un musée d'essai ; « le reste est OK ». Seul manque relevé : impossible de supprimer un musée. Ajouté le jour même.

### Cession du moteur : ce qui est établi

Le porteur veut pouvoir **offrir ou vendre le moteur personnalisable seul**, sans le musée de démonstration (17 novembre 2026).

- **Inventaire des licences** : `docs/licences.md`, produit par `npm run licences`. À relancer après l'ajout d'un outil, d'un son ou d'une œuvre.
- **Le moteur** ne livre au visiteur qu'un logiciel tiers, Three.js (licence MIT). Les treize outils de fabrication sont sous licences MIT ou Apache 2.0. Le son de la fontaine est du domaine public. Aucune police n'est embarquée ; les icônes sont dessinées dans le code.
- **Le musée de démonstration** ne fait pas partie du moteur. Sur ses 47 œuvres, 46 sont du domaine public ; seule la *Danseuse* de la Cour est réservée à un usage non commercial. Elle peut rester dans une démonstration, mais pas dans un musée vendu.
- **Titularité du code** : le porteur indique avoir développé le projet avec son abonnement Anthropic personnel (17 novembre 2026). C'est un indice en sa faveur, mais la propriété dépend aussi du temps (hors heures de travail), du matériel (personnel), de la mission (initiative personnelle ou demande de l'employeur) et de son contrat de travail : à faire confirmer par un juriste. Précautions convenues : garder les factures et l'historique du dépôt, dire dès la présentation que le projet est personnel, et **construire le contenu de la banque dans un musée séparé** (`public/museums/attijariwafa/`), jamais dans le moteur.
- **Autres points ouverts, pour un juriste** : la protection d'un code écrit avec l'aide d'une IA ; la forme de la cession (licence libre, licence d'utilisation, cession des droits) ; le nom du produit.
- **Blender et la lumière précalculée** (18 novembre 2026) : Blender est sous licence GPL. Il n'est pas livré avec le moteur, et les atlas de lumière qu'il produit appartiennent à qui les calcule. Un seul fichier est concerné : `scripts/lumiere/calcul.py`, qui utilise l'interface de programmation de Blender et doit donc, s'il est distribué, l'être sous une licence compatible avec la GPL (la licence MIT l'est). Le reste du moteur ne lui parle que par des fichiers. Noté dans `docs/licences.md` ; à faire confirmer par le juriste avec les autres points.
- **Conditions de Google sur les voix** : non lues (le site n'est plus joignable depuis l'environnement de travail). Elles ne concernent pas le moteur, qui ne contient que la commande de production : chaque musée produit ses voix avec son propre compte.
- **Ce qui manque pour livrer le moteur seul** : retirer ou remplacer le musée de démonstration (l'éditeur sait maintenant créer un musée vide), et ajouter un fichier de licence à la racine du dépôt. L'outil d'administration existe en première version.

## 4. En attente du porteur du projet

- **Son avis sur le rendu premium des six salles** : la chaleur convient-elle (réglage `--chaleur`, salle par salle) ? faisceaux plus ou moins marqués ? tache de soleil plus ou moins forte ? Puis sa décision : faire de cette version la nouvelle branche principale, ou continuer la version 2 d'abord.

- **Son choix sur le glissement de la vue pendant un déplacement en douceur** (vers une œuvre ou vers un point du sol) : l'arrêter, comme aujourd'hui (retenu par défaut), ou seulement tourner le regard, le visiteur allant au bout de son déplacement. Voir « Déplacement en douceur interrompu ».
- **Son avis sur l'éditeur à l'usage** : dépôt de photos, accrochage automatique, fiches. Et ses réponses aux trois questions restées ouvertes : la date de la présentation, qui utilisera l'outil, et si un éditeur sur ordinateur, sans compte, lui convient pour commencer.
- **Où ranger le musée de la banque** : les musées créés ne partent pas sur GitHub. S'il est construit dans le cloud par Claude, il faudra un dépôt privé séparé ou un autre moyen de le lui remettre.
- **Son avis sur le lot « autour de l'œuvre » et le pack présentation**, sa relecture des textes des détails commentés, et son écoute du son de la fontaine (niveau, agrément).
- **Ses photos pour la salle des 120 ans du Groupe Attijariwafa bank** : œuvres bien de face, cartel de chaque œuvre (titre, artiste, date, technique, dimensions), 8 à 12 œuvres, quelques vues du lieu. À déposer dans un dossier Google Drive. Claude ne rédigera les textes qu'à partir des cartels et de ses indications ; les œuvres d'artistes récents demanderont l'accord de la Fondation avant toute diffusion publique.

- **Son avis sur le Patio marocain enrichi** : couleurs du zellige, choix des pièces, présentation des objets en volume.

- **Son avis sur les quatre nouvelles sculptures de la Cour**, et un compte Sketchfab gratuit, pour intégrer les sculptures de la sélection d'origine : le porteur le créera à un prochain jalon. Sa clé d'accès se saisira dans un formulaire sécurisé.
- **Son écoute de l'audioguide dans la visite** (voix B), en particulier la prononciation des noms propres.
- **L'essai de la marche au joystick sur un vrai casque**, sans lequel la correction « Casque : le joystick répond toujours, et amène au ras des obstacles » n'est pas terminée. Il faut un casque et une adresse en HTTPS : soit l'hébergement sur Vercel, qui demande son accord, soit, sans hébergement, le musée servi en HTTPS par son Mac sur son Wi-Fi (à préparer s'il le préfère). À essayer, dans l'ordre :
  1. Entrer en casque : se retrouve-t-on là où l'on était à l'écran ?
  2. Avancer au joystick jusqu'à un mur : l'arrêt est-il net, sans à-coups, et la vue reste-t-elle confortable à 45 cm du mur ?
  3. Longer ce mur à gauche puis à droite, en regardant les œuvres : le déplacement est-il fluide ?
  4. Se pencher vers une œuvre, puis pousser le joystick à gauche, à droite, en arrière : il doit répondre. Vers le mur : on ne doit pas avancer.
  5. Longer un mur percé d'une porte, tout près du mur : est-on retenu au bord de la porte (voir « Limites connues ») ?
  6. Pivoter (joystick droit) au ras d'un mur, puis le longer.
  7. Se pencher au-dessus d'un socle ou d'un banc, puis tourner autour au joystick.
  8. Viser le sol et se téléporter, la tête penchée au-delà d'un mur.
  9. Quitter le casque la tête penchée au-delà d'un mur, puis repartir au clavier.
- **Des essais sur de vrais appareils** : téléphone (de préférence ancien), casque VR, lecteur d'écran (VoiceOver, TalkBack), voix de l'audioguide. Le casque exige une adresse HTTPS, donc l'hébergement.
- **L'hébergement** : créer un compte Vercel et y relier le dépôt GitHub, le moment venu.

## 5. Limites connues

- L'agrandissement en haute définition n'existe que dans la visite 3D, pas dans la vue simplifiée ni en casque.
- L'arabe (écriture de droite à gauche) n'est pas encore géré par l'interface.
- Dans le casque VR, ni les parcours ni le plan ne sont disponibles.
- La VR n'a été testée qu'en émulation (casque Meta Quest 3 émulé).
- La voix de synthèse n'est pas garantie sur les navigateurs de casque : sans elle, le bouton d'écoute ne s'affiche pas.
- En casque, la marche au joystick (le point d'appui et l'arrêt au ras, voir « Casque : le joystick répond toujours, et amène au ras des obstacles ») n'a été vérifiée qu'en casque émulé. L'émulateur tient le casque immobile : les mouvements naturels de la tête ont été simulés, pas observés. **À confirmer sur un vrai casque.**
- En longeant un mur, le visiteur peut être retenu au bord d'une porte. Le passage d'une porte est plus étroit qu'elle, de 30 cm de chaque côté. Un visiteur engagé de quelques centimètres dans ce passage est arrêté par son bord s'il pousse le long du mur ; il repart en s'écartant un peu du mur. C'est la règle de marche de tous les appareils, mais en casque la tête passe la limite sans que le visiteur le veuille, et son point d'appui s'engage alors dans le passage. Par le calcul, pour un visiteur venu au mur puis qui le longe, la tête oscillant de 2 cm : joystick poussé exactement le long du mur, il est retenu puis repart dans 149 passages sur 200, et reste bloqué plus de 6 secondes dans 5 ; joystick imprécis de 5°, il reste bloqué plus de 6 secondes dans 67 passages sur 200. La marge de 5 cm ne l'évitait pas (63 passages bloqués sur 200 dans le même calcul). Non corrigé : à observer sur un vrai casque, puis à traiter, par exemple en laissant le point d'appui contourner le bord du passage.
- Hors déplacement en douceur, deux chemins pourraient encore mener le visiteur à un endroit non praticable, d'où il ne sortirait plus à pied (il lui resterait le plan, un parcours ou un clic sur une œuvre). Relevés le 17 novembre 2026, non corrigés. (1) Un banc, un socle ou une fontaine posé sur un point d'arrivée (départ, entrée d'une salle depuis le plan) : le contrôle de la configuration ne le signale pas. (2) Le modèle 3D d'une sculpture large qui finit de charger pendant que le visiteur se tient contre son socle : la zone réservée passe alors de 70 cm à 1,17 m de rayon au plus. Aucun des deux ne peut se produire dans le musée de démonstration tel qu'il est. Un troisième chemin relevé le même jour, retirer le casque la tête au-delà de la limite de marche, est corrigé par le point d'appui.
- L'éditeur ne s'utilise que sur ordinateur, sur la machine où tourne `npm run dev`, et il n'a pas encore été essayé sur un vrai Mac. Ses limites sont listées dans « Outil d'administration ».
- Pendant que l'aperçu de l'éditeur se recharge, l'éditeur peut marquer un temps d'arrêt sur un ordinateur sans carte graphique. `editeur.html?apercu=low` allège l'aperçu.

---

## 6. Organisation du code

Dépôt GitHub : `YoussefBENNANI7/musee-virtuel`, branche `main`.

```
public/museums/<musée>/     Un dossier par musée client
  museum.json               Toute la configuration du musée
  images/                   Images originales des œuvres (servent au futur zoom)
  images/web/               Versions allégées, produites par « npm run images »
  images/sources/           Photos d'origine déposées par l'éditeur (servent au recadrage)
  thumbs/                   Photos des sculptures pour la vue simplifiée (« npm run vignettes »)
  lumiere/                  Lumière précalculée : un atlas par salle calculée, et lumiere.json (« npm run lumiere »)

editeur.html                Page de l'éditeur de musée (absente de la version publiée)
src/editeur/main.ts         Éditeur : onglets Œuvres, Salles, Musée, Contrôle ; enregistrement, aperçu, recadrage
src/editeur/modele.ts       Éditeur : création d'un musée, ajout et déplacement des œuvres (sans écran, testé seul)
src/editeur/api.ts          Éditeur : échanges avec le service d'écriture
src/editeur/editeur.css     Styles de l'éditeur

src/main.ts                 Démarrage : chargement et contrôle de la configuration, choix de la vue
src/visit3d.ts              Visite 3D : fiches, parcours, plan, boucle de rendu
src/simple.ts               Vue simplifiée, sans 3D
src/vr.ts                   Visite en casque VR
src/audio.ts                Audioguide
src/zoom.ts                 Agrandissement d'une œuvre en haute définition
src/ui.ts                   Textes de l'interface (français, anglais)
src/style.css               Styles de l'interface
src/accueil.ts              Écran d'accueil de la visite 3D
src/inspect.ts              Examen d'une sculpture, seule et sous tous les angles
src/carnet.ts               Carnet de visite : œuvres vues, salle par salle
src/ambiance.ts             Ambiance sonore : l'eau des fontaines

src/engine/types.ts         Format de la configuration d'un musée
src/engine/validate.ts      Contrôle de la configuration, erreurs lisibles
src/engine/styles.ts        Styles d'architecture : contemporain (par défaut), classique
src/engine/decors.ts        Décors des salles : bibliothèque, réglages, décor demandé dans l'adresse
src/engine/quality.ts       Niveaux de qualité selon l'appareil
src/engine/layout.ts        Géométrie du plan : murs, portes, zones de marche (sans rendu, testée seule)
src/engine/lighting.ts      Calcul de l'éclairage des salles
src/engine/building.ts      Construction du bâtiment : sols, murs, plafonds, verrières
src/engine/artworks.ts      Accrochage des tableaux, pose des sculptures
src/engine/accrochage.ts    Accrochage automatique : répartition des œuvres sur les murs d'une salle
src/engine/plans.ts         Plans proposés à la création d'un musée
src/engine/world.ts         Assemblage du musée, règles de déplacement, points de vue
src/engine/lumiere.ts       Lumière précalculée : atlas de lumière de chaque salle, empreinte, export pour Blender
src/engine/marche.ts        Règle de marche : petits pas, arrêt au ras des obstacles, glissement le long des murs, point d'appui du visiteur en casque (sans rendu, testée seule)
src/engine/...              Contrôles, plan, mobilier, sculptures, textures, reflets, images

scripts/images.mjs          Préparation des images d'un musée
scripts/modeles.mjs         Préparation des modèles 3D d'un musée
scripts/vignettes.mjs       Photos des sculptures pour la vue simplifiée
scripts/lumiere.mjs         Lumière précalculée des salles (« npm run lumiere »), calcul par Blender dans scripts/lumiere/
scripts/editeur-serveur.mjs Service d'écriture de l'éditeur, ajouté au serveur de développement
tests/unit/                 Tests unitaires (Vitest) : 203 tests
tests/e2e/                  Tests dans un navigateur (Playwright) : 87 tests
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
| `?presentation=essentiels` | Lance ce parcours en mode présentation dès l'entrée : il se déroule seul, avec la voix |
| `?debug` | Affiche le détail des erreurs de configuration, même dans la version publiée |
| `?lumiere=0` | Montre le musée sans sa lumière précalculée (éclairage par formule), pour comparer |

### Configurer un musée (`museum.json`)

- **Repère** : le nord est vers les `z` négatifs. Une position s'écrit `[x, z]` en mètres ; une taille de salle `[largeur, hauteur, profondeur]`.
- **Salles** : nom, position, taille, décor (facultatif), plafond plat, verrière (`{"type": "skylight", "margin": 1.8}`) ou plafond flottant (`{"type": "cove"}`), bancs.
- **Décor d'une salle** : le nom d'un décor de la bibliothèque (`"decor": "terre-cuite"` ; décors disponibles : `pierre-claire`, `argile-claire`, `terre-cuite`, `riad`, `nuit`), ou ce décor corrigé réglage par réglage (`"decor": {"preset": "terre-cuite", "colors": {"wall": "#8e3f2c"}, "light": {"level": 0.9}}`). Réglages possibles : couleurs (`colors` : mur, sol, plafond, cadres, socles, bois, finitions, rails), sol (`floor` : `concrete`, `parquet`, `chevron`, `stone`, `zellige`), soubassement de zellige (`dado`) et frise de plâtre (`frieze`), en mètres, plafond de cèdre peint (`cedar`), murs (`walls` : `paint`, `limewash`), brillance du sol (`gloss`), plafond, cadre, lumière (`light` : niveau, teinte, force des projecteurs), cartels (`labels`). Les anciens réglages `wall` (couleur des murs) et `light` (niveau d'éclairage) de la salle restent acceptés.
- **Portes** : déclarées une seule fois, sur le mur d'une salle (`room`, `wall`, `offset`, `width`, hauteur facultative). L'ouverture dans la salle voisine est déduite.
- **Tableaux** : mur, décalage le long du mur (positif vers la droite quand on fait face au mur), largeur et hauteur en mètres, image (`{"src": "images/nom.webp"}`), titre, artiste, date, technique, texte. Facultatifs : cadre doré (`"frame": "gilt"`), passe-partout (`"mat": 0.12`, en mètres), mention du musée d'origine (`credit`, par langue), lien vers la notice (`link`), enregistrement audio. L'artiste et la date s'écrivent une fois, ou par langue (`{"fr": "vers 1830", "en": "c. 1830"}`).
- **Sculptures** : position dans la salle, hauteur, hauteur du socle, et soit un modèle 3D numérisé (`"model": {"src": "models/nom.glb"}`, à préparer avec `npm run modeles`), soit une forme dessinée par le moteur avec son matériau (bronze, marbre, bronze patiné, bois laqué).
- **Parcours** : nom, description et liste ordonnée des œuvres.
- **Accrochage automatique** : `"autoHang": true` sur une salle. L'éditeur répartit alors lui-même ses tableaux sur les murs : il recalcule le mur et la position écrits dans chaque œuvre à chaque modification. Sans l'éditeur, ce réglage ne change rien.
- **Réserve** : `"reserve": [...]` à la racine, les œuvres gardées sans être accrochées.
- **Contrôle** : à l'ouverture, la configuration est vérifiée (porte qui ne mène nulle part, tableau en travers d'une porte, salle inaccessible, décor inconnu, traduction manquante, etc.).

## 7. Commandes

```bash
npm install                       # une seule fois, puis après chaque mise à jour des dépendances
npm run dev                       # lance le musée sur http://localhost:5173/
                                  # et l'éditeur sur http://localhost:5173/editeur.html
npm run check                     # contrôle du code et tests unitaires
npm run test:e2e                  # tests dans un navigateur (environ 3 minutes)
npm run build                     # version publiable, dans dist/
npm run images -- demo --attach   # associe et prépare les images déposées dans images/
npm run modeles -- demo           # prépare les modèles 3D déposés dans models/
npm run vignettes -- demo         # photographie les sculptures (le musée doit tourner)
npm run lumiere -- demo           # calcule la lumière des salles modifiées, avec Blender (docs/lumiere.md)
```

## 8. Méthode de travail retenue

- **Tout en français** : interface, commentaires du code, messages de commit, documentation. Les textes du musée existent en français et en anglais.
- **Le porteur du projet n'est pas développeur** : commandes exactes à copier, explications simples, sur Mac.
- **Avant et après chaque modification du moteur** : les tests doivent passer, puis le rendu est vérifié par des captures sur ordinateur et sur téléphone.
- **Tests dans un navigateur** : attendre une condition que le moteur expose (par exemple `controls.gliding`, vrai tant qu'un déplacement en douceur est en cours), jamais un délai fixe ni « deux positions identiques de suite ». Le rendu des tests est calculé par le processeur : une image prend 100 ms ou plus, et sous charge celle qui suit un clic peut tarder, si bien que deux relevés rapprochés sont identiques avant même que le visiteur ait bougé. Pour savoir où un obstacle arrête le visiteur, l'aide `walkUntilBlocked` fait elle-même avancer le temps, à grands pas, au lieu d'attendre les images ; elle vérifie ensuite que de tout petits pas ne déplacent plus le visiteur, ce qui prouve à chaque appel qu'il s'est arrêté au ras de l'obstacle. Pour qu'un vrai geste (souris, clavier, doigt) arrive à un instant précis d'un déplacement en douceur, l'aide `holdClock` tient l'horloge de la visite : le visiteur ne bouge plus que lorsque le test fait avancer le temps.
- **Tests en casque émulé** : l'émulateur tient le casque parfaitement immobile, et les images lentes du navigateur des tests font faire au joystick des pas de 18 cm. Ni l'un ni l'autre ne ressemble à un vrai casque, où la tête bouge sans cesse et où un pas fait 2 cm : le défaut du joystick sans effet y échappait. Les tests font donc avancer le temps eux-mêmes, à 90 images par seconde (`__museum.vrUpdate(dt)`), et déplacent la tête eux-mêmes : par `xrDevice.position` pour un vrai mouvement, pris en compte à l'image suivante, ou, image par image, par la position de la caméra dans son `rig`. `__museum.vrSupport()` donne le point d'appui du visiteur.
- **Un aperçu à la fin de chaque lot**, et pas de lot touchant à l'identité visuelle sans l'avis du porteur.
- **Œuvres** : Claude cherche de vraies œuvres en accès libre et vérifie la licence de chacune à la source ; le porteur valide la sélection avant toute intégration.
- **Accès aux collections des musées** : les sessions dans le cloud passent par l'environnement « musee-virtuel », qui autorise les sites du Metropolitan Museum, de l'Art Institute of Chicago, du musée de Cleveland, de Wikimedia Commons, de la Smithsonian et de Sketchfab.

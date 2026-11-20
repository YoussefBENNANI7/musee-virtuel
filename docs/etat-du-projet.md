# Musée virtuel personnalisable : état du projet

Mis à jour le 19 novembre 2026. Ce document permet de reprendre le projet dans une nouvelle conversation sans rien perdre : vision, décisions prises, avancement, points en attente et organisation du code.

---

## 1. Le projet

Une plateforme de visites virtuelles en 3D, en marque blanche, vendue à des musées, en priorité de petits musées peu connus. Le porteur du projet configure lui-même chaque musée pour son client (salles, œuvres, textes, couleurs), puis le lui commercialise.

La visite est **gratuite pour le public**, dans une logique d'inclusion : démocratiser l'accès à l'art.

Le musée de démonstration sert d'abord à une **présentation interne** : le porteur le montre à sa hiérarchie pour proposer des musées virtuels gratuits et inclusifs. Il doit donc être aussi réaliste que possible, avec de **vraies œuvres** (décision du 15 novembre 2026, qui remplace l'ancienne règle des œuvres fictives).

### Versions

- **Version 1** (18 novembre 2026) : la branche `main`, commit `5aeaa69`, et l'étiquette `v1`, créée par le porteur sur GitHub le même jour (l'environnement de travail de Claude ne peut pas publier d'étiquette). Elle réunit le travail de toutes les conversations jusqu'au 17 novembre 2026 (moteur, éditeur, musée de démonstration à six salles, voix de l'audioguide), plus la correction « Déplacement en douceur interrompu ». Pour la retrouver telle quelle : `git checkout v1`.
- **Les musées créés avec l'éditeur ne sont pas dans GitHub** (voir « Outil d'administration ») : la salle des 120 ans (`120-ans`) et le musée d'essai (`musee-test`) n'existent que sur le Mac du porteur. Leur sauvegarde de la version 1 est le dossier `musees-sauvegarde-v1`, sur son Bureau (copie de `public/museums/`, faite le 18 novembre 2026). À garder aussi hors du Mac (clé USB ou iCloud Drive).
- **Version 2** (19 novembre 2026) : la branche `main`, commit `9c7d298`, et l'étiquette `v2`, créée par le porteur sur GitHub le même jour (comme pour la `v1`). Rendu premium du même moteur, toujours dans le navigateur. Choix du porteur, le 18 novembre 2026, plutôt qu'une version sous Unreal Engine, dont les limites lui ont été présentées : pas de visite par simple lien, ni dans le navigateur du téléphone, coût de diffusion par visiteur, accessibilité à refaire, et travail surtout manuel dans l'éditeur d'Unreal. Elle contient, en plus de la version 1 : la lumière précalculée des salles (Blender), le moteur de l'exposition des 120 ans (rotonde, vitrines, comptoirs, page de choix des musées), le mode administrateur (accès depuis la page des musées, couverture, alerte et recalcul de la lumière, démonstration protégée), la présentation de salle qui accompagne le visiteur, et les cadres en relief choisis par le porteur. Vérifiée avant l'enregistrement : 222 tests unitaires et 98 tests dans un navigateur. Pour la retrouver telle quelle : `git checkout v2`.
- **Sauvegarde des musées pour la version 2** : le dossier `musees-sauvegarde-v2` sur le Bureau du porteur (commande donnée le 19 novembre 2026, à confirmer), et une copie du musée des 120 ans sur son Drive, dans le dossier « Musee-120-ans » (19 novembre 2026).
- **La suite se fait sur la branche de travail** `claude/optimistic-davinci-kqpqmj` : `main` ne bouge plus jusqu'à la prochaine version.

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

Travail fait sur la branche `claude/optimistic-davinci-kqpqmj`, puis versé dans `main` avec la Version 2, le 19 novembre 2026, une fois validé par le porteur. Détail, réglages et installation : `docs/lumiere.md`. Aperçu, avec chaque salle avant et après, sur ordinateur et sur téléphone : https://claude.ai/artifact/QntvVcbKckY9qSDbpcNizX.

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
- **Musées créés avec l'éditeur** : ils restent sur l'ordinateur du porteur, leur lumière s'y calcule donc aussi. `npm run lumiere:installer` y installe ce qu'il faut, une fois (Python 3.13, Blender comme module Python, navigateur de calcul), hors du projet ; puis `npm run lumiere -- <dossier du musée>`. Vérifié dans l'environnement de travail sur des musées fabriqués comme le fait l'éditeur : les quatre plans proposés, douze salles, se calculent sans erreur (essai rapide à 16 échantillons, puis contrôle à l'œil). **Le calcul n'a pas encore tourné sur un Mac** : le musée des 120 ans sera le premier essai, guidé pas à pas le 18 novembre 2026. La commande essaie plusieurs façons d'ouvrir la 3D dans le navigateur sans fenêtre, et affiche un message à recopier en cas d'échec.
- **Limites** : les objets (cadres, bancs, socles, sculptures, fontaine) et les embrasures des portes gardent leur éclairage d'avant ; le calcul se fait sur le processeur (la carte graphique du Mac irait plus vite) ; un musée créé avec l'éditeur se calcule sur le Mac du porteur.
- **Fait depuis** : l'éditeur signale une salle à recalculer et lance le calcul lui-même (voir « Mode administrateur »).
- **Suite possible** : les autres améliorations de la version 2 (finitions de l'image sur ordinateur, vrais reflets, matières plus riches, objets éclairés par la lumière calculée).

### Moteur de l'exposition « 120 ans », réuni à la version 2 (18 novembre 2026)

Le porteur a construit l'exposition des 120 ans dans une autre conversation, sur son Mac, les 17 et 18 novembre 2026. Ce travail est resté dans sa branche locale `claude/laughing-galileo-0mch8q` (8 étapes) : il n'a jamais été envoyé sur GitHub, faute de connexion du Mac à son compte GitHub. **La version 1 (`v1`, `main`) ne le contient donc pas**, alors que c'était la dernière version que le porteur voyait.

**Le dépôt GitHub est public.** Seul le code du moteur a été repris, réuni en une étape (`ba2a705`), transmis sous forme de correctif par le Drive du porteur. Restent sur le Mac seulement, dans sa branche locale et dans `public/museums/120-ans/` : le musée lui-même (photos, cartels, textes, voix, liste `museums/index.json`), les notes détaillées de cette conversation, et le script qui fabrique l'un des objets de l'exposition.

Ce que le moteur sait faire en plus (le détail des réglages est dans `src/engine/types.ts`) :

- **Salle en rotonde** (`rotunda`) : mur courbe à coffres, coupole ajourée, porte de chambre forte franchissable, œuvres dans des niches du mur courbe.
- **Vitrines à pièces de monnaie** (`vitrines`) ; une pièce est une sculpture dont le modèle est une face photographiée et un métal.
- **Comptoirs à guichets** le long des murs (`counters`) et **grappe de cubes suspendus** portant des photos (`cubes`).
- **Trois décors** : `nef`, `guichets`, `chambre-forte`.
- **Audioguide** : texte écrit pour être dit (`narration`), présentation de salle (`intro`), témoignage enregistré (`testimony`).
- **Page de choix des musées** quand l'adresse n'en désigne aucun, d'après `museums/index.json` ; sans cette liste, le musée de démonstration s'ouvre, comme avant.
- La clé du service de voix peut venir d'un fichier `.env`, ignoré par git. Éditeur : confirmations dans la page.

**Pourquoi le musée avait disparu du dossier du projet** : dans la branche locale, `.gitignore` faisait suivre le musée des 120 ans par git. En passant à la version 2, git l'a donc retiré du dossier. Il a été remis depuis la copie du Bureau (`musees-sauvegarde-v1`). `.gitignore` ne fait plus suivre aucun musée client.

**Lumière précalculée et nouveautés** : dans une rotonde, seul le sol lit l'atlas ; le mur courbe et la coupole gardent leur éclairage, et les œuvres du mur courbe leur halo peint. L'ambiance du calcul vient de sous la coupole. Comptoirs, cubes et vitrines font de l'ombre au sol. Vérifié sur un musée d'essai neutre (galerie `nef` avec cubes, rotonde `chambre-forte` avec vitrines et billets, hall `guichets` sous verrière) ; le vrai musée n'existe que sur le Mac du porteur.

### Mode administrateur : accès depuis la page des musées, couverture, lumière, démonstration protégée (18 novembre 2026)

Demande du porteur, après avoir éteint par erreur la lumière de l'Atrium dans l'éditeur (décor « nuit ») : accéder à l'éditeur depuis la page qui présente les deux musées côte à côte, et éviter ce genre d'accident. Lot accepté tel que proposé. Aperçu en images, sur ordinateur et sur téléphone : https://claude.ai/artifact/Fh6dPTPTQkgKqx18phRXhV.

- **Bouton « Mode administrateur »** en haut à droite de la page de choix des musées. Il n'existe que sur l'ordinateur qui fait tourner `npm run dev`, jamais dans la version publiée (l'éditeur n'y fonctionnerait pas). Dans l'éditeur, le lien **« ← Page des musées »** y ramène.
- **Page de choix tenue par l'éditeur** : dans l'onglet Musée, section « Page de choix des musées » : la case « Proposer ce musée sur la page de choix », une présentation courte (une par langue) et la **photo de couverture**, prise dans l'aperçu (« Prendre la vue de l'aperçu » : on se place dans le musée, là où il est le plus beau) ou choisie parmi ses photos. La couverture est rangée dans le dossier du musée (`couverture-….webp`, 1600 × 1000, le format des cartes). Tout s'écrit dans `public/museums/index.json`, toujours propre à chaque ordinateur et hors de GitHub. Un musée retiré de la page y reste marqué `"hidden": true` : sa présentation est retrouvée s'il revient. Quand la liste n'existe pas encore, l'éditeur y inscrit aussi la démonstration, puisque la page n'apparaît qu'à partir de deux musées. Un musée renommé garde le même nom sur la page. Une liste rendue illisible par une modification à la main n'est jamais remplacée : l'éditeur le dit. L'accueil de l'éditeur signale les musées présents sur la page (« Sur la page de choix »).
- **Couverture du Musée des Horizons** : une vue de l'Atrium avec sa lumière calculée (soleil de la verrière, statue, Salle des Horizons et Galerie des Lignes par les portes), `public/museums/demo/couverture.webp`. Au démarrage de `npm run dev`, la page de choix reprend la couverture que chaque musée a dans son dossier : sur le Mac du porteur, la carte de la démonstration la montre donc d'elle-même.
- **Alerte « Lumière à recalculer »** : l'aperçu de l'éditeur dit, salle par salle, si la lumière calculée correspond encore à la salle (même empreinte que dans la visite). Sinon, un bandeau au-dessus des onglets nomme les salles concernées, rappelle qu'elles sont éclairées plus simplement en attendant, et propose **« Recalculer la lumière »**. L'onglet Musée a une section « Lumière précalculée » : état de chaque salle, bouton « Calculer la lumière » pour un musée jamais calculé.
- **Calcul lancé depuis l'éditeur** : le bouton lance `npm run lumiere -- <musée>` sur l'ordinateur, par le service de l'éditeur ; seules les salles modifiées sont recalculées. Le bandeau suit le calcul (« Salle « Atrium » (1 sur 2), depuis 3 min ») ; on peut continuer à travailler. À la fin, l'aperçu se recharge avec la nouvelle lumière et le bandeau en garde le compte rendu jusqu'à ce qu'on le ferme. En cas d'échec, il montre les dernières lignes du calcul, à recopier à Claude. Sans Blender, l'éditeur donne la commande d'installation (`npm run lumiere:installer`). Un seul calcul à la fois ; il s'arrête si l'on ferme `npm run dev`. Un enregistrement de l'éditeur ne fait plus oublier la lumière déclarée entre-temps par le calcul.
- **Démonstration protégée** : un badge « Démonstration protégée » dans l'en-tête. À la première modification (ou au premier dépôt, recadrage, changement de couverture, calcul de lumière), l'éditeur demande « Modifier « Musée des Horizons » ? ». « Annuler » remet le musée comme avant et n'écrit rien ; « Modifier quand même » vaut jusqu'à la fermeture de la page. L'onglet Musée de la démonstration a un bouton **« Rétablir la démonstration d'origine »** (après confirmation) : il remet ses fichiers tels qu'ils sont dans le projet (`git checkout`), salles, œuvres, décors et lumière compris.
- **Aperçu de l'éditeur** : il n'affiche plus le lien vers la page des musées, qui ferait quitter le musée en cours de modification.
- **Vérifié** : 8 tests unitaires de plus (page de choix, couverture, calcul lancé et suivi, deux calculs refusés, absence de Blender, lumière gardée à l'enregistrement, rétablissement par git) et 5 tests dans un navigateur de plus (aller-retour entre la page des musées et l'éditeur, page de choix tenue par l'éditeur, démonstration protégée, alerte et suivi du calcul, prise de vue pour la couverture) ; le test de la page de choix vérifie aussi que le bouton « Mode administrateur » est absent de la version publiée. Un vrai calcul a été lancé depuis l'éditeur dans l'environnement de travail, sur un musée d'essai d'une salle : 2 minutes, l'alerte s'efface une fois la lumière recalculée. Captures sur ordinateur et sur téléphone.

### La présentation de la salle accompagne le visiteur (19 novembre 2026)

Demande du porteur : pouvoir se déplacer après avoir cliqué sur « Écouter la présentation de la salle ».

- **Le défaut** : après un clic sur un bouton de la visite (présentation de la salle, mais aussi Plan, Parcours, Carnet une fois refermés), le clavier restait « accroché » au bouton et les flèches ne déplaçaient plus le visiteur, jusqu'à un clic dans le musée. Et ouvrir ou refermer la fiche d'une œuvre coupait la présentation.
- **La règle, désormais** : les touches de marche sont ignorées seulement dans un champ de saisie ou une fenêtre (fiche, plan, parcours, carnet, agrandissement). Sur un bouton, elles déplacent le visiteur : aucune touche de marche n'actionne un bouton (`src/engine/controls.ts`).
- **La présentation d'une salle continue** quand on marche, quand on ouvre ou referme une fiche, quand on change de salle. Elle s'arrête quand elle est finie, quand on clique sur « Arrêter la lecture », ou quand une autre voix commence (commentaire d'une œuvre, témoignage, présentation d'une autre salle) : jamais deux voix à la fois. Tant qu'elle se lit, son bouton reste affiché, même dans une salle qui n'a pas de présentation, pour pouvoir l'arrêter.
- Choix pris par défaut, le porteur n'ayant pas tranché : la présentation continue quand on ouvre une œuvre.
- **Vérifié** : un test dans un navigateur (marche au clavier après le clic, fiche ouverte puis refermée, salle sans présentation, une seule voix à la fois), qui échouait avant la correction. Captures sur ordinateur et sur téléphone.
- En passant : dans l'éditeur, la photo de couverture qui vient d'être enregistrée est redemandée si elle n'arrive pas (le serveur de développement met parfois un instant à voir un fichier tout juste écrit ; un test du lot précédent échouait pour cela une fois sur plusieurs).

### Cadres en relief : choisis et appliqués (19 novembre 2026)

Demande du porteur : améliorer la qualité graphique des cadres, dans les deux musées. Planche qui lui a été présentée, sur ordinateur et sur téléphone : https://claude.ai/artifact/PzzVFq6FEDzb3bnzU9sKgm. Résultat dans les six salles : https://claude.ai/artifact/7SJcd29LNhVfdLrj31EBuB.

- **Le défaut d'avant** : un cadre était une boîte plate d'une couleur unie, l'œuvre collée sur sa face. Le cadre doré avait trois marches, sans matière ; le passe-partout était deux rectangles sans épaisseur ; le vide de la caisse américaine était dessiné. Ce système a été retiré.
- **Désormais** (`src/engine/cadres.ts`) : un cadre est une moulure, c'est-à-dire une coupe (son profil vu en tranche) promenée autour de l'œuvre, avec des angles coupés d'onglet. L'œuvre est en retrait, au fond de la feuillure. Les matières prennent la lumière de la salle (or bruni, or ancien, laiton, aluminium, bois avec son fil, laque, peinture satinée) ; les creux d'une moulure sont assombris, là où la lumière entre moins. Le passe-partout est un vrai carton, à la fenêtre biseautée, sur lequel le cadre porte une ombre douce ; sans passe-partout, c'est sur le haut de la toile que le cadre porte son ombre. La caisse américaine a un vrai vide, et la toile y montre son chant. Un grand tableau porte une moulure plus large (jusqu'à 1,6 fois au-delà de 3 m).
- **Dix modèles** : pour les tableaux, `dore-classique`, `dore-ancien`, `noir-filet-or` ; des baguettes pour les œuvres sous passe-partout, les photographies et les documents, `baguette-noire`, `baguette-chene`, `baguette-noyer`, `baguette-laiton`, `baguette-aluminium` ; pour les toiles modernes, `caisse-noire`, `caisse-chene`.
- **Le choix du porteur** : tableaux A (doré classique), estampes D (baguette noire), toiles modernes G (caisse américaine noire), musée des 120 ans F (baguette de laiton). Il se traduit ainsi :

| Œuvre | Cadre |
|---|---|
| Marquée `"frame": "gilt"` (les 26 tableaux dorés de la démonstration) | `dore-classique` |
| Sous passe-partout (`mat`), dans une salle sans réglage particulier | `baguette-noire` |
| Encadrée telle quelle, dans une salle sans réglage particulier | `caisse-noire` |
| Dans une salle aux décors `nef`, `guichets` ou `chambre-forte` (l'exposition des 120 ans), avec ou sans passe-partout | `baguette-laiton` |
| Dans un musée de style `classic`, sans décor | `baguette-noyer` |

- **Où cela se règle** : chaque œuvre peut nommer son cadre (`"frame": "noir-filet-or"`, ou le menu « Cadre » de sa fiche dans l'éditeur, qui liste les dix modèles) ; sinon elle prend celui de sa salle, que donne son décor (`frames: { plain, mat }` : œuvre encadrée telle quelle, œuvre sous passe-partout), sinon le style du musée. Une salle peut choisir les siens : `"decor": { "preset": "riad", "frames": { "mat": "baguette-noyer" } }`. Les anciens réglages de cadre d'un décor (`frame`, couleur `frame`) n'ont plus d'effet ; un fichier qui les contient s'ouvre toujours.
- **Essayer d'autres cadres sans rien modifier** : `?cadres=tableau:dore-ancien,papier:baguette-chene,caisse:caisse-chene` dans l'adresse. Les trois familles : `tableau` (œuvres marquées `gilt`), `papier` (œuvres sous passe-partout), `caisse` (les autres œuvres encadrées). Un modèle peut servir à n'importe quelle famille.
- **Place prise sur le mur** : elle est comptée d'après le modèle (`frameMargin`), pour l'accrochage automatique et le contrôle de la configuration. Les baguettes et la caisse sont plus fines que les anciens cadres, ou égales : aucun musée existant ne peut devenir invalide pour cela. Seul le doré classique s'élargit, pour les tableaux de plus d'un mètre ; la démonstration reste sans erreur ni avertissement.
- **Lumière précalculée** : l'ombre des cadres sur le mur change, donc l'empreinte de toutes les salles aussi. Les six salles de la démonstration ont été recalculées. **Sur le Mac du porteur, le musée des 120 ans affichera « Lumière à recalculer » dans l'éditeur : un clic sur « Recalculer la lumière » suffit** (ou `npm run lumiere -- 120-ans`).
- Les panneaux et totems sans cadre des 120 ans ne sont pas concernés. Le Patio marocain a reçu la baguette noire comme la Galerie des Lignes ; une baguette de noyer s'y accorderait aussi (`"frames": { "mat": "baguette-noyer" }`), à voir avec le porteur.
- **Vérifié** : 9 tests unitaires (géométrie de la moulure, onglets, faces et normales, arêtes vives et courbes lisses, creux, largeur selon la taille, cadre de chaque œuvre, place prise sur le mur, cohérence des dix modèles) et 3 tests dans un navigateur (cadre de chaque œuvre et réglages de salle ; `?cadres=` ; modèle inconnu ignoré). Captures des six salles sur ordinateur et sur téléphone.

### Jalon en cours : images et objets de l'exposition des 120 ans (essais faits le 19 novembre 2026 : six pièces, puis deux objets en 3D)

Demandes du porteur, le 19 novembre 2026 : (1) fiabiliser chaque pièce de monnaie et chaque billet de l'exposition par une recherche (Bank Al-Maghrib, catalogues numismatiques) ; (2) améliorer la qualité d'image de toutes les œuvres exposées, 80 environ, dont 54 monnaies et billets ; (3) ouvrir davantage les pages du livre, comme sur ses photos d'origine. Il a aussi évoqué des objets à modéliser en 3D, à préciser.

- **Sa méthode, retenue** : partir de ses photos ; chercher des images de référence pour identifier chaque pièce ; puis décider, pièce par pièce, si sa photo suffit après nettoyage, si une meilleure image réelle existe et peut être utilisée, ou s'il faut la régénérer par IA en haute définition à partir de sa photo et de la référence. Il préfère l'IA à un simple nettoyage (Claude avait d'abord déconseillé toute génération).
- **Garde-fous annoncés au porteur** : (a) « à l'identique » n'est pas garanti par une IA, qui redessine : chaque image régénérée est comparée à la référence et validée par lui sur une planche avant/après, sinon refaite ou écartée ; (b) par défaut, ni portrait ni armoiries redessinés par l'IA (effigie d'un roi, emblème) : pour ces pièces, partir d'une vraie image ; (c) billets ayant encore cours : vérifier les règles de reproduction de Bank Al-Maghrib et s'y tenir, pas de copie fidèle en très haute définition ; (d) conseillé : indiquer dans la fiche qu'une image a été agrandie ou reconstituée.

**Essai sur six pièces** (trois monnaies, trois billets), remis au porteur sur une planche avant/après avec, pour chaque pièce, sa fiche d'identification, le contrôle et une proposition. Rien n'a été modifié dans son musée. Ce que l'essai établit : le résultat dépend de l'image de départ, pas de l'IA.

| Situation | Résultat | Suite proposée |
|---|---|---|
| Vraie image nette de la pièce exposée (gros plan tiré du film de l'exposition, redressé) | La meilleure solution, sans IA ; convient à un billet à portrait | À intégrer |
| Vraie photo libre d'une pièce du même type, du même millésime et de la même face (Wikimedia Commons, CC0) | L'IA l'agrandit à 2048 px sans changer une lettre, contrôle fait à l'agrandissement | À intégrer, avec la mention « exemplaire du même type » |
| Pièce voisine de la même série comme modèle | Image nette et plausible, mais reconstitution ; l'IA a d'abord recopié la date du modèle, corrigée par une seconde demande ; ornements fidèles dans leur principe, pas au trait près | À valider par le porteur, avec la mention « image reconstituée » |
| Référence trouvée en ligne pour une pièce mal identifiée | Très belle image d'une autre monnaie : le film a montré que la pièce exposée n'a ni le même cadre ni le même nombre de lignes | Écartée ; identification à reprendre (poids, diamètre, inventaire) |
| Aucune référence | L'IA garde les grandes légendes et invente les petits textes, les numéros, les décors ; sur une photo très floue elle invente presque tout | À ne pas publier |

- **Ordre de préférence des sources**, à suivre pour les 54 pièces : image réelle de la pièce exposée ; photo libre d'un exemplaire du même type ; reconstitution contrôlée d'après une pièce voisine ; sinon, attendre une meilleure image de départ.
- **Contrôle obligatoire** de chaque image régénérée contre sa référence : dates et chiffres, légendes, ornements, face montrée. Les fautes relevées à l'essai : date recopiée du modèle, faux texte imitant l'écriture, légende ajoutée.
- **Sources du porteur** : les images actuelles des monnaies et des billets sont des recadrages de ses photos de vitrines entières, prises de loin et de biais ; repartir des photos d'origine n'apporte rien de plus. Son dossier de gros plans tirés du film de l'exposition (10 billets, 9 pièces) est la meilleure source : **première étape proposée, rapprocher ces gros plans des pièces du musée**. Les vidéos elles-mêmes (de 65 à 391 Mo) n'ont pas été ouvertes.
- **Proportions des billets** : photographiés à plat et de biais, puis recadrés, ils sont déformés (jusqu'à 45 % trop allongés). Une fois un billet identifié, lui rendre ses dimensions réelles dans `museum.json` (`width`, `height`), sans IA.
- **Textes des fiches** : la recherche a relevé des points à faire vérifier par la commissaire (atelier et année d'une frappe, attribution d'une monnaie, texte d'une fiche qui décrit un autre billet). Ils sont détaillés sur la planche ; aucun texte n'a été modifié.
- **IA d'image** : `gemini-3-pro-image` (Nano Banana Pro), par l'accès Gemini déjà branché. Appel `generateContent` avec `generationConfig: { responseModalities: ['IMAGE'], imageConfig: { imageSize: '1K' | '2K' | '4K', aspectRatio } }`, une ou plusieurs images de départ dans la demande. Définitions obtenues : 2048 × 2048 px en 2K (format 1:1), 3168 × 1344 px en 2K (format 21:9), 4096 × 4096 px en 4K. Une vingtaine de secondes par image. Le service répond parfois 503 (occupé) : réessayer. Une monnaie mesure 3 cm dans le musée : 1024 px suffisent, le 4K ne sert qu'aux grands billets.
- **Coût relevé** : 1120 jetons d'image par image en 2K, soit environ 0,13 $ au tarif public, et environ 0,24 $ en 4K (à vérifier sur la facture du porteur). L'essai entier : 9 images, un peu plus d'un dollar. Pour les 54 monnaies et billets, à deux ou trois essais par pièce : de 20 à 40 $.
- **Image de monnaie pour le moteur** : image carrée, la pièce au ras du cadre, transparente autour (le moteur la pose sur un disque de métal, `model.coin`). 1024 px de côté.
- **Réseau de l'environnement cloud** : `www.bkam.ma` et `en.numista.com` ont été ajoutés aux hôtes autorisés, avec l'accord du porteur. Numista refuse les robots : ne pas contourner. Wikimedia Commons limite fortement le débit (réponses 429) : demander les vignettes de 960 px, une requête à la fois, espacées d'une quinzaine de secondes ; les originaux passent rarement. Les sites de collectionneurs qui montrent les billets anciens ne sont pas accessibles.
- **Droits, constats de la recherche** (à faire confirmer par la banque avant toute diffusion publique) : Bank Al-Maghrib ne publie pas de règle chiffrée de reproduction de ses billets, mais réserve tous les droits sur les images de son site ; les billets de l'essai n'ont plus cours ; une image régénérée d'après une photo protégée en reste dépendante : ne prendre pour modèles que des images libres ou celles du porteur ; le droit d'utiliser les images du film est à confirmer par le porteur.
- **Fichiers** : tout l'essai est resté hors du dépôt (public). Le porteur a reçu la planche et une archive du dossier de l'essai (images proposées, fiches d'identification, consignes données à l'IA, petits programmes), à ranger dans son Drive, dans « Musee-120-ans » : c'est de là qu'une prochaine session les reprendra. Pour voir une image dans le moteur, on monte une copie de travail du musée dans `public/museums/120-ans` (ignoré par git), le temps des captures, puis on la retire.
- **Retour vers son Mac : les paquets de mise à jour** (`npm run maj`, `scripts/maj.mjs`, 19 novembre 2026). Le musée du porteur vit sur son Mac, hors du dépôt ; ce qui est préparé ici lui revient par un paquet : un dossier ou son archive `.zip`, avec un `maj.json` (musée visé, titre, fichiers à poser, retouches des œuvres) et les fichiers rangés comme dans le musée (`images/`, `models/`, `audio/`). Il le reçoit dans la conversation, puis lance `npm run maj -- 120-ans ~/Downloads/<paquet>.zip` (ajouter `--essai` pour voir sans rien écrire). La commande vérifie tout avant d'écrire (bon musée, œuvres connues, fichiers présents et déclarés, chemins sûrs, fichiers que les œuvres retouchées devront retrouver), copie l'état précédent dans `musees-sauvegardes/` (ignoré par git), pose les fichiers et ne retouche dans `museum.json` que les champs annoncés : un champ donné remplace, un objet est fusionné, `null` retire. Si une vérification échoue, le musée reste intact. La lumière déclarée est conservée ; un paquet qui change la taille ou la place d'une œuvre fera afficher « Lumière à recalculer » dans l'éditeur.
- **Remise des paquets par le Drive** (19 novembre 2026) : le porteur n'a pas réussi à télécharger un paquet depuis la conversation ; à sa demande, les paquets sont déposés dans son Drive, dossier « Musee-120-ans / Mises-a-jour » (créé ce jour). L'outil de dépôt prend un fichier de la session par référence (`sha256:<empreinte>:<chemin>`), mais **un appel ne transporte qu'environ 3 Mo** : un paquet plus lourd est refusé en bloc. Garder chaque paquet sous cette taille (images en WebP, modèles 3D en version web), ou demander au porteur comment procéder. Commande à lui donner, qui accepte l'archive comme le dossier décompressé : `cd ~/musee-virtuel && npm run maj -- 120-ans "$(ls -d ~/Downloads/maj-120-ans-01* | head -1)"`.
- **Dossiers des essais, dans son Drive** (« Musee-120-ans / Essais », déposés le 19 novembre 2026 à sa demande) : six archives de moins de 3 Mo, trois pour l'essai des pièces (planche ; images proposées, fiches et outils ; images en 2048 px) et trois pour l'essai 3D (planche et modèles préparés pour le web ; photos, cotes, textures générées et programmes ; vues générées). Les modèles 3D d'origine, trop lourds, n'y sont pas : les sources et les programmes suffisent à les refabriquer. Une prochaine session reprend de là.
- **Paquet n° 1, remis au porteur le 19 novembre 2026** (validé par lui : « oui ») : la monnaie d'argent agrandie d'après une photo libre du même type, avec sa mention dans la fiche (`credit`), et le billet à portrait tiré du film, avec son millésime. Les dimensions réelles des billets viendront en une fois, avec le lot des billets, pour ne recalculer la lumière qu'une fois.
- **Réponses du porteur, le 19 novembre 2026** : il a le droit d'utiliser les images du film de l'exposition ; il ne peut pas retourner photographier les pièces ; **il ne veut utiliser que ses clés Google et OpenAI, aucun autre service payant**.
- **Le livre** : le script qui le fabrique est resté dans sa branche locale `claude/laughing-galileo-0mch8q` ; il faudra le récupérer, avec les photos d'origine.

**Objets en 3D : décision du porteur et essai sur deux objets (19 novembre 2026).** Le porteur veut tous les objets de l'exposition en 3D, hors monnaies et billets (quatorze machines et objets du hall des guichets), posés sur des socles à la place des photos au mur, la photo restant dans la fiche (champ `photo`). Contrainte posée par lui en cours de route : **uniquement ses clés Google et OpenAI, aucun autre service payant**. Un service de génération « image vers 3D » avait été envisagé (fal.ai) : écarté à sa demande, rien n'y a été envoyé, l'hôte a été retiré de l'environnement.

- **Ce que permettent ses deux clés** (vérifié le 19 novembre 2026) : ni Google ni OpenAI n'ont de générateur « photo vers objet 3D ». Les modèles d'image de Google ne rendent que des images ; ce qu'OpenAI montre en 3D est un modèle qui écrit un programme pour Blender. La méthode de l'essai est donc la même, faite ici : **l'objet est construit par code dans Blender, calé sur la photo**. La clé Google sert aux textures des faces cachées et à des vues de profil pour guider la forme. La clé OpenAI n'a pas servi.
- **Méthode** (Blender en module Python, celui du calcul de lumière ; Pillow y a été ajouté) :
  1. relever sur la photo des points de l'objet ; retrouver l'appareil photo. Pour une boîte, ses trois directions fuient vers trois points de l'image, qui donnent la focale, l'orientation et les proportions (écarts de 1 à 20 pixels sur une photo de 2000). Pour un objet complexe, on cale l'appareil sur un rectangle connu de l'objet et quelques repères, en ajustant ses cotes jusqu'à ce que le volume recouvre la photo ;
  2. construire le volume : profil étiré sur la largeur, arrondis, cuvette creusée, pièces rapportées (touches replacées là où la photo les montre, manivelle, leviers, serrure, poignées) ;
  3. habiller : la photo est projetée sur tout ce qu'elle montre (visibilité par lancer de rayons, une surface vue de biais compte moins) ; ailleurs, une peinture reconstituée par le modèle d'image de Google d'après un échantillon de la photo, à la teinte de celle-ci. Les grands reflets d'une face plane se retirent comme un voile (soustraction), en épargnant les parties claires, sinon les couleurs d'un logo dérivent ;
  4. exporter en GLB, puis `npm run modeles` : de 1 300 à 5 600 triangles, de 0,2 à 0,5 Mo par objet ;
  5. contrôler : rendu depuis le point de vue de la photo, côte à côte avec elle ; tour de l'objet en huit vues ; dans le musée, sur son socle puis dans « Examiner ».
- **Résultats** : l'objet simple (une boîte) est fidèle sous tous les angles, faces cachées plausibles. L'objet complexe (une machine à touches et manivelle) est fidèle du côté photographié, inscriptions comprises (42 % de sa surface est habillée par la photo) ; ses flancs et son dos sont une reconstitution simplifiée, et ses leviers sont schématiques. Les vues de profil et d'arrière demandées au modèle d'image sont plausibles mais pas fiables en cotes (hauteur exagérée, un détail inventé sur un flanc) : elles guident, elles ne prouvent rien.
- **Moteur complété pour ces objets (19 novembre 2026)**, sans rien changer aux musées existants :
  - **Cartel du socle** : `cardSide` (`north`, `south`, `east`, `west`) choisit le côté du socle qui porte le cartel, celui d'où vient le visiteur ; sans lui, l'est, comme avant.
  - **Photographie de l'objet réel** : `sourcePhoto` la montre dans la fiche, sous le texte, avec la légende « Photographie de l'objet exposé » ; un clic l'agrandit dans la visionneuse des tableaux. Le champ `photo` reste l'image de la vue simplifiée : pour les sculptures de la démonstration, c'est une vignette du modèle, pas une photographie, d'où un champ à part.
  - **Examen** : la distance de départ et la distance la plus proche tiennent compte du rayon de l'objet vu de dessus (`inspectRange`, `src/inspect.ts`). Un objet aussi profond que haut ne déborde plus de l'écran, et l'on ne peut plus entrer dedans. Une statue haute et étroite garde son cadrage ; une pièce de monnaie aussi (elle est plate).
  - **Approche** : un petit objet se regarde de plus près qu'une statue, comme un petit tableau (de 55 cm à 1,20 m selon sa taille, `closestView`). Devant un objet de 30 cm, le visiteur est amené à 75 cm environ, le regard plongeant.
  - **Images tenues pour utilisées** : le ménage de l'éditeur ne supprime plus une image qui sert de photographie d'objet (`photo`, `sourcePhoto`) ou de face de pièce (`model.coin`). Un paquet de mise à jour vérifie aussi ces photographies, et les versions web d'un modèle (`models/web/nom.glb` et `nom-leger.glb`) quand `model.web` est vrai.
  - **Clarté** : un objet clair demande `tone` entre 0,45 et 0,6, sinon il blanchit sous la verrière.
- **Coût** : sept images Google pour les deux objets, moins d'un dollar.
- **Fichiers** : planche et archive de l'essai (modèles GLB, cotes, programmes) remises au porteur, à ranger dans son Drive ; rien dans le dépôt.
- **Décisions du porteur (19 novembre 2026)** : niveau détaillé pour les machines phares, niveau simple pour les autres objets ; tous sur des socles. Machines phares proposées par Claude, à confirmer par lui : quatre machines de bureau (deux calculatrices, une machine à écrire, une machine à imprimer).
- **Niveau détaillé, fait pour une première calculatrice** : leviers en palette, manivelle tournée (moyeu, bras, poignée), platine, plaque de dos vissée, semelle, curseurs en relief. La photo n'est plus utilisée au bord de la silhouette (fondu vers la peinture reconstituée) : plus de liseré de mur ou de table. La teinte de la peinture reconstituée vient des parties claires de la carrosserie. Le fichier d'origine porte sa texture en JPEG (0,4 à 0,9 Mo), les versions web pèsent de 0,07 à 0,5 Mo.
- **Implantation dans le hall** : un U de socles de 90 cm à 1,60 m des murs, devant les comptoirs. Rang nord et rang sud aux abscisses des anciennes photos (−4,16 ; −2,08 ; 0 ; 2,08 ; 4,16, à z = ∓3,4) ; colonne ouest resserrée (x = −4,4 ; z = ±0,63 et ±1,9) pour dégager les angles. Le cartel et la face de l'objet regardent le centre de la salle : `cardSide` south, east ou north, et `turn` 0, 90 ou 180 (la face d'un modèle regarde le sud quand `turn` vaut 0).
- **Fabrication d'un paquet d'objets** : une description (objet, modèle, position, orientation, côté du cartel, clarté, photographie) donne le paquet ; les versions web sont préparées par `npm run modeles` dans un musée provisoire, et la hauteur de l'objet est lue dans le modèle. La retouche retire de l'œuvre ce qui en faisait un tableau (`wall`, `offset`, `width`, `y`, `image`) et lui donne `type`, `position`, `height`, `plinth`, `turn`, `cardSide`, `model`, `photo`, `sourcePhoto`, `tone` ; la technique devient « Reconstitution en 3D d'après photographie ».
- **Paquet n° 2, déposé dans son Drive le 19 novembre 2026** (« Musee-120-ans / Mises-a-jour ») : les deux objets de l'essai, 2,2 Mo. Vérifié sur une copie de son musée : fiches, photographies, examen, sur ordinateur et sur téléphone. Après l'avoir appliqué, la lumière du hall est à recalculer depuis l'éditeur (une salle).
- **Contrôles du lot** : 236 tests unitaires et 99 tests de bout en bout au vert, avant et après. Captures sur ordinateur et sur téléphone : le hall avec sa lumière recalculée, l'approche d'un objet (75 cm sur ordinateur, 85 à 95 cm sur téléphone), sa fiche avec la photographie, l'agrandissement, l'examen. Dans la démonstration, la grande statue garde son cadrage ; ses petites sculptures (35 à 72 cm) s'approchent désormais de plus près, ce qui les sert. Le calcul de lumière d'une salle qui contient ces objets fonctionne (254 s ici, sur quatre cœurs sans carte graphique).
- **Atelier commun** pour les objets suivants (hors dépôt, dans l'archive des programmes) : calage de l'appareil photo, volumes (boîtes, pièces tournées, sections reliées), habillage par la photo avec fondu au bord de la silhouette, export, vues de contrôle. Chaque objet n'a plus qu'à décrire sa forme et ses repères.
- **Suite du lot (19 novembre 2026, soir)** : onze objets de plus, soit treize sur quatorze. Trois au niveau simple d'après une photo prise du dessus ou de trois quarts (un appareil à cadran, un petit terminal, une presse à main). Deux d'après une photo de trois quarts calée par ses lignes de fuite (une machine à capot et plateau, une presse sur sa plaque). Deux machines phares au niveau détaillé d'après une photo de face (touches, bobines, chariot, boutons, levier ; sur l'une, chaque touche est une pièce et le cadre est ouvert comme sur la vraie). Trois objets entièrement dessinés ou à forme souple (un appareil de bakélite noire, un sac de toile imprimée, un instrument de pesée photographié de loin). Une machine à mécanisme ajouré en volumes simplifiés : son grand plateau, son disque et son socle sont en volume, le mécanisme reste une image posée sur le socle.
- **Ce que l'atelier a appris en route** (hors dépôt, dans l'archive des programmes) :
  - **Photo prise du dessus** : le contour de chaque partie est relevé sur la photo, puis étiré jusqu'à sa hauteur (estimée, la photo ne montre pas les flancs). Rapide et net.
  - **Photo de trois quarts d'un objet posé sur une plaque ou un plateau** : les bords du rectangle donnent les lignes de fuite, donc l'appareil photo et même sa focale quand les deux fuites sont franches ; les cotes se mesurent ensuite sur la photo (sol, faces verticales, profil relevé sur un bout de l'objet). Sur ces photos, la focale vaut de 3 300 à 4 700 points pour une image de 2 000 points de large : un téléobjectif, recadré.
  - **Photo de face, en plongée** : l'appareil est posé face à l'objet ; la plongée se lit sur l'aplatissement d'un disque horizontal (une bobine, une touche ronde) ; le profil se déduit pan par pan, avec une pente estimée pour chacun.
  - **Objet noir et brillant** : la photo, pleine de reflets, ne peut pas l'habiller. Il est entièrement dessiné aux proportions de la photo ; seules ses inscriptions en viennent, redressées et détourées, posées en transparence.
  - **Objet souple** : une forme rebondie dessinée, la face imprimée reprise de la photo tournée pour remettre le texte droit ; les ombres portées sont effacées en égalisant la clarté à grande échelle ; ce que le cadrage coupe reste uni, rien n'est redessiné.
  - **Atlas** : les faces que la photo voit sont dépliées en grand, les autres en tout petit (la netteté des inscriptions y gagne beaucoup). Les arêtes vives sont marquées, sinon un cylindre ou une boîte prend un aspect métallique faux.
  - **À éviter** : deux faces confondues (elles sortent noires au calcul et scintillent dans la visite) ; un arrondi plus grand que les côtés du contour (il déborde).
- **Moteur complété pendant cette suite**, sans rien changer aux musées existants :
  - **Examen** : l'angle de départ dépend de la forme (`inspectPitch`, `src/inspect.ts`). Une statue se regarde presque de face, comme avant ; un objet plus large que haut, posé à plat, se regarde de plus haut (jusqu'à 45°), sinon on n'en verrait que la tranche.
  - **Côté du socle** : `plinthSide` (mètres) donne au socle une largeur choisie. Sans lui, le socle suit l'emprise de la sculpture, comme avant (une statue déborde volontiers ; un objet posé à plat ne doit pas dépasser).
  - **`npm run maj`** applique plusieurs paquets à la suite, dans l'ordre donné ; au premier refus il s'arrête, et le dit.
- **Paquets déposés dans son Drive** (« Musee-120-ans / Mises-a-jour ») : n° 3 et n° 4 (trois objets chacun), n° 5 et n° 6 (deux objets chacun, dont les deux machines détaillées), n° 7 (un objet), les 19 et 20 novembre 2026. Chaque paquet reste sous 3 Mo (limite du dépôt par le connecteur). Vérifiés sur une copie de son musée : application à la suite des précédents, socles, fiches, examen, sur ordinateur et sur téléphone.
- **Contrôles de la suite du lot** : 240 tests unitaires et 99 tests de bout en bout au vert après les compléments du moteur. Dans une copie de son musée, lumière du hall recalculée : chaque objet sur son socle, les fiches et l'examen, sur ordinateur et sur téléphone ; une planche d'aperçu des treize objets lui est remise.
- **Le quatorzième objet (20 novembre 2026)**, une machine à carter anguleux, à la demande du porteur (« version simplifiée ») : paquet n° 8, déposé dans son Drive. Sa seule photo est prise presque à la verticale, appareil penché. Ce qui a débloqué la lecture : un plateau de tôle, rectangle horizontal, donne la verticale (son plan se déduit de ses deux fuites) ; les cadrans, des cercles vus en ovale, donnent l'inclinaison de la façade (un pupitre à 42°, pas une face verticale). Volumes : corps à dessus plat, pupitre, bosse, tambour, plateau, goulotte ; le cadran étagé est une pièce tournée laissée unie, son image étant effacée de la façade (habillé par une photo prise du dessus, il serait étiré). Limite : vue de face, la machine reste schématique ; ses hauteurs sont estimées.
- **Les quatorze objets du hall sont en 3D.** Suites possibles, si le porteur le souhaite : reprendre un objet jugé trop simple, relief des claviers, autres vues tirées du film pour les machines schématiques.

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

- **Confirmer la sauvegarde `musees-sauvegarde-v2`** sur son Bureau (l'étiquette `v2`, elle, est créée et vérifiée).
- **Appliquer le paquet n° 8** (`npm run maj -- 120-ans ~/Downloads/maj-120-ans-08.zip`, puis `npm run lumiere -- 120-ans --salle guichets`) et dire si l'ensemble lui convient : niveau de détail, hauteur des socles, implantation.
- **Objets plats** (posés à plat sur leur socle, comme dans l'exposition) : les garder ainsi, ou les présenter inclinés sur un petit pupitre ? L'examen les montre déjà de dessus.
- **Confirmer les machines phares** proposées par Claude pour le niveau détaillé (voir « Objets en 3D »).
- ~~Le dernier objet du hall~~ : version simplifiée choisie par le porteur le 20 novembre 2026, livrée (paquet n° 8). À lui de dire si elle lui convient.
- **Paquets n° 2 à n° 7** : appliqués sur son Mac le 20 novembre 2026 (six sauvegardes dans `musees-sauvegardes/120-ans/2026-11-20-08-15-10…`), lumière du hall recalculée chez lui. Son avis sur les objets, les socles et la disposition est attendu.
- ~~Appliquer le paquet n° 1 sur son Mac~~ : fait le 19 novembre 2026 (sauvegarde `musees-sauvegardes/120-ans/2026-11-19-17-42-29`).
- **Son avis sur l'essai des six pièces** (voir « Jalon en cours : images et objets de l'exposition des 120 ans ») : les deux images à intégrer, la reconstitution à valider, les mentions à écrire dans les fiches.
- **Un inventaire, un catalogue ou des scans** de l'exposition, s'il en existe ; à défaut, le poids ou le diamètre de la monnaie d'or à identifier.
- **Son avis sur la baguette noire dans le Patio marocain** (une baguette de noyer s'accorderait aussi avec le plafond de cèdre).
- **Le reste du mode administrateur à essayer sur son Mac** : protection et rétablissement de la démonstration, couverture du musée des 120 ans (« Prendre la vue de l'aperçu »).

- ~~Recalculer la lumière du musée des 120 ans sur son Mac, avec les nouveaux cadres~~ : fait le 19 novembre 2026, en suivant le bandeau « Lumière à recalculer » de l'éditeur (premier calcul lancé depuis l'éditeur sur son Mac ; l'éditeur n'affiche plus d'alerte). Son avis : « il est meilleur ». Le premier calcul, le 18 novembre 2026, s'était fait par la commande `npm run lumiere -- 120-ans` : 3 min 40 pour les trois salles, de 66 à 80 s par salle.
- **Sa branche locale `claude/laughing-galileo-0mch8q`** : elle contient le musée des 120 ans et les notes détaillées de l'autre conversation. À garder, et à ne jamais envoyer sur GitHub (dépôt public).
- ~~Sa décision sur la version 2~~ : enregistrée comme Version 2 le 19 novembre 2026, à sa demande. Les réglages de lumière par salle (`--chaleur`, faisceaux, soleil) restent ouverts s'il veut les retoucher.

- **Son choix sur le glissement de la vue pendant un déplacement en douceur** (vers une œuvre ou vers un point du sol) : l'arrêter, comme aujourd'hui (retenu par défaut), ou seulement tourner le regard, le visiteur allant au bout de son déplacement. Voir « Déplacement en douceur interrompu ».
- **Son avis sur l'éditeur à l'usage** : dépôt de photos, accrochage automatique, fiches. Et ses réponses aux trois questions restées ouvertes : la date de la présentation, qui utilisera l'outil, et si un éditeur sur ordinateur, sans compte, lui convient pour commencer.
- **Où ranger le musée de la banque** : les musées créés ne partent pas sur GitHub (dépôt public). Il est sur le Mac du porteur, avec la copie du Bureau, et depuis le 19 novembre 2026 sur son Drive (dossier « Musee-120-ans »), par où passent les fichiers entre son Mac et l'environnement de travail. Pour une mise en ligne, il faudra un dépôt privé séparé ou un envoi direct chez l'hébergeur.
- **Son avis sur le lot « autour de l'œuvre » et le pack présentation**, sa relecture des textes des détails commentés, et son écoute du son de la fontaine (niveau, agrément).
- ~~Ses photos pour la salle des 120 ans~~ : fait. L'exposition a été construite sur son Mac dans une autre conversation (voir « Moteur de l'exposition « 120 ans », réuni à la version 2 »).

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
src/editeur/main.ts         Éditeur : onglets Œuvres, Salles, Musée, Contrôle ; enregistrement, aperçu, recadrage ;
                            page de choix et couverture, alerte et calcul de la lumière, démonstration protégée
src/editeur/modele.ts       Éditeur : création d'un musée, ajout et déplacement des œuvres (sans écran, testé seul)
src/editeur/api.ts          Éditeur : échanges avec le service d'écriture
src/editeur/editeur.css     Styles de l'éditeur

src/main.ts                 Démarrage : chargement et contrôle de la configuration, choix de la vue
src/choix.ts                Page de choix des musées (museums/index.json) ; bouton « Mode administrateur » en développement
src/visit3d.ts              Visite 3D : fiches, parcours, plan, boucle de rendu
src/simple.ts               Vue simplifiée, sans 3D
src/vr.ts                   Visite en casque VR
src/audio.ts                Audioguide
src/zoom.ts                 Agrandissement d'une œuvre en haute définition
src/ui.ts                   Textes de l'interface (français, anglais)
src/style.css               Styles de l'interface
src/accueil.ts              Écran d'accueil de la visite 3D
src/inspect.ts              Examen d'une sculpture ou d'un objet, seul et sous tous les angles
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
src/engine/cadres.ts        Cadres en relief : moulures, dix modèles, matières, passe-partout biseauté ; cadre et marge de chaque œuvre
src/engine/accrochage.ts    Accrochage automatique : répartition des œuvres sur les murs d'une salle
src/engine/plans.ts         Plans proposés à la création d'un musée
src/engine/world.ts         Assemblage du musée, règles de déplacement, points de vue
src/engine/lumiere.ts       Lumière précalculée : atlas de lumière de chaque salle, empreinte, export pour Blender
src/engine/marche.ts        Règle de marche : petits pas, arrêt au ras des obstacles, glissement le long des murs, point d'appui du visiteur en casque (sans rendu, testée seule)
src/engine/...              Contrôles, plan, mobilier, sculptures, textures, reflets, images

scripts/images.mjs          Préparation des images d'un musée
scripts/modeles.mjs         Préparation des modèles 3D d'un musée
scripts/maj.mjs             Paquets de mise à jour d'un musée de l'ordinateur (« npm run maj »)
scripts/vignettes.mjs       Photos des sculptures pour la vue simplifiée
scripts/lumiere.mjs         Lumière précalculée des salles (« npm run lumiere »), calcul par Blender dans scripts/lumiere/
scripts/lumiere-installer.mjs  Prépare un ordinateur pour ce calcul (« npm run lumiere:installer »)
scripts/editeur-serveur.mjs Service d'écriture de l'éditeur, ajouté au serveur de développement : musées, images,
                            page de choix et couvertures, calcul de la lumière, rétablissement de la démonstration
tests/unit/                 Tests unitaires (Vitest) : 222 tests
tests/e2e/                  Tests dans un navigateur (Playwright) : 98 tests
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
| `?cadres=tableau:dore-ancien` | Montre les œuvres dans d'autres cadres, sans toucher à la configuration. Familles `tableau`, `papier`, `caisse` ; plusieurs demandes se séparent par des virgules. Voir « Cadres en relief » |

### Configurer un musée (`museum.json`)

- **Repère** : le nord est vers les `z` négatifs. Une position s'écrit `[x, z]` en mètres ; une taille de salle `[largeur, hauteur, profondeur]`.
- **Salles** : nom, position, taille, décor (facultatif), plafond plat, verrière (`{"type": "skylight", "margin": 1.8}`) ou plafond flottant (`{"type": "cove"}`), bancs.
- **Décor d'une salle** : le nom d'un décor de la bibliothèque (`"decor": "terre-cuite"` ; décors disponibles : `pierre-claire`, `argile-claire`, `terre-cuite`, `riad`, `nuit`), ou ce décor corrigé réglage par réglage (`"decor": {"preset": "terre-cuite", "colors": {"wall": "#8e3f2c"}, "light": {"level": 0.9}}`). Réglages possibles : couleurs (`colors` : mur, sol, plafond, cadres, socles, bois, finitions, rails), sol (`floor` : `concrete`, `parquet`, `chevron`, `stone`, `zellige`), soubassement de zellige (`dado`) et frise de plâtre (`frieze`), en mètres, plafond de cèdre peint (`cedar`), murs (`walls` : `paint`, `limewash`), brillance du sol (`gloss`), plafond, cadre, lumière (`light` : niveau, teinte, force des projecteurs), cartels (`labels`). Les anciens réglages `wall` (couleur des murs) et `light` (niveau d'éclairage) de la salle restent acceptés.
- **Portes** : déclarées une seule fois, sur le mur d'une salle (`room`, `wall`, `offset`, `width`, hauteur facultative). L'ouverture dans la salle voisine est déduite.
- **Tableaux** : mur, décalage le long du mur (positif vers la droite quand on fait face au mur), largeur et hauteur en mètres, image (`{"src": "images/nom.webp"}`), titre, artiste, date, technique, texte. Facultatifs : cadre doré (`"frame": "gilt"`), passe-partout (`"mat": 0.12`, en mètres), mention du musée d'origine (`credit`, par langue), lien vers la notice (`link`), enregistrement audio. L'artiste et la date s'écrivent une fois, ou par langue (`{"fr": "vers 1830", "en": "c. 1830"}`).
- **Sculptures et objets** : position dans la salle, hauteur, hauteur du socle, et soit un modèle 3D (`"model": {"src": "models/nom.glb"}`, à préparer avec `npm run modeles`), soit une forme dessinée par le moteur avec son matériau (bronze, marbre, bronze patiné, bois laqué). Facultatifs : rotation (`turn`), clarté (`tone`), côté du socle qui porte le cartel (`cardSide`), largeur du socle (`plinthSide`), photographie de l'objet réel montrée dans la fiche (`sourcePhoto`).
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
npm run lumiere:installer        # une fois par ordinateur : installe Blender pour le calcul de la lumière
npm run lumiere -- demo           # calcule la lumière des salles modifiées, avec Blender (docs/lumiere.md)
npm run maj -- 120-ans paquet.zip # applique un paquet de mise à jour à un musée de l'ordinateur
```

## 8. Méthode de travail retenue

- **Tout en français** : interface, commentaires du code, messages de commit, documentation. Les textes du musée existent en français et en anglais.
- **Le dépôt GitHub est public** : aucun contenu client n'y entre (photos, cartels, textes, voix, notes sur une exposition, noms de personnes). Le code du moteur, lui, peut y aller. Pour transmettre du code fait sur le Mac sans GitHub : `git format-patch` limité au code, déposé sur le Drive du porteur.
- **Le porteur du projet n'est pas développeur** : commandes exactes à copier, explications simples, sur Mac.
- **Avant et après chaque modification du moteur** : les tests doivent passer, puis le rendu est vérifié par des captures sur ordinateur et sur téléphone.
- **Tests dans un navigateur** : attendre une condition que le moteur expose (par exemple `controls.gliding`, vrai tant qu'un déplacement en douceur est en cours), jamais un délai fixe ni « deux positions identiques de suite ». Le rendu des tests est calculé par le processeur : une image prend 100 ms ou plus, et sous charge celle qui suit un clic peut tarder, si bien que deux relevés rapprochés sont identiques avant même que le visiteur ait bougé. Pour savoir où un obstacle arrête le visiteur, l'aide `walkUntilBlocked` fait elle-même avancer le temps, à grands pas, au lieu d'attendre les images ; elle vérifie ensuite que de tout petits pas ne déplacent plus le visiteur, ce qui prouve à chaque appel qu'il s'est arrêté au ras de l'obstacle. Pour qu'un vrai geste (souris, clavier, doigt) arrive à un instant précis d'un déplacement en douceur, l'aide `holdClock` tient l'horloge de la visite : le visiteur ne bouge plus que lorsque le test fait avancer le temps.
- **Tests en casque émulé** : l'émulateur tient le casque parfaitement immobile, et les images lentes du navigateur des tests font faire au joystick des pas de 18 cm. Ni l'un ni l'autre ne ressemble à un vrai casque, où la tête bouge sans cesse et où un pas fait 2 cm : le défaut du joystick sans effet y échappait. Les tests font donc avancer le temps eux-mêmes, à 90 images par seconde (`__museum.vrUpdate(dt)`), et déplacent la tête eux-mêmes : par `xrDevice.position` pour un vrai mouvement, pris en compte à l'image suivante, ou, image par image, par la position de la caméra dans son `rig`. `__museum.vrSupport()` donne le point d'appui du visiteur.
- **Un aperçu à la fin de chaque lot**, et pas de lot touchant à l'identité visuelle sans l'avis du porteur.
- **Œuvres** : Claude cherche de vraies œuvres en accès libre et vérifie la licence de chacune à la source ; le porteur valide la sélection avant toute intégration.
- **Accès aux collections des musées** : les sessions dans le cloud passent par l'environnement « musee-virtuel », qui autorise les sites du Metropolitan Museum, de l'Art Institute of Chicago, du musée de Cleveland, de Wikimedia Commons, de la Smithsonian et de Sketchfab.

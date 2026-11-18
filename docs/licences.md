# Inventaire des licences

Document produit par `npm run licences` : ne pas le modifier à la main, le relancer.
Il ne remplace pas l'avis d'un juriste.

## 1. Ce qu'est « le moteur »

Le moteur est le logiciel qui construit et fait visiter un musée à partir d'un dossier de configuration :
le code de `src/`, la page `index.html`, les commandes de `scripts/`, les tests et la documentation.
C'est lui qui peut être offert ou vendu. **Un musée (ses images, ses modèles 3D, ses textes, ses voix)
n'en fait pas partie** : chaque musée apporte ses propres contenus et ses propres droits.

## 2. Logiciels tiers livrés avec le moteur

Ce sont les seuls logiciels tiers présents dans le site que reçoit le visiteur.

| Logiciel | Version | Licence | Site |
| --- | --- | --- | --- |
| three | 0.187.0 | MIT | https://threejs.org/ |

Ces licences autorisent l'usage, la modification et la vente, à condition de conserver leur mention
de droit d'auteur et leur texte de licence. Le dossier `node_modules/<logiciel>/` contient ce texte.

## 3. Outils de fabrication

Ils servent à construire, tester et préparer les fichiers. Ils ne sont pas livrés au visiteur ;
la commande `npm install` les télécharge chez qui reprend le projet.

| Outil | Version | Licence |
| --- | --- | --- |
| @gltf-transform/core | 4.5.1 | MIT |
| @gltf-transform/extensions | 4.5.1 | MIT |
| @gltf-transform/functions | 4.5.1 | MIT |
| @playwright/test | 1.63.0 | Apache-2.0 |
| @types/node | 26.6.6 | MIT |
| @types/three | 0.187.0 | MIT |
| draco3dgltf | 1.5.9 | Apache-2.0 |
| iwer | 2.8.0 | MIT |
| meshoptimizer | 1.3.0 | MIT |
| sharp | 0.35.5 | Apache-2.0 |
| typescript | 7.0.2 | Apache-2.0 |
| vite | 8.3.8 | MIT |
| vitest | 5.1.0 | MIT |

### Programmes à installer à part

Deux commandes appellent un programme qui n'est ni livré avec le moteur, ni téléchargé par `npm install` :
chacun l'installe lui-même sur son ordinateur.

| Programme | Commande | Licence | Ce que cela implique |
| --- | --- | --- | --- |
| ffmpeg | `npm run voix` | LGPL ou GPL, selon la version installée | Rien pour le moteur : le programme est appelé tel quel, il n'est pas redistribué. |
| Blender (module Python `bpy`), avec Python 3.13 | `npm run lumiere`, après `npm run lumiere:installer` | GNU GPL pour Blender ; licence PSF pour Python | Les atlas de lumière qu'il produit appartiennent à qui les calcule. Le script `scripts/lumiere/calcul.py`, lui, utilise l'interface de programmation de Blender : s'il est distribué, il doit l'être sous une licence compatible avec la GPL (la licence MIT l'est). Le reste du moteur ne lui parle que par des fichiers. Voir https://www.blender.org/about/license/ |

## 4. Sons livrés avec le moteur

| Fichier | Origine | Licence |
| --- | --- | --- |
| `fontaine.mp3` | Extrait de « Fountain in toulouse.ogg », Wikimedia Commons : https://commons.wikimedia.org/wiki/File:Fountain_in_toulouse.ogg | Domaine public |

## 5. Polices et icônes

Le moteur n'embarque aucune police : il utilise celles de l'appareil du visiteur. Les icônes et
l'emblème sont dessinés dans le code du projet.

## 6. Musée « Musée des Horizons » (dossier `public/museums/demo/`)

Ce musée est une démonstration. Il ne fait pas partie du moteur.

- 4 œuvre(s) : modèle 3D dans le domaine public
- 42 œuvre(s) : image dans le domaine public
- 1 œuvre(s) : modèle 3D soumis aux conditions d’utilisation de la Smithsonian (usage non commercial)

**À retirer ou à faire autoriser avant toute vente ou diffusion publique de ce musée :**

- « Danseuse » (`danseuse`) : Cooper Hewitt, Smithsonian Design Museum, New York · modèle 3D soumis aux conditions d’utilisation de la Smithsonian (usage non commercial)

| Salle | Œuvre | Auteur | Conservation et licence | Notice |
| --- | --- | --- | --- | --- |
| Atrium | Modèle de L'Esclave grecque | Hiram Powers | Smithsonian American Art Museum, Washington · modèle 3D dans le domaine public | [lien](https://americanart.si.edu/collections/search/artwork/?id=20060) |
| Atrium | Deux sœurs (Sur la terrasse) | Pierre-Auguste Renoir | Art Institute of Chicago · image dans le domaine public | [lien](https://www.artic.edu/artworks/14655) |
| Atrium | La Classe de danse | Edgar Degas | The Metropolitan Museum of Art, New York · image dans le domaine public | [lien](https://www.metmuseum.org/art/collection/search/438817) |
| Atrium | Ia Orana Maria (Je vous salue Marie) | Paul Gauguin | The Metropolitan Museum of Art, New York · image dans le domaine public | [lien](https://www.metmuseum.org/art/collection/search/438821) |
| Atrium | Cyprès | Vincent van Gogh | The Metropolitan Museum of Art, New York · image dans le domaine public | [lien](https://www.metmuseum.org/art/collection/search/437980) |
| Salle des Horizons | Les Moissonneurs | Pieter Bruegel l'Ancien | The Metropolitan Museum of Art, New York · image dans le domaine public | [lien](https://www.metmuseum.org/art/collection/search/435809) |
| Salle des Horizons | Champ de blé avec cyprès | Vincent van Gogh | The Metropolitan Museum of Art, New York · image dans le domaine public | [lien](https://www.metmuseum.org/art/collection/search/436535) |
| Salle des Horizons | Crépuscule dans la nature sauvage | Frederic Edwin Church | Cleveland Museum of Art · image dans le domaine public | [lien](https://clevelandart.org/art/1965.233) |
| Salle des Horizons | La Montagne Sainte-Victoire | Paul Cézanne | The Metropolitan Museum of Art, New York · image dans le domaine public | [lien](https://www.metmuseum.org/art/collection/search/435878) |
| Salle des Horizons | L'Incendie des Chambres des lords et des communes, 16 octobre 1834 | J. M. W. Turner | Cleveland Museum of Art · image dans le domaine public | [lien](https://clevelandart.org/art/1942.647) |
| Salle des Horizons | Promenade sur la falaise à Pourville | Claude Monet | Art Institute of Chicago · image dans le domaine public | [lien](https://www.artic.edu/artworks/14620) |
| Salle des Horizons | La Mer calme | Gustave Courbet | The Metropolitan Museum of Art, New York · image dans le domaine public | [lien](https://www.metmuseum.org/art/collection/search/436005) |
| Cabinet des Couleurs | Meules (fin de l'été) | Claude Monet | Art Institute of Chicago · image dans le domaine public | [lien](https://www.artic.edu/artworks/64818) |
| Cabinet des Couleurs | Meules (soleil couchant, effet de neige) | Claude Monet | Art Institute of Chicago · image dans le domaine public | [lien](https://www.artic.edu/artworks/81545) |
| Cabinet des Couleurs | Improvisation n° 30 (Canons) | Vassily Kandinsky | Art Institute of Chicago · image dans le domaine public | [lien](https://www.artic.edu/artworks/8991) |
| Cabinet des Couleurs | Mahana no atua (Le Jour du dieu) | Paul Gauguin | Art Institute of Chicago · image dans le domaine public | [lien](https://www.artic.edu/artworks/27943) |
| Cabinet des Couleurs | Iris | Vincent van Gogh | The Metropolitan Museum of Art, New York · image dans le domaine public | [lien](https://www.metmuseum.org/art/collection/search/436528) |
| Cabinet des Couleurs | Nymphéas | Claude Monet | Art Institute of Chicago · image dans le domaine public | [lien](https://www.artic.edu/artworks/16568) |
| Cabinet des Couleurs | La Chambre | Vincent van Gogh | Art Institute of Chicago · image dans le domaine public | [lien](https://www.artic.edu/artworks/28560) |
| Cabinet des Couleurs | Composition avec rouge, jaune et bleu | Piet Mondrian | Cleveland Museum of Art · image dans le domaine public | [lien](https://clevelandart.org/art/1967.215) |
| Galerie des Lignes | La Grande Vague de Kanagawa | Katsushika Hokusai | The Metropolitan Museum of Art, New York · image dans le domaine public | [lien](https://www.metmuseum.org/art/collection/search/45434) |
| Galerie des Lignes | Averse soudaine sur le pont Shin-Ōhashi à Atake | Utagawa Hiroshige | The Metropolitan Museum of Art, New York · image dans le domaine public | [lien](https://www.metmuseum.org/art/collection/search/36461) |
| Galerie des Lignes | La Grande Vague, Sète | Gustave Le Gray | The Metropolitan Museum of Art, New York · image dans le domaine public | [lien](https://www.metmuseum.org/art/collection/search/261941) |
| Galerie des Lignes | Le Rhinocéros | Albrecht Dürer | The Metropolitan Museum of Art, New York · image dans le domaine public | [lien](https://www.metmuseum.org/art/collection/search/356497) |
| Galerie des Lignes | Les Trois Arbres | Rembrandt | The Metropolitan Museum of Art, New York · image dans le domaine public | [lien](https://www.metmuseum.org/art/collection/search/354633) |
| Galerie des Lignes | Melencolia I | Albrecht Dürer | The Metropolitan Museum of Art, New York · image dans le domaine public | [lien](https://www.metmuseum.org/art/collection/search/336228) |
| Galerie des Lignes | Vent du sud, ciel clair, dit Le Fuji rouge | Katsushika Hokusai | Cleveland Museum of Art · image dans le domaine public | [lien](https://clevelandart.org/art/1930.189) |
| Galerie des Lignes | Rue aux Saintes-Maries-de-la-Mer | Vincent van Gogh | The Metropolitan Museum of Art, New York · image dans le domaine public | [lien](https://www.metmuseum.org/art/collection/search/336318) |
| Cour des Sculptures | Vase rituel à vin (fangyi) | Chine, Luoyang | Freer Gallery of Art, Smithsonian, Washington · modèle 3D dans le domaine public | [lien](https://asia.si.edu/object/F1930.54a-b/) |
| Cour des Sculptures | Danseuse | Agathon Léonard, Manufacture de Sèvres | Cooper Hewitt, Smithsonian Design Museum, New York · modèle 3D soumis aux conditions d’utilisation de la Smithsonian (usage non commercial) | [lien](https://collection.cooperhewitt.org/view/objects/asitem/id/17969) |
| Cour des Sculptures | Bouddha à la robe des royaumes de l’existence, dit « Bouddha cosmique » | Chine, probablement province du Henan | Freer Gallery of Art, Smithsonian, Washington · modèle 3D dans le domaine public | [lien](https://asia.si.edu/object/F1923.15/) |
| Cour des Sculptures | Défense sculptée | Artiste kongo, côte de Loango | National Museum of African Art, Smithsonian, Washington · modèle 3D dans le domaine public | [lien](https://www.si.edu/object/nmafa_96-28-1) |
| Cour des Sculptures | Un dimanche à la Grande Jatte — 1884 | Georges Seurat | Art Institute of Chicago · image dans le domaine public | [lien](https://www.artic.edu/artworks/27992) |
| Cour des Sculptures | Rue de Paris, temps de pluie | Gustave Caillebotte | Art Institute of Chicago · image dans le domaine public | [lien](https://www.artic.edu/artworks/20684) |
| Patio marocain | Paire de portes | Maroc | Art Institute of Chicago · image dans le domaine public | [lien](https://www.artic.edu/artworks/16830) |
| Patio marocain | Tapis | Maroc | Art Institute of Chicago · image dans le domaine public | [lien](https://www.artic.edu/artworks/6141) |
| Patio marocain | Panneau de soie | Maroc | Art Institute of Chicago · image dans le domaine public | [lien](https://www.artic.edu/artworks/181173) |
| Patio marocain | Panneau à arcs polylobés | Maroc | The Metropolitan Museum of Art, New York · image dans le domaine public | [lien](https://www.metmuseum.org/art/collection/search/453262) |
| Patio marocain | Claustra de fenêtre (moucharabieh) | Maroc | Art Institute of Chicago · image dans le domaine public | [lien](https://www.artic.edu/artworks/16825) |
| Patio marocain | Panneau de bois sculpté | Maroc | Art Institute of Chicago · image dans le domaine public | [lien](https://www.artic.edu/artworks/16799) |
| Patio marocain | Tenture murale (msimsim) | Maroc, Tétouan | Cleveland Museum of Art · image dans le domaine public | [lien](https://clevelandart.org/art/2010.287) |
| Patio marocain | Section d'un manuscrit du Coran | Maroc ou sud de l'Espagne (attribué) | The Metropolitan Museum of Art, New York · image dans le domaine public | [lien](https://www.metmuseum.org/art/collection/search/454664) |
| Patio marocain | Double page des Dala'il al-Khayrat d'al-Jazuli | Afrique du Nord (attribué) | The Metropolitan Museum of Art, New York · image dans le domaine public | [lien](https://www.metmuseum.org/art/collection/search/451682) |
| Patio marocain | Panneau de quatre carreaux calligraphiés | Maroc | The Metropolitan Museum of Art, New York · image dans le domaine public | [lien](https://www.metmuseum.org/art/collection/search/453659) |
| Patio marocain | Carreau | Maroc | Art Institute of Chicago · image dans le domaine public | [lien](https://www.artic.edu/artworks/16674) |
| Patio marocain | Cour, Tétouan, Maroc | John Singer Sargent | The Metropolitan Museum of Art, New York · image dans le domaine public | [lien](https://www.metmuseum.org/art/collection/search/12065) |
| Patio marocain | Couple marocain sur sa terrasse | Eugène Delacroix | The Metropolitan Museum of Art, New York · image dans le domaine public | [lien](https://www.metmuseum.org/art/collection/search/336043) |

### Voix de l'audioguide

Produites par le service de voix de Google (modèle `gemini-3.8-flash-tts`, voix `fr:fr-fr-tutor-4+en:en-gb-tutor-11`), 94 fichiers. Leur usage dépend des conditions du service Google au moment de la production, et du compte qui les a produites : à vérifier avant une vente de ce musée. Le moteur ne contient que la commande `npm run voix` ; chaque musée produit ses voix avec son propre compte.

### Textes

Les cartels, commentaires, détails et parcours de ce musée ont été rédigés pour le projet avec l'aide
d'une IA, d'après les notices des musées. Ils n'ont pas été comparés un par un à ces notices.

## 7. Points à faire vérifier par un juriste avant une cession du moteur

- **La titularité du code** : qui en est propriétaire (son auteur, ou son employeur s'il a été écrit dans le cadre d'un poste).
- **Le code a été écrit avec l'aide d'une IA** : les conditions du fournisseur attribuent en général les résultats à l'utilisateur, mais la protection par le droit d'auteur d'un contenu produit par une IA varie selon les pays.
- **La forme de la cession** : licence libre, licence d'utilisation, ou cession des droits ; garanties et limites de responsabilité.
- **Le nom du produit** : vérifier qu'il n'est pas déjà déposé comme marque.
- **Le script de calcul de la lumière** (`scripts/lumiere/calcul.py`) : il utilise l'interface de Blender, logiciel sous licence GPL. Confirmer sous quelle licence le distribuer avec le moteur, ou le livrer à part.

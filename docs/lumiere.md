# Lumière précalculée (rendu premium)

Pilote de la version 2, novembre 2026. Une seule salle en profite pour l'instant : la Salle des Horizons du musée de démonstration.

## Ce que c'est

Sans lumière précalculée, la visite éclaire les murs, les sols et les plafonds par une formule. C'est rapide, mais la formule ne connaît ni les ombres, ni la lumière qu'une surface renvoie sur une autre. Des effets peints compensent : un halo autour de chaque tableau, une ombre douce sous chaque banc.

Avec la lumière précalculée, Blender (le logiciel libre de 3D) calcule une fois pour toutes la lumière de la salle, comme pour une image d'architecte :

- les vrais faisceaux des projecteurs sur les murs, avec leur bord net en haut ;
- la gorge lumineuse du plafond qui lave le haut des murs ;
- les angles et le pied des murs qui s'assombrissent légèrement ;
- l'ombre de contact sous les bancs et autour des cadres ;
- la lumière des salles voisines qui entre par les portes.

Le résultat est rangé dans une image, l'**atlas de lumière** (`public/museums/<musée>/lumiere/<salle>.webp`, environ 300 Ko). La visite le plaque sur les surfaces de la salle. Cela ne coûte presque rien à l'appareil du visiteur : le téléphone et le casque en profitent autant que l'ordinateur.

Chaque famille de surfaces (sol, murs, plafond) garde la clarté et la teinte que lui donne son décor : le calcul n'apporte que les variations de lumière. Le décor choisi reste donc celui qu'on voit.

## Comparer

- Avec la lumière précalculée : l'adresse habituelle, par exemple `http://localhost:5173/`.
- Sans, pour comparer : ajouter `?lumiere=0` à l'adresse, par exemple `http://localhost:5173/?lumiere=0`.

## Relancer le calcul

Il faut relancer le calcul d'une salle quand on y change quelque chose : un tableau déplacé, ajouté ou retiré, un banc, le décor, la taille de la salle. Sinon, la visite s'en aperçoit (l'« empreinte » de la salle a changé), garde l'éclairage par formule pour cette salle, et l'écrit dans la console du navigateur.

```bash
npm run lumiere -- demo --salle horizons
```

Le calcul dure une dizaine de minutes sur un ordinateur récent. Le script ouvre lui-même le musée, exporte la salle, fait calculer la lumière par Blender, puis range l'atlas dans le musée et le déclare dans `museum.json` (champ `"lumiere"`).

Réglages facultatifs, à ajouter à la fin de la commande :

| Réglage | Par défaut | Effet |
|---|---|---|
| `--echantillons 512` | 512 | Finesse du calcul : plus, c'est moins de grain et plus long. 64 suffit pour un essai rapide |
| `--projecteurs 260` | 260 | Puissance des projecteurs sur les œuvres |
| `--ambiance 3.2` | 3,2 | Éclairage d'ambiance venu du plafond |
| `--gorge 3` | 3 | Force de la gorge lumineuse |
| `--exposition 1` | 1 | Clarté d'ensemble de la salle (1,1 = 10 % plus clair) |

## Installer Blender pour le calcul (une seule fois, sur Mac)

Le calcul utilise Blender comme module Python, sans son interface. Il faut un Mac à puce Apple (M1 ou plus récent) et Python 3.13 :

```bash
brew install python@3.13
```

```bash
python3.13 -m venv ~/.cache/musee-virtuel/blender
```

```bash
~/.cache/musee-virtuel/blender/bin/pip install bpy==5.3.0 numpy
```

Le téléchargement fait environ 250 Mo. Le navigateur des tests doit aussi être installé (`npx playwright install chromium`), comme pour `npm run vignettes`.

## Limites du pilote

- Une seule salle calculée. Les autres gardent l'éclairage par formule.
- Les objets (cadres, bancs, socles, sculptures) gardent leur éclairage actuel : seuls les murs, le sol et le plafond lisent l'atlas.
- Les musées créés avec l'éditeur restent sur l'ordinateur du porteur (ils ne vont pas sur GitHub) : leur lumière devra donc être calculée sur son Mac.
- Le calcul se fait sur le processeur. Il pourra se faire sur la carte graphique du Mac (bien plus vite) dans un second temps.

## Comment c'est fait

- `src/engine/lumiere.ts` : place de chaque surface dans l'atlas (40 points par mètre), empreinte de la salle, export de la scène pour Blender, application de l'atlas dans la visite.
- `scripts/lumiere.mjs` : la commande `npm run lumiere`.
- `scripts/lumiere/calcul.py` : le calcul dans Blender (moteur Cycles), puis le lissage du grain, les ombres de contact et l'accord avec le décor.
- Le bâtiment marque les surfaces de chaque salle (`userData.lumiere`), la gorge lumineuse (`userData.gorge`), les halos (`userData.halo`) et les ombres peintes (`userData.ombrePeinte`).

# Lumière précalculée (rendu premium)

Version 2, novembre 2026. Les six salles du musée de démonstration en profitent.

## Ce que c'est

Sans lumière précalculée, la visite éclaire les murs, les sols et les plafonds par une formule. C'est rapide, mais la formule ne connaît ni les ombres, ni la lumière qu'une surface renvoie sur une autre. Des effets peints compensent : un halo autour de chaque tableau, une ombre douce sous chaque banc, une tache de soleil dessinée sous les verrières.

Avec la lumière précalculée, Blender (le logiciel libre de 3D) calcule une fois pour toutes la lumière de chaque salle, comme pour une image d'architecte :

- les vrais faisceaux des projecteurs sur les murs, avec leur bord net en haut ;
- la gorge lumineuse du plafond qui lave le haut des murs ;
- sous une verrière, la lumière du ciel et une vraie tache de soleil, avec l'ombre des traverses et celle des sculptures ;
- la lumière chaude des lanternes du patio sur les murs ;
- les angles et le pied des murs qui s'assombrissent légèrement ;
- l'ombre de contact sous les bancs, les socles, la fontaine et autour des cadres ;
- la lumière des salles voisines qui entre par les portes.

Le résultat est rangé dans une image par salle, l'**atlas de lumière** (`public/museums/<musée>/lumiere/<salle>.webp`, de 13 à 23 Ko dans la démonstration). La visite le plaque sur les surfaces de la salle. Cela ne coûte presque rien à l'appareil du visiteur : le téléphone et le casque en profitent autant que l'ordinateur. Sur un appareil modeste, l'atlas est réduit de moitié.

Chaque famille de surfaces (sol, murs, plafond) garde la clarté et la teinte que lui donne son décor : le calcul n'apporte que les variations de lumière. Le décor choisi reste donc celui qu'on voit. Deux exceptions voulues : les murs sont un peu plus clairs (ils n'ont plus de halos peints), et la lumière est réchauffée (réglage `--chaleur`).

## Comparer

- Avec la lumière précalculée : l'adresse habituelle, par exemple `http://localhost:5173/`.
- Sans, pour comparer : ajouter `?lumiere=0` à l'adresse, par exemple `http://localhost:5173/?lumiere=0`.

## Relancer le calcul

Il faut relancer le calcul d'une salle quand on y change quelque chose : un tableau déplacé, ajouté ou retiré, un banc, une sculpture, le décor, la taille de la salle. Sinon, la visite s'en aperçoit (l'« empreinte » de la salle a changé), garde l'éclairage par formule pour cette salle, et l'écrit dans la console du navigateur.

La commande la plus simple ne recalcule que les salles qui en ont besoin :

```bash
npm run lumiere -- demo
```

Pour une salle en particulier, ou pour toutes :

```bash
npm run lumiere -- demo --salle horizons
```

```bash
npm run lumiere -- demo --salle toutes
```

Compter deux à dix minutes par salle sur un ordinateur récent (27 minutes pour les six salles de la démonstration, sur quatre cœurs). Le script ouvre lui-même le musée, exporte les salles, fait calculer leur lumière par Blender, puis range les atlas dans le musée et les déclare dans `museum.json` (champ `"lumiere"`).

### Réglages

À ajouter à la fin de la commande. Un réglage donné pour une salle est **retenu** (dans `lumiere/lumiere.json`) : il resservira à ses prochains calculs, sans le redonner. `--defaut` les oublie.

| Réglage | Par défaut | Effet |
|---|---|---|
| `--chaleur 0.07` | 0,07 | Chaleur ajoutée à la lumière. 0 garde la teinte du décor ; 0,12 est très doré. Sans effet dans une salle à lumière froide (décor « nuit ») |
| `--exposition 1` | 1 | Clarté d'ensemble de la salle (1,1 = 10 % plus clair) |
| `--projecteurs 1` | 1 | Force des faisceaux sur les œuvres (1,3 = plus marqués, 0,7 = plus discrets) |
| `--soleil 1` | 1 | Force de la tache de soleil sous une verrière ; 0 la supprime |
| `--lanternes 1` | 1 | Force de la lumière des lanternes |
| `--voisines 1` | 1 | Lumière des salles voisines entrant par les portes |
| `--echantillons 256` | 256 | Finesse du calcul : plus, c'est moins de grain et plus long. 32 suffit pour un essai rapide. Non retenu |
| `--ambiance`, `--gorge`, `--ciel` | 3,2 ; 3 ; 4 | Éclairage d'ambiance du plafond, gorge lumineuse, ciel de la verrière : à ne toucher que pour un nouveau décor |

Changer la chaleur, l'exposition, les faisceaux, le soleil ou les salles voisines **se refait en moins d'une demi-minute par salle** : les passes calculées par Blender sont gardées dans `~/.cache/musee-virtuel/lumiere/`, et seul l'assemblage est refait. Les autres réglages (lanternes, ambiance, gorge, ciel, échantillons) demandent un nouveau calcul. Exemple, pour une Salle des Horizons plus dorée :

```bash
npm run lumiere -- demo --salle horizons --chaleur 0.1
```

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

## Limites

- Les objets (cadres, bancs, socles, sculptures, fontaine) gardent leur éclairage d'avant : seuls les murs, le sol et le plafond lisent l'atlas. Les embrasures des portes aussi gardent leur éclairage par formule.
- La lumière des salles voisines est calculée d'après leur éclairage par formule. Si le décor d'une salle change, la lumière qu'elle envoie chez ses voisines par les portes n'est pas recalculée d'elle-même : relancer `--salle toutes`.
- Les musées créés avec l'éditeur restent sur l'ordinateur du porteur (ils ne vont pas sur GitHub) : leur lumière se calcule donc sur son Mac. L'éditeur ne signale pas encore qu'une salle modifiée est à recalculer.
- Le calcul se fait sur le processeur. Il pourra se faire sur la carte graphique du Mac (bien plus vite) dans un second temps.

## Comment c'est fait

- `src/engine/lumiere.ts` : place de chaque plan de la salle dans l'atlas (40 points par mètre), empreinte de la salle, export de la scène pour Blender, application de l'atlas dans la visite.
- `scripts/lumiere.mjs` : la commande `npm run lumiere`.
- `scripts/lumiere/calcul.py` : le calcul dans Blender (moteur Cycles), puis l'assemblage.

**Un plan, une place.** Les surfaces d'un même plan (les pans d'un mur de part et d'autre d'une porte, le linteau, l'arc outrepassé, les bandes de zellige et de plâtre) partagent une seule place dans l'atlas, rangées côte à côte comme dans le musée. La lumière passe de l'une à l'autre sans couture, et une bande de revêtement lit simplement la lumière du mur qu'elle habille.

**Quatre passes**, chacune calculée par Blender puis lissée plan par plan :

| Passe | Ce qui éclaire | Rôle dans l'assemblage |
|---|---|---|
| Base | Ambiance du plafond, gorge lumineuse, ciel de la verrière, lanternes | On n'en garde que les variations autour de sa valeur médiane ; la clarté et la teinte viennent du décor |
| Accent | Projecteurs sur les œuvres, ou soleil sous une verrière | Ajoutée avec la force demandée : le faisceau par rapport à la clarté du mur, la tache de soleil par rapport à celle du sol |
| Voisines | Les surfaces des autres salles, avec la couleur qu'elles ont à l'écran | Ajoutée telle quelle |
| Contact | Rien : part du voisinage proche (1 m) que chaque point voit dégagée | Assombrit le pied des objets et les angles |

**Garde-fous.** Une surface ne peut pas être beaucoup plus claire que sa valeur médiane (un plafond : moitié plus au maximum), et la couleur propre au calcul n'est gardée qu'en partie : sans cela, une gorge lumineuse sur un mur de terre cuite devient rouge vif, et le plafond d'une salle sombre s'éclaircit sur ses bords. Les lumières les plus fortes sont arrondies en douceur, et l'image garde la lumière divisée par 2, 4 ou 8 selon la salle (champ `encode`) : une salle sombre aux projecteurs puissants a besoin d'une plage plus large.

**Marques posées par le bâtiment** sur ses surfaces (`userData`) : `lumiere` (surface de la salle), `habillage` (bande plaquée sur un mur), `gorge` (gorge lumineuse), `verriere` (vitrage), `soleil` (tache de soleil peinte), `embrasure` (épaisseur d'une porte), `halo` (halo peint autour d'une œuvre), `ombrePeinte` (ombre peinte sous un objet), `lanterne`.

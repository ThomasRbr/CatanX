# CatanX — Art Bible H1 (scène étalon)

Marque, UI et saisons shell : voir [`docs/art-bible/ROYAUME_VIVANT.md`](../../../../docs/art-bible/ROYAUME_VIVANT.md).

## Style

- Diorama 3D orthographique **low-poly**
- Volumes doux, stylisés, légèrement exagérés
- Palette pastel naturelle (voir `tools/blender/lib/palette.py`)
- Éclairage chaud depuis le **nord-ouest**
- Matériaux mats / rugueux, flat shading
- Pas de contours noirs permanents
- Pas de textures réalistes haute fréquence
- Aucun asset copié depuis Dorfromantik

## Échelle monde

| Élément | Hauteur approximative |
|---|---|
| Hex radius | 1.0 unité monde |
| Arbre pin | 0.7 – 0.9 |
| Buisson | 0.12 – 0.18 |
| Maison colonie | 0.28 – 0.34 |
| Quai | ~0.35 longueur |
| Segment de route | ~0.84 longueur |

Pivot au sol (Z Blender → Y Three après export `yup`).

## Budgets triangles

- petit décor : 50–400
- arbre / rocher principal : 150–800
- bâtiment : 500–2500 (H1 houses restent sous 800)

Max 1–3 matériaux par modèle.

## Éclairage de référence

- Soleil directionnel chaud, azimut NW
- Remplissage froid discret
- Ombres douces
- Fond pastel (brouillard / ciel saisonnier côté runtime)

## Scène étalon H1

Sept hexagones :

1. forêt
2. plaine
3. montagne
4. prairie
5. désert
6. côte
7. océan

Props obligatoires : route, colonie, port/quai, jeton de production.

## Règles de modélisation

1. Flat shading + normales cohérentes
2. 2–4 variations significatives par famille (H1 : pines a/b, bushes a/b, rocks a/b/c, houses a/b)
3. Transformations appliquées avant export
4. Noms de nœuds stables (`tree_pine_a`, …)
5. Licence + provenance documentées
6. Preview orthographique avec le même langage lumière que le jeu

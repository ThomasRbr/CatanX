# Textures de terrain

## Pipeline

`tools/build_terrain_pbr.py` produit les jeux PBR consommés par la surface de
biomes continue. Il remplace `build_pbr_from_albedo.py` pour le terrain.

```bash
python tools/build_terrain_pbr.py            # tout
python tools/build_terrain_pbr.py --only wheat_rows
python tools/build_terrain_pbr.py --dry-run  # liste sources et résolutions
```

### Deux règles qui coûtaient de la qualité

**1. Jamais d'agrandissement.** L'ancien pipeline rééchantillonnait des sources
1254 px vers 2048 px. Un agrandissement n'invente aucun détail : la variance
laplacienne chutait d'un facteur six. La taille de sortie est bornée par la
source, et arrondie à la puissance de deux inférieure.

**2. Les vraies cartes scannées d'abord.** Là où un photoscan Poly Haven est
présent, ses propres cartes normal / roughness / AO sont réduites et utilisées
telles quelles. Dériver une normale de la luminance de l'albédo suppose que
sombre = bas, ce qui est faux sur un sol : une feuille mouillée sombre n'est pas
un creux. La dérivation est devenue le repli, pas le défaut — et elle travaille
sur une hauteur passe-haut, pour que l'ombrage large de l'albédo ne se
transforme plus en bosses.

L'ancien pipeline appliquait aussi `Color(0.82)` et `Contrast(0.94)`, soit 18 %
de désaturation sur chaque carte. Supprimé.

### Gain mesuré (netteté = variance laplacienne)

| Biome   | Avant | Après |      |
| ------- | ----: | ----: | ---: |
| prairie |   628 | 2 335 | ×3,7 |
| forêt   |   957 | 6 867 | ×7,2 |
| argile  |   562 | 1 214 | ×2,2 |
| dune    |   326 |   626 | ×1,9 |
| roche   |   533 | 3 848 | ×7,2 |
| blé     |   358 | 2 586 | ×7,2 |

## Sources par biome

| Famille | Source                                 | Cartes   |
| ------- | -------------------------------------- | -------- |
| prairie | Poly Haven `leafy_grass` 4K            | scannées |
| forêt   | Poly Haven `forrest_ground_03` 4K      | scannées |
| argile  | Poly Haven `red_mud_stones` 4K         | scannées |
| sable   | Poly Haven `sand_01` 4K                | scannées |
| roche   | `alpine_strata_scan_source_v3` 1254 px | dérivées |
| blé     | `wheat_rows_source_v1` 1254 px         | dérivées |

⚠️ La roche utilise la source **v3**, pas la v4. La v4 est une dalle d'ardoise
polie sans contraste : c'est elle qui faisait ressembler les montagnes à du
béton coulé. La v3 est de la roche fracturée, avec fissures et relief.

## Lisibilité des biomes

Un joueur doit pouvoir nommer la ressource d'un coup d'œil. Les multiplicateurs
de teinte du shader ne sont donc pas réglés à l'œil : chacun projette la couleur
moyenne de son scan sur une cible chromatique, et les six cibles sont vérifiées
en séparation deux à deux.

| Famille | Teinte | Clarté | Saturation |
| ------- | -----: | -----: | ---------: |
| prairie |    88° |   0,41 |       0,46 |
| forêt   |    55° |   0,22 |       0,27 |
| blé     |    40° |   0,51 |       0,67 |
| roche   |   220° |   0,39 |       0,04 |
| argile  |    18° |   0,36 |       0,61 |
| sable   |    38° |   0,68 |       0,38 |

La paire la plus proche passe de **0,138 à 0,279**. Les valeurs précédentes
laissaient prairie à 67° et forêt à 61° — deux olives quasi identiques.

## Échelle et lecture à distance

Un motif se répète tous les ~1,3 unité monde, soit ~1,5 fois par tuile. À la
distance de jeu une tuile fait ~130 px : le mipmap moyenne 2048 px de texture en
aplat. Trois couches répondent à ça :

- **Macro** — bruit de valeur basse fréquence sur l'albédo. C'est la seule
  couche qui survit à la minification ; sans elle l'île se lit comme du carton
  peint. (Trois sinus sommés produisaient un réseau régulier visible ; le bruit
  de valeur n'a pas de direction privilégiée.)
- **Anti-tiling** — second échantillon de la prairie à une échelle tournée et
  non commensurable, fondu par bruit basse fréquence.
- **Triplanaire** — sur le canal roche uniquement. Les UV sont une projection
  planaire XZ, correcte au sol et fausse sur une falaise. Depuis que le relief
  des montagnes a été relevé, une face quasi verticale recevait une seule
  colonne de texels étirée sur toute sa hauteur. Seule la roche paie ce coût,
  car la fonction de poids force déjà la roche sur tout ce qui est raide.

## Poids

⚠️ `apps/client/dist` pèse **774 Mo**, dont **318 Mo** de textures de terrain
pour ~29 Mo réellement référencés. Deux causes, toutes deux antérieures à ce
travail :

- 176 Mo de pack Poly Haven 4K, servi uniquement au palier `4k` ;
- ~116 Mo de jeux orphelins (v1/v2 morts de longue date, plus les v3/v4
  remplacés).

Ces fichiers ne sont pas suivis par git : leur suppression serait irréversible,
elle n'a donc pas été faite ici.

## Végétation dressée

`decorations/WindFoliage.tsx` — quads croisés instanciés, pivot au sol,
animés par le vent. Utilisé par le blé.

Un champ n'est pas une texture posée par terre : il a un volume qui accroche la
lumière clé sur un côté, se projette de l'ombre sur lui-même, et bouge.
L'ancienne canopée de blé posait 55 cartes **quasi horizontales** par tuile.

- L'attribut `aTip` (0 à la base, 1 au sommet) permet de courber la touffe sans
  squelette. La flexion va en `aTip²` : la base reste plantée, les épis voyagent.
- La phase du vent dépend de la **position monde**, pour que les touffes voisines
  se couchent ensemble dans une rafale au lieu d'osciller chacune sur son horloge.
- `alphaTest`, jamais `transparent` : les touffes écrivent la profondeur et se
  trient donc gratuitement. Des milliers de quads transparents demanderaient un
  tri arrière-avant à chaque image et continueraient de z-fighter.

⚠️ La couleur vient d'une **recolorisation par la luminance**, pas d'une
multiplication. L'impostor est une photo d'herbe verte : la multiplier par une
teinte dorée ne donne pas du blé doré mais du brun boueux, parce que le vert est
le seul canal porteur de signal et que le bleu de la teinte l'éteint.

## Feuillage

`decorations/foliageTranslucency.ts` ajoute une diffusion enveloppante et une
transmission à contre-jour aux couronnes d'arbres. Le diffus standard coupe au
noir dès qu'une surface dépasse 90° de la lumière — correct pour de la roche
opaque, faux pour une aiguille. Sans ce terme, une canopée à contre-jour est une
silhouette noire plate, ce qui était exactement le cas des conifères de l'île.

## Prairie

⚠️ La couverture au sol de la prairie appartient à **`TerrainMicroScatter`**
(touffes, patchs de pelouse, fleurs) — pas à un composant dédié. Une canopée
séparée y a été ajoutée puis retirée : elle doublonnait un système existant, et
empiler les deux est ce qui a donné l'aspect « buissons agglutinés ».

La vraie cause de cet aspect était ailleurs : la recette `pasture_fenced`
prévoyait `scrub: [18, 26]`, soit jusqu'à 26 buissons par tuile. Une pâture est
broutée — c'est ce qui la définit. Le budget est descendu à `[3, 6]` avec un
`edgeBias` élevé (haies en bordure), au profit d'arbres épars et du troupeau.

⚠️ Les moutons étaient posés à `HEX_SLAB_THICKNESS` fixe. Depuis que la table
d'élévation a été relevée, ils se retrouvaient sous le sol : ils échantillonnent
maintenant le heightfield, comme tout le reste.

## Lisibilité des constructions

Les villages doivent tenir contre le terrain, pas s'y fondre. Chaque couleur de
matériau **multiplie** un albédo photographique déjà sombre : à `#3a4048` un
toit d'ardoise linéarise vers 0,04, donc le produit était pratiquement noir et
un village posé en forêt disparaissait. Les tons sont désormais moyens, avec une
`envMapIntensity` environ triplée pour que le ciel atteigne réellement les murs.

⚠️ C'est le **même mécanisme** que les couronnes d'arbres et que le
micro-scatter : un multiplicateur inférieur à 1 sur une texture sombre écrase au
noir. Avant de rendre une surface plus claire, vérifier si le vrai problème
n'est pas un multiplicateur qui assombrit.

## Cartes au sol

⚠️ `grass_lawn_topdown_v1.png` est **entièrement opaque** (couverture alpha =
1,00). Son `alphaTest: 0.36` ne découpait donc rien, et chaque patch se rendait
comme un rectangle à arêtes franches posé sur le terrain — ce que l'œil lit
comme des ombres mal dessinées éparpillées au sol. `attachLawnEdgeFade` ajoute un
fondu radial par carte via un attribut `aCard` (la coordonnée 0..1 du coin,
conservée séparément parce que l'UV d'échantillonnage est décalé et redimensionné
par carte).

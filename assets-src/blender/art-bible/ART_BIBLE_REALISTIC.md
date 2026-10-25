# CatanX — Bible visuelle du diorama réaliste

Cette bible remplace `ART_BIBLE_H1.md` pour tous les nouveaux assets. H1–H3
restent des fallbacks historiques et ne définissent plus la direction artistique.

## Intention

- Île crédible observée comme une maquette cinématographique haut de gamme.
- Matériaux naturels, peu saturés : terre, pierre, bois patiné, métal, eau et végétation.
- Les hexagones restent dans le moteur mais ne sont visibles que pour une interaction ou la grille.
- Le réalisme sert la lecture : les bâtiments et routes sont légèrement surdimensionnés.
- Les couleurs joueurs restent sur les fanions, liserés, marqueurs et socles fins.

## Interdits

- `flatShading` sur un asset réaliste final ;
- proportions de jouet, aplats pastel, plastique brillant ou socle circulaire opaque ;
- limite d'hexagone permanente sur le terrain ;
- asset sans LOD, licence, source et métadonnées ;
- texture sans mipmaps ou matériau PBR non borné ;
- information de gameplay transmise uniquement par la couleur.

## Échelle monde

| Élément | Empreinte / hauteur cible |
|---|---|
| Hexagone | rayon 1 unité |
| Colonie | empreinte 0,36 ; tour 0,45 |
| Ville | empreinte 0,46 ; tour 0,52 |
| Route | largeur visuelle 0,19–0,24 |
| Arbre | 0,55–0,9 selon essence |
| Massif | 0,7–1,15 au-dessus du sol |

Les intersections doivent rester planes. Les objets suivent `sampleSurfaceHeight`
et leurs hitboxes restent séparées du maillage visuel.

## Matériaux et lumière

- Albedo sans ombre peinte excessive.
- Normal, roughness et AO dédiés ; height uniquement en Ultra.
- Roughness naturelle généralement comprise entre 0,72 et 0,98.
- Métal limité aux ferrures, armes, toitures métalliques et éléments fantastiques.
- Soleil directionnel chaud, environnement froid discret, exposition ACES.
- Les fenêtres peuvent être émissives, mais sans halo qui efface les façades.

## Assets de bâtiments

- LOD0 : 8 000–25 000 triangles, lecture cinématique.
- LOD1 : 4 000–12 000 triangles, vue de jeu normale.
- LOD2 : 1 500–5 000 triangles, cartes epic et zoom éloigné.
- Architecture asymétrique avec fondations, ouvertures, cheminées, charpente et accès.
- Aucun disque de sol intégré : le bâtiment doit appartenir au terrain.

## Validation

1. Capture déterministe de l'île H7 sans HUD.
2. Capture d'une vraie partie en carte petite et epic.
3. Propriétaire et type du bâtiment lisibles à la vue stratégique.
4. Route continue et visible malgré neige, relief ou végétation.
5. Aucun asset ne flotte ou ne coupe le sol.
6. Profils Balanced et Ultra vérifiés ; budget draw calls respecté.

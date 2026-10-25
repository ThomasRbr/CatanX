# H2 — Pipeline GLB réel

**Statut :** polish H2 appliqué — prêt pour revue visuelle. Ne pas démarrer H3 avant validation.

## Livrables

| Item | Statut |
|---|---|
| Chargeur `useVisualGeometry` + fallback `meshCatalog` | OK |
| Préchargement `preloadBoardAssets()` dans `ThreeHexBoard` | OK |
| Manifeste H1+H2 typé | OK (30 assets) |
| Variantes instanciées (arbres / buissons / rochers) | OK |
| Densité biomes ↑ + LOD thinning | OK |
| Ports / champs / brigand / ville / routes en GLB | OK |
| Générateur `generate_h2_batch.py` | OK (8 assets) |
| Validation / typecheck / tests | OK |

## Polish H2 appliqué

- Routes classiques via `road_segment_a` (yaw X-long comme H1)
- Teinte joueur limitée à `banner_a` (maisons / villes gardent leurs matériaux)
- Variantes `house_settlement_a|b` selon l’id bâtiment
- Collines : plus de rochers + teinte argile (instanceColor)
- Montagnes : pics plus petits, clearance token élargie
- Champs : rangées plus denses / plus lisibles
- Brigand légèrement agrandi ; labels ports FR (Bo/Mi/Bl/Mo/Ar)

## Densités H2 (LOD0)

- forêt 13–19, jungle 15–22, prairie 9–14, plaines 10–16
- collines 10–15, désert 8–13, montagne 5–8
- LOD1 ≈ 60 %, LOD2 ≈ 35 % (+ scrub off)

## Commandes

```bash
npm run assets:blender:generate
npm run assets:blender:validate
npm run typecheck
npm run test -- apps/client/src/render3d
```

## Voir en jeu

Le serveur dev charge la carte classique avec les GLB préchargés.
Scène étalon H1 toujours sur `/?scene=h1`.

# Renderer Diorama réaliste

Le renderer de production est désormais isolé derrière une projection visuelle :

```text
GameState autoritaire
→ projectBoardRenderSnapshot()
→ BoardRenderSnapshot figé et sans données privées
→ DioramaRenderer
→ nodeId / edgeId / tileId
→ commandes existantes
```

## Scène étalon

Les quatre cadrages contractuels sont accessibles sans lancer de partie :

- `/?scene=diorama&season=summer&shot=island&view=cinematic`
- `/?scene=diorama&season=summer&shot=village&view=cinematic`
- `/?scene=diorama&season=winter&shot=island&view=cinematic`
- `/?scene=diorama&season=summer&shot=strategic`

Le test Playwright `e2e/diorama-reference.spec.ts` produit les captures déterministes dans
`docs/captures/`.

## Backends et repli

- WebGL 2 est le backend stable.
- WebGPU est détecté et exposé comme laboratoire, mais reste derrière la validation de parité.
- Une panne entraîne `Diorama → Three Legacy → Pixi` uniquement pour la session courante.
- Une panne transitoire ne réécrit pas la préférence persistée.

## État de la production

Livré récemment : clusters villageois multi-bâtiments (`RealisticVillage`), densification
végétation Ultra, routes creusées avec ornières, rochers mouillés + écume renforcée,
neige non uniforme (pente/altitude/vent), éclairage IBL moins brun, atmosphère
cinématique (tilt-shift approximatif).

La bibliothèque artistique finale (espèces végétales GLB, architecture Blender LOD,
eau multi-fréquences, WebGPU) reste une production incrémentale : chaque famille doit
passer la scène étalon et la grille 9/10 avant généralisation.

Voir `wow.txt` pour les écarts restants vs la référence.


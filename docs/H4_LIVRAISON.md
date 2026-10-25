# H4 — Vie et animations

**Statut :** polish appliqué — prêt pour revue visuelle. Ne pas démarrer H5 avant validation.

## Livrables

| Item | Statut |
|---|---|
| `AmbientAnimationProvider` (horloge + vent partagés) | OK |
| Réglages vitesse (0.5 / 1 / 1.5 / 2) + réduction motion | OK |
| Eau branchée sur l’horloge ambiante | OK |
| Vent GPU arbres + champs (`instanceWind`) | OK |
| Bannières (sway, LOD-aware) | OK |
| Fumée / bateaux / moulins / moutons pâturage | OK |
| FX construction (anneau) / upgrade / route (trait A→B) / production | OK |
| Brigand idle bob | OK |
| Marqueurs d’événements sur horloge ambiante | OK |

## Polish H4 appliqué

- Vent GPU attaché dès la création du matériau + `USE_INSTANCING` safe
- Horloge : vitesse lue depuis le ref (changement de réglage immédiat)
- Route : le trait **pousse depuis une extrémité**, plus un shrink depuis le centre
- Construction : burst + anneau ; upgrade colonie→ville aussi
- Vie ambiante : voiles, moulins (≤3), critters pâturage (≤8), dispose matériaux
- LOD2 coupe vent décor / bannières / bob brigand

## Voir en jeu

```bash
npm run dev
```

Hard-refresh → Nouvelle partie → Classique → Lancer.

Observer : vagues, vent, fumée, bateaux, moulins, moutons, FX pose, vitesse dans Paramètres.

Console : `window.__catanxRenderPerf` (budget classique ≤150 DC).

## Tests

```bash
npm run test -- apps/client/src/render3d
```

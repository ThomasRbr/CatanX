# H7 — Polish promotionnel

**Statut :** livré — prêt pour revue visuelle.

## Changements

| Domaine | Détail |
|---|---|
| **Cadrage** | Bounds île (hors océan), zoom plus serré (margin 1.05, tilt 0.82) |
| **Vue cinématique** | `?view=cinematic` + bouton ; HUD masqué ; Échap pour quitter ; retour auto si interaction requise |
| **Éclairage** | Fog cinématique, exposition dynamique 1.05–1.08, contact shadows adaptés à la taille de l’île |
| **Post** | Vignette adoucie (~0.14–0.16) |
| **Collisions** | Distance min entre décors « tall » sur une tuile |
| **LOD1** | Arbres/rochers ~55 %, scrub/champs ~65 % |
| **Scène H7** | Anneau classique 7 hex, pipeline ortho live |

## Voir

```bash
npm run dev
```

- [Scène H7](http://127.0.0.1:3000/?scene=h7)
- [H7 cinématique](http://127.0.0.1:3000/?scene=h7&view=cinematic)
- Partie live : bouton **Vue cinématique** en bas à droite

Hard-refresh recommandé. Métriques : `window.__catanxRenderPerf`.

## Validation

```bash
npx vitest run apps/client/src/render3d/utils/__tests__/fitOrthographicCamera.test.ts apps/client/src/render3d/camera/__tests__/viewMode.test.ts apps/client/src/render3d/decorations/__tests__/deterministicDecoration.test.ts
```

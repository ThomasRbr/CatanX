# H1 — Livraison scène étalon (à valider artistiquement)

**Statut :** polish H1 appliqué — prêt pour revue visuelle. Ne pas démarrer H2 avant validation.

## Preuves demandées

| # | Livrable | Statut |
|---|---|---|
| 1 | Blender installé + headless | **Blender 5.2.0 LTS** — `npm run assets:blender:check` OK |
| 2 | Scripts check / find / generate / previews | `tools/blender/*.ps1` + scripts npm |
| 3 | Scène étalon 7 hex | `/?scene=h1` et `/?scene=h1&view=cinematic` |
| 4 | ≥20 GLB Blender | **22** assets (+ 7 alias legacy) |
| 5 | Sources Python | `tools/blender/generators/generate_h1_batch.py` + `lib/` |
| 6 | Planche previews | `assets-src/blender/previews/h1_asset_sheet.png` |
| 7 | Captures normale / cinématique | `assets-src/blender/previews/h1_browser_*.png` |
| 8 | Art bible | `assets-src/blender/art-bible/ART_BIBLE_H1.md` |
| 9 | Métriques | `window.__catanxRenderPerf` |
| 10 | Validation / typecheck / tests / build | OK |

## Polish H1 appliqué

- Cadrage serré (zoom ~96 / 112) + OrbitControls
- Densité diorama par biome
- Eau en dégradé sous l’île
- Hex avec côtés colorés + oversize anti-gaps
- Route alignée sur l’axe X du GLB
- Teinte joueur limitée à la bannière (pas toute la maison)
- Ombres adoucies / HUD opaque
- Vue cinématique sans chrome (bouton quitter)

## Ouvrir la scène

```bash
npm run dev
```

- [Vue normale](http://127.0.0.1:3000/?scene=h1)
- [Vue cinématique](http://127.0.0.1:3000/?scene=h1&view=cinematic)

Dans la console : `window.__catanxRenderPerf`.

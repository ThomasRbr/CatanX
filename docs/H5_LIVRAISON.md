# H5 — Villes, ports et civilisations

**Statut :** polish bugs corrigés — prêt pour revue visuelle. Ne pas démarrer H6 avant OK.

## Livrables

| Item | Statut |
|---|---|
| Colonies multi-bâtiments (2 maisons + puits/feu) | OK |
| Villes / métropoles (hall + satellites + props + tour) | OK |
| Accents civilisation (IDs réels : merchants, northerners, empire…) | OK |
| Routes pavées près des villes | OK |
| Ponts uniquement land ↔ ocean/lake/river | OK |
| Ports enrichis (quai + entrepôt + cargo) | OK |
| Route dirt = GLB H1 (plus écrasée par le procédural) | OK |

## Polish / bugs corrigés

- Ponts trop agressifs (toute arête `coast`) → **land ↔ eau ouverte** seulement
- Accents civ sur faux ids (`nordic`) → `northerners`, `merchants`, `scholars`…
- Colonnes empire sur chaque colonie → **villes seulement**
- Clusters trop denses → footprint / scales réduits
- `road_segment_a` forcé en procédural → **GLB dirt restauré**
- Routes pavées / ponts : teinte joueur conservée (ownership lisible)
- Pavés : dalles distinctes (plus un slab plat)
- Ports : échelle baissée, cargo/entrepôt recalés, plus vers le large
- HP bars / fumée : hauteurs adaptées aux clusters

## Voir en jeu

```bash
npm run dev
```

Hard-refresh → Nouvelle partie → Classique → poser colonies / upgrader / routes côtières.

## Tests

```bash
npx vitest run src/render3d/entities/__tests__/buildingCluster.test.ts src/render3d/utils/__tests__/resolveRoads.test.ts
```

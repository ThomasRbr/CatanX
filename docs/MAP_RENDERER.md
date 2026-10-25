# Rendu de la carte — Three (défaut) et Pixi (historique)

Depuis la **Phase G**, le plateau utilise **Three.js / R3F** par défaut.

Le moteur de règles (`packages/engine`) reste **indépendant** du rendu : aucun changement de save, réseau, IA ou règles.

## Choisir le rendu

1. Ouvrir **Paramètres**
2. Section **Développeur** → **Rendu de la carte**
3. Options :
   - `Three.js 3D (défaut)` — diorama orthographique low-poly
   - `PixiJS (historique)` — plateau 2D conservé au moins une version complète

Réglage persisté dans `localStorage` (`catanx_frontend_settings_v1` → `mapRenderer`).

La migration persist v1 force Three **une seule fois** (upgrade depuis l’ancien défaut Pixi). Les bumps futurs **préservent** un choix Pixi explicite.

## Fallback automatique

Bascule vers Pixi (et synchronise le réglage) si :

- WebGL 2 est indisponible
- le montage Three échoue (`ThreeMapErrorBoundary`)

## Développement

| Sujet | Chemin |
|-------|--------|
| Switch | `apps/client/src/components/Map/MapBoard.tsx` |
| Plateau 3D | `apps/client/src/render3d/` |
| Plateau Pixi | `apps/client/src/components/Map/HexBoard.tsx` |
| Réglage | `apps/client/src/store/settingsStore.ts` |
| Suivi migration | [PLAN_CARTE_3D.md](./PLAN_CARTE_3D.md) |

Régénérer les GLB premium :

```bash
npm run export:glb
```

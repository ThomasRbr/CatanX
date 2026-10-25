# Suivi — Carte 3D orthographique CatanX

Plan de migration du plateau PixiJS vers un renderer Three.js / R3F low-poly (inspiration visuelle type diorama, assets originaux).

**Règle d’or :** ne pas toucher au moteur, à l’IA, aux sauvegardes, au réseau ni aux règles. Pixi reste disponible via Paramètres (renderer historique).

**Réglage actuel :** Paramètres → Développeur → Rendu de la carte (`three` | `pixi`). Défaut = `three`. Voir [MAP_RENDERER.md](./MAP_RENDERER.md).

---

## Vue d’ensemble — 7 phases

| Phase | Nom | Statut |
|-------|-----|--------|
| **A** | Socle expérimental | ✅ Faite |
| **B** | Vertical slice artistique | ✅ Faite |
| **C** | Parité Catan classique | ✅ Faite |
| **D** | Entités et systèmes avancés | ✅ Faite |
| **E** | Saisons et vie | ✅ Faite |
| **F** | Assets premium et optimisation | ✅ Faite |
| **G** | Activation par défaut | ✅ Faite |

Légende : ✅ faite · 🔄 en cours · ⬜ à faire · ⏸ en pause

---

## Phase A — Socle expérimental ✅

**Objectif :** Canvas orthographique, carte réelle depuis `GameState`, pan / zoom / cadrage, clic de tuile, bascule Pixi ↔ Three.

### Livré
- [x] Dépendances `three`, `@react-three/fiber`, `@react-three/drei`
- [x] Dossier `apps/client/src/render3d/`
- [x] Réglage `mapRenderer` + fallback WebGL 2 → Pixi
- [x] `hexToWorld` cohérent avec `hexToPixel`
- [x] Dalles hex, caméra fixe (~40°), sélection / survol de tuiles
- [x] Code-split du chunk Three (Pixi reste léger)
- [x] Tests unitaires + capture `docs/captures/phase-a-three-hex-board.png`

### Validation
Carte complète visible, moteur inchangé, chaque tuile sélectionnable (hors placement initial).

---

## Phase B — Vertical slice artistique ✅

**Objectif :** Que la carte évoque un diorama low-poly, pas une grille de polygones colorés.

### Livré
- [x] Terrains classiques en primitives (plaines, forêt, colline, montagne, pâturage, désert, océan…)
- [x] Végétation, rochers, champs, dunes, pics (InstancedMesh)
- [x] Transitions / lisières directionnelles
- [x] Eau continue + côtes (sable / écume)
- [x] Jetons de production (texture canvas, 6/8 mis en avant, pips)
- [x] Palette / lumière / échelle cohérentes
- [x] Décorations **déterministes** (`mapSeed` + `tileId` + layer)
- [x] Capture sans HUD : `docs/captures/phase-b-three-diorama.png`
- [x] Polish : côtes instanciées + orientation rivage, eau profonde/peu profonde, champs alignés, jetons billboard stables, fuites matériaux transitions

### Validation
Capture sans HUD → diorama cohérent (arbres, pics, champs, jetons, mer).

---

## Phase C — Parité Catan classique ✅

**Objectif :** Jouer une partie classique entière en 3D.

### Livré
- [x] Brancher `CatanTopology` via `topologyToWorld` (IDs canoniques, positions world)
- [x] Routes, colonies, villes, ports, brigand (`Roads3D`, `Buildings3D`, `Ports3D`, `Robber3D`)
- [x] Placement initial complet (sommets + routes) — `PlacementOverlay3D`
- [x] Survol / sélection tuiles hors placement ; focus caméra inchangé
- [x] Grille contextuelle pendant le placement (ou option réglages)
- [x] Tests topology + E2E placement + capture `docs/captures/phase-c-three-placement.png`

### Validation
Placement initial village + route jouable en Three sans revenir à Pixi.

### Polish (post-C)
- [x] Routes post-setup sur arêtes topology (action-log `edgeId`), plus stubs moteurs
- [x] Hitboxes placement élargies + hover + nœuds invalides (rouge) + anneaux occupés
- [x] Brigand décalé ; jeton de prod masqué sous le brigand
- [x] Ports orientés mer + labels ratio ; topology partagée une fois / scène
- [x] ESLint refs placement ; `resolveLayoutSize` extrait

---

## Phase D — Entités et systèmes avancés ✅

**Objectif :** Modules CatanX au-delà du classique.

### Livré
- [x] Bâtiments avancés (ferme, mine, marché, bibliothèque, caserne, muraille, port, temple + fallback)
- [x] Unités (ouvrier, éclaireur, mêlée, tir + auras statut / HP)
- [x] FX courts : move / combat / mort / construction + pont `catanx:*`
- [x] Brouillard de guerre (`FogOfWar3D`, parité alphas Pixi)
- [x] Évolutions visuelles : niveau bâtiment, métropole distincte
- [x] Événements localisés (`EventMarkers3D` + bursts, fallback générique)
- [x] Tests + capture `docs/captures/phase-d-three-entities.png`

### Polish (post-D)
- [x] FX animés via refs (plus de bursts figés) + trails de mouvement
- [x] Ponts `catanx:combat` / `resource-float` alignés Pixi ; reset sur `gameState.id`
- [x] Fog instancié + volume plus haut ; FoW via `displayPlayerId`
- [x] HP billboard ; marqueurs événements « ! » + bob ; bâtiments inactifs voilés
- [x] Helpers extraits (`unitKind`, `buildingVisual`, `eventMarkerKind`)

---

## Phase E — Saisons et vie ✅

**Objectif :** Scène vivante mais lisible ; mode sans animation OK.

### Livré
- [x] Variations printemps / été / automne / hiver (`SceneEnvironment` + eau / feuillage)
- [x] Eau animée (pulse) + balancement léger des frondaisons
- [x] Effets d’événements localisés + burst de changement de saison
- [x] LOD selon zoom caméra (scrub / sway / pulse gelés en LOD2)
- [x] Respect de `showAnimations` / reduced motion (via App)
- [x] Tests + capture `docs/captures/phase-e-three-seasons.png`

### Validation
Vivant sans nuire à la lecture stratégique ; teinte saison toujours on, motion gated.

### Polish (post-E)
- [x] Teinte ~8% wash Pixi (plus de swap hard autumn)
- [x] Burst saison unique (`catanx:season-transition` only)
- [x] Sway par instance (plus d’orbite autour de l’origine)
- [x] Eau : couleurs via refs ; reset pulse à l’arrêt
- [x] Matériaux feuillage/scrub par montage ; LOD avec hystérésis + sync au fit

---

## Phase F — Assets premium et optimisation ✅

**Objectif :** Remplacer les primitives, tenir les budgets perf.

### Livré
- [x] Modèles GLB originaux (`public/assets/models/*.glb`) + licence (`render3d/assets/LICENSE.md`)
- [x] Catalogue procédural `meshCatalog.ts` + `npm run export:glb`
- [x] Terrain hex instancié par biome (vertex colors) ; transitions / jetons / nœuds invalides instanciés
- [x] Ombres LOD0 only ; shadow map 2k/1k/512 ; hitboxes `visible={false}`
- [x] Post-traitement léger : vignette NDC (LOD &lt; 2)
- [x] `PerfStats3D` → `window.__catanxRenderPerf` + budgets 150 / 300
- [x] Chunk Vite `three` séparé ; tests + E2E multi-taille + capture `docs/captures/phase-f-three-premium.png`

### Budgets cibles (1920×1080 desktop moyen)
- 60 FPS carte classique / standard
- ≥ 45 FPS plus grande carte
- &lt; 150 draw calls classique / &lt; 300 grande carte

### Validation
Budgets atteints (E2E), pas de pop-in visible (LOD hystérésis Phase E).

### Polish (post-F)
- [x] GLB régénérés + verts settlement/city neutres (couleur joueur lisible)
- [x] Teinte saison : arbres sans multiplier le tronc ; scrub soft-wash
- [x] Grille contextuelle placement restaurée (1× LineSegments)
- [x] Vignette `toneMapped: false` + dispose + fade LOD
- [x] Shadow map : resize uniquement en LOD0 (anti-flicker)
- [x] Labels jetons toujours on ; nœuds invalides mémoïsés

---

## Phase G — Activation par défaut ✅

**Objectif :** Three devient le renderer par défaut.

### Livré
- [x] `mapRenderer` défaut = `three` (+ migration persist v1)
- [x] Pixi conservé (HexBoard + réglage « historique »)
- [x] Doc retour renderer : [MAP_RENDERER.md](./MAP_RENDERER.md), Guide, Paramètres, README
- [x] Fallback WebGL 2 / error boundary → Pixi inchangé
- [x] E2E défaut Three + bascule Pixi ; capture `docs/captures/phase-g-three-default.png`

### Parité (acceptation)
- Moteur indépendant de Three
- Partie classique jouable en Three (placement Phase C+)
- Pixi disponible une version complète via Paramètres
- Budgets perf Phase F toujours applicables

### Validation
Critères d’acceptation finaux du plan remplis.

### Polish (post-G)
- [x] Migrate `fromVersion < 1` only (préserve Pixi après bumps futurs)
- [x] MapBoard : attendre hydratation persist ; sync fallback → `setMapRenderer('pixi')`
- [x] Preload chunk Three ; shadow mapSize JSX stable
- [x] Libellés FR « Rendu de la carte » ; doc MAP_RENDERER alignée

---

## Fichiers clés

| Rôle | Chemin |
|------|--------|
| Switch Pixi / Three | `apps/client/src/components/Map/MapBoard.tsx` |
| Plateau 3D | `apps/client/src/render3d/ThreeHexBoard.tsx` |
| Scène | `apps/client/src/render3d/CatanXWorld.tsx` |
| Caméra | `apps/client/src/render3d/camera/` |
| Terrains | `apps/client/src/render3d/terrain/` |
| Coordonnées | `apps/client/src/render3d/utils/hexToWorld.ts` |
| Capture Phase A | `docs/captures/phase-a-three-hex-board.png` |
| Capture Phase B | `docs/captures/phase-b-three-diorama.png` |
| Capture Phase C | `docs/captures/phase-c-three-placement.png` |
| Topology 3D | `apps/client/src/render3d/utils/topologyToWorld.ts` |
| Entités jeu | `apps/client/src/render3d/entities/` |
| Placement | `apps/client/src/render3d/interaction/` |
| Capture Phase D | `docs/captures/phase-d-three-entities.png` |
| Capture Phase E | `docs/captures/phase-e-three-seasons.png` |
| Capture Phase G | `docs/captures/phase-g-three-default.png` |
| Doc renderer | `docs/MAP_RENDERER.md` |
| Assets GLB / catalogue | `apps/client/public/assets/models/`, `render3d/assets/` |
| Perf budgets | `render3d/utils/perfBudgets.ts`, `fx/PerfStats3D.tsx` |
| Saisons / LOD | `apps/client/src/render3d/utils/seasonVisuals.ts`, `mapLod.ts` |
| Unités / fog / FX | `apps/client/src/render3d/entities/`, `fx/` |
| Décorations | `apps/client/src/render3d/decorations/` |
| Jetons | `apps/client/src/render3d/entities/ProductionToken3D.tsx` |

---

## Comment suivre

1. Cocher les items au fur et à mesure.
2. Mettre à jour le **statut** dans le tableau du haut.
3. Ne passer à la phase suivante qu’après validation de la phase courante.
4. Après chaque phase : `npm run typecheck`, tests ciblés, `npm run build`.

**Prochaine étape recommandée :** polish éventuel post-G / parties complètes manuelles ; Pixi reste disponible.

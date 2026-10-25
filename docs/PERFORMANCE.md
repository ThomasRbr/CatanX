# Performance & budgets (Phase 7)

## Budgets JS (gzip)

Vérifiés par `npm run budget` après `npm run build` :

| Métrique                    | Seuil         |
| --------------------------- | ------------- |
| Chunk `index-*.js` (entrée) | ≤ 280 Ko gzip |
| Total de tous les `.js`     | ≤ 420 Ko gzip |
| Taille brute `index-*.js`   | ≤ 900 Ko      |

Les chunks `pixi`, `engine`, `motion` et `socket` sont séparés via `manualChunks` dans `apps/client/vite.config.ts`. Le script `budget` échoue si l’entrée ou l’un de ces chunks est absent.

## FPS

- Compteur optionnel : Paramètres → **Afficher le compteur FPS** (persisté)
- Mesure : FPS du **thread principal** (`requestAnimationFrame`), pas du ticker Pixi
- Cible desktop partie classique (carte tiny/medium) : **≥ 30 FPS**
- Vert ≥ 50, orange ≥ 30, rouge &lt; 30 (affiche `—` avant le premier échantillon)

## Lazy-load

Écrans / surfaces chargés à la demande (`apps/client/src/lazy/screens.tsx`) :

- HexBoard (Pixi)
- GameSetup, LoadGame (via « Charger une partie »), MultiplayerLobby
- DiplomacyModal, TechTreeModal, HelpGuideModal
- CraftPanel

Le shell menu / HUD reste dans l’entrée ; le moteur et Pixi sont isolés en chunks.

## Robustesse

- `AppErrorBoundary` (racine) — Réessayer remonte l’arbre
- `MapErrorBoundary` (carte Pixi) — Réessayer / Recharger + message d’erreur
- Erreurs métier : bannière `lastActionError` + rejets multijoueur

## Rendu 3D — coût par fragment

Mesuré sur une carte rayon 2, profil `high`, 1600×900 :

|                        | Avant  | Après   |
| ---------------------- | ------ | ------- |
| FPS                    | 39     | ~60     |
| DPR effectif           | 0,85   | 1,25    |
| Draw calls             | 80     | 73      |
| `shadowMap.autoUpdate` | `true` | `false` |

La géométrie n'a jamais été le facteur limitant (~100 k triangles, ~70 draw
calls). Le coût était par fragment :

- **`MeshPhysicalMaterial` quasi partout** (83 meshes sur 84). `Physical` évalue
  clearcoat, sheen, iridescence et transmission sur chaque fragment. La plupart
  de ces matériaux n'utilisaient qu'un clearcoat de 0,01 à 0,12 — invisible.
  Rétrogradés en `MeshStandardMaterial`, sauf `CoastalWetRocks` (clearcoat 0,72,
  roche mouillée réelle).
- **Six sources lumineuses** : chaque matériau payait six évaluations. Le rig
  fait maintenant trois (voir `docs/ATMOSPHERE.md`).
- **Shadow map régénérée à chaque frame** alors que le soleil et le plateau sont
  statiques. `StaticShadowBake` la fige, avec ré-invalidation sur la révision du
  snapshot, la saison, le climat et la couche — sinon une ombre figée devient
  silencieusement obsolète quand un village se construit.
- **Plancher DPR relevé de 0,85 à 1**. Les 28 % de pixels économisés rendaient
  chaque arête du plateau floue. Une machine trop juste doit perdre des images,
  pas de la netteté.

⚠️ `npm run budget` échoue (929 Ko gzip contre un plafond de 420 Ko), mais c'est
structurel et antérieur : `three` (312 Ko) + `pixi` (159 Ko) + `engine` (139 Ko)
dépassent déjà le plafond total à eux seuls.

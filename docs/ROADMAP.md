# Feuille de route CatanX

Document unique de référence. Les anciens fichiers `PLAN_COMPLET.md` et `CODEX_PLAN.md` sont obsolètes.

Voir aussi : [ARCHITECTURE.md](ARCHITECTURE.md), [RULES_CATALOG.md](RULES_CATALOG.md), [SEASONS_SYSTEM_PLAN.md](SEASONS_SYSTEM_PLAN.md), [PLAN_CARTE_3D.md](PLAN_CARTE_3D.md) (renderer Three.js, phases A→G ✅), [MAP_RENDERER.md](MAP_RENDERER.md).

## Ordre d'exécution

Stabilité → boucle classique → IA → expérience visuelle → modules → réseau → optimisation finale.

Une phase ne passe à la suivante que lorsque ses critères de sortie et ses tests sont satisfaits.

---

## Phase 0 — Stabiliser et établir une référence

**Objectif** : dépôt propre, build/typecheck verts, bugs critiques corrigés, tooling et catalogue de vérité.

- Git, `.gitignore`, README, documentation d'architecture
- Corrections : biome `arctic`, `road_building` dupliqué, encodage UTF-8, chemins textures
- ESLint, Prettier, Vitest, Testing Library, Playwright smoke, CI
- Catalogue des règles (`RULES_CATALOG.md`)

**Sortie** : `tsc` + lint + test smoke verts ; comportement actuel documenté ; Git initialisé.

---

## Phase 1 — Refondre le cœur sans régression

**Objectif** : même moteur pour local / IA / replay / futur serveur ; partie classic rejouable à l'identique.

- Workspaces npm : `apps/client`, `apps/server`, `packages/engine`, `packages/protocol`
- `GameCommand` + `applyCommand` + erreurs métier structurées
- Injection `RandomSource` / `Clock` / `IdGenerator`
- `GameSnapshot` versionné + migrations minimales
- `GamePreset` + `GameModules` + validateur
- Découpage des monolithes ; tests de replay déterministe

**Sortie** : replay déterministe d'une partie locale classic depuis graine + commandes.

---

## Phase 2 — Boucle classique premium

Placement serpent, dés, collecte, 7/brigand, commerce, constructions, cartes de développement, victoire, HUD d'actions, passe-et-joue.

**Sortie** : partie 3–4 humains/IA complète sans impasse.

---

## Phase 3 — IA et équilibrage

Pipeline IA à trois niveaux, simulateur headless, métriques d'équilibrage.

**Sortie** : aucune IA ne bloque ; niveau normal compétitif sans triche.

---

## Phase 4 — Expérience « plateau vivant »

Design system, assets originaux, animations, HUD réorganisé, audio, tutoriel, a11y WCAG 2.2 AA.

**Sortie** : chaque action importante compréhensible sans lire le code.

---

## Phase 5 — Modules CatanX

Événements/saisons → technologies → armées → diplomatie → production/marché → conseil/barbares → victoires alternatives.

Le système de saisons constitue l'identité prioritaire du preset CatanX. Son plan directeur est défini dans [SEASONS_SYSTEM_PLAN.md](SEASONS_SYSTEM_PLAN.md). Les chaînes de production industrielles restent une extension opt-in et ne font plus partie du preset principal.

**Règle** : ne pas exposer une victoire tant que règles d'atteinte et de contre sont complètes.

---

## Phase 6 — Multijoueur privé autoritaire

Serveur local Socket.IO, salons, reconnexion, resynchronisation, chat.

**Sortie** : partie privée survit à une reconnexion ; rejet des commandes illégales.

---

## Phase 7 — Performance, robustesse, livraison

Lazy-load, budgets bundle/FPS, gestion d'erreurs, guides, campagne de validation.

**Sortie** : `typecheck` / `test` / `build` / `budget` / e2e verts ; guide joueur + error boundaries ; docs `PERFORMANCE.md` / `VALIDATION.md`.

---

## Conformité CATAN classique (post-Phase 7)

Socle en cours d’après l’audit officiel :

1. ~~État topologique + économie de départ + banque/deck~~ (`ClassicBoard`)
2. ~~Commandes setup / build topologiques autoritaires~~ (`ClassicCommands` + protocole)
3. ~~UI mid-game topologique~~ (overlay Village / Route / Ville)
4. ~~Trophées + victoire immédiate~~ (`refreshTrophiesAndVictory`, route topo)
5. ~~Commerce joueurs~~ (`propose/accept/reject/cancel_player_trade`)
6. ~~Vues privées multijoueur~~ (`projectStateForViewer` + `state_sync` par siège)
7. ~~Scénarios 3–4 joueurs + plateau variable~~ (UI 3/4, `classicBoardLayout`, tests référence)

**Compléments conformité** : YoP/Monopole UI, ports sur intersections, banque affichée, replay journal.

---

## Tests (transversal)

- Moteur : déterminisme, règles classiques, modules off = no-op, sérialisation/replay
- UI : parcours complet, saves, hotseat, clavier, résolutions
- IA/réseau : parties automatisées, rejet commandes invalides, resync

**Cibles** : ≥85 % couverture moteur, ≥95 % règles critiques + protocole ; zéro erreur TS/ESLint.

---

## Hors périmètre

Comptes, matchmaking public, monétisation, modération, infrastructure cloud.

# Catalogue des règles CatanX

Statuts : **implemented** | **partial** | **missing**

Dernière mise à jour : Phase 6 (multijoueur privé autoritaire).

## Mode classique (preset `classic`)

| Règle                     | Statut      | Notes                                                    |
| ------------------------- | ----------- | -------------------------------------------------------- |
| Carte 19 tuiles (`tiny`)  | implemented | fixe débutant ou `classicBoardLayout: 'random'`          |
| Banque 19×5 + pénurie     | implemented | collecte / commerce / défausse / YoP / coûts rendus      |
| Deck Développement 25     | implemented | `state.devDeck` ; UI YoP / Monopole / chevalier / routes |
| Topologie intersections   | implemented | setup + overlay mid-game Village/Route/Ville             |
| Inventaire 5/4/15         | implemented | décompté setup + commandes build                         |
| 3–4 joueurs               | implemented | UI locale 3–4 ; lobby MP places 3/4 ; même plateau          |
| 10 points de victoire     | implemented | preset classic                                           |
| Placement serpent initial | implemented | `setup_place_settlement` / `setup_place_road`            |
| Routes / colonies / villes| implemented | `build_road` / `build_settlement` / `upgrade_city` + UI  |
| Mains départ vides        | implemented | `finalizeClassicGameCreate` (plus de bonus civ)          |
| Lancer de dés             | implemented | `applyCommand` → `roll_dice`                             |
| Collecte ressources       | implemented | fertilité/pollution off ; dédup ; pénurie banque         |
| Défausse sur 7            | implemented | 5 ressources CATAN uniquement en classique               |
| Déplacement brigand / vol | implemented | `move_robber` / `steal_resource` + HUD                   |
| Commerce banque           | implemented | `bank_trade` + stock banque affiché                      |
| Commerce ports            | implemented | `portByIntersection` + ratios 2:1 / 3:1                  |
| Commerce joueurs          | implemented | `propose/accept/reject/cancel_player_trade` + UI         |
| Cartes de développement   | implemented | deck + UI effets (YoP, Monopole, chevalier, routes, VP)  |
| Route la plus longue      | implemented | topologie + blocage adverse ; refresh immédiat           |
| Armée la plus puissante   | implemented | refresh immédiat après chevalier                         |
| Fin de tour               | implemented | `applyCommand` → `end_turn` ; pas de cap 10 en classique |
| Victoire par points       | implemented | `refreshTrophiesAndVictory` (builds / chevalier / VP)    |
| Passe-et-joue             | implemented | `GameSetup` + `PrivacyScreen`                            |
| Replay déterministe       | implemented | save/load journal + panneau Rejouer / export JSON        |

## Modules CatanX

| Module                 | Statut              | Gating `enable*`                                                                   |
| ---------------------- | ------------------- | ---------------------------------------------------------------------------------- |
| Saisons                | implemented         | `catanx-seasons-v2` — 12 climats, une contrainte chacun, prévision et préparations (schéma v5) |
| Événements             | implemented         | génération + `choose_event` via `applyCommand`                                     |
| Technologies           | implemented         | `start_research` + science de base sans chaînes                                    |
| Armées / combat        | implemented         | `recruit_unit` / `attack_unit` + maintenance                                       |
| Diplomatie             | implemented         | `diplomacy_action` (guerre, paix, alliance, dons…)                                 |
| Chaînes de production  | implemented, opt-in | extension hors preset CatanX ; `craft_recipe` + `advancePlayerCrafts` + CraftPanel |
| Conseil mondial        | implemented         | `council_vote` + `CouncilPanel` ; curseur déterministe                             |
| Barbares               | implemented         | spawn + mouvement + raids (`BarbarianSystem`)                                      |
| Brouillard de guerre   | partial             | `fogOfWar` + `HexBoard`                                                            |
| Victoires alternatives | implemented         | règles + contre ; UI filtrée par modules                                           |

## Extensions (couche `config.extensions`)

| Extension              | Statut                         | Notes                                                                 |
| ---------------------- | ------------------------------ | --------------------------------------------------------------------- |
| Villes & Chevaliers    | implemented (phases 2–10)      | `citiesKnights` — voir [CITIES_KNIGHTS.md](CITIES_KNIGHTS.md)         |
| Saisons                | implemented (V2)                | `seasons` — voir [SEASONS.md](SEASONS.md)                             |
| Souterrain & Ciel      | implemented (v1 moteur + HUD)   | `undergroundSky` — voir [UNDERGROUND_SKY.md](UNDERGROUND_SKY.md) · schéma 6 |

Capacités livrées : framework → invasion → Progress → HUD → IA → **durcissement E2E** (schema 3, reconnect mid-pending, batch `sim:ck`).

## Infrastructure moteur

| Capacité                                 | Statut                                 |
| ---------------------------------------- | -------------------------------------- |
| `applyCommand`                           | implemented                            |
| `ClientEngineSession` (store)            | implemented                            |
| `RandomSource` / `Clock` / `IdGenerator` | implemented                            |
| IDs déterministes à la création          | implemented (`resetActiveIdGenerator`) |
| `GameSnapshot` versionné                 | implemented                            |
| Migration saves legacy                   | partial                                |
| Presets `classic` / `catanx` / `custom`  | implemented (`GameSetup`)              |
| Validateur modules                       | implemented                            |
| Workspaces npm                           | implemented                            |
| Serveur autoritaire                      | implemented                            | Socket.IO `apps/server` — salons, commandes, chat, reconnexion |
| Client multijoueur                       | implemented                            | lobby extensions/IA + invite `?mp` + `state_sync` privé         |
| IA intégrée                              | implemented                            |
| IA classique (`ClassicAI`)               | implemented                            |
| Simulateur headless                      | implemented                            |
| Métriques d'équilibrage                  | implemented                            |
| Commandes modules                        | implemented                            |

## Critères de sortie Phase 0

- [x] Git initialisé
- [x] `tsc` sans erreur
- [x] ESLint + Prettier + Vitest + Playwright smoke
- [x] CI GitHub Actions
- [x] Catalogue des règles documenté
- [x] Bugs critiques corrigés (arctic, road_building, UTF-8, textures)

## Critères de sortie Phase 1

- [x] Workspaces `apps/*` + `packages/*`
- [x] `applyCommand` + `GameCommand`
- [x] Injection RNG / horloge / IDs
- [x] `GameSnapshot` + `schemaVersion`
- [x] Presets + validateur modules
- [x] Store branché sur `applyCommand` (create, dice, end turn)
- [x] Sauvegardes via snapshots versionnés
- [x] Tests replay + snapshots + road_building

## Critères de sortie Phase 2

- [x] Flux 7 complet (défausse → brigand → vol) avec validation moteur
- [x] Phases de tour verrouillées (pas de double lancer / fin de tour prématurée)
- [x] Placement initial avec preview + confirmation
- [x] Passe-et-joue sans fuite d'informations entre tours
- [x] Panneaux classiques (commerce, cartes dev) liés au joueur actif
- [x] 11 tests moteur dont flux 7 et garde-fous de phase

## Critères de sortie Phase 3

- [x] `ClassicAI` avec niveaux easy / medium / hard / legendary (sans triche)
- [x] Placement initial IA via heuristiques topologie
- [x] Boucle IA classique : construction, commerce banque, cartes dev (knight/YoP/monopole/routes), flux 7
- [x] `HeadlessSimulator` + métriques (`BalanceMetrics`) + pipeline L0/L1/L2 (`docs/AI_SYSTEM.md`)
- [x] Client branché sur `decideClassicAI` (remplace fin de tour immédiate)
- [x] Sélecteur de difficulté IA dans `GameSetup` (dont Légendaire)
- [x] Tests headless : pas de blocage, déterminisme, ladder smoke
- [x] Correctif dés multi-joueurs (chaque joueur lance une fois par tour global)

## Critères de sortie Phase 4

- [x] Design system CSS (tokens, panneaux, boutons, focus visible)
- [x] HUD réorganisé : bandeau de phase classique, ruban de commandes extrait
- [x] Animations ressources + respect `prefers-reduced-motion` / réglage utilisateur
- [x] Audio procédural enrichi (collecte, commerce, brigand, défausse)
- [x] Tutoriel adapté au mode classique (placement, 7, construction, commerce)
- [x] Accessibilité : skip link, aria-live, contraste élevé, navigation clavier
- [x] Tests tutoriel (`tutorialSteps`) + smoke Playwright skip link

## Critères de sortie Phase 5

- [x] Saisons : extension `extensions.seasons` (preset CatanX ON, Classic refuse)
- [x] Événements : `choose_event` dans le protocole + store
- [x] Technologies : `start_research` + science de base sans chaînes
- [x] Armées : `recruit_unit` / `attack_unit` / `move_unit` via `applyCommand`
- [x] Diplomatie : `diplomacy_action` via `applyCommand`
- [x] Conseil : `council_vote` + effets appliqués (`activeEffects`) + panneau HUD
- [x] Barbares : spawn + déplacement + raids (loot / dégâts / défense)
- [x] Chaînes de production : `craft_recipe` + recettes multi-tours + panneau Craft
- [x] Victoires alternatives avec règles d'atteinte + contre (`getAvailableVictoryConditions`)
- [x] Cycle de tour corrigé : `processTurn` = fin du joueur puis début du suivant
- [x] HUD modules filtré par `enable*`
- [x] Tests modules (`modules-phase5` + `modules-phase5b`)

## Critères de sortie Phase 6

- [x] Serveur Socket.IO local (`apps/server`)
- [x] Salons : créer / lister / rejoindre / quitter
- [x] Partie autoritaire : seul le serveur applique `applyCommand`
- [x] Rejet des commandes illégales (mauvais joueur, spectateur, hors tour)
- [x] Resynchronisation `state_sync` (snapshot sérialisé)
- [x] Vues privées : `projectStateForViewer` (mains / deck / objectifs / termes d'offre)
- [x] Reconnexion par jeton de siège
- [x] Chat de salon
- [x] Lobby client + session remote store
- [x] Tests `RoomManager` (`apps/server`)
- [x] Polish : HUD local, défausse 7 par siège, reprise de siège, erreurs commande
- [x] Extensions CatanX + sièges IA serveur + invite / tunnel (`docs/MULTIPLAYER.md`)

## Critères de sortie Phase 7

- [x] Lazy-load écrans lourds (HexBoard, setup, lobby, modales tech/diplo, craft, guide)
- [x] `manualChunks` Vite (pixi / engine / motion / socket)
- [x] Budgets gzip (`npm run budget`) + doc `PERFORMANCE.md`
- [x] Compteur FPS optionnel (Paramètres)
- [x] `AppErrorBoundary` racine + polish `MapErrorBoundary`
- [x] Guide joueur (`HelpGuideModal`) depuis menu / ruban (tous modes)
- [x] Campagne de validation (`VALIDATION.md`) + e2e élargi en CI
- [x] Polish : FPS persisté, boundaries remount, LoadGame via menu, accents FR

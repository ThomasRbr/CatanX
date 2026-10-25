# Système d'IA CatanX

Architecture cible : pipeline à **trois niveaux** branché sur une seule entrée `decideClassicAI`, avec **pool unifié** classique + C&K + Underground Sky dans le TurnPlanner L1.

## Niveaux

| Niveau | Difficultés | Rôle |
|--------|-------------|------|
| **L0** | easy → legendary | Heuristiques (builds, trades, cartes) + **plan d’expansion** + **horizon multitour** + urgences C&K/US |
| **L1** | medium → legendary | `TurnPlanner` — beam search court sur le tour courant (candidats classiques **et** extensions) |
| **L2** | legendary | `BoundedSearch` — brigand / setup (expectimax léger) |

### Orchestration (`decideClassicAI`)

1. Pendings C&K / Saisons / réponse trade  
2. Setup, 7, brigand, steal  
3. **Urgences US** (`unload`, `contract-cargo`) et **défense C&K** (invasion imminente)  
4. **L1** sur `listLegalScoredActions` (builds + banque + C&K + US)  
5. Fallback L0 : C&K / US / builds / trades / `end_turn`

### Plan d’expansion (routes)

`ExpansionPlan.ts` choisit une **cible village** et un **chemin de routes minimal** (0-1 BFS).  
Routes hors chemin pénalisées ; sticky target via `AiMemory.ts`.

### Horizon multitour

`HorizonPlan.ts` : focus ∈ city, settlement, road_path, longest_road, **largest_army**, **port_race**, ck_defense, ck_urban, **ck_metropolis**, **us_contract**, **us_mastery**, save.  
`VictoryRace.ts` / `PositionEvaluator.ts` (réseau routier, titres US, trophées).

### Commerce joueur

Offres multi-cartes alignées sur le coût horizon ; broadcast si plusieurs partenaires ; acceptation par **Δeval** (medium+) ; proba d’offre dynamique si build bloqué.

Modules partagés : `packages/engine/src/engine/ai/shared/`.

## Anti-triche

L'IA n'utilise que l'information publique du siège. Pas d'accès aux mains adverses ni au deck.

## Difficultés

- **Facile** : L0 bruité, pas de commerce banque / joueur agressif  
- **Normal** : L0 + L1 (depth 3)  
- **Difficile** : L0 + L1 (depth 5)  
- **Légendaire** : L0 + L1 (depth 7) + L2 brigand  

Legendary reste local L0/L1/L2 — pas une recherche adversariale profonde multi-tours.

## C&K / US / Saisons

- C&K : `CitiesKnightsAI` + candidats L1 via `listCitiesKnightsScoredActions`  
- US : `undergroundSky/ai.ts` — urgences hors L1, reste via `listUndergroundSkyScoredActions`  
- Saisons : `SeasonBias.ts` (≤ 10 % placement)

## Legacy

`AIEngine.ts` (empire / guerre / tech) est **hors chemin classique** — ne pas l’utiliser pour les parties Catan topo.

## Debug

Overlay FPS : `getLastAiRationale()` (couche L0/L1/L2 + résumé).

## Simulations

```bash
npm run sim:ck                 # batch C&K anti-blocage
npm run sim:ai-ladder          # ladder Classic / C&K / US+Saisons
npm run sim:ai-ladder -- --games=40
```

Métriques : winrate par difficulté, télémetrie US (aéroport, contrats), trades proposés/acceptés (`BalanceMetrics.ts`).

`HeadlessSimulator` désactive par défaut events / tech / armées / diplomatie / fog / world council (sinon softlock sans IA dédiée). Passer `modules` pour les réactiver.

## Tests

- `engine/ai/shared/__tests__/shared-ai.test.ts`
- `engine/ai/shared/__tests__/expansion-plan.test.ts`
- `engine/ai/shared/__tests__/horizon-plan.test.ts`
- `engine/ai/classic/__tests__/classic-ai.test.ts`
- `engine/citiesKnights/__tests__/cities-knights-ai.test.ts`
- `engine/undergroundSky/__tests__/undergroundSkyAi.test.ts`
- `sim/__tests__/ai-ladder.test.ts`

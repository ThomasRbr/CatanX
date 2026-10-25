# Villes & Chevaliers (`citiesKnights`)

Extension optionnelle CatanX, fidèle aux mécaniques essentielles de **Catan : Villes & Chevaliers**, compatible avec toutes les cartes et modules.

**Ruleset :** `catanx-essential-v1`  
**Statut livraison :** phases 2–10 complètes.

## Activation

```ts
config.extensions = {
  citiesKnights: {
    enabled: true,
    ruleset: 'catanx-essential-v1',
    victoryPointBonus: 3,
    adaptiveBarbarianTrack: true,
  },
};
```

Lobby : section **Extensions** (indépendante des presets Classique / CatanX / modules).

## Livré

| Phase | Contenu |
|-------|---------|
| 2–3 | Config/état, VP+3, setup colonie→ville, dé événement, marchandises `ck_*`, brigand dormant |
| 4 | Pistes urbaines 0–5, Aqueduc, commerce 2:1, murailles, 3 métropoles |
| 5 | Chevaliers complets |
| 6 | Invasion (défense, pillage, PV Défenseur) |
| 7 | Decks Progress 18×3, portes, **18 effets jouables** (`ck_play_progress`) |
| 8 | HUD chevaliers, jetons 3D, SFX, tutoriel C&K |
| 9 | IA C&K (`CitiesKnightsAI`) + matrice headless (joueurs / carte / modules) |
| 10 | Schema 3 + normalisation C&K, reconnect mid-pending, batch IA, e2e lobby |

## Commandes

`ck_improve_urban`, `ck_place_metropolis`, `ck_build_wall`, `ck_recruit_knight`, `ck_activate_knight`, `ck_promote_knight`, `ck_move_knight`, `ck_displace_knight`, `ck_chase_robber`, `ck_resolve_knight_retreat`, `ck_aqueduct_choose`, `ck_choose_pillage_city`, `ck_choose_progress_deck`, `ck_discard_progress`, `ck_play_progress`

## IA (phase 9)

Priorités : pendings → défense si invasion proche → activer / promouvoir / recruter → tactiques (chasse, déloger, déplacer) → urbain / progrès (18 cartes) / murailles / commerce marchandises.  
Les constructions classiques évitent les intersections bloquées par un chevalier adverse.

Voir aussi [AI_SYSTEM.md](AI_SYSTEM.md) (pipeline L0–L2).

Simulateur : `runHeadlessSimulation({ extensions, modules, mapSize, playerCount, … })`.

Batch : `npm run sim:ck` (1000 parties) ou `npm run sim:ck -- --games=50`. CI : 40 parties dans Vitest.  
Ladder force : `npm run sim:ai-ladder`.

## Durcissement (phase 10)

- **Schema 3** : `normalizeCitiesKnightsState` / `hydrateCitiesKnightsFromSnapshot` répare buffs, stocks, discards, pendings.
- Reconnexion mid-choix (Aqueduc, retraite, pillage) via snapshot d’état même sans `commandLog`.
- E2E Playwright : toggle lobby **Villes & Chevaliers** (+3 PV).

## Collisions de noms

| Terme C&K | Identifiant code | Ne pas réutiliser |
|-----------|------------------|-------------------|
| Marchandises | `ck_paper` / `ck_cloth` / `ck_coin` | `paper` / `cloth` / `coins` industriels |
| Chevaliers | `ckKnight` | units Armées / carte `knight` |
| Piste barbares | `barbarianTrack*` | `BarbarianSystem` |
| Métropole C&K | ornement +2 PV | building `metropolis` CatanX |

# Extension Pactes & Ambassades (`pactsEmbassies`)

**Statut :** livrée (`catanx-pacts-embassies-v1`)  
**Schéma sauvegarde :** 7  
**Registre :** `extensions.pactsEmbassies`

## Essence

> Coopérer avec un adversaire sans lui donner un avantage supérieur au sien.

Diplomatie vérifiable : ambassades, pactes à clauses, Conseil mondial, crises et mandats. Extension CatanX only, désactivée par défaut, objectif **+3 PV** (cumulable avec CK et Souterrain & Ciel).

Chaque joueur démarre avec **Influence 0**, **Réputation 3**, et **1 délégué** implicite (sans ambassade). Les ambassades (max 3) augmentent les délégués et la capacité de pactes.

## Activation

```ts
config.extensions = {
  pactsEmbassies: {
    enabled: true,
    ruleset: 'catanx-pacts-embassies-v1',
    victoryPointBonus: 3,
    roundsPerCouncilSession: 5, // avec Saisons ; 4 sans Saisons
    maxActivePactsPerPlayer: 2,
    maxActiveResolutions: 2,
    neutralCouncilMode: 'adaptive',
  },
};
```

`baseVictoryPointTarget` = objectif lobby ; `victoryPointTarget` = base + bonus extensions.

## Coûts (base)

| Action | Coût |
|---|---|
| Ambassade | 1 mouton + 1 blé + 1 minerai (ville / métropole) |
| Proposer / accepter / contrer un pacte | 1 Influence (dépôt) |
| Rompre unilatéralement | −2 Réputation |
| Lobby délégation neutre | Influence (mise) |

## Catalogues

- **24** résolutions (commerce, infrastructure, solidarité, monde vertical)
- **12** crises collectives
- **12** mandats (dont conditionnés par CK / Saisons / US)

Max **2** résolutions actives simultanées. Haut Chancelier (seuil score 8) : **+1 PV**.

## Commandes

`pe_build_embassy`, `pe_propose_pact`, `pe_counter_pact`, `pe_accept_pact`, `pe_reject_pact`, `pe_break_pact`, `pe_propose_mutual_dissolution`, `pe_accept_mutual_dissolution`, `pe_sponsor_resolution`, `pe_cast_council_vote`, `pe_lobby_neutral_delegation`, `pe_contribute_to_crisis`, `pe_claim_mandate`

## Client

Dock **Pactes & Ambassades** (`data-extension="pacts-embassies"`) : onglets Relations, Ambassades, Conseil, Mandats.

## Compatibilités

- **Saisons** : une session de Conseil s’aligne sur la longueur de saison (`roundsPerCouncilSession`).
- **C&K** : ambassade suspendue si la ville est rétrogradée ; clauses / résolutions peuvent toucher marchandises.
- **Souterrain & Ciel** : clauses passage / alizés ; résolutions verticales (tunnels, dirigeables, matériaux).
- **Technologies / Armées** : aucune intégration (isolation stricte).

Legacy `enableDiplomacy` / `worldCouncil` restent distincts ; avec PE actif, le conseil legacy cède la place aux commandes `pe_*`.

## Confidentialité

- Clauses d’offre masquées aux tiers (`projectStateForViewer`)
- Votes secrets jusqu’à révélation ; mises de lobby cachées
- Decks (`_secret`) jamais exposés en vue privée

## Sauvegardes

Schéma 7 : PE désactivée sur saves existantes ; hydratation champ-par-champ de l’état diplomatique.

## Fichiers clés

- [`packages/engine/src/types/pactsEmbassies.ts`](../packages/engine/src/types/pactsEmbassies.ts)
- [`packages/engine/src/engine/pactsEmbassies/`](../packages/engine/src/engine/pactsEmbassies/)
- [`apps/client/src/components/Panels/PactsEmbassiesPanel.tsx`](../apps/client/src/components/Panels/PactsEmbassiesPanel.tsx)
- Tests : [`packages/engine/src/engine/pactsEmbassies/__tests__/`](../packages/engine/src/engine/pactsEmbassies/__tests__/)

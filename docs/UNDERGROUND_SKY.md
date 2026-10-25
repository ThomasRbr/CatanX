# Extension Souterrain & Ciel (`undergroundSky`)

**Statut :** livrée (`catanx-underground-sky-v1`)  
**Schéma sauvegarde :** 6  
**Registre :** `extensions.undergroundSky`

## Essence

> La Surface produit, le Souterrain sécurise, le Ciel accélère.

Deux réseaux navigables superposés au plateau CatanX. Extension CatanX only, désactivée par défaut, objectif **+5 PV** (cumulable avec Villes & Chevaliers).

Le Ciel génère `min(30, max(8, 2 × joueurs, terres / 5))` hubs. Les sept types de sites utilisés par les contrats sont toujours présents.

Matériaux : **Cristal** (`us_crystal`) et **Éther** (`us_aether`) — stock banque `max(16, 4 × N)`.

## Activation

```ts
config.extensions = {
  undergroundSky: {
    enabled: true,
    ruleset: 'catanx-underground-sky-v1',
    victoryPointBonus: 5,
    undergroundGeneration: 'surface-derived',
    skyGeneration: 'adaptive-network',
    flightMode: 'programmed',
    interactionMode: 'soft-competitive',
  },
};
```

`baseVictoryPointTarget` = objectif lobby ; `victoryPointTarget` = base + bonus extensions.

## Coûts (base)

| Construction | Coût |
|---|---|
| Puits | 1 argile + 2 minerais |
| Prospection | 1 blé (1 / tour) |
| Tunnel | 1 bois + 1 argile (+1 argile si faille révélée) |
| Avant-poste | 1 bois + 1 blé + 1 minerai |
| Extracteur | 1 Cristal + 1 blé + 1 minerai |
| Ascenseur | 1 Cristal + 2 argiles |
| Aéroport | 1 bois + 1 mouton + 2 minerais |
| Dirigeable | 1 bois + 2 moutons + 1 minerai |
| Balise | 1 Éther + 1 minerai |
| Voiles d’Éther | 1 Éther + 1 mouton |
| Soute renforcée | 1 Cristal + 1 bois |

Travaux (Saisons) peut retirer 1 argile du premier tunnel de la saison (partagé avec route / muraille).

## Victoire

- **Maître des Profondeurs** (2 PV) : `tunnels + 2×ascenseurs + 2×extracteurs ≥ 6`
- **Maître des Alizés** (2 PV) : `contrats réguliers + 2×balises ≥ 4`
- Contrat majeur : 1 PV permanent (max 1 / joueur)
- Total US max : **5 PV** (aligné sur `victoryPointBonus`)

Contrats : **livraison uniquement via soute** d’un dirigeable amarré (pas depuis la main). La soute transporte **3 éléments de base, 4 une fois renforcée** : les contrats ordinaires sont accessibles avec le dirigeable standard et les contrats majeurs demandent l’amélioration. Chaque contrat a un **site de livraison obligatoire** :

| Type | Site |
|---|---|
| Ravitaillement | Jardin flottant |
| Construction / logistique CK | Bazar des vents |
| Métallurgie | Ruines suspendues |
| Artisanat | Observatoire |
| Énergie | Source d’Éther |
| Majeurs | site dédié (jardin, bazar, ruines, observatoire, source, amarrage calme, zone turbulente…) |

Chargement possible à quai (même hub).
## Ordre de production (non-7)

Surface → conversion CK → pénalités Saisons → production souterraine → Aqueduc (si rien sur aucune couche) → progression dirigeables → actions.

## Dirigeables

Budget de base 2 (Voiles +1). Climat rude : −1 (min 1). Courants 1 / 2 ; turbulences +1 entrant ; balise −1 par hub (legs, min 0 ; total min 1). Trajet verrouillé ; cargaison hors main / 7 / vol. Déduction cargaison uniquement après validation du trajet. Ferry (`cargo: []`) conserve la soute ; nouveau chargement exige une soute vide. Déchargement uniquement aux hubs d’attache de l’aéroport.

## Client

- Dock **Souterrain & Ciel** : constructions, prospection, expédition / déchargement (aéroport), contrats (soute, site requis, choix de récompense classique), résolutions.
- Barre de ressources + banque : matériaux Cristal / Éther.
- Sélecteur de couche 3D (Ciel / Surface / Souterrain, touches 1-2-3) : diorama de cavernes « Les Profondeurs » et mer de nuages « Les Alizés » ; les constructions se font via le panneau.

## IA

Politique scorée (`chooseUndergroundSkyAction`) : pendings → déchargement (aéroport) → contrats **cargo** → chargement / ferry / exploration → puits / prospection / tunnels / avant-postes / extracteurs / ascenseurs (arête libre) → aéroports / dirigeables / balises (révélées) / upgrades. Urgences = unload + contrats cargo prêts ; seuils et suboptimal sinon.

## Compatibilités

- **Saisons** : climat rude sur vols ; Travaux sur tunnels ; Réserve / Commerce sur matériaux ; pas d’abondance souterraine.
- **C&K** : aéroport suspendu si ville pillée ; métropole protège ; marchandises en soute ; production souterraine bloque Aqueduc.

## Commandes

`us_build_shaft`, `us_survey_cavern`, `us_build_tunnel`, `us_build_outpost`, `us_upgrade_extractor`, `us_build_lift`, `us_choose_thermal_output`, `us_choose_discovery_reward`, `us_build_airport`, `us_build_airship`, `us_upgrade_airship`, `us_build_beacon`, `us_dispatch_airship`, `us_unload_airship`, `us_complete_contract`

Étendues : `discard_resources.undergroundSkyMaterials`, `giveMaterials` / `receiveMaterials`, tunnel `useSeasonPreparation`.

## Confidentialité

Totaux matériaux adverses uniquement ; cargaison scellée (compte opaque) ; nœuds / sites non révélés masqués ; decks cachés.

## Sauvegardes

Schéma 6 : US désactivée sur saves existantes ; `baseVictoryPointTarget` reconstruit sans changer l’objectif effectif.

## Fichiers clés

- [`packages/engine/src/types/undergroundSky.ts`](../packages/engine/src/types/undergroundSky.ts)
- [`packages/engine/src/engine/undergroundSky/`](../packages/engine/src/engine/undergroundSky/)
- [`apps/client/src/components/Panels/UndergroundSkyPanel.tsx`](../apps/client/src/components/Panels/UndergroundSkyPanel.tsx)
- Tests : [`packages/engine/src/engine/undergroundSky/__tests__/`](../packages/engine/src/engine/undergroundSky/__tests__/)

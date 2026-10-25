/**
 * Création / hydratation de l’état Souterrain & Ciel.
 */

import type { HexTile } from '../../types/hex';
import type { GameState } from '../../types/game';
import type { CatanTopology } from '../catan/CatanTopology';
import type { UndergroundSkyState } from '../../types/undergroundSky';
import {
  emptyMaterialBundle,
  emptySkyGraph,
  emptyUndergroundGraph,
  materialBankSize,
  US_MATERIALS,
} from '../../types/undergroundSky';
import { isCitiesKnightsEnabled, isUndergroundSkyEnabled } from '../../core/extensions';
import { generateSkyGraph, generateUndergroundGraph } from './generation';
import { buildContractDecks, dealInitialContracts } from './contracts';
import { syncPublicMaterialCounts } from './materials';

export function createEmptyMaterialBank(
  playerCount: number,
): UndergroundSkyState['materialBank'] {
  const size = materialBankSize(playerCount);
  return {
    us_crystal: size,
    us_aether: size,
  };
}

export function createUndergroundSkyState(
  playerIds: string[],
  playerCount: number,
  map: Map<string, HexTile>,
  seed: number,
  options?: {
    topology?: CatanTopology;
    citiesKnightsEnabled?: boolean;
  },
): UndergroundSkyState {
  const topology = options?.topology;
  const citiesKnightsEnabled = Boolean(options?.citiesKnightsEnabled);

  const undergroundGraph = generateUndergroundGraph(map, seed, topology);
  const skyGraph = generateSkyGraph(map, seed ^ 0x51c, playerCount);

  const playerMaterials: UndergroundSkyState['playerMaterials'] = {};
  const publicMaterialCounts: UndergroundSkyState['publicMaterialCounts'] = {};
  const perTurnUsage: UndergroundSkyState['perTurnUsage'] = {};
  const completedRegularContracts: Record<string, number> = {};
  const completedMajorContracts: Record<string, string | null> = {};

  for (const id of playerIds) {
    playerMaterials[id] = emptyMaterialBundle();
    publicMaterialCounts[id] = 0;
    perTurnUsage[id] = { surveyUsed: false };
    completedRegularContracts[id] = 0;
    completedMajorContracts[id] = null;
  }

  const decks = buildContractDecks(seed, citiesKnightsEnabled);

  const state: UndergroundSkyState = {
    materialBank: createEmptyMaterialBank(playerCount),
    playerMaterials,
    publicMaterialCounts,
    undergroundGraph,
    revealedUndergroundNodeIds: [],
    shafts: [],
    tunnels: [],
    outposts: [],
    lifts: [],
    skyGraph,
    revealedSkyHubIds: [],
    airports: [],
    airships: [],
    beacons: [],
    regularContractDeck: decks.regular,
    majorContractDeck: decks.major,
    faceUpRegularContracts: [],
    faceUpMajorContract: null,
    completedRegularContracts,
    completedMajorContracts,
    undergroundMasteryOwnerId: null,
    skyMasteryOwnerId: null,
    perTurnUsage,
    pendingResolutions: [],
    history: [],
    _secret: {
      reservedMaterialContractIds: [],
    },
  };

  dealInitialContracts(state);
  syncPublicMaterialCounts(state);
  return state;
}

export function ensureUndergroundSkyState(
  state: GameState,
): UndergroundSkyState | null {
  if (!isUndergroundSkyEnabled(state)) return null;
  if (!state.extensions) state.extensions = {};
  if (!state.extensions.undergroundSky) {
    state.extensions.undergroundSky = createUndergroundSkyState(
      state.turnOrder,
      state.config.playerCount,
      state.map,
      state.config.mapSeed,
      {
        topology: state.classicBoard?.topology,
        citiesKnightsEnabled: isCitiesKnightsEnabled(state),
      },
    );
  }
  return state.extensions.undergroundSky;
}

export function ensureUndergroundSkyPlayers(state: GameState): void {
  const us = state.extensions?.undergroundSky;
  if (!us) return;
  for (const playerId of state.turnOrder) {
    if (!us.playerMaterials[playerId]) {
      us.playerMaterials[playerId] = emptyMaterialBundle();
    }
    if (us.publicMaterialCounts[playerId] === undefined) {
      us.publicMaterialCounts[playerId] = 0;
    }
    if (!us.perTurnUsage[playerId]) {
      us.perTurnUsage[playerId] = { surveyUsed: false };
    }
    if (us.completedRegularContracts[playerId] === undefined) {
      us.completedRegularContracts[playerId] = 0;
    }
    if (us.completedMajorContracts[playerId] === undefined) {
      us.completedMajorContracts[playerId] = null;
    }
  }
  syncPublicMaterialCounts(us);
}

export function resetUndergroundSkyTurnUsage(
  state: GameState,
  playerId: string,
): void {
  const us = state.extensions?.undergroundSky;
  if (!us) return;
  us.perTurnUsage[playerId] = { surveyUsed: false };
}

export function hydrateUndergroundSkyFromSnapshot(state: GameState): void {
  const raw = state.extensions?.undergroundSky as
    | Partial<UndergroundSkyState>
    | undefined;
  if (!raw || !state.config.extensions?.undergroundSky?.enabled) {
    if (state.extensions) {
      delete (state.extensions as { undergroundSky?: UndergroundSkyState })
        .undergroundSky;
    }
    return;
  }

  const playerIds = state.turnOrder.length
    ? state.turnOrder
    : [...state.players.keys()];
  const base = createUndergroundSkyState(
    playerIds,
    state.config.playerCount,
    state.map,
    state.config.mapSeed,
    {
      topology: state.classicBoard?.topology,
      citiesKnightsEnabled: isCitiesKnightsEnabled(state),
    },
  );

  const bank = { ...base.materialBank };
  for (const key of US_MATERIALS) {
    if (typeof raw.materialBank?.[key] === 'number') {
      bank[key] = raw.materialBank[key]!;
    }
  }

  const merged: UndergroundSkyState = {
    ...base,
    ...raw,
    materialBank: bank,
    playerMaterials: { ...base.playerMaterials, ...raw.playerMaterials },
    publicMaterialCounts: {
      ...base.publicMaterialCounts,
      ...raw.publicMaterialCounts,
    },
    undergroundGraph: raw.undergroundGraph ?? base.undergroundGraph,
    revealedUndergroundNodeIds: Array.isArray(raw.revealedUndergroundNodeIds)
      ? [...raw.revealedUndergroundNodeIds]
      : base.revealedUndergroundNodeIds,
    shafts: Array.isArray(raw.shafts) ? [...raw.shafts] : base.shafts,
    tunnels: Array.isArray(raw.tunnels) ? [...raw.tunnels] : base.tunnels,
    outposts: Array.isArray(raw.outposts) ? [...raw.outposts] : base.outposts,
    lifts: Array.isArray(raw.lifts) ? [...raw.lifts] : base.lifts,
    skyGraph: raw.skyGraph ?? base.skyGraph,
    revealedSkyHubIds: Array.isArray(raw.revealedSkyHubIds)
      ? [...raw.revealedSkyHubIds]
      : base.revealedSkyHubIds,
    airports: Array.isArray(raw.airports) ? [...raw.airports] : base.airports,
    airships: Array.isArray(raw.airships) ? [...raw.airships] : base.airships,
    beacons: Array.isArray(raw.beacons) ? [...raw.beacons] : base.beacons,
    regularContractDeck: Array.isArray(raw.regularContractDeck)
      ? [...raw.regularContractDeck]
      : base.regularContractDeck,
    majorContractDeck: Array.isArray(raw.majorContractDeck)
      ? [...raw.majorContractDeck]
      : base.majorContractDeck,
    faceUpRegularContracts: Array.isArray(raw.faceUpRegularContracts)
      ? [...raw.faceUpRegularContracts]
      : base.faceUpRegularContracts,
    faceUpMajorContract:
      raw.faceUpMajorContract !== undefined
        ? raw.faceUpMajorContract
        : base.faceUpMajorContract,
    completedRegularContracts: {
      ...base.completedRegularContracts,
      ...raw.completedRegularContracts,
    },
    completedMajorContracts: {
      ...base.completedMajorContracts,
      ...raw.completedMajorContracts,
    },
    perTurnUsage: { ...base.perTurnUsage, ...raw.perTurnUsage },
    pendingResolutions: Array.isArray(raw.pendingResolutions)
      ? [...raw.pendingResolutions]
      : base.pendingResolutions,
    history: Array.isArray(raw.history) ? [...raw.history] : base.history,
    _secret: {
      reservedMaterialContractIds: [
        ...(raw._secret?.reservedMaterialContractIds ??
          base._secret.reservedMaterialContractIds),
      ],
    },
  };

  // Graphes vides en snapshot partiel → régénérer
  if (
    !merged.undergroundGraph ||
    Object.keys(merged.undergroundGraph.nodes).length === 0
  ) {
    merged.undergroundGraph = emptyUndergroundGraph();
    Object.assign(
      merged.undergroundGraph,
      generateUndergroundGraph(
        state.map,
        state.config.mapSeed,
        state.classicBoard?.topology,
      ),
    );
  }
  if (!merged.skyGraph || Object.keys(merged.skyGraph.hubs).length === 0) {
    merged.skyGraph = emptySkyGraph();
    Object.assign(
      merged.skyGraph,
      generateSkyGraph(
        state.map,
        state.config.mapSeed ^ 0x51c,
        state.config.playerCount,
      ),
    );
  }

  state.extensions = state.extensions ?? {};
  state.extensions.undergroundSky = merged;
  ensureUndergroundSkyPlayers(state);

  // Anciennes sauvegardes / snapshots partiels sans clé undergroundSky.
  for (const player of state.players.values()) {
    if (typeof player.stats.vpBreakdown.undergroundSky !== 'number') {
      player.stats.vpBreakdown.undergroundSky = 0;
    }
  }
}

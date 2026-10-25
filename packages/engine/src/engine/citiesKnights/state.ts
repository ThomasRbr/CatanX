/**
 * État initial et helpers Villes & Chevaliers.
 */
import type { GameState } from '../../types/game';
import type {
  CitiesKnightsState,
  CkCommodity,
  CkCommodityBundle,
  CkUrbanLevels,
} from '../../types/citiesKnights';
import {
  CK_COMMODITIES,
  ckBarbarianTrackLength,
  ckCommodityStockCap,
} from '../../types/citiesKnights';
import { isCitiesKnightsEnabled } from '../../core/extensions';

function emptyLevels(): CkUrbanLevels {
  return { trade: 0, politics: 0, science: 0 };
}

function emptyCommodities(): CkCommodityBundle {
  return {};
}

export function createEmptyCommodityBank(playerCount: number): Record<CkCommodity, number> {
  const cap = ckCommodityStockCap(playerCount);
  return {
    ck_paper: cap,
    ck_cloth: cap,
    ck_coin: cap,
  };
}

export function createCitiesKnightsState(
  playerIds: string[],
  playerCount: number,
): CitiesKnightsState {
  const playerCommodities: Record<string, CkCommodityBundle> = {};
  const publicCommodityCounts: Record<string, number> = {};
  const progressHands: Record<string, CitiesKnightsState['progressHands'][string]> = {};
  const publicProgressCounts: Record<string, number> = {};
  const urbanLevels: Record<string, CkUrbanLevels> = {};
  const defenderVp: Record<string, number> = {};

  for (const id of playerIds) {
    playerCommodities[id] = emptyCommodities();
    publicCommodityCounts[id] = 0;
    progressHands[id] = [];
    publicProgressCounts[id] = 0;
    urbanLevels[id] = emptyLevels();
    defenderVp[id] = 0;
  }

  return {
    commodityBank: createEmptyCommodityBank(playerCount),
    playerCommodities,
    publicCommodityCounts,
    progressHands,
    publicProgressCounts,
    progressDecks: {
      trade: [],
      politics: [],
      science: [],
    },
    progressDiscards: {
      trade: [],
      politics: [],
      science: [],
    },
    barbarianTrackPosition: 0,
    barbarianTrackLength: ckBarbarianTrackLength(playerCount),
    robberUnlocked: false,
    invasionCount: 0,
    urbanLevels,
    metropolises: {
      trade: { ownerId: null, intersectionId: null },
      politics: { ownerId: null, intersectionId: null },
      science: { ownerId: null, intersectionId: null },
    },
    walls: {},
    knights: [],
    knightStocks: Object.fromEntries(
      playerIds.map((id) => [id, { basic: 2, strong: 2, mighty: 2 }]),
    ),
    merchant: { tileId: null, ownerId: null },
    progressBuffs: {
      merchantFleet: null,
      craneDiscount: {},
      alchemistDice: null,
    },
    defenderVp,
    pendingResolutions: [],
  };
}

/**
 * Garantit la présence de l’état C&K sans le recloner.
 * Important : ne pas appeler `normalizeCitiesKnightsState` ici — un remplacement
 * d’objet à chaque accès invalide les références locales (`const ck = ensure…`)
 * et faisait perdre les niveaux urbains / mutations en cours.
 */
export function ensureCitiesKnightsState(state: GameState): CitiesKnightsState | null {
  if (!isCitiesKnightsEnabled(state)) return null;
  if (!state.extensions) state.extensions = {};
  if (!state.extensions.citiesKnights) {
    state.extensions.citiesKnights = createCitiesKnightsState(
      state.turnOrder,
      state.config.playerCount,
    );
  }
  return state.extensions.citiesKnights;
}

/**
 * Répare un blob C&K partiel (saves schema 2, champs ajoutés en phases 4–9).
 */
export function normalizeCitiesKnightsState(
  raw: Partial<CitiesKnightsState> | null | undefined,
  playerIds: string[],
  playerCount: number,
): CitiesKnightsState {
  const base = createCitiesKnightsState(playerIds, playerCount);
  if (!raw || typeof raw !== 'object') return base;

  const playerCommodities = { ...base.playerCommodities };
  const publicCommodityCounts = { ...base.publicCommodityCounts };
  const progressHands = { ...base.progressHands };
  const publicProgressCounts = { ...base.publicProgressCounts };
  const urbanLevels = { ...base.urbanLevels };
  const defenderVp = { ...base.defenderVp };
  const knightStocks = { ...base.knightStocks };

  for (const id of playerIds) {
    if (raw.playerCommodities?.[id]) playerCommodities[id] = { ...raw.playerCommodities[id] };
    if (typeof raw.publicCommodityCounts?.[id] === 'number') {
      publicCommodityCounts[id] = raw.publicCommodityCounts[id]!;
    }
    if (Array.isArray(raw.progressHands?.[id])) {
      progressHands[id] = [...raw.progressHands![id]!];
    }
    if (typeof raw.publicProgressCounts?.[id] === 'number') {
      publicProgressCounts[id] = raw.publicProgressCounts[id]!;
    }
    if (raw.urbanLevels?.[id]) {
      urbanLevels[id] = {
        trade: raw.urbanLevels[id]!.trade ?? 0,
        politics: raw.urbanLevels[id]!.politics ?? 0,
        science: raw.urbanLevels[id]!.science ?? 0,
      };
    }
    if (typeof raw.defenderVp?.[id] === 'number') {
      defenderVp[id] = raw.defenderVp[id]!;
    }
    if (raw.knightStocks?.[id]) {
      knightStocks[id] = {
        basic: raw.knightStocks[id]!.basic ?? 2,
        strong: raw.knightStocks[id]!.strong ?? 2,
        mighty: raw.knightStocks[id]!.mighty ?? 2,
      };
    }
  }

  const progressDecks = {
    trade: Array.isArray(raw.progressDecks?.trade) ? [...raw.progressDecks!.trade!] : [],
    politics: Array.isArray(raw.progressDecks?.politics)
      ? [...raw.progressDecks!.politics!]
      : [],
    science: Array.isArray(raw.progressDecks?.science) ? [...raw.progressDecks!.science!] : [],
  };
  const progressDiscards = {
    trade: Array.isArray(raw.progressDiscards?.trade) ? [...raw.progressDiscards!.trade!] : [],
    politics: Array.isArray(raw.progressDiscards?.politics)
      ? [...raw.progressDiscards!.politics!]
      : [],
    science: Array.isArray(raw.progressDiscards?.science)
      ? [...raw.progressDiscards!.science!]
      : [],
  };

  const metropolises = {
    trade: raw.metropolises?.trade ?? base.metropolises.trade,
    politics: raw.metropolises?.politics ?? base.metropolises.politics,
    science: raw.metropolises?.science ?? base.metropolises.science,
  };

  const progressBuffs = {
    merchantFleet: raw.progressBuffs?.merchantFleet ?? null,
    craneDiscount: { ...(raw.progressBuffs?.craneDiscount ?? {}) },
    alchemistDice: raw.progressBuffs?.alchemistDice ?? null,
  };

  return {
    commodityBank: {
      ck_paper: raw.commodityBank?.ck_paper ?? base.commodityBank.ck_paper,
      ck_cloth: raw.commodityBank?.ck_cloth ?? base.commodityBank.ck_cloth,
      ck_coin: raw.commodityBank?.ck_coin ?? base.commodityBank.ck_coin,
    },
    playerCommodities,
    publicCommodityCounts,
    progressHands,
    publicProgressCounts,
    progressDecks,
    progressDiscards,
    barbarianTrackPosition: raw.barbarianTrackPosition ?? 0,
    barbarianTrackLength: raw.barbarianTrackLength ?? base.barbarianTrackLength,
    robberUnlocked: Boolean(raw.robberUnlocked),
    invasionCount: raw.invasionCount ?? 0,
    urbanLevels,
    metropolises,
    walls: raw.walls ? { ...raw.walls } : {},
    knights: Array.isArray(raw.knights) ? [...raw.knights] : [],
    knightStocks,
    merchant: raw.merchant
      ? { tileId: raw.merchant.tileId ?? null, ownerId: raw.merchant.ownerId ?? null }
      : base.merchant,
    progressBuffs,
    defenderVp,
    pendingResolutions: Array.isArray(raw.pendingResolutions)
      ? [...raw.pendingResolutions]
      : [],
    lastInvasionResult: raw.lastInvasionResult,
  };
}

/** Après chargement snapshot : normalise / répare le blob C&K si l’extension est active. */
export function hydrateCitiesKnightsFromSnapshot(state: GameState): void {
  if (!state.config.extensions?.citiesKnights?.enabled) return;
  if (!state.extensions) state.extensions = {};
  state.extensions.citiesKnights = normalizeCitiesKnightsState(
    state.extensions.citiesKnights,
    state.turnOrder,
    state.config.playerCount,
  );
  replaceDevelopmentCardsForCitiesKnights(state);
}

/**
 * C&K remplace intégralement le paquet Développement par les cartes Progrès.
 * Nettoie aussi les anciennes sauvegardes créées avant l'application stricte
 * de cette règle afin qu'une carte résiduelle ne puisse plus être jouée.
 */
export function replaceDevelopmentCardsForCitiesKnights(state: GameState): void {
  if (!isCitiesKnightsEnabled(state)) return;
  state.devDeck = [];
  state.publicDevDeckCount = 0;
  state.largestArmyOwner = null;
  state.largestArmySize = 0;
  for (const player of state.players.values()) {
    player.devCards = [];
    player.devCardsPlayedThisTurn = 0;
    player.publicDevCardCount = 0;
  }
}

export function totalCkCommodities(bundle: CkCommodityBundle | undefined): number {
  if (!bundle) return 0;
  return CK_COMMODITIES.reduce((sum, c) => sum + (bundle[c] ?? 0), 0);
}

export function addCkCommodities(
  base: CkCommodityBundle,
  add: CkCommodityBundle,
): CkCommodityBundle {
  const result = { ...base };
  for (const c of CK_COMMODITIES) {
    const n = add[c] ?? 0;
    if (n > 0) result[c] = (result[c] ?? 0) + n;
  }
  return result;
}

export function subtractCkCommodities(
  base: CkCommodityBundle,
  sub: CkCommodityBundle,
): CkCommodityBundle {
  const result = { ...base };
  for (const c of CK_COMMODITIES) {
    const n = sub[c] ?? 0;
    if (n > 0) result[c] = Math.max(0, (result[c] ?? 0) - n);
  }
  return result;
}

export function hasCkCommodities(
  bundle: CkCommodityBundle,
  required: CkCommodityBundle,
): boolean {
  for (const c of CK_COMMODITIES) {
    if ((bundle[c] ?? 0) < (required[c] ?? 0)) return false;
  }
  return true;
}

export function syncPublicCommodityCounts(ck: CitiesKnightsState): void {
  for (const playerId of Object.keys(ck.playerCommodities)) {
    ck.publicCommodityCounts[playerId] = totalCkCommodities(ck.playerCommodities[playerId]);
  }
}

export function syncPublicProgressCounts(ck: CitiesKnightsState): void {
  for (const playerId of Object.keys(ck.progressHands)) {
    ck.publicProgressCounts[playerId] = ck.progressHands[playerId]?.length ?? 0;
  }
}

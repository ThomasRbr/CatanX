// ============================================================
// GameEngine — Orchestrateur central de la partie
// Gère le cycle de jeu, les tours, les validations
// ============================================================

import {
  GameState,
  GameConfig,
  GamePhase,
  TurnPhase,
  DiceRoll,
  ActionLogEntry,
  ActionType,
} from '../../types/game';
import {
  Player,
  AgeType,
  CivilizationType,
  PlayerType,
  AIPersonality,
  AIDifficulty,
  PlayerColor,
  PlayerProfile,
} from '../../types/player';
import { HexTile } from '../../types/hex';
import { MapGenerator, findStartingPositions } from '../map/MapGenerator';
import { hexToId, fieldOfView, hexSpiral, hexAllNeighbors } from '../hex/HexMath';
import {
  collectDiceResources,
  calculateTurnProduction,
  calculateMaintenanceCost,
  updateMarketPrices,
  initializeMarket,
  addResources,
  subtractResources,
  hasResources,
  capResources,
  defaultResourceCap,
  totalResources,
  tradeWithBank,
  getPortTradeRatio,
  playerUsesGenericPortOnly,
  resolveBuildingProductionTileIds,
} from '../resources/ResourceSystem';
import {
  isCitiesKnightsEnabled,
  applyExtensionVictoryBonuses,
  normalizeExtensionsConfig,
  isSeasonsEnabled,
  isUndergroundSkyEnabled,
  isPactsEmbassiesEnabled,
  syncDeprecatedEnableSeasons,
  syncDeprecatedDiplomacyMirrors,
} from '../../core/extensions';
import {
  createCitiesKnightsState,
  replaceDevelopmentCardsForCitiesKnights,
} from '../citiesKnights/state';
import { createSeasonsState, syncSeasonMirrors } from '../seasons/state';
import { tickSeasonRound } from '../seasons/clock';
import {
  applyClimateProductionPenalties,
  applySeasonalAbundanceBonuses,
} from '../seasons/production';
import {
  getSeasonalHandLimitDelta,
  getSeasonalTradeRatioModifier,
  markSeasonalTradeUsed,
} from '../seasons/costs';
import { queueSeasonEvents, shouldAutoUseSeasonPreparation } from '../seasons/events';
import { ensureProgressDecks, PROGRESS_HAND_LIMIT } from '../citiesKnights/progress';
import {
  createUndergroundSkyState,
  applyUndergroundProduction,
  advanceAirshipsForPlayer,
  resetUndergroundSkyTurnUsage,
  undergroundSkyVictoryPoints,
  materialHandCount,
  totalMaterials,
  hasMaterials,
  spendPlayerMaterials,
  grantMaterialsFromBank,
  getMaterialBankTradeRatio,
  executeBankTradeMaterial,
  syncPublicMaterialCounts,
  ensureUndergroundSkyState,
} from '../undergroundSky';
import {
  createPactsEmbassiesState,
  tickPactsEmbassiesClock,
  peVictoryPoints,
  sharedReserveHandBonus,
  peHandLimitBonus,
  peBeforeSeasonTransition,
  consumePortCharterIfNeeded,
} from '../pactsEmbassies';
import type {
  UndergroundSkyMaterialBundle,
} from '../../types/undergroundSky';
import { US_MATERIALS } from '../../types/undergroundSky';
import type { CatanTopology } from '../catan/CatanTopology';
import { buildCatanTopology } from '../catan/CatanTopology';
import {
  applyCitiesKnightsCommodityProduction,
  cleanCommodityBundle,
  getCkCommodityTradeRatio,
  getCkCommodityTradeRatioSeasonal,
  grantCommoditiesToPlayer,
  playerCommodityHandSize,
  removeCommoditiesFromPlayer,
  returnCommoditiesToBank,
  takeCommoditiesFromBank,
} from '../citiesKnights/commodities';
import { attachCkDiceToRoll, resolveCkEventDie } from '../citiesKnights/eventDie';
import { maybeQueueAqueduct, ckHandLimit } from '../citiesKnights/urban';
import { resetKnightTurnFlags } from '../citiesKnights/knights';
import { hasCkCommodities, totalCkCommodities } from '../citiesKnights/state';
import type { CkCommodity } from '../../types/citiesKnights';
import { CK_COMMODITIES } from '../../types/citiesKnights';
import type { CkCommodityBundle } from '../../types/citiesKnights';
import { ResourceBundle } from '../../types/resources';
import {
  generateEventsForTurn,
  applyEventEffects,
  cleanupExpiredEvents,
} from '../events/EventSystem';
import {
  decayRelations,
  checkTreatyExpirations,
  advanceWorldCouncil,
} from '../diplomacy/DiplomacyEngine';
import { TechTreeEngine } from '../tech/TechTree';
import { UNIT_BASE_STATS } from '../military/CombatEngine';
import { CIVILIZATIONS, applyStartingBonuses } from '../civilizations/Civilizations';
import {
  finalizeClassicGameCreate,
  isClassicMode,
  usesLimitedBank,
  usesTopologicalPlacement,
  createBankForState,
  ensureLimitedBank,
  grantPortsAdjacentToTile,
  returnResourcesToBank,
  takeResourcesFromBank,
  totalClassicResources,
  ensureClassicRuntimeState,
  classicLandProductionTiles,
  CLASSIC_RESOURCE_TYPES,
  applyClassicBankProduction,
} from '../catan/ClassicBoard';
import type { BuildingInstance } from '../../types/buildings';
import { UnitType, UnitInstance } from '../../types/military';
import { baselineScienceForPlayer, ensurePendingEventChoices } from '../modules/ModuleActions';
import { advancePlayerCrafts } from '../resources/ProductionSystem';
import { advanceBarbarians } from '../military/BarbarianSystem';
import { randomInt, randomChoice } from '../../core/rng';
import { now } from '../../core/clock';
import { nextId, resetActiveIdGenerator } from '../../core/ids';

// ============================================================
// FACTORY — Créer une nouvelle partie
// ============================================================

/** Configuration par joueur pour la création de partie */
export interface PlayerSetup {
  name: string;
  civilization: CivilizationType;
  type: PlayerType;
  aiPersonality?: AIPersonality;
  aiDifficulty?: AIDifficulty;
  color?: PlayerColor;
  profile?: PlayerProfile;
}

function genId(prefix: string): string {
  return nextId(prefix);
}

export function createGame(config: GameConfig, playerSetups: PlayerSetup[]): GameState {
  resetActiveIdGenerator();
  const normalizedExtensions = normalizeExtensionsConfig(config.extensions, {
    mode: config.mode,
  });
  let effectiveConfig: GameConfig = {
    ...config,
    extensions: normalizedExtensions,
  };
  effectiveConfig = syncDeprecatedEnableSeasons(effectiveConfig);
  effectiveConfig = syncDeprecatedDiplomacyMirrors(effectiveConfig);
  effectiveConfig = applyExtensionVictoryBonuses(effectiveConfig);
  const generator = new MapGenerator(effectiveConfig);
  const map = generator.generate();

  const players = new Map<string, Player>();
  const turnOrder: string[] = [];

  // Positions de départ
  const mapRadius = { tiny: 2, small: 3, medium: 4, large: 5, huge: 6, epic: 8 }[
    effectiveConfig.mapSize
  ];
  const startPositions = findStartingPositions(
    map,
    effectiveConfig.playerCount,
    mapRadius,
    effectiveConfig.mapSeed,
  );

  const colors = ['red', 'blue', 'green', 'orange', 'purple', 'white', 'brown', 'cyan'] as const;

  for (let i = 0; i < effectiveConfig.playerCount; i++) {
    const id = genId('player');
    const setup = playerSetups[i] ?? {
      name: `Joueur ${i + 1}`,
      civilization: 'empire' as CivilizationType,
      type: 'human' as PlayerType,
    };
    // BUG FIX: utiliser la civilisation depuis le setup au lieu de forcer 'empire'
    const player = createPlayer(
      id,
      setup,
      setup.color ?? setup.profile?.pieceColor ?? colors[i % colors.length],
      i,
      effectiveConfig,
    );
    // Main vide style CATAN : pas de pack de départ ni bonus civ si startingResources === 'none'
    if (effectiveConfig.mode !== 'classic' && effectiveConfig.startingResources !== 'none') {
      const civDef = CIVILIZATIONS[setup.civilization];
      applyStartingBonuses(player, civDef);
    }
    players.set(id, player);
    turnOrder.push(id);
  }

  // Placement initial (CatanX / non-classique uniquement)
  if (effectiveConfig.mode !== 'classic') {
    startPositions.forEach((pos, idx) => {
      const playerId = turnOrder[idx];
      if (!playerId) return;
      const tileId = hexToId(pos);
      const tile = map.get(tileId);
      if (!tile) return;

      tile.owner = playerId;
      tile.explored.add(playerId);
      tile.visible.add(playerId);

      const player = players.get(playerId)!;
      player.settlements.push(tileId);
      player.ownedTiles.push(tileId);
    });
  }

  // Brouillard de guerre initial
  if (effectiveConfig.fogOfWar) {
    for (const [, player] of players) {
      updatePlayerVision(player, map); // pas d'unités au départ
    }
  }

  const state: GameState = {
    id: genId('game'),
    name: 'Nouvelle Partie CatanX',
    config: effectiveConfig,
    createdAt: now(),
    updatedAt: now(),
    phase: 'setup',
    currentTurn: 1,
    currentPlayerIndex: 0,
    turnPhase: 'start_of_turn',
    turnOrder,
    map,
    mapWidth: mapRadius * 2 + 1,
    mapHeight: mapRadius * 2 + 1,
    mapRadius,
    players,
    units: new Map(),
    buildings: new Map(),
    barbarians: new Map(),
    market: initializeMarket(),
    season: 'spring',
    seasonTurn: 1,
    year: 1,
    activeEvents: [],
    eventHistory: [],
    pendingChoices: [],
    lastDiceRoll: null,
    diceHistory: [],
    robberPosition: findDesert(map),
    piratePosition: null,
    sevenFlow: null,
    pendingPlayerTrade: null,
    longestRoadOwner: null,
    largestArmyOwner: null,
    longestRoadLength: 0,
    largestArmySize: 0,
    worldCouncil: {
      active: effectiveConfig.worldCouncil,
      votes: {},
      history: [],
      nextVoteTurn: 20,
      resolutionCursor: 0,
      activeEffects: [],
    },
    winner: null,
    rankings: [],
    actionLog: [],
    chatMessages: [],
    eventCooldowns: {},
    setupRound: 1,
    setupPlacementIndex: 0,
    setupPlayerOrder: [...turnOrder, ...[...turnOrder].reverse()], // serpent 1,2,3,4,4,3,2,1
    extensions: {},
  };

  if (isCitiesKnightsEnabled(effectiveConfig)) {
    state.extensions = {
      ...state.extensions,
      citiesKnights: createCitiesKnightsState(turnOrder, effectiveConfig.playerCount),
    };
    ensureProgressDecks(state);
  }

  if (isSeasonsEnabled(effectiveConfig)) {
    state.extensions = {
      ...state.extensions,
      seasons: createSeasonsState(
        turnOrder,
        effectiveConfig.mapSeed,
        effectiveConfig.extensions?.seasons,
      ),
    };
    syncSeasonMirrors(state);
  }

  if (isUndergroundSkyEnabled(effectiveConfig)) {
    const topology: CatanTopology =
      state.classicBoard?.topology ?? buildCatanTopology(state.map);
    state.extensions = {
      ...state.extensions,
      undergroundSky: createUndergroundSkyState(
        turnOrder,
        effectiveConfig.playerCount,
        state.map,
        effectiveConfig.mapSeed,
        {
          topology,
          citiesKnightsEnabled: isCitiesKnightsEnabled(effectiveConfig),
        },
      ),
    };
  }

  if (isPactsEmbassiesEnabled(effectiveConfig)) {
    const peConfig = effectiveConfig.extensions?.pactsEmbassies;
    state.extensions = {
      ...state.extensions,
      pactsEmbassies: createPactsEmbassiesState(
        turnOrder,
        effectiveConfig.playerCount,
        effectiveConfig.mapSeed,
        {
          roundsPerCouncilSession:
            isSeasonsEnabled(effectiveConfig)
              ? effectiveConfig.extensions?.seasons?.roundsPerSeason ?? 5
              : peConfig?.roundsPerCouncilSession ?? 4,
          citiesKnightsEnabled: isCitiesKnightsEnabled(effectiveConfig),
          seasonsEnabled: isSeasonsEnabled(effectiveConfig),
          undergroundSkyEnabled: isUndergroundSkyEnabled(effectiveConfig),
        },
      ),
    };
  }

  syncRobberToTile(state, state.robberPosition);
  if (effectiveConfig.mode === 'classic') {
    finalizeClassicGameCreate(state);
  } else if (usesLimitedBank(state)) {
    state.bank = createBankForState(state);
    for (const [playerId, player] of state.players) {
      for (const settlementId of player.settlements) {
        grantPortsAdjacentToTile(state, playerId, settlementId);
      }
    }
  }

  // C&K : pas de deck Développement / Plus grande armée
  if (isCitiesKnightsEnabled(state)) {
    replaceDevelopmentCardsForCitiesKnights(state);
  }

  return state;
}

function createPlayer(
  id: string,
  setup: PlayerSetup,
  color: Player['color'],
  turnOrder: number,
  config?: GameConfig,
): Player {
  const classic = config?.mode === 'classic' || config?.startingResources === 'none';
  return {
    id,
    name: setup.name,
    color,
    type: setup.type,
    civilization: setup.civilization,
    profile: setup.profile,
    aiPersonality: setup.aiPersonality,
    aiDifficulty: setup.aiDifficulty,
    resources: classic ? {} : { wood: 2, clay: 2, wheat: 2, sheep: 2, ore: 1 },
    resourceCap: {},
    productionQueue: [],
    settlements: [],
    cities: [],
    metropolis: [],
    roads: [],
    ownedTiles: [],
    researchedTechs: [],
    currentResearch: null,
    researchProgress: 0,
    age: 'stone_age' as AgeType,
    researchQueue: [],
    units: [],
    army: [],
    militaryCards: [],
    relations: {},
    activeTradeDeals: [],
    diplomaticCards: [],
    devCards: [],
    devCardsPlayedThisTurn: 0,
    freeRoadsRemaining: 0,
    specialAbilities: [],
    wonders: [],
    objectives: [],
    ports: [],
    isEliminated: false,
    stats: {
      militaryStrength: 0,
      totalUnits: 0,
      battlesWon: 0,
      battlesLost: 0,
      citiesRazed: 0,
      totalResourcesCollected: 0,
      totalResourcesTraded: 0,
      coinsEarned: 0,
      tilesOwned: 0,
      citiesOwned: 0,
      settlementsOwned: 1,
      techsResearched: 0,
      currentAge: 'stone_age' as AgeType,
      alliancesFormed: 0,
      treatiesBroken: 0,
      victoryPoints: 1,
      vpBreakdown: {
        settlements: 1,
        cities: 0,
        metropolis: 0,
        longestRoad: 0,
        largestArmy: 0,
        techCards: 0,
        wonders: 0,
        objectives: 0,
        culture: 0,
        faith: 0,
        defenderOfCatan: 0,
        undergroundSky: 0,
        pactsEmbassies: 0,
      },
    },
    turnOrder,
    isActive: turnOrder === 0,
    betrayalCount: 0,
    hasBetrayedAlliance: false,
    abilityCooldowns: {},
  };
}

// ============================================================
// CYCLE DE TOUR
// ============================================================

export function processTurn(state: GameState): GameState {
  const player = state.players.get(state.turnOrder[state.currentPlayerIndex]);
  if (!player) return state;

  // Fin du joueur actif, puis début du suivant (dés / actions restent manuels).
  runEndOfTurn(state, player);

  const next = state.players.get(state.turnOrder[state.currentPlayerIndex]);
  if (next && state.phase === 'playing') {
    beginPlayerTurn(state);
  }

  return state;
}

/** Démarre le tour du joueur actif (production, tech, craft, reset unités). */
export function beginPlayerTurn(state: GameState): void {
  const player = state.players.get(state.turnOrder[state.currentPlayerIndex]);
  if (!player || player.isEliminated) return;
  runStartOfTurn(state, player);
}

function runStartOfTurn(state: GameState, player: Player): void {
  state.turnPhase = 'start_of_turn';

  // Réinitialiser les unités
  for (const unitId of player.units) {
    const unit = state.units.get(unitId);
    if (unit) {
      unit.hasMoved = false;
      unit.hasAttacked = false;
    }
  }

  player.devCardsPlayedThisTurn = 0;
  resetKnightTurnFlags(state, player.id);
  if (isUndergroundSkyEnabled(state)) {
    resetUndergroundSkyTurnUsage(state, player.id);
  }

  // Résolution des événements
  if (state.config.enableEvents) {
    const newEvents = generateEventsForTurn(state);
    for (const event of newEvents) {
      state.activeEvents.push(event);
      logAction(state, player.id, 'system', `Événement : ${event.name}`, { eventId: event.id });

      // Appliquer effets immédiats (durée 0)
      if (event.duration === 0 && !event.choices?.length) {
        applyEventEffects(event, state);
      }
    }
    ensurePendingEventChoices(state);
  }

  // Production de tour (bâtiments, science, culture...)
  let turnProduction: ResourceBundle = {};
  if (state.config.enableProductionChains) {
    turnProduction = calculateTurnProduction(player, state);
    player.resources = addResources(player.resources, turnProduction);
  }

  // Recherche technologique
  if (state.config.enableTechTree && player.currentResearch) {
    const scienceProduced = (turnProduction.science ?? 0) + baselineScienceForPlayer(player, state);
    const result = TechTreeEngine.advanceTurn(player, scienceProduced);
    if (result.completed) {
      logAction(state, player.id, 'research', `Technologie complétée : ${result.completed}`, {
        tech: result.completed,
      });
    }
    if (result.ageAdvanced) {
      logAction(state, player.id, 'system', `Nouvel âge atteint : ${result.ageAdvanced}`, {
        age: result.ageAdvanced,
      });
    }
  }

  // Craft multi-tours
  if (state.config.enableProductionChains) {
    advancePlayerCrafts(player, state);
  }
}

export function hasPlayerRolledDiceThisTurn(state: GameState, playerId: string): boolean {
  if (state.lastDiceRoll?.turn === state.currentTurn && state.lastDiceRoll.player === playerId) {
    return true;
  }
  return state.diceHistory.some(
    (roll) => roll.turn === state.currentTurn && roll.player === playerId,
  );
}

export function rollDice(state: GameState): DiceRoll {
  const alchemist = isCitiesKnightsEnabled(state)
    ? (state.extensions?.citiesKnights?.progressBuffs?.alchemistDice ?? null)
    : null;
  let die1: number;
  let die2: number;
  if (alchemist) {
    die1 = alchemist.die1;
    die2 = alchemist.die2;
    if (state.extensions?.citiesKnights?.progressBuffs) {
      state.extensions.citiesKnights.progressBuffs.alchemistDice = null;
    }
  } else {
    die1 = randomInt(1, 6);
    die2 = randomInt(1, 6);
  }
  const total = die1 + die2;
  const playerId = state.turnOrder[state.currentPlayerIndex];

  let roll: DiceRoll = { turn: state.currentTurn, player: playerId, die1, die2, total };
  roll = attachCkDiceToRoll(state, roll);
  state.lastDiceRoll = roll;
  state.diceHistory.push(roll);

  // Villes & Chevaliers : dé Événement puis éventuelle invasion (stub) avant 7 / production
  resolveCkEventDie(state, roll);

  // Collecte des ressources
  if (total === 7) {
    if (usesLimitedBank(state)) {
      beginSevenFlow(state);
    } else {
      handleRobber(state);
      state.turnPhase = 'player_action';
    }
  } else {
    // Ordre : Surface → CK convert → Saisons → Souterrain → modules → pénuries → Aqueduc → dirigeables
    const collections = collectDiceResources(total, state, { skipBank: true });
    const commodityRecipients = applyCitiesKnightsCommodityProduction(state, total, collections);
    applyClimateProductionPenalties(state, collections, total);
    if (usesLimitedBank(state)) {
      applyClassicBankProduction(state, collections);
    }
    const collectedIds = new Set<string>(commodityRecipients);
    for (const { playerId: pId, resources } of collections) {
      const player = state.players.get(pId);
      if (!player) continue;
      const gained = Object.values(resources).reduce((s, v) => s + (v ?? 0), 0);
      if (gained > 0) collectedIds.add(pId);
      player.resources = addResources(player.resources, resources);
      player.stats.totalResourcesCollected += gained;
    }
    const bonusResult = applySeasonalAbundanceBonuses(state, collections);
    queueSeasonEvents(state, bonusResult.events);
    if (isUndergroundSkyEnabled(state)) {
      const ugGrants = applyUndergroundProduction(state, total);
      for (const grant of ugGrants) collectedIds.add(grant.playerId);
    }
    maybeQueueAqueduct(state, total, collectedIds);
    if (isUndergroundSkyEnabled(state) && playerId) {
      advanceAirshipsForPlayer(state, playerId);
    }
    state.turnPhase = 'resource_collect';
  }
  return roll;
}

export function syncRobberToTile(state: GameState, tileId: string | null): void {
  for (const [, tile] of state.map) {
    tile.robber = false;
  }
  state.robberPosition = tileId;
  if (tileId) {
    const tile = state.map.get(tileId);
    if (tile) tile.robber = true;
  }
}

function getPlayersOnTile(state: GameState, tileId: string): string[] {
  const owners = new Set<string>();
  for (const [, building] of state.buildings) {
    if (!['settlement', 'city', 'metropolis'].includes(building.definitionId)) continue;
    const productionTiles = resolveBuildingProductionTileIds(state, building);
    if (productionTiles.includes(tileId)) {
      owners.add(building.ownerId);
    }
  }
  if (owners.size === 0) {
    const tile = state.map.get(tileId);
    if (tile?.owner) owners.add(tile.owner);
  }
  return [...owners];
}

function handSizeForSeven(player: Player, state: GameState): number {
  const classicOrLimited = isClassicMode(state) || usesLimitedBank(state);
  const resources = classicOrLimited
    ? totalClassicResources(player.resources)
    : totalResources(player.resources);
  return (
    resources +
    playerCommodityHandSize(state, player.id) +
    materialHandCount(state, player.id)
  );
}

function handLimitForSeven(player: Player, state: GameState): number {
  let limit = 7;
  if (isCitiesKnightsEnabled(state)) {
    limit = ckHandLimit(state, player.id);
  }
  // Réserve Saisons : +2 ; Réserve commune PE : +1 ; résolutions PE
  return Math.max(
    1,
    limit +
      getSeasonalHandLimitDelta(state, player.id) +
      sharedReserveHandBonus(state, player.id) +
      peHandLimitBonus(state, player.id),
  );
}

function isCkRobberDormant(state: GameState): boolean {
  return isCitiesKnightsEnabled(state) && !state.extensions?.citiesKnights?.robberUnlocked;
}

function beginSevenFlow(state: GameState): void {
  const playersToDiscard = [...state.players.values()]
    .filter(
      (player) =>
        !player.isEliminated && handSizeForSeven(player, state) > handLimitForSeven(player, state),
    )
    .map((player) => player.id);

  state.sevenFlow = {
    playersToDiscard,
    playersDiscarded: [],
    robberTileId: null,
    stealCandidates: [],
  };

  if (playersToDiscard.length > 0) {
    state.turnPhase = 'discard_resources';
  } else if (isCkRobberDormant(state)) {
    finishSevenFlow(state);
  } else {
    state.turnPhase = 'move_robber';
  }
}

function finishSevenFlow(state: GameState): void {
  state.sevenFlow = null;
  state.turnPhase = 'player_action';
  const activeId = state.turnOrder[state.currentPlayerIndex];
  if (activeId && isUndergroundSkyEnabled(state)) {
    advanceAirshipsForPlayer(state, activeId);
  }
}

export function discardResources(
  playerId: string,
  resources: ResourceBundle,
  state: GameState,
  commodities?: CkCommodityBundle,
  undergroundSkyMaterials?: UndergroundSkyMaterialBundle,
): { success: boolean; reason?: string } {
  if (state.turnPhase !== 'discard_resources' || !state.sevenFlow) {
    return { success: false, reason: 'Aucune défausse en cours' };
  }
  if (!state.sevenFlow.playersToDiscard.includes(playerId)) {
    return { success: false, reason: 'Ce joueur ne doit pas défausser' };
  }
  if (state.sevenFlow.playersDiscarded.includes(playerId)) {
    return { success: false, reason: 'Défausse déjà effectuée' };
  }

  const player = state.players.get(playerId);
  if (!player) return { success: false, reason: 'Joueur introuvable' };

  const required = Math.floor(handSizeForSeven(player, state) / 2);
  const commodityPart = cleanCommodityBundle(commodities);
  const materialPart: UndergroundSkyMaterialBundle = {};
  for (const key of US_MATERIALS) {
    const n = undergroundSkyMaterials?.[key] ?? 0;
    if (n > 0) materialPart[key] = n;
  }
  const offeredResources = isClassicMode(state)
    ? totalClassicResources(resources)
    : totalResources(resources);
  const offered =
    offeredResources + totalCkCommodities(commodityPart) + totalMaterials(materialPart);
  if (offered !== required) {
    return { success: false, reason: `Défaussez exactement ${required} cartes` };
  }
  if (!hasResources(player.resources, resources)) {
    return { success: false, reason: 'Ressources insuffisantes' };
  }
  if (totalCkCommodities(commodityPart) > 0) {
    const ck = state.extensions?.citiesKnights;
    const hand = ck?.playerCommodities[playerId] ?? {};
    if (!hasCkCommodities(hand, commodityPart)) {
      return { success: false, reason: 'Marchandises insuffisantes' };
    }
  }
  if (totalMaterials(materialPart) > 0) {
    const us = ensureUndergroundSkyState(state);
    if (!us || !hasMaterials(us.playerMaterials[playerId] ?? {}, materialPart)) {
      return { success: false, reason: 'Matériaux insuffisants' };
    }
  }

  player.resources = subtractResources(player.resources, resources);
  returnResourcesToBank(state, resources);
  if (totalCkCommodities(commodityPart) > 0) {
    removeCommoditiesFromPlayer(state, playerId, commodityPart);
    returnCommoditiesToBank(state, commodityPart);
  }
  if (totalMaterials(materialPart) > 0) {
    const us = ensureUndergroundSkyState(state);
    if (us) spendPlayerMaterials(us, playerId, materialPart);
  }
  state.sevenFlow.playersDiscarded.push(playerId);

  if (state.sevenFlow.playersDiscarded.length >= state.sevenFlow.playersToDiscard.length) {
    if (isCkRobberDormant(state)) {
      finishSevenFlow(state);
    } else {
      state.turnPhase = 'move_robber';
    }
  }

  logAction(state, playerId, 'system', `Défausse sur 7 (${offered})`, {
    resources,
    commodities: commodityPart,
    undergroundSkyMaterials: materialPart,
  });
  return { success: true };
}

export function moveRobber(
  playerId: string,
  tileId: string,
  state: GameState,
): { success: boolean; reason?: string } {
  if (isCkRobberDormant(state)) {
    return { success: false, reason: 'Le brigand est inactif avant la première invasion' };
  }
  if (state.turnPhase !== 'move_robber') {
    return { success: false, reason: 'Le brigand ne peut pas être déplacé maintenant' };
  }

  const activePlayerId = state.turnOrder[state.currentPlayerIndex];
  if (activePlayerId !== playerId) {
    return { success: false, reason: "Ce n'est pas votre tour" };
  }

  const tile = state.map.get(tileId);
  if (!tile || tile.terrain === 'ocean' || tile.terrain === 'glacier') {
    return { success: false, reason: 'Tuile invalide pour le brigand' };
  }
  if (tileId === state.robberPosition) {
    return { success: false, reason: 'Le brigand doit changer de tuile' };
  }

  syncRobberToTile(state, tileId);
  if (!state.sevenFlow) {
    state.sevenFlow = {
      playersToDiscard: [],
      playersDiscarded: [],
      robberTileId: tileId,
      stealCandidates: [],
    };
  } else {
    state.sevenFlow.robberTileId = tileId;
  }

  const stealCandidates = getPlayersOnTile(state, tileId).filter((id) => id !== playerId);
  state.sevenFlow.stealCandidates = stealCandidates;

  if (stealCandidates.length === 0) {
    finishSevenFlow(state);
  } else {
    state.turnPhase = 'steal_resource';
  }

  logAction(state, playerId, 'system', 'Brigand déplacé', { tileId });
  return { success: true };
}

export function stealResource(
  playerId: string,
  targetPlayerId: string | null,
  state: GameState,
): { success: boolean; reason?: string } {
  if (state.turnPhase !== 'steal_resource' || !state.sevenFlow) {
    return { success: false, reason: 'Aucun vol en cours' };
  }

  const activePlayerId = state.turnOrder[state.currentPlayerIndex];
  if (activePlayerId !== playerId) {
    return { success: false, reason: "Ce n'est pas votre tour" };
  }

  if (!targetPlayerId) {
    finishSevenFlow(state);
    return { success: true };
  }

  if (!state.sevenFlow.stealCandidates.includes(targetPlayerId)) {
    return { success: false, reason: 'Cible de vol invalide' };
  }

  const player = state.players.get(playerId);
  const target = state.players.get(targetPlayerId);
  if (!player || !target) return { success: false, reason: 'Joueur introuvable' };

  type StealPool =
    | { kind: 'resource'; key: keyof ResourceBundle }
    | { kind: 'commodity'; key: CkCommodity }
    | { kind: 'material'; key: (typeof US_MATERIALS)[number] };
  const pool: StealPool[] = [];

  const resKeys = (Object.keys(target.resources) as (keyof ResourceBundle)[]).filter((resource) => {
    if ((target.resources[resource] ?? 0) <= 0) return false;
    if (!isClassicMode(state) && !usesLimitedBank(state)) return true;
    return ['wood', 'clay', 'wheat', 'sheep', 'ore'].includes(String(resource));
  });
  for (const key of resKeys) pool.push({ kind: 'resource', key });

  if (isCitiesKnightsEnabled(state)) {
    const hand = state.extensions?.citiesKnights?.playerCommodities[targetPlayerId] ?? {};
    for (const c of CK_COMMODITIES) {
      if ((hand[c] ?? 0) > 0) pool.push({ kind: 'commodity', key: c });
    }
  }

  if (isUndergroundSkyEnabled(state)) {
    const matHand = state.extensions?.undergroundSky?.playerMaterials[targetPlayerId] ?? {};
    for (const m of US_MATERIALS) {
      if ((matHand[m] ?? 0) > 0) pool.push({ kind: 'material', key: m });
    }
  }

  if (pool.length > 0) {
    const stolen = randomChoice(pool);
    if (stolen) {
      if (stolen.kind === 'resource') {
        target.resources[stolen.key] = (target.resources[stolen.key] ?? 0) - 1;
        player.resources[stolen.key] = (player.resources[stolen.key] ?? 0) + 1;
        logAction(state, playerId, 'system', `Vol de ${stolen.key} à ${target.name}`, {
          targetPlayerId,
          resource: stolen.key,
        });
      } else if (stolen.kind === 'commodity') {
        removeCommoditiesFromPlayer(state, targetPlayerId, { [stolen.key]: 1 });
        grantCommoditiesToPlayer(state, playerId, { [stolen.key]: 1 });
        logAction(state, playerId, 'system', `Vol de ${stolen.key} à ${target.name}`, {
          targetPlayerId,
          commodity: stolen.key,
        });
      } else {
        const us = ensureUndergroundSkyState(state);
        if (us) {
          const fromHand = us.playerMaterials[targetPlayerId] ?? {};
          if ((fromHand[stolen.key] ?? 0) > 0) {
            us.playerMaterials[targetPlayerId] = {
              ...fromHand,
              [stolen.key]: (fromHand[stolen.key] ?? 0) - 1,
            };
            if ((us.playerMaterials[targetPlayerId]![stolen.key] ?? 0) <= 0) {
              delete us.playerMaterials[targetPlayerId]![stolen.key];
            }
            const toHand = us.playerMaterials[playerId] ?? {};
            us.playerMaterials[playerId] = {
              ...toHand,
              [stolen.key]: (toHand[stolen.key] ?? 0) + 1,
            };
            syncPublicMaterialCounts(us);
          }
        }
        logAction(state, playerId, 'system', `Vol de ${stolen.key} à ${target.name}`, {
          targetPlayerId,
          material: stolen.key,
        });
      }
    }
  }

  finishSevenFlow(state);
  return { success: true };
}

export function bankTrade(
  playerId: string,
  give: ResourceBundle,
  receive: ResourceBundle,
  state: GameState,
  giveCommodities?: CkCommodityBundle,
  receiveCommodities?: CkCommodityBundle,
  options?: {
    useSeasonPreparation?: boolean;
    giveMaterials?: UndergroundSkyMaterialBundle;
    receiveMaterials?: UndergroundSkyMaterialBundle;
  },
): { success: boolean; reason?: string } {
  const player = state.players.get(playerId);
  if (!player) return { success: false, reason: 'Joueur introuvable' };

  const activePlayerId = state.turnOrder[state.currentPlayerIndex];
  if (activePlayerId !== playerId) {
    return { success: false, reason: "Ce n'est pas votre tour" };
  }
  if (state.turnPhase !== 'player_action') {
    return { success: false, reason: 'Commerce indisponible dans cette phase' };
  }

  const giveMats: UndergroundSkyMaterialBundle = {};
  const recvMats: UndergroundSkyMaterialBundle = {};
  for (const key of US_MATERIALS) {
    const g = options?.giveMaterials?.[key] ?? 0;
    const r = options?.receiveMaterials?.[key] ?? 0;
    if (g > 0) giveMats[key] = g;
    if (r > 0) recvMats[key] = r;
  }
  const hasGiveMat = totalMaterials(giveMats) > 0;
  const hasRecvMat = totalMaterials(recvMats) > 0;

  if (hasGiveMat || hasRecvMat) {
    if (!isUndergroundSkyEnabled(state)) {
      return { success: false, reason: 'Matériaux indisponibles sans Souterrain & Ciel' };
    }
    const us = ensureUndergroundSkyState(state);
    if (!us) {
      return { success: false, reason: 'État Souterrain & Ciel manquant' };
    }
    const giveMatTypes = US_MATERIALS.filter((m) => (giveMats[m] ?? 0) > 0);
    const recvMatTypes = US_MATERIALS.filter((m) => (recvMats[m] ?? 0) > 0);
    const giveResTypes = Object.entries(give).filter(([, amount]) => (amount ?? 0) > 0);
    const recvResTypes = Object.entries(receive).filter(([, amount]) => (amount ?? 0) > 0);
    const giveComm = cleanCommodityBundle(giveCommodities);
    const recvComm = cleanCommodityBundle(receiveCommodities);
    const giveSide =
      giveMatTypes.length +
      giveResTypes.length +
      CK_COMMODITIES.filter((c) => (giveComm[c] ?? 0) > 0).length;
    const recvSide =
      recvMatTypes.length +
      recvResTypes.length +
      CK_COMMODITIES.filter((c) => (recvComm[c] ?? 0) > 0).length;
    if (giveSide !== 1 || recvSide !== 1) {
      return { success: false, reason: 'Échange banque : 1 type donné pour 1 type reçu' };
    }

    let baseRatio = getMaterialBankTradeRatio(state, playerId);
    const useCommerce =
      Boolean(options?.useSeasonPreparation) ||
      shouldAutoUseSeasonPreparation(state, playerId, 'commerce');
    const ratio = getSeasonalTradeRatioModifier(state, playerId, baseRatio, {
      useCommerce,
      isCommodity: false,
      isGenericPort: baseRatio === 3,
    });

    if (hasGiveMat) {
      const material = giveMatTypes[0]!;
      const giveAmount = giveMats[material]!;
      if (hasRecvMat) {
        const recv = recvMatTypes[0]!;
        const recvAmt = recvMats[recv]!;
        if (giveAmount !== recvAmt * ratio) {
          return { success: false, reason: `Ratio matériaux requis : ${ratio}:1` };
        }
        if (!executeBankTradeMaterial(us, playerId, material, recv, ratio)) {
          return { success: false, reason: 'Échange de matériaux impossible' };
        }
        if (useCommerce) markSeasonalTradeUsed(state, playerId);
        logAction(state, playerId, 'trade', 'Échange banque matériaux', {
          giveMaterials: giveMats,
          receiveMaterials: recvMats,
          ratio,
        });
        return { success: true };
      }
      if (recvResTypes.length === 1) {
        const [receiveResource, receiveAmount] = recvResTypes[0] as [keyof ResourceBundle, number];
        if (giveAmount !== receiveAmount * ratio) {
          return { success: false, reason: `Ratio matériaux requis : ${ratio}:1` };
        }
        if (!hasMaterials(us.playerMaterials[playerId] ?? {}, giveMats)) {
          return { success: false, reason: 'Matériaux insuffisants' };
        }
        if (usesLimitedBank(state) && state.bank) {
          if ((state.bank[receiveResource] ?? 0) < receiveAmount) {
            return { success: false, reason: "La banque n'a plus assez de cette ressource" };
          }
        }
        spendPlayerMaterials(us, playerId, giveMats);
        player.resources = addResources(player.resources, {
          [receiveResource]: receiveAmount,
        } as ResourceBundle);
        if (usesLimitedBank(state) && state.bank) {
          state.bank[receiveResource] =
            (state.bank[receiveResource] ?? 0) - receiveAmount;
        }
        if (useCommerce) markSeasonalTradeUsed(state, playerId);
        return { success: true };
      }
    }

    if (hasRecvMat && giveResTypes.length === 1) {
      const [giveResource, giveAmount] = giveResTypes[0] as [keyof ResourceBundle, number];
      const recv = recvMatTypes[0]!;
      const recvAmt = recvMats[recv]!;
      if (giveAmount !== recvAmt * ratio) {
        return { success: false, reason: `Ratio matériaux requis : ${ratio}:1` };
      }
      if (!hasResources(player.resources, { [giveResource]: giveAmount } as ResourceBundle)) {
        return { success: false, reason: 'Ressources insuffisantes' };
      }
      if ((us.materialBank[recv] ?? 0) < recvAmt) {
        return { success: false, reason: "La banque n'a plus assez de ce matériau" };
      }
      player.resources = subtractResources(player.resources, {
        [giveResource]: giveAmount,
      } as ResourceBundle);
      returnResourcesToBank(state, { [giveResource]: giveAmount } as ResourceBundle);
      grantMaterialsFromBank(us, playerId, recvMats);
      if (useCommerce) markSeasonalTradeUsed(state, playerId);
      return { success: true };
    }

    return { success: false, reason: 'Échange matériaux non supporté dans cette combinaison' };
  }

  const giveComm = cleanCommodityBundle(giveCommodities);
  const recvComm = cleanCommodityBundle(receiveCommodities);
  const hasGiveComm = totalCkCommodities(giveComm) > 0;
  const hasRecvComm = totalCkCommodities(recvComm) > 0;

  // Commerce marchandises C&K (séparé des ressources classiques)
  if (hasGiveComm || hasRecvComm) {
    if (!isCitiesKnightsEnabled(state)) {
      return { success: false, reason: 'Marchandises indisponibles sans Villes & Chevaliers' };
    }
    const giveCommTypes = CK_COMMODITIES.filter((c) => (giveComm[c] ?? 0) > 0);
    const recvCommTypes = CK_COMMODITIES.filter((c) => (recvComm[c] ?? 0) > 0);
    const giveResTypes = Object.entries(give).filter(([, amount]) => (amount ?? 0) > 0);
    const recvResTypes = Object.entries(receive).filter(([, amount]) => (amount ?? 0) > 0);

    // Un seul type donné (ressource OU marchandise) et un seul type reçu
    const giveSideCount = giveCommTypes.length + giveResTypes.length;
    const recvSideCount = recvCommTypes.length + recvResTypes.length;
    if (giveSideCount !== 1 || recvSideCount !== 1) {
      return { success: false, reason: 'Échange banque : 1 type donné pour 1 type reçu' };
    }

    if (hasGiveComm) {
      const commodity = giveCommTypes[0]!;
      const giveAmount = giveComm[commodity]!;
      const useCommerce =
        Boolean(options?.useSeasonPreparation) ||
        shouldAutoUseSeasonPreparation(state, playerId, 'commerce');
      const baseRatio = getCkCommodityTradeRatio(state, playerId, commodity);
      const ratio = getCkCommodityTradeRatioSeasonal(state, playerId, commodity, {
        useCommerce,
      });
      const receiveAmount = hasRecvComm
        ? (recvComm[recvCommTypes[0]!] ?? 0)
        : (recvResTypes[0]?.[1] as number);
      if (giveAmount !== receiveAmount * ratio) {
        return { success: false, reason: `Ratio marchandises requis : ${ratio}:1` };
      }
      const hand = state.extensions?.citiesKnights?.playerCommodities[playerId] ?? {};
      if (!hasCkCommodities(hand, giveComm)) {
        return { success: false, reason: 'Marchandises insuffisantes' };
      }
      if (hasRecvComm) {
        const taken = takeCommoditiesFromBank(state, recvComm);
        if (totalCkCommodities(taken) < totalCkCommodities(recvComm)) {
          return { success: false, reason: "La banque n'a plus assez de cette marchandise" };
        }
        removeCommoditiesFromPlayer(state, playerId, giveComm);
        returnCommoditiesToBank(state, giveComm);
        grantCommoditiesToPlayer(state, playerId, taken);
      } else {
        const [receiveResource, recvAmt] = recvResTypes[0] as [keyof ResourceBundle, number];
        if (usesLimitedBank(state) && state.bank) {
          const bankHave = state.bank[receiveResource] ?? 0;
          if (bankHave < recvAmt) {
            return { success: false, reason: "La banque n'a plus assez de cette ressource" };
          }
          state.bank[receiveResource] = bankHave - recvAmt;
        }
        removeCommoditiesFromPlayer(state, playerId, giveComm);
        returnCommoditiesToBank(state, giveComm);
        player.resources = addResources(player.resources, {
          [receiveResource]: recvAmt,
        } as ResourceBundle);
      }
      if (useCommerce || ratio < baseRatio) {
        markSeasonalTradeUsed(state, playerId, {
          useCommerce,
          usedClimateImprove: ratio < baseRatio,
        });
      }
      logAction(state, playerId, 'trade', `Échange banque marchandises`, {
        giveCommodities: giveComm,
        receive,
        receiveCommodities: recvComm,
        ratio,
      });
      return { success: true };
    }

    // Donne ressource, reçoit marchandise
    const [giveResource, giveAmount] = giveResTypes[0] as [keyof ResourceBundle, number];
    const commodity = recvCommTypes[0]!;
    const receiveAmount = recvComm[commodity]!;
    const ratio = getPortTradeRatio(
      player,
      giveResource as import('../../types/resources').ResourceType,
      state,
    );
    if (giveAmount !== receiveAmount * ratio) {
      return { success: false, reason: `Ratio requis : ${ratio}:1` };
    }
    if (!hasResources(player.resources, { [giveResource]: giveAmount } as ResourceBundle)) {
      return { success: false, reason: 'Ressources insuffisantes' };
    }
    const taken = takeCommoditiesFromBank(state, recvComm);
    if (totalCkCommodities(taken) < totalCkCommodities(recvComm)) {
      return { success: false, reason: "La banque n'a plus assez de cette marchandise" };
    }
    player.resources = subtractResources(player.resources, {
      [giveResource]: giveAmount,
    } as ResourceBundle);
    returnResourcesToBank(state, { [giveResource]: giveAmount } as ResourceBundle);
    grantCommoditiesToPlayer(state, playerId, taken);
    logAction(state, playerId, 'trade', `Échange banque → marchandise`, {
      give,
      receiveCommodities: recvComm,
      ratio,
    });
    return { success: true };
  }

  const giveTypes = Object.entries(give).filter(([, amount]) => (amount ?? 0) > 0);
  const receiveTypes = Object.entries(receive).filter(([, amount]) => (amount ?? 0) > 0);
  if (giveTypes.length !== 1 || receiveTypes.length !== 1) {
    return { success: false, reason: 'Échange banque : 1 type donné pour 1 type reçu' };
  }

  const [giveResource, giveAmount] = giveTypes[0] as [keyof ResourceBundle, number];
  const [receiveResource, receiveAmount] = receiveTypes[0] as [keyof ResourceBundle, number];

  const embargo = state.worldCouncil?.activeEffects?.find(
    (effect) => effect.kind === 'embargo' && effect.expiresTurn >= state.currentTurn,
  );
  if (embargo) {
    const banned = (embargo.data?.resources as string[] | undefined) ?? [];
    if (banned.includes(String(giveResource)) || banned.includes(String(receiveResource))) {
      return {
        success: false,
        reason: `Embargo du conseil : ${banned.join(', ')} interdits.`,
      };
    }
  }

  const baseRatio = getPortTradeRatio(
    player,
    giveResource as import('../../types/resources').ResourceType,
    state,
  );
  const isGeneric = playerUsesGenericPortOnly(
    player,
    giveResource as import('../../types/resources').ResourceType,
    state,
  );
  const useCommerce =
    Boolean(options?.useSeasonPreparation) ||
    shouldAutoUseSeasonPreparation(state, playerId, 'commerce');
  const ratioBeforeClimate = baseRatio;
  const ratio = getSeasonalTradeRatioModifier(state, playerId, baseRatio, {
    useCommerce,
    isCommodity: false,
    isGenericPort: isGeneric,
  });
  const expectedGive = receiveAmount * ratio;

  if (giveAmount !== expectedGive) {
    return { success: false, reason: `Ratio requis : ${ratio}:1` };
  }

  const verdict = tradeWithBank(player, give, receive, ratio);
  if (!verdict.success) return verdict;

  if (usesLimitedBank(state) && state.bank) {
    const bankHave = state.bank[receiveResource as keyof ResourceBundle] ?? 0;
    if (bankHave < receiveAmount) {
      return { success: false, reason: "La banque n'a plus assez de cette ressource" };
    }
  } else if (usesLimitedBank(state)) {
    ensureLimitedBank(state);
    const bankHave = state.bank?.[receiveResource as keyof ResourceBundle] ?? 0;
    if (bankHave < receiveAmount) {
      return { success: false, reason: "La banque n'a plus assez de cette ressource" };
    }
  }

  player.resources = subtractResources(player.resources, give);
  player.resources = addResources(player.resources, receive);
  returnResourcesToBank(state, give);
  if (usesLimitedBank(state) && state.bank) {
    state.bank[receiveResource as keyof ResourceBundle] =
      (state.bank[receiveResource as keyof ResourceBundle] ?? 0) - receiveAmount;
  }
  player.stats.totalResourcesTraded += giveAmount + receiveAmount;

  if (useCommerce || ratio < ratioBeforeClimate) {
    markSeasonalTradeUsed(state, playerId, {
      useCommerce,
      usedClimateImprove: ratio < ratioBeforeClimate,
    });
  }

  // Consommer la charte portuaire si elle a fourni le 3:1
  const ownRatio = getPortTradeRatio(
    player,
    giveResource as import('../../types/resources').ResourceType,
    state,
    { ignorePortCharter: true },
  );
  consumePortCharterIfNeeded(state, playerId, ratio, ownRatio);

  logAction(
    state,
    playerId,
    'trade',
    `Échange banque ${giveAmount} ${giveResource} → ${receiveResource}`,
    {
      give,
      receive,
      ratio,
    },
  );
  return { success: true };
}

/**
 * Appelé par le frontend quand l'animation de collecte est terminée.
 * Passe à la phase d'action du joueur.
 */
export function acknowledgeCollection(state: GameState): void {
  if (state.turnPhase === 'resource_collect') {
    state.turnPhase = 'player_action';
  }
}

/** Pendings C&K qui doivent être résolus avant de quitter `resource_collect`. */
export function hasCkCollectionBlockers(state: GameState): boolean {
  const ck = state.extensions?.citiesKnights;
  if (!ck?.pendingResolutions.length) return false;
  return ck.pendingResolutions.some((r) => {
    if (r.kind === 'aqueduct') {
      // Banque vide : ne pas bloquer la collecte (pending nettoyé à end_turn / prune)
      if (usesLimitedBank(state) && state.bank) {
        const has = (['wood', 'clay', 'wheat', 'sheep', 'ore'] as const).some(
          (res) => (state.bank?.[res] ?? 0) > 0,
        );
        if (!has) return false;
      }
      return true;
    }
    if (r.kind === 'choose_progress_deck') {
      const has = (['science', 'politics', 'trade'] as const).some(
        (d) =>
          (ck.progressDecks[d]?.length ?? 0) > 0 || (ck.progressDiscards?.[d]?.length ?? 0) > 0,
      );
      return has;
    }
    if (r.kind === 'discard_progress') {
      return (ck.progressHands[r.playerId]?.length ?? 0) > PROGRESS_HAND_LIMIT;
    }
    return r.kind === 'pillage_city' || r.kind === 'knight_retreat';
  });
}

/**
 * Si la collecte est terminée côté règles (plus de pending bloquant),
 * avance vers `player_action`. Évite le softlock après Aqueduc / invasion.
 */
export function maybeAcknowledgeCollection(state: GameState): boolean {
  if (state.turnPhase !== 'resource_collect') return false;
  if (hasCkCollectionBlockers(state)) return false;
  acknowledgeCollection(state);
  return true;
}

function handleRobber(state: GameState): void {
  // Les joueurs avec > 7 ressources perdent la moitié
  for (const [, player] of state.players) {
    const total = Object.values(player.resources).reduce((s, v) => s + v, 0);
    if (total > 7) {
      const toDiscard = Math.floor(total / 2);
      let discarded = 0;
      const newResources = { ...player.resources };
      const returned: ResourceBundle = {};

      // BUG FIX: mélanger les clés aléatoirement pour un discard équitable
      const keys = Object.keys(newResources) as (keyof ResourceBundle)[];
      for (let i = keys.length - 1; i > 0; i--) {
        const j = randomInt(0, i);
        [keys[i], keys[j]] = [keys[j], keys[i]];
      }

      for (const res of keys) {
        if (discarded >= toDiscard) break;
        const amount = newResources[res] ?? 0;
        const take = Math.min(amount, toDiscard - discarded);
        newResources[res] = amount - take;
        if (take > 0) returned[res] = (returned[res] ?? 0) + take;
        discarded += take;
      }
      player.resources = newResources;
      if (usesLimitedBank(state)) {
        returnResourcesToBank(state, returned);
      }
    }
  }
  // Le joueur actif déplace le brigand (géré par l'action player)
}

function runEndOfTurn(state: GameState, player: Player): void {
  state.turnPhase = 'end_of_turn';

  // C&K : fin de Flotte marchande
  if (state.extensions?.citiesKnights?.progressBuffs?.merchantFleet?.playerId === player.id) {
    state.extensions.citiesKnights.progressBuffs.merchantFleet = null;
  }

  // Maintenance des unités et bâtiments
  if (state.config.enableMilitary || state.config.enableProductionChains) {
    const maintenance = calculateMaintenanceCost(player, state);
    if (hasResources(player.resources, maintenance)) {
      player.resources = subtractResources(player.resources, maintenance);
    } else if (state.config.enableMilitary) {
      for (const unitId of player.units) {
        const unit = state.units.get(unitId);
        if (unit) unit.stats.currentHealth = Math.max(1, unit.stats.currentHealth - 10);
      }
    }
  }

  // Spoilage des ressources périssables (bread, medicine, herbs perdent 1 unité tous les 4 tours)
  if (state.currentTurn % 4 === 0) {
    const perishables: (keyof ResourceBundle)[] = ['bread', 'medicine', 'herbs'];
    for (const res of perishables) {
      if ((player.resources[res] ?? 0) > 0) {
        player.resources[res] = Math.max(0, (player.resources[res] ?? 0) - 1);
      }
    }
  }

  // Mise à jour et application du cap de ressources dynamique (désactivé en classique)
  if (!isClassicMode(state)) {
    const hasTech = (id: string) => player.researchedTechs.includes(id);
    const cap = defaultResourceCap(hasTech);
    player.resourceCap = cap;
    // Exempter faith, science, culture, influence du cap
    const UNCAPPED: (keyof ResourceBundle)[] = ['faith', 'science', 'culture', 'influence'];
    for (const exempt of UNCAPPED) {
      if (cap[exempt] !== undefined) {
        cap[exempt] = Infinity;
      }
    }
    player.resources = capResources(player.resources, cap);
  }

  // Deals commerciaux
  for (const deal of player.activeTradeDeals) {
    deal.turnsRemaining--;
  }
  player.activeTradeDeals = player.activeTradeDeals.filter((d) => d.turnsRemaining > 0);

  // Calcul VP
  recalculateVP(player, state);

  // Passer au joueur suivant
  advanceTurn(state);
}

// ============================================================
// AVANCEMENT DES TOURS
// ============================================================

function advanceTurn(state: GameState): void {
  // Offre domestique expirée en fin de tour du proposant
  state.pendingPlayerTrade = null;

  // Désactiver joueur actuel
  const currentPlayer = state.players.get(state.turnOrder[state.currentPlayerIndex]);
  if (currentPlayer) currentPlayer.isActive = false;

  state.currentPlayerIndex = (state.currentPlayerIndex + 1) % state.turnOrder.length;

  // Si on revient au premier joueur : nouveau tour global
  if (state.currentPlayerIndex === 0) {
    state.currentTurn++;
    state.year++;

    // Changement de saison tous les 4 tours globaux
    if (isSeasonsEnabled(state)) {
      peBeforeSeasonTransition(state);
      queueSeasonEvents(state, tickSeasonRound(state));
    }

    // Mise à jour marché
    if (state.config.enableProductionChains) {
      state.market = updateMarketPrices(state.market, state.currentTurn);
    }

    // Pactes & Ambassades (remplace le conseil / traités legacy si actif)
    if (isPactsEmbassiesEnabled(state)) {
      tickPactsEmbassiesClock(state);
    } else {
      // Expiration des traités
      if (state.config.enableDiplomacy) {
        checkTreatyExpirations(state);
      }

      // Conseil mondial
      if (state.config.worldCouncil) {
        advanceWorldCouncil(state);
      }

      // Érosion des relations diplomatiques
      if (state.config.enableDiplomacy) {
        decayRelations(state);
      }
    }

    // Nettoyage événements expirés
    if (state.config.enableEvents) {
      cleanupExpiredEvents(state);
      ensurePendingEventChoices(state);
    }

    // Pression barbare (spawn périodique)
    if (state.config.barbarianStrength.enabled) {
      advanceBarbarians(state);
    }

    // Route la plus longue / Armée la plus puissante
    updateLongestRoad(state);
    updateLargestArmy(state);

    // Élimination des joueurs sans territoire
    checkPlayerElimination(state);

    // Vérifier conditions de victoire
    checkVictory(state);
  }

  // Activer nouveau joueur
  const nextPlayer = state.players.get(state.turnOrder[state.currentPlayerIndex]);
  if (nextPlayer) {
    nextPlayer.isActive = true;
    state.turnPhase = 'start_of_turn';
  }

  state.updatedAt = now();
}

// ============================================================
// CONSTRUCTION
// ============================================================

export interface BuildAction {
  playerId: string;
  buildingType: string;
  tileId: string;
}

export function canBuild(action: BuildAction, state: GameState): { can: boolean; reason?: string } {
  const player = state.players.get(action.playerId);
  const tile = state.map.get(action.tileId);

  if (!player) return { can: false, reason: 'Joueur introuvable' };
  if (!tile) return { can: false, reason: 'Tuile introuvable' };

  // Vérifier que c'est le tour du joueur
  const activePlayerId = state.turnOrder[state.currentPlayerIndex];
  if (activePlayerId !== action.playerId) {
    return { can: false, reason: "Ce n'est pas ton tour" };
  }

  // Vérifier ownership
  if (tile.owner && tile.owner !== action.playerId) {
    return { can: false, reason: 'Cette tuile appartient à un autre joueur' };
  }

  // BUG FIX: vérification terrain de base
  if (['ocean', 'glacier'].includes(tile.terrain)) {
    return { can: false, reason: 'Impossible de construire sur ce terrain' };
  }
  if (action.buildingType === 'mine' && !['mountain', 'hill', 'goldmine'].includes(tile.terrain)) {
    return { can: false, reason: "Mine uniquement sur montagne, colline ou mine d'or" };
  }
  if (action.buildingType === 'harbor' && tile.terrain !== 'coast') {
    return { can: false, reason: 'Port uniquement sur tuile côtière' };
  }
  if (
    action.buildingType === 'farm' &&
    !['plains', 'pasture', 'river', 'lake'].includes(tile.terrain)
  ) {
    return {
      can: false,
      reason: 'Ferme uniquement sur terrain fertile (plaines, pâturage, rivière, lac)',
    };
  }

  // Coûts selon le type de construction
  const costs = getBuildingCost(action.buildingType);
  const usesFreeRoad = action.buildingType === 'road' && (player.freeRoadsRemaining ?? 0) > 0;
  if (!usesFreeRoad && !hasResources(player.resources, costs)) {
    return { can: false, reason: 'Ressources insuffisantes' };
  }

  return { can: true };
}

export function consumeFreeRoadIfAvailable(player: Player): boolean {
  if ((player.freeRoadsRemaining ?? 0) <= 0) return false;
  player.freeRoadsRemaining -= 1;
  return true;
}

export function constructClassicBuilding(
  playerId: string,
  tileId: string,
  buildingType: 'settlement' | 'city' | 'road',
  state: GameState,
): { success: boolean; reason?: string } {
  const verdict = canBuild({ playerId, buildingType, tileId }, state);
  if (!verdict.can) return { success: false, reason: verdict.reason };

  const player = state.players.get(playerId);
  const tile = state.map.get(tileId);
  if (!player || !tile) return { success: false, reason: 'Joueur ou tuile introuvable' };

  const cost = getBuildingCost(buildingType);
  const usesFreeRoad = buildingType === 'road' && (player.freeRoadsRemaining ?? 0) > 0;
  if (!usesFreeRoad && !hasResources(player.resources, cost)) {
    return { success: false, reason: 'Ressources insuffisantes' };
  }

  if (usesFreeRoad) {
    consumeFreeRoadIfAvailable(player);
  } else {
    player.resources = subtractResources(player.resources, cost);
    returnResourcesToBank(state, cost);
  }

  if (buildingType === 'settlement') {
    if (!player.settlements.includes(tileId)) player.settlements.push(tileId);
    if (!player.ownedTiles.includes(tileId)) player.ownedTiles.push(tileId);
    tile.owner = playerId;
  } else if (buildingType === 'city') {
    player.settlements = player.settlements.filter((id) => id !== tileId);
    if (!player.cities.includes(tileId)) player.cities.push(tileId);
  } else if (buildingType === 'road') {
    const segment = {
      from: { ...tile.coord },
      to: { ...tile.coord },
      type: 'road' as const,
      level: 1,
    };
    const alreadyBuilt = player.roads.some(
      (road) => road.from.q === tile.coord.q && road.from.r === tile.coord.r,
    );
    if (!alreadyBuilt) player.roads.push(segment);
    tile.road = playerId;
  }

  logAction(state, playerId, 'build', `Construction ${buildingType} sur ${tileId}`, {
    buildingType,
    tileId,
  });
  return { success: true };
}

function getBuildingCost(buildingType: string): ResourceBundle {
  const costs: Record<string, ResourceBundle> = {
    settlement: { wood: 1, clay: 1, wheat: 1, sheep: 1 },
    city: { ore: 3, wheat: 2 },
    metropolis: { ore: 5, wheat: 3, stone: 2 },
    road: { wood: 1, clay: 1 },
    bridge: { wood: 2, stone: 2, iron: 1 },
    wall: { stone: 3, clay: 2 },
    fortress: { stone: 5, iron: 3, wood: 2 },
    farm: { wood: 1, clay: 1 },
    mine: { wood: 2, stone: 1 },
    sawmill: { wood: 2, stone: 1 },
    forge: { stone: 2, coal: 1, ore: 1 },
    market: { wood: 2, clay: 1 },
    library: { wood: 3, wheat: 1 },
    university: { wood: 3, stone: 2, books: 1 },
    barracks: { wood: 2, stone: 1, iron: 1 },
    harbor: { wood: 3, stone: 1 },
    temple: { stone: 3, gold: 1 },
    cathedral: { stone: 5, gold: 2, gems: 1 },
    wonder_pyramid: { stone: 15, gold: 5, ore: 5, tools: 3 },
    wonder_colossus: { ore: 12, stone: 8, gold: 6 },
  };
  return costs[buildingType] ?? {};
}

// ============================================================
// SCORE & VICTOIRE
// ============================================================

// ============================================================
// ROUTE LA PLUS LONGUE (DFS)
// ============================================================

/**
 * Longueur de route continue en mode classique (arêtes topologiques).
 * Une intersection adverse bloque le passage (on compte l'arête qui y mène, sans continuer).
 */
function computeClassicLongestRoad(playerId: string, state: GameState): number {
  const board = state.classicBoard;
  if (!board) return 0;

  const ownedEdges: string[] = [];
  for (const [edgeId, owner] of Object.entries(board.roadsByEdge)) {
    if (owner === playerId) ownedEdges.push(edgeId);
  }
  if (ownedEdges.length === 0) return 0;

  const adj = new Map<string, Array<{ to: string; edgeId: string }>>();
  const add = (from: string, to: string, edgeId: string): void => {
    if (!adj.has(from)) adj.set(from, []);
    adj.get(from)!.push({ to, edgeId });
  };

  for (const edgeId of ownedEdges) {
    const edge = board.topology.edges[edgeId];
    if (!edge) continue;
    add(edge.a, edge.b, edgeId);
    add(edge.b, edge.a, edgeId);
  }

  const isBlocked = (intersectionId: string): boolean => {
    const owner = board.occupiedIntersections[intersectionId];
    if (owner && owner !== playerId) return true;
    // Chevalier C&K adverse interrompt la Route la plus longue
    const knight = state.extensions?.citiesKnights?.knights.find(
      (k) => k.intersectionId === intersectionId && k.ownerId !== playerId,
    );
    return Boolean(knight);
  };

  let maxLength = 0;
  const visited = new Set<string>();

  function dfs(current: string, length: number): void {
    maxLength = Math.max(maxLength, length);
    if (isBlocked(current) && length > 0) return;

    for (const { to, edgeId } of adj.get(current) ?? []) {
      if (visited.has(edgeId)) continue;
      visited.add(edgeId);
      dfs(to, length + 1);
      visited.delete(edgeId);
    }
  }

  for (const start of adj.keys()) {
    dfs(start, 0);
  }

  return maxLength;
}

/**
 * Calcule la longueur maximale de route continue pour un joueur via DFS.
 * Classique : topologie arêtes ; sinon segments hex entre tuiles.
 */
function computeLongestRoad(player: Player, state: GameState): number {
  if (usesTopologicalPlacement(state)) {
    return computeClassicLongestRoad(player.id, state);
  }

  const segments = player.roads;
  if (segments.length === 0) return 0;

  const edgeMap = new Map<string, Array<{ to: string; edgeIdx: number }>>();

  const addEdge = (fromId: string, toId: string, idx: number): void => {
    if (!edgeMap.has(fromId)) edgeMap.set(fromId, []);
    edgeMap.get(fromId)!.push({ to: toId, edgeIdx: idx });
  };

  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i];
    const fromId = hexToId(seg.from);
    const toId = hexToId(seg.to);
    addEdge(fromId, toId, i);
    addEdge(toId, fromId, i);
  }

  let maxLength = 0;
  const visitedEdges = new Set<number>();

  function dfs(current: string, length: number): void {
    maxLength = Math.max(maxLength, length);
    for (const { to, edgeIdx } of edgeMap.get(current) ?? []) {
      if (!visitedEdges.has(edgeIdx)) {
        visitedEdges.add(edgeIdx);
        dfs(to, length + 1);
        visitedEdges.delete(edgeIdx);
      }
    }
  }

  for (const startId of edgeMap.keys()) {
    dfs(startId, 0);
  }

  return maxLength;
}

/**
 * Met à jour longestRoadOwner (seuil 5).
 * En cas d'égalité au maximum, le détenteur actuel conserve le trophée s'il est toujours à égalité ;
 * sinon le trophée revient en banque (owner null) jusqu'à un leader unique.
 */
export function updateLongestRoad(state: GameState): void {
  const MIN_ROAD = 5;
  const lengths = new Map<string, number>();
  let maxLen = 0;

  for (const [playerId, player] of state.players) {
    if (player.isEliminated) continue;
    const length = computeLongestRoad(player, state);
    lengths.set(playerId, length);
    if (length > maxLen) maxLen = length;
  }

  if (maxLen < MIN_ROAD) {
    state.longestRoadLength = 0;
    state.longestRoadOwner = null;
    return;
  }

  const leaders = [...lengths.entries()]
    .filter(([, length]) => length === maxLen)
    .map(([id]) => id);

  let owner: string | null = null;
  if (leaders.length === 1) {
    owner = leaders[0]!;
  } else if (state.longestRoadOwner && leaders.includes(state.longestRoadOwner)) {
    owner = state.longestRoadOwner;
  } else {
    owner = null;
  }

  state.longestRoadLength = owner ? maxLen : 0;
  state.longestRoadOwner = owner;
}

/**
 * Met à jour largestArmyOwner (seuil 3 chevaliers). Même logique d'égalité que la route.
 */
export function updateLargestArmy(state: GameState): void {
  // Villes & Chevaliers : Plus grande armée désactivée
  if (isCitiesKnightsEnabled(state)) {
    state.largestArmySize = 0;
    state.largestArmyOwner = null;
    return;
  }
  const MIN_ARMY = 3;
  const sizes = new Map<string, number>();
  let maxSize = 0;

  for (const [playerId, player] of state.players) {
    if (player.isEliminated) continue;
    const armySize = player.militaryCards.length;
    sizes.set(playerId, armySize);
    if (armySize > maxSize) maxSize = armySize;
  }

  if (maxSize < MIN_ARMY) {
    state.largestArmySize = 0;
    state.largestArmyOwner = null;
    return;
  }

  const leaders = [...sizes.entries()].filter(([, size]) => size === maxSize).map(([id]) => id);

  let owner: string | null = null;
  if (leaders.length === 1) {
    owner = leaders[0]!;
  } else if (state.largestArmyOwner && leaders.includes(state.largestArmyOwner)) {
    owner = state.largestArmyOwner;
  } else {
    owner = null;
  }

  state.largestArmySize = owner ? maxSize : 0;
  state.largestArmyOwner = owner;
}

/** Recalcule trophées puis VP / victoire (à appeler après build, chevalier, etc.). */
export function refreshTrophiesAndVictory(state: GameState): void {
  updateLongestRoad(state);
  updateLargestArmy(state);
  for (const [, player] of state.players) {
    if (!player.isEliminated) recalculateVP(player, state);
  }
  checkVictory(state);
}

/**
 * Vérifie et élimine les joueurs sans unités, villages ni villes.
 */
export function checkPlayerElimination(state: GameState): void {
  for (const [, player] of state.players) {
    if (player.isEliminated) continue;
    const hasBuildings =
      player.settlements.length + player.cities.length + player.metropolis.length > 0;
    const hasUnits = player.units.length > 0;
    if (!hasBuildings && !hasUnits) {
      player.isEliminated = true;
      logAction(state, player.id, 'system', `${player.name} a été éliminé`, {});
    }
  }
}

export function recalculateVP(player: Player, state: GameState): void {
  const vp = player.stats.vpBreakdown;

  if (usesTopologicalPlacement(state) && state.classicBoard) {
    let settlementCount = 0;
    let cityCount = 0;
    for (const [intersectionId, owner] of Object.entries(
      state.classicBoard.occupiedIntersections,
    )) {
      if (owner !== player.id) continue;
      const buildingId = state.classicBoard.buildingByIntersection[intersectionId];
      const building = buildingId ? state.buildings.get(buildingId) : undefined;
      if (building?.definitionId === 'city') cityCount += 1;
      else settlementCount += 1;
    }
    vp.settlements = settlementCount;
    vp.cities = cityCount * 2;
    vp.metropolis = 0;
  } else {
    vp.settlements = player.settlements.length;
    vp.cities = player.cities.length * 2;
    vp.metropolis = player.metropolis.length * 3;
  }

  vp.longestRoad = state.longestRoadOwner === player.id ? 2 : 0;
  vp.largestArmy = isCitiesKnightsEnabled(state) ? 0 : state.largestArmyOwner === player.id ? 2 : 0;
  vp.wonders = player.wonders.length * 5;
  if (usesLimitedBank(state) && !isCitiesKnightsEnabled(state)) {
    // PV secrets : comptent dès qu'ils sont en main (non révélés aux adversaires)
    vp.techCards = player.devCards.filter((card) => card.type === 'victory_point').length;
  } else if (isCitiesKnightsEnabled(state)) {
    vp.techCards = 0;
  }
  vp.objectives = player.objectives
    .filter((o) => o.completed)
    .reduce((sum, o) => sum + o.reward.victoryPoints, 0);

  const defenderBonus = state.extensions?.citiesKnights?.defenderVp[player.id] ?? 0;
  vp.defenderOfCatan = defenderBonus;

  // Métropoles C&K : +2 PV chacune
  let ckMetropolisVp = 0;
  let merchantVp = 0;
  if (isCitiesKnightsEnabled(state) && state.extensions?.citiesKnights) {
    for (const slot of Object.values(state.extensions.citiesKnights.metropolises)) {
      if (slot.ownerId === player.id) ckMetropolisVp += 2;
    }
    if (state.extensions.citiesKnights.merchant.ownerId === player.id) {
      merchantVp = 1;
    }
  }
  vp.metropolis += ckMetropolisVp;

  const usVp = isUndergroundSkyEnabled(state)
    ? undergroundSkyVictoryPoints(state, player.id)
    : 0;
  vp.undergroundSky = usVp;

  const peVp = isPactsEmbassiesEnabled(state)
    ? peVictoryPoints(state, player.id)
    : 0;
  vp.pactsEmbassies = peVp;

  player.stats.victoryPoints =
    vp.settlements +
    vp.cities +
    vp.metropolis +
    vp.longestRoad +
    vp.largestArmy +
    vp.techCards +
    vp.wonders +
    vp.objectives +
    vp.culture +
    vp.faith +
    vp.defenderOfCatan +
    merchantVp +
    usVp +
    peVp;
}

export function checkVictory(state: GameState): boolean {
  if (state.phase === 'finished') return true;

  const target = state.config.victoryPointTarget;
  const activePlayers = [...state.players.values()].filter((p) => !p.isEliminated);

  for (const player of activePlayers) {
    recalculateVP(player, state);

    for (const condition of state.config.victoryConditions) {
      if (isVictoryAchieved(condition, player, state, target)) {
        state.winner = player.id;
        state.victoryType = condition;
        state.phase = 'finished';

        // Classement final
        state.rankings = [...state.players.values()]
          .sort((a, b) => b.stats.victoryPoints - a.stats.victoryPoints)
          .map((p, i) => ({
            playerId: p.id,
            rank: i + 1,
            victoryPoints: p.stats.victoryPoints,
          }));

        logAction(state, player.id, 'system', `${player.name} a gagné ! (${condition})`, {});
        return true;
      }
    }
  }

  // Tour maximum atteint
  if (state.config.maxTurns > 0 && state.currentTurn >= state.config.maxTurns) {
    const winner = activePlayers.sort((a, b) => b.stats.victoryPoints - a.stats.victoryPoints)[0];
    state.winner = winner?.id ?? null;
    state.phase = 'finished';
    return true;
  }

  return false;
}

function isVictoryAchieved(
  condition: GameState['config']['victoryConditions'][number],
  player: Player,
  state: GameState,
  target: number,
): boolean {
  switch (condition) {
    case 'points':
      return player.stats.victoryPoints >= target;

    case 'domination': {
      // Contre : les autres joueurs peuvent reprendre des tuiles.
      const landTiles = [...state.map.values()].filter((tile) => tile.terrain !== 'ocean');
      if (landTiles.length === 0) return false;
      const owned = landTiles.filter((tile) => tile.owner === player.id).length;
      const share = owned / landTiles.length;
      const rivalMax = Math.max(
        0,
        ...[...state.players.values()]
          .filter((p) => p.id !== player.id && !p.isEliminated)
          .map((p) => landTiles.filter((tile) => tile.owner === p.id).length),
      );
      return share >= 0.4 && owned > rivalMax;
    }

    case 'science': {
      // Contre : nécessite recherche continue ; merveille réduit le seuil.
      const techNeed = Math.max(6, Math.floor(target / 2));
      const wonderBonus = player.wonders.length > 0 ? 2 : 0;
      const techs = player.researchedTechs.length + wonderBonus;
      const notPrimitive = player.age !== 'stone_age';
      return notPrimitive && techs >= techNeed;
    }

    case 'culture': {
      const need = target * 8;
      const culture = player.resources.culture ?? 0;
      const leads =
        culture >
        Math.max(
          0,
          ...[...state.players.values()]
            .filter((p) => p.id !== player.id && !p.isEliminated)
            .map((p) => p.resources.culture ?? 0),
        );
      return culture >= need && leads;
    }

    case 'religious': {
      const need = target * 8;
      const faith = player.resources.faith ?? 0;
      const leads =
        faith >
        Math.max(
          0,
          ...[...state.players.values()]
            .filter((p) => p.id !== player.id && !p.isEliminated)
            .map((p) => p.resources.faith ?? 0),
        );
      return faith >= need && leads;
    }

    case 'economic': {
      const need = target * 4;
      const wealth =
        (player.resources.coins ?? 0) +
        (player.resources.gold ?? 0) * 2 +
        (player.resources.gems ?? 0);
      const rivalWealth = Math.max(
        0,
        ...[...state.players.values()]
          .filter((p) => p.id !== player.id && !p.isEliminated)
          .map(
            (p) => (p.resources.coins ?? 0) + (p.resources.gold ?? 0) * 2 + (p.resources.gems ?? 0),
          ),
      );
      return wealth >= need && wealth > rivalWealth;
    }

    case 'diplomatic': {
      // Contre : alliances fragiles, guerres bloquent, influence disputée.
      if (!state.config.enableDiplomacy) return false;
      const rivals = [...state.players.values()].filter(
        (p) => p.id !== player.id && !p.isEliminated,
      );
      const alliesNeeded = Math.min(2, Math.max(1, rivals.length));
      const allies = rivals.filter(
        (rival) => player.relations[rival.id]?.status === 'allied',
      ).length;
      const atWar = rivals.some((rival) => player.relations[rival.id]?.status === 'war');
      const influence = player.resources.influence ?? 0;
      const need = target * 4;
      const elected = state.worldCouncil.diplomaticLeaderId === player.id;
      const leadsInfluence =
        influence > Math.max(0, ...rivals.map((p) => p.resources.influence ?? 0));
      return !atWar && allies >= alliesNeeded && influence >= need && (elected || leadsInfluence);
    }

    case 'elimination': {
      const activePlayers = [...state.players.values()].filter((p) => !p.isEliminated);
      return activePlayers.length === 1 && activePlayers[0].id === player.id;
    }

    default:
      return false;
  }
}

// ============================================================
// VISION (Fog of War)
// ============================================================

export function updatePlayerVision(
  player: Player,
  map: Map<string, HexTile>,
  units?: Map<string, UnitInstance>,
): void {
  // Retirer la vision actuelle
  for (const [, tile] of map) {
    tile.visible.delete(player.id);
  }

  // Recalculer depuis chaque village/ville/métropole
  const visionSources: Array<{ tileId: string; range: number }> = [
    ...player.settlements.map((id) => ({ tileId: id, range: 2 })),
    ...player.cities.map((id) => ({ tileId: id, range: 3 })),
    ...player.metropolis.map((id) => ({ tileId: id, range: 4 })),
  ];

  // BUG FIX: inclure les unités comme sources de vision
  if (units) {
    for (const unitId of player.units) {
      const unit = units.get(unitId);
      if (!unit) continue;
      visionSources.push({ tileId: hexToId(unit.position), range: unit.stats.sight });
    }
  }

  for (const { tileId, range } of visionSources) {
    const tile = map.get(tileId);
    if (!tile) continue;

    const visible = fieldOfView(tile.coord, range, (id) => {
      const t = map.get(id);
      return t !== undefined && ['mountain', 'hill', 'glacier'].includes(t.terrain);
    });

    for (const visibleId of visible) {
      const visibleTile = map.get(visibleId);
      if (visibleTile) {
        visibleTile.visible.add(player.id);
        visibleTile.explored.add(player.id);
      }
    }
  }
}

// ============================================================
// HELPERS
// ============================================================

// ============================================================
// PHASE DE SETUP — Placement serpent
// ============================================================

/**
 * Valide un placement setup sans muter l'état.
 */
export function validateSetupPlacement(
  playerId: string,
  tileId: string,
  state: GameState,
): { valid: boolean; reason?: string } {
  if (state.phase !== 'setup') return { valid: false, reason: 'Pas en phase de setup' };

  const expectedPlayer = state.setupPlayerOrder[state.setupPlacementIndex];
  if (expectedPlayer !== playerId) {
    return { valid: false, reason: `Ce n'est pas le tour de ${playerId} de placer` };
  }

  const tile = state.map.get(tileId);
  if (!tile) return { valid: false, reason: 'Tuile introuvable' };
  if (tile.owner) return { valid: false, reason: 'Tuile déjà occupée' };
  if (['ocean', 'glacier', 'coast', 'desert'].includes(tile.terrain)) {
    return { valid: false, reason: 'Terrain non constructible' };
  }

  for (const neighbor of hexAllNeighbors(tile.coord)) {
    const neighborTile = state.map.get(hexToId(neighbor));
    if (neighborTile?.owner) {
      return { valid: false, reason: "Trop proche d'un autre village" };
    }
  }

  return { valid: true };
}

/**
 * Valide et effectue un placement de village pendant la phase setup.
 * Le placement suit l'ordre serpent : 1,2,3,4,4,3,2,1.
 * Le 2e placement de chaque joueur lui donne les ressources des tuiles adjacentes.
 */
export function handleSetupPlacement(
  playerId: string,
  tileId: string,
  state: GameState,
): { success: boolean; reason?: string } {
  const validation = validateSetupPlacement(playerId, tileId, state);
  if (!validation.valid) return { success: false, reason: validation.reason };

  const tile = state.map.get(tileId)!;
  const player = state.players.get(playerId)!;
  tile.owner = playerId;
  tile.explored.add(playerId);
  tile.visible.add(playerId);
  player.settlements.push(tileId);
  player.ownedTiles.push(tileId);

  const productionTileIds = classicLandProductionTiles(state, [tileId]);
  const building: BuildingInstance = {
    id: genId('building'),
    definitionId: 'settlement',
    tileId,
    ownerId: playerId,
    placementKind: 'tile',
    productionTileIds,
    constructedTurn: state.currentTurn,
    level: 1,
    health: 100,
    workers: [],
    isActive: true,
    productionProgress: 0,
  };
  state.buildings.set(building.id, building);
  tile.buildings.push(building.id);

  // Déterminer si c'est le 1er ou 2e placement (round aller ou retour)
  const playerPlacements = player.settlements.length;
  const isSecondPlacement = playerPlacements === 2;

  // 2e placement : tuile + voisins (via banque si économie limitée)
  if (isSecondPlacement) {
    const classicBonus: ResourceBundle = {};
    const otherBonus: ResourceBundle = {};
    const bonusTiles: HexTile[] = [tile];
    for (const neighbor of hexAllNeighbors(tile.coord)) {
      const neighborTile = state.map.get(hexToId(neighbor));
      if (neighborTile) bonusTiles.push(neighborTile);
    }
    for (const bonusTile of bonusTiles) {
      if (!bonusTile.baseProduction) continue;
      for (const [res, amount] of Object.entries(bonusTile.baseProduction) as [
        keyof ResourceBundle,
        number,
      ][]) {
        if (amount <= 0) continue;
        if ((CLASSIC_RESOURCE_TYPES as readonly string[]).includes(String(res))) {
          classicBonus[res] = (classicBonus[res] ?? 0) + amount;
        } else {
          otherBonus[res] = (otherBonus[res] ?? 0) + amount;
        }
      }
    }
    const granted = usesLimitedBank(state)
      ? takeResourcesFromBank(state, classicBonus)
      : classicBonus;
    player.resources = addResources(player.resources, granted);
    player.resources = addResources(player.resources, otherBonus);
  }

  grantPortsAdjacentToTile(state, playerId, tileId);
  recalculateVP(player, state);

  updatePlayerVision(player, state.map);

  logAction(
    state,
    playerId,
    'build',
    `Village placé sur ${tileId}${isSecondPlacement ? ' (ressources initiales reçues)' : ''}`,
    { tileId },
  );

  // Avancer le curseur de placement
  state.setupPlacementIndex++;

  // Fin du placement serpent ?
  if (state.setupPlacementIndex >= state.setupPlayerOrder.length) {
    state.phase = 'playing';
    state.currentPlayerIndex = 0;
    for (const [, p] of state.players) p.isActive = false;
    const firstPlayer = state.players.get(state.turnOrder[0]);
    if (firstPlayer) firstPlayer.isActive = true;
    beginPlayerTurn(state);
    logAction(state, playerId, 'system', 'Phase de setup terminée — la partie commence !', {});
  }

  return { success: true };
}

// ============================================================
// CARTES DE DÉVELOPPEMENT
// ============================================================

import { DevelopmentCard, DevelopmentCardType } from '../../types/player';

const DEV_CARD_POOL: DevelopmentCardType[] = [
  'knight',
  'knight',
  'knight',
  'knight',
  'knight',
  'knight',
  'knight',
  'knight',
  'knight',
  'knight',
  'knight',
  'knight',
  'knight',
  'knight',
  'victory_point',
  'victory_point',
  'victory_point',
  'victory_point',
  'victory_point',
  'road_building',
  'road_building',
  'year_of_plenty',
  'year_of_plenty',
  'monopoly',
  'monopoly',
  'spy',
  'sabotage',
  'oracle',
  'inspiration',
  'reinforcements',
  'discovery',
  'golden_age',
];

export function drawDevCard(
  playerId: string,
  state: GameState,
): { success: boolean; card?: DevelopmentCard; reason?: string } {
  if (isCitiesKnightsEnabled(state)) {
    return {
      success: false,
      reason: 'Les cartes Développement sont remplacées par les cartes Progrès',
    };
  }
  const player = state.players.get(playerId);
  if (!player) return { success: false, reason: 'Joueur introuvable' };

  const cost = { ore: 1, wheat: 1, sheep: 1 };
  if (!hasResources(player.resources, cost)) {
    return { success: false, reason: 'Ressources insuffisantes (1 ore, 1 blé, 1 laine)' };
  }

  let type: DevelopmentCardType;
  if (isClassicMode(state)) {
    if (!state.devDeck || state.devDeck.length === 0) {
      return { success: false, reason: 'Le deck de développement est épuisé' };
    }
    type = state.devDeck.shift()!;
  } else {
    const idx = randomInt(0, DEV_CARD_POOL.length - 1);
    type = DEV_CARD_POOL[idx];
  }

  player.resources = subtractResources(player.resources, cost);
  returnResourcesToBank(state, cost);

  const card: DevelopmentCard = {
    id: genId('card'),
    type,
    acquiredTurn: state.currentTurn,
    played: false,
  };

  player.devCards.push(card);
  logAction(state, playerId, 'use_card', `Carte de développement achetée`, {
    cardType: isClassicMode(state) ? 'hidden' : type,
  });
  return { success: true, card };
}

export function playDevCard(
  playerId: string,
  cardId: string,
  targetPlayerId: string | null,
  targetTileId: string | null,
  state: GameState,
): { success: boolean; reason?: string } {
  if (isCitiesKnightsEnabled(state)) {
    return {
      success: false,
      reason: 'Les cartes Développement sont remplacées par les cartes Progrès',
    };
  }
  const player = state.players.get(playerId);
  if (!player) return { success: false, reason: 'Joueur introuvable' };

  const card = player.devCards.find((c) => c.id === cardId);
  if (!card) return { success: false, reason: 'Carte introuvable' };
  if (card.played) return { success: false, reason: 'Carte déjà jouée' };
  if (card.acquiredTurn === state.currentTurn) {
    return {
      success: false,
      reason: 'Une carte ne peut pas être jouée le tour où elle a été achetée',
    };
  }
  if (player.devCardsPlayedThisTurn > 0 && card.type !== 'victory_point') {
    return { success: false, reason: 'Une seule carte de développement par tour (sauf VP)' };
  }

  card.played = true;
  if (card.type !== 'victory_point') player.devCardsPlayedThisTurn++;

  switch (card.type) {
    case 'knight': {
      if (targetTileId) syncRobberToTile(state, targetTileId);
      // Vole une ressource au joueur ciblé
      if (targetPlayerId) {
        const target = state.players.get(targetPlayerId);
        if (target) {
          const resKeys = (Object.keys(target.resources) as (keyof ResourceBundle)[]).filter(
            (r) => {
              if ((target.resources[r] ?? 0) <= 0) return false;
              if (!isClassicMode(state)) return true;
              return (CLASSIC_RESOURCE_TYPES as readonly string[]).includes(String(r));
            },
          );
          if (resKeys.length > 0) {
            const stolen = randomChoice(resKeys);
            if (!stolen) break;
            target.resources[stolen] = (target.resources[stolen] ?? 0) - 1;
            player.resources[stolen] = (player.resources[stolen] ?? 0) + 1;
          }
        }
      }
      player.militaryCards.push(cardId);
      break;
    }

    case 'road_building': {
      player.freeRoadsRemaining = (player.freeRoadsRemaining ?? 0) + 2;
      break;
    }

    case 'year_of_plenty': {
      // Donne 2 ressources au choix. Convention : targetTileId = "resource1:resource2"
      if (!targetTileId || !targetTileId.includes(':')) {
        card.played = false;
        player.devCardsPlayedThisTurn = Math.max(0, player.devCardsPlayedThisTurn - 1);
        return {
          success: false,
          reason: "Année d'abondance : choisissez 2 ressources",
        };
      }
      const [r1, r2] = targetTileId.split(':');
      const want: ResourceBundle = {};
      if (r1) want[r1 as keyof ResourceBundle] = (want[r1 as keyof ResourceBundle] ?? 0) + 1;
      if (r2) want[r2 as keyof ResourceBundle] = (want[r2 as keyof ResourceBundle] ?? 0) + 1;
      if (usesLimitedBank(state)) {
        for (const key of Object.keys(want) as (keyof ResourceBundle)[]) {
          if (!(CLASSIC_RESOURCE_TYPES as readonly string[]).includes(String(key))) {
            card.played = false;
            player.devCardsPlayedThisTurn = Math.max(0, player.devCardsPlayedThisTurn - 1);
            return { success: false, reason: "Année d'abondance : ressource non classique" };
          }
        }
        const granted = takeResourcesFromBank(state, want);
        const wantedTotal = Object.values(want).reduce((s, v) => s + (v ?? 0), 0);
        const grantedTotal = Object.values(granted).reduce((s, v) => s + (v ?? 0), 0);
        if (grantedTotal < wantedTotal) {
          returnResourcesToBank(state, granted);
          card.played = false;
          player.devCardsPlayedThisTurn = Math.max(0, player.devCardsPlayedThisTurn - 1);
          return { success: false, reason: "La banque n'a plus assez de ressources" };
        }
        player.resources = addResources(player.resources, granted);
      } else {
        player.resources = addResources(player.resources, want);
      }
      break;
    }

    case 'monopoly': {
      if (!targetTileId) {
        card.played = false;
        player.devCardsPlayedThisTurn = Math.max(0, player.devCardsPlayedThisTurn - 1);
        return { success: false, reason: 'Monopole : choisissez une ressource' };
      }
      if (
        usesLimitedBank(state) &&
        !(CLASSIC_RESOURCE_TYPES as readonly string[]).includes(targetTileId)
      ) {
        card.played = false;
        player.devCardsPlayedThisTurn = Math.max(0, player.devCardsPlayedThisTurn - 1);
        return { success: false, reason: 'Monopole : ressource non classique' };
      }
      const res = targetTileId as keyof ResourceBundle;
      for (const [, other] of state.players) {
        if (other.id === playerId || other.isEliminated) continue;
        const amount = other.resources[res] ?? 0;
        if (amount > 0) {
          other.resources[res] = 0;
          player.resources[res] = (player.resources[res] ?? 0) + amount;
        }
      }
      break;
    }

    case 'victory_point':
      // Classique : les PV secrets comptent via recalculateVP (pas besoin de « jouer »)
      if (!isClassicMode(state)) {
        player.stats.vpBreakdown.techCards++;
      }
      break;

    case 'spy': {
      // Voir la main d'un adversaire — le résultat est retourné au frontend
      // La connaissance est loggée mais pas de modification d'état
      if (targetPlayerId) {
        const target = state.players.get(targetPlayerId);
        logAction(
          state,
          playerId,
          'use_card',
          `Espion : consulte la main de ${target?.name ?? targetPlayerId}`,
          {
            targetId: targetPlayerId,
            resources: target?.resources ?? {},
          },
        );
      }
      break;
    }

    case 'sabotage': {
      // Détruit une route ennemie
      if (targetPlayerId) {
        const target = state.players.get(targetPlayerId);
        if (target && target.roads.length > 0) {
          const roadIndex = randomInt(0, target.roads.length - 1);
          target.roads.splice(roadIndex, 1);
        }
      }
      break;
    }

    case 'oracle':
      // Prédit le prochain dé — stocké dans l'état pour le frontend
      logAction(state, playerId, 'use_card', 'Oracle : prédit le prochain lancer', {});
      break;

    case 'inspiration':
      // Avance la recherche actuelle de 20 science
      player.researchProgress += 20;
      break;

    case 'reinforcements': {
      // Ajoute 2 guerriers au joueur (à sa capitale/premier village)
      const spawnTile = player.metropolis[0] ?? player.cities[0] ?? player.settlements[0];
      if (spawnTile) {
        const tileObj = state.map.get(spawnTile);
        if (tileObj) {
          for (let i = 0; i < 2; i++) {
            const unitId = genId('unit');
            state.units.set(unitId, {
              id: unitId,
              name: 'Guerrier (renforts)',
              type: 'warrior',
              ownerId: playerId,
              position: tileObj.coord,
              status: 'idle',
              level: 1,
              experience: 0,
              promotions: [],
              hasMoved: false,
              hasAttacked: false,
              facing: 0,
              isEmbark: false,
              stats: {
                attack: 10,
                defense: 10,
                health: 100,
                currentHealth: 100,
                movement: 2,
                range: 1,
                sight: 2,
                rangedAttack: 0,
                armor: 0,
              },
            });
            player.units.push(unitId);
          }
        }
      }
      break;
    }

    case 'discovery': {
      // Révèle une zone autour d'une tuile cible
      if (targetTileId) {
        const targetTile = state.map.get(targetTileId);
        if (targetTile) {
          for (const neighbor of hexAllNeighbors(targetTile.coord)) {
            const neighborTile = state.map.get(hexToId(neighbor));
            if (neighborTile) {
              neighborTile.explored.add(playerId);
              neighborTile.visible.add(playerId);
            }
          }
        }
      }
      break;
    }

    case 'golden_age':
      // Double la production ce tour — le frontend applique le modificateur
      logAction(state, playerId, 'use_card', 'Âge doré : production doublée ce tour', {});
      break;

    default:
      return { success: false, reason: `Type de carte inconnu : ${card.type}` };
  }

  logAction(state, playerId, 'use_card', `Carte jouée : ${card.type}`, {
    cardId,
    cardType: card.type,
  });

  if (card.type === 'knight' || card.type === 'victory_point' || card.type === 'sabotage') {
    refreshTrophiesAndVictory(state);
  } else if (isClassicMode(state)) {
    // VP déjà à jour pour les builds ; ici on vérifie au cas où un effet change l'armée/route.
    checkVictory(state);
  }

  return { success: true };
}

// ============================================================
// SÉRIALISATION POUR SAVE / LOAD
// ============================================================

/**
 * Convertit le GameState (Map, Set) en JSON sérialisable.
 */
export function serializeGameState(state: GameState): string {
  const serializable = {
    ...state,
    map: [...state.map.entries()].map(([k, tile]) => [
      k,
      {
        ...tile,
        explored: [...tile.explored],
        visible: [...tile.visible],
      },
    ]),
    players: [...state.players.entries()].map(([k, p]) => [k, p]),
    units: [...state.units.entries()].map(([k, u]) => [k, u]),
    buildings: [...state.buildings.entries()].map(([k, b]) => [k, b]),
    barbarians: [...state.barbarians.entries()].map(([k, b]) => [k, b]),
  };
  return JSON.stringify(serializable);
}

/**
 * Reconstruit un GameState depuis le JSON sérialisé.
 */
export function deserializeGameState(json: string): GameState {
  const raw = JSON.parse(json);

  const map = new Map<string, HexTile>(
    (raw.map as [string, unknown][]).map(([k, rawTile]: [string, unknown]) => {
      const t = rawTile as Record<string, unknown>;
      return [
        k,
        {
          ...t,
          explored: new Set(t.explored as string[]),
          visible: new Set(t.visible as string[]),
        } as HexTile,
      ];
    }),
  );

  const state = {
    ...raw,
    map,
    players: new Map(raw.players as [string, Player][]),
    units: new Map(raw.units as [string, unknown][]),
    buildings: new Map(raw.buildings as [string, unknown][]),
    barbarians: new Map(raw.barbarians as [string, unknown][]),
  } as GameState;

  if (usesTopologicalPlacement(state)) {
    ensureClassicRuntimeState(state);
  } else if (usesLimitedBank(state)) {
    ensureLimitedBank(state);
  }
  return state;
}

function findDesert(map: Map<string, HexTile>): string | null {
  for (const [id, tile] of map) {
    if (tile.terrain === 'desert') return id;
  }
  return null;
}

function logAction(
  state: GameState,
  playerId: string,
  type: ActionType,
  description: string,
  data: Record<string, unknown>,
): void {
  state.actionLog.push({
    id: genId('log'),
    turn: state.currentTurn,
    playerId,
    type,
    description,
    data,
    timestamp: now(),
  });
}

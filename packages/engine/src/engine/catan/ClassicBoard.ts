import { buildCatanTopology, type CatanTopology, isClassicLandTerrain } from './CatanTopology';
import { hexAllNeighbors, hexRing, hexToId } from '../hex/HexMath';
import type { GameState } from '../../types/game';
import type { HexTile, PortType, TerrainType } from '../../types/hex';
import { normalizePortType } from '../../types/hex';
import type { DevelopmentCardType, Player } from '../../types/player';
import type { ResourceBundle, ResourceType } from '../../types/resources';
import { getActiveRandom } from '../../core/rng';
import { isCitiesKnightsEnabled } from '../../core/extensions';

/** Les cinq ressources du jeu de base CATAN. */
export const CLASSIC_RESOURCE_TYPES = [
  'wood',
  'clay',
  'wheat',
  'sheep',
  'ore',
] as const satisfies readonly ResourceType[];

export type ClassicResourceType = (typeof CLASSIC_RESOURCE_TYPES)[number];

/** Stock bancaire officiel : 19 cartes par ressource. */
export const CLASSIC_BANK_STOCK: Record<ClassicResourceType, number> = {
  wood: 19,
  clay: 19,
  wheat: 19,
  sheep: 19,
  ore: 19,
};

/** Inventaire de pièces par joueur (règles de base). */
export const CLASSIC_PIECE_LIMITS = {
  settlements: 5,
  cities: 4,
  roads: 15,
} as const;

/**
 * Deck Développement officiel (25 cartes, sans remise).
 * 14 Chevaliers, 5 VP, 2 Construction de routes, 2 Année d'abondance, 2 Monopole.
 */
export const CLASSIC_DEV_DECK: readonly DevelopmentCardType[] = [
  ...Array.from({ length: 14 }, () => 'knight' as const),
  ...Array.from({ length: 5 }, () => 'victory_point' as const),
  'road_building',
  'road_building',
  'year_of_plenty',
  'year_of_plenty',
  'monopoly',
  'monopoly',
];

export interface ClassicPieceStock {
  settlements: number;
  cities: number;
  roads: number;
}

/**
 * État topologique autoritaire du mode classique.
 * Les constructions vivent sur intersections / arêtes, pas sur les centres de tuiles.
 */
export interface ClassicBoardState {
  topology: CatanTopology;
  /** intersectionId → playerId */
  occupiedIntersections: Record<string, string>;
  /** edgeId → playerId */
  roadsByEdge: Record<string, string>;
  /** intersectionId → buildingId */
  buildingByIntersection: Record<string, string>;
  /** Pièces restantes par joueur */
  piecesRemaining: Record<string, ClassicPieceStock>;
  /** Phase setup serpent : village puis route. */
  setupStep: 'settlement' | 'road';
  /** Dernier village posé (pour la route initiale adjacente). */
  setupLastIntersectionId: string | null;
  /** Répartition des ancres de tuiles (évite de surcharger un hex). */
  anchorUsageByTile: Record<string, number>;
  /** Ports CATAN : intersection côtière → type de port (2 sommets par havre). */
  portByIntersection: Record<string, PortType>;
}

export function isClassicMode(state: GameState): boolean {
  return state.config.mode === 'classic';
}

/**
 * Économie banque limitée (stock + YoP/production/échanges).
 * Active en Classique et en CatanX (`standard`).
 */
export function usesLimitedBank(state: GameState): boolean {
  const mode = state.config.mode;
  return mode === 'classic' || mode === 'standard';
}

/**
 * Placement CATAN : villages/villes aux intersections, routes sur les arêtes.
 * Active en Classique et en CatanX (`standard`).
 */
export function usesTopologicalPlacement(state: GameState): boolean {
  const mode = state.config.mode;
  return mode === 'classic' || mode === 'standard';
}

export function totalClassicResources(bundle: ResourceBundle): number {
  return CLASSIC_RESOURCE_TYPES.reduce((sum, res) => sum + (bundle[res] ?? 0), 0);
}

export function createEmptyClassicBank(): ResourceBundle {
  return { ...CLASSIC_BANK_STOCK };
}

/** Stock banque : 19/ressource en classique ; proportionnel au land productif sinon. */
export function createBankForState(state: GameState): ResourceBundle {
  if (isClassicMode(state)) return createEmptyClassicBank();

  let productive = 0;
  for (const [, tile] of state.map) {
    const hasClassicProd = CLASSIC_RESOURCE_TYPES.some(
      (res) => (tile.baseProduction?.[res] ?? 0) > 0,
    );
    if (hasClassicProd) productive += 1;
  }
  const perResource = Math.max(19, Math.round((19 * Math.max(productive, 1)) / 18));
  return {
    wood: perResource,
    clay: perResource,
    wheat: perResource,
    sheep: perResource,
    ore: perResource,
  };
}

export function ensureLimitedBank(state: GameState): void {
  if (!usesLimitedBank(state)) return;
  if (!state.bank) state.bank = createBankForState(state);
}

/**
 * Accorde les ports hex adjacents (CatanX / placement tuile).
 * Stocke le `PortType` pour `getPortTradeRatio`.
 */
export function grantPortsAdjacentToTile(
  state: GameState,
  playerId: string,
  tileId: string,
): void {
  const player = state.players.get(playerId);
  const tile = state.map.get(tileId);
  if (!player || !tile) return;

  const grant = (candidate: HexTile | undefined) => {
    if (!candidate?.port) return;
    const port = normalizePortType(candidate.port);
    if (!port) return;
    if (!player.ports.includes(port)) {
      player.ports.push(port);
    }
  };

  grant(tile);
  for (const neighbor of hexAllNeighbors(tile.coord)) {
    grant(state.map.get(hexToId(neighbor)));
  }
}


export function createShuffledClassicDevDeck(): DevelopmentCardType[] {
  return getActiveRandom().shuffle([...CLASSIC_DEV_DECK]);
}

export function createClassicPieceStock(): ClassicPieceStock {
  return { ...CLASSIC_PIECE_LIMITS };
}

export function createClassicBoardState(
  map: Map<string, HexTile>,
  playerIds: string[],
): ClassicBoardState {
  const piecesRemaining: Record<string, ClassicPieceStock> = {};
  for (const playerId of playerIds) {
    piecesRemaining[playerId] = createClassicPieceStock();
  }
  return {
    topology: buildCatanTopology(map),
    occupiedIntersections: {},
    roadsByEdge: {},
    buildingByIntersection: {},
    piecesRemaining,
    setupStep: 'settlement',
    setupLastIntersectionId: null,
    anchorUsageByTile: {},
    portByIntersection: {},
  };
}

function classicBaseProduction(terrain: TerrainType): ResourceBundle {
  switch (terrain) {
    case 'forest':
    case 'jungle':
      return { wood: 1 };
    case 'hill':
    case 'swamp':
      return { clay: 1 };
    case 'plains':
    case 'river':
    case 'lake':
      return { wheat: 1 };
    case 'pasture':
    case 'tundra':
      return { sheep: 1 };
    case 'mountain':
    case 'volcano':
    case 'goldmine':
    case 'ruins':
      return { ore: 1 };
    default:
      return {};
  }
}

/**
 * Plateau débutant fixe (19 tuiles) + 9 ports.
 * Fertilité forcée à 100 : la production classique ne dépend pas de la fertilité CatanX.
 * Layout `random` : même composition, terrains / jetons / ports mélangés (6 et 8 non adjacents).
 */
export const CLASSIC_BEGINNER_TERRAINS: TerrainType[] = [
  'hill',
  'pasture',
  'forest',
  'plains',
  'mountain',
  'pasture',
  'plains',
  'forest',
  'plains',
  'desert',
  'forest',
  'mountain',
  'pasture',
  'mountain',
  'plains',
  'forest',
  'hill',
  'pasture',
  'hill',
];

export const CLASSIC_BEGINNER_DICE: Array<number | null> = [
  5, 2, 6, 3, 8, 10, 9, 12, 11, null, 4, 8, 10, 9, 4, 5, 6, 3, 11,
];

export const CLASSIC_BEGINNER_PORTS: PortType[] = [
  'generic_3:1',
  'wood_2:1',
  'generic_3:1',
  'ore_2:1',
  'wheat_2:1',
  'generic_3:1',
  'sheep_2:1',
  'clay_2:1',
  'generic_3:1',
];

function redNumbersAdjacent(
  orderedTileIds: string[],
  dice: Array<number | null>,
  state: GameState,
): boolean {
  for (let i = 0; i < orderedTileIds.length; i += 1) {
    if (dice[i] !== 6 && dice[i] !== 8) continue;
    const tile = state.map.get(orderedTileIds[i]!);
    if (!tile) continue;
    for (const neighborCoord of hexAllNeighbors(tile.coord)) {
      const neighborId = hexToId(neighborCoord);
      const neighborIndex = orderedTileIds.indexOf(neighborId);
      if (neighborIndex < 0) continue;
      const neighborDice = dice[neighborIndex];
      if (neighborDice === 6 || neighborDice === 8) return true;
    }
  }
  return false;
}

/** Vérifie qu'aucun 6 n'est adjacent à un 8 (règle de placement variable). */
export function classicBoardHasRedNumberConflict(state: GameState): boolean {
  const tiles = [...state.map.values()];
  for (const tile of tiles) {
    if (tile.diceValue !== 6 && tile.diceValue !== 8) continue;
    for (const neighborCoord of hexAllNeighbors(tile.coord)) {
      const neighbor = state.map.get(hexToId(neighborCoord));
      if (!neighbor) continue;
      if (neighbor.diceValue === 6 || neighbor.diceValue === 8) return true;
    }
  }
  return false;
}

function buildRandomClassicLayout(
  orderedTileIds: string[],
  state: GameState,
): {
  terrains: TerrainType[];
  dice: Array<number | null>;
  ports: PortType[];
} {
  const rng = getActiveRandom();
  let terrains = [...CLASSIC_BEGINNER_TERRAINS];
  let dice: Array<number | null> = [...CLASSIC_BEGINNER_DICE];
  let valid = false;

  for (let attempt = 0; attempt < 200; attempt += 1) {
    terrains = rng.shuffle([...CLASSIC_BEGINNER_TERRAINS]);
    const numbers = rng.shuffle(
      CLASSIC_BEGINNER_DICE.filter((value): value is number => value !== null),
    );
    let numberIndex = 0;
    dice = terrains.map((terrain) =>
      terrain === 'desert' ? null : numbers[numberIndex++]!,
    );
    if (!redNumbersAdjacent(orderedTileIds, dice, state)) {
      valid = true;
      break;
    }
  }

  // Dernier recours déterministe : repartir du layout fixe (toujours valide)
  if (!valid) {
    terrains = [...CLASSIC_BEGINNER_TERRAINS];
    dice = [...CLASSIC_BEGINNER_DICE];
  }

  return {
    terrains,
    dice,
    ports: rng.shuffle([...CLASSIC_BEGINNER_PORTS]),
  };
}

export function applyClassicBoardPreset(state: GameState): void {
  if (state.mapRadius !== 2) return;

  const orderedTileIds = [...state.map.values()]
    .sort((a, b) => {
      if (a.coord.r !== b.coord.r) return a.coord.r - b.coord.r;
      return a.coord.q - b.coord.q;
    })
    .map((tile) => tile.id);

  if (orderedTileIds.length !== 19) return;

  const layout = state.config.classicBoardLayout ?? 'fixed';
  const random =
    layout === 'random'
      ? buildRandomClassicLayout(orderedTileIds, state)
      : null;
  const classicTerrains = random?.terrains ?? CLASSIC_BEGINNER_TERRAINS;
  const classicDice = random?.dice ?? CLASSIC_BEGINNER_DICE;
  const classicPorts = random?.ports ?? CLASSIC_BEGINNER_PORTS;

  for (let index = 0; index < orderedTileIds.length; index += 1) {
    const tile = state.map.get(orderedTileIds[index]);
    if (!tile) continue;

    tile.terrain = classicTerrains[index] ?? 'plains';
    tile.diceValue = classicDice[index] ?? null;
    tile.robber = tile.terrain === 'desert';
    tile.baseProduction = classicBaseProduction(tile.terrain);
    tile.features = [];
    tile.port = null;
    tile.river = false;
    tile.volcano_active = false;
    tile.pollution = 0;
    tile.fertility = 100;
  }

  const ringIds = hexRing({ q: 0, r: 0, s: 0 }, 2)
    .map((coord) => hexToId(coord))
    .filter((tileId) => state.map.has(tileId));
  const portRingIndexes = [0, 1, 3, 4, 6, 7, 8, 10, 11];

  for (let i = 0; i < portRingIndexes.length; i += 1) {
    const tile = state.map.get(ringIds[portRingIndexes[i]] ?? '');
    if (!tile) continue;
    tile.port = classicPorts[i] ?? null;
  }

  const desert = [...state.map.values()].find((tile) => tile.terrain === 'desert');
  if (desert) {
    state.robberPosition = desert.id;
    for (const [, tile] of state.map) {
      tile.robber = tile.id === desert.id;
    }
  }
}

/**
 * Associe chaque port hex aux 2 intersections du bord côtier le plus externe.
 */
export function assignClassicPortsToIntersections(state: GameState): void {
  if (!state.classicBoard) return;
  const board = state.classicBoard;
  if (!board.topology) return;
  const portByIntersection: Record<string, PortType> = {};

  for (const [tileId, tile] of state.map) {
    if (!tile.port) continue;
    tile.port = normalizePortType(tile.port);
    if (!tile.port) continue;

    const coastalEdges = Object.values(board.topology.edges).filter((edge) => {
      if (!edge.tileIds.includes(tileId)) return false;
      const landCount = edge.tileIds.filter((id) => {
        const neighbor = state.map.get(id);
        return Boolean(neighbor && isClassicLandTerrain(neighbor.terrain));
      }).length;
      return landCount <= 1 || edge.tileIds.length === 1;
    });

    let bestEdge = coastalEdges[0];
    let bestDist = -1;
    for (const edge of coastalEdges) {
      const a = board.topology.intersections[edge.a];
      const b = board.topology.intersections[edge.b];
      if (!a || !b) continue;
      const mx = (a.x + b.x) / 2;
      const my = (a.y + b.y) / 2;
      const dist = mx * mx + my * my;
      if (dist > bestDist) {
        bestDist = dist;
        bestEdge = edge;
      }
    }

    if (!bestEdge) continue;
    portByIntersection[bestEdge.a] = tile.port;
    portByIntersection[bestEdge.b] = tile.port;
  }

  board.portByIntersection = portByIntersection;
}

/** Remet un joueur dans l'économie officielle CATAN (main vide, pas de fuites CatanX). */
export function resetClassicPlayerEconomy(player: Player): void {
  player.resources = {};
  player.resourceCap = {};
  player.researchedTechs = [];
  player.currentResearch = null;
  player.researchProgress = 0;
  player.researchQueue = [];
  player.specialAbilities = [];
  player.devCards = [];
  player.devCardsPlayedThisTurn = 0;
  player.freeRoadsRemaining = 0;
  player.militaryCards = [];
  player.diplomaticCards = [];
  player.activeTradeDeals = [];
  player.wonders = [];
  player.objectives = [];
  player.ports = [];
}

/**
 * Prépare une partie classique après createGame :
 * plateau fixe, banque, deck, topologie, économie vide, pas de placements auto.
 */
export function finalizeClassicGameCreate(state: GameState): void {
  applyClassicBoardPreset(state);

  state.units.clear();
  state.buildings.clear();
  state.activeEvents = [];
  state.pendingChoices = [];
  state.diceHistory = [];
  state.lastDiceRoll = null;
  state.winner = null;
  state.victoryType = undefined;
  state.rankings = [];
  state.sevenFlow = null;
  state.phase = 'setup';
  state.turnPhase = 'player_action';
  state.currentTurn = 1;
  state.currentPlayerIndex = 0;
  state.setupPlacementIndex = 0;
  state.setupRound = 1;
  state.setupPlayerOrder = [...state.turnOrder, ...[...state.turnOrder].reverse()];

  for (const [, tile] of state.map) {
    tile.owner = null;
    tile.road = null;
    tile.buildings = [];
    tile.units = [];
    tile.visible.clear();
    tile.explored.clear();
  }

  for (const [, player] of state.players) {
    resetClassicPlayerEconomy(player);
    player.settlements = [];
    player.cities = [];
    player.metropolis = [];
    player.ownedTiles = [];
    player.roads = [];
    player.units = [];
    player.army = [];
    player.stats.totalUnits = 0;
    player.stats.militaryStrength = 0;
    player.stats.tilesOwned = 0;
    player.stats.citiesOwned = 0;
    player.stats.settlementsOwned = 0;
    player.stats.victoryPoints = 0;
    player.stats.vpBreakdown = {
      settlements: 0,
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
    };
  }

  state.bank = createEmptyClassicBank();
  state.devDeck = isCitiesKnightsEnabled(state) ? [] : createShuffledClassicDevDeck();
  state.classicBoard = createClassicBoardState(state.map, state.turnOrder);
  assignClassicPortsToIntersections(state);
}

/**
 * Applique la règle de pénurie CATAN après calcul brut de production.
 * Mutates `results` et décrémente `state.bank`.
 */
export function applyClassicBankProduction(
  state: GameState,
  results: Array<{ playerId: string; resources: ResourceBundle }>,
): void {
  if (!state.bank) {
    state.bank = createBankForState(state);
  }
  const bank = state.bank;

  for (const res of CLASSIC_RESOURCE_TYPES) {
    const entitled = results.filter((r) => (r.resources[res] ?? 0) > 0);
    if (entitled.length === 0) continue;

    const totalNeeded = entitled.reduce((sum, r) => sum + (r.resources[res] ?? 0), 0);
    const available = bank[res] ?? 0;

    if (available >= totalNeeded) {
      bank[res] = available - totalNeeded;
      continue;
    }

    // Pénurie : si plusieurs joueurs concernés → personne ne reçoit.
    // Si un seul joueur → il prend le reste disponible.
    if (entitled.length > 1) {
      for (const r of entitled) {
        delete r.resources[res];
      }
      continue;
    }

    const only = entitled[0];
    const granted = Math.min(available, only.resources[res] ?? 0);
    if (granted <= 0) {
      delete only.resources[res];
    } else {
      only.resources[res] = granted;
      bank[res] = available - granted;
    }
  }

  // Banque limitée : uniquement les 5 ressources classiques (biomes avancés convertis).
  for (const r of results) {
    for (const key of Object.keys(r.resources)) {
      if (!(CLASSIC_RESOURCE_TYPES as readonly string[]).includes(key)) {
        delete r.resources[key as keyof ResourceBundle];
      }
    }
  }
}

/** Retourne des ressources à la banque (coûts, défausses). */
export function returnResourcesToBank(state: GameState, resources: ResourceBundle): void {
  if (!usesLimitedBank(state)) return;
  ensureLimitedBank(state);
  if (!state.bank) return;
  for (const res of CLASSIC_RESOURCE_TYPES) {
    const amount = resources[res] ?? 0;
    if (amount <= 0) continue;
    state.bank[res] = (state.bank[res] ?? 0) + amount;
  }
}

/** Débite la banque pour un gain direct (ex. 2e colonie) ; plafonne au stock. */
export function takeResourcesFromBank(state: GameState, resources: ResourceBundle): ResourceBundle {
  if (!usesLimitedBank(state)) return { ...resources };
  if (usesTopologicalPlacement(state)) ensureClassicRuntimeState(state);
  ensureLimitedBank(state);
  if (!state.bank) return {};
  const taken: ResourceBundle = {};
  for (const res of CLASSIC_RESOURCE_TYPES) {
    const want = resources[res] ?? 0;
    if (want <= 0) continue;
    const available = state.bank[res] ?? 0;
    const grant = Math.min(want, available);
    if (grant <= 0) continue;
    taken[res] = grant;
    state.bank[res] = available - grant;
  }
  return taken;
}

/** Hydrate banque / deck / topologie manquants (saves legacy, fallback client). */
export function ensureClassicRuntimeState(state: GameState): void {
  if (!usesTopologicalPlacement(state)) return;

  if (isClassicMode(state)) {
    if (!state.bank) state.bank = createEmptyClassicBank();
    // Ne pas regénérer un deck sur une vue projetée (ordre secret)
    if (state.publicDevDeckCount != null) {
      if (!state.devDeck) state.devDeck = [];
    } else if (!state.devDeck && !isCitiesKnightsEnabled(state)) {
      state.devDeck = createShuffledClassicDevDeck();
    } else if (!state.devDeck && isCitiesKnightsEnabled(state)) {
      state.devDeck = [];
    }
  } else {
    ensureLimitedBank(state);
  }

  if (!state.classicBoard) {
    state.classicBoard = createClassicBoardState(state.map, state.turnOrder);
    rebuildClassicOccupancyFromBuildings(state);
    assignClassicPortsToIntersections(state);
    return;
  }
  const board = state.classicBoard;
  if (!board.setupStep) board.setupStep = 'settlement';
  if (board.setupLastIntersectionId === undefined) board.setupLastIntersectionId = null;
  if (!board.anchorUsageByTile) board.anchorUsageByTile = {};
  if (!board.occupiedIntersections) board.occupiedIntersections = {};
  if (!board.roadsByEdge) board.roadsByEdge = {};
  if (!board.buildingByIntersection) board.buildingByIntersection = {};
  if (!board.piecesRemaining) {
    board.piecesRemaining = {};
    for (const playerId of state.turnOrder) {
      board.piecesRemaining[playerId] = createClassicPieceStock();
    }
  }
  if (!board.topology) {
    board.topology = buildCatanTopology(state.map);
  }
  if (!board.portByIntersection) {
    board.portByIntersection = {};
  }
  if (Object.keys(board.portByIntersection).length === 0) {
    assignClassicPortsToIntersections(state);
  }

  const hasIntersectionBuildings = [...state.buildings.values()].some(
    (building) => building.placementKind === 'intersection' && building.placementIntersectionId,
  );
  const occupancyEmpty = Object.keys(board.occupiedIntersections).length === 0;
  if (hasIntersectionBuildings && occupancyEmpty) {
    rebuildClassicOccupancyFromBuildings(state);
  }
}

/**
 * Reconstruit occupiedIntersections / buildingByIntersection depuis les BuildingInstance
 * (saves legacy où la topologie a été recréée vide).
 */
export function rebuildClassicOccupancyFromBuildings(state: GameState): void {
  if (!usesTopologicalPlacement(state) || !state.classicBoard) return;
  const board = state.classicBoard;
  const occupied: Record<string, string> = {};
  const byIntersection: Record<string, string> = {};
  const anchorUsage: Record<string, number> = { ...board.anchorUsageByTile };

  for (const building of state.buildings.values()) {
    if (building.placementKind !== 'intersection' || !building.placementIntersectionId) continue;
    if (
      building.definitionId !== 'settlement' &&
      building.definitionId !== 'city'
    ) {
      continue;
    }
    occupied[building.placementIntersectionId] = building.ownerId;
    byIntersection[building.placementIntersectionId] = building.id;
    if (building.tileId) {
      anchorUsage[building.tileId] = (anchorUsage[building.tileId] ?? 0) + 1;
    }
  }

  board.occupiedIntersections = occupied;
  board.buildingByIntersection = byIntersection;
  board.anchorUsageByTile = anchorUsage;
}

export function classicLandProductionTiles(
  state: GameState,
  tileIds: string[],
): string[] {
  return tileIds.filter((tileId) => {
    const tile = state.map.get(tileId);
    return Boolean(tile && isClassicLandTerrain(tile.terrain) && tile.terrain !== 'desert');
  });
}

export function registerClassicSettlementPiece(
  state: GameState,
  playerId: string,
  intersectionId: string,
  buildingId: string,
): { ok: boolean; reason?: string } {
  ensureClassicRuntimeState(state);
  const board = state.classicBoard!;
  const stock = board.piecesRemaining[playerId];
  if (!stock || stock.settlements <= 0) {
    return { ok: false, reason: 'Plus de villages disponibles (limite 5)' };
  }
  if (board.occupiedIntersections[intersectionId]) {
    return { ok: false, reason: 'Ce sommet est déjà occupé' };
  }
  board.occupiedIntersections[intersectionId] = playerId;
  board.buildingByIntersection[intersectionId] = buildingId;
  stock.settlements -= 1;
  return { ok: true };
}

export function registerClassicRoadPiece(
  state: GameState,
  playerId: string,
  edgeId: string,
): { ok: boolean; reason?: string } {
  ensureClassicRuntimeState(state);
  const board = state.classicBoard!;
  const stock = board.piecesRemaining[playerId];
  if (!stock || stock.roads <= 0) {
    return { ok: false, reason: 'Plus de routes disponibles (limite 15)' };
  }
  if (board.roadsByEdge[edgeId]) {
    return { ok: false, reason: 'Cette arête est déjà occupée' };
  }
  board.roadsByEdge[edgeId] = playerId;
  stock.roads -= 1;
  return { ok: true };
}

/** Amélioration village → ville : restitue 1 village, consomme 1 ville. */
export function registerClassicCityUpgrade(
  state: GameState,
  playerId: string,
  intersectionId?: string,
  buildingId?: string,
): { ok: boolean; reason?: string } {
  ensureClassicRuntimeState(state);
  const board = state.classicBoard!;
  if (!intersectionId) {
    return { ok: false, reason: 'Intersection requise pour améliorer en ville' };
  }
  const stock = board.piecesRemaining[playerId];
  if (!stock || stock.cities <= 0) {
    return { ok: false, reason: 'Plus de villes disponibles (limite 4)' };
  }
  stock.cities -= 1;
  stock.settlements = Math.min(CLASSIC_PIECE_LIMITS.settlements, stock.settlements + 1);
  if (buildingId) {
    board.buildingByIntersection[intersectionId] = buildingId;
  }
  return { ok: true };
}

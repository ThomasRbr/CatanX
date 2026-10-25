import type { GameState } from '@catanx/engine';
import { buildWorldTopology } from '../utils/topologyToWorld';
import type {
  BoardRenderSnapshot,
  RenderBuilding,
  RenderCkState,
  RenderEdge,
  RenderGameEvent,
  RenderNode,
  RenderSeasonState,
  RenderUndergroundSkyState,
} from './BoardRenderSnapshot';
import type { BoardLayer } from '../../components/Map/boardLayer';

function freezeList<T>(items: T[]): readonly T[] {
  for (const item of items) Object.freeze(item);
  return Object.freeze(items);
}

function projectNodes(state: GameState): readonly RenderNode[] {
  const topology = state.classicBoard?.topology ?? buildWorldTopology(state.map);
  const board = state.classicBoard;
  return freezeList(Object.values(topology.intersections).map((node) => ({
    nodeId: node.id,
    x: node.x,
    z: node.y,
    tileIds: Object.freeze([...node.tileIds]),
    neighborIds: Object.freeze([...node.neighborIds]),
    ownerId: board?.occupiedIntersections[node.id] ?? null,
    buildingId: board?.buildingByIntersection[node.id] ?? null,
  })));
}

function projectEdges(state: GameState): readonly RenderEdge[] {
  const topology = state.classicBoard?.topology ?? buildWorldTopology(state.map);
  return freezeList(Object.values(topology.edges).map((edge) => ({
    edgeId: edge.id,
    a: edge.a,
    b: edge.b,
    tileIds: Object.freeze([...edge.tileIds]),
    ownerId: state.classicBoard?.roadsByEdge[edge.id] ?? null,
  })));
}

function projectBuildings(state: GameState): readonly RenderBuilding[] {
  return freezeList([...state.buildings.values()].map((building) => ({
    id: building.id,
    ownerId: building.ownerId,
    tileId: building.tileId,
    intersectionId: building.placementIntersectionId ?? null,
    kind: building.definitionId,
    level: building.level,
    active: building.isActive,
  })));
}

function projectSeason(state: GameState): RenderSeasonState | null {
  const seasons = state.extensions?.seasons;
  if (!seasons && !state.config.enableSeasons) return null;
  return Object.freeze({
    season: seasons?.currentSeason ?? state.season,
    year: seasons?.seasonYear ?? state.year,
    climateId: seasons?.currentClimateId ?? null,
    forecastClimateId: seasons?.forecastClimateId ?? null,
    roundInSeason: seasons?.roundInSeason ?? state.seasonTurn,
  });
}

function projectCitiesKnights(state: GameState): RenderCkState | null {
  const ck = state.extensions?.citiesKnights;
  if (!ck) return null;
  return Object.freeze({
    barbarianTrackPosition: ck.barbarianTrackPosition,
    barbarianTrackLength: ck.barbarianTrackLength,
    robberUnlocked: ck.robberUnlocked,
    merchantTileId: ck.merchant.tileId,
    knightCount: ck.knights.length,
    wallIntersectionIds: Object.freeze(Object.keys(ck.walls)),
  });
}

function projectUndergroundSky(state: GameState): RenderUndergroundSkyState | null {
  const us = state.extensions?.undergroundSky;
  if (!us) return null;
  return Object.freeze({
    revealedUndergroundNodeIds: Object.freeze([...us.revealedUndergroundNodeIds]),
    revealedSkyHubIds: Object.freeze([...us.revealedSkyHubIds]),
    shaftCount: us.shafts.length,
    tunnelCount: us.tunnels.length,
    outpostCount: us.outposts.length,
    airportCount: us.airports.length,
    airshipCount: us.airships.length,
    beaconCount: us.beacons.length,
  });
}

function projectVisualEvents(state: GameState): readonly RenderGameEvent[] {
  return freezeList(state.activeEvents.map((event) => ({
    id: event.id,
    type: event.type,
    severity: event.severity,
    triggeredTurn: event.triggeredTurn,
    targetTileIds: Object.freeze([...(event.targetTiles ?? [])]),
  })));
}

/** Pure authoritative-state to visual-state projection. */
export function projectBoardRenderSnapshot(
  state: GameState,
  layer: BoardLayer,
): BoardRenderSnapshot {
  const tiles = freezeList([...state.map.values()].map((tile) => ({
    id: tile.id,
    coord: Object.freeze({ ...tile.coord }),
    terrain: tile.terrain,
    elevation: tile.elevation,
    climate: tile.climate,
    diceValue: tile.diceValue,
    ownerId: tile.owner,
    robber: tile.robber,
    port: tile.port,
    features: Object.freeze([...tile.features]),
  })));
  const roads = freezeList(Object.entries(state.classicBoard?.roadsByEdge ?? {}).map(
    ([edgeId, ownerId]) => ({ edgeId, ownerId }),
  ));
  const units = freezeList([...state.units.values()].map((unit) => ({
    id: unit.id,
    ownerId: unit.ownerId,
    kind: unit.type,
    position: Object.freeze({ ...unit.position }),
    facing: unit.facing,
    status: unit.status,
  })));
  const productionTokens = freezeList(tiles
    .filter((tile) => tile.diceValue !== null)
    .map((tile) => ({
      tileId: tile.id,
      value: tile.diceValue!,
      blocked: state.robberPosition === tile.id,
    })));

  return Object.freeze({
    revision: Math.max(state.updatedAt, state.currentTurn),
    mapSeed: state.config.mapSeed,
    layer,
    tiles,
    nodes: projectNodes(state),
    edges: projectEdges(state),
    buildings: projectBuildings(state),
    roads,
    units,
    productionTokens,
    season: projectSeason(state),
    citiesKnights: projectCitiesKnights(state),
    undergroundSky: projectUndergroundSky(state),
    visualEvents: projectVisualEvents(state),
  });
}

import type {
  BuildingInstance,
  CubeCoord,
  GameEvent,
  HexTile,
  Season,
  TerrainType,
  UnitInstance,
} from '@catanx/engine';
import type { BoardLayer } from '../../components/Map/boardLayer';

export interface RenderTile {
  id: string;
  coord: CubeCoord;
  terrain: TerrainType;
  elevation: HexTile['elevation'];
  climate: HexTile['climate'];
  diceValue: number | null;
  ownerId: string | null;
  robber: boolean;
  port: HexTile['port'];
  features: readonly HexTile['features'][number][];
}

export interface RenderNode {
  nodeId: string;
  x: number;
  z: number;
  tileIds: readonly string[];
  neighborIds: readonly string[];
  ownerId: string | null;
  buildingId: string | null;
}

export interface RenderEdge {
  edgeId: string;
  a: string;
  b: string;
  tileIds: readonly string[];
  ownerId: string | null;
}

export interface RenderBuilding {
  id: string;
  ownerId: string;
  tileId: string;
  intersectionId: string | null;
  kind: BuildingInstance['definitionId'];
  level: number;
  active: boolean;
}

export interface RenderRoad {
  edgeId: string;
  ownerId: string;
}

export interface RenderUnit {
  id: string;
  ownerId: string;
  kind: UnitInstance['type'];
  position: CubeCoord;
  facing: number;
  status: UnitInstance['status'];
}

export interface RenderToken {
  tileId: string;
  value: number;
  blocked: boolean;
}

export interface RenderSeasonState {
  season: Season;
  year: number;
  climateId: string | null;
  forecastClimateId: string | null;
  roundInSeason: number;
}

export interface RenderCkState {
  barbarianTrackPosition: number;
  barbarianTrackLength: number;
  robberUnlocked: boolean;
  merchantTileId: string | null;
  knightCount: number;
  wallIntersectionIds: readonly string[];
}

export interface RenderUndergroundSkyState {
  revealedUndergroundNodeIds: readonly string[];
  revealedSkyHubIds: readonly string[];
  shaftCount: number;
  tunnelCount: number;
  outpostCount: number;
  airportCount: number;
  airshipCount: number;
  beaconCount: number;
}

export interface RenderGameEvent {
  id: string;
  type: GameEvent['type'];
  severity: GameEvent['severity'];
  triggeredTurn: number;
  targetTileIds: readonly string[];
}

/**
 * Immutable, rules-free scene input. It deliberately contains no banks,
 * private hands, deck order, cargo contents or legal-action calculation.
 */
export interface BoardRenderSnapshot {
  revision: number;
  mapSeed: number;
  layer: BoardLayer;
  tiles: readonly RenderTile[];
  nodes: readonly RenderNode[];
  edges: readonly RenderEdge[];
  buildings: readonly RenderBuilding[];
  roads: readonly RenderRoad[];
  units: readonly RenderUnit[];
  productionTokens: readonly RenderToken[];
  season: RenderSeasonState | null;
  citiesKnights: RenderCkState | null;
  undergroundSky: RenderUndergroundSkyState | null;
  visualEvents: readonly RenderGameEvent[];
}

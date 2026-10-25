import type { GameState } from '../../../types/game';
import type { AIPersonality } from '../../../types/player';
import { isCitiesKnightsEnabled, isUndergroundSkyEnabled } from '../../../core/extensions';
import { undergroundSkyVictoryPoints } from '../../undergroundSky/mastery';
import { totalResources } from '../../resources/ResourceSystem';
import {
  CLASSIC_RESOURCE_TYPES,
  totalClassicResources,
  usesLimitedBank,
  usesTopologicalPlacement,
} from '../../catan/ClassicBoard';
import { isClassicLandTerrain } from '../../catan/CatanTopology';
import { playerCommodityHandSize } from '../../citiesKnights/commodities';
import { countCitiesOnBoard, totalDefenseStrength } from '../../citiesKnights/invasion';
import { getUrbanLevel } from '../../citiesKnights/urban';
import { getPersonalityBias } from './PersonalityWeights';
import { snapshotTrophyThreat } from './TrophyThreat';
import { seasonResourceBonus, seasonsModuleActive } from './SeasonBias';

export interface PositionFeatures {
  vp: number;
  production: number;
  diversity: number;
  ports: number;
  handPressure: number;
  /** Timing du 7 : pénalité si main ≥ 8 (risque immédiat). */
  sevenRisk: number;
  /** Spots disputés : pression adversaire sur intersections libres à fort score. */
  contested: number;
  trophy: number;
  ckUrban: number;
  ckDefense: number;
  ckProgress: number;
  season: number;
  race: number;
  /** Longueur de réseau routier (arêtes possédées). */
  roadNetwork: number;
  /** Titres / contrats Underground Sky. */
  undergroundSky: number;
}

export interface EvaluationOptions {
  personality?: AIPersonality | null;
}

function diceWeight(value: number | null | undefined): number {
  if (!value) return 0;
  return 6 - Math.abs(7 - value);
}

function handSize(state: GameState, playerId: string): number {
  const player = state.players.get(playerId);
  if (!player) return 0;
  const resources = usesLimitedBank(state)
    ? totalClassicResources(player.resources)
    : totalResources(player.resources);
  return resources + playerCommodityHandSize(state, playerId);
}

function productionFeatures(
  state: GameState,
  playerId: string,
): { production: number; diversity: number; ports: number; resources: Set<string> } {
  const resources = new Set<string>();
  let production = 0;
  let ports = 0;
  const board = state.classicBoard;

  if (usesTopologicalPlacement(state) && board) {
    for (const [iid, owner] of Object.entries(board.occupiedIntersections)) {
      if (owner !== playerId) continue;
      const buildingId = board.buildingByIntersection[iid];
      const building = buildingId ? state.buildings.get(buildingId) : undefined;
      const mult =
        building?.definitionId === 'city' || building?.definitionId === 'metropolis' ? 2 : 1;
      const intersection = board.topology.intersections[iid];
      if (!intersection) continue;
      for (const tileId of intersection.tileIds) {
        const tile = state.map.get(tileId);
        if (!tile || !isClassicLandTerrain(tile.terrain) || tile.terrain === 'desert') continue;
        const w = diceWeight(tile.diceValue);
        production += w * mult;
        if (tile.port) ports += 1;
        for (const r of Object.keys(tile.baseProduction ?? {})) resources.add(r);
      }
    }
  } else {
    const player = state.players.get(playerId);
    if (player) {
      for (const tileId of [...player.settlements, ...player.cities]) {
        const tile = state.map.get(tileId);
        if (!tile) continue;
        const mult = player.cities.includes(tileId) ? 2 : 1;
        production += diceWeight(tile.diceValue) * mult;
        if (tile.port) ports += 1;
        for (const r of Object.keys(tile.baseProduction ?? {})) resources.add(r);
      }
    }
  }

  return { production, diversity: resources.size, ports, resources };
}

/**
 * Approximation légère : combien d’adversaires touchent déjà
 * des spots libres adjacents à notre réseau (blocage potentiel).
 */
function contestedSpotPressure(state: GameState, playerId: string): number {
  const board = state.classicBoard;
  if (!usesTopologicalPlacement(state) || !board) return 0;

  let pressure = 0;
  const myNetwork = new Set<string>();
  for (const [eid, owner] of Object.entries(board.roadsByEdge ?? {})) {
    if (owner !== playerId) continue;
    const edge = board.topology.edges[eid];
    if (!edge) continue;
    myNetwork.add(edge.a);
    myNetwork.add(edge.b);
  }
  for (const [iid, owner] of Object.entries(board.occupiedIntersections ?? {})) {
    if (owner === playerId) myNetwork.add(iid);
  }

  // Spots libres adjacents au réseau : adversaire déjà connecté ?
  for (const iid of myNetwork) {
    const inter = board.topology.intersections[iid];
    if (!inter) continue;
    for (const nid of inter.neighborIds) {
      if (board.occupiedIntersections[nid]) continue;
      const nInter = board.topology.intersections[nid];
      if (!nInter) continue;
      let enemyTouch = 0;
      for (const edge of Object.values(board.topology.edges)) {
        if (edge.a !== nid && edge.b !== nid) continue;
        const owner = board.roadsByEdge[edge.id];
        if (owner && owner !== playerId) enemyTouch += 1;
      }
      if (enemyTouch > 0) {
        let prod = 0;
        for (const tid of nInter.tileIds) {
          const tile = state.map.get(tid);
          if (!tile || !isClassicLandTerrain(tile.terrain) || tile.terrain === 'desert') continue;
          prod += diceWeight(tile.diceValue);
        }
        pressure += enemyTouch * (1 + prod * 0.15);
      }
    }
  }
  return -pressure;
}

function ckFeatures(
  state: GameState,
  playerId: string,
): { urban: number; defense: number; progress: number } {
  if (!isCitiesKnightsEnabled(state)) return { urban: 0, defense: 0, progress: 0 };
  const ck = state.extensions?.citiesKnights;
  if (!ck) return { urban: 0, defense: 0, progress: 0 };

  const trade = getUrbanLevel(state, playerId, 'trade');
  const politics = getUrbanLevel(state, playerId, 'politics');
  const science = getUrbanLevel(state, playerId, 'science');
  let urban = trade * 3 + politics * 3 + science * 3;
  for (const track of ['trade', 'politics', 'science'] as const) {
    if (ck.metropolises[track]?.ownerId === playerId) urban += 12;
  }
  if (ck.merchant?.ownerId === playerId) urban += 8;

  const eta = Math.max(0, ck.barbarianTrackLength - ck.barbarianTrackPosition);
  const deficit = countCitiesOnBoard(state) - totalDefenseStrength(state);
  const myStrength = ck.knights
    .filter((k) => k.ownerId === playerId && k.activated && k.intersectionId)
    .reduce((s, k) => s + k.rank, 0);
  let defense = myStrength * 2;
  if (deficit > 0 && eta <= 3) defense += 6;
  if (deficit <= 0) defense += 2;

  const hand = ck.progressHands[playerId] ?? [];
  const progress = hand.length * 1.5;

  return { urban, defense, progress };
}

export function extractPositionFeatures(
  state: GameState,
  playerId: string,
): PositionFeatures {
  const threat = snapshotTrophyThreat(state, playerId);
  const { production, diversity, ports, resources } = productionFeatures(state, playerId);
  const ck = ckFeatures(state, playerId);
  const hand = handSize(state, playerId);
  // Prefer medium hands; punish 8+ (7 risk) and empty hands lightly.
  const handPressure = hand <= 7 ? hand * 0.15 : -(hand - 7) * 0.8;
  // P(7) = 6/36 ≈ 0.167 par lancer — timing explicite au-delà de handPressure.
  const sevenRisk = hand >= 8 ? -(hand - 7) * 1.2 : hand >= 7 ? -0.4 : 0;

  const season = seasonsModuleActive(state)
    ? seasonResourceBonus(state, resources, Math.max(1, production))
    : 0;

  const contested = contestedSpotPressure(state, playerId);

  let roadNetwork = 0;
  const board = state.classicBoard;
  if (board?.roadsByEdge) {
    for (const owner of Object.values(board.roadsByEdge)) {
      if (owner === playerId) roadNetwork += 1;
    }
  }

  let undergroundSky = 0;
  if (isUndergroundSkyEnabled(state)) {
    undergroundSky = undergroundSkyVictoryPoints(state, playerId) * 6;
    const us = state.extensions?.undergroundSky;
    if (us) {
      undergroundSky += (us.completedRegularContracts[playerId] ?? 0) * 2;
      undergroundSky += us.beacons.filter((b) => b.playerId === playerId).length * 3;
      undergroundSky += us.airports.filter((a) => a.playerId === playerId).length * 2;
    }
  }

  const race =
    threat.myVp * 12 +
    (threat.isWinningRace ? 15 : 0) -
    Math.max(0, threat.leaderGap) * 4 +
    (threat.vpGapToWin <= 3 ? (4 - threat.vpGapToWin) * 5 : 0);

  return {
    vp: threat.myVp,
    production,
    diversity,
    ports,
    handPressure,
    sevenRisk,
    contested,
    trophy: threat.longestRoadPressure + threat.largestArmyPressure + threat.defenderPressure,
    ckUrban: ck.urban,
    ckDefense: ck.defense,
    ckProgress: ck.progress,
    season,
    race,
    roadNetwork,
    undergroundSky,
  };
}

export function evaluatePosition(
  state: GameState,
  playerId: string,
  options: EvaluationOptions = {},
): number {
  const f = extractPositionFeatures(state, playerId);
  const player = state.players.get(playerId);
  const personality = options.personality ?? player?.aiPersonality;
  const b = getPersonalityBias(personality);

  return (
    f.race * 1.0 * b.balanced +
    f.production * 2.2 * b.economy +
    f.diversity * 1.5 * b.economy +
    f.ports * 1.2 * b.economy +
    f.handPressure * 1.0 +
    f.sevenRisk * 1.0 +
    f.contested * 1.4 * b.expansion +
    f.trophy * 3.0 * b.military +
    f.ckUrban * 1.0 * b.science +
    f.ckDefense * 1.1 * b.military +
    f.ckProgress * 1.0 * b.science +
    f.season * 1.0 * b.economy +
    f.roadNetwork * 0.45 * b.expansion +
    f.undergroundSky * 1.0 * b.balanced +
    (state.longestRoadOwner === playerId ? 2 : 0) * b.expansion +
    (() => {
      const p = state.players.get(playerId);
      if (!p) return 0;
      let types = 0;
      for (const r of CLASSIC_RESOURCE_TYPES) {
        if ((p.resources[r] ?? 0) > 0) types += 1;
      }
      return types * 0.4 * b.economy;
    })()
  );
}

/** Δevaluate after hypothetically applying nothing — compare two states. */
export function deltaEvaluate(
  before: GameState,
  after: GameState,
  playerId: string,
  options: EvaluationOptions = {},
): number {
  return evaluatePosition(after, playerId, options) - evaluatePosition(before, playerId, options);
}

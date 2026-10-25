/**
 * Projection multitour (horizon N) : production attendue, affordabilité,
 * anticipation climat / pénalités saisonnières légères.
 */

import type { GameState } from '../../../types/game';
import type { ResourceBundle, ResourceType } from '../../../types/resources';
import {
  CLASSIC_RESOURCE_TYPES,
  usesTopologicalPlacement,
} from '../../catan/ClassicBoard';
import { isClassicLandTerrain } from '../../catan/CatanTopology';
import { isSeasonsEnabled } from '../../../core/extensions';
import { getClimateDefinition } from '../../seasons/definitions';
import { getCityProductionPenalties } from '../../seasons/costs';
import { applySeasonalBuildCost } from '../../seasons/costs';
import { hasResources } from '../../resources/ResourceSystem';
import { snapshotTrophyThreat } from './TrophyThreat';
import { listClassicSettlementCandidates } from '../../catan/ClassicCommands';
import { skyMasteryScore } from '../../undergroundSky/mastery';

function skyMasteryNear(state: GameState, playerId: string): boolean {
  const score = skyMasteryScore(state, playerId);
  return score >= 3 && score < 5;
}

const DICE_P: Record<number, number> = {
  2: 1 / 36,
  3: 2 / 36,
  4: 3 / 36,
  5: 4 / 36,
  6: 5 / 36,
  8: 5 / 36,
  9: 4 / 36,
  10: 3 / 36,
  11: 2 / 36,
  12: 1 / 36,
};

export type HorizonFocus =
  | 'city'
  | 'settlement'
  | 'road_path'
  | 'longest_road'
  | 'largest_army'
  | 'port_race'
  | 'ck_defense'
  | 'ck_urban'
  | 'ck_metropolis'
  | 'us_contract'
  | 'us_mastery'
  | 'save';

export interface HorizonProjection {
  horizonTurns: number;
  /** Production attendue par ressource sur l’horizon (float). */
  expectedGain: ResourceBundle;
  /** Main projetée (courante + expected, floor). */
  projectedHand: ResourceBundle;
  turnsToSettlement: number | null;
  turnsToCity: number | null;
  focus: HorizonFocus;
  rationale: string;
}

function diceWeight(value: number | null | undefined): number {
  if (!value || value === 7) return 0;
  return DICE_P[value] ?? 0;
}

/** Espérance de cartes/tour pour le joueur (par ressource classique). */
export function expectedProductionPerTurn(
  state: GameState,
  playerId: string,
): ResourceBundle {
  const out: ResourceBundle = {};
  for (const r of CLASSIC_RESOURCE_TYPES) out[r] = 0;

  const board = state.classicBoard;
  const penalties = isSeasonsEnabled(state)
    ? getCityProductionPenalties(state)
    : {};

  if (usesTopologicalPlacement(state) && board) {
    for (const [iid, owner] of Object.entries(board.occupiedIntersections)) {
      if (owner !== playerId) continue;
      const buildingId = board.buildingByIntersection[iid];
      const building = buildingId ? state.buildings.get(buildingId) : undefined;
      const isCity =
        building?.definitionId === 'city' || building?.definitionId === 'metropolis';
      const mult = isCity ? 2 : 1;
      const intersection = board.topology.intersections[iid];
      if (!intersection) continue;
      for (const tileId of intersection.tileIds) {
        const tile = state.map.get(tileId);
        if (!tile || tile.robber) continue;
        if (!isClassicLandTerrain(tile.terrain) || tile.terrain === 'desert') continue;
        const p = diceWeight(tile.diceValue);
        if (p <= 0) continue;
        for (const r of CLASSIC_RESOURCE_TYPES) {
          const base = tile.baseProduction?.[r] ?? 0;
          if (base <= 0) continue;
          let gain = base * mult * p;
          // Pénalité climat sur production ville (approx −1 max si pénalisé)
          if (isCity && (penalties[r] ?? 0) > 0) {
            gain *= 0.55;
          }
          out[r] = (out[r] ?? 0) + gain;
        }
      }
    }
  }

  // Bias saisonnier léger : ressources favorisées un peu plus probables à valoriser
  if (isSeasonsEnabled(state)) {
    const seasons = state.extensions?.seasons;
    const climateId = seasons?.currentClimateId;
    if (climateId) {
      const fav = getClimateDefinition(climateId).favoredResources;
      for (const r of fav) {
        out[r] = (out[r] ?? 0) * 1.08;
      }
    }
  }

  return out;
}

/** Surcoût route anticipé (crues actuelles ou prévues). */
function seasonalRoadClayPenalty(state: GameState): number {
  if (!isSeasonsEnabled(state)) return 0;
  const seasons = state.extensions?.seasons;
  if (!seasons) return 0;
  let penalty = 0;
  for (const climateId of [seasons.currentClimateId, seasons.forecastClimateId]) {
    if (!climateId) continue;
    const def = getClimateDefinition(climateId);
    for (const effect of def.effects) {
      if (
        effect.kind === 'all_build_cost_delta' &&
        effect.building === 'road' &&
        effect.resource === 'clay' &&
        effect.delta > 0
      ) {
        penalty = Math.max(penalty, effect.delta);
      }
    }
  }
  return penalty;
}

/** Ports génériques dégradés (tempête) — commerce banque moins attractif. */
function seasonalPortDegraded(state: GameState): boolean {
  if (!isSeasonsEnabled(state)) return false;
  const seasons = state.extensions?.seasons;
  if (!seasons) return false;
  for (const climateId of [seasons.currentClimateId, seasons.forecastClimateId]) {
    if (!climateId) continue;
    const def = getClimateDefinition(climateId);
    if (def.effects.some((e) => e.kind === 'generic_port_ratio' && e.ratio >= 4)) {
      return true;
    }
  }
  return false;
}

function turnsUntilAffordable(
  have: ResourceBundle,
  cost: ResourceBundle,
  perTurn: ResourceBundle,
  maxTurns: number,
): number | null {
  const sim: ResourceBundle = { ...have };
  for (let t = 0; t <= maxTurns; t++) {
    if (hasResources(sim, cost)) return t;
    if (t === maxTurns) break;
    for (const r of CLASSIC_RESOURCE_TYPES) {
      sim[r] = (sim[r] ?? 0) + (perTurn[r] ?? 0);
    }
  }
  return null;
}

function floorHand(hand: ResourceBundle, gain: ResourceBundle, turns: number): ResourceBundle {
  const out: ResourceBundle = { ...hand };
  for (const r of CLASSIC_RESOURCE_TYPES) {
    out[r] = Math.floor((out[r] ?? 0) + (gain[r] ?? 0) * turns);
  }
  return out;
}

/**
 * Estime sur `horizonTurns` tours globaux (approx = tours joueur).
 * Choisit un focus stratégique (course VP / C&K / expansion).
 */
export function projectHorizon(
  state: GameState,
  playerId: string,
  horizonTurns = 3,
): HorizonProjection {
  const player = state.players.get(playerId);
  const empty: HorizonProjection = {
    horizonTurns,
    expectedGain: {},
    projectedHand: {},
    turnsToSettlement: null,
    turnsToCity: null,
    focus: 'save',
    rationale: 'no-player',
  };
  if (!player) return empty;

  const perTurn = expectedProductionPerTurn(state, playerId);
  const expectedGain: ResourceBundle = {};
  for (const r of CLASSIC_RESOURCE_TYPES) {
    expectedGain[r] = (perTurn[r] ?? 0) * horizonTurns;
  }
  const projectedHand = floorHand(player.resources, perTurn, horizonTurns);

  const settleCost = applySeasonalBuildCost(
    state,
    playerId,
    'settlement',
    { wood: 1, clay: 1, wheat: 1, sheep: 1 },
  );
  const cityCost = applySeasonalBuildCost(
    state,
    playerId,
    'city',
    { ore: 3, wheat: 2 },
  );

  const turnsToSettlement = turnsUntilAffordable(
    player.resources,
    settleCost,
    perTurn,
    horizonTurns + 2,
  );
  const turnsToCity = turnsUntilAffordable(
    player.resources,
    cityCost,
    perTurn,
    horizonTurns + 2,
  );

  const threat = snapshotTrophyThreat(state, playerId);
  const board = state.classicBoard;
  const stock = board?.piecesRemaining[playerId];
  // Spot réellement placeable — pas juste stock > 0
  const placeableSettlements = usesTopologicalPlacement(state)
    ? listClassicSettlementCandidates(state, playerId).length
    : 0;
  const hasSettlementSpot =
    Boolean(stock && stock.settlements > 0) && placeableSettlements > 0;
  const canUpgradeCity =
    Boolean(stock && stock.cities > 0) &&
    [...(board ? Object.entries(board.occupiedIntersections) : [])].some(
      ([iid, owner]) => {
        if (owner !== playerId) return false;
        const bid = board!.buildingByIntersection[iid];
        const b = bid ? state.buildings.get(bid) : undefined;
        return b?.definitionId === 'settlement';
      },
    );

  let focus: HorizonFocus = 'save';
  let rationale = 'hold';

  const roadClayPenalty = seasonalRoadClayPenalty(state);
  const portsBad = seasonalPortDegraded(state);

  // Course à la victoire : PV proches → villes / C&K
  if (threat.vpGapToWin <= 2 && canUpgradeCity && turnsToCity !== null && turnsToCity <= horizonTurns) {
    focus = 'city';
    rationale = 'finish-race-city';
  } else if (
    threat.isBehindLeader &&
    threat.leaderGap >= 2 &&
    canUpgradeCity &&
    turnsToCity !== null &&
    turnsToCity <= horizonTurns + 2
  ) {
    focus = 'city';
    rationale = 'catch-up-city';
  } else if (
    state.extensions?.citiesKnights &&
    threat.defenderPressure < 1.5 &&
    (state.extensions.citiesKnights.barbarianTrackLength -
      state.extensions.citiesKnights.barbarianTrackPosition) <= 2
  ) {
    focus = 'ck_defense';
    rationale = 'barbarians-near';
  } else if (
    turnsToSettlement !== null &&
    turnsToSettlement <= 1 &&
    hasSettlementSpot
  ) {
    focus = 'settlement';
    rationale = 'settle-soon';
  } else if (
    // Crues (actuelles/prévues) : privilégier village placeable avant multi-routes
    roadClayPenalty > 0 &&
    turnsToSettlement !== null &&
    turnsToSettlement <= horizonTurns &&
    hasSettlementSpot
  ) {
    focus = 'settlement';
    rationale = 'pre-flood-settle';
  } else if (
    turnsToCity !== null &&
    turnsToCity <= horizonTurns &&
    canUpgradeCity &&
    threat.vpGapToWin <= 4
  ) {
    focus = 'city';
    rationale = 'city-horizon';
  } else if (threat.largestArmyPressure >= 1.5 && threat.vpGapToWin <= 4) {
    focus = 'largest_army';
    rationale = 'army-race';
  } else if (threat.longestRoadPressure >= 1.5 && threat.vpGapToWin <= 4) {
    focus = 'longest_road';
    rationale = 'lr-race';
  } else if (
    state.extensions?.undergroundSky &&
    (state.extensions.undergroundSky.completedRegularContracts[playerId] ?? 0) >= 1 &&
    skyMasteryNear(state, playerId)
  ) {
    focus = 'us_mastery';
    rationale = 'alizes-sprint';
  } else if (
    state.extensions?.undergroundSky &&
    (state.extensions.undergroundSky.airships.some((a) => a.playerId === playerId) ||
      state.extensions.undergroundSky.airports.some((a) => a.playerId === playerId))
  ) {
    focus = 'us_contract';
    rationale = 'sky-contracts';
  } else if (stock && stock.settlements > 0) {
    focus = 'road_path';
    rationale = roadClayPenalty > 0 ? 'expand-path-flood-aware' : 'expand-path';
  } else if (state.extensions?.citiesKnights) {
    const ck = state.extensions.citiesKnights;
    const hasMetro = (['trade', 'politics', 'science'] as const).some(
      (t) => ck.metropolises[t]?.ownerId === playerId,
    );
    focus = hasMetro ? 'ck_urban' : 'ck_metropolis';
    rationale = hasMetro ? 'ck-progress' : 'ck-metro-race';
  }

  if (portsBad && (focus === 'save' || focus === 'road_path')) {
    if (focus === 'save') rationale = 'port-degraded-hold';
    else {
      focus = 'port_race';
      rationale = 'seek-port';
    }
  }

  return {
    horizonTurns,
    expectedGain,
    projectedHand,
    turnsToSettlement,
    turnsToCity,
    focus,
    rationale,
  };
}

export type { ResourceType };

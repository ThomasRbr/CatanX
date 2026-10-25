/**
 * Coûts / échanges / seuil de main saisonniers.
 */

import type { GameState } from '../../types/game';
import type { ResourceBundle, ResourceType } from '../../types/resources';
import type { ClassicResourceType } from '../catan/ClassicBoard';
import type { SeasonRuleEffect } from '../../types/seasons';
import { isSeasonsEnabled } from '../../core/extensions';
import { getClimateDefinition } from './definitions';

export type SeasonBuildKind = 'settlement' | 'city' | 'road' | 'wall';

function climateEffects(state: GameState): readonly SeasonRuleEffect[] {
  const seasons = state.extensions?.seasons;
  if (!seasons || !isSeasonsEnabled(state)) return [];
  return getClimateDefinition(seasons.currentClimateId).effects;
}

export function getSeasonalHandLimitDelta(state: GameState, playerId: string): number {
  if (!isSeasonsEnabled(state)) return 0;
  const seasons = state.extensions?.seasons;
  if (!seasons) return 0;

  let delta = 0;
  for (const effect of climateEffects(state)) {
    if (effect.kind === 'hand_limit_delta') delta += effect.delta;
  }
  if (seasons.preparations[playerId] === 'reserve') {
    delta += 2;
  }
  return delta;
}

/**
 * Veillée : applique Mobilisation/Abri, puis la contrainte climatique restante.
 */
export function applySeasonalBuildCost(
  state: GameState,
  playerId: string,
  building: SeasonBuildKind,
  baseCost: ResourceBundle,
  opts?: { useWorks?: boolean },
): ResourceBundle {
  if (!isSeasonsEnabled(state)) return { ...baseCost };
  const seasons = state.extensions?.seasons;
  if (!seasons) return { ...baseCost };

  const cost: ResourceBundle = { ...baseCost };
  const prepUses = seasons.preparationUses[playerId];

  // 1. Mobilisation : −1 sur la composante la plus lourde de la première
  // construction payante de la saison (le coût total reste au moins à 1).
  if (
    seasons.preparations[playerId] === 'works' &&
    prepUses &&
    !prepUses.worksUsed
  ) {
    const total = Object.values(cost).reduce((sum, value) => sum + (value ?? 0), 0);
    if (total > 1) {
      const priority: ResourceType[] = ['ore', 'wheat', 'clay', 'wood', 'sheep'];
      const resource = priority
        .filter((key) => (cost[key] ?? 0) > 0)
        .sort((a, b) => (cost[b] ?? 0) - (cost[a] ?? 0))[0];
      if (resource) cost[resource] = Math.max(0, (cost[resource] ?? 0) - 1);
    }
  }

  // 2. Contrainte climatique — toujours après la préparation.
  const shelterReady =
    seasons.preparations[playerId] === 'shelter' &&
    prepUses &&
    !prepUses.shelterUsed;
  for (const effect of climateEffects(state)) {
    if (effect.kind === 'all_build_cost_delta' && effect.building === building) {
      if (effect.delta > 0 && shelterReady) continue;
      const res = effect.resource as ResourceType;
      cost[res] = Math.max(0, (cost[res] ?? 0) + effect.delta);
    }
  }

  return cost;
}

export function markSeasonalBuildUsed(
  state: GameState,
  playerId: string,
  building: SeasonBuildKind,
  opts?: { useWorks?: boolean },
): void {
  const seasons = state.extensions?.seasons;
  if (!seasons) return;
  const uses = seasons.climateUses[playerId];
  if (!uses) return;

  if (building === 'settlement') uses.firstSettlementBuilt = true;
  if (building === 'city') uses.firstCityBuilt = true;
  if (building === 'road') uses.firstRoadBuilt = true;
  if (building === 'wall') uses.firstWallBuilt = true;

  if (
    seasons.preparations[playerId] === 'works' &&
    seasons.preparationUses[playerId] &&
    !seasons.preparationUses[playerId]!.worksUsed
  ) {
    seasons.preparationUses[playerId]!.worksUsed = true;
  }
  const shelterUse = seasons.preparationUses[playerId];
  if (
    seasons.preparations[playerId] === 'shelter' &&
    shelterUse &&
    !shelterUse.shelterUsed &&
    climateEffects(state).some(
      (effect) =>
        effect.kind === 'all_build_cost_delta' &&
        effect.building === building &&
        effect.delta > 0,
    )
  ) {
    shelterUse.shelterUsed = true;
  }
}

/**
 * Améliore d’un cran un ratio (ex. 4→3→2), plancher 2:1.
 */
export function improveTradeRatio(ratio: number, steps = 1): number {
  let r = ratio;
  for (let i = 0; i < steps; i++) {
    if (r <= 2) break;
    if (r >= 4) r = 3;
    else if (r === 3) r = 2;
    else r = Math.max(2, r - 1);
  }
  return Math.max(2, r);
}

export function getSeasonalTradeRatioModifier(
  state: GameState,
  playerId: string,
  baseRatio: number,
  opts?: {
    useCommerce?: boolean;
    isCommodity?: boolean;
    isGenericPort?: boolean;
  },
): number {
  if (!isSeasonsEnabled(state)) return baseRatio;
  const seasons = state.extensions?.seasons;
  if (!seasons) return baseRatio;

  let ratio = baseRatio;

  // Ports génériques forcés (tempête)
  if (opts?.isGenericPort) {
    for (const effect of climateEffects(state)) {
      if (effect.kind === 'generic_port_ratio') {
        ratio = effect.ratio;
      }
    }
  }

  const prepUses = seasons.preparationUses[playerId];

  // Caravane : un échange à 3:1 maximum (un port 2:1 reste meilleur).
  if (
    opts?.useCommerce &&
    seasons.preparations[playerId] === 'commerce' &&
    prepUses &&
    !prepUses.commerceUsed
  ) {
    ratio = Math.min(ratio, 3);
  }

  return Math.max(2, ratio);
}

export function markSeasonalTradeUsed(
  state: GameState,
  playerId: string,
  opts?: { useCommerce?: boolean; usedClimateImprove?: boolean },
): void {
  const seasons = state.extensions?.seasons;
  if (!seasons) return;
  if (opts?.usedClimateImprove && seasons.climateUses[playerId]) {
    seasons.climateUses[playerId]!.firstTradeImproved = true;
  }
  if (
    opts?.useCommerce &&
    seasons.preparations[playerId] === 'commerce' &&
    seasons.preparationUses[playerId]
  ) {
    seasons.preparationUses[playerId]!.commerceUsed = true;
  }
}

export function getFirstSeasonalBonusAmount(
  _state: GameState,
  _playerId: string,
): number {
  return 1;
}

export function hasSimultaneousFavoredBothEffect(_state: GameState): boolean {
  return false;
}

export function getCityProductionPenalties(
  state: GameState,
): Partial<Record<ClassicResourceType, number>> {
  const out: Partial<Record<ClassicResourceType, number>> = {};
  for (const effect of climateEffects(state)) {
    if (effect.kind !== 'city_production_penalty') continue;
    if (effect.resources === 'all_classic') {
      for (const r of ['wood', 'clay', 'wheat', 'sheep', 'ore'] as const) {
        out[r] = (out[r] ?? 0) + effect.amount;
      }
    } else {
      for (const r of effect.resources) {
        out[r] = (out[r] ?? 0) + effect.amount;
      }
    }
  }
  return out;
}

export function getCurrentClimateLabel(state: GameState): {
  id: string;
  labelFr: string;
  severity: 'standard' | 'severe';
  favored: readonly [ClassicResourceType, ClassicResourceType];
} | null {
  const seasons = state.extensions?.seasons;
  if (!seasons || !isSeasonsEnabled(state)) return null;
  const def = getClimateDefinition(seasons.currentClimateId);
  return {
    id: def.id,
    labelFr: def.labelFr,
    severity: def.severity,
    favored: def.favoredResources,
  };
}

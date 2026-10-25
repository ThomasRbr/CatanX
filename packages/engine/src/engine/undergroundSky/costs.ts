/**
 * Coûts de construction Souterrain & Ciel (+ Mobilisation saisonnière sur tunnels).
 */

import type { GameState } from '../../types/game';
import type { ResourceBundle } from '../../types/resources';
import type { UndergroundSkyMaterialBundle } from '../../types/undergroundSky';
import { isSeasonsEnabled } from '../../core/extensions';
import { shouldAutoUseSeasonPreparation } from '../seasons/events';
import {
  US_BUILD_COSTS,
  type UsBuildKind,
  type UsPieceCost,
} from './catalog';

export function clonePieceCost(cost: UsPieceCost): UsPieceCost {
  return {
    resources: { ...cost.resources },
    materials: { ...cost.materials },
  };
}

export function getBuildCost(
  kind: UsBuildKind,
  overrides?: Partial<UsPieceCost>,
): UsPieceCost {
  const base = clonePieceCost(US_BUILD_COSTS[kind]);
  if (overrides?.resources) {
    for (const [k, v] of Object.entries(overrides.resources)) {
      base.resources[k as keyof ResourceBundle] = Math.max(
        0,
        (base.resources[k as keyof ResourceBundle] ?? 0) + (v ?? 0),
      );
    }
  }
  if (overrides?.materials) {
    for (const [k, v] of Object.entries(overrides.materials)) {
      const key = k as keyof UndergroundSkyMaterialBundle;
      base.materials[key] = Math.max(
        0,
        (base.materials[key] ?? 0) + (v ?? 0),
      );
    }
  }
  return base;
}

/**
 * Tunnel : Mobilisation (Saisons) peut retirer 1 argile une fois,
 * en partageant l’usage avec route / muraille.
 */
export function getTunnelBuildCost(
  state: GameState,
  playerId: string,
  opts?: {
    useSeasonPreparation?: boolean;
    unstableFaultSurcharge?: boolean;
    workshopOreDiscount?: boolean;
  },
): UsPieceCost {
  const cost = getBuildCost('tunnel');
  if (opts?.unstableFaultSurcharge) {
    cost.resources.clay = (cost.resources.clay ?? 0) + 1;
  }

  const useWorks =
    Boolean(opts?.useSeasonPreparation) ||
    shouldAutoUseSeasonPreparation(state, playerId, 'works');

  if (
    useWorks &&
    isSeasonsEnabled(state) &&
    state.extensions?.seasons?.preparations[playerId] === 'works' &&
    state.extensions.seasons.preparationUses[playerId] &&
    !state.extensions.seasons.preparationUses[playerId]!.worksUsed
  ) {
    cost.resources.clay = Math.max(0, (cost.resources.clay ?? 0) - 1);
  }

  return cost;
}

export function markTunnelWorksUsed(
  state: GameState,
  playerId: string,
  opts?: { useSeasonPreparation?: boolean },
): void {
  const seasons = state.extensions?.seasons;
  if (!seasons || !isSeasonsEnabled(state)) return;
  const useWorks =
    Boolean(opts?.useSeasonPreparation) ||
    shouldAutoUseSeasonPreparation(state, playerId, 'works');
  if (
    useWorks &&
    seasons.preparations[playerId] === 'works' &&
    seasons.preparationUses[playerId]
  ) {
    seasons.preparationUses[playerId]!.worksUsed = true;
  }
}

export function getExtractorBuildCost(
  opts?: { workshopOreDiscount?: boolean },
): UsPieceCost {
  const cost = getBuildCost('extractor');
  if (opts?.workshopOreDiscount) {
    cost.resources.ore = Math.max(0, (cost.resources.ore ?? 0) - 1);
  }
  return cost;
}

export function getOutpostBuildCost(
  opts?: { workshopOreDiscount?: boolean },
): UsPieceCost {
  const cost = getBuildCost('outpost');
  if (opts?.workshopOreDiscount) {
    cost.resources.ore = Math.max(0, (cost.resources.ore ?? 0) - 1);
  }
  return cost;
}

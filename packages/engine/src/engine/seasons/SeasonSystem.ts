/**
 * SeasonSystem — façade unique des règles saisonnières.
 */

import type { GameState } from '../../types/game';
import type { SeasonClassicResource, SeasonPreparation } from '../../types/seasons';
import { tickSeasonRound, canAdvanceSeasonClock, getSeasonsConfig } from './clock';
import { chooseSeasonPreparation, canChoosePreparation } from './preparations';
import {
  applyClimateProductionPenalties,
  applySeasonalAbundanceBonuses,
} from './production';
import {
  applySeasonalBuildCost,
  markSeasonalBuildUsed,
  getSeasonalTradeRatioModifier,
  markSeasonalTradeUsed,
  getSeasonalHandLimitDelta,
  getCurrentClimateLabel,
  type SeasonBuildKind,
} from './costs';
import { getClimateDefinition, SEASON_CLIMATE_DEFINITIONS } from './definitions';
import {
  createSeasonsState,
  syncSeasonMirrors,
  hydrateSeasonsFromSnapshot,
  ensureSeasonsPlayers,
} from './state';
import type { CollectionResult } from '../resources/ResourceSystem';
import type { ResourceBundle } from '../../types/resources';

export {
  tickSeasonRound,
  canAdvanceSeasonClock,
  getSeasonsConfig,
  chooseSeasonPreparation,
  canChoosePreparation,
  applyClimateProductionPenalties,
  applySeasonalAbundanceBonuses,
  applySeasonalBuildCost,
  markSeasonalBuildUsed,
  getSeasonalTradeRatioModifier,
  markSeasonalTradeUsed,
  getSeasonalHandLimitDelta,
  getCurrentClimateLabel,
  getClimateDefinition,
  SEASON_CLIMATE_DEFINITIONS,
  createSeasonsState,
  syncSeasonMirrors,
  hydrateSeasonsFromSnapshot,
  ensureSeasonsPlayers,
};

export type { SeasonBuildKind };

/** V2 : les saisons ne modifient plus directement la flotte C&K. */
export function resolveSeasonBarbarianShipModifier(_state: GameState): {
  skip: boolean;
  extraSteps: number;
} {
  return { skip: false, extraSteps: 0 };
}

export function markFirstBarbarianShipResolved(state: GameState): void {
  const seasons = state.extensions?.seasons;
  if (!seasons) return;
  seasons.climateGlobalUses.firstBarbarianShipResolved = true;
}

export function getFirstKnightActivateExtraCost(
  _state: GameState,
  _playerId: string,
): ResourceBundle {
  return {};
}

export function markFirstKnightActivated(state: GameState, playerId: string): void {
  const seasons = state.extensions?.seasons;
  if (!seasons?.climateUses[playerId]) return;
  seasons.climateUses[playerId]!.firstKnightActivated = true;
}

export function seasonsChoosePreparationCommand(
  state: GameState,
  playerId: string,
  preparation: SeasonPreparation,
  targetResource?: SeasonClassicResource,
): { events: { type: string; payload: Record<string, unknown> }[]; error?: string } {
  const result = chooseSeasonPreparation(state, playerId, preparation, targetResource);
  if (!result.ok) return { events: [], error: result.error };
  return {
    events: [
      {
        type: 'season_preparation_ready',
        payload: {
          playerId,
          season: state.extensions?.seasons?.currentSeason,
          forNext:
            !state.extensions?.seasons?.springPrepPending &&
            Boolean(state.extensions?.seasons?.preparationWindowOpen),
        },
      },
    ],
  };
}

/** Pipeline production post-CK : pénalités puis (après banque) bonus. */
export function runSeasonalProductionPipeline(
  state: GameState,
  collections: CollectionResult[],
  diceValue: number,
  opts: { bankAlreadyApplied: boolean },
): { events: { type: string; payload: Record<string, unknown> }[] } {
  applyClimateProductionPenalties(state, collections, diceValue);
  // La banque classique est appliquée dans collectDiceResources aujourd’hui.
  // Si bankAlreadyApplied, on distribue les bonus ensuite.
  if (opts.bankAlreadyApplied) {
    return { events: applySeasonalAbundanceBonuses(state, collections).events };
  }
  return { events: [] };
}

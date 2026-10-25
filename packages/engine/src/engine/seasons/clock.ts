/**
 * Horloge saisonnière — 5 rondes / saison, année hiver→printemps.
 */

import type { GameState } from '../../types/game';
import type { Season } from '../../types/events';
import type { SeasonRound, SeasonsConfig, SeasonsState } from '../../types/seasons';
import {
  emptyClimateUsage,
  emptyPreparationUsage,
  SEASON_ROUNDS_PER_SEASON,
} from '../../types/seasons';
import { defaultSeasonsConfig } from '../../types/seasons';
import { getClimateDefinition, isSevereClimate } from './definitions';
import { nextSeason, peekDrawClimateWithGuards } from './decks';
import { syncSeasonMirrors } from './state';
import { isCitiesKnightsEnabled } from '../../core/extensions';
import { peAfterSeasonChanged } from '../pactsEmbassies/adapters';

export interface SeasonAdvanceEvents {
  type: string;
  payload: Record<string, unknown>;
}

export function canAdvanceSeasonClock(state: GameState): boolean {
  if (state.pendingPlayerTrade) return false;
  if (state.pendingChoices.length > 0) return false;
  if (state.sevenFlow) return false;
  if (isCitiesKnightsEnabled(state)) {
    const pending = state.extensions?.citiesKnights?.pendingResolutions ?? [];
    if (pending.length > 0) return false;
  }
  return true;
}

/**
 * Incrémente la ronde saisonnière en fin de tour global (retour joueur 0).
 * Retourne les événements à émettre.
 */
export function tickSeasonRound(state: GameState): SeasonAdvanceEvents[] {
  const seasons = state.extensions?.seasons;
  if (!seasons) return [];

  const events: SeasonAdvanceEvents[] = [];
  const nextRound = (seasons.roundInSeason + 1) as number;

  if (nextRound > SEASON_ROUNDS_PER_SEASON) {
    if (!canAdvanceSeasonClock(state)) {
      // Reporter : rester en ronde 5 jusqu’à ce que les résolutions soient faites
      seasons.roundInSeason = SEASON_ROUNDS_PER_SEASON;
      seasons.preparationWindowOpen = true;
      syncSeasonMirrors(state);
      return events;
    }
    events.push(...transitionSeason(state, seasons));
  } else {
    seasons.roundInSeason = nextRound as SeasonRound;
    if (seasons.roundInSeason === SEASON_ROUNDS_PER_SEASON) {
      seasons.preparationWindowOpen = true;
      events.push({
        type: 'season_about_to_change',
        payload: {
          currentSeason: seasons.currentSeason,
          forecastClimateId: seasons.forecastClimateId,
          roundInSeason: SEASON_ROUNDS_PER_SEASON,
        },
      });
    }
    syncSeasonMirrors(state);
  }

  return events;
}

function transitionSeason(state: GameState, seasons: SeasonsState): SeasonAdvanceEvents[] {
  const events: SeasonAdvanceEvents[] = [];
  const config = defaultSeasonsConfig(state.config.extensions?.seasons);
  const leaving = seasons.currentSeason;
  const entering = nextSeason(leaving);

  // Défausser le climat quitté
  seasons.discards[leaving] = [...seasons.discards[leaving], seasons.currentClimateId];

  // Activer la prévision
  const newCurrent = seasons.forecastClimateId;
  const newSevere = isSevereClimate(newCurrent);

  // Compteur année : reset au passage hiver → printemps
  let seasonYear = seasons.seasonYear;
  let severeThisYear = seasons.severeClimatesThisYear;
  if (leaving === 'winter' && entering === 'spring') {
    seasonYear += 1;
    severeThisYear = 0;
  }
  if (newSevere) {
    severeThisYear += 1;
  }

  // Appliquer préparations suivantes
  for (const playerId of state.turnOrder) {
    const nextPrep = seasons.nextPreparations[playerId];
    if (nextPrep) {
      seasons.preparations[playerId] = nextPrep;
      seasons.preparationTargets[playerId] = seasons.nextPreparationTargets[playerId] ?? null;
    }
    seasons.nextPreparations[playerId] = null;
    seasons.nextPreparationTargets[playerId] = null;
    seasons.preparationReady[playerId] = false;
    seasons.preparationUses[playerId] = emptyPreparationUsage();
    seasons.climateUses[playerId] = emptyClimateUsage();
  }
  seasons.climateGlobalUses = emptyClimateUsage();

  // Tirer la prévision de la saison d’après
  const forecastSeason = nextSeason(entering);
  const forecastDraw = peekDrawClimateWithGuards(
    seasons.decks[forecastSeason],
    seasons.discards[forecastSeason],
    {
      previousWasSevere: newSevere,
      severeThisYear,
      config,
    },
  );
  seasons.decks[forecastSeason] = forecastDraw.deck;
  seasons.discards[forecastSeason] = forecastDraw.discard;

  seasons.currentSeason = entering;
  seasons.roundInSeason = 1;
  seasons.seasonYear = seasonYear;
  seasons.currentClimateId = newCurrent;
  seasons.forecastClimateId = forecastDraw.drawn;
  seasons.severeClimatesThisYear = severeThisYear;
  seasons.previousClimateWasSevere = newSevere;
  seasons.preparationWindowOpen = false;
  seasons.springPrepPending = false;

  seasons.history.push({
    seasonYear,
    season: entering,
    climateId: newCurrent,
    severity: getClimateDefinition(newCurrent).severity,
  });

  events.push({
    type: 'season_changed',
    payload: {
      from: leaving,
      to: entering,
      climateId: newCurrent,
      forecastClimateId: seasons.forecastClimateId,
      seasonYear,
      severity: getClimateDefinition(newCurrent).severity,
    },
  });
  events.push({
    type: 'season_forecast_revealed',
    payload: {
      climateId: seasons.forecastClimateId,
      season: forecastSeason,
      severity: getClimateDefinition(seasons.forecastClimateId).severity,
    },
  });
  if (newSevere) {
    events.push({
      type: 'severe_climate_started',
      payload: {
        climateId: newCurrent,
        season: entering,
        seasonYear,
      },
    });
  }

  syncSeasonMirrors(state);
  peAfterSeasonChanged(state);
  return events;
}

export function getSeasonsConfig(state: GameState): SeasonsConfig | null {
  const cfg = state.config.extensions?.seasons;
  if (!cfg?.enabled) return null;
  return defaultSeasonsConfig(cfg);
}

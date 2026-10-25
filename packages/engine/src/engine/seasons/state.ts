/**
 * Création / hydratation de l’état Saisons.
 */

import type { GameState } from '../../types/game';
import type {
  SeasonClimateId,
  SeasonPreparation,
  SeasonRound,
  SeasonsConfig,
  SeasonsState,
} from '../../types/seasons';
import {
  defaultSeasonsConfig,
  emptyClimateUsage,
  emptyPreparationUsage,
  LEGACY_SEASON_TO_CLIMATE,
  SEASON_ROUNDS_PER_SEASON,
} from '../../types/seasons';
import type { Season } from '../../types/events';
import { initialClimateDraw } from './decks';
import { climateIdsForSeason, getClimateDefinition, isKnownClimateId } from './definitions';

export function createSeasonsState(
  playerIds: string[],
  seed: number,
  config?: Partial<SeasonsConfig>,
): SeasonsState {
  const seasonsConfig = defaultSeasonsConfig({ ...config, enabled: true });
  const draw = initialClimateDraw(seed, seasonsConfig);

  const preparations: Record<string, SeasonPreparation> = {};
  const nextPreparations: Record<string, SeasonPreparation | null> = {};
  const preparationTargets: SeasonsState['preparationTargets'] = {};
  const nextPreparationTargets: SeasonsState['nextPreparationTargets'] = {};
  const preparationReady: SeasonsState['preparationReady'] = {};
  const preparationUses: Record<string, ReturnType<typeof emptyPreparationUsage>> = {};
  const climateUses: Record<string, ReturnType<typeof emptyClimateUsage>> = {};

  for (const id of playerIds) {
    preparations[id] = 'reserve';
    nextPreparations[id] = null;
    preparationTargets[id] = null;
    nextPreparationTargets[id] = null;
    preparationReady[id] = false;
    preparationUses[id] = emptyPreparationUsage();
    climateUses[id] = emptyClimateUsage();
  }

  return {
    currentSeason: 'spring',
    roundInSeason: 1,
    seasonYear: 1,
    currentClimateId: draw.currentClimateId,
    forecastClimateId: draw.forecastClimateId,
    decks: draw.decks,
    discards: draw.discards,
    severeClimatesThisYear: draw.severeClimatesThisYear,
    previousClimateWasSevere: draw.previousClimateWasSevere,
    preparations,
    nextPreparations,
    preparationTargets,
    nextPreparationTargets,
    preparationReady,
    preparationUses,
    climateUses,
    climateGlobalUses: emptyClimateUsage(),
    history: [
      {
        seasonYear: 1,
        season: 'spring',
        climateId: draw.currentClimateId,
        severity: getClimateDefinition(draw.currentClimateId).severity,
      },
    ],
    preparationWindowOpen: false,
    springPrepPending: true,
  };
}

export function syncSeasonMirrors(state: GameState): void {
  const seasons = state.extensions?.seasons;
  if (!seasons) return;
  state.season = seasons.currentSeason;
  state.seasonTurn = seasons.roundInSeason;
}

export function ensureSeasonsPlayers(state: GameState): void {
  const seasons = state.extensions?.seasons;
  if (!seasons) return;
  for (const playerId of state.turnOrder) {
    if (!seasons.preparations[playerId]) {
      seasons.preparations[playerId] = 'reserve';
    }
    if (seasons.nextPreparations[playerId] === undefined) {
      seasons.nextPreparations[playerId] = null;
    }
    if (seasons.preparationTargets[playerId] === undefined) {
      seasons.preparationTargets[playerId] = null;
    }
    if (seasons.nextPreparationTargets[playerId] === undefined) {
      seasons.nextPreparationTargets[playerId] = null;
    }
    if (seasons.preparationReady[playerId] === undefined) {
      seasons.preparationReady[playerId] = false;
    }
    if (!seasons.preparationUses[playerId]) {
      seasons.preparationUses[playerId] = emptyPreparationUsage();
    }
    if (!seasons.climateUses[playerId]) {
      seasons.climateUses[playerId] = emptyClimateUsage();
    }
  }
}

export function hydrateSeasonsFromSnapshot(state: GameState): void {
  const raw = state.extensions?.seasons as Partial<SeasonsState> | undefined;
  if (!raw || !state.config.extensions?.seasons?.enabled) {
    if (state.extensions) {
      delete (state.extensions as { seasons?: SeasonsState }).seasons;
    }
    return;
  }

  const playerIds = state.turnOrder.length ? state.turnOrder : [...state.players.keys()];
  const base = createSeasonsState(playerIds, state.config.mapSeed, state.config.extensions.seasons);

  const merged: SeasonsState = {
    ...base,
    ...raw,
    decks: {
      spring: [...(raw.decks?.spring ?? base.decks.spring)],
      summer: [...(raw.decks?.summer ?? base.decks.summer)],
      autumn: [...(raw.decks?.autumn ?? base.decks.autumn)],
      winter: [...(raw.decks?.winter ?? base.decks.winter)],
    },
    discards: {
      spring: [...(raw.discards?.spring ?? base.discards.spring)],
      summer: [...(raw.discards?.summer ?? base.discards.summer)],
      autumn: [...(raw.discards?.autumn ?? base.discards.autumn)],
      winter: [...(raw.discards?.winter ?? base.discards.winter)],
    },
    preparations: { ...base.preparations, ...raw.preparations },
    nextPreparations: { ...base.nextPreparations, ...raw.nextPreparations },
    preparationTargets: { ...base.preparationTargets, ...raw.preparationTargets },
    nextPreparationTargets: {
      ...base.nextPreparationTargets,
      ...raw.nextPreparationTargets,
    },
    preparationReady: { ...base.preparationReady, ...raw.preparationReady },
    preparationUses: { ...base.preparationUses, ...raw.preparationUses },
    climateUses: { ...base.climateUses, ...raw.climateUses },
    climateGlobalUses: {
      ...emptyClimateUsage(),
      ...raw.climateGlobalUses,
    },
    history: Array.isArray(raw.history) ? [...raw.history] : base.history,
  };

  const hydratedRound = Math.min(
    SEASON_ROUNDS_PER_SEASON,
    Math.max(1, Number(raw.roundInSeason ?? base.roundInSeason)),
  ) as SeasonRound;
  merged.roundInSeason = hydratedRound;
  if (hydratedRound < SEASON_ROUNDS_PER_SEASON) {
    merged.preparationWindowOpen = false;
  }

  // Les anciennes sauvegardes n'avaient pas de cible pour Récolte : choisir
  // automatiquement la ressource prioritaire du climat concerné.
  for (const playerId of playerIds) {
    if (merged.preparations[playerId] === 'harvest' && !merged.preparationTargets[playerId]) {
      merged.preparationTargets[playerId] = getClimateDefinition(
        merged.currentClimateId,
      ).favoredResources[0];
    }
    if (merged.nextPreparations[playerId] === 'harvest' && !merged.nextPreparationTargets[playerId]) {
      merged.nextPreparationTargets[playerId] = getClimateDefinition(
        merged.forecastClimateId,
      ).favoredResources[0];
    }
  }

  // Valider les IDs de climat
  try {
    getClimateDefinition(merged.currentClimateId);
    getClimateDefinition(merged.forecastClimateId);
  } catch {
    merged.currentClimateId = LEGACY_SEASON_TO_CLIMATE[merged.currentSeason];
    const next = nextSeasonSafe(merged.currentSeason);
    merged.forecastClimateId = LEGACY_SEASON_TO_CLIMATE[next];
  }

  // Saisons V2 : assainir les anciens decks de 5 cartes et compléter avec
  // les trois climats valides de chaque saison, sans dupliquer les actifs.
  const activeIds = new Set<SeasonClimateId>([merged.currentClimateId, merged.forecastClimateId]);
  for (const season of ['spring', 'summer', 'autumn', 'winter'] as const) {
    const validForSeason = (id: unknown): id is SeasonClimateId =>
      isKnownClimateId(id) && getClimateDefinition(id).season === season;
    const cleanedDeck = merged.decks[season].filter(
      (id) => validForSeason(id) && !activeIds.has(id),
    );
    const cleanedDiscard = merged.discards[season].filter(
      (id) => validForSeason(id) && !activeIds.has(id),
    );
    const seen = new Set<SeasonClimateId>([...cleanedDeck, ...cleanedDiscard, ...activeIds]);
    const missing = climateIdsForSeason(season).filter((id) => !seen.has(id));
    merged.decks[season] = [...new Set([...cleanedDeck, ...missing])];
    merged.discards[season] = [
      ...new Set(cleanedDiscard.filter((id) => !merged.decks[season].includes(id))),
    ];
  }
  merged.history = merged.history.filter((entry) => isKnownClimateId(entry.climateId));
  if (merged.history.length === 0) {
    merged.history.push({
      seasonYear: merged.seasonYear,
      season: merged.currentSeason,
      climateId: merged.currentClimateId,
      severity: getClimateDefinition(merged.currentClimateId).severity,
    });
  }

  if (!state.extensions) state.extensions = {};
  state.extensions.seasons = merged;
  syncSeasonMirrors(state);
}

function nextSeasonSafe(season: Season): Season {
  const order: Season[] = ['spring', 'summer', 'autumn', 'winter'];
  return order[(order.indexOf(season) + 1) % 4]!;
}

export function migrateLegacySeasonClock(state: {
  season?: Season;
  seasonTurn?: number;
  year?: number;
}): {
  currentSeason: Season;
  roundInSeason: SeasonRound;
  seasonYear: number;
  currentClimateId: SeasonClimateId;
} {
  const currentSeason = state.season ?? 'spring';
  const turn = Math.min(
    SEASON_ROUNDS_PER_SEASON,
    Math.max(1, state.seasonTurn ?? 1),
  ) as SeasonRound;
  return {
    currentSeason,
    roundInSeason: turn,
    seasonYear: 1,
    currentClimateId: LEGACY_SEASON_TO_CLIMATE[currentSeason],
  };
}

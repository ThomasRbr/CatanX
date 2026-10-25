import { GameState } from '../types/game';
import { Player } from '../types/player';
import { HexTile } from '../types/hex';
import { ENGINE_VERSION, SCHEMA_VERSION } from './version';
import { now } from './clock';
import { GameConfig } from '../types/game';
import type { GameCommand } from '@catanx/protocol';
import {
  ensureClassicRuntimeState,
  ensureLimitedBank,
  usesLimitedBank,
  usesTopologicalPlacement,
} from '../engine/catan/ClassicBoard';
import { hydrateCitiesKnightsFromSnapshot } from '../engine/citiesKnights/state';
import { hydrateSeasonsFromSnapshot, migrateLegacySeasonClock } from '../engine/seasons/state';
import { hydrateUndergroundSkyFromSnapshot } from '../engine/undergroundSky/state';
import { hydratePactsEmbassiesFromSnapshot } from '../engine/pactsEmbassies/state';
import {
  defaultSeasonsConfig,
  LEGACY_SEASON_TO_CLIMATE,
  emptyClimateUsage,
  emptyPreparationUsage,
} from '../types/seasons';
import { defaultUndergroundSkyConfig } from '../types/undergroundSky';
import { defaultPactsEmbassiesConfig } from '../types/pactsEmbassies';
import { reconstructBaseVictoryPointTarget } from './extensions';
import type { Season } from '../types/events';
import type { SeasonClimateId } from '../types/seasons';
import { createSeasonDecks, emptySeasonDiscards, nextSeason } from '../engine/seasons/decks';
import { getClimateDefinition } from '../engine/seasons/definitions';

export interface GameSnapshot {
  schemaVersion: number;
  engineVersion: string;
  config: GameConfig;
  state: SerializedGameState;
  commandLog: GameCommand[];
  randomSeed: number;
  savedAt: number;
}

export interface SerializedGameState extends Omit<
  GameState,
  'map' | 'players' | 'units' | 'buildings' | 'barbarians'
> {
  map: [string, SerializedHexTile][];
  players: [string, Player][];
  units: [string, unknown][];
  buildings: [string, unknown][];
  barbarians: [string, unknown][];
}

type SerializedHexTile = Omit<HexTile, 'explored' | 'visible'> & {
  explored: string[];
  visible: string[];
};

function serializeMaps(state: GameState): SerializedGameState {
  return {
    ...state,
    map: [...state.map.entries()].map(([k, tile]) => [
      k,
      {
        ...tile,
        explored: [...tile.explored],
        visible: [...tile.visible],
      },
    ]),
    players: [...state.players.entries()],
    units: [...state.units.entries()],
    buildings: [...state.buildings.entries()],
    barbarians: [...state.barbarians.entries()],
  };
}

function deserializeMaps(raw: SerializedGameState): GameState {
  const map = new Map<string, HexTile>(
    raw.map.map(([k, t]) => [
      k,
      {
        ...t,
        explored: new Set(t.explored),
        visible: new Set(t.visible),
      } as HexTile,
    ]),
  );

  const state = {
    ...raw,
    sevenFlow: raw.sevenFlow ?? null,
    worldCouncil: {
      ...raw.worldCouncil,
      resolutionCursor: raw.worldCouncil?.resolutionCursor ?? 0,
      activeEffects: raw.worldCouncil?.activeEffects ?? [],
    },
    map,
    players: new Map(raw.players),
    units: new Map(raw.units as [string, import('../types/military').UnitInstance][]),
    buildings: new Map(raw.buildings as [string, import('../types/buildings').BuildingInstance][]),
    barbarians: new Map(raw.barbarians as [string, import('../types/game').BarbarianGroup][]),
  } as GameState;

  if (usesTopologicalPlacement(state)) {
    ensureClassicRuntimeState(state);
  } else if (usesLimitedBank(state)) {
    ensureLimitedBank(state);
  }
  hydrateCitiesKnightsFromSnapshot(state);
  hydrateSeasonsFromSnapshot(state);
  hydrateUndergroundSkyFromSnapshot(state);
  hydratePactsEmbassiesFromSnapshot(state);
  return state;
}

export function createSnapshot(
  state: GameState,
  commandLog: GameCommand[] = [],
  randomSeed = state.config.mapSeed,
): GameSnapshot {
  return {
    schemaVersion: SCHEMA_VERSION,
    engineVersion: ENGINE_VERSION,
    config: state.config,
    state: serializeMaps(state),
    commandLog,
    randomSeed,
    savedAt: now(),
  };
}

export function snapshotToJSON(snapshot: GameSnapshot): string {
  return JSON.stringify(snapshot);
}

export function snapshotFromJSON(json: string): GameSnapshot {
  const parsed = JSON.parse(json) as GameSnapshot;
  return migrateSnapshot(parsed);
}

export function snapshotToGameState(snapshot: GameSnapshot): GameState {
  return deserializeMaps(snapshot.state);
}

export function migrateSnapshot(snapshot: GameSnapshot): GameSnapshot {
  let next = snapshot;
  if (!next.schemaVersion) {
    next = { ...next, schemaVersion: 1, engineVersion: next.engineVersion ?? '0.9.0' };
  }
  if (next.schemaVersion < 2) {
    const config = {
      ...next.config,
      extensions: next.config.extensions ?? {},
    };
    const state = {
      ...next.state,
      extensions: next.state.extensions ?? {},
    };
    next = {
      ...next,
      schemaVersion: 2,
      engineVersion: next.engineVersion ?? ENGINE_VERSION,
      config,
      state,
    };
  }
  if (next.schemaVersion < 3) {
    next = {
      ...next,
      schemaVersion: 3,
      engineVersion: next.engineVersion ?? ENGINE_VERSION,
    };
  }
  if (next.schemaVersion < 4) {
    next = migrateSnapshotToSeasonsV4(next);
  }
  if (next.schemaVersion < 5) {
    next = migrateSnapshotToSeasonsV5(next);
  }
  if (next.schemaVersion < 6) {
    next = migrateSnapshotToUndergroundSkyV6(next);
  }
  if (next.schemaVersion < 7) {
    next = migrateSnapshotToPactsEmbassiesV7(next);
  }
  const config = normalizeCurrentSeasonsConfig(next.config);
  const stateConfig = normalizeCurrentSeasonsConfig(next.state.config);
  return {
    ...next,
    config,
    state: { ...next.state, config: stateConfig },
  };
}

/** Applique les règles Saisons actuelles aux sauvegardes, même déjà en schéma 6. */
function normalizeCurrentSeasonsConfig(config: GameConfig): GameConfig {
  const stored = config.extensions?.seasons;
  if (!stored) return config;
  const seasons = defaultSeasonsConfig({
    ...stored,
    enabled: config.mode !== 'classic' && stored.enabled,
  });
  return {
    ...config,
    enableSeasons: seasons.enabled,
    extensions: { ...config.extensions, seasons },
  };
}

function migrateSnapshotToUndergroundSkyV6(snapshot: GameSnapshot): GameSnapshot {
  const config = { ...snapshot.config };
  const extensions = { ...(config.extensions ?? {}) };

  if (config.mode === 'classic') {
    if (extensions.undergroundSky) {
      extensions.undergroundSky = defaultUndergroundSkyConfig({
        ...extensions.undergroundSky,
        enabled: false,
      });
    }
  } else if (extensions.undergroundSky) {
    extensions.undergroundSky = defaultUndergroundSkyConfig({
      ...extensions.undergroundSky,
      enabled: Boolean(extensions.undergroundSky.enabled),
    });
  }

  config.extensions = extensions;
  // Ne pas changer l’objectif effectif ; reconstruire la base en retirant les bonus connus.
  config.baseVictoryPointTarget = reconstructBaseVictoryPointTarget(config);

  // Ne crée pas d’état undergroundSky manquant sauf si déjà enabled (hydratation lazy).
  const state = { ...snapshot.state };
  if (!extensions.undergroundSky?.enabled && state.extensions?.undergroundSky) {
    const { undergroundSky: _drop, ...rest } = state.extensions;
    state.extensions = rest;
  }

  return {
    ...snapshot,
    schemaVersion: 6,
    engineVersion: ENGINE_VERSION,
    config,
    state,
  };
}

/**
 * Schéma 7 : Pactes & Ambassades.
 * Anciennes sauvegardes : aucune activation auto ; Diplomatie/Conseil restent legacy.
 */
function migrateSnapshotToPactsEmbassiesV7(snapshot: GameSnapshot): GameSnapshot {
  const config = { ...snapshot.config };
  const extensions = { ...(config.extensions ?? {}) };

  if (config.mode === 'classic') {
    if (extensions.pactsEmbassies) {
      extensions.pactsEmbassies = defaultPactsEmbassiesConfig({
        ...extensions.pactsEmbassies,
        enabled: false,
      });
    }
  } else if (extensions.pactsEmbassies) {
    extensions.pactsEmbassies = defaultPactsEmbassiesConfig({
      ...extensions.pactsEmbassies,
      enabled: Boolean(extensions.pactsEmbassies.enabled),
    });
  }

  config.extensions = extensions;
  if (typeof config.baseVictoryPointTarget !== 'number') {
    config.baseVictoryPointTarget = reconstructBaseVictoryPointTarget(config);
  }

  const state = { ...snapshot.state };
  if (!extensions.pactsEmbassies?.enabled && state.extensions?.pactsEmbassies) {
    const { pactsEmbassies: _drop, ...rest } = state.extensions;
    state.extensions = rest;
  }

  return {
    ...snapshot,
    schemaVersion: 7,
    engineVersion: ENGINE_VERSION,
    config,
    state,
  };
}

function migrateSnapshotToSeasonsV5(snapshot: GameSnapshot): GameSnapshot {
  const config = { ...snapshot.config };
  if (config.extensions?.seasons) {
    const seasonsConfig = defaultSeasonsConfig({
      enabled: config.mode !== 'classic' && config.extensions.seasons.enabled,
    });
    config.extensions = {
      ...config.extensions,
      seasons: seasonsConfig,
    };
    config.enableSeasons = seasonsConfig.enabled;
  }

  return {
    ...snapshot,
    schemaVersion: 5,
    engineVersion: ENGINE_VERSION,
    config,
  };
}

function migrateSnapshotToSeasonsV4(snapshot: GameSnapshot): GameSnapshot {
  const config = { ...snapshot.config };
  const legacyEnabled =
    Boolean(config.enableSeasons) || Boolean(config.extensions?.seasons?.enabled);

  if (config.mode === 'classic') {
    config.enableSeasons = false;
    const { seasons: _legacySeasons, ...classicExtensions } = config.extensions ?? {};
    config.extensions = classicExtensions;
  } else if (legacyEnabled) {
    config.enableSeasons = true;
    config.extensions = {
      ...config.extensions,
      seasons: defaultSeasonsConfig({
        ...config.extensions?.seasons,
        enabled: true,
      }),
    };
  } else {
    config.enableSeasons = false;
    config.extensions = {
      ...config.extensions,
      seasons: config.extensions?.seasons
        ? defaultSeasonsConfig(config.extensions.seasons)
        : undefined,
    };
  }

  let state = { ...snapshot.state };
  if (config.extensions?.seasons?.enabled) {
    const clock = migrateLegacySeasonClock({
      season: state.season,
      seasonTurn: state.seasonTurn,
      year: state.year,
    });
    const playerIds = (state.turnOrder as string[]) ?? [];
    const existing = state.extensions?.seasons;
    const currentClimateId =
      (existing?.currentClimateId as SeasonClimateId | undefined) ?? clock.currentClimateId;
    const forecastSeason = nextSeason(clock.currentSeason);
    const forecastClimateId =
      (existing?.forecastClimateId as SeasonClimateId | undefined) ??
      LEGACY_SEASON_TO_CLIMATE[forecastSeason];

    const decks = createSeasonDecks(config.mapSeed ?? 0);
    const discards = emptySeasonDiscards();
    const pull = (season: Season, id: SeasonClimateId) => {
      const idx = decks[season].indexOf(id);
      if (idx >= 0) {
        decks[season] = [...decks[season].slice(0, idx), ...decks[season].slice(idx + 1)];
      }
    };
    pull(clock.currentSeason, currentClimateId);
    pull(forecastSeason, forecastClimateId);

    const preparations: Record<string, 'reserve'> = {};
    const nextPreparations: Record<string, null> = {};
    const preparationTargets: Record<string, null> = {};
    const nextPreparationTargets: Record<string, null> = {};
    const preparationReady: Record<string, boolean> = {};
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

    state = {
      ...state,
      season: clock.currentSeason,
      seasonTurn: clock.roundInSeason,
      extensions: {
        ...state.extensions,
        seasons: {
          currentSeason: clock.currentSeason,
          roundInSeason: clock.roundInSeason,
          seasonYear: existing?.seasonYear ?? 1,
          currentClimateId,
          forecastClimateId,
          decks: existing?.decks ?? decks,
          discards: existing?.discards ?? discards,
          severeClimatesThisYear: existing?.severeClimatesThisYear ?? 0,
          previousClimateWasSevere:
            existing?.previousClimateWasSevere ??
            getClimateDefinition(currentClimateId).severity === 'severe',
          preparations: existing?.preparations ?? preparations,
          nextPreparations: existing?.nextPreparations ?? nextPreparations,
          preparationTargets: existing?.preparationTargets ?? preparationTargets,
          nextPreparationTargets:
            existing?.nextPreparationTargets ?? nextPreparationTargets,
          preparationReady: existing?.preparationReady ?? preparationReady,
          preparationUses: existing?.preparationUses ?? preparationUses,
          climateUses: existing?.climateUses ?? climateUses,
          climateGlobalUses: existing?.climateGlobalUses ?? emptyClimateUsage(),
          history: existing?.history?.length
            ? existing.history
            : [
                {
                  seasonYear: 1,
                  season: clock.currentSeason,
                  climateId: currentClimateId,
                  severity: getClimateDefinition(currentClimateId).severity,
                },
              ],
          preparationWindowOpen: existing?.preparationWindowOpen ?? false,
          springPrepPending: existing?.springPrepPending ?? true,
        },
      },
    };
  }

  return {
    ...snapshot,
    schemaVersion: 4,
    engineVersion: snapshot.engineVersion ?? ENGINE_VERSION,
    config,
    state,
  };
}

/** Migration minimale depuis une sauvegarde legacy (sans schemaVersion). */
export function migrateLegacySave(raw: string): GameSnapshot {
  const parsed = JSON.parse(raw) as Record<string, unknown>;
  if (parsed.schemaVersion !== undefined) {
    return migrateSnapshot(parsed as unknown as GameSnapshot);
  }

  const state = parsed as unknown as SerializedGameState;
  const config = (state.config ?? parsed.config) as GameConfig;
  return {
    schemaVersion: SCHEMA_VERSION,
    engineVersion: ENGINE_VERSION,
    config,
    state: state.map ? state : (parsed as unknown as SerializedGameState),
    commandLog: [],
    randomSeed: config?.mapSeed ?? 0,
    savedAt: (parsed.updatedAt as number) ?? now(),
  };
}

export { serializeMaps, deserializeMaps };

import { GameConfig, GameMode, MapSize, VictoryCondition } from '../types/game';
import { now } from './clock';
import { defaultSeasonsConfig } from '../types/seasons';

export type GamePreset = 'classic' | 'catanx' | 'custom' | 'scenario';

export interface GameModules {
  events: boolean;
  technologies: boolean;
  armies: boolean;
  diplomacy: boolean;
  productionChains: boolean;
  worldCouncil: boolean;
  barbarians: boolean;
  fogOfWar: boolean;
}

export interface GameRules {
  mapSize: MapSize;
  playerCount: number;
  victoryConditions: VictoryCondition[];
  victoryPointTarget: number;
  maxTurns: number;
  startingResources: GameConfig['startingResources'];
  difficultyModifier: number;
}

export interface PresetDefinition {
  preset: GamePreset;
  mode: GameMode;
  modules: GameModules;
  rules: GameRules;
}

export const CLASSIC_PRESET: PresetDefinition = {
  preset: 'classic',
  mode: 'classic',
  modules: {
    events: false,
    technologies: false,
    armies: false,
    diplomacy: false,
    productionChains: false,
    worldCouncil: false,
    barbarians: false,
    fogOfWar: false,
  },
  rules: {
    mapSize: 'tiny',
    playerCount: 4,
    victoryConditions: ['points'],
    victoryPointTarget: 10,
    maxTurns: 0,
    startingResources: 'none',
    difficultyModifier: 1,
  },
};

export const CATANX_PRESET: PresetDefinition = {
  preset: 'catanx',
  mode: 'standard',
  modules: {
    events: true,
    technologies: true,
    armies: true,
    diplomacy: true,
    productionChains: false,
    worldCouncil: true,
    barbarians: true,
    fogOfWar: true,
  },
  rules: {
    mapSize: 'medium',
    playerCount: 4,
    victoryConditions: ['points'],
    victoryPointTarget: 15,
    maxTurns: 0,
    startingResources: 'none',
    difficultyModifier: 1,
  },
};

export const PRESET_CATALOG: Record<GamePreset, PresetDefinition | null> = {
  classic: CLASSIC_PRESET,
  catanx: CATANX_PRESET,
  custom: null,
  scenario: null,
};

export function buildGameConfigFromPreset(
  preset: GamePreset,
  overrides: Partial<GameConfig> = {},
  modulesOverride?: Partial<GameModules>,
  rulesOverride?: Partial<GameRules>,
): GameConfig {
  const base = PRESET_CATALOG[preset] ?? CLASSIC_PRESET;
  const modules = { ...base.modules, ...modulesOverride };
  const rules = { ...base.rules, ...rulesOverride };
  const mode = overrides.mode ?? base.mode;
  const isClassic = mode === 'classic';

  const seasonsOverride = overrides.extensions?.seasons;
  const seasonsEnabled = isClassic
    ? false
    : (seasonsOverride?.enabled ?? (preset === 'catanx' || Boolean(overrides.enableSeasons)));

  const seasonsConfig = defaultSeasonsConfig({
    ...seasonsOverride,
    enabled: seasonsEnabled,
  });

  const config: GameConfig = {
    mode,
    mapSize: overrides.mapSize ?? rules.mapSize,
    mapSeed: overrides.mapSeed ?? now() % 1_000_000,
    playerCount: overrides.playerCount ?? rules.playerCount,
    victoryConditions: overrides.victoryConditions ?? rules.victoryConditions,
    victoryPointTarget: overrides.victoryPointTarget ?? rules.victoryPointTarget,
    maxTurns: overrides.maxTurns ?? rules.maxTurns,
    enableSeasons: seasonsEnabled,
    enableEvents: overrides.enableEvents ?? modules.events,
    enableDiplomacy: overrides.enableDiplomacy ?? modules.diplomacy,
    enableMilitary: overrides.enableMilitary ?? modules.armies,
    enableTechTree: overrides.enableTechTree ?? modules.technologies,
    enableProductionChains: overrides.enableProductionChains ?? modules.productionChains,
    fogOfWar: overrides.fogOfWar ?? modules.fogOfWar,
    startingResources: overrides.startingResources ?? rules.startingResources,
    barbarianStrength: overrides.barbarianStrength ?? {
      enabled: modules.barbarians,
      spawnRate: 8,
      strength: 3,
      scaling: true,
      navalBarbarians: false,
    },
    worldCouncil: overrides.worldCouncil ?? modules.worldCouncil,
    difficultyModifier: overrides.difficultyModifier ?? rules.difficultyModifier,
    pacingPreset: overrides.pacingPreset ?? (preset === 'catanx' ? 'tabletop' : 'dynamic'),
    classicBoardLayout: overrides.classicBoardLayout,
    extensions: {
      ...overrides.extensions,
      seasons: seasonsConfig,
    },
  };

  return config;
}

export function modulesFromConfig(config: GameConfig): GameModules {
  return {
    events: config.enableEvents,
    technologies: config.enableTechTree,
    armies: config.enableMilitary,
    diplomacy: config.enableDiplomacy,
    productionChains: config.enableProductionChains,
    worldCouncil: config.worldCouncil,
    barbarians: config.barbarianStrength.enabled,
    fogOfWar: config.fogOfWar,
  };
}

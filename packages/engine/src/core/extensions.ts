/**
 * Registre des extensions (parallèle à MODULE_REGISTRY, non fusionné).
 */
import type { GameConfig } from '../types/game';
import type {
  CitiesKnightsConfig,
  GameExtensionsConfig,
} from '../types/citiesKnights';
import { defaultCitiesKnightsConfig } from '../types/citiesKnights';
import type { SeasonsConfig } from '../types/seasons';
import { defaultSeasonsConfig } from '../types/seasons';
import type { UndergroundSkyConfig } from '../types/undergroundSky';
import { defaultUndergroundSkyConfig } from '../types/undergroundSky';
import type { PactsEmbassiesConfig } from '../types/pactsEmbassies';
import { defaultPactsEmbassiesConfig } from '../types/pactsEmbassies';

export type ExtensionId =
  | 'citiesKnights'
  | 'seasons'
  | 'undergroundSky'
  | 'pactsEmbassies';

export interface ExtensionDefinition {
  id: ExtensionId;
  label: string;
  description: string;
  /** Bonus PV appliqué à la création si l’extension est activée. */
  victoryPointBonus: number;
  /** Indisponible en mode classique pur. */
  catanxOnly: boolean;
}

export const EXTENSION_REGISTRY: ExtensionDefinition[] = [
  {
    id: 'citiesKnights',
    label: 'Villes & Chevaliers',
    description:
      'Marchandises, chevaliers, barbares et cartes Progrès. Objectif +3 PV. Compatible avec tous les modules.',
    victoryPointBonus: 3,
    catanxOnly: false,
  },
  {
    id: 'seasons',
    label: 'Saisons',
    description:
      'Climats publics, abondance et préparations. Identité CatanX — indisponible en Classique pur.',
    victoryPointBonus: 0,
    catanxOnly: true,
  },
  {
    id: 'undergroundSky',
    label: 'Souterrain & Ciel',
    description:
      'Réseaux souterrain et céleste, Cristal et Éther, contrats aériens. Objectif +5 PV. Identité CatanX.',
    victoryPointBonus: 5,
    catanxOnly: true,
  },
  {
    id: 'pactsEmbassies',
    label: 'Pactes & Ambassades',
    description:
      'Diplomatie vérifiable : ambassades, pactes, Conseil mondial et mandats. Objectif +3 PV. Identité CatanX.',
    victoryPointBonus: 3,
    catanxOnly: true,
  },
];

export function normalizeExtensionsConfig(
  extensions?: GameExtensionsConfig | null,
  opts?: { mode?: GameConfig['mode'] },
): GameExtensionsConfig {
  if (!extensions) return {};
  const out: GameExtensionsConfig = {};
  if (extensions.citiesKnights) {
    out.citiesKnights = defaultCitiesKnightsConfig(extensions.citiesKnights);
  }
  if (extensions.seasons) {
    if (opts?.mode === 'classic') {
      out.seasons = defaultSeasonsConfig({ ...extensions.seasons, enabled: false });
    } else {
      out.seasons = defaultSeasonsConfig(extensions.seasons);
    }
  }
  if (extensions.undergroundSky) {
    if (opts?.mode === 'classic') {
      out.undergroundSky = defaultUndergroundSkyConfig({
        ...extensions.undergroundSky,
        enabled: false,
      });
    } else {
      out.undergroundSky = defaultUndergroundSkyConfig(extensions.undergroundSky);
    }
  }
  if (extensions.pactsEmbassies) {
    if (opts?.mode === 'classic') {
      out.pactsEmbassies = defaultPactsEmbassiesConfig({
        ...extensions.pactsEmbassies,
        enabled: false,
      });
    } else {
      out.pactsEmbassies = defaultPactsEmbassiesConfig(extensions.pactsEmbassies);
    }
  }
  return out;
}

export function isCitiesKnightsEnabled(
  configOrState: GameConfig | { config: GameConfig },
): boolean {
  const config = 'config' in configOrState ? configOrState.config : configOrState;
  return Boolean(config.extensions?.citiesKnights?.enabled);
}

export function isSeasonsEnabled(
  configOrState: GameConfig | { config: GameConfig },
): boolean {
  const config = 'config' in configOrState ? configOrState.config : configOrState;
  if (config.mode === 'classic') return false;
  if (config.extensions?.seasons?.enabled) return true;
  return Boolean(config.enableSeasons);
}

export function isUndergroundSkyEnabled(
  configOrState: GameConfig | { config: GameConfig },
): boolean {
  const config = 'config' in configOrState ? configOrState.config : configOrState;
  if (config.mode === 'classic') return false;
  return Boolean(config.extensions?.undergroundSky?.enabled);
}

export function isPactsEmbassiesEnabled(
  configOrState: GameConfig | { config: GameConfig },
): boolean {
  const config = 'config' in configOrState ? configOrState.config : configOrState;
  if (config.mode === 'classic') return false;
  return Boolean(config.extensions?.pactsEmbassies?.enabled);
}

export function getCitiesKnightsConfig(config: GameConfig): CitiesKnightsConfig | null {
  if (!config.extensions?.citiesKnights?.enabled) return null;
  return defaultCitiesKnightsConfig(config.extensions.citiesKnights);
}

export function getSeasonsExtensionConfig(config: GameConfig): SeasonsConfig | null {
  if (config.mode === 'classic') return null;
  if (config.extensions?.seasons?.enabled) {
    return defaultSeasonsConfig(config.extensions.seasons);
  }
  if (config.enableSeasons) {
    return defaultSeasonsConfig({ enabled: true });
  }
  return null;
}

export function getUndergroundSkyConfig(config: GameConfig): UndergroundSkyConfig | null {
  if (config.mode === 'classic') return null;
  if (!config.extensions?.undergroundSky?.enabled) return null;
  return defaultUndergroundSkyConfig(config.extensions.undergroundSky);
}

export function getPactsEmbassiesConfig(config: GameConfig): PactsEmbassiesConfig | null {
  if (config.mode === 'classic') return null;
  if (!config.extensions?.pactsEmbassies?.enabled) return null;
  return defaultPactsEmbassiesConfig(config.extensions.pactsEmbassies);
}

/** Somme des bonus VP des extensions activées (une seule fois). */
export function sumExtensionVictoryBonuses(config: GameConfig): number {
  let bonus = 0;
  if (isCitiesKnightsEnabled(config)) {
    const ck = defaultCitiesKnightsConfig(config.extensions?.citiesKnights);
    bonus += ck.victoryPointBonus;
  }
  if (isUndergroundSkyEnabled(config)) {
    const us = defaultUndergroundSkyConfig(config.extensions?.undergroundSky);
    bonus += us.victoryPointBonus;
  }
  if (isPactsEmbassiesEnabled(config)) {
    const pe = defaultPactsEmbassiesConfig(config.extensions?.pactsEmbassies);
    bonus += pe.victoryPointBonus;
  }
  return bonus;
}

/** Objectif effectif = base + bonus extensions. */
export function computeVictoryPointTarget(
  baseTarget: number,
  extensions?: GameExtensionsConfig | null,
  mode?: GameConfig['mode'],
): number {
  const normalized = normalizeExtensionsConfig(extensions, { mode });
  const probe: GameConfig = {
    mode: mode ?? 'standard',
    mapSize: 'tiny',
    mapSeed: 0,
    playerCount: 4,
    victoryConditions: ['points'],
    victoryPointTarget: baseTarget,
    maxTurns: 0,
    enableSeasons: false,
    enableEvents: false,
    enableDiplomacy: false,
    enableMilitary: false,
    enableTechTree: false,
    enableProductionChains: false,
    fogOfWar: false,
    startingResources: 'none',
    barbarianStrength: {
      enabled: false,
      spawnRate: 0,
      strength: 0,
      scaling: false,
      navalBarbarians: false,
    },
    worldCouncil: false,
    difficultyModifier: 1,
    extensions: normalized,
  };
  return baseTarget + sumExtensionVictoryBonuses(probe);
}

/** Détail lobby : chaque bonus séparément. */
export function listVictoryPointBonuses(config: GameConfig): Array<{
  id: ExtensionId;
  label: string;
  bonus: number;
}> {
  const out: Array<{ id: ExtensionId; label: string; bonus: number }> = [];
  for (const def of EXTENSION_REGISTRY) {
    if (def.victoryPointBonus <= 0) continue;
    const enabled =
      def.id === 'citiesKnights'
        ? isCitiesKnightsEnabled(config)
        : def.id === 'undergroundSky'
          ? isUndergroundSkyEnabled(config)
          : def.id === 'pactsEmbassies'
            ? isPactsEmbassiesEnabled(config)
            : false;
    if (!enabled) continue;
    out.push({ id: def.id, label: def.label, bonus: def.victoryPointBonus });
  }
  return out;
}

/** Objectif de victoire stocké (inclut les bonus après createGame). */
export function effectiveVictoryPointTarget(config: GameConfig): number {
  return config.victoryPointTarget;
}

/**
 * Aperçu lobby : base + bonus, sans muter la config.
 * @deprecated Préférer computeVictoryPointTarget / listVictoryPointBonuses.
 */
export function previewVictoryPointTarget(
  baseTarget: number,
  citiesKnightsEnabled: boolean,
  bonus = 3,
  undergroundSkyEnabled = false,
  undergroundSkyBonus = 5,
  pactsEmbassiesEnabled = false,
  pactsEmbassiesBonus = 3,
): number {
  let total = baseTarget;
  if (citiesKnightsEnabled) total += bonus;
  if (undergroundSkyEnabled) total += undergroundSkyBonus;
  if (pactsEmbassiesEnabled) total += pactsEmbassiesBonus;
  return total;
}

/**
 * Applique tous les bonus VP une fois à la création de partie.
 * Pose `baseVictoryPointTarget` puis `victoryPointTarget = base + sum`.
 */
export function applyExtensionVictoryBonuses(config: GameConfig): GameConfig {
  const base =
    config.baseVictoryPointTarget ?? config.victoryPointTarget;
  const normalized = normalizeExtensionsConfig(config.extensions, {
    mode: config.mode,
  });
  const withExt: GameConfig = {
    ...config,
    extensions: normalized,
    baseVictoryPointTarget: base,
  };
  const bonus = sumExtensionVictoryBonuses(withExt);
  return {
    ...withExt,
    victoryPointTarget: base + bonus,
  };
}

/**
 * @deprecated Préférer applyExtensionVictoryBonuses.
 */
export function applyCitiesKnightsVictoryBonus(config: GameConfig): GameConfig {
  return applyExtensionVictoryBonuses(config);
}

/**
 * Synchronise enableSeasons déprécié depuis extensions.seasons.
 */
export function syncDeprecatedEnableSeasons(config: GameConfig): GameConfig {
  const seasonsEnabled =
    config.mode !== 'classic' && Boolean(config.extensions?.seasons?.enabled);
  return {
    ...config,
    enableSeasons: seasonsEnabled,
  };
}

/**
 * Miroirs dépréciés : nouveaux jeux PE activent enableDiplomacy + worldCouncil.
 * Les moteurs PE ne consultent jamais enableTechTree / enableMilitary.
 */
export function syncDeprecatedDiplomacyMirrors(config: GameConfig): GameConfig {
  if (!isPactsEmbassiesEnabled(config)) return config;
  return {
    ...config,
    enableDiplomacy: true,
    worldCouncil: true,
  };
}

/**
 * Reconstruit baseVictoryPointTarget depuis un objectif effectif déjà bonusé
 * (migration schéma 6+) en retirant les bonus connus.
 */
export function reconstructBaseVictoryPointTarget(config: GameConfig): number {
  if (typeof config.baseVictoryPointTarget === 'number') {
    return config.baseVictoryPointTarget;
  }
  let base = config.victoryPointTarget;
  if (config.extensions?.citiesKnights?.enabled) {
    base -= defaultCitiesKnightsConfig(config.extensions.citiesKnights).victoryPointBonus;
  }
  if (config.extensions?.undergroundSky?.enabled) {
    base -= defaultUndergroundSkyConfig(config.extensions.undergroundSky).victoryPointBonus;
  }
  if (config.extensions?.pactsEmbassies?.enabled) {
    base -= defaultPactsEmbassiesConfig(config.extensions.pactsEmbassies).victoryPointBonus;
  }
  return Math.max(1, base);
}

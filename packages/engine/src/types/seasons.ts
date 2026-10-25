/**
 * Extension Saisons CatanX (`seasons`).
 * Types isolés — effets numériques uniquement via définitions data-driven.
 */

import type { Season } from './events';

/** Cinq ressources classiques — évite un import circulaire avec ClassicBoard. */
export type SeasonClassicResource = 'wood' | 'clay' | 'wheat' | 'sheep' | 'ore';

export type ClimateSeverity = 'standard' | 'severe';

/**
 * Identifiants stables des préparations. Les quatre premiers sont conservés
 * pour garantir la compatibilité des sauvegardes V2 ; leurs noms joueurs sont
 * désormais Adaptation, Caravane, Réserves et Mobilisation.
 */
export type SeasonPreparation = 'harvest' | 'commerce' | 'reserve' | 'works' | 'shelter';

export const SEASON_ROUNDS_PER_SEASON = 5 as const;
export type SeasonRound = 1 | 2 | 3 | 4 | 5;

export type SeasonClimateId =
  // Printemps
  | 'spring_gentle_renewal'
  | 'spring_flower_mists'
  | 'spring_great_thaw'
  | 'spring_march_winds'
  | 'spring_floods'
  // Été
  | 'summer_golden'
  | 'summer_hot_storms'
  | 'summer_etesian'
  | 'summer_drought'
  | 'summer_heatwave'
  // Automne
  | 'autumn_golden_harvest'
  | 'autumn_great_fairs'
  | 'autumn_russet_rains'
  | 'autumn_transhumance'
  | 'autumn_equinox_storm'
  // Hiver
  | 'winter_clear_frost'
  | 'winter_mineral_night'
  | 'winter_merchant'
  | 'winter_deep_snows'
  | 'winter_announced_blizzard';

/** Effet de règle data-driven — interprété par SeasonSystem, jamais dans l’UI. */
export type SeasonRuleEffect =
  | { kind: 'hand_limit_delta'; delta: number }
  | {
      kind: 'city_production_penalty';
      resources: readonly SeasonClassicResource[] | 'all_classic';
      amount: number;
    }
  | {
      kind: 'all_build_cost_delta';
      building: 'road' | 'wall' | 'city';
      resource: SeasonClassicResource;
      delta: number;
    }
  | { kind: 'generic_port_ratio'; ratio: number }
  /** Premier bonus d’abondance du climat : +amount (défaut 2) au lieu de +1. */
  | { kind: 'generous_abundance_once'; amount?: number };

export interface SeasonsConfig {
  enabled: boolean;
  ruleset: 'catanx-seasons-v2';
  roundsPerSeason: typeof SEASON_ROUNDS_PER_SEASON;
  forecastDepth: 1;
  preparationMode: 'secret-simultaneous';
  maxSeverePerYear: 2;
  allowConsecutiveSevere: false;
}

export interface SeasonClimateDefinition {
  id: SeasonClimateId;
  season: Season;
  severity: ClimateSeverity;
  /** Deux ressources favorisées, ordre = priorité publique. */
  favoredResources: readonly [SeasonClassicResource, SeasonClassicResource];
  effects: readonly SeasonRuleEffect[];
  labelFr: string;
  summaryFr: string;
}

export interface SeasonPreparationUsage {
  harvestUsed: boolean;
  commerceUsed: boolean;
  worksUsed: boolean;
  shelterUsed: boolean;
}

export interface SeasonClimateUsage {
  firstSeasonalBonusClaimed: boolean;
  firstSettlementBuilt: boolean;
  firstCityBuilt: boolean;
  firstRoadBuilt: boolean;
  firstWallBuilt: boolean;
  firstTradeImproved: boolean;
  firstKnightActivated: boolean;
  firstBarbarianShipResolved: boolean;
  simultaneousFavoredBothClaimed: boolean;
}

export interface SeasonHistoryEntry {
  seasonYear: number;
  season: Season;
  climateId: SeasonClimateId;
  severity: ClimateSeverity;
}

export interface SeasonsState {
  currentSeason: Season;
  roundInSeason: SeasonRound;
  seasonYear: number;
  currentClimateId: SeasonClimateId;
  forecastClimateId: SeasonClimateId;
  decks: Record<Season, SeasonClimateId[]>;
  discards: Record<Season, SeasonClimateId[]>;
  severeClimatesThisYear: number;
  previousClimateWasSevere: boolean;
  preparations: Record<string, SeasonPreparation>;
  nextPreparations: Record<string, SeasonPreparation | null>;
  /** Ressource choisie pour Adaptation (harvest), courante puis prochaine. */
  preparationTargets: Record<string, SeasonClassicResource | null>;
  nextPreparationTargets: Record<string, SeasonClassicResource | null>;
  /** Statut public uniquement : le contenu du choix reste privé. */
  preparationReady: Record<string, boolean>;
  preparationUses: Record<string, SeasonPreparationUsage>;
  climateUses: Record<string, SeasonClimateUsage>;
  /** Compteurs globaux de climat courant (ex. premier navire barbare). */
  climateGlobalUses: SeasonClimateUsage;
  history: SeasonHistoryEntry[];
  /** Fenêtre de choix des préparations suivantes (ronde 5). */
  preparationWindowOpen: boolean;
  /** Après placement initial : choix préparation printemps. */
  springPrepPending: boolean;
}

export const SEASON_ORDER: readonly Season[] = ['spring', 'summer', 'autumn', 'winter'] as const;

export const SEASON_PREPARATIONS: readonly SeasonPreparation[] = [
  'harvest',
  'commerce',
  'reserve',
  'works',
  'shelter',
] as const;

export function defaultSeasonsConfig(partial?: Partial<SeasonsConfig>): SeasonsConfig {
  return {
    enabled: partial?.enabled ?? false,
    ruleset: 'catanx-seasons-v2',
    roundsPerSeason: SEASON_ROUNDS_PER_SEASON,
    forecastDepth: 1,
    preparationMode: 'secret-simultaneous',
    maxSeverePerYear: 2,
    allowConsecutiveSevere: false,
  };
}

export function emptyPreparationUsage(): SeasonPreparationUsage {
  return {
    harvestUsed: false,
    commerceUsed: false,
    worksUsed: false,
    shelterUsed: false,
  };
}

export function emptyClimateUsage(): SeasonClimateUsage {
  return {
    firstSeasonalBonusClaimed: false,
    firstSettlementBuilt: false,
    firstCityBuilt: false,
    firstRoadBuilt: false,
    firstWallBuilt: false,
    firstTradeImproved: false,
    firstKnightActivated: false,
    firstBarbarianShipResolved: false,
    simultaneousFavoredBothClaimed: false,
  };
}

/** Mapping legacy season → climat standard le plus proche. */
export const LEGACY_SEASON_TO_CLIMATE: Record<Season, SeasonClimateId> = {
  spring: 'spring_gentle_renewal',
  summer: 'summer_golden',
  autumn: 'autumn_golden_harvest',
  winter: 'winter_clear_frost',
};

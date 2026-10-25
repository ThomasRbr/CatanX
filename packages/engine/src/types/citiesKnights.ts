/**
 * Extension Villes & Chevaliers (`citiesKnights`).
 * Types isolés des modules Armées / Barbares / Technologies / industrie.
 */
import type { ResourceType } from './resources';

/** Marchandises C&K — distinctes de `paper` / `cloth` / `coins` industriels. */
export type CkCommodity = 'ck_paper' | 'ck_cloth' | 'ck_coin';

export type CkCommodityBundle = Partial<Record<CkCommodity, number>>;

export const CK_COMMODITIES: readonly CkCommodity[] = [
  'ck_paper',
  'ck_cloth',
  'ck_coin',
] as const;

/** Faces du dé Événement (3 navires + 3 portes). */
export type CkEventDie =
  | 'barbarian_ship'
  | 'trade_gate'
  | 'politics_gate'
  | 'science_gate';

export type CkUrbanTrack = 'trade' | 'politics' | 'science';

export type CkKnightRank = 1 | 2 | 3;

export interface CkKnight {
  id: string;
  ownerId: string;
  rank: CkKnightRank;
  activated: boolean;
  /** Intersection topologique (`intersectionId` / nodeId). */
  intersectionId: string | null;
  /** Activé ce tour → actions seulement au prochain tour du propriétaire. */
  activatedThisTurn: boolean;
  promotedThisTurn: boolean;
}

export type CkProgressDeckId = 'trade' | 'politics' | 'science';

/** Effets essentiels (6 × 3 exemplaires = 18 par deck). */
export type CkProgressCardType =
  // Commerce
  | 'merchant'
  | 'merchant_fleet'
  | 'trade_harbor'
  | 'resource_monopoly'
  | 'commodity_monopoly'
  | 'master_merchant'
  // Politique
  | 'bishop'
  | 'diplomat'
  | 'intrigue'
  | 'deserter'
  | 'spy'
  | 'warlord'
  // Science
  | 'alchemist'
  | 'crane'
  | 'engineer'
  | 'inventor'
  | 'road_building'
  | 'smith';

export interface CkProgressCard {
  id: string;
  type: CkProgressCardType;
  deck: CkProgressDeckId;
}

/** Conséquences visibles d'une carte Progrès pour un joueur donné. */
export interface CkProgressPlayerImpact {
  resourceDelta: Partial<Record<ResourceType, number>>;
  commodityDelta: CkCommodityBundle;
  progressCardDelta: number;
  roadsRemoved: number;
  roadsAdded: number;
  knightsRemoved: number;
  knightsAdded: number;
  knightsMoved: number;
  knightsActivated: number;
  knightsPromoted: number;
}

/**
 * Bilan autoritaire d'une carte jouée. Les `impacts` sont filtrés par
 * `privateView` afin qu'un observateur ne voie jamais les pertes privées.
 */
export interface CkProgressPlayImpact {
  version: 1;
  cardType: CkProgressCardType;
  deck: CkProgressDeckId;
  targetPlayerIds: string[];
  choice?: {
    resource?: ResourceType;
    commodity?: CkCommodity;
  };
  impacts: Record<string, CkProgressPlayerImpact>;
}

export interface CkUrbanLevels {
  trade: number;
  politics: number;
  science: number;
}

/** Propriétaire de métropole + intersection hôte (ville). */
export interface CkMetropolisSlot {
  ownerId: string | null;
  intersectionId: string | null;
}

export interface CkPendingResolution {
  id: string;
  kind: string;
  playerId: string;
  data?: Record<string, unknown>;
}

export interface CitiesKnightsConfig {
  enabled: boolean;
  ruleset: 'catanx-essential-v1';
  victoryPointBonus: 3;
  adaptiveBarbarianTrack: true;
}

import type { SeasonsConfig } from './seasons';
import type { UndergroundSkyConfig } from './undergroundSky';
import type { PactsEmbassiesConfig } from './pactsEmbassies';

export interface GameExtensionsConfig {
  citiesKnights?: CitiesKnightsConfig;
  seasons?: SeasonsConfig;
  undergroundSky?: UndergroundSkyConfig;
  pactsEmbassies?: PactsEmbassiesConfig;
}

export interface CitiesKnightsState {
  /** Stocks banque de marchandises. */
  commodityBank: Record<CkCommodity, number>;
  /** Mains privées de marchandises. */
  playerCommodities: Record<string, CkCommodityBundle>;
  /** Compteurs publics (vues adverses). */
  publicCommodityCounts: Record<string, number>;
  /** Mains Progress privées. */
  progressHands: Record<string, CkProgressCard[]>;
  publicProgressCounts: Record<string, number>;
  progressDecks: Record<CkProgressDeckId, CkProgressCard[]>;
  /** Défausse Progress (reshuffle quand le deck est vide). */
  progressDiscards: Record<CkProgressDeckId, CkProgressCard[]>;
  /** Piste barbare C&K (pas BarbarianSystem). */
  barbarianTrackPosition: number;
  barbarianTrackLength: number;
  /** Après la 1re invasion, le brigand devient actif. */
  robberUnlocked: boolean;
  invasionCount: number;
  urbanLevels: Record<string, CkUrbanLevels>;
  metropolises: Record<CkUrbanTrack, CkMetropolisSlot>;
  /** intersectionId → playerId */
  walls: Record<string, string>;
  knights: CkKnight[];
  /** Jetons hors plateau restants (2/2/2). */
  knightStocks: Record<
    string,
    { basic: number; strong: number; mighty: number }
  >;
  merchant: { tileId: string | null; ownerId: string | null };
  /** Buffs temporaires Progress (tour / prochain improve). */
  progressBuffs: {
    /** Flotte marchande : 2:1 jusqu’à fin de tour. */
    merchantFleet: {
      playerId: string;
      kind: 'resource' | 'commodity';
      key: string;
    } | null;
    /** Réduction Grue : -1 marchandise sur la prochaine amélioration. */
    craneDiscount: Record<string, number>;
    /** Alchimiste : valeurs des dés numériques au prochain lancer. */
    alchemistDice: { die1: number; die2: number } | null;
  };
  /** PV Défenseur de Catan par joueur. */
  defenderVp: Record<string, number>;
  pendingResolutions: CkPendingResolution[];
  /** Dernier résultat d’invasion (HUD / journal). */
  lastInvasionResult?: {
    turn: number;
    barbarianStrength: number;
    defenseStrength: number;
    outcome: 'defenders_win' | 'barbarians_win';
    defenderVpAwardedTo: string | null;
    progressDrawPlayerIds: string[];
    pillagedPlayerIds: string[];
  };
}

export function defaultCitiesKnightsConfig(
  partial?: Partial<CitiesKnightsConfig>,
): CitiesKnightsConfig {
  return {
    enabled: partial?.enabled ?? false,
    ruleset: 'catanx-essential-v1',
    victoryPointBonus: 3,
    adaptiveBarbarianTrack: true,
  };
}

/** Longueur de piste : round(1.75 × N). */
export function ckBarbarianTrackLength(playerCount: number): number {
  return Math.round(1.75 * Math.max(2, playerCount));
}

/** Stock max par marchandise : max(12, 3 × N). */
export function ckCommodityStockCap(playerCount: number): number {
  return Math.max(12, 3 * Math.max(2, playerCount));
}

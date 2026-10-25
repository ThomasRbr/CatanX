/**
 * Extension Souterrain & Ciel (`undergroundSky`).
 * Types isolés — génération et règles dans engine/undergroundSky/.
 */

import type { ResourceType } from './resources';
import type { CkCommodity } from './citiesKnights';

export type UndergroundSkyMaterial = 'us_crystal' | 'us_aether';
export type UndergroundSkyMaterialBundle = Partial<Record<UndergroundSkyMaterial, number>>;

export interface UndergroundSkyConfig {
  enabled: boolean;
  ruleset: 'catanx-underground-sky-v1';
  victoryPointBonus: 5;
  undergroundGeneration: 'surface-derived';
  skyGeneration: 'adaptive-network';
  flightMode: 'programmed';
  interactionMode: 'soft-competitive';
}

export type UndergroundDiscoveryKind =
  | 'fossil_roots'
  | 'clay_bank'
  | 'fungiculture'
  | 'woolly_lichen'
  | 'iron_vein'
  | 'crystal_geode'
  | 'aether_breath'
  | 'thermal_spring'
  | 'natural_well'
  | 'ancient_workshop'
  | 'sealed_chamber'
  | 'unstable_fault';

export type UndergroundGeologyCategory = 'production' | 'special' | 'danger';

export type SkySiteKind =
  | 'calm_mooring'
  | 'aether_source'
  | 'floating_garden'
  | 'wind_bazaar'
  | 'observatory'
  | 'hanging_ruins'
  | 'turbulent_zone';

export type SkyContractKind =
  | 'supply'
  | 'construction'
  | 'metallurgy'
  | 'craft'
  | 'energy'
  | 'ck_logistics';

export interface UndergroundNode {
  id: string;
  surfaceTileId: string;
  /** Contenu autoritaire (caché jusqu’à révélation). */
  discovery: UndergroundDiscoveryKind;
  numberToken: number | null;
  geologyCategory: UndergroundGeologyCategory;
  /** Arête de surface liée (Puits naturels uniquement). */
  surfaceEdgeId: string | null;
  /** Source thermale : choix définitif après construction. */
  thermalChoice: 'wheat' | 'sheep' | null;
  workshopDiscountClaimed: boolean;
  sealedChamberClaimed: boolean;
}

export interface UndergroundEdge {
  id: string;
  a: string;
  b: string;
}

export interface UndergroundGraph {
  nodes: Record<string, UndergroundNode>;
  edges: Record<string, UndergroundEdge>;
  adjacency: Record<string, string[]>;
}

export interface SkyHub {
  id: string;
  site: SkySiteKind;
  /** Position flottante dérivée (q,r approx surface). */
  anchorTileId: string | null;
  firstVisitorRewards: Record<string, boolean>;
  hangingRuinsClaimed: boolean;
}

export interface SkyLane {
  id: string;
  from: string;
  to: string;
  /** Sens du courant : from → to coûte 1, inverse 2. */
  currentDirection: 'forward' | 'reverse';
}

export interface SkyGraph {
  hubs: Record<string, SkyHub>;
  lanes: Record<string, SkyLane>;
  adjacency: Record<string, string[]>;
}

export interface UndergroundShaft {
  id: string;
  playerId: string;
  intersectionId: string;
  entryNodeId: string;
}

export interface UndergroundTunnel {
  id: string;
  playerId: string;
  edgeId: string;
}

export interface UndergroundOutpost {
  id: string;
  playerId: string;
  nodeId: string;
  upgradedExtractor: boolean;
}

export interface UndergroundLift {
  id: string;
  playerId: string;
  nodeId: string;
  surfaceEdgeId: string;
  roadBuilt: boolean;
}

export interface SkyAirport {
  id: string;
  playerId: string;
  intersectionId: string;
  /** Suspendu si ville CK rétrogradée en colonie. */
  suspended: boolean;
}

export type AirshipCargoItem =
  | { kind: 'resource'; key: ResourceType; amount: number }
  | { kind: 'commodity'; key: CkCommodity; amount: number }
  | { kind: 'material'; key: UndergroundSkyMaterial; amount: number };

export interface SkyAirship {
  id: string;
  playerId: string;
  airportId: string;
  capacity: number;
  moveBudget: number;
  etherSails: boolean;
  reinforcedHold: boolean;
  cargo: AirshipCargoItem[];
  /** Trajet verrouillé ; null = amarré. */
  route: {
    hubPath: string[];
    pathIndex: number;
    remainingPointsThisLeg: number;
    destinationHubId: string;
    etaTurns: number;
    /** Coûts des legs hubPath[i]→hubPath[i+1] (turbulences + remise balise). */
    legCosts: number[];
  } | null;
  currentHubId: string | null;
}

export interface SkyBeacon {
  id: string;
  playerId: string;
  hubId: string;
}

export interface SkyContractRequirement {
  resources?: Partial<Record<ResourceType, number>>;
  commodities?: Partial<Record<CkCommodity, number>>;
  materials?: UndergroundSkyMaterialBundle;
}

export interface SkyContract {
  id: string;
  kind: SkyContractKind;
  isMajor: boolean;
  requirements: SkyContractRequirement;
  /** Destination hint (jardin flottant, etc.) — optionnel. */
  preferredSite?: SkySiteKind | null;
  rewardMaterial: UndergroundSkyMaterial;
  rewardClassicChoices: ResourceType[];
  masteryPoints: number;
  victoryPoints: number;
}

export type UndergroundSkyPendingResolution =
  | {
      kind: 'thermal_output';
      playerId: string;
      outpostId: string;
      nodeId: string;
    }
  | {
      kind: 'discovery_reward';
      playerId: string;
      nodeId: string;
      discovery: UndergroundDiscoveryKind;
      choices: ResourceType[] | UndergroundSkyMaterial[];
    }
  | {
      kind: 'sky_material_choice';
      playerId: string;
      hubId: string;
      choices: UndergroundSkyMaterial[];
    };

export interface UndergroundSkyHistoryEntry {
  turn: number;
  type: string;
  playerId?: string;
  detail?: Record<string, unknown>;
}

export interface UndergroundSkyState {
  materialBank: Record<UndergroundSkyMaterial, number>;
  playerMaterials: Record<string, UndergroundSkyMaterialBundle>;
  publicMaterialCounts: Record<string, number>;

  undergroundGraph: UndergroundGraph;
  revealedUndergroundNodeIds: string[];
  shafts: UndergroundShaft[];
  tunnels: UndergroundTunnel[];
  outposts: UndergroundOutpost[];
  lifts: UndergroundLift[];

  skyGraph: SkyGraph;
  revealedSkyHubIds: string[];
  airports: SkyAirport[];
  airships: SkyAirship[];
  beacons: SkyBeacon[];

  regularContractDeck: SkyContract[];
  majorContractDeck: SkyContract[];
  faceUpRegularContracts: SkyContract[];
  faceUpMajorContract: SkyContract | null;
  completedRegularContracts: Record<string, number>;
  completedMajorContracts: Record<string, string | null>;

  undergroundMasteryOwnerId: string | null;
  skyMasteryOwnerId: string | null;
  perTurnUsage: Record<string, { surveyUsed: boolean }>;
  pendingResolutions: UndergroundSkyPendingResolution[];
  history: UndergroundSkyHistoryEntry[];

  /** Affectations cachées / ordre decks — autoritaire. */
  _secret: {
    /** Ids de contrats déjà réservés en banque. */
    reservedMaterialContractIds: string[];
  };
}

export const US_MATERIALS: readonly UndergroundSkyMaterial[] = [
  'us_crystal',
  'us_aether',
] as const;

export const US_PIECE_LIMITS = {
  shafts: 2,
  tunnels: 15,
  outposts: 5,
  extractors: 2,
  lifts: 2,
  airports: 2,
  airships: 2,
  beacons: 3,
} as const;

/** Capacité de soute : les contrats ordinaires tiennent dans le modèle de base,
 * les contrats majeurs demandent la soute renforcée. */
export const US_AIRSHIP_BASE_CAPACITY = 3;
export const US_AIRSHIP_REINFORCED_CAPACITY = 4;

export function defaultUndergroundSkyConfig(
  partial?: Partial<UndergroundSkyConfig>,
): UndergroundSkyConfig {
  return {
    enabled: partial?.enabled ?? false,
    ruleset: 'catanx-underground-sky-v1',
    victoryPointBonus: 5,
    undergroundGeneration: 'surface-derived',
    skyGeneration: 'adaptive-network',
    flightMode: 'programmed',
    interactionMode: 'soft-competitive',
  };
}

export function emptyMaterialBundle(): UndergroundSkyMaterialBundle {
  return {};
}

export function materialBankSize(playerCount: number): number {
  return Math.max(16, 4 * Math.max(2, playerCount));
}

export function emptyUndergroundGraph(): UndergroundGraph {
  return { nodes: {}, edges: {}, adjacency: {} };
}

export function emptySkyGraph(): SkyGraph {
  return { hubs: {}, lanes: {}, adjacency: {} };
}

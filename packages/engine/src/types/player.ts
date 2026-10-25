// ============================================================
// JOUEUR — Profil complet, stats, état en jeu
// ============================================================

import { ResourceBundle } from './resources';
import { CubeCoord } from './hex';

export type PlayerColor =
  'red' | 'blue' | 'green' | 'orange' | 'purple' | 'white' | 'brown' | 'cyan';

export type PlayerPortraitId =
  | 'navigator'
  | 'architect'
  | 'merchant'
  | 'scholar'
  | 'guardian'
  | 'explorer'
  | 'cartographer'
  | 'diplomat'
  | 'artisan'
  | 'ranger'
  | 'commander'
  | 'astronomer';
export type PlayerAccessoryId =
  | 'none'
  | 'captain'
  | 'laurel'
  | 'monocle'
  | 'hood'
  | 'diadem'
  | 'goggles'
  | 'feather'
  | 'scarf'
  | 'earring'
  | 'headset'
  | 'circlet'
  | 'bandana';
export type PlayerEmblemId =
  | 'compass'
  | 'peak'
  | 'harbor'
  | 'sun'
  | 'oak'
  | 'star'
  | 'anchor'
  | 'wave'
  | 'hammer'
  | 'wheat'
  | 'shield'
  | 'moon';
export type PlayerBannerId =
  | 'tide'
  | 'facets'
  | 'topography'
  | 'rays'
  | 'weave'
  | 'night'
  | 'archipelago'
  | 'harbor_lights'
  | 'aurora'
  | 'sunrise'
  | 'terrazzo'
  | 'blueprint';
export type PlayerFrameId =
  | 'ceramic'
  | 'steel'
  | 'turquoise'
  | 'coral'
  | 'violet'
  | 'obsidian'
  | 'solar'
  | 'jade'
  | 'pearl'
  | 'prism';
export type PlayerTitleId =
  | 'pathfinder'
  | 'master_builder'
  | 'harbor_voice'
  | 'island_scholar'
  | 'catan_guardian'
  | 'first_settler'
  | 'master_cartographer'
  | 'great_diplomat'
  | 'island_artisan'
  | 'frontier_ranger'
  | 'road_commander'
  | 'star_reader';
export type PlayerSkinToneId =
  'porcelain' | 'sand' | 'honey' | 'olive' | 'bronze' | 'cocoa' | 'ebony' | 'rose';
export type PlayerHairColorId =
  'midnight' | 'chestnut' | 'copper' | 'gold' | 'silver' | 'teal' | 'coral' | 'plum';
export type PlayerExpressionId = 'calm' | 'smile' | 'focused' | 'bold' | 'joyful';
export type PlayerOutfitId =
  | 'voyager'
  | 'artisan'
  | 'diplomat'
  | 'scholar'
  | 'guardian'
  | 'nomad'
  | 'harbormaster'
  | 'strategist';
export type PlayerAuraId = 'none' | 'tide' | 'sunrise' | 'ember' | 'aurora' | 'starlight';
export type PlayerCardMaterialId =
  'acrylic' | 'paper' | 'carbon' | 'ceramic' | 'holographic' | 'velvet';
export type PlayerPieceFinishId =
  'matte' | 'gloss' | 'porcelain' | 'metallic' | 'frosted' | 'marbled';
export type PlayerDiceStyleId =
  'classic' | 'navy' | 'turquoise' | 'coral' | 'violet' | 'solar' | 'obsidian' | 'ivory';

/** Identité visuelle publique, sans influence sur les règles. */
export interface PlayerProfile {
  portrait: PlayerPortraitId;
  accessory: PlayerAccessoryId;
  emblem: PlayerEmblemId;
  banner: PlayerBannerId;
  frame: PlayerFrameId;
  title: PlayerTitleId;
  tagline: string;
  pieceColor: PlayerColor;
  /** Champs ajoutés en v2, optionnels pour relire les profils et sauvegardes v1. */
  skinTone?: PlayerSkinToneId;
  hairColor?: PlayerHairColorId;
  expression?: PlayerExpressionId;
  outfit?: PlayerOutfitId;
  aura?: PlayerAuraId;
  cardMaterial?: PlayerCardMaterialId;
  pieceFinish?: PlayerPieceFinishId;
  diceStyle?: PlayerDiceStyleId;
}

export type PlayerType = 'human' | 'ai';

export type AIDifficulty = 'easy' | 'medium' | 'hard' | 'legendary';

export type AIPersonality =
  | 'aggressive' // priorité militaire, expansion rapide
  | 'economic' // priorité commerce et ressources
  | 'scientific' // priorité technologies
  | 'diplomatic' // priorité alliances et négociations
  | 'expansionist' // priorité territoire
  | 'cultural' // priorité culture et foi
  | 'balanced'; // stratégie équilibrée

export type CivilizationType =
  | 'northerners' // Vikings du nord : militaire + maritime
  | 'empire' // Empire romain : infrastructure + légions
  | 'merchants' // République marchande : commerce + finance
  | 'scholars' // Académiciens : science + culture
  | 'nomads' // Nomades : mobilité + pillage
  | 'theocracy' // Théocratie : foi + moral
  | 'engineers' // Ingénieurs : bâtiments + production
  | 'diplomats'; // Diplomates : influence + alliances

export interface PlayerStats {
  // Combat
  militaryStrength: number; // puissance militaire totale
  totalUnits: number;
  battlesWon: number;
  battlesLost: number;
  citiesRazed: number;
  // Économie
  totalResourcesCollected: number;
  totalResourcesTraded: number;
  coinsEarned: number;
  // Territoire
  tilesOwned: number;
  citiesOwned: number;
  settlementsOwned: number;
  // Science
  techsResearched: number;
  currentAge: AgeType;
  // Diplomatie
  alliancesFormed: number;
  treatiesBroken: number;
  // Points
  victoryPoints: number;
  vpBreakdown: VPBreakdown;
}

export interface VPBreakdown {
  settlements: number; // 1 VP par village
  cities: number; // 2 VP par ville
  metropolis: number; // 3 VP par métropole
  longestRoad: number; // 2 VP
  largestArmy: number; // 2 VP
  techCards: number; // VP des cartes technologie
  wonders: number; // VP des merveilles
  objectives: number; // VP des objectifs secrets
  culture: number; // VP accumulés via culture
  faith: number; // VP accumulés via foi
  /** Jetons Défenseur de Catan (extension citiesKnights). */
  defenderOfCatan: number;
  /** Maîtrises + contrat majeur (extension undergroundSky). */
  undergroundSky: number;
  /** Mandats + Haut Chancelier (extension pactsEmbassies). */
  pactsEmbassies: number;
}

export type AgeType = 'stone_age' | 'bronze_age' | 'iron_age' | 'medieval' | 'renaissance';

export interface Player {
  id: string;
  name: string;
  color: PlayerColor;
  type: PlayerType;
  civilization: CivilizationType;
  /** Optionnel pour conserver la compatibilité avec les anciennes sauvegardes. */
  profile?: PlayerProfile;
  aiPersonality?: AIPersonality;
  aiDifficulty?: AIDifficulty;

  // Ressources
  resources: ResourceBundle;
  resourceCap: ResourceBundle; // stockage maximum par ressource
  productionQueue: ProductionOrder[];
  /** Projection privée : taille de main visible aux adversaires. */
  publicResourceCount?: number;
  /** Projection privée : cartes développement non jouées (types masqués). */
  publicDevCardCount?: number;

  // Territoire
  settlements: string[]; // IDs des tuiles avec village
  cities: string[]; // IDs des tuiles avec ville
  metropolis: string[]; // IDs des tuiles avec métropole
  roads: RoadSegment[];
  ownedTiles: string[]; // IDs des tuiles contrôlées

  // Technologies
  researchedTechs: string[]; // IDs des techs débloquées
  currentResearch: string | null; // tech en cours de recherche
  researchProgress: number; // points science accumulés
  researchQueue: string[]; // file d'attente des recherches
  age: AgeType;

  // Militaire
  units: string[]; // IDs des unités
  army: ArmyGroup[]; // groupes d'armées
  militaryCards: string[]; // cartes développement militaire

  // Diplomatie
  relations: Record<string, DiplomaticRelation>; // playerId -> relation
  activeTradeDeals: TradeDeal[];
  diplomaticCards: string[];

  // Cartes de développement
  devCards: DevelopmentCard[];
  devCardsPlayedThisTurn: number;
  freeRoadsRemaining: number;

  // Spécial
  specialAbilities: string[]; // IDs des capacités spéciales de civ
  wonders: string[]; // merveilles construites
  objectives: SecretObjective[]; // objectifs secrets
  ports: string[]; // IDs des ports contrôlés

  // État
  isEliminated: boolean;
  surrenderedTurn?: number;
  stats: PlayerStats;

  // Diplomatie — mémoire des trahisons
  betrayalCount: number; // nombre de fois qu'il a trahi une alliance
  hasBetrayedAlliance: boolean; // flag permanent

  // Abilities — cooldowns
  abilityCooldowns: Partial<Record<string, number>>; // abilityId → tour de fin de cooldown

  // Meta
  turnOrder: number;
  isActive: boolean; // est-ce son tour ?
}

export interface ProductionOrder {
  recipeId: string;
  turnsRemaining: number;
  quantity: number;
}

export interface RoadSegment {
  from: CubeCoord;
  to: CubeCoord;
  type: 'road' | 'bridge' | 'canal' | 'aqueduct';
  level: number; // 1-3, amélioration de la route
}

export interface ArmyGroup {
  id: string;
  name: string;
  unitIds: string[];
  position: CubeCoord;
  isMoving: boolean;
  destination?: CubeCoord;
  morale: number; // 0-100
  experience: number; // points d'expérience
}

export type DiplomaticStatus =
  'war' | 'hostile' | 'neutral' | 'friendly' | 'allied' | 'vassal' | 'overlord';

export interface DiplomaticRelation {
  status: DiplomaticStatus;
  score: number; // -100 à +100
  treaties: Treaty[];
  sharedVision: boolean; // partage de la carte
  openBorders: boolean; // peut traverser le territoire
  militaryAccess: boolean; // peut stationner des troupes
  warDeclaredTurn?: number;
  lastInteractionTurn: number;
  trustHistory: TrustEvent[];
}

export interface Treaty {
  id: string;
  type: TreatyType;
  establishedTurn: number;
  expirationTurn?: number;
  terms: TreatyTerm[];
}

export type TreatyType =
  | 'non_aggression'
  | 'trade_agreement'
  | 'research_pact'
  | 'military_alliance'
  | 'defensive_pact'
  | 'vassal_agreement'
  | 'peace_treaty'
  | 'resource_deal';

export interface TreatyTerm {
  type: 'resource_per_turn' | 'military_support' | 'tech_sharing' | 'open_borders' | 'custom';
  description: string;
  value?: number;
  resource?: string;
}

export interface TradeDeal {
  id: string;
  partnerId: string;
  offer: ResourceBundle;
  request: ResourceBundle;
  turnsRemaining: number;
  establishedTurn: number;
}

export interface TrustEvent {
  turn: number;
  event: string;
  delta: number;
}

export type DevelopmentCardType =
  | 'knight' // déplace le brigand, vole une ressource
  | 'victory_point' // +1 VP secret
  | 'road_building' // construit 2 routes gratuitement
  | 'year_of_plenty' // prend 2 ressources du stock
  | 'monopoly' // prend toutes les ressources d'un type
  | 'spy' // regarde la main d'un adversaire
  | 'sabotage' // détruit une route ennemie
  | 'diplomat' // change une relation diplomatique
  | 'oracle' // prédit le prochain dé
  | 'plague' // inflige une épidémie à une ville ennemie
  | 'discovery' // révèle une zone de la carte
  | 'inspiration' // avance la recherche actuelle
  | 'reinforcements' // convoque des unités gratuites
  | 'earthquake' // dommages sur une tuile ciblée
  | 'golden_age'; // double la production pendant 1 tour

export interface DevelopmentCard {
  id: string;
  type: DevelopmentCardType;
  acquiredTurn: number;
  played: boolean;
}

export interface SecretObjective {
  id: string;
  description: string;
  condition: ObjectiveCondition;
  reward: ObjectiveReward;
  revealed: boolean;
  completed: boolean;
  completedTurn?: number;
}

export interface ObjectiveCondition {
  type:
    | 'control_tiles'
    | 'tech_count'
    | 'military_strength'
    | 'resource_total'
    | 'cities_count'
    | 'eliminate_player'
    | 'wonder_built'
    | 'trade_volume'
    | 'alliance_count'
    | 'age_reached';
  target: number | string;
  current?: number;
}

export interface ObjectiveReward {
  victoryPoints: number;
  resources?: ResourceBundle;
  tech?: string;
  specialAbility?: string;
}

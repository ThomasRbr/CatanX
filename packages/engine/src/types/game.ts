// ============================================================
// ÉTAT DE JEU GLOBAL — GameState central
// ============================================================

import { HexTile, CubeCoord } from './hex';
import { Player } from './player';
import { UnitInstance } from './military';
import { BuildingInstance } from './buildings';
import { GameEvent, Season } from './events';
import { ResourceMarket, ResourceBundle } from './resources';
import type { DevelopmentCardType } from './player';
import type { ClassicBoardState } from '../engine/catan/ClassicBoard';
import type {
  CitiesKnightsState,
  CkCommodityBundle,
  CkEventDie,
  GameExtensionsConfig,
} from './citiesKnights';
import type { SeasonsState } from './seasons';
import type { UndergroundSkyState } from './undergroundSky';

// ============================================================
// CONFIG & OPTIONS
// ============================================================

export type GameMode =
  | 'classic' // proche Catan, ~2h, 19 tuiles
  | 'standard' // jeu complet, ~4h, 37 tuiles
  | 'epic' // grande partie, ~8h, 91 tuiles
  | 'world' // partie monde, ~12h, 200+ tuiles
  | 'scenario'; // scénario prédéfini

export type VictoryCondition =
  | 'points' // premier à X points de victoire
  | 'domination' // contrôler X% du territoire
  | 'science' // atteindre l'ère Renaissance + construire merveille
  | 'culture' // atteindre X points de culture
  | 'religious' // convertir X% de la population
  | 'economic' // accumuler X coins
  | 'diplomatic' // être élu dirigeant mondial
  | 'elimination'; // éliminer tous les adversaires

/** Cadence de présentation. Les règles CATAN de base restent inchangées. */
export type GamePacingPreset = 'dynamic' | 'tabletop' | 'epic';

export interface GameConfig {
  mode: GameMode;
  mapSize: MapSize;
  mapSeed: number;
  playerCount: number;
  victoryConditions: VictoryCondition[];
  victoryPointTarget: number; // pour mode 'points' — objectif effectif (base + bonus extensions)
  /**
   * Objectif choisi au lobby, avant bonus d’extensions.
   * Présent après createGame / migration schéma 6.
   */
  baseVictoryPointTarget?: number;
  maxTurns: number; // 0 = illimité
  /**
   * @deprecated Lire `extensions.seasons.enabled` / `isSeasonsEnabled`.
   * Conservé pour compatibilité ; synchronisé depuis l’extension.
   */
  enableSeasons: boolean;
  enableEvents: boolean;
  enableDiplomacy: boolean;
  enableMilitary: boolean;
  enableTechTree: boolean;
  enableProductionChains: boolean;
  fogOfWar: boolean;
  startingResources: 'none' | 'minimal' | 'standard' | 'generous';
  barbarianStrength: BarbarianConfig;
  worldCouncil: boolean; // vote international
  difficultyModifier: number; // 0.5 à 2.0
  /**
   * Rythme de table et de narration. Optionnel pour conserver la compatibilité
   * avec les anciennes sauvegardes ; CatanX utilise `tabletop` par défaut.
   */
  pacingPreset?: GamePacingPreset;
  /**
   * Mode classique : plateau débutant fixe ou composition officielle mélangée.
   * Ignoré hors `mode === 'classic'` / carte tiny.
   */
  classicBoardLayout?: 'fixed' | 'random';
  /** Extensions optionnelles (Villes & Chevaliers, …) — indépendantes des modules. */
  extensions?: GameExtensionsConfig;
}

export type MapSize =
  | 'tiny' // 19 tuiles (Catan classique)
  | 'small' // 37 tuiles
  | 'medium' // 61 tuiles
  | 'large' // 91 tuiles
  | 'huge' // 127 tuiles
  | 'epic'; // 200+ tuiles

export interface BarbarianConfig {
  enabled: boolean;
  spawnRate: number; // tours entre chaque spawn
  strength: number; // force de base
  scaling: boolean; // grossissent avec le jeu
  navalBarbarians: boolean;
}

// ============================================================
// PHASE DE JEU
// ============================================================

export type GamePhase =
  | 'setup' // placement initial
  | 'playing' // jeu normal
  | 'end_game' // conditions de victoire proches
  | 'finished'; // partie terminée

export type TurnPhase =
  | 'start_of_turn' // effets début de tour
  | 'dice_roll' // lancer de dés
  | 'resource_collect' // collecte ressources
  | 'discard_resources' // défausse obligatoire sur 7
  | 'move_robber' // déplacement du brigand
  | 'steal_resource' // vol après brigand
  | 'event_resolution' // résolution événements
  | 'player_action' // actions du joueur
  | 'combat' // résolution combats
  | 'diplomacy' // phase diplomatique
  | 'production' // production bâtiments
  | 'end_of_turn' // effets fin de tour
  | 'season_change'; // changement de saison (tous les 4 tours)

export interface SevenFlowState {
  playersToDiscard: string[];
  playersDiscarded: string[];
  robberTileId: string | null;
  stealCandidates: string[];
}

// ============================================================
// CONSEIL MONDIAL
// ============================================================

export interface WorldCouncil {
  active: boolean;
  currentResolution?: CouncilResolution;
  votes: Record<string, string>; // playerId -> optionId
  history: CouncilResolution[];
  nextVoteTurn: number;
  /** Index déterministe dans le catalogue de résolutions. */
  resolutionCursor: number;
  /** Joueur élu / reconnu par le conseil (victoire diplomatique). */
  diplomaticLeaderId?: string;
  /** Effets mondiaux encore actifs (votes approuvés). */
  activeEffects: CouncilActiveEffect[];
}

export interface CouncilActiveEffect {
  id: string;
  kind: 'trade_ratio' | 'unit_training_limit' | 'forced_truce' | 'embargo' | 'shared_techs';
  expiresTurn: number;
  /** Ratio banque, plafond de recrutement, ressources embargées, etc. */
  data?: Record<string, unknown>;
}

export interface CouncilResolution {
  id: string;
  title: string;
  description: string;
  options: CouncilOption[];
  winnerId?: string; // option gagnante
  turn: number;
  globalEffect?: string; // effet mondial après vote
}

export interface CouncilOption {
  id: string;
  label: string;
  effects: string[];
  moralityTag?: 'progressive' | 'conservative' | 'military' | 'economic';
}

// ============================================================
// BARBARES
// ============================================================

export interface BarbarianGroup {
  id: string;
  position: CubeCoord;
  unitIds: string[];
  strength: number;
  target?: string; // ID joueur ciblé
  isRaiding: boolean;
}

// ============================================================
// ÉTAT GLOBAL DE LA PARTIE
// ============================================================

export interface GameState {
  // Identité
  id: string;
  name: string;
  config: GameConfig;
  createdAt: number;
  updatedAt: number;

  // Phase
  phase: GamePhase;
  currentTurn: number;
  currentPlayerIndex: number;
  turnPhase: TurnPhase;
  turnOrder: string[]; // IDs des joueurs dans l'ordre

  // Carte
  map: Map<string, HexTile>; // tileId -> HexTile
  mapWidth: number;
  mapHeight: number;
  mapRadius: number;

  // Entités
  players: Map<string, Player>; // playerId -> Player
  units: Map<string, UnitInstance>; // unitId -> UnitInstance
  buildings: Map<string, BuildingInstance>; // buildingId -> BuildingInstance
  barbarians: Map<string, BarbarianGroup>;

  // Économie globale
  market: ResourceMarket;
  /** Banque CATAN (19×5) — présente en mode classique. */
  bank?: ResourceBundle;
  /** Deck Développement mélangé sans remise (classique). */
  devDeck?: DevelopmentCardType[];
  /** Projection privée : taille du deck (ordre masqué). */
  publicDevDeckCount?: number;
  /** Topologie + pièces classiques autoritaires. */
  classicBoard?: ClassicBoardState;
  /** Offre de commerce domestique en cours (classique). */
  pendingPlayerTrade?: PendingPlayerTrade | null;

  /** État des extensions (Villes & Chevaliers, Saisons, Souterrain & Ciel, Pactes…). */
  extensions?: {
    citiesKnights?: CitiesKnightsState;
    seasons?: SeasonsState;
    undergroundSky?: UndergroundSkyState;
    pactsEmbassies?: import('./pactsEmbassies').PactsEmbassiesState;
  };

  // Temps & Saisons (miroirs — autorité = extensions.seasons)
  season: Season;
  seasonTurn: number; // ronde dans la saison (1-5)
  year: number; // compteur de tours globaux (≠ seasonYear)

  // Événements
  activeEvents: GameEvent[];
  eventHistory: GameEvent[];
  pendingChoices: PendingChoice[];

  // Dés
  lastDiceRoll: DiceRoll | null;
  diceHistory: DiceRoll[];

  // Brigand / Pirate
  robberPosition: string | null; // tileId
  piratePosition: string | null; // tileId
  sevenFlow: SevenFlowState | null;

  // Métriques globales
  longestRoadOwner: string | null;
  largestArmyOwner: string | null;
  longestRoadLength: number;
  largestArmySize: number;

  // Conseil mondial
  worldCouncil: WorldCouncil;

  // Cooldowns des événements (EventType → tour jusqu'auquel ce type est bloqué)
  eventCooldowns: Partial<Record<import('./events').EventType, number>>;

  // Phase de setup (placement serpent)
  setupRound: number; // 1 = aller, 2 = retour
  setupPlacementIndex: number; // index dans la liste de placement
  setupPlayerOrder: string[]; // ordre des joueurs pour le placement

  // Victory
  winner: string | null;
  victoryType?: VictoryCondition;
  rankings: PlayerRanking[];

  // Log
  actionLog: ActionLogEntry[];
  chatMessages: ChatMessage[];

  // Replay
  replayData?: ReplayFrame[];
}

export interface DiceRoll {
  turn: number;
  player: string;
  die1: number;
  die2: number;
  total: number;
  /** Dé rouge (égal à die1) — comparaison portes Progrès. */
  redDie?: number;
  /** Face du dé Événement Villes & Chevaliers. */
  eventDie?: CkEventDie;
  /** @deprecated alias de mapping pour saves anciennes */
  specialDie?: SpecialDieResult;
}

export type SpecialDieResult =
  'barbarian_advance' | 'yellow_city' | 'green_city' | 'blue_city' | 'event_card';

export interface PendingChoice {
  id: string;
  eventId: string;
  playerId: string;
  choices: import('./events').EventChoice[];
  deadline: number; // tour limite pour choisir
}

/** Offre de commerce entre joueurs (mode classique). */
export interface PendingPlayerTrade {
  id: string;
  fromPlayerId: string;
  /** Destinataire unique, ou `null` = offre ouverte à tous. */
  toPlayerId: string | null;
  /** Ressources que le proposant donne. */
  give: import('./resources').ResourceBundle;
  /** Ressources que le proposant demande. */
  receive: import('./resources').ResourceBundle;
  /** Marchandises C&K (optionnel). */
  giveCommodities?: CkCommodityBundle;
  receiveCommodities?: CkCommodityBundle;
  createdTurn: number;
  /** Joueurs ayant décliné une offre broadcast. */
  rejectedBy?: string[];
  /** Projection : termes masqués pour les non-parties. */
  termsHidden?: boolean;
}

export interface PlayerRanking {
  playerId: string;
  rank: number;
  victoryPoints: number;
  eliminatedTurn?: number;
}

export interface ActionLogEntry {
  id: string;
  turn: number;
  playerId: string;
  type: ActionType;
  description: string;
  data: Record<string, unknown>;
  timestamp: number;
}

export type ActionType =
  | 'build'
  | 'research'
  | 'train_unit'
  | 'move_unit'
  | 'attack'
  | 'trade'
  | 'diplomacy'
  | 'use_card'
  | 'found_city'
  | 'upgrade_city'
  | 'production_order'
  | 'event_choice'
  | 'council_vote'
  | 'surrender'
  | 'system';

export interface ChatMessage {
  id: string;
  senderId: string;
  recipientId?: string; // undefined = global
  message: string;
  timestamp: number;
  turn: number;
}

export interface ReplayFrame {
  turn: number;
  phase: TurnPhase;
  stateSnapshot: Partial<GameState>;
  actions: ActionLogEntry[];
}

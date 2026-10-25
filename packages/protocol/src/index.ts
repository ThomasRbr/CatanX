export type GameMode = 'classic' | 'standard' | 'epic' | 'world' | 'scenario';

export type VictoryCondition =
  | 'points'
  | 'domination'
  | 'science'
  | 'culture'
  | 'religious'
  | 'economic'
  | 'diplomatic'
  | 'elimination';

export type MapSize = 'tiny' | 'small' | 'medium' | 'large' | 'huge' | 'epic';

export interface BarbarianConfig {
  enabled: boolean;
  spawnRate: number;
  strength: number;
  scaling: boolean;
  navalBarbarians: boolean;
}

export type CkCommodity = 'ck_paper' | 'ck_cloth' | 'ck_coin';
export type CkCommodityBundle = Partial<Record<CkCommodity, number>>;

export interface CitiesKnightsConfig {
  enabled: boolean;
  ruleset: 'catanx-essential-v1';
  victoryPointBonus: 3;
  adaptiveBarbarianTrack: true;
}

export interface UndergroundSkyConfig {
  enabled: boolean;
  ruleset: 'catanx-underground-sky-v1';
  victoryPointBonus: 5;
  undergroundGeneration: 'surface-derived';
  skyGeneration: 'adaptive-network';
  flightMode: 'programmed';
  interactionMode: 'soft-competitive';
}

export type UndergroundSkyMaterial = 'us_crystal' | 'us_aether';
export type UndergroundSkyMaterialBundle = Partial<Record<UndergroundSkyMaterial, number>>;

export interface PactsEmbassiesConfig {
  enabled: boolean;
  ruleset: 'catanx-pacts-embassies-v1';
  victoryPointBonus: 3;
  /** 5 avec Saisons, 4 sans Saisons. */
  roundsPerCouncilSession: 4 | 5;
  maxActivePactsPerPlayer: 2;
  maxActiveResolutions: 2;
  neutralCouncilMode: 'adaptive';
}

export interface GameExtensionsConfig {
  citiesKnights?: CitiesKnightsConfig;
  seasons?: SeasonsConfig;
  undergroundSky?: UndergroundSkyConfig;
  pactsEmbassies?: PactsEmbassiesConfig;
}

export interface SeasonsConfig {
  enabled: boolean;
  ruleset: 'catanx-seasons-v2';
  roundsPerSeason: 5;
  forecastDepth: 1;
  preparationMode: 'secret-simultaneous';
  maxSeverePerYear: 2;
  allowConsecutiveSevere: false;
}

export type SeasonPreparation = 'harvest' | 'commerce' | 'reserve' | 'works' | 'shelter';
export type SeasonPreparationTarget = 'wood' | 'clay' | 'wheat' | 'sheep' | 'ore';

export interface GameConfig {
  mode: GameMode;
  mapSize: MapSize;
  mapSeed: number;
  playerCount: number;
  victoryConditions: VictoryCondition[];
  victoryPointTarget: number;
  /**
   * Objectif lobby avant bonus d’extensions.
   * Présent après createGame / migration schéma 6.
   */
  baseVictoryPointTarget?: number;
  maxTurns: number;
  /** @deprecated Prefer extensions.seasons.enabled */
  enableSeasons: boolean;
  enableEvents: boolean;
  enableDiplomacy: boolean;
  enableMilitary: boolean;
  enableTechTree: boolean;
  enableProductionChains: boolean;
  fogOfWar: boolean;
  startingResources: 'none' | 'minimal' | 'standard' | 'generous';
  barbarianStrength: BarbarianConfig;
  worldCouncil: boolean;
  difficultyModifier: number;
  classicBoardLayout?: 'fixed' | 'random';
  extensions?: GameExtensionsConfig;
}

export interface CommandPlayerSetup {
  name: string;
  civilization: string;
  type: 'human' | 'ai' | 'bot';
  aiPersonality?: string;
  aiDifficulty?: string;
  color?: string;
  profile?: {
    portrait: string;
    accessory: string;
    emblem: string;
    banner: string;
    frame: string;
    title: string;
    tagline: string;
    pieceColor: string;
    skinTone?: string;
    hairColor?: string;
    expression?: string;
    outfit?: string;
    aura?: string;
    cardMaterial?: string;
    pieceFinish?: string;
    diceStyle?: string;
  };
}

export type GameCommand =
  | { type: 'create_game'; config: GameConfig; players: CommandPlayerSetup[] }
  | { type: 'roll_dice'; playerId: string }
  | { type: 'acknowledge_collection'; playerId: string }
  | { type: 'end_turn'; playerId: string }
  | { type: 'draw_dev_card'; playerId: string }
  | {
      type: 'play_dev_card';
      playerId: string;
      cardId: string;
      targetPlayerId?: string | null;
      targetTileId?: string | null;
    }
  | {
      type: 'setup_placement';
      playerId: string;
      tileId: string;
      isSecondSettlement?: boolean;
    }
  | {
      type: 'setup_place_settlement';
      playerId: string;
      intersectionId: string;
    }
  | {
      type: 'setup_place_road';
      playerId: string;
      edgeId: string;
    }
  | {
      type: 'build_settlement';
      playerId: string;
      intersectionId: string;
    }
  | {
      type: 'build_road';
      playerId: string;
      edgeId: string;
      useSeasonPreparation?: boolean;
      /** Pacte Frontières ouvertes (extension Pactes & Ambassades). */
      pactId?: string;
    }
  | {
      type: 'upgrade_city';
      playerId: string;
      intersectionId: string;
    }
  | {
      type: 'discard_resources';
      playerId: string;
      resources: Record<string, number>;
      /** Marchandises C&K défaussées (comptent dans la main). */
      commodities?: CkCommodityBundle;
      /** Matériaux Souterrain & Ciel (comptent dans la main). */
      undergroundSkyMaterials?: UndergroundSkyMaterialBundle;
    }
  | { type: 'move_robber'; playerId: string; tileId: string }
  | { type: 'steal_resource'; playerId: string; targetPlayerId: string | null }
  | {
      type: 'bank_trade';
      playerId: string;
      give: Record<string, number>;
      receive: Record<string, number>;
      giveCommodities?: CkCommodityBundle;
      receiveCommodities?: CkCommodityBundle;
      giveMaterials?: UndergroundSkyMaterialBundle;
      receiveMaterials?: UndergroundSkyMaterialBundle;
      useSeasonPreparation?: boolean;
    }
  | {
      type: 'propose_player_trade';
      playerId: string;
      /** Destinataire, ou `null` pour proposer à tous. */
      toPlayerId: string | null;
      give: Record<string, number>;
      receive: Record<string, number>;
      giveCommodities?: CkCommodityBundle;
      receiveCommodities?: CkCommodityBundle;
      giveMaterials?: UndergroundSkyMaterialBundle;
      receiveMaterials?: UndergroundSkyMaterialBundle;
      /** Pacte Accord commercial (extension Pactes & Ambassades). */
      pactId?: string;
    }
  | {
      type: 'accept_player_trade';
      playerId: string;
      tradeId: string;
    }
  | {
      type: 'reject_player_trade';
      playerId: string;
      tradeId: string;
    }
  | {
      type: 'cancel_player_trade';
      playerId: string;
      tradeId?: string;
    }
  | {
      type: 'choose_event';
      playerId: string;
      eventId: string;
      choiceId: string;
    }
  | { type: 'start_research'; playerId: string; techId: string }
  | {
      type: 'diplomacy_action';
      playerId: string;
      toPlayerId: string;
      actionType: string;
      data?: unknown;
    }
  | {
      type: 'council_vote';
      playerId: string;
      optionId: string;
    }
  | {
      type: 'recruit_unit';
      playerId: string;
      tileId: string;
      unitType: string;
    }
  | {
      type: 'attack_unit';
      playerId: string;
      attackerId: string;
      defenderId: string;
    }
  | {
      type: 'move_unit';
      playerId: string;
      unitId: string;
      targetTileId: string;
    }
  | {
      type: 'craft_recipe';
      playerId: string;
      buildingId: string;
      recipeId: string;
    }
  // --- Villes & Chevaliers ---
  | {
      type: 'ck_improve_urban';
      playerId: string;
      track: 'trade' | 'politics' | 'science';
      metropolisIntersectionId?: string;
    }
  | {
      type: 'ck_place_metropolis';
      playerId: string;
      track: 'trade' | 'politics' | 'science';
      intersectionId: string;
    }
  | {
      type: 'ck_build_wall';
      playerId: string;
      intersectionId: string;
      useSeasonPreparation?: boolean;
    }
  | {
      type: 'ck_recruit_knight';
      playerId: string;
      intersectionId: string;
    }
  | {
      type: 'ck_activate_knight';
      playerId: string;
      knightId: string;
    }
  | {
      type: 'ck_promote_knight';
      playerId: string;
      knightId: string;
    }
  | {
      type: 'ck_move_knight';
      playerId: string;
      knightId: string;
      toIntersectionId: string;
    }
  | {
      type: 'seasons_choose_preparation';
      playerId: string;
      preparation: SeasonPreparation;
      targetResource?: SeasonPreparationTarget;
    }
  | {
      type: 'ck_displace_knight';
      playerId: string;
      knightId: string;
      targetKnightId: string;
    }
  | {
      type: 'ck_chase_robber';
      playerId: string;
      knightId: string;
      tileId: string;
    }
  | {
      type: 'ck_resolve_knight_retreat';
      playerId: string;
      knightId: string;
      toIntersectionId: string | null;
    }
  | {
      type: 'ck_aqueduct_choose';
      playerId: string;
      resource: string;
    }
  | {
      type: 'ck_choose_pillage_city';
      playerId: string;
      intersectionId: string;
    }
  | {
      type: 'ck_choose_progress_deck';
      playerId: string;
      deck: 'trade' | 'politics' | 'science';
    }
  | {
      type: 'ck_discard_progress';
      playerId: string;
      cardId: string;
    }
  | {
      type: 'ck_play_progress';
      playerId: string;
      cardId: string;
      tileId?: string;
      resource?: string;
      commodity?: string;
      targetPlayerId?: string;
      edgeId?: string;
      toEdgeId?: string;
      knightId?: string;
      knightIds?: string[];
      intersectionId?: string;
      toIntersectionId?: string;
      die1?: number;
      die2?: number;
      tokenTileA?: string;
      tokenTileB?: string;
      stealCardId?: string;
      take?: Array<{ kind: 'resource' | 'commodity'; key: string }>;
    }
  // --- Souterrain & Ciel ---
  | {
      type: 'us_build_shaft';
      playerId: string;
      intersectionId: string;
      entryNodeId: string;
    }
  | { type: 'us_survey_cavern'; playerId: string; nodeId: string }
  | {
      type: 'us_build_tunnel';
      playerId: string;
      edgeId: string;
      useSeasonPreparation?: boolean;
      /** Pacte Passage souterrain. */
      pactId?: string;
    }
  | { type: 'us_build_outpost'; playerId: string; nodeId: string }
  | { type: 'us_upgrade_extractor'; playerId: string; outpostId: string }
  | { type: 'us_build_lift'; playerId: string; nodeId: string }
  | {
      type: 'us_choose_thermal_output';
      playerId: string;
      outpostId: string;
      resource: 'wheat' | 'sheep';
    }
  | {
      type: 'us_choose_discovery_reward';
      playerId: string;
      nodeId: string;
      choice: string;
    }
  | { type: 'us_build_airport'; playerId: string; intersectionId: string }
  | { type: 'us_build_airship'; playerId: string; airportId: string }
  | {
      type: 'us_upgrade_airship';
      playerId: string;
      airshipId: string;
      upgrade: 'ether_sails' | 'reinforced_hold';
    }
  | { type: 'us_build_beacon'; playerId: string; hubId: string }
  | {
      type: 'us_dispatch_airship';
      playerId: string;
      airshipId: string;
      destinationHubId: string;
      cargo: Array<
        | { kind: 'resource'; key: string; amount: number }
        | { kind: 'commodity'; key: string; amount: number }
        | { kind: 'material'; key: UndergroundSkyMaterial; amount: number }
      >;
      /** Pacte Accord des Alizés. */
      pactId?: string;
    }
  | { type: 'us_unload_airship'; playerId: string; airshipId: string }
  | {
      type: 'us_complete_contract';
      playerId: string;
      contractId: string;
      airshipId?: string;
      rewardClassic?: string;
    }
  // --- Pactes & Ambassades ---
  | {
      type: 'pe_build_embassy';
      playerId: string;
      intersectionId: string;
    }
  | {
      type: 'pe_propose_pact';
      playerId: string;
      toPlayerId: string;
      clauses: Array<
        | 'trade_accord'
        | 'port_charter'
        | 'open_borders'
        | 'underground_passage'
        | 'trade_winds'
        | 'shared_reserve'
      >;
    }
  | {
      type: 'pe_counter_pact';
      playerId: string;
      offerId: string;
      clauses: Array<
        | 'trade_accord'
        | 'port_charter'
        | 'open_borders'
        | 'underground_passage'
        | 'trade_winds'
        | 'shared_reserve'
      >;
    }
  | { type: 'pe_accept_pact'; playerId: string; offerId: string }
  | { type: 'pe_reject_pact'; playerId: string; offerId: string }
  | { type: 'pe_break_pact'; playerId: string; pactId: string }
  | {
      type: 'pe_propose_mutual_dissolution';
      playerId: string;
      pactId: string;
    }
  | {
      type: 'pe_accept_mutual_dissolution';
      playerId: string;
      pactId: string;
    }
  | {
      type: 'pe_sponsor_resolution';
      playerId: string;
      proposalId: string;
    }
  | {
      type: 'pe_cast_council_vote';
      playerId: string;
      proposalId: string;
      variantId: string;
      extraVotes?: number;
    }
  | {
      type: 'pe_lobby_neutral_delegation';
      playerId: string;
      delegationId: string;
      amount: number;
    }
  | {
      type: 'pe_contribute_to_crisis';
      playerId: string;
      classic?: Record<string, number>;
      commodities?: CkCommodityBundle;
      materials?: UndergroundSkyMaterialBundle;
    }
  | { type: 'pe_claim_mandate'; playerId: string; mandateId: string };

/** Résumé salon pour le lobby. */
export interface RoomSummary {
  id: string;
  name: string;
  players: number;
  maxPlayers: number;
  status: 'lobby' | 'playing' | 'finished';
}

export type RoomSeatKind = 'human' | 'ai';

export type RoomAiDifficulty = 'easy' | 'medium' | 'hard' | 'legendary';

export type RoomGamePreset = 'classic' | 'catanx' | 'custom';

export interface RoomPlayerInfo {
  id: string;
  name: string;
  connected: boolean;
  spectator: boolean;
  ready: boolean;
  /** Siège humain connecté ou IA locale au serveur. */
  kind?: RoomSeatKind;
  aiDifficulty?: RoomAiDifficulty;
  /** Hôte du salon (humain). */
  isHost?: boolean;
  /** ID moteur une fois la partie lancée. */
  gamePlayerId?: string;
}

export interface RoomJoinedPayload {
  roomId: string;
  name: string;
  seatId: string;
  reconnectToken: string;
  isHost: boolean;
  spectator: boolean;
  players: RoomPlayerInfo[];
}

/** Payload `game_start` (hôte). */
export interface GameStartPayload {
  preset?: RoomGamePreset;
  config?: Partial<GameConfig>;
}

export interface AddAiSeatPayload {
  name?: string;
  difficulty?: RoomAiDifficulty;
}

export interface RemoveAiSeatPayload {
  seatId: string;
}

export interface RoomSaveSummary {
  id: string;
  name: string;
  savedAt: number;
  turn: number;
  playerCount: number;
  status: 'lobby' | 'playing' | 'finished';
  seatNames: string[];
}

export interface ResumeRoomPayload {
  roomId: string;
  playerName?: string;
}

export interface CommandSubmitPayload {
  id: string;
  sequence: number;
  command: GameCommand;
}

export interface CommandRejectedPayload {
  id?: string;
  code: string;
  reason: string;
}

export type NetworkMessage =
  | { channel: 'room:create'; payload: { name: string; maxPlayers?: number } }
  | { channel: 'room:join'; payload: { roomId: string; playerName: string; spectator?: boolean } }
  | { channel: 'room:leave'; payload: { roomId: string } }
  | { channel: 'room:list'; payload: Record<string, never> }
  | { channel: 'game:configure'; payload: { config: Partial<GameConfig> } }
  | { channel: 'game:start'; payload: { config?: Partial<GameConfig> } }
  | { channel: 'command:submit'; payload: CommandSubmitPayload }
  | { channel: 'command:accepted'; payload: { id: string; sequence: number } }
  | { channel: 'command:rejected'; payload: CommandRejectedPayload }
  | { channel: 'state:snapshot'; payload: { version: number; snapshot: unknown } }
  | { channel: 'state:patch'; payload: { version: number; patch: unknown } }
  | { channel: 'game:event'; payload: { events: unknown[] } }
  | { channel: 'player:ready'; payload: { ready: boolean } }
  | { channel: 'player:reconnected'; payload: { token: string } }
  | { channel: 'chat:message'; payload: { sender: string; text: string; timestamp: number } };

/** Noms d'événements Socket.IO (client ↔ serveur). */
export const SOCKET_EVENTS = {
  // client → server
  listRooms: 'list_rooms',
  lobbyList: 'lobby_list',
  createRoom: 'create_room',
  joinRoom: 'join_room',
  leaveRoom: 'leave_room',
  chatMessage: 'chat_message',
  playerAction: 'player_action',
  gameStart: 'game_start',
  playerReady: 'player_ready',
  playerReconnect: 'player_reconnect',
  addAiSeat: 'add_ai_seat',
  removeAiSeat: 'remove_ai_seat',
  roomSave: 'room_save',
  listSavedRooms: 'list_saved_rooms',
  resumeRoom: 'resume_room',
  discardSavedRoom: 'discard_saved_room',
  // server → client
  roomsList: 'rooms_list',
  lobbyRooms: 'lobby_rooms',
  roomPlayers: 'room_players',
  roomJoined: 'room_joined',
  stateSync: 'state_sync',
  errorMessage: 'error_message',
  commandRejected: 'command_rejected',
  commandAccepted: 'command_accepted',
  roomSaveAck: 'room_save_ack',
  savedRoomsList: 'saved_rooms_list',
} as const;

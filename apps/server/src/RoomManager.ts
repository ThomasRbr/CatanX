import type {
  GameCommand,
  GameConfig,
  RoomAiDifficulty,
  RoomGamePreset,
  RoomPlayerInfo,
  RoomSummary,
} from '@catanx/protocol';
import {
  applyAIBuildStep,
  applyCommand,
  buildGameConfigFromPreset,
  createDefaultEngineContext,
  createSnapshot,
  deserializeMaps,
  pickNextAIStep,
  projectStateForViewer,
  serializeMaps,
  snapshotToGameState,
  type EngineContext,
  type GamePreset,
  type GameSnapshot,
  type GameState,
  type SerializedGameState,
} from '@catanx/engine';
import { randomBytes } from 'node:crypto';
import type { PersistedSeat, RoomSaveFile } from './persistence';
import { writeRoomSave } from './persistence';

export type SeatKind = 'human' | 'ai';

export interface Seat {
  seatId: string;
  name: string;
  reconnectToken: string;
  socketId: string | null;
  connected: boolean;
  spectator: boolean;
  ready: boolean;
  isHost: boolean;
  kind: SeatKind;
  aiDifficulty?: RoomAiDifficulty;
  gamePlayerId?: string;
}

export interface RoomChatMessage {
  sender: string;
  text: string;
  timestamp: number;
}

export interface RoomStartOptions {
  preset?: RoomGamePreset;
  config?: Partial<GameConfig>;
}

let roomSeq = 0;
let seatSeq = 0;
let aiSeq = 0;

function nextRoomId(): string {
  roomSeq += 1;
  return `R${roomSeq.toString(36).toUpperCase()}${randomBytes(2).toString('hex').toUpperCase()}`;
}

function nextSeatId(): string {
  seatSeq += 1;
  return `S${seatSeq}`;
}

function nextToken(): string {
  return randomBytes(16).toString('hex');
}

function nextAiName(existing: Seat[]): string {
  aiSeq += 1;
  let name = `IA ${aiSeq}`;
  const taken = new Set(existing.map((seat) => seat.name.toLowerCase()));
  while (taken.has(name.toLowerCase())) {
    aiSeq += 1;
    name = `IA ${aiSeq}`;
  }
  return name;
}

function normalizeDifficulty(value: unknown): RoomAiDifficulty {
  if (value === 'easy' || value === 'hard' || value === 'legendary') return value;
  return 'medium';
}

function toEnginePreset(preset: RoomGamePreset): GamePreset {
  if (preset === 'catanx' || preset === 'custom') return preset;
  return 'classic';
}

export class GameRoom {
  readonly id: string;
  readonly name: string;
  readonly maxPlayers: number;
  readonly createdAt: number;
  status: 'lobby' | 'playing' | 'finished' = 'lobby';
  seats: Seat[] = [];
  chat: RoomChatMessage[] = [];
  state: GameState | null = null;
  version = 0;
  preset: RoomGamePreset = 'classic';
  private context: EngineContext | null = null;
  private commandSequence = 0;
  private partialConfig: Partial<GameConfig> = {};
  private aiTimer: ReturnType<typeof setTimeout> | null = null;
  private aiScheduled = false;
  private aiFailStreak = 0;
  private persistTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(name: string, maxPlayers = 4, fixedId?: string) {
    this.id = fixedId ?? nextRoomId();
    this.name = name.slice(0, 48) || 'Salon CatanX';
    this.maxPlayers = Math.min(6, Math.max(2, maxPlayers));
    this.createdAt = Date.now();
  }

  summary(): RoomSummary {
    const seated = this.seats.filter((seat) => !seat.spectator).length;
    return {
      id: this.id,
      name: this.name,
      players: seated,
      maxPlayers: this.maxPlayers,
      status: this.status,
    };
  }

  playersInfo(): RoomPlayerInfo[] {
    return this.seats.map((seat) => ({
      id: seat.seatId,
      name: seat.name,
      connected: seat.connected,
      spectator: seat.spectator,
      ready: seat.ready,
      kind: seat.kind,
      aiDifficulty: seat.aiDifficulty,
      isHost: seat.isHost,
      gamePlayerId: seat.gamePlayerId,
    }));
  }

  findSeatBySocket(socketId: string): Seat | undefined {
    return this.seats.find((seat) => seat.socketId === socketId);
  }

  findSeatByToken(token: string): Seat | undefined {
    return this.seats.find((seat) => seat.reconnectToken === token);
  }

  findSeatById(seatId: string): Seat | undefined {
    return this.seats.find((seat) => seat.seatId === seatId);
  }

  host(): Seat | undefined {
    return this.seats.find((seat) => seat.isHost && seat.kind === 'human');
  }

  playingSeats(): Seat[] {
    return this.seats.filter((seat) => !seat.spectator);
  }

  humanSeats(): Seat[] {
    return this.playingSeats().filter((seat) => seat.kind === 'human');
  }

  addSeat(
    socketId: string,
    playerName: string,
    spectator: boolean,
  ): { ok: true; seat: Seat } | { ok: false; reason: string } {
    const name = playerName.trim().slice(0, 24) || 'Joueur';

    const alreadyHere = this.findSeatBySocket(socketId);
    if (alreadyHere) {
      return { ok: true, seat: alreadyHere };
    }

    // Reprendre un siège humain déconnecté du même pseudo (reconnexion soft).
    if (!spectator) {
      const reclaimable = this.seats.find(
        (seat) =>
          seat.kind === 'human' &&
          !seat.spectator &&
          !seat.connected &&
          seat.name.toLowerCase() === name.toLowerCase(),
      );
      if (reclaimable) {
        reclaimable.socketId = socketId;
        reclaimable.connected = true;
        return { ok: true, seat: reclaimable };
      }
    }

    if (this.status !== 'lobby' && !spectator) {
      return { ok: false, reason: 'La partie a déjà commencé.' };
    }

    if (!spectator) {
      const seated = this.playingSeats().length;
      if (seated >= this.maxPlayers) {
        return { ok: false, reason: 'Salon plein.' };
      }
      if (
        this.seats.some(
          (seat) => !seat.spectator && seat.name.toLowerCase() === name.toLowerCase(),
        )
      ) {
        return { ok: false, reason: 'Ce pseudo est déjà pris dans le salon.' };
      }
    }

    const seat: Seat = {
      seatId: nextSeatId(),
      name,
      reconnectToken: nextToken(),
      socketId,
      connected: true,
      spectator,
      ready: false,
      kind: 'human',
      isHost: !spectator && this.humanSeats().length === 0,
    };
    this.seats.push(seat);
    return { ok: true, seat };
  }

  addAiSeat(
    requestedBySocketId: string,
    options: { name?: string; difficulty?: RoomAiDifficulty } = {},
  ): { ok: true; seat: Seat } | { ok: false; reason: string } {
    const host = this.host();
    if (!host || host.socketId !== requestedBySocketId) {
      return { ok: false, reason: 'Seul l’hôte peut ajouter une IA.' };
    }
    if (this.status !== 'lobby') {
      return { ok: false, reason: 'La partie est déjà en cours.' };
    }
    if (this.playingSeats().length >= this.maxPlayers) {
      return { ok: false, reason: 'Salon plein.' };
    }

    const difficulty = normalizeDifficulty(options.difficulty);
    const name =
      (options.name?.trim().slice(0, 24) || nextAiName(this.seats)).slice(0, 24) ||
      nextAiName(this.seats);
    if (
      this.seats.some((seat) => !seat.spectator && seat.name.toLowerCase() === name.toLowerCase())
    ) {
      return { ok: false, reason: 'Ce nom est déjà pris dans le salon.' };
    }

    const seat: Seat = {
      seatId: nextSeatId(),
      name,
      reconnectToken: nextToken(),
      socketId: null,
      connected: true,
      spectator: false,
      ready: true,
      kind: 'ai',
      aiDifficulty: difficulty,
      isHost: false,
    };
    this.seats.push(seat);
    return { ok: true, seat };
  }

  removeAiSeat(
    requestedBySocketId: string,
    seatId: string,
  ): { ok: true } | { ok: false; reason: string } {
    const host = this.host();
    if (!host || host.socketId !== requestedBySocketId) {
      return { ok: false, reason: 'Seul l’hôte peut retirer une IA.' };
    }
    if (this.status !== 'lobby') {
      return { ok: false, reason: 'La partie est déjà en cours.' };
    }
    const seat = this.findSeatById(seatId);
    if (!seat || seat.kind !== 'ai') {
      return { ok: false, reason: 'Siège IA introuvable.' };
    }
    this.removeSeat(seatId);
    return { ok: true };
  }

  markDisconnected(socketId: string): Seat | undefined {
    const seat = this.findSeatBySocket(socketId);
    if (!seat) return undefined;
    seat.connected = false;
    seat.socketId = null;
    return seat;
  }

  reconnect(token: string, socketId: string): { ok: true; seat: Seat } | { ok: false; reason: string } {
    const seat = this.findSeatByToken(token);
    if (!seat || seat.kind !== 'human') {
      return { ok: false, reason: 'Jeton de reconnexion invalide.' };
    }
    seat.socketId = socketId;
    seat.connected = true;
    return { ok: true, seat };
  }

  removeSeat(seatId: string): void {
    this.seats = this.seats.filter((seat) => seat.seatId !== seatId);
    if (!this.seats.some((seat) => seat.isHost && seat.kind === 'human')) {
      const nextHost = this.seats.find((seat) => seat.kind === 'human' && !seat.spectator);
      if (nextHost) nextHost.isHost = true;
    }
  }

  setReady(socketId: string, ready: boolean): Seat | undefined {
    const seat = this.findSeatBySocket(socketId);
    if (!seat || seat.spectator || seat.kind !== 'human') return undefined;
    seat.ready = ready;
    return seat;
  }

  configure(partial: Partial<GameConfig>, preset?: RoomGamePreset): void {
    this.partialConfig = { ...this.partialConfig, ...partial };
    if (preset) this.preset = preset;
  }

  canStartWithSeats(preset: RoomGamePreset, seatedCount: number): { ok: true } | { ok: false; reason: string } {
    if (preset === 'classic') {
      if (seatedCount < 3 || seatedCount > 4) {
        return {
          ok: false,
          reason: 'Mode classique : 3 ou 4 joueurs (humains + IA).',
        };
      }
    } else if (seatedCount < 2) {
      return { ok: false, reason: 'Il faut au moins 2 joueurs (humains + IA).' };
    }
    if (this.humanSeats().length < 1) {
      return { ok: false, reason: 'Il faut au moins un joueur humain.' };
    }
    return { ok: true };
  }

  startGame(
    requestedBySocketId: string,
    options: RoomStartOptions = {},
  ): { ok: true } | { ok: false; reason: string } {
    const host = this.host();
    if (!host || host.socketId !== requestedBySocketId) {
      return { ok: false, reason: 'Seul l’hôte peut lancer la partie.' };
    }
    if (this.status !== 'lobby') {
      return { ok: false, reason: 'La partie est déjà en cours.' };
    }

    if (options.preset) this.preset = options.preset;
    if (options.config) {
      this.partialConfig = { ...this.partialConfig, ...options.config };
    }

    const players = this.playingSeats();
    const seatCheck = this.canStartWithSeats(this.preset, players.length);
    if (!seatCheck.ok) return seatCheck;

    const seed = this.partialConfig.mapSeed ?? (Date.now() % 1_000_000);
    const config = buildGameConfigFromPreset(toEnginePreset(this.preset), {
      ...this.partialConfig,
      mapSeed: seed,
      playerCount: players.length,
    });

    this.context = createDefaultEngineContext(seed);
    const created = applyCommand(
      null,
      {
        type: 'create_game',
        config,
        players: players.map((seat) => ({
          name: seat.name,
          civilization: 'empire',
          type: seat.kind === 'ai' ? ('ai' as const) : ('human' as const),
          ...(seat.kind === 'ai'
            ? { aiDifficulty: seat.aiDifficulty ?? 'medium' }
            : {}),
        })),
      },
      this.context,
    );

    if (!created.ok) {
      return { ok: false, reason: created.error.message };
    }

    this.state = created.state;
    this.version = 1;
    this.status = 'playing';
    this.commandSequence = 0;

    const order = this.state.turnOrder;
    players.forEach((seat, index) => {
      seat.gamePlayerId = order[index];
      seat.ready = true;
      if (seat.kind === 'ai' && seat.gamePlayerId) {
        const player = this.state!.players.get(seat.gamePlayerId);
        if (player) {
          player.type = 'ai';
          player.aiDifficulty = seat.aiDifficulty ?? 'medium';
        }
      }
    });

    return { ok: true };
  }

  /** État complet (saves / tests) — ne pas diffuser tel quel en multijoueur. */
  wireState(): SerializedGameState | null {
    if (!this.state) return null;
    return serializeMaps(this.state);
  }

  /** Vue filtrée pour un siège (`null` = spectateur). */
  wireStateForViewer(viewerId: string | null): SerializedGameState | null {
    if (!this.state) return null;
    return serializeMaps(projectStateForViewer(this.state, viewerId));
  }

  applyPlayerCommand(
    socketId: string,
    command: GameCommand,
  ):
    | { ok: true; version: number; sequence: number }
    | { ok: false; code: string; reason: string } {
    if (this.status !== 'playing' || !this.state || !this.context) {
      return { ok: false, code: 'no_game', reason: 'Aucune partie en cours.' };
    }

    const seat = this.findSeatBySocket(socketId);
    if (!seat) {
      return { ok: false, code: 'not_in_room', reason: 'Vous n’êtes pas dans ce salon.' };
    }
    if (seat.spectator) {
      return { ok: false, code: 'spectator', reason: 'Les spectateurs ne peuvent pas jouer.' };
    }
    if (seat.kind !== 'human') {
      return { ok: false, code: 'ai_seat', reason: 'Ce siège est contrôlé par le serveur.' };
    }
    if (!seat.gamePlayerId) {
      return { ok: false, code: 'no_seat', reason: 'Siège non associé à un joueur.' };
    }

    if (command.type === 'create_game') {
      return { ok: false, code: 'forbidden', reason: 'create_game réservé au serveur.' };
    }

    if ('playerId' in command && command.playerId !== seat.gamePlayerId) {
      return {
        ok: false,
        code: 'wrong_player',
        reason: 'Cette commande ne correspond pas à votre siège.',
      };
    }

    const boundCommand = {
      ...command,
      ...('playerId' in command ? { playerId: seat.gamePlayerId } : {}),
    } as GameCommand;

    return this.commitCommand(boundCommand);
  }

  /** Applique une commande IA (pas de binding socket). */
  applyServerAIStep():
    | { ok: true; version: number; acted: true }
    | { ok: true; acted: false }
    | { ok: false; reason: string } {
    if (this.status !== 'playing' || !this.state || !this.context) {
      return { ok: false, reason: 'Aucune partie en cours.' };
    }

    const step = pickNextAIStep(this.state);
    if (!step) return { ok: true, acted: false };

    if (step.kind === 'build') {
      const success = applyAIBuildStep(this.state, step);
      if (!success) return { ok: true, acted: false };
      this.version += 1;
      this.commandSequence += 1;
      if (this.state.phase === 'finished') this.status = 'finished';
      return { ok: true, version: this.version, acted: true };
    }

    const result = this.commitCommand(step.command);
    if (!result.ok) return { ok: true, acted: false };
    return { ok: true, version: result.version, acted: true };
  }

  needsAIStep(): boolean {
    if (this.status !== 'playing' || !this.state) return false;
    return pickNextAIStep(this.state) !== null;
  }

  clearAITimer(): void {
    if (this.aiTimer) {
      clearTimeout(this.aiTimer);
      this.aiTimer = null;
    }
    this.aiScheduled = false;
  }

  noteAIStepResult(acted: boolean): void {
    if (acted) {
      this.aiFailStreak = 0;
      return;
    }
    this.aiFailStreak += 1;
  }

  aiFailCount(): number {
    return this.aiFailStreak;
  }

  scheduleAI(
    delayMs: number,
    run: (room: GameRoom) => void,
  ): void {
    if (this.aiScheduled || this.status !== 'playing') return;
    this.aiScheduled = true;
    this.aiTimer = setTimeout(() => {
      this.aiTimer = null;
      this.aiScheduled = false;
      run(this);
    }, delayMs);
  }

  private commitCommand(
    command: GameCommand,
  ):
    | { ok: true; version: number; sequence: number }
    | { ok: false; code: string; reason: string } {
    if (!this.state || !this.context) {
      return { ok: false, code: 'no_game', reason: 'Aucune partie en cours.' };
    }

    const result = applyCommand(this.state, command, this.context);
    if (!result.ok) {
      return {
        ok: false,
        code: result.error.code,
        reason: result.error.message,
      };
    }

    this.state = result.state;
    this.version += 1;
    this.commandSequence += 1;
    if (this.state.phase === 'finished') {
      this.status = 'finished';
      this.clearAITimer();
      this.saveToDisk();
    } else {
      this.schedulePersist();
    }

    return { ok: true, version: this.version, sequence: this.commandSequence };
  }

  snapshot() {
    if (!this.state) return null;
    return createSnapshot(this.state, [], this.state.config.mapSeed);
  }

  toSaveFile(): RoomSaveFile {
    const snap = this.snapshot();
    return {
      format: 'catanx-room-v1',
      roomId: this.id,
      roomName: this.name,
      maxPlayers: this.maxPlayers,
      preset: this.preset,
      status: this.status,
      savedAt: Date.now(),
      version: this.version,
      seats: this.seats.map(
        (seat): PersistedSeat => ({
          seatId: seat.seatId,
          name: seat.name,
          kind: seat.kind,
          reconnectToken: seat.reconnectToken,
          spectator: seat.spectator,
          isHost: seat.isHost,
          ready: seat.ready,
          aiDifficulty: seat.aiDifficulty,
          gamePlayerId: seat.gamePlayerId,
          connected: false,
        }),
      ),
      snapshot: snap,
      turn: this.state?.currentTurn ?? 0,
      playerCount: this.playingSeats().length,
    };
  }

  saveToDisk(): { ok: true } | { ok: false; reason: string } {
    if (this.status === 'lobby' && !this.state) {
      return { ok: false, reason: 'Aucune partie à sauvegarder.' };
    }
    try {
      writeRoomSave(this.toSaveFile());
      return { ok: true };
    } catch {
      return { ok: false, reason: 'Échec écriture disque.' };
    }
  }

  schedulePersist(delayMs = 1500): void {
    if (this.status !== 'playing' || !this.state) return;
    if (this.persistTimer) clearTimeout(this.persistTimer);
    this.persistTimer = setTimeout(() => {
      this.persistTimer = null;
      this.saveToDisk();
    }, delayMs);
  }

  clearPersistTimer(): void {
    if (this.persistTimer) {
      clearTimeout(this.persistTimer);
      this.persistTimer = null;
    }
  }

  hydrateFromSave(file: RoomSaveFile): { ok: true } | { ok: false; reason: string } {
    this.preset = file.preset ?? 'classic';
    this.status = file.status;
    this.version = file.version ?? 0;
    this.seats = file.seats.map((seat) => ({
      seatId: seat.seatId,
      name: seat.name,
      reconnectToken: seat.reconnectToken,
      socketId: null,
      connected: false,
      spectator: seat.spectator,
      ready: seat.ready,
      isHost: seat.isHost,
      kind: seat.kind,
      aiDifficulty: seat.aiDifficulty,
      gamePlayerId: seat.gamePlayerId,
    }));

    if (file.snapshot) {
      try {
        const state = snapshotToGameState(file.snapshot as GameSnapshot);
        const seed = state.config.mapSeed;
        this.context = createDefaultEngineContext(seed);
        this.state = state;
        this.status = state.phase === 'finished' ? 'finished' : 'playing';
      } catch {
        return { ok: false, reason: 'Snapshot invalide.' };
      }
    } else {
      this.state = null;
      this.context = null;
      this.status = 'lobby';
    }
    return { ok: true };
  }
}

export class RoomManager {
  private rooms = new Map<string, GameRoom>();
  private socketRoom = new Map<string, string>();

  list(): RoomSummary[] {
    return [...this.rooms.values()]
      .filter((room) => room.status !== 'finished')
      .map((room) => room.summary());
  }

  get(roomId: string): GameRoom | undefined {
    return this.rooms.get(roomId);
  }

  roomForSocket(socketId: string): GameRoom | undefined {
    const roomId = this.socketRoom.get(socketId);
    return roomId ? this.rooms.get(roomId) : undefined;
  }

  create(name: string, maxPlayers = 4, fixedId?: string): GameRoom {
    const room = new GameRoom(name, maxPlayers, fixedId);
    this.rooms.set(room.id, room);
    return room;
  }

  /** Remet une salle sauvegardée en mémoire (même id). */
  resumeFromSave(file: RoomSaveFile): { ok: true; room: GameRoom } | { ok: false; reason: string } {
    const existing = this.rooms.get(file.roomId);
    if (existing) {
      const liveActive =
        existing.state && (existing.status === 'playing' || existing.status === 'finished');
      if (liveActive) {
        return { ok: true, room: existing };
      }
      const hydrated = existing.hydrateFromSave(file);
      if (!hydrated.ok) return hydrated;
      return { ok: true, room: existing };
    }
    const room = new GameRoom(file.roomName, file.maxPlayers, file.roomId);
    const hydrated = room.hydrateFromSave(file);
    if (!hydrated.ok) return hydrated;
    this.rooms.set(room.id, room);
    return { ok: true, room };
  }

  bindSocket(socketId: string, roomId: string): void {
    this.socketRoom.set(socketId, roomId);
  }

  unbindSocket(socketId: string): void {
    this.socketRoom.delete(socketId);
  }

  cleanupEmpty(room: GameRoom): void {
    const humans = room.seats.filter((seat) => seat.kind === 'human');
    if (humans.length === 0) {
      room.clearAITimer();
      room.clearPersistTimer();
      // Persiste une dernière fois si une partie était en cours
      if (room.status === 'playing' && room.state) {
        room.saveToDisk();
      }
      this.rooms.delete(room.id);
    }
  }

  /** Hydrate test helper — not used by sockets. */
  hydrateState(room: GameRoom, wire: SerializedGameState): void {
    room.state = deserializeMaps(wire);
  }
}

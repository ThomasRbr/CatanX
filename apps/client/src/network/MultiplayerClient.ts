import { io, Socket } from 'socket.io-client';
import {
  deserializeMaps,
  type GameState,
  type SerializedGameState,
} from '@catanx/engine';
import type {
  AddAiSeatPayload,
  CommandRejectedPayload,
  GameCommand,
  GameStartPayload,
  RemoveAiSeatPayload,
  RoomAiDifficulty,
  RoomJoinedPayload,
  RoomPlayerInfo,
  RoomSaveSummary,
  RoomSeatKind,
  RoomSummary,
} from '@catanx/protocol';
import { SOCKET_EVENTS } from '@catanx/protocol';

export interface MultiplayerRoomSummary {
  id: string;
  name?: string;
  players?: number;
  maxPlayers?: number;
  status?: string;
}

export interface MultiplayerRoomPlayer {
  id?: string;
  name: string;
  connected?: boolean;
  spectator?: boolean;
  ready?: boolean;
  kind?: RoomSeatKind;
  aiDifficulty?: RoomAiDifficulty;
  isHost?: boolean;
  gamePlayerId?: string;
}

export interface MultiplayerChatMessage {
  sender: string;
  text: string;
  timestamp: number;
}

export interface MultiplayerConfig {
  serverUrl: string;
  roomId?: string;
  playerName: string;
  spectator?: boolean;
  reconnectToken?: string;
}

export type MultiplayerCallbacks = {
  onConnected?: () => void;
  onDisconnected?: () => void;
  onStateSync?: (state: GameState, version: number) => void;
  onChat?: (message: MultiplayerChatMessage) => void;
  onRooms?: (rooms: MultiplayerRoomSummary[]) => void;
  onRoomPlayers?: (players: MultiplayerRoomPlayer[]) => void;
  onRoomJoined?: (payload: RoomJoinedPayload) => void;
  onCommandRejected?: (payload: CommandRejectedPayload) => void;
  onError?: (message: string) => void;
  onSavedRooms?: (rooms: RoomSaveSummary[]) => void;
  onRoomSaveAck?: (payload: {
    ok: boolean;
    reason?: string;
    roomId?: string;
    savedAt?: number;
  }) => void;
};

function toRoomSummary(entry: RoomSummary | MultiplayerRoomSummary): MultiplayerRoomSummary {
  return {
    id: entry.id,
    name: entry.name,
    players: entry.players,
    maxPlayers: entry.maxPlayers,
    status: 'status' in entry ? entry.status : undefined,
  };
}

function parseStateSync(payload: unknown): { state: GameState; version: number } | null {
  if (!payload || typeof payload !== 'object') return null;
  const record = payload as { version?: number; state?: SerializedGameState } & SerializedGameState;
  if (record.state && Array.isArray(record.state.map)) {
    return {
      state: deserializeMaps(record.state),
      version: Number(record.version ?? 0),
    };
  }
  if (Array.isArray(record.map) && Array.isArray(record.players)) {
    return {
      state: deserializeMaps(record as SerializedGameState),
      version: Number(record.version ?? 0),
    };
  }
  return null;
}

export class MultiplayerClient {
  private socket: Socket | null = null;
  private playerName = 'Joueur';
  private commandSeq = 0;
  private lastStateVersion = 0;

  connect(config: MultiplayerConfig, callbacks: MultiplayerCallbacks = {}): void {
    this.disconnect();
    this.playerName = config.playerName;
    this.lastStateVersion = 0;

    this.socket = io(config.serverUrl, {
      // Polling d’abord : plus fiable derrière tunnels / proxies, puis upgrade WS.
      transports: ['polling', 'websocket'],
      autoConnect: true,
    });

    let reconnectAttempted = Boolean(config.reconnectToken && config.roomId);

    this.socket.on('connect', () => {
      if (config.reconnectToken && config.roomId) {
        this.reconnect(config.roomId, config.reconnectToken);
      } else if (config.roomId) {
        this.joinRoom(config.roomId, config.playerName, Boolean(config.spectator));
      }
      this.requestRooms();
      callbacks.onConnected?.();
    });

    this.socket.on('disconnect', () => {
      callbacks.onDisconnected?.();
    });

    this.socket.on('connect_error', (error: Error) => {
      callbacks.onError?.(error.message || 'Connexion impossible');
    });

    this.socket.on(SOCKET_EVENTS.stateSync, (payload: unknown) => {
      const parsed = parseStateSync(payload);
      if (!parsed) return;
      if (parsed.version > 0 && parsed.version < this.lastStateVersion) return;
      this.lastStateVersion = parsed.version;
      callbacks.onStateSync?.(parsed.state, parsed.version);
    });

    this.socket.on(SOCKET_EVENTS.chatMessage, (payload: MultiplayerChatMessage) => {
      callbacks.onChat?.(payload);
    });

    const onRooms = (payload: RoomSummary[] | MultiplayerRoomSummary[]) => {
      callbacks.onRooms?.(
        (Array.isArray(payload) ? payload : []).map((entry) => toRoomSummary(entry)),
      );
    };
    this.socket.on(SOCKET_EVENTS.lobbyRooms, onRooms);
    this.socket.on(SOCKET_EVENTS.roomsList, onRooms);

    this.socket.on(SOCKET_EVENTS.roomPlayers, (payload: RoomPlayerInfo[] | MultiplayerRoomPlayer[]) => {
      callbacks.onRoomPlayers?.(Array.isArray(payload) ? payload : []);
    });

    this.socket.on(SOCKET_EVENTS.roomJoined, (payload: RoomJoinedPayload) => {
      callbacks.onRoomJoined?.(payload);
      callbacks.onRoomPlayers?.(payload.players);
    });

    this.socket.on(SOCKET_EVENTS.commandRejected, (payload: CommandRejectedPayload) => {
      callbacks.onCommandRejected?.(payload);
    });

    this.socket.on(SOCKET_EVENTS.errorMessage, (payload: { message?: string } | string) => {
      const message = typeof payload === 'string' ? payload : payload?.message;
      const text = message ?? 'Erreur multijoueur';
      // Reconnexion impossible → rejoindre normalement le salon ciblé.
      if (
        reconnectAttempted &&
        config.roomId &&
        /reconnexion|jeton|introuvable/i.test(text)
      ) {
        reconnectAttempted = false;
        this.joinRoom(config.roomId, config.playerName, Boolean(config.spectator));
        return;
      }
      callbacks.onError?.(text);
    });

    this.socket.on(SOCKET_EVENTS.savedRoomsList, (payload: RoomSaveSummary[]) => {
      callbacks.onSavedRooms?.(Array.isArray(payload) ? payload : []);
    });

    this.socket.on(
      SOCKET_EVENTS.roomSaveAck,
      (payload: { ok?: boolean; reason?: string; roomId?: string; savedAt?: number }) => {
        callbacks.onRoomSaveAck?.({
          ok: Boolean(payload?.ok),
          reason: payload?.reason,
          roomId: payload?.roomId,
          savedAt: payload?.savedAt,
        });
      },
    );
  }

  submitCommand(command: GameCommand): void {
    this.commandSeq += 1;
    this.socket?.emit(SOCKET_EVENTS.playerAction, {
      id: `cmd_${this.commandSeq}`,
      sequence: this.commandSeq,
      command,
    });
  }

  /** @deprecated Prefer submitCommand */
  sendAction(action: Record<string, unknown>): void {
    if (action.command) {
      this.submitCommand(action.command as GameCommand);
      return;
    }
    this.socket?.emit(SOCKET_EVENTS.playerAction, action);
  }

  sendChat(text: string): void {
    this.socket?.emit(SOCKET_EVENTS.chatMessage, { text });
  }

  requestRooms(): void {
    this.socket?.emit(SOCKET_EVENTS.listRooms);
    this.socket?.emit(SOCKET_EVENTS.lobbyList);
  }

  createRoom(roomName: string, playerName = this.playerName, maxPlayers = 4): void {
    this.socket?.emit(SOCKET_EVENTS.createRoom, {
      name: roomName,
      playerName,
      maxPlayers,
    });
  }

  joinRoom(roomId: string, playerName = this.playerName, spectator = false): void {
    this.socket?.emit(SOCKET_EVENTS.joinRoom, {
      roomId,
      playerName,
      spectator,
    });
  }

  leaveRoom(): void {
    this.socket?.emit(SOCKET_EVENTS.leaveRoom, {});
  }

  setReady(ready: boolean): void {
    this.socket?.emit(SOCKET_EVENTS.playerReady, { ready });
  }

  startGame(payload?: GameStartPayload): void {
    this.socket?.emit(SOCKET_EVENTS.gameStart, payload ?? {});
  }

  addAiSeat(payload: AddAiSeatPayload = {}): void {
    this.socket?.emit(SOCKET_EVENTS.addAiSeat, payload);
  }

  removeAiSeat(payload: RemoveAiSeatPayload): void {
    this.socket?.emit(SOCKET_EVENTS.removeAiSeat, payload);
  }

  saveRoom(): void {
    this.socket?.emit(SOCKET_EVENTS.roomSave);
  }

  listSavedRooms(): void {
    this.socket?.emit(SOCKET_EVENTS.listSavedRooms);
  }

  resumeRoom(roomId: string, playerName = this.playerName): void {
    this.socket?.emit(SOCKET_EVENTS.resumeRoom, { roomId, playerName });
  }

  discardSavedRoom(roomId: string, reconnectToken?: string): void {
    this.socket?.emit(SOCKET_EVENTS.discardSavedRoom, {
      roomId,
      reconnectToken,
    });
  }

  reconnect(roomId: string, token: string): void {
    this.socket?.emit(SOCKET_EVENTS.playerReconnect, { roomId, token });
  }

  disconnect(): void {
    if (!this.socket) return;
    this.socket.removeAllListeners();
    this.socket.disconnect();
    this.socket = null;
  }
}

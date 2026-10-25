import { createServer } from 'node:http';
import { Server, Socket } from 'socket.io';
import type {
  AddAiSeatPayload,
  GameCommand,
  GameStartPayload,
  RemoveAiSeatPayload,
  ResumeRoomPayload,
  RoomJoinedPayload,
} from '@catanx/protocol';
import { SOCKET_EVENTS } from '@catanx/protocol';
import { scheduleRoomAI } from './aiLoop';
import { deleteRoomSave, listRoomSaves, readRoomSave } from './persistence';
import { GameRoom, RoomManager } from './RoomManager';

const PORT = Number(process.env.CATANX_PORT ?? 4000);
const HOST = process.env.CATANX_HOST ?? '127.0.0.1';
const DEFAULT_CORS = ['http://127.0.0.1:3000', 'http://localhost:3000'];
const CORS_ORIGINS = (process.env.CATANX_CORS_ORIGIN ?? DEFAULT_CORS.join(','))
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

const manager = new RoomManager();

const httpServer = createServer((_req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
  res.end('CatanX Server — Multijoueur OK\n');
});

const io = new Server(httpServer, {
  cors: {
    origin: CORS_ORIGINS.length === 1 && CORS_ORIGINS[0] === '*' ? true : CORS_ORIGINS,
    methods: ['GET', 'POST'],
  },
});

function emitRooms(socket?: Socket): void {
  const list = manager.list();
  if (socket) {
    socket.emit(SOCKET_EVENTS.roomsList, list);
    socket.emit(SOCKET_EVENTS.lobbyRooms, list);
  } else {
    io.emit(SOCKET_EVENTS.roomsList, list);
    io.emit(SOCKET_EVENTS.lobbyRooms, list);
  }
}

function emitRoomPlayers(room: GameRoom): void {
  io.to(room.id).emit(SOCKET_EVENTS.roomPlayers, room.playersInfo());
}

function viewerIdForSeat(seat: GameRoom['seats'][number] | undefined): string | null {
  if (!seat || seat.spectator || seat.kind === 'ai') return null;
  return seat.gamePlayerId ?? null;
}

function emitStateSync(room: GameRoom, target?: Socket): void {
  if (!room.state) return;

  if (target) {
    const seat = room.findSeatBySocket(target.id);
    const wire = room.wireStateForViewer(viewerIdForSeat(seat));
    if (!wire) return;
    target.emit(SOCKET_EVENTS.stateSync, { version: room.version, state: wire });
    return;
  }

  for (const seat of room.seats) {
    if (seat.kind === 'ai' || !seat.connected || !seat.socketId) continue;
    const wire = room.wireStateForViewer(viewerIdForSeat(seat));
    if (!wire) continue;
    io.to(seat.socketId).emit(SOCKET_EVENTS.stateSync, {
      version: room.version,
      state: wire,
    });
  }
}

function afterGameMutation(room: GameRoom): void {
  emitStateSync(room);
  room.schedulePersist();
  scheduleRoomAI(room, (active) => {
    emitStateSync(active);
    emitRoomPlayers(active);
    active.schedulePersist();
    if (active.status === 'finished') emitRooms();
  });
}

function errorTo(socket: Socket, message: string): void {
  socket.emit(SOCKET_EVENTS.errorMessage, { message });
}

function joinPayload(room: GameRoom, seat: GameRoom['seats'][number]): RoomJoinedPayload {
  return {
    roomId: room.id,
    name: room.name,
    seatId: seat.seatId,
    reconnectToken: seat.reconnectToken,
    isHost: seat.isHost,
    spectator: seat.spectator,
    players: room.playersInfo(),
  };
}

io.on('connection', (socket) => {
  emitRooms(socket);

  const listHandler = () => emitRooms(socket);
  socket.on(SOCKET_EVENTS.listRooms, listHandler);
  socket.on(SOCKET_EVENTS.lobbyList, listHandler);

  socket.on(
    SOCKET_EVENTS.createRoom,
    (payload: { name?: string; maxPlayers?: number; playerName?: string } = {}) => {
      const previous = manager.roomForSocket(socket.id);
      if (previous) {
        const oldSeat = previous.findSeatBySocket(socket.id);
        if (oldSeat) {
          if (previous.status === 'lobby') {
            previous.removeSeat(oldSeat.seatId);
          } else {
            previous.markDisconnected(socket.id);
          }
        }
        manager.unbindSocket(socket.id);
        void socket.leave(previous.id);
        emitRoomPlayers(previous);
        manager.cleanupEmpty(previous);
      }

      const room = manager.create(payload.name ?? 'Salon CatanX', payload.maxPlayers ?? 4);
      const joined = room.addSeat(socket.id, payload.playerName ?? 'Hôte', false);
      if (!joined.ok) {
        manager.cleanupEmpty(room);
        errorTo(socket, joined.reason);
        return;
      }
      manager.bindSocket(socket.id, room.id);
      void socket.join(room.id);
      socket.emit(SOCKET_EVENTS.roomJoined, joinPayload(room, joined.seat));
      emitRoomPlayers(room);
      emitRooms();
    },
  );

  socket.on(
    SOCKET_EVENTS.joinRoom,
    (payload: { roomId?: string; playerName?: string; spectator?: boolean } = {}) => {
      const roomId = payload.roomId?.trim();
      if (!roomId) {
        errorTo(socket, 'Code salon manquant.');
        return;
      }
      const room = manager.get(roomId);
      if (!room) {
        errorTo(socket, 'Salon introuvable.');
        return;
      }

      const previous = manager.roomForSocket(socket.id);
      if (previous && previous.id !== room.id) {
        const oldSeat = previous.markDisconnected(socket.id);
        if (oldSeat && previous.status === 'lobby') {
          previous.removeSeat(oldSeat.seatId);
        }
        manager.unbindSocket(socket.id);
        void socket.leave(previous.id);
        emitRoomPlayers(previous);
        manager.cleanupEmpty(previous);
      }

      const result = room.addSeat(
        socket.id,
        payload.playerName ?? 'Joueur',
        Boolean(payload.spectator),
      );
      if (!result.ok) {
        errorTo(socket, result.reason);
        return;
      }

      manager.bindSocket(socket.id, room.id);
      void socket.join(room.id);
      socket.emit(SOCKET_EVENTS.roomJoined, joinPayload(room, result.seat));
      emitRoomPlayers(room);
      emitRooms();

      if (room.status === 'playing') {
        emitStateSync(room, socket);
      }
    },
  );

  socket.on(SOCKET_EVENTS.leaveRoom, () => {
    const room = manager.roomForSocket(socket.id);
    if (!room) return;
    const seat = room.findSeatBySocket(socket.id);
    if (seat) {
      if (room.status === 'lobby') {
        room.removeSeat(seat.seatId);
      } else {
        room.markDisconnected(socket.id);
      }
    }
    manager.unbindSocket(socket.id);
    void socket.leave(room.id);
    emitRoomPlayers(room);
    manager.cleanupEmpty(room);
    emitRooms();
  });

  socket.on(SOCKET_EVENTS.playerReady, (payload: { ready?: boolean } = {}) => {
    const room = manager.roomForSocket(socket.id);
    if (!room) return;
    room.setReady(socket.id, Boolean(payload.ready));
    emitRoomPlayers(room);
  });

  socket.on(SOCKET_EVENTS.addAiSeat, (payload: AddAiSeatPayload = {}) => {
    const room = manager.roomForSocket(socket.id);
    if (!room) {
      errorTo(socket, 'Rejoignez un salon d’abord.');
      return;
    }
    const result = room.addAiSeat(socket.id, payload);
    if (!result.ok) {
      errorTo(socket, result.reason);
      return;
    }
    emitRoomPlayers(room);
    emitRooms();
  });

  socket.on(SOCKET_EVENTS.removeAiSeat, (payload: RemoveAiSeatPayload) => {
    const room = manager.roomForSocket(socket.id);
    if (!room) {
      errorTo(socket, 'Rejoignez un salon d’abord.');
      return;
    }
    const seatId = payload?.seatId?.trim();
    if (!seatId) {
      errorTo(socket, 'Siège IA manquant.');
      return;
    }
    const result = room.removeAiSeat(socket.id, seatId);
    if (!result.ok) {
      errorTo(socket, result.reason);
      return;
    }
    emitRoomPlayers(room);
    emitRooms();
  });

  socket.on(SOCKET_EVENTS.gameStart, (payload: GameStartPayload = {}) => {
    const room = manager.roomForSocket(socket.id);
    if (!room) {
      errorTo(socket, 'Rejoignez un salon d’abord.');
      return;
    }
    const started = room.startGame(socket.id, {
      preset: payload.preset,
      config: payload.config,
    });
    if (!started.ok) {
      errorTo(socket, started.reason);
      return;
    }
    emitRoomPlayers(room);
    emitRooms();
    afterGameMutation(room);
  });

  socket.on(SOCKET_EVENTS.playerAction, (payload: Record<string, unknown> = {}) => {
    const room = manager.roomForSocket(socket.id);
    if (!room) {
      errorTo(socket, 'Pas de salon actif.');
      return;
    }

    const command = (payload.command ?? payload) as GameCommand;
    const commandId = typeof payload.id === 'string' ? payload.id : undefined;

    if (!command || typeof command !== 'object' || !('type' in command)) {
      socket.emit(SOCKET_EVENTS.commandRejected, {
        id: commandId,
        code: 'invalid_command',
        reason: 'Commande invalide.',
      });
      return;
    }

    const result = room.applyPlayerCommand(socket.id, command);
    if (!result.ok) {
      socket.emit(SOCKET_EVENTS.commandRejected, {
        id: commandId,
        code: result.code,
        reason: result.reason,
      });
      return;
    }

    if (commandId) {
      socket.emit(SOCKET_EVENTS.commandAccepted, {
        id: commandId,
        sequence: result.sequence,
      });
    }
    afterGameMutation(room);
  });

  socket.on(SOCKET_EVENTS.playerReconnect, (payload: { token?: string; roomId?: string } = {}) => {
    const token = payload.token?.trim();
    const roomId = payload.roomId?.trim();
    if (!token || !roomId) {
      errorTo(socket, 'Reconnexion : jeton ou salon manquant.');
      return;
    }
    let room = manager.get(roomId);
    if (!room) {
      const saved = readRoomSave(roomId);
      if (saved) {
        const resumed = manager.resumeFromSave(saved);
        if (resumed.ok) room = resumed.room;
      }
    }
    if (!room) {
      errorTo(socket, 'Salon introuvable pour reconnexion.');
      return;
    }
    const result = room.reconnect(token, socket.id);
    if (!result.ok) {
      errorTo(socket, result.reason);
      return;
    }
    manager.bindSocket(socket.id, room.id);
    void socket.join(room.id);
    socket.emit(SOCKET_EVENTS.roomJoined, joinPayload(room, result.seat));
    emitRoomPlayers(room);
    emitRooms();
    if (room.status === 'playing') {
      emitStateSync(room, socket);
      scheduleRoomAI(room, (active) => emitStateSync(active));
    }
  });

  socket.on(SOCKET_EVENTS.roomSave, () => {
    const room = manager.roomForSocket(socket.id);
    if (!room) {
      socket.emit(SOCKET_EVENTS.roomSaveAck, {
        ok: false,
        reason: 'Rejoignez un salon d’abord.',
      });
      return;
    }
    const host = room.host();
    if (!host || host.socketId !== socket.id) {
      socket.emit(SOCKET_EVENTS.roomSaveAck, {
        ok: false,
        reason: 'Seul l’hôte peut sauvegarder.',
        roomId: room.id,
      });
      return;
    }
    const saved = room.saveToDisk();
    socket.emit(SOCKET_EVENTS.roomSaveAck, {
      ok: saved.ok,
      reason: saved.ok ? undefined : saved.reason,
      roomId: room.id,
      savedAt: Date.now(),
    });
  });

  socket.on(SOCKET_EVENTS.listSavedRooms, () => {
    socket.emit(SOCKET_EVENTS.savedRoomsList, listRoomSaves());
  });

  socket.on(SOCKET_EVENTS.resumeRoom, (payload: ResumeRoomPayload) => {
    const roomId = payload?.roomId?.trim();
    if (!roomId) {
      errorTo(socket, 'Code salon manquant.');
      return;
    }
    const saved = readRoomSave(roomId);
    if (!saved) {
      errorTo(socket, 'Aucune sauvegarde pour ce salon.');
      return;
    }

    const previous = manager.roomForSocket(socket.id);
    if (previous && previous.id !== roomId) {
      const oldSeat = previous.findSeatBySocket(socket.id);
      if (oldSeat && previous.status === 'lobby') previous.removeSeat(oldSeat.seatId);
      else if (oldSeat) previous.markDisconnected(socket.id);
      manager.unbindSocket(socket.id);
      void socket.leave(previous.id);
      emitRoomPlayers(previous);
      manager.cleanupEmpty(previous);
    }

    const resumed = manager.resumeFromSave(saved);
    if (!resumed.ok) {
      errorTo(socket, resumed.reason);
      return;
    }
    const room = resumed.room;
    const playerName = payload.playerName?.trim() || 'Hôte';
    let seat = room.seats.find(
      (entry) =>
        entry.kind === 'human' &&
        !entry.spectator &&
        entry.name.toLowerCase() === playerName.toLowerCase(),
    );
    if (seat) {
      seat.socketId = socket.id;
      seat.connected = true;
    } else {
      const joined = room.addSeat(socket.id, playerName, false);
      if (!joined.ok) {
        // Salon plein : tenter reclaim hôte déconnecté
        const hostSeat = room.seats.find((entry) => entry.isHost && entry.kind === 'human');
        if (hostSeat && !hostSeat.connected) {
          hostSeat.socketId = socket.id;
          hostSeat.connected = true;
          hostSeat.name = playerName;
          seat = hostSeat;
        } else {
          errorTo(socket, joined.reason);
          return;
        }
      } else {
        seat = joined.seat;
      }
    }
    if (!seat) {
      errorTo(socket, 'Impossible de rejoindre le salon sauvegardé.');
      return;
    }
    if (!room.seats.some((entry) => entry.isHost && entry.kind === 'human' && entry.connected)) {
      seat.isHost = true;
    }
    manager.bindSocket(socket.id, room.id);
    void socket.join(room.id);
    socket.emit(SOCKET_EVENTS.roomJoined, joinPayload(room, seat));
    emitRoomPlayers(room);
    emitRooms();
    if (room.status === 'playing') {
      emitStateSync(room);
      scheduleRoomAI(room, (active) => emitStateSync(active));
    }
  });

  socket.on(
    SOCKET_EVENTS.discardSavedRoom,
    (payload: { roomId?: string; reconnectToken?: string } = {}) => {
      const roomId = payload.roomId?.trim();
      if (!roomId) {
        errorTo(socket, 'Code salon manquant.');
        return;
      }
      const live = manager.get(roomId);
      if (live) {
        const host = live.host();
        if (!host || host.socketId !== socket.id) {
          errorTo(socket, 'Seul l’hôte peut abandonner la sauvegarde.');
          return;
        }
      } else {
        const saved = readRoomSave(roomId);
        if (!saved) {
          socket.emit(SOCKET_EVENTS.savedRoomsList, listRoomSaves());
          return;
        }
        const token = payload.reconnectToken?.trim();
        const authorized =
          Boolean(token) &&
          saved.seats.some(
            (seat) => seat.kind === 'human' && seat.reconnectToken === token,
          );
        if (!authorized) {
          errorTo(
            socket,
            'Abandon réservé à un joueur de cette partie (reconnectez-vous d’abord).',
          );
          return;
        }
      }
      deleteRoomSave(roomId);
      socket.emit(SOCKET_EVENTS.savedRoomsList, listRoomSaves());
    },
  );

  socket.on(SOCKET_EVENTS.chatMessage, (payload: { text?: string } = {}) => {
    const room = manager.roomForSocket(socket.id);
    if (!room) return;
    const seat = room.findSeatBySocket(socket.id);
    const text = String(payload.text ?? '').trim().slice(0, 280);
    if (!text || !seat) return;
    const message = {
      sender: seat.name,
      text,
      timestamp: Date.now(),
    };
    room.chat.push(message);
    if (room.chat.length > 200) room.chat = room.chat.slice(-200);
    io.to(room.id).emit(SOCKET_EVENTS.chatMessage, message);
  });

  socket.on('disconnect', () => {
    const room = manager.roomForSocket(socket.id);
    if (!room) return;
    const seat = room.findSeatBySocket(socket.id);
    manager.unbindSocket(socket.id);
    if (seat) {
      if (room.status === 'lobby') {
        room.removeSeat(seat.seatId);
      } else {
        room.markDisconnected(socket.id);
      }
    }
    emitRoomPlayers(room);
    manager.cleanupEmpty(room);
    emitRooms();
  });
});

httpServer.listen(PORT, HOST, () => {
  console.log(`[CatanX Server] Écoute sur http://${HOST}:${PORT}`);
  console.log(`[CatanX Server] CORS: ${CORS_ORIGINS.join(', ')}`);
  console.log('[CatanX Server] Extensions + IA serveur — salons, sync privée, invite');
});

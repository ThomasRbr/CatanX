import type { GameCommand } from '@catanx/protocol';

export type RemoteSubmitResult = { ok: boolean; reason?: string };

type RemoteSubmitter = (command: GameCommand) => RemoteSubmitResult;

let submitter: RemoteSubmitter | null = null;
let boundPlayerId: string | null = null;
let boundSeatId: string | null = null;
let reconnectToken: string | null = null;
let boundRoomId: string | null = null;

export function enableRemoteSession(options: {
  submit: RemoteSubmitter;
  playerId: string;
  seatId: string;
  reconnectToken: string;
  roomId: string;
}): void {
  submitter = options.submit;
  boundPlayerId = options.playerId;
  boundSeatId = options.seatId;
  reconnectToken = options.reconnectToken;
  boundRoomId = options.roomId;
}

export function updateRemotePlayerId(playerId: string | null): void {
  boundPlayerId = playerId;
}

export function disableRemoteSession(): void {
  submitter = null;
  boundPlayerId = null;
  boundSeatId = null;
  reconnectToken = null;
  boundRoomId = null;
}

export function isRemoteSession(): boolean {
  return submitter !== null;
}

export function getRemotePlayerId(): string | null {
  return boundPlayerId;
}

export function getRemoteSeatId(): string | null {
  return boundSeatId;
}

export function getReconnectToken(): string | null {
  return reconnectToken;
}

export function getRemoteRoomId(): string | null {
  return boundRoomId;
}

export function submitRemoteCommand(command: GameCommand): RemoteSubmitResult {
  if (!submitter) {
    return { ok: false, reason: 'Session réseau inactive.' };
  }
  if ('playerId' in command && boundPlayerId) {
    return submitter({ ...command, playerId: boundPlayerId } as GameCommand);
  }
  return submitter(command);
}

const STORAGE_KEY = 'catanx_mp_session';

export function persistReconnectSession(): void {
  if (typeof localStorage === 'undefined') return;
  if (!reconnectToken || !boundRoomId || !boundSeatId) return;
  localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({
      token: reconnectToken,
      roomId: boundRoomId,
      seatId: boundSeatId,
      playerId: boundPlayerId,
    }),
  );
}

export function loadReconnectSession(): {
  token: string;
  roomId: string;
  seatId: string;
  playerId: string | null;
} | null {
  if (typeof localStorage === 'undefined') return null;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      // migration depuis sessionStorage
      if (typeof sessionStorage !== 'undefined') {
        const legacy = sessionStorage.getItem(STORAGE_KEY);
        if (legacy) {
          localStorage.setItem(STORAGE_KEY, legacy);
          sessionStorage.removeItem(STORAGE_KEY);
          return JSON.parse(legacy) as {
            token: string;
            roomId: string;
            seatId: string;
            playerId: string | null;
          };
        }
      }
      return null;
    }
    return JSON.parse(raw) as {
      token: string;
      roomId: string;
      seatId: string;
      playerId: string | null;
    };
  } catch {
    return null;
  }
}

export function clearReconnectSession(): void {
  if (typeof localStorage !== 'undefined') localStorage.removeItem(STORAGE_KEY);
  if (typeof sessionStorage !== 'undefined') sessionStorage.removeItem(STORAGE_KEY);
}

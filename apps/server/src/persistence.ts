import { mkdirSync, readdirSync, readFileSync, writeFileSync, existsSync, unlinkSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { GameSnapshot } from '@catanx/engine';
import type { RoomAiDifficulty, RoomGamePreset } from '@catanx/protocol';

export interface PersistedSeat {
  seatId: string;
  name: string;
  kind: 'human' | 'ai';
  reconnectToken: string;
  spectator: boolean;
  isHost: boolean;
  ready: boolean;
  aiDifficulty?: RoomAiDifficulty;
  gamePlayerId?: string;
  connected: boolean;
}

export interface RoomSaveFile {
  format: 'catanx-room-v1';
  roomId: string;
  roomName: string;
  maxPlayers: number;
  preset: RoomGamePreset;
  status: 'lobby' | 'playing' | 'finished';
  savedAt: number;
  version: number;
  seats: PersistedSeat[];
  snapshot: GameSnapshot | null;
  turn?: number;
  playerCount?: number;
}

export interface RoomSaveSummary {
  id: string;
  name: string;
  savedAt: number;
  turn: number;
  playerCount: number;
  status: RoomSaveFile['status'];
  seatNames: string[];
}

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const ROOMS_DATA_DIR = path.join(ROOT, 'data', 'rooms');

export function ensureRoomsDir(): void {
  mkdirSync(ROOMS_DATA_DIR, { recursive: true });
}

function roomPath(roomId: string): string {
  const safe = roomId.replace(/[^a-zA-Z0-9_-]/g, '_');
  return path.join(ROOMS_DATA_DIR, `${safe}.json`);
}

export function writeRoomSave(file: RoomSaveFile): void {
  ensureRoomsDir();
  writeFileSync(roomPath(file.roomId), JSON.stringify(file, null, 2), 'utf8');
}

export function readRoomSave(roomId: string): RoomSaveFile | null {
  const file = roomPath(roomId);
  if (!existsSync(file)) return null;
  try {
    const parsed = JSON.parse(readFileSync(file, 'utf8')) as RoomSaveFile;
    if (parsed.format !== 'catanx-room-v1' || !parsed.roomId) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function listRoomSaves(): RoomSaveSummary[] {
  ensureRoomsDir();
  const entries = readdirSync(ROOMS_DATA_DIR).filter((name) => name.endsWith('.json'));
  const summaries: RoomSaveSummary[] = [];
  for (const entry of entries) {
    try {
      const parsed = JSON.parse(
        readFileSync(path.join(ROOMS_DATA_DIR, entry), 'utf8'),
      ) as RoomSaveFile;
      if (parsed.format !== 'catanx-room-v1') continue;
      summaries.push({
        id: parsed.roomId,
        name: parsed.roomName,
        savedAt: parsed.savedAt,
        turn: parsed.turn ?? parsed.snapshot?.state?.currentTurn ?? 0,
        playerCount: parsed.playerCount ?? parsed.seats.filter((s) => !s.spectator).length,
        status: parsed.status,
        seatNames: parsed.seats.filter((s) => !s.spectator).map((s) => s.name),
      });
    } catch {
      /* skip corrupt */
    }
  }
  return summaries.sort((a, b) => b.savedAt - a.savedAt);
}

export function deleteRoomSave(roomId: string): boolean {
  const file = roomPath(roomId);
  if (!existsSync(file)) return false;
  try {
    unlinkSync(file);
    return true;
  } catch {
    return false;
  }
}

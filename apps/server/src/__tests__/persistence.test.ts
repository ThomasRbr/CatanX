import { afterEach, describe, expect, it } from 'vitest';
import { GameRoom, RoomManager } from '../RoomManager';
import { deleteRoomSave, listRoomSaves, readRoomSave } from '../persistence';

describe('room persistence', () => {
  let roomId: string | null = null;

  afterEach(() => {
    if (roomId) {
      deleteRoomSave(roomId);
      roomId = null;
    }
  });

  it('saves and resumes a room with same id and tokens', () => {
    const room = new GameRoom('Persist', 4);
    const human = room.addSeat('sockA', 'Alice', false);
    expect(human.ok).toBe(true);
    if (!human.ok) return;
    expect(room.addAiSeat('sockA', { name: 'Bot' }).ok).toBe(true);
    expect(
      room.startGame('sockA', { preset: 'catanx', config: { mapSeed: 99 } }).ok,
    ).toBe(true);

    const token = human.seat.reconnectToken;
    roomId = room.id;
    const saved = room.saveToDisk();
    expect(saved.ok).toBe(true);

    const file = readRoomSave(roomId);
    expect(file).toBeTruthy();
    expect(file?.seats.find((s) => s.name === 'Alice')?.reconnectToken).toBe(token);

    const manager = new RoomManager();
    const resumed = manager.resumeFromSave(file!);
    expect(resumed.ok).toBe(true);
    if (!resumed.ok) return;
    expect(resumed.room.id).toBe(roomId);
    expect(resumed.room.state).toBeTruthy();
    const alice = resumed.room.seats.find((s) => s.name === 'Alice');
    expect(alice?.reconnectToken).toBe(token);
    expect(listRoomSaves().some((entry) => entry.id === roomId)).toBe(true);
  });
});

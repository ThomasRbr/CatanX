import { beforeEach, describe, expect, it } from 'vitest';
import {
  buildExportBundle,
  buildMetaFromState,
  deleteSaveById,
  findFreeManualSlot,
  getMostRecentSave,
  listLoadableSaves,
  loadSaveMetadata,
  parseImportBundle,
  renameSaveById,
  slotToId,
  writeSavePayload,
} from '../saveSlots';
import type { GameState } from '@catanx/engine';

function createMemoryStorage(): Storage {
  const map = new Map<string, string>();
  return {
    get length() {
      return map.size;
    },
    clear() {
      map.clear();
    },
    getItem(key: string) {
      return map.has(key) ? map.get(key)! : null;
    },
    key(index: number) {
      return [...map.keys()][index] ?? null;
    },
    removeItem(key: string) {
      map.delete(key);
    },
    setItem(key: string, value: string) {
      map.set(key, String(value));
    },
  };
}

Object.defineProperty(globalThis, 'localStorage', {
  value: createMemoryStorage(),
  configurable: true,
  writable: true,
});

function fakeState(turn = 3): GameState {
  return {
    currentTurn: turn,
    players: new Map([
      ['p1', { id: 'p1' }],
      ['p2', { id: 'p2' }],
    ]),
    config: { mapSeed: 42, mode: 'classic' },
    phase: 'playing',
  } as unknown as GameState;
}

describe('saveSlots', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('writes and lists a manual slot', () => {
    const meta = buildMetaFromState(fakeState(), 2, 'Test slot');
    const result = writeSavePayload(meta, JSON.stringify({ schemaVersion: 6, state: {} }));
    expect(result.ok).toBe(true);
    const list = loadSaveMetadata();
    expect(list.some((entry) => entry.slot === 2 && entry.name === 'Test slot')).toBe(true);
    expect(findFreeManualSlot()).not.toBe(2);
  });

  it('renames and deletes a save', () => {
    const meta = buildMetaFromState(fakeState(), 1, 'Old');
    writeSavePayload(meta, '{}');
    const renamed = renameSaveById(slotToId(1), 'New name');
    expect(renamed?.find((entry) => entry.slot === 1)?.name).toBe('New name');
    deleteSaveById(slotToId(1));
    expect(loadSaveMetadata().some((entry) => entry.slot === 1)).toBe(false);
  });

  it('export/import round-trip', () => {
    const meta = buildMetaFromState(fakeState(5), 3, 'Export me');
    writeSavePayload(meta, JSON.stringify({ schemaVersion: 6, hello: true }));
    const bundle = buildExportBundle(slotToId(3));
    expect(bundle?.format).toBe('catanx-save-v1');
    const raw = JSON.stringify(bundle);
    deleteSaveById(slotToId(3));
    const parsed = parseImportBundle(raw);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    const id = slotToId(4);
    writeSavePayload(
      { ...parsed.bundle.meta, id, slot: 4 },
      parsed.bundle.payload,
    );
    expect(loadSaveMetadata().some((entry) => entry.slot === 4)).toBe(true);
  });

  it('ignores orphan meta without payload for continue', () => {
    localStorage.setItem(
      'catanx_saves_v2',
      JSON.stringify([
        {
          id: 'slot_1',
          slot: 1,
          name: 'Ghost',
          turn: 1,
          updatedAt: Date.now(),
          playerCount: 2,
          mapSeed: 1,
        },
      ]),
    );
    localStorage.setItem('catanx_saves_migrated_v2', '1');
    expect(listLoadableSaves()).toHaveLength(0);
    expect(getMostRecentSave()).toBeNull();
  });
});

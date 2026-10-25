import type { GameState } from '@catanx/engine';
import { SCHEMA_VERSION } from '@catanx/engine';

export type ManualSaveSlot = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;
export type SaveSlotId = ManualSaveSlot | 'auto';

export const MANUAL_SAVE_SLOTS: ManualSaveSlot[] = [1, 2, 3, 4, 5, 6, 7, 8];

export interface GameSaveMeta {
  id: string;
  slot: SaveSlotId;
  name: string;
  turn: number;
  updatedAt: number;
  playerCount: number;
  mapSeed: number;
  mode?: string;
  phase?: string;
  schemaVersion?: number;
}

const SAVE_META_KEY = 'catanx_saves_v2';
const LEGACY_META_KEY = 'catanx_saves';
const SAVE_DATA_KEY_PREFIX = 'catanx_save_';
const MIGRATION_FLAG = 'catanx_saves_migrated_v2';

export function slotToId(slot: SaveSlotId): string {
  return slot === 'auto' ? 'slot_auto' : `slot_${slot}`;
}

export function idToSlot(id: string): SaveSlotId | null {
  if (id === 'slot_auto') return 'auto';
  const match = /^slot_([1-8])$/.exec(id);
  if (!match) return null;
  return Number(match[1]) as ManualSaveSlot;
}

function getLocalStorage(): Storage | null {
  try {
    if (typeof window !== 'undefined' && window.localStorage) return window.localStorage;
    if (typeof globalThis !== 'undefined') {
      const storage = (globalThis as { localStorage?: Storage }).localStorage;
      if (storage) return storage;
    }
  } catch {
    return null;
  }
  return null;
}

export function localStorageAvailable(): boolean {
  const storage = getLocalStorage();
  if (!storage) return false;
  try {
    const probe = '__catanx_ls_probe__';
    storage.setItem(probe, '1');
    storage.removeItem(probe);
    return true;
  } catch {
    return false;
  }
}

function readMetaRaw(): GameSaveMeta[] {
  const storage = getLocalStorage();
  if (!storage) return [];
  try {
    const raw = storage.getItem(SAVE_META_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as GameSaveMeta[];
    if (!Array.isArray(parsed)) return [];
    return parsed;
  } catch {
    return [];
  }
}

function writeMeta(saves: GameSaveMeta[]): void {
  const storage = getLocalStorage();
  if (!storage) return;
  storage.setItem(SAVE_META_KEY, JSON.stringify(saves));
}

/** Migre l’ancien format append-only vers les slots v2 (une fois). */
export function migrateLegacySavesIfNeeded(): void {
  const storage = getLocalStorage();
  if (!storage) return;
  if (storage.getItem(MIGRATION_FLAG) === '1') return;

  try {
    const legacyRaw = storage.getItem(LEGACY_META_KEY);
    const existing = readMetaRaw();
    if (!legacyRaw) {
      storage.setItem(MIGRATION_FLAG, '1');
      return;
    }

    const legacy = JSON.parse(legacyRaw) as Array<{
      id: string;
      name: string;
      turn: number;
      updatedAt: number;
      playerCount: number;
      mapSeed: number;
    }>;
    if (!Array.isArray(legacy) || legacy.length === 0) {
      storage.setItem(MIGRATION_FLAG, '1');
      return;
    }

    const byUpdated = [...legacy].sort((a, b) => b.updatedAt - a.updatedAt);
    const next = [...existing];
    let slotIndex = 0;
    for (const entry of byUpdated) {
      if (slotIndex >= MANUAL_SAVE_SLOTS.length) break;
      const slot = MANUAL_SAVE_SLOTS[slotIndex]!;
      const id = slotToId(slot);
      if (next.some((s) => s.slot === slot)) {
        slotIndex += 1;
        continue;
      }
      const data = storage.getItem(`${SAVE_DATA_KEY_PREFIX}${entry.id}`);
      if (data) {
        storage.setItem(`${SAVE_DATA_KEY_PREFIX}${id}`, data);
      }
      next.push({
        id,
        slot,
        name: entry.name,
        turn: entry.turn,
        updatedAt: entry.updatedAt,
        playerCount: entry.playerCount,
        mapSeed: entry.mapSeed,
        schemaVersion: SCHEMA_VERSION,
      });
      slotIndex += 1;
    }
    writeMeta(next);
    storage.setItem(MIGRATION_FLAG, '1');
  } catch {
    /* Ne pas marquer migré : réessayer au prochain démarrage. */
  }
}

export function loadSaveMetadata(): GameSaveMeta[] {
  migrateLegacySavesIfNeeded();
  return readMetaRaw().sort((a, b) => {
    if (a.slot === 'auto' && b.slot !== 'auto') return -1;
    if (b.slot === 'auto' && a.slot !== 'auto') return 1;
    if (typeof a.slot === 'number' && typeof b.slot === 'number') return a.slot - b.slot;
    return b.updatedAt - a.updatedAt;
  });
}

export function getSaveBySlot(slot: SaveSlotId): GameSaveMeta | undefined {
  return loadSaveMetadata().find((entry) => entry.slot === slot);
}

export function getMostRecentSave(): GameSaveMeta | null {
  const all = listLoadableSaves();
  if (all.length === 0) return null;
  return [...all].sort((a, b) => b.updatedAt - a.updatedAt)[0] ?? null;
}

/** Métas dont le payload est encore présent (évite Continuer orphelin). */
export function listLoadableSaves(): GameSaveMeta[] {
  return loadSaveMetadata().filter((entry) => Boolean(readSavePayload(entry.id)));
}

export function buildMetaFromState(
  state: GameState,
  slot: SaveSlotId,
  name?: string,
): GameSaveMeta {
  const id = slotToId(slot);
  const defaultName =
    slot === 'auto'
      ? `Autosave T${state.currentTurn}`
      : `Slot ${slot} — T${state.currentTurn}`;
  return {
    id,
    slot,
    name: name?.trim() || getSaveBySlot(slot)?.name || defaultName,
    turn: state.currentTurn,
    updatedAt: Date.now(),
    playerCount: state.players.size,
    mapSeed: state.config.mapSeed,
    mode: state.config.mode,
    phase: state.phase,
    schemaVersion: SCHEMA_VERSION,
  };
}

export function writeSavePayload(
  meta: GameSaveMeta,
  payload: string,
): { ok: true } | { ok: false; reason: string } {
  const storage = getLocalStorage();
  if (!storage) return { ok: false, reason: 'Stockage local indisponible' };
  try {
    storage.setItem(`${SAVE_DATA_KEY_PREFIX}${meta.id}`, payload);
    const others = loadSaveMetadata().filter((entry) => entry.id !== meta.id);
    writeMeta([meta, ...others]);
    return { ok: true };
  } catch {
    return { ok: false, reason: 'Échec de la sauvegarde (quota ?)' };
  }
}

export function readSavePayload(id: string): string | null {
  const storage = getLocalStorage();
  if (!storage) return null;
  return storage.getItem(`${SAVE_DATA_KEY_PREFIX}${id}`);
}

export function deleteSaveById(id: string): GameSaveMeta[] {
  const storage = getLocalStorage();
  if (!storage) return [];
  const next = loadSaveMetadata().filter((entry) => entry.id !== id);
  storage.removeItem(`${SAVE_DATA_KEY_PREFIX}${id}`);
  writeMeta(next);
  return next;
}

export function renameSaveById(id: string, name: string): GameSaveMeta[] | null {
  const trimmed = name.trim().slice(0, 64);
  if (!trimmed) return null;
  const all = loadSaveMetadata();
  const index = all.findIndex((entry) => entry.id === id);
  if (index < 0) return null;
  const next = [...all];
  next[index] = { ...next[index]!, name: trimmed, updatedAt: Date.now() };
  writeMeta(next);
  return next;
}

export interface ExportSaveBundle {
  format: 'catanx-save-v1';
  meta: GameSaveMeta;
  payload: string;
}

export function buildExportBundle(id: string): ExportSaveBundle | null {
  const meta = loadSaveMetadata().find((entry) => entry.id === id);
  const payload = readSavePayload(id);
  if (!meta || !payload) return null;
  return { format: 'catanx-save-v1', meta, payload };
}

export function parseImportBundle(
  raw: string,
): { ok: true; bundle: ExportSaveBundle } | { ok: false; reason: string } {
  try {
    const parsed = JSON.parse(raw) as ExportSaveBundle & { randomSeed?: number };
    if (parsed.format === 'catanx-save-v1' && parsed.meta && parsed.payload) {
      return { ok: true, bundle: parsed };
    }
    // Snapshot engine brut
    const asSnapshot = JSON.parse(raw) as { schemaVersion?: number; state?: unknown };
    if (asSnapshot.schemaVersion && asSnapshot.state) {
      const bundle: ExportSaveBundle = {
        format: 'catanx-save-v1',
        meta: {
          id: 'import_temp',
          slot: 1,
          name: `Import ${new Date().toLocaleDateString('fr-FR')}`,
          turn: 0,
          updatedAt: Date.now(),
          playerCount: 0,
          mapSeed: 0,
          schemaVersion: asSnapshot.schemaVersion,
        },
        payload: raw,
      };
      return { ok: true, bundle };
    }
    return { ok: false, reason: 'Fichier de sauvegarde non reconnu' };
  } catch {
    return { ok: false, reason: 'JSON invalide' };
  }
}

export function findFreeManualSlot(): ManualSaveSlot | null {
  const used = new Set(
    loadSaveMetadata()
      .filter((entry) => entry.slot !== 'auto')
      .map((entry) => entry.slot),
  );
  for (const slot of MANUAL_SAVE_SLOTS) {
    if (!used.has(slot)) return slot;
  }
  return null;
}

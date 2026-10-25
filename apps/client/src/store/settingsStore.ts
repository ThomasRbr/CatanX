import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import type {
  AITurnSpeed,
  GraphicsBackend,
  MapRenderer,
  VisualQuality,
} from './settingsTypes';

export type { AITurnSpeed, GraphicsBackend, MapRenderer, VisualQuality } from './settingsTypes';

interface SettingsStoreState {
  musicVolume: number;
  sfxVolume: number;
  cameraSensitivity: number;
  showGrid: boolean;
  showAnimations: boolean;
  /** H4 — ambient / FX playback rate. */
  animationSpeed: 0.5 | 1 | 1.5 | 2;
  guidedTurnUI: boolean;
  showAdvancedPanels: boolean;
  reducedMotion: boolean;
  highContrast: boolean;
  aiTurnSpeed: AITurnSpeed;
  showFpsMeter: boolean;
  /** Map renderer — Three by default (Phase G); Pixi kept as legacy fallback. */
  mapRenderer: MapRenderer;
  /** Preferred GPU backend. WebGPU is opt-in until visual/picking parity is reached. */
  graphicsBackend: GraphicsBackend;
  /** CatanX Next — graphics quality preference. */
  visualQuality: VisualQuality;
  /** UI scale multiplier (0.85–1.25). */
  uiScale: number;
  setMusicVolume: (value: number) => void;
  setSfxVolume: (value: number) => void;
  setCameraSensitivity: (value: number) => void;
  setShowGrid: (value: boolean) => void;
  setShowAnimations: (value: boolean) => void;
  setAnimationSpeed: (value: 0.5 | 1 | 1.5 | 2) => void;
  setGuidedTurnUI: (value: boolean) => void;
  setShowAdvancedPanels: (value: boolean) => void;
  setReducedMotion: (value: boolean) => void;
  setHighContrast: (value: boolean) => void;
  setAiTurnSpeed: (value: AITurnSpeed) => void;
  setShowFpsMeter: (value: boolean) => void;
  setMapRenderer: (value: MapRenderer) => void;
  setGraphicsBackend: (value: GraphicsBackend) => void;
  setVisualQuality: (value: VisualQuality) => void;
  setUiScale: (value: number) => void;
}

/** Persist schema version — bump when migrate needs to run again. */
export const SETTINGS_PERSIST_VERSION = 5;

/**
 * Phase G: force Three only when upgrading from pre-G (version &lt; 1).
 * v2: add visualQuality + uiScale defaults.
 * v3: recover Three after a transient renderer failure was accidentally persisted as Pixi.
 */
export function migrateSettingsState(
  persisted: unknown,
  fromVersion: number,
): Partial<SettingsStoreState> {
  const state = (persisted ?? {}) as Partial<SettingsStoreState>;
  let next = { ...state };
  if (fromVersion < 1) {
    next = { ...next, mapRenderer: 'diorama' };
  }
  if (fromVersion < 2) {
    next = {
      ...next,
      visualQuality: next.visualQuality ?? 'auto',
      uiScale: typeof next.uiScale === 'number' ? next.uiScale : 1,
    };
  }
  if (fromVersion < 3) {
    next = { ...next, mapRenderer: 'diorama' };
  }
  if (fromVersion < 4) {
    const supported: VisualQuality[] = ['auto', 'low', 'balanced', 'high', 'ultra'];
    next = {
      ...next,
      visualQuality: supported.includes(next.visualQuality as VisualQuality)
        ? next.visualQuality
        : 'auto',
    };
  }
  if (fromVersion < 5) {
    const legacyRenderer = (next as Partial<SettingsStoreState> & { mapRenderer?: string })
      .mapRenderer;
    next = {
      ...next,
      mapRenderer: legacyRenderer === 'pixi' ? 'pixi' : 'diorama',
      graphicsBackend: next.graphicsBackend ?? 'auto',
    };
  }
  return next;
}

function clampUiScale(value: number): number {
  return Math.min(1.25, Math.max(0.85, Math.round(value * 100) / 100));
}

export const useSettingsStore = create<SettingsStoreState>()(
  persist(
    (set) => ({
      musicVolume: 0.6,
      sfxVolume: 0.8,
      cameraSensitivity: 1,
      showGrid: false,
      showAnimations: true,
      animationSpeed: 1,
      guidedTurnUI: true,
      showAdvancedPanels: false,
      reducedMotion: false,
      highContrast: false,
      aiTurnSpeed: 'normal',
      showFpsMeter: false,
      mapRenderer: 'diorama',
      graphicsBackend: 'auto',
      visualQuality: 'auto',
      uiScale: 1,

      setMusicVolume: (musicVolume) => set({ musicVolume }),
      setSfxVolume: (sfxVolume) => set({ sfxVolume }),
      setCameraSensitivity: (cameraSensitivity) => set({ cameraSensitivity }),
      setShowGrid: (showGrid) => set({ showGrid }),
      setShowAnimations: (showAnimations) => set({ showAnimations }),
      setAnimationSpeed: (animationSpeed) => set({ animationSpeed }),
      setGuidedTurnUI: (guidedTurnUI) => set({ guidedTurnUI }),
      setShowAdvancedPanels: (showAdvancedPanels) => set({ showAdvancedPanels }),
      setReducedMotion: (reducedMotion) => set({ reducedMotion }),
      setHighContrast: (highContrast) => set({ highContrast }),
      setAiTurnSpeed: (aiTurnSpeed) => set({ aiTurnSpeed }),
      setShowFpsMeter: (showFpsMeter) => set({ showFpsMeter }),
      setMapRenderer: (mapRenderer) => set({ mapRenderer }),
      setGraphicsBackend: (graphicsBackend) => set({ graphicsBackend }),
      setVisualQuality: (visualQuality) => set({ visualQuality }),
      setUiScale: (uiScale) => set({ uiScale: clampUiScale(uiScale) }),
    }),
    {
      name: 'catanx_frontend_settings_v1',
      storage: createJSONStorage(() => localStorage),
      version: SETTINGS_PERSIST_VERSION,
      migrate: (persisted, fromVersion) => migrateSettingsState(persisted, fromVersion),
      partialize: (state) => ({
        musicVolume: state.musicVolume,
        sfxVolume: state.sfxVolume,
        cameraSensitivity: state.cameraSensitivity,
        showGrid: state.showGrid,
        showAnimations: state.showAnimations,
        animationSpeed: state.animationSpeed,
        guidedTurnUI: state.guidedTurnUI,
        showAdvancedPanels: state.showAdvancedPanels,
        reducedMotion: state.reducedMotion,
        highContrast: state.highContrast,
        aiTurnSpeed: state.aiTurnSpeed,
        showFpsMeter: state.showFpsMeter,
        mapRenderer: state.mapRenderer,
        graphicsBackend: state.graphicsBackend,
        visualQuality: state.visualQuality,
        uiScale: state.uiScale,
      }),
    },
  ),
);

import { create } from 'zustand';

export type ModalType =
  | 'event'
  | 'diplomacy'
  | 'tech-tree'
  | 'civ-select'
  | 'victory'
  | 'settings'
  | 'help'
  | null;

export type ScreenView = 'main-menu' | 'game-setup' | 'load-game' | 'multiplayer-lobby' | 'in-game';

export type ClassicBuildMode = 'settlement' | 'road' | 'city' | 'ck_knight';

interface UIStoreState {
  screen: ScreenView;
  selectedTileId: string | null;
  hoveredTileId: string | null;
  highlightedTiles: string[];
  activeModal: ModalType;
  isRightPanelOpen: boolean;
  sidePanelTab: 'tile' | 'build' | 'trade' | 'units' | 'city';
  activeUnitId: string | null;
  unitCommandMode: 'move' | 'attack' | null;
  classicBuildMode: ClassicBuildMode | null;
  hotseatMode: boolean;
  viewingPlayerId: string | null;
  privacyScreenPlayerId: string | null;
  setScreen: (screen: ScreenView) => void;
  setSelectedTileId: (tileId: string | null) => void;
  setHoveredTileId: (tileId: string | null) => void;
  setHighlightedTiles: (tileIds: string[]) => void;
  openModal: (modal: Exclude<ModalType, null>) => void;
  closeModal: () => void;
  setRightPanelOpen: (isOpen: boolean) => void;
  setSidePanelTab: (tab: UIStoreState['sidePanelTab']) => void;
  setActiveUnitId: (unitId: string | null) => void;
  setUnitCommandMode: (mode: UIStoreState['unitCommandMode']) => void;
  clearUnitCommand: () => void;
  setClassicBuildMode: (mode: ClassicBuildMode | null) => void;
  clearClassicBuildMode: () => void;
  setHotseatMode: (enabled: boolean) => void;
  setViewingPlayerId: (playerId: string | null) => void;
  showPrivacyScreen: (playerId: string) => void;
  dismissPrivacyScreen: () => void;
  resetInGameUI: () => void;
}

export const useUIStore = create<UIStoreState>((set) => ({
  screen: 'main-menu',
  selectedTileId: null,
  hoveredTileId: null,
  highlightedTiles: [],
  activeModal: null,
  isRightPanelOpen: true,
  sidePanelTab: 'tile',
  activeUnitId: null,
  unitCommandMode: null,
  classicBuildMode: null,
  hotseatMode: false,
  viewingPlayerId: null,
  privacyScreenPlayerId: null,

  setScreen: (screen) => set({ screen }),
  setSelectedTileId: (selectedTileId) => set({ selectedTileId }),
  setHoveredTileId: (hoveredTileId) => set({ hoveredTileId }),
  setHighlightedTiles: (highlightedTiles) => set({ highlightedTiles }),
  openModal: (activeModal) => set({ activeModal }),
  closeModal: () => set({ activeModal: null }),
  setRightPanelOpen: (isRightPanelOpen) => set({ isRightPanelOpen }),
  setSidePanelTab: (sidePanelTab) => set({ sidePanelTab }),
  setActiveUnitId: (activeUnitId) => set({ activeUnitId }),
  setUnitCommandMode: (unitCommandMode) => set({ unitCommandMode, classicBuildMode: null }),
  clearUnitCommand: () => set({ activeUnitId: null, unitCommandMode: null }),
  setClassicBuildMode: (classicBuildMode) =>
    set({ classicBuildMode, activeUnitId: null, unitCommandMode: null }),
  clearClassicBuildMode: () => set({ classicBuildMode: null }),
  setHotseatMode: (hotseatMode) => set({ hotseatMode }),
  setViewingPlayerId: (viewingPlayerId) => set({ viewingPlayerId }),
  showPrivacyScreen: (privacyScreenPlayerId) => set({ privacyScreenPlayerId }),
  dismissPrivacyScreen: () =>
    set((state) => ({
      privacyScreenPlayerId: null,
      viewingPlayerId: state.privacyScreenPlayerId,
    })),
  resetInGameUI: () =>
    set({
      selectedTileId: null,
      hoveredTileId: null,
      highlightedTiles: [],
      activeModal: null,
      isRightPanelOpen: true,
      sidePanelTab: 'tile',
      activeUnitId: null,
      unitCommandMode: null,
      classicBuildMode: null,
      viewingPlayerId: null,
      privacyScreenPlayerId: null,
    }),
}));

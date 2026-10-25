import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  CivilizationType,
  type ActionLogEntry,
  type CkProgressPlayImpact,
  type ResourceType,
  type Season,
  type SeasonClimateId,
} from '@catanx/engine';
import {
  getPortTradeRatio,
  getClimateDefinition,
  getPublicDevCardCount,
  getPublicResourceCount,
  hasPlayerRolledDiceThisTurn,
  hasResources,
  isCitiesKnightsEnabled,
  isSeasonsEnabled,
  isUndergroundSkyEnabled,
  isPactsEmbassiesEnabled,
  getMaterialBankTradeRatio,
  ckHandLimit,
  listKnightRecruitSpots,
  totalResources,
  usesLimitedBank,
  usesTopologicalPlacement,
  validateSetupPlacement,
} from '@catanx/engine';
import {
  listClassicCityCandidates,
  listClassicRoadCandidates,
  listClassicSettlementCandidates,
} from '@catanx/engine';
import { TechTreeEngine } from '@catanx/engine';
import { MapErrorBoundary } from './components/Map/MapErrorBoundary';
import { ResourceBar } from './components/HUD/ResourceBar';
import { PlayableCardHand } from './components/HUD/PlayableCardHand';
import { TurnIndicator } from './components/HUD/TurnIndicator';
import { TurnMoment } from './components/HUD/TurnMoment';
import { DiceRollOverlay } from './components/HUD/DiceRollOverlay';
import { ResourceFlightLayer } from './components/HUD/ResourceFlightLayer';
import { CollectionSummary, type CollectionSummaryEntry } from './components/HUD/CollectionSummary';
import { SeasonWidget } from './components/HUD/SeasonWidget';
import { CitiesKnightsPanel } from './components/Panels/CitiesKnightsPanel';
import { UndergroundSkyPanel } from './components/Panels/UndergroundSkyPanel';
import { PactsEmbassiesPanel } from './components/Panels/PactsEmbassiesPanel';
import { LayerSelector, type BoardLayer } from './components/HUD/LayerSelector';
import { EventNotification } from './components/HUD/EventNotification';
import { ActionFeed } from './components/HUD/ActionFeed';
import { TurnRecap } from './components/HUD/TurnRecap';
import { CkMoment, type CkMomentKind } from './components/HUD/CkMoment';
import { ProgressImpactMoment } from './components/HUD/ProgressImpactMoment';
import { SeasonTransitionMoment } from './components/HUD/SeasonTransitionMoment';
import { OpponentPrepShelf } from './components/HUD/OpponentPrepShelf';
import { TurnActionPlanner } from './components/HUD/TurnActionPlanner';
import { InitialPlacementPanel } from './components/HUD/InitialPlacementPanel';
import { RobberStealPanel } from './components/HUD/RobberStealPanel';
import { FpsOverlay } from './components/HUD/FpsOverlay';
import { DiscardModal } from './components/Modals/DiscardModal';
import { PrivacyScreen } from './components/Modals/PrivacyScreen';
import { DevCardPanel } from './components/Panels/DevCardPanel';
import { BankTradePanel } from './components/Panels/BankTradePanel';
import { PlayerTradePanel } from './components/Panels/PlayerTradePanel';
import { TileInfoPanel } from './components/Panels/TileInfoPanel';
import { EventModal } from './components/Modals/EventModal';
import { SettingsModal } from './components/Modals/SettingsModal';
import { CivSelectModal } from './components/Modals/CivSelectModal';
import { VictoryModal } from './components/Modals/VictoryModal';
import { BuildMenu } from './components/Panels/BuildMenu';
import { TradeMenu } from './components/Panels/TradeMenu';
import { UnitActions } from './components/Panels/UnitActions';
import { CityDetails } from './components/Panels/CityDetails';
import { DiplomacyPanel } from './components/HUD/DiplomacyPanel';
import { TechPanel } from './components/HUD/TechPanel';
import { MilitaryPanel } from './components/HUD/MilitaryPanel';
import { CouncilPanel } from './components/HUD/CouncilPanel';
import { MainMenu } from './components/Menus/MainMenu';
import type { SetupPayload } from './components/Menus/GameSetup';
import {
  LazyCraftPanel,
  LazyDiplomacyModal,
  LazyFallback,
  LazyGameSetup,
  LazyHelpGuideModal,
  LazyLoadGame,
  LazyMapBoard,
  LazyMultiplayerLobby,
  LazyTechTreeModal,
} from './lazy/screens';
import { MultiplayerChat } from './components/HUD/MultiplayerChat';
import { MultiplayerStatusPanel } from './components/HUD/MultiplayerStatusPanel';
import { InGameSessionMenu } from './components/HUD/InGameSessionMenu';
import {
  buildInviteUrl,
  buildMultiplayerStartConfig,
  DEFAULT_MULTIPLAYER_LOBBY_CONFIG,
} from './components/Menus/MultiplayerLobby';
import { SaveSlotModal } from './components/Menus/SaveSlotModal';
import { ChatBubbles } from './components/HUD/ChatBubbles';
import { useGameStore, listLoadableSaves } from './store/gameStore';
import { useUIStore } from './store/uiStore';
import { useSettingsStore } from './store/settingsStore';
import { useHexClick } from './hooks/useHexClick';
import { useGameActions } from './hooks/useGameActions';
import { useAudio } from './hooks/useAudio';
import { useAnimations } from './hooks/useAnimations';
import { useMotionPreference } from './hooks/useMotionPreference';
import { LiveRegion } from './components/a11y/LiveRegion';
import { Icon } from './ui';
import { PhaseBanner } from './components/HUD/PhaseBanner';
import { frErrorMessage, frGenericLabel, frResource, frTurnPhase } from './i18n/fr';
import type { BoardViewMode } from './render3d/camera/viewMode';
import {
  MultiplayerChatMessage,
  MultiplayerClient,
  MultiplayerRoomPlayer,
  MultiplayerRoomSummary,
} from './network/MultiplayerClient';
import {
  clearReconnectSession,
  disableRemoteSession,
  enableRemoteSession,
  getRemotePlayerId,
  getReconnectToken,
  getRemoteRoomId,
  isRemoteSession,
  loadReconnectSession,
  persistReconnectSession,
  updateRemotePlayerId,
} from './network/remoteSession';

export function App() {
  const gameState = useGameStore((s) => s.gameState);
  const currentPlayerId = useGameStore((s) => s.currentPlayerId);
  const initializeGame = useGameStore((s) => s.initializeGame);
  const setGameStateFromNetwork = useGameStore((s) => s.setGameState);
  const reportActionError = useGameStore((s) => s.reportActionError);
  const refreshSaves = useGameStore((s) => s.refreshSaves);
  const saves = useGameStore((s) => s.saves);
  const loadGame = useGameStore((s) => s.loadGame);
  const loadMostRecentSave = useGameStore((s) => s.loadMostRecentSave);
  const deleteSave = useGameStore((s) => s.deleteSave);
  const saveToSlot = useGameStore((s) => s.saveToSlot);
  const autoSave = useGameStore((s) => s.autoSave);
  const renameSave = useGameStore((s) => s.renameSave);
  const exportSave = useGameStore((s) => s.exportSave);
  const importSave = useGameStore((s) => s.importSave);
  const forceSync = useGameStore((s) => s.forceSync);
  const clearError = useGameStore((s) => s.clearError);
  const lastActionError = useGameStore((s) => s.lastActionError);
  const initialPlacement = useGameStore((s) => s.initialPlacement);

  const hotseatMode = useUIStore((s) => s.hotseatMode);
  const viewingPlayerId = useUIStore((s) => s.viewingPlayerId);
  const privacyScreenPlayerId = useUIStore((s) => s.privacyScreenPlayerId);
  const setHotseatMode = useUIStore((s) => s.setHotseatMode);
  const showPrivacyScreen = useUIStore((s) => s.showPrivacyScreen);
  const dismissPrivacyScreen = useUIStore((s) => s.dismissPrivacyScreen);

  const screen = useUIStore((s) => s.screen);
  const setScreen = useUIStore((s) => s.setScreen);
  const resetInGameUI = useUIStore((s) => s.resetInGameUI);
  const selectedTileId = useUIStore((s) => s.selectedTileId);
  const setHighlightedTiles = useUIStore((s) => s.setHighlightedTiles);
  const highlightedTiles = useUIStore((s) => s.highlightedTiles);
  const activeModal = useUIStore((s) => s.activeModal);
  const sidePanelTab = useUIStore((s) => s.sidePanelTab);
  const activeUnitId = useUIStore((s) => s.activeUnitId);
  const unitCommandMode = useUIStore((s) => s.unitCommandMode);
  const classicBuildMode = useUIStore((s) => s.classicBuildMode);
  const setSidePanelTab = useUIStore((s) => s.setSidePanelTab);
  const setHoveredTileId = useUIStore((s) => s.setHoveredTileId);
  const setSelectedTileId = useUIStore((s) => s.setSelectedTileId);
  const setActiveUnitId = useUIStore((s) => s.setActiveUnitId);
  const setUnitCommandMode = useUIStore((s) => s.setUnitCommandMode);
  const clearUnitCommand = useUIStore((s) => s.clearUnitCommand);
  const setClassicBuildMode = useUIStore((s) => s.setClassicBuildMode);
  const clearClassicBuildMode = useUIStore((s) => s.clearClassicBuildMode);
  const openModal = useUIStore((s) => s.openModal);
  const closeModal = useUIStore((s) => s.closeModal);

  const showGrid = useSettingsStore((s) => s.showGrid);
  const showAnimations = useSettingsStore((s) => s.showAnimations);
  const animationSpeed = useSettingsStore((s) => s.animationSpeed);
  const cameraSensitivity = useSettingsStore((s) => s.cameraSensitivity);
  const guidedTurnUI = useSettingsStore((s) => s.guidedTurnUI);
  const showAdvancedPanels = useSettingsStore((s) => s.showAdvancedPanels);
  const highContrast = useSettingsStore((s) => s.highContrast);
  const showFpsMeter = useSettingsStore((s) => s.showFpsMeter);
  const reducedMotionSetting = useSettingsStore((s) => s.reducedMotion);
  const visualQuality = useSettingsStore((s) => s.visualQuality);
  const uiScale = useSettingsStore((s) => s.uiScale);
  const setShowAdvancedPanels = useSettingsStore((s) => s.setShowAdvancedPanels);

  const [civTargetIndex, setCivTargetIndex] = useState<number | null>(null);
  const [civSelections, setCivSelections] = useState<Record<number, CivilizationType>>({
    0: 'empire',
    1: 'northerners',
    2: 'merchants',
    3: 'scholars',
  });
  const [cameraFocusRequest, setCameraFocusRequest] = useState<{
    tileId: string;
    nonce: number;
  } | null>(null);
  const boardViewMode: BoardViewMode = 'strategic';
  const [boardLayer, setBoardLayer] = useState<BoardLayer>('surface');

  useEffect(() => {
    if (!gameState || !isUndergroundSkyEnabled(gameState)) {
      setBoardLayer('surface');
      return;
    }
    const onLayerShortcut = (event: KeyboardEvent) => {
      if (event.altKey || event.ctrlKey || event.metaKey) return;
      const target = event.target as HTMLElement | null;
      if (target?.closest('input, textarea, select, [contenteditable="true"]')) return;
      const next = event.key === '1' ? 'sky' : event.key === '2' ? 'surface' : event.key === '3' ? 'underground' : null;
      if (!next) return;
      event.preventDefault();
      setBoardLayer(next);
    };
    window.addEventListener('keydown', onLayerShortcut);
    return () => window.removeEventListener('keydown', onLayerShortcut);
  }, [gameState]);
  const [multiplayerConnected, setMultiplayerConnected] = useState(false);
  const [multiplayerConnecting, setMultiplayerConnecting] = useState(false);
  const [multiplayerServerUrl, setMultiplayerServerUrl] = useState(
    () => import.meta.env.VITE_MULTIPLAYER_URL ?? 'http://127.0.0.1:4000',
  );
  const [multiplayerRoomId, setMultiplayerRoomId] = useState('');
  const [multiplayerSeatId, setMultiplayerSeatId] = useState<string | null>(null);
  const [multiplayerRoomName, setMultiplayerRoomName] = useState('Salon CatanX');
  const [multiplayerMaxPlayers, setMultiplayerMaxPlayers] = useState(4);
  const [multiplayerLobbyConfig, setMultiplayerLobbyConfig] = useState(DEFAULT_MULTIPLAYER_LOBBY_CONFIG);
  const [multiplayerInviteHint, setMultiplayerInviteHint] = useState<string | null>(null);
  const [multiplayerGameStarted, setMultiplayerGameStarted] = useState(false);
  const [multiplayerPlayerName, setMultiplayerPlayerName] = useState('Commandant');
  const [multiplayerJoinAsSpectator, setMultiplayerJoinAsSpectator] = useState(false);
  const multiplayerInviteHandledRef = useRef(false);
  const [multiplayerRooms, setMultiplayerRooms] = useState<MultiplayerRoomSummary[]>([]);
  const [multiplayerSavedRooms, setMultiplayerSavedRooms] = useState<
    import('@catanx/protocol').RoomSaveSummary[]
  >([]);
  const [multiplayerRoomPlayers, setMultiplayerRoomPlayers] = useState<MultiplayerRoomPlayer[]>([]);
  const [multiplayerChatMessages, setMultiplayerChatMessages] = useState<MultiplayerChatMessage[]>(
    [],
  );
  const [multiplayerError, setMultiplayerError] = useState<string | null>(null);
  const [isMultiplayerSession, setIsMultiplayerSession] = useState(false);
  const [isSpectatorMode, setIsSpectatorMode] = useState(false);
  const [multiplayerIsHost, setMultiplayerIsHost] = useState(false);
  const [saveModalOpen, setSaveModalOpen] = useState(false);
  const [hudNotice, setHudNotice] = useState<string | null>(null);
  const [mpSaveBusy, setMpSaveBusy] = useState(false);
  const [mpSaveHint, setMpSaveHint] = useState<string | null>(null);
  const screenRef = useRef(screen);
  const gameStateRef = useRef(gameState);
  screenRef.current = screen;
  gameStateRef.current = gameState;
  const prevHotseatActiveRef = useRef<string | null>(null);
  const prevTradeHotseatRef = useRef<string | null>(null);
  const prevTurnRef = useRef<number | null>(null);
  const prevTurnPlayerIdRef = useRef<string | null>(null);
  const prevSeasonRef = useRef<string | null>(null);
  const prevEventCountRef = useRef<number>(0);
  const prevCkInvasionTokenRef = useRef<string | null>(null);
  const prevCkShipPosRef = useRef<number | null>(null);
  const playerResourceSnapshotsRef = useRef<Record<string, Record<string, number>>>({});
  const previousDiceTokenRef = useRef<string | null>(null);
  const previousCkActionLogIdRef = useRef<string | null>(null);
  const collectionTimerRef = useRef<number | null>(null);
  const multiplayerClientRef = useRef<MultiplayerClient | null>(null);
  const previousActivePlayerRef = useRef<string | null>(null);
  const multiplayerHadGameStateRef = useRef(false);
  const mpSaveTimeoutRef = useRef<number | null>(null);

  const baseTileClick = useHexClick();
  const actions = useGameActions();
  const audio = useAudio();
  const animations = useAnimations();
  const prefersReducedMotion = useMotionPreference();
  const [liveAnnouncement, setLiveAnnouncement] = useState('');
  const [collectionSummary, setCollectionSummary] = useState<{
    token: string;
    entries: CollectionSummaryEntry[];
  } | null>(null);
  const [dicePresentationToken, setDicePresentationToken] = useState<string | null>(null);
  const [turnMomentToken, setTurnMomentToken] = useState<string | null>(null);
  const [turnRecap, setTurnRecap] = useState<{
    token: string;
    playerName: string;
    turn: number;
    entries: ActionLogEntry[];
  } | null>(null);
  const [ckMoment, setCkMoment] = useState<{
    token: string;
    kind: CkMomentKind;
    title: string;
    detail: string;
  } | null>(null);
  const [progressMoment, setProgressMoment] = useState<{
    token: string;
    actorId: string;
    impact: CkProgressPlayImpact;
  } | null>(null);
  const [progressTargetTileIds, setProgressTargetTileIds] = useState<string[]>([]);
  const [cardHandOpen, setCardHandOpen] = useState(false);
  const [seasonMoment, setSeasonMoment] = useState<{
    token: string;
    season: Season;
    climateId: SeasonClimateId;
    year: number;
  } | null>(null);
  const finishCollectionSummary = useCallback(() => setCollectionSummary(null), []);
  const finishTurnRecap = useCallback(() => setTurnRecap(null), []);
  const finishCkMoment = useCallback(() => setCkMoment(null), []);
  const finishProgressMoment = useCallback(() => setProgressMoment(null), []);
  const finishSeasonMoment = useCallback(() => setSeasonMoment(null), []);
  const finishTurnMoment = useCallback(() => setTurnMomentToken(null), []);
  const [commerceView, setCommerceView] = useState<'bank' | 'players' | 'cards'>('bank');
  const [openExtensionDock, setOpenExtensionDock] = useState<
    'seasons' | 'citiesKnights' | 'undergroundSky' | 'pactsEmbassies' | null
  >(null);
  const prevTurnPhaseRef = useRef<string | null>(null);
  const effectiveShowAnimations = showAnimations && !prefersReducedMotion;
  const pacingPreset =
    gameState?.config.pacingPreset ??
    (gameState?.config.mode === 'classic' ? 'dynamic' : 'tabletop');
  const isInitialPlacementActive = Boolean(
    initialPlacement?.active && gameState?.phase === 'setup',
  );
  const isReadOnlySession = isMultiplayerSession && isSpectatorMode;

  const playTradeExchange = useCallback(
    (
      give: Partial<Record<ResourceType, number>>,
      receive: Partial<Record<ResourceType, number>>,
    ) => {
      if (!effectiveShowAnimations) return;
      const panel = document.querySelector<HTMLElement>('[data-trade-panel]');
      const panelRect = panel?.getBoundingClientRect();
      const counter = panelRect
        ? { x: panelRect.left + panelRect.width * 0.5, y: panelRect.top + panelRect.height * 0.52 }
        : { x: window.innerWidth - 210, y: window.innerHeight - 260 };

      Object.entries(give).forEach(([resource, amount], index) => {
        if (!amount) return;
        const card = document.querySelector<HTMLElement>(
          `[data-hud-zone="resources"] [data-resource="${resource}"]`,
        );
        const rect = card?.getBoundingClientRect();
        const from = rect
          ? { x: rect.left + rect.width * 0.5, y: rect.top + rect.height * 0.5 }
          : { x: window.innerWidth - 105 - index * 34, y: 72 };
        animations.playResourceFloat(
          `−${amount} ${frResource(resource)}`,
          from,
          counter,
          undefined,
          resource,
        );
      });

      window.setTimeout(() => {
        Object.entries(receive).forEach(([resource, amount], index) => {
          if (!amount) return;
          const card = document.querySelector<HTMLElement>(
            `[data-hud-zone="resources"] [data-resource="${resource}"]`,
          );
          const rect = card?.getBoundingClientRect();
          const to = rect
            ? { x: rect.left + rect.width * 0.5, y: rect.top + rect.height * 0.5 }
            : { x: window.innerWidth - 92 - index * 38, y: 72 };
          animations.playResourceFloat(
            `+${amount} ${frResource(resource)}`,
            counter,
            to,
            undefined,
            resource,
          );
        });
      }, 170);
      animations.playBoardImpact('trade', 0.12);
    },
    [animations, effectiveShowAnimations],
  );

  const onPlacementIntersectionClick = useCallback(
    (intersectionId: string) => {
      if (isReadOnlySession) return;

      if (isInitialPlacementActive && initialPlacement?.step === 'settlement') {
        actions.previewInitialSettlement(intersectionId);
        return;
      }

      if (classicBuildMode === 'settlement') {
        const result = actions.buildSettlement(intersectionId);
        forceSync();
        if (result.ok) {
          audio.playSfx('build');
          if (effectiveShowAnimations) animations.playBoardImpact('build', 0.18);
          clearClassicBuildMode();
        }
        return;
      }

      if (classicBuildMode === 'city') {
        const result = actions.upgradeCity(intersectionId);
        forceSync();
        if (result.ok) {
          audio.playSfx('build');
          if (effectiveShowAnimations) animations.playBoardImpact('build', 0.22);
          clearClassicBuildMode();
        }
        return;
      }

      if (classicBuildMode === 'ck_knight') {
        const result = actions.ckRecruitKnight(intersectionId);
        forceSync();
        if (result.ok) {
          audio.playSfx('ck_knight');
          clearClassicBuildMode();
        } else if (result.reason) {
          reportActionError(result.reason);
        }
      }
    },
    [
      actions,
      animations,
      audio,
      classicBuildMode,
      clearClassicBuildMode,
      initialPlacement?.step,
      effectiveShowAnimations,
      isInitialPlacementActive,
      isReadOnlySession,
      reportActionError,
    ],
  );

  const onPlacementEdgeClick = useCallback(
    (edgeId: string) => {
      if (isReadOnlySession) return;

      if (isInitialPlacementActive && initialPlacement?.step === 'road') {
        actions.previewInitialRoad(edgeId);
        return;
      }

      if (classicBuildMode === 'road') {
        const roadPlayerId = gameState?.turnOrder[gameState.currentPlayerIndex];
        const freeRoadsBefore = roadPlayerId
          ? (gameState?.players.get(roadPlayerId)?.freeRoadsRemaining ?? 0)
          : 0;
        const result = actions.buildRoad(edgeId);
        forceSync();
        if (result.ok) {
          audio.playSfx('build');
          if (effectiveShowAnimations) animations.playBoardImpact('build', 0.16);
          if (freeRoadsBefore > 1) {
            setClassicBuildMode('road');
          } else {
            clearClassicBuildMode();
          }
        }
      }
    },
    [
      actions,
      animations,
      audio,
      classicBuildMode,
      clearClassicBuildMode,
      gameState,
      initialPlacement?.step,
      effectiveShowAnimations,
      isInitialPlacementActive,
      isReadOnlySession,
      setClassicBuildMode,
    ],
  );

  const handleProgressTileTargeting = useCallback(
    (tileIds: string[]) => {
      setProgressTargetTileIds(tileIds);
      setHighlightedTiles(tileIds);
      if (tileIds.length > 0) setSelectedTileId(null);
    },
    [setHighlightedTiles, setSelectedTileId],
  );

  const onTileClick = useCallback(
    (tileId: string) => {
      const selectOrClear = () => {
        if (selectedTileId === tileId) setSelectedTileId(null);
        else baseTileClick(tileId);
      };
      if (isReadOnlySession) {
        selectOrClear();
        return;
      }

      if (progressTargetTileIds.length > 0) {
        if (progressTargetTileIds.includes(tileId)) setSelectedTileId(tileId);
        else reportActionError('Choisissez un hexagone surligné pour cette carte Progrès.');
        return;
      }

      if (
        gameState?.phase === 'setup' &&
        !usesTopologicalPlacement(gameState) &&
        !initialPlacement?.active
      ) {
        const setupId = gameState.setupPlayerOrder[gameState.setupPlacementIndex];
        const setupPlayer = setupId ? gameState.players.get(setupId) : null;
        if (!setupPlayer || setupPlayer.type !== 'human') return;
        if (isMultiplayerSession) {
          const bound = getRemotePlayerId();
          if (bound && setupId !== bound) return;
        }
        const result = actions.placeSetupSettlement(tileId);
        forceSync();
        if (result.ok) {
          audio.playSfx('build');
          setSelectedTileId(tileId);
        } else if (result.reason) {
          reportActionError(result.reason);
        }
        return;
      }

      if (gameState?.turnPhase === 'move_robber' && tileId !== gameState.robberPosition) {
        const activeId = gameState.turnOrder[gameState.currentPlayerIndex];
        const activePlayerOnTile = activeId ? gameState.players.get(activeId) : null;
        if (activePlayerOnTile?.type === 'human') {
          const result = actions.moveRobber(tileId);
          if (!result.ok) forceSync();
        }
        return;
      }

      if (!gameState || !activeUnitId || !unitCommandMode) {
        selectOrClear();
        return;
      }

      if (unitCommandMode === 'move') {
        const result = actions.moveUnit(activeUnitId, tileId);
        if (result.ok) {
          audio.playSfx('next_turn');
          clearUnitCommand();
          setSelectedTileId(tileId);
        }
        forceSync();
        return;
      }

      if (unitCommandMode === 'attack') {
        const targetTile = gameState.map.get(tileId);
        const attacker = gameState.units.get(activeUnitId);
        if (!targetTile || !attacker) {
          baseTileClick(tileId);
          return;
        }

        const defenderId = targetTile.units.find((unitId) => {
          const unit = gameState.units.get(unitId);
          return unit && unit.ownerId !== attacker.ownerId;
        });

        if (defenderId) {
          const result = actions.attackUnit(activeUnitId, defenderId);
          if (result.ok) {
            audio.playSfx('combat');
            animations.playCombat(activeUnitId, defenderId);
            clearUnitCommand();
            setSelectedTileId(tileId);
          }
          forceSync();
          return;
        }
      }

      selectOrClear();
    },
    [
      actions,
      animations,
      audio,
      activeUnitId,
      baseTileClick,
      clearUnitCommand,
      forceSync,
      gameState,
      initialPlacement?.active,
      isMultiplayerSession,
      isReadOnlySession,
      progressTargetTileIds,
      reportActionError,
      selectedTileId,
      setSelectedTileId,
      unitCommandMode,
    ],
  );

  useEffect(() => {
    refreshSaves();
  }, [refreshSaves]);

  const activePlayerId = gameState?.turnOrder[gameState.currentPlayerIndex] ?? null;

  const localMultiplayerPlayerId = useMemo(() => {
    if (!isMultiplayerSession) return null;
    const bound = getRemotePlayerId();
    if (bound && gameState?.players.has(bound)) return bound;
    if (!gameState) return null;
    const found = [...gameState.players.values()].find(
      (player) => player.name === multiplayerPlayerName,
    );
    return found?.id ?? null;
  }, [gameState, isMultiplayerSession, multiplayerPlayerName]);

  /** Humains locaux (solo vs IA / hotseat) — le HUD ne doit jamais suivre une IA. */
  const localHumanPlayerIds = useMemo(() => {
    if (!gameState) return [];
    return [...gameState.players.values()]
      .filter((player) => player.type === 'human')
      .map((player) => player.id);
  }, [gameState]);

  const displayPlayerId = isMultiplayerSession
    ? isSpectatorMode
      ? (localHumanPlayerIds[0] ?? currentPlayerId)
      : (localMultiplayerPlayerId ?? currentPlayerId)
    : hotseatMode
      ? (viewingPlayerId ?? currentPlayerId)
      : (localHumanPlayerIds[0] ?? currentPlayerId);

  const currentPlayer = useMemo(() => {
    if (!gameState || !displayPlayerId) return null;
    return gameState.players.get(displayPlayerId) ?? null;
  }, [displayPlayerId, gameState]);

  const isClassicMode = gameState?.config.mode === 'classic';
  const usesTopoPlacement = Boolean(gameState && usesTopologicalPlacement(gameState));
  const isHexSetupActive = Boolean(
    gameState?.phase === 'setup' && !usesTopoPlacement && !initialPlacement?.active,
  );
  const isSetupPhaseActive = isInitialPlacementActive || isHexSetupActive;
  const hexSetupPlayerId =
    isHexSetupActive && gameState
      ? (gameState.setupPlayerOrder[gameState.setupPlacementIndex] ?? null)
      : null;
  const hexSetupPlayerName = hexSetupPlayerId
    ? (gameState?.players.get(hexSetupPlayerId)?.name ?? null)
    : null;
  const hexSetupProgress =
    gameState && isHexSetupActive
      ? `${Math.min(gameState.setupPlacementIndex + 1, gameState.setupPlayerOrder.length)}/${gameState.setupPlayerOrder.length}`
      : '';

  const activePlayer = useMemo(() => {
    if (!gameState || !activePlayerId) return null;
    return gameState.players.get(activePlayerId) ?? null;
  }, [activePlayerId, gameState]);

  const isLocalHumanTurn = useMemo(() => {
    if (!activePlayer) return false;
    return activePlayer.type === 'human';
  }, [activePlayer]);

  const canControlActivePlayer = useMemo(() => {
    if (!activePlayerId || !isLocalHumanTurn) return false;
    if (privacyScreenPlayerId) return false;
    if (isSpectatorMode) return false;
    if (isMultiplayerSession) {
      return Boolean(localMultiplayerPlayerId && activePlayerId === localMultiplayerPlayerId);
    }
    if (hotseatMode && viewingPlayerId && viewingPlayerId !== activePlayerId) return false;
    return true;
  }, [
    activePlayerId,
    hotseatMode,
    isLocalHumanTurn,
    isMultiplayerSession,
    isSpectatorMode,
    localMultiplayerPlayerId,
    privacyScreenPlayerId,
    viewingPlayerId,
  ]);

  const classicBuildCandidates = useMemo(() => {
    const empty = {
      intersections: [] as string[],
      edges: [] as string[],
      reason: null as string | null,
    };
    if (!gameState || !usesTopoPlacement || !classicBuildMode || !activePlayerId) {
      return empty;
    }
    if (gameState.phase !== 'playing' || gameState.turnPhase !== 'player_action') {
      return empty;
    }
    if (!canControlActivePlayer) {
      return { ...empty, reason: "Ce n'est pas votre tour" };
    }

    const player = gameState.players.get(activePlayerId);
    if (!player) return empty;

    const settlementCost = { wood: 1, clay: 1, wheat: 1, sheep: 1 };
    const cityCost = { ore: 3, wheat: 2 };
    const roadCost = { wood: 1, clay: 1 };
    const freeRoad = (player.freeRoadsRemaining ?? 0) > 0;

    if (classicBuildMode === 'settlement') {
      if (!hasResources(player.resources, settlementCost)) {
        return { ...empty, reason: 'Ressources insuffisantes (bois, argile, blé, mouton)' };
      }
      const intersections = listClassicSettlementCandidates(gameState, activePlayerId).map(
        (c) => c.intersectionId,
      );
      return {
        intersections,
        edges: [],
        reason: intersections.length === 0 ? 'Aucun emplacement de village valide' : null,
      };
    }
    if (classicBuildMode === 'city') {
      if (!hasResources(player.resources, cityCost)) {
        return { ...empty, reason: 'Ressources insuffisantes (minerai ×3, blé ×2)' };
      }
      const intersections = listClassicCityCandidates(gameState, activePlayerId).map(
        (c) => c.intersectionId,
      );
      return {
        intersections,
        edges: [],
        reason: intersections.length === 0 ? 'Aucun village à améliorer' : null,
      };
    }
    if (classicBuildMode === 'ck_knight') {
      if (!isCitiesKnightsEnabled(gameState)) return empty;
      if (!hasResources(player.resources, { sheep: 1, ore: 1 })) {
        return { ...empty, reason: 'Ressources insuffisantes (1 mouton + 1 minerai)' };
      }
      const intersections = listKnightRecruitSpots(gameState, activePlayerId);
      return {
        intersections,
        edges: [],
        reason:
          intersections.length === 0
            ? 'Aucun emplacement (intersection libre sur votre réseau de routes)'
            : null,
      };
    }
    if (!freeRoad && !hasResources(player.resources, roadCost)) {
      return { ...empty, reason: 'Ressources insuffisantes (bois, argile)' };
    }
    const edges = listClassicRoadCandidates(gameState, activePlayerId).map((c) => c.edgeId);
    return {
      intersections: [],
      edges,
      reason: edges.length === 0 ? 'Aucune arête de route valide' : null,
    };
  }, [activePlayerId, canControlActivePlayer, classicBuildMode, gameState, usesTopoPlacement]);

  const limitedBankEconomy = Boolean(gameState && usesLimitedBank(gameState));
  const showClassicActionPanels =
    limitedBankEconomy &&
    gameState?.turnPhase === 'player_action' &&
    canControlActivePlayer &&
    !isReadOnlySession &&
    !isSetupPhaseActive;
  /** En CatanX, Dev/Banque/Trade ne s'ouvrent que via l'onglet Commerce (pas auto après les dés). */
  const showFloatingEconomyPanels =
    limitedBankEconomy &&
    sidePanelTab === 'trade' &&
    canControlActivePlayer &&
    !isReadOnlySession &&
    !isSetupPhaseActive;

  const bankTradeReady =
    Boolean(gameState) && gameState!.turnPhase === 'player_action' && canControlActivePlayer;

  useEffect(() => {
    if (gameState && isCitiesKnightsEnabled(gameState) && commerceView === 'cards') {
      setCommerceView('bank');
    }
  }, [commerceView, gameState]);

  const selectedTile = useMemo(() => {
    if (!gameState || !selectedTileId) return null;
    return gameState.map.get(selectedTileId) ?? null;
  }, [gameState, selectedTileId]);

  const selectedOwner = useMemo(() => {
    if (!gameState || !selectedTile?.owner) return null;
    return gameState.players.get(selectedTile.owner) ?? null;
  }, [gameState, selectedTile?.owner]);

  useEffect(() => {
    if (!gameState || !activeUnitId) return;
    const activeUnit = gameState.units.get(activeUnitId);
    if (!activeUnit || activeUnit.ownerId !== currentPlayerId) {
      clearUnitCommand();
    }
  }, [activeUnitId, clearUnitCommand, currentPlayerId, gameState]);

  useEffect(() => {
    if (!isReadOnlySession) return;
    if (sidePanelTab !== 'tile') {
      setSidePanelTab('tile');
    }
    clearUnitCommand();
  }, [clearUnitCommand, isReadOnlySession, setSidePanelTab, sidePanelTab]);

  const pendingChoice = useMemo(() => {
    if (!gameState || !currentPlayerId) return null;
    return gameState.pendingChoices.find((choice) => choice.playerId === currentPlayerId) ?? null;
  }, [currentPlayerId, gameState]);

  const pendingEvent = useMemo(() => {
    if (!gameState || !pendingChoice) return null;
    return gameState.activeEvents.find((event) => event.id === pendingChoice.eventId) ?? null;
  }, [gameState, pendingChoice]);

  const hudPlayerId = canControlActivePlayer ? activePlayerId : displayPlayerId;

  const actionCountThisTurn = useMemo(() => {
    if (!gameState || !hudPlayerId) return 0;
    return gameState.actionLog.filter(
      (entry) => entry.playerId === hudPlayerId && entry.turn === gameState.currentTurn,
    ).length;
  }, [gameState, hudPlayerId]);

  const diceRolledThisTurn = useMemo(() => {
    if (!gameState || !activePlayerId) return false;
    return hasPlayerRolledDiceThisTurn(gameState, activePlayerId);
  }, [activePlayerId, gameState]);

  const turnPlayers = useMemo(() => {
    if (!gameState) return [];
    const classic = gameState.config.mode === 'classic';
    const ck = isCitiesKnightsEnabled(gameState);
    return gameState.turnOrder
      .map((playerId) => gameState.players.get(playerId))
      .filter((player): player is NonNullable<typeof player> => Boolean(player))
      .map((player) => ({
        id: player.id,
        name: player.name,
        vp: player.stats.victoryPoints,
        isActive: player.id === activePlayerId,
        color: player.color,
        civilization: player.civilization,
        profile: player.profile,
        type: player.type,
        ...(classic || ck
          ? {
              handSize: getPublicResourceCount(player, gameState),
              devCardCount: ck ? 0 : getPublicDevCardCount(player),
            }
          : {}),
      }));
  }, [activePlayerId, gameState]);

  const diceRollOverlayData = useMemo(() => {
    if (!gameState?.lastDiceRoll) return null;
    const roll = gameState.lastDiceRoll;
    return {
      die1: roll.die1,
      die2: roll.die2,
      total: roll.total,
      eventDie: roll.eventDie,
      diceStyle: gameState.players.get(roll.player)?.profile?.diceStyle,
      token: `${roll.turn}-${roll.die1}-${roll.die2}-${roll.player}-${roll.eventDie ?? ''}`,
    };
  }, [gameState?.lastDiceRoll]);

  useEffect(() => {
    if (diceRollOverlayData?.token) setDicePresentationToken(diceRollOverlayData.token);
  }, [diceRollOverlayData?.token]);

  const pendingLocalDiscardPlayerId = useMemo(() => {
    if (!gameState?.sevenFlow || gameState.turnPhase !== 'discard_resources') return null;
    if (isSpectatorMode) return null;

    if (isMultiplayerSession) {
      if (!localMultiplayerPlayerId) return null;
      const mustDiscard =
        gameState.sevenFlow.playersToDiscard.includes(localMultiplayerPlayerId) &&
        !gameState.sevenFlow.playersDiscarded.includes(localMultiplayerPlayerId);
      return mustDiscard ? localMultiplayerPlayerId : null;
    }

    return (
      gameState.sevenFlow.playersToDiscard.find(
        (playerId) =>
          !gameState.sevenFlow!.playersDiscarded.includes(playerId) &&
          localHumanPlayerIds.includes(playerId),
      ) ?? null
    );
  }, [
    gameState,
    isMultiplayerSession,
    isSpectatorMode,
    localHumanPlayerIds,
    localMultiplayerPlayerId,
  ]);

  const pendingDiscardPlayer = useMemo(() => {
    if (!gameState || !pendingLocalDiscardPlayerId) return null;
    return gameState.players.get(pendingLocalDiscardPlayerId) ?? null;
  }, [gameState, pendingLocalDiscardPlayerId]);

  const robberTargetTiles = useMemo(() => {
    if (!gameState) return [];
    return [...gameState.map.values()].filter(
      (tile) =>
        tile.terrain !== 'ocean' &&
        tile.terrain !== 'glacier' &&
        tile.id !== gameState.robberPosition,
    );
  }, [gameState]);

  const robberMoveTiles = useMemo(() => {
    if (!gameState || gameState.turnPhase !== 'move_robber') return [];
    return robberTargetTiles;
  }, [gameState, robberTargetTiles]);

  const stealCandidates = useMemo(() => {
    if (!gameState?.sevenFlow || gameState.turnPhase !== 'steal_resource') return [];
    return gameState.sevenFlow.stealCandidates
      .map((playerId) => gameState.players.get(playerId))
      .filter((player): player is NonNullable<typeof player> => Boolean(player));
  }, [gameState]);

  const bankTradeRatioFor = useCallback(
    (resource: import('@catanx/engine').ResourceType) => {
      if (!gameState || !activePlayer) return 4;
      return getPortTradeRatio(activePlayer, resource, gameState);
    },
    [activePlayer, gameState],
  );

  const materialBankTradeRatio = useCallback(() => {
    if (!gameState || !activePlayerId) return 4;
    return getMaterialBankTradeRatio(gameState, activePlayerId);
  }, [activePlayerId, gameState]);

  const handleEndTurn = useCallback(() => {
    if (!canControlActivePlayer) return;
    actions.endTurn();
    forceSync();
  }, [actions, canControlActivePlayer, forceSync]);

  const handleDiceOverlayComplete = useCallback(() => {
    setDicePresentationToken(null);
    // Ne ferme le commerce / ne passe la phase que pendant la vraie collecte.
    // (L’overlay reste monté tant que lastDiceRoll existe ; un onComplete
    // restale ne doit pas refermer le panneau banque.)
    if (gameState?.turnPhase !== 'resource_collect') return;
    setSidePanelTab('tile');
    actions.acknowledgeCollection();
    forceSync();
  }, [actions, forceSync, gameState?.turnPhase, setSidePanelTab]);

  const showComplexHUD = !isSetupPhaseActive && (!guidedTurnUI || showAdvancedPanels);
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      if (classicBuildMode) {
        clearClassicBuildMode();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [classicBuildMode, clearClassicBuildMode]);

  useEffect(() => {
    if (!classicBuildMode) return;
    if (
      !gameState ||
      gameState.phase !== 'playing' ||
      gameState.turnPhase !== 'player_action' ||
      isReadOnlySession ||
      !canControlActivePlayer
    ) {
      clearClassicBuildMode();
    }
  }, [
    canControlActivePlayer,
    classicBuildMode,
    clearClassicBuildMode,
    gameState,
    gameState?.phase,
    gameState?.turnPhase,
    isReadOnlySession,
  ]);

  useEffect(() => {
    if (typeof document === 'undefined') return;
    document.body.classList.toggle('high-contrast', highContrast);
    document.body.classList.toggle('reduce-motion', reducedMotionSetting || prefersReducedMotion);
  }, [highContrast, prefersReducedMotion, reducedMotionSetting]);

  const shellSeason = gameState?.season ?? 'spring';
  const shellUiScale =
    uiScale <= 0.9 ? '0.85' : uiScale >= 1.2 ? '1.25' : uiScale >= 1.05 ? '1.1' : '1';

  const [compactHud, setCompactHud] = useState(
    () => typeof window !== 'undefined' && window.innerWidth <= 1280,
  );
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const update = () => setCompactHud(window.innerWidth <= 1280);
    update();
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, []);

  useEffect(() => {
    if (!gameState) return;
    if (prevTurnPhaseRef.current && prevTurnPhaseRef.current !== gameState.turnPhase) {
      const label = frTurnPhase(gameState.turnPhase);
      setLiveAnnouncement(`Phase : ${label}`);
      if (gameState.turnPhase === 'move_robber') audio.playSfx('robber');
      if (gameState.turnPhase === 'discard_resources') audio.playSfx('discard');
    }
    prevTurnPhaseRef.current = gameState.turnPhase;
  }, [audio, gameState]);

  useEffect(() => {
    if (pendingEvent && activeModal !== 'event') {
      openModal('event');
    }
    if (!pendingEvent && activeModal === 'event') {
      closeModal();
    }
  }, [activeModal, closeModal, openModal, pendingEvent]);

  useEffect(() => {
    if (gameState?.winner && activeModal !== 'victory') {
      openModal('victory');
    }
  }, [activeModal, gameState?.winner, openModal]);

  useEffect(() => {
    if (!isHexSetupActive || !gameState || !hexSetupPlayerId) {
      setHighlightedTiles([]);
      return;
    }
    const valid: string[] = [];
    for (const tileId of gameState.map.keys()) {
      if (validateSetupPlacement(hexSetupPlayerId, tileId, gameState).valid) {
        valid.push(tileId);
      }
    }
    setHighlightedTiles(valid);
    return () => setHighlightedTiles([]);
  }, [
    gameState,
    hexSetupPlayerId,
    isHexSetupActive,
    gameState?.setupPlacementIndex,
    setHighlightedTiles,
  ]);

  useEffect(() => {
    if (!gameState || !hotseatMode || gameState.phase !== 'setup') return;
    const setupId = gameState.setupPlayerOrder[gameState.setupPlacementIndex] ?? null;
    if (!setupId) return;
    const player = gameState.players.get(setupId);
    if (player?.type !== 'human') return;
    if (prevHotseatActiveRef.current === setupId) return;
    prevHotseatActiveRef.current = setupId;
    showPrivacyScreen(setupId);
  }, [gameState?.setupPlacementIndex, gameState?.phase, hotseatMode, showPrivacyScreen]);

  useEffect(() => {
    if (!gameState || !hotseatMode || gameState.phase !== 'playing') return;
    const activeId = gameState.turnOrder[gameState.currentPlayerIndex] ?? null;
    if (!activeId) return;
    const player = gameState.players.get(activeId);
    if (player?.type !== 'human') return;
    if (prevHotseatActiveRef.current === activeId) return;
    prevHotseatActiveRef.current = activeId;
    showPrivacyScreen(activeId);
  }, [gameState?.currentPlayerIndex, gameState?.phase, hotseatMode, showPrivacyScreen]);

  // Hotseat : passer l'écran au destinataire d'une offre domestique (pas en broadcast)
  useEffect(() => {
    if (!gameState || !hotseatMode || gameState.phase !== 'playing') return;
    const pending = gameState.pendingPlayerTrade;
    if (!pending) {
      prevTradeHotseatRef.current = null;
      return;
    }
    if (pending.toPlayerId === null) return;
    if (prevTradeHotseatRef.current === pending.id) return;
    const target = gameState.players.get(pending.toPlayerId);
    if (target?.type !== 'human') return;
    prevTradeHotseatRef.current = pending.id;
    showPrivacyScreen(pending.toPlayerId);
  }, [gameState?.pendingPlayerTrade?.id, gameState?.phase, hotseatMode, showPrivacyScreen]);

  useEffect(() => {
    if (!gameState) return;
    const previousTurn = prevTurnRef.current;
    const previousPlayerId = prevTurnPlayerIdRef.current;
    const nextPlayerId = gameState.turnOrder[gameState.currentPlayerIndex] ?? null;
    if (previousTurn !== null && previousTurn !== gameState.currentTurn) {
      audio.playSfx('next_turn');
      setCollectionSummary(null);
      const turnEntries = gameState.actionLog.filter(
        (entry) =>
          entry.turn === previousTurn && (!previousPlayerId || entry.playerId === previousPlayerId),
      );
      const previousPlayer = previousPlayerId ? gameState.players.get(previousPlayerId) : undefined;
      setTurnRecap({
        token: `${previousTurn}-${previousPlayerId ?? 'system'}`,
        playerName: previousPlayer?.name ?? 'Tour précédent',
        turn: previousTurn,
        entries: turnEntries,
      });
    }
    if (previousTurn === null || previousTurn !== gameState.currentTurn) {
      setTurnMomentToken(`${gameState.currentTurn}-${nextPlayerId ?? 'system'}`);
    }
    prevTurnRef.current = gameState.currentTurn;
    prevTurnPlayerIdRef.current = nextPlayerId;
  }, [audio, gameState]);

  useEffect(() => {
    if (!gameState) return;
    if (prevSeasonRef.current && prevSeasonRef.current !== gameState.season) {
      audio.playSfx('season_change');
      const seasons = gameState.extensions?.seasons;
      if (seasons) {
        const climate = getClimateDefinition(seasons.currentClimateId);
        setSeasonMoment({
          token: `${seasons.seasonYear}-${seasons.currentSeason}-${climate.id}`,
          season: seasons.currentSeason,
          climateId: climate.id,
          year: seasons.seasonYear,
        });
        setCkMoment(null);
        setTurnRecap(null);
      }
      animations.playSeasonTransition(gameState.season, seasons?.currentClimateId ?? null);
    }
    prevSeasonRef.current = gameState.season;
  }, [animations, audio, gameState]);

  useEffect(() => {
    if (!gameState) return;
    if (gameState.activeEvents.length > prevEventCountRef.current) {
      audio.playSfx('event');
      const latest = gameState.activeEvents[gameState.activeEvents.length - 1];
      if (latest?.targetTiles?.[0]) {
        animations.playTilePulse(latest.targetTiles[0]);
      }
    }
    prevEventCountRef.current = gameState.activeEvents.length;
  }, [animations, audio, gameState]);

  useEffect(() => {
    const ck = gameState?.extensions?.citiesKnights;
    if (!ck) return;
    const invasion = ck.lastInvasionResult;
    const token = invasion ? `${invasion.turn}-${invasion.outcome}` : null;
    // Skip premier tick (chargement / reprise) pour éviter un SFX fantôme
    if (prevCkInvasionTokenRef.current === null && prevCkShipPosRef.current === null) {
      prevCkInvasionTokenRef.current = token;
      prevCkShipPosRef.current = ck.barbarianTrackPosition;
      return;
    }
    if (token && token !== prevCkInvasionTokenRef.current) {
      audio.playSfx('ck_invasion');
      if (effectiveShowAnimations) animations.playBoardImpact('ck-invasion', 0.72);
      setCkMoment({
        token,
        kind: invasion!.outcome === 'defenders_win' ? 'invasion-win' : 'invasion-loss',
        title:
          invasion!.outcome === 'defenders_win'
            ? 'Catan résiste à l’invasion'
            : 'Les barbares franchissent les côtes',
        detail: `Défense ${invasion!.defenseStrength} · Barbares ${invasion!.barbarianStrength}`,
      });
    }
    prevCkInvasionTokenRef.current = token;

    if (prevCkShipPosRef.current !== null && ck.barbarianTrackPosition > prevCkShipPosRef.current) {
      audio.playSfx('ck_ship');
      if (effectiveShowAnimations) animations.playBoardImpact('ck-ship', 0.28);
      setCkMoment({
        token: `ship-${gameState?.currentTurn ?? 0}-${ck.barbarianTrackPosition}`,
        kind: 'ship',
        title: 'Le navire barbare se rapproche',
        detail: `${ck.barbarianTrackPosition}/${ck.barbarianTrackLength} étapes vers Catan`,
      });
    }
    prevCkShipPosRef.current = ck.barbarianTrackPosition;
  }, [
    animations,
    audio,
    effectiveShowAnimations,
    gameState?.extensions?.citiesKnights?.lastInvasionResult,
    gameState?.extensions?.citiesKnights?.barbarianTrackPosition,
  ]);

  useEffect(() => {
    if (!gameState || !isCitiesKnightsEnabled(gameState)) return;
    const lastEntry = gameState.actionLog[gameState.actionLog.length - 1];
    if (!lastEntry) {
      if (previousCkActionLogIdRef.current === null) {
        previousCkActionLogIdRef.current = '';
      }
      return;
    }
    if (previousCkActionLogIdRef.current === null) {
      previousCkActionLogIdRef.current = lastEntry.id;
      return;
    }
    if (previousCkActionLogIdRef.current === lastEntry.id) return;
    previousCkActionLogIdRef.current = lastEntry.id;

    const playerName = gameState.players.get(lastEntry.playerId)?.name ?? 'Un joueur';
    if (lastEntry.description.startsWith('Progrès joué')) {
      const impact = lastEntry.data.progressImpact as CkProgressPlayImpact | undefined;
      if (impact?.version === 1 && impact.cardType && impact.deck) {
        audio.playSfx('ck_progress');
        if (effectiveShowAnimations) animations.playBoardImpact('ck-progress', 0.2);
        setProgressMoment({
          token: lastEntry.id,
          actorId: lastEntry.playerId,
          impact,
        });
      }
    } else if (lastEntry.description.startsWith('Carte Progrès piochée')) {
      setCkMoment({
        token: lastEntry.id,
        kind: 'progress',
        title: lastEntry.description,
        detail: playerName,
      });
    }
  }, [animations, audio, effectiveShowAnimations, gameState]);

  useEffect(() => {
    if (!gameState) return;

    const viewerId = displayPlayerId;
    if (!viewerId) return;
    const resourcePlayer = gameState.players.get(viewerId);
    if (!resourcePlayer) return;

    const snapshot = Object.entries(resourcePlayer.resources).reduce<Record<string, number>>(
      (acc, [resource, amount]) => {
        acc[resource] = Number(amount ?? 0);
        return acc;
      },
      {},
    );

    const lastRoll = gameState.lastDiceRoll;
    const diceToken = lastRoll
      ? `${lastRoll.turn}-${lastRoll.player}-${lastRoll.die1}-${lastRoll.die2}`
      : null;
    const previousDiceToken = previousDiceTokenRef.current;
    const previousSnapshot = playerResourceSnapshotsRef.current[viewerId];

    if (previousSnapshot && lastRoll && diceToken && diceToken !== previousDiceToken) {
      const positiveDeltas = Object.entries(snapshot)
        .map(([resource, amount]) => ({
          resource,
          delta: amount - (previousSnapshot[resource] ?? 0),
        }))
        .filter((entry) => entry.delta > 0)
        .slice(0, 6);

      if (collectionTimerRef.current !== null) {
        window.clearTimeout(collectionTimerRef.current);
      }
      const presentationDelay =
        pacingPreset === 'epic' ? 900 : pacingPreset === 'tabletop' ? 650 : 80;
      collectionTimerRef.current = window.setTimeout(() => {
        setCollectionSummary({ token: diceToken, entries: positiveDeltas });
        if (positiveDeltas.length > 0 && effectiveShowAnimations) {
          positiveDeltas.forEach((entry, index) => {
            const sourceTile = [...gameState.map.values()].find((tile) => {
              if (tile.diceValue !== lastRoll.total) return false;
              if (entry.resource === 'wood') return tile.terrain === 'forest';
              if (entry.resource === 'clay') return tile.terrain === 'hill';
              if (entry.resource === 'wheat') return tile.terrain === 'plains';
              if (entry.resource === 'sheep') return tile.terrain === 'pasture';
              if (entry.resource === 'ore') return tile.terrain === 'mountain';
              return false;
            });
            const laneOffset = (index - (positiveDeltas.length - 1) / 2) * 62;
            const from = {
              x: window.innerWidth * 0.5 + laneOffset,
              y: window.innerHeight * 0.57 + index * 4,
            };
            const destination = document.querySelector<HTMLElement>(
              `[data-hud-zone="resources"] [data-resource="${entry.resource}"]`,
            );
            const destinationRect = destination?.getBoundingClientRect();
            const to = destinationRect
              ? {
                  x: destinationRect.left + destinationRect.width * 0.5,
                  y: destinationRect.top + destinationRect.height * 0.5,
                }
              : {
                  x: window.innerWidth - 128 - (index % 3) * 34,
                  y: 70 + Math.floor(index / 3) * 34,
                };
            animations.playResourceFloat(
              `+${Math.floor(entry.delta)} ${frResource(entry.resource)}`,
              from,
              to,
              sourceTile?.id,
              entry.resource,
            );
          });
          audio.playSfx('collect');
        }
        collectionTimerRef.current = null;
      }, presentationDelay);
    }

    // Snapshots locaux uniquement (pas les mains adverses en clair dans les floats)
    playerResourceSnapshotsRef.current[viewerId] = snapshot;
    previousDiceTokenRef.current = diceToken;
  }, [animations, audio, displayPlayerId, effectiveShowAnimations, gameState, pacingPreset]);

  useEffect(
    () => () => {
      if (collectionTimerRef.current !== null) {
        window.clearTimeout(collectionTimerRef.current);
      }
    },
    [],
  );

  useEffect(() => {
    if (!isMultiplayerSession || isSpectatorMode || !gameState || !localMultiplayerPlayerId) return;
    const activePlayerId = gameState.turnOrder[gameState.currentPlayerIndex] ?? null;
    const previousActive = previousActivePlayerRef.current;

    if (
      activePlayerId &&
      previousActive &&
      activePlayerId !== previousActive &&
      activePlayerId === localMultiplayerPlayerId
    ) {
      if (
        typeof document !== 'undefined' &&
        document.hidden &&
        typeof window !== 'undefined' &&
        'Notification' in window
      ) {
        if (Notification.permission === 'granted') {
          const localPlayer = gameState.players.get(localMultiplayerPlayerId);
          const title = 'CatanX - Votre tour';
          const body = localPlayer ? `${localPlayer.name}, a vous de jouer.` : 'A vous de jouer.';
          new Notification(title, { body });
        } else if (Notification.permission === 'default') {
          void Notification.requestPermission();
        }
      }
    }

    previousActivePlayerRef.current = activePlayerId;
  }, [gameState, isMultiplayerSession, isSpectatorMode, localMultiplayerPlayerId]);

  const playerNameById = useMemo(() => {
    if (!gameState) return {};
    return [...gameState.players.values()].reduce<Record<string, string>>((acc, player) => {
      acc[player.id] = player.name;
      return acc;
    }, {});
  }, [gameState]);

  const activeTechCount = useMemo(() => {
    if (!currentPlayer) return 0;
    return TechTreeEngine.getAvailableTechs(currentPlayer).length;
  }, [currentPlayer]);

  const diplomacyStats = useMemo(() => {
    if (!currentPlayer) return { relationCount: 0, allies: 0, wars: 0 };

    const relations = Object.values(currentPlayer.relations);
    return {
      relationCount: relations.length,
      allies: relations.filter((entry) => entry.status === 'allied').length,
      wars: relations.filter((entry) => entry.status === 'war').length,
    };
  }, [currentPlayer]);

  const damagedUnits = useMemo(() => {
    if (!gameState || !currentPlayer) return 0;
    return currentPlayer.units
      .map((id) => gameState.units.get(id))
      .filter((unit) => unit && unit.stats.currentHealth < unit.stats.health).length;
  }, [currentPlayer, gameState]);

  const localizedActionError = useMemo(() => frErrorMessage(lastActionError), [lastActionError]);

  const handleStartSetupGame = (payload: SetupPayload) => {
    if (isRemoteSession()) {
      multiplayerClientRef.current?.leaveRoom();
      multiplayerClientRef.current?.disconnect();
      disableRemoteSession();
      clearReconnectSession();
      multiplayerHadGameStateRef.current = false;
      setMultiplayerGameStarted(false);
      setMultiplayerConnected(false);
      setMultiplayerSeatId(null);
      setMultiplayerRoomPlayers([]);
    }
    prevHotseatActiveRef.current = null;
    prevTradeHotseatRef.current = null;
    setHotseatMode(payload.hotseatMode);
    initializeGame({
      preset: payload.preset,
      config: payload.config,
      playerNames: payload.playerNames,
      playerTypes: payload.playerTypes,
      civilizations: payload.civilizations,
      aiDifficulties: payload.aiDifficulties,
      profiles: payload.profiles,
      hotseatMode: payload.hotseatMode,
    });
    setIsMultiplayerSession(false);
    setIsSpectatorMode(false);
    resetInGameUI();
    setScreen('in-game');
    closeModal();
  };

  const handleContinueFromMenu = () => {
    if (isRemoteSession()) {
      multiplayerClientRef.current?.leaveRoom();
      multiplayerClientRef.current?.disconnect();
      disableRemoteSession();
      clearReconnectSession();
    }
    const result = loadMostRecentSave();
    if (result.ok) {
      setIsMultiplayerSession(false);
      setIsSpectatorMode(false);
      resetInGameUI();
      setScreen('in-game');
      return;
    }
    reportActionError(result.reason ?? 'Aucune sauvegarde chargeable');
    setScreen('load-game');
  };

  const showHudNotice = useCallback((message: string) => {
    setHudNotice(message);
    window.setTimeout(() => {
      setHudNotice((current) => (current === message ? null : current));
    }, 2400);
  }, []);

  const quitToMainMenu = useCallback(() => {
    if (!isMultiplayerSession && !isRemoteSession() && gameStateRef.current) {
      autoSave();
    }
    if (isMultiplayerSession) {
      multiplayerClientRef.current?.leaveRoom();
      multiplayerClientRef.current?.disconnect();
      disableRemoteSession();
      setIsMultiplayerSession(false);
      setMultiplayerGameStarted(false);
      setMultiplayerConnected(false);
    }
    setScreen('main-menu');
  }, [autoSave, isMultiplayerSession, setScreen]);

  useEffect(() => {
    const persistAutosave = () => {
      if (screenRef.current !== 'in-game') return;
      if (!gameStateRef.current) return;
      if (isMultiplayerSession || isRemoteSession()) return;
      autoSave();
    };
    window.addEventListener('beforeunload', persistAutosave);
    window.addEventListener('pagehide', persistAutosave);
    return () => {
      window.removeEventListener('beforeunload', persistAutosave);
      window.removeEventListener('pagehide', persistAutosave);
    };
  }, [autoSave, isMultiplayerSession]);

  const openActionTab = useCallback(
    (tab: 'build' | 'trade' | 'units' | 'city') => {
      if (isReadOnlySession) return;
      if (sidePanelTab === tab) {
        clearClassicBuildMode();
        setSidePanelTab('tile');
        return;
      }
      if (tab !== 'units') {
        clearUnitCommand();
      }
      if (tab === 'trade') {
        setOpenExtensionDock(null);
      }
      clearClassicBuildMode();
      setSidePanelTab(tab);
    },
    [
      canControlActivePlayer,
      clearClassicBuildMode,
      clearUnitCommand,
      gameState?.turnPhase,
      usesTopoPlacement,
      isReadOnlySession,
      sidePanelTab,
      setClassicBuildMode,
      setSidePanelTab,
    ],
  );

  const startClassicBuildMode = useCallback(
    (mode: 'settlement' | 'road' | 'city' | 'ck_knight') => {
      if (isReadOnlySession || !canControlActivePlayer) return;
      if (!usesTopoPlacement) return;
      if (gameState?.turnPhase !== 'player_action') return;
      if (classicBuildMode === mode) {
        clearClassicBuildMode();
        return;
      }
      setClassicBuildMode(mode);
      setSidePanelTab('tile');
    },
    [
      canControlActivePlayer,
      classicBuildMode,
      clearClassicBuildMode,
      gameState?.turnPhase,
      usesTopoPlacement,
      isReadOnlySession,
      setClassicBuildMode,
      setSidePanelTab,
    ],
  );

  const getMultiplayerClient = useCallback(() => {
    if (!multiplayerClientRef.current) {
      multiplayerClientRef.current = new MultiplayerClient();
    }
    return multiplayerClientRef.current;
  }, []);

  const connectMultiplayer = useCallback(() => {
    const client = getMultiplayerClient();
    setMultiplayerConnecting(true);
    setMultiplayerError(null);
    const saved = loadReconnectSession();
    const typedRoom = multiplayerRoomId.trim();
    const shouldReconnect = Boolean(
      saved?.token && saved.roomId && (!typedRoom || typedRoom === saved.roomId),
    );
    client.connect(
      {
        serverUrl: multiplayerServerUrl,
        roomId: shouldReconnect ? saved!.roomId : typedRoom || undefined,
        playerName: multiplayerPlayerName || 'Joueur',
        spectator: shouldReconnect ? false : multiplayerJoinAsSpectator,
        reconnectToken: shouldReconnect ? saved!.token : undefined,
      },
      {
        onConnected: () => {
          setMultiplayerConnecting(false);
          setMultiplayerConnected(true);
          setMultiplayerError(null);
          if (!shouldReconnect) {
            setIsSpectatorMode(multiplayerJoinAsSpectator);
          }
          client.listSavedRooms();
        },
        onDisconnected: () => {
          setMultiplayerConnected(false);
          setMultiplayerConnecting(false);
        },
        onRooms: (rooms) => {
          setMultiplayerRooms(rooms);
        },
        onSavedRooms: (rooms) => {
          setMultiplayerSavedRooms(rooms);
        },
        onRoomSaveAck: (payload) => {
          if (mpSaveTimeoutRef.current != null) {
            window.clearTimeout(mpSaveTimeoutRef.current);
            mpSaveTimeoutRef.current = null;
          }
          setMpSaveBusy(false);
          if (payload.ok) {
            const message = 'Partie sauvegardée sur le serveur.';
            setMultiplayerInviteHint(message);
            setMpSaveHint(message);
            showHudNotice(message);
            multiplayerClientRef.current?.listSavedRooms();
            window.setTimeout(() => {
              setMpSaveHint((current) => (current === message ? null : current));
            }, 2800);
          } else {
            const reason = payload.reason ?? 'Sauvegarde serveur impossible';
            setMultiplayerError(reason);
            setMpSaveHint(reason);
            reportActionError(reason);
          }
        },
        onRoomPlayers: (players) => {
          setMultiplayerRoomPlayers(players);
          const self =
            players.find((player) => player.id === multiplayerSeatId) ??
            players.find((player) => player.name === multiplayerPlayerName);
          if (typeof self?.isHost === 'boolean') {
            setMultiplayerIsHost(self.isHost);
          }
          if (self?.gamePlayerId) {
            updateRemotePlayerId(self.gamePlayerId);
            persistReconnectSession();
          }
        },
        onRoomJoined: (payload) => {
          setMultiplayerRoomId(payload.roomId);
          setMultiplayerSeatId(payload.seatId);
          setMultiplayerIsHost(payload.isHost);
          setIsSpectatorMode(payload.spectator);
          setIsMultiplayerSession(true);
          setMultiplayerRoomPlayers(payload.players);
          const gamePlayerId =
            payload.players.find((player) => player.id === payload.seatId)?.gamePlayerId ??
            payload.seatId;
          enableRemoteSession({
            submit: (command) => {
              client.submitCommand(command);
              return { ok: true };
            },
            playerId: gamePlayerId,
            seatId: payload.seatId,
            reconnectToken: payload.reconnectToken,
            roomId: payload.roomId,
          });
          persistReconnectSession();
        },
        onChat: (message) => {
          setMultiplayerChatMessages((prev) => [...prev.slice(-199), message]);
        },
        onStateSync: (state) => {
          const me = [...state.players.values()].find(
            (player) => player.name === multiplayerPlayerName,
          );
          if (me) {
            updateRemotePlayerId(me.id);
            persistReconnectSession();
          }
          // Ne pas reset l'UI à chaque sync (annulerait Village/Route/Ville en cours)
          if (!multiplayerHadGameStateRef.current) {
            resetInGameUI();
            multiplayerHadGameStateRef.current = true;
          }
          setMultiplayerGameStarted(true);
          setGameStateFromNetwork(state, { skipAI: true });
          setScreen('in-game');
          setIsMultiplayerSession(true);
        },
        onCommandRejected: (payload) => {
          setMultiplayerError(payload.reason);
          reportActionError(payload.reason);
        },
        onError: (message) => {
          setMultiplayerError(message);
          setMultiplayerConnecting(false);
        },
      },
    );
  }, [
    getMultiplayerClient,
    multiplayerPlayerName,
    multiplayerJoinAsSpectator,
    multiplayerRoomId,
    multiplayerSeatId,
    multiplayerServerUrl,
    reportActionError,
    resetInGameUI,
    setGameStateFromNetwork,
    setScreen,
    showHudNotice,
  ]);

  const disconnectMultiplayer = useCallback(() => {
    const client = multiplayerClientRef.current;
    if (client) {
      client.leaveRoom();
      client.disconnect();
    }
    disableRemoteSession();
    clearReconnectSession();
    multiplayerHadGameStateRef.current = false;
    setMultiplayerGameStarted(false);
    setMultiplayerConnected(false);
    setMultiplayerConnecting(false);
    setIsMultiplayerSession(false);
    setIsSpectatorMode(false);
    setMultiplayerIsHost(false);
    setMultiplayerSeatId(null);
    setMultiplayerRoomPlayers([]);
    setMultiplayerChatMessages([]);
    setMultiplayerInviteHint(null);
  }, []);

  const leaveMultiplayerLobbyToMenu = useCallback(() => {
    if (isMultiplayerSession && multiplayerGameStarted) {
      setScreen('in-game');
      return;
    }
    disconnectMultiplayer();
    setScreen('main-menu');
  }, [disconnectMultiplayer, isMultiplayerSession, multiplayerGameStarted, setScreen]);

  const refreshMultiplayerRooms = useCallback(() => {
    multiplayerClientRef.current?.requestRooms();
    multiplayerClientRef.current?.listSavedRooms();
  }, []);

  const resumeSavedMultiplayerRoom = useCallback(
    (roomId: string) => {
      multiplayerClientRef.current?.resumeRoom(roomId, multiplayerPlayerName || 'Joueur');
      setMultiplayerRoomId(roomId);
      setMultiplayerError(null);
    },
    [multiplayerPlayerName],
  );

  const discardSavedMultiplayerRoom = useCallback((roomId: string) => {
    if (!window.confirm(`Abandonner la sauvegarde du salon ${roomId} ?`)) return;
    const saved = loadReconnectSession();
    const token =
      saved?.roomId === roomId
        ? saved.token
        : getReconnectToken() && getRemoteRoomId() === roomId
          ? getReconnectToken()!
          : undefined;
    multiplayerClientRef.current?.discardSavedRoom(roomId, token);
  }, []);

  const saveMultiplayerRoom = useCallback(() => {
    if (!multiplayerIsHost || mpSaveBusy) return;
    setMpSaveBusy(true);
    setMpSaveHint(null);
    multiplayerClientRef.current?.saveRoom();
    if (mpSaveTimeoutRef.current != null) {
      window.clearTimeout(mpSaveTimeoutRef.current);
    }
    mpSaveTimeoutRef.current = window.setTimeout(() => {
      mpSaveTimeoutRef.current = null;
      setMpSaveBusy(false);
      setMpSaveHint((hint) => hint ?? 'Pas de réponse serveur');
    }, 8000);
  }, [mpSaveBusy, multiplayerIsHost]);

  const createMultiplayerRoom = useCallback(() => {
    const roomName = multiplayerRoomName.trim();
    if (!roomName) return;
    multiplayerClientRef.current?.createRoom(
      roomName,
      multiplayerPlayerName || 'Joueur',
      multiplayerMaxPlayers,
    );
  }, [multiplayerMaxPlayers, multiplayerPlayerName, multiplayerRoomName]);

  const joinMultiplayerRoom = useCallback(
    (roomId?: string) => {
      const targetRoom = (roomId ?? multiplayerRoomId).trim();
      if (!targetRoom) return;
      setMultiplayerRoomId(targetRoom);
      multiplayerClientRef.current?.joinRoom(
        targetRoom,
        multiplayerPlayerName || 'Joueur',
        multiplayerJoinAsSpectator,
      );
      setIsMultiplayerSession(true);
      setIsSpectatorMode(multiplayerJoinAsSpectator);
      setMultiplayerError(null);
    },
    [multiplayerJoinAsSpectator, multiplayerPlayerName, multiplayerRoomId],
  );

  const startMultiplayerGame = useCallback(() => {
    const payload = buildMultiplayerStartConfig(multiplayerLobbyConfig);
    multiplayerClientRef.current?.startGame(payload);
  }, [multiplayerLobbyConfig]);

  const addMultiplayerAi = useCallback(() => {
    multiplayerClientRef.current?.addAiSeat({
      difficulty: multiplayerLobbyConfig.aiDifficulty,
    });
  }, [multiplayerLobbyConfig.aiDifficulty]);

  const removeMultiplayerAi = useCallback((seatId: string) => {
    multiplayerClientRef.current?.removeAiSeat({ seatId });
  }, []);

  const copyMultiplayerInvite = useCallback(() => {
    if (!multiplayerRoomId.trim()) return;
    const link = buildInviteUrl(multiplayerServerUrl, multiplayerRoomId.trim());
    const write = navigator.clipboard?.writeText?.(link);
    if (write) {
      void write
        .then(() => setMultiplayerInviteHint('Lien d’invitation copié dans le presse-papiers.'))
        .catch(() =>
          setMultiplayerInviteHint(`Copiez ce lien manuellement : ${link}`),
        );
    } else {
      setMultiplayerInviteHint(`Copiez ce lien manuellement : ${link}`);
    }
  }, [multiplayerRoomId, multiplayerServerUrl]);

  const setMultiplayerReady = useCallback((ready: boolean) => {
    multiplayerClientRef.current?.setReady(ready);
  }, []);

  const sendMultiplayerChat = useCallback((text: string) => {
    const trimmed = text.trim();
    if (!trimmed) return;
    multiplayerClientRef.current?.sendChat(trimmed);
  }, []);

  useEffect(() => {
    if (multiplayerInviteHandledRef.current) return;
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    if (params.get('mp') !== '1') return;
    multiplayerInviteHandledRef.current = true;
    const server = params.get('server');
    const room = params.get('room');
    if (server) setMultiplayerServerUrl(server);
    if (room) setMultiplayerRoomId(room);
    setMultiplayerInviteHint(
      room
        ? `Invitation détectée — salon ${room}. Cliquez Se connecter pour rejoindre automatiquement.`
        : 'Invitation détectée — connectez-vous au serveur.',
    );
    setScreen('multiplayer-lobby');
  }, []);

  useEffect(() => {
    return () => {
      multiplayerClientRef.current?.disconnect();
      multiplayerClientRef.current = null;
      disableRemoteSession();
      clearReconnectSession();
    };
  }, []);

  if (screen === 'main-menu') {
    return (
      <>
        <MainMenu
          canContinue={listLoadableSaves().length > 0}
          onNewGame={() => setScreen('game-setup')}
          onContinue={handleContinueFromMenu}
          onLoadGame={() => {
            refreshSaves();
            setScreen('load-game');
          }}
          onMultiplayer={() => {
            setScreen('multiplayer-lobby');
          }}
          onOptions={() => openModal('settings')}
          onHelp={() => openModal('help')}
        />
        {activeModal === 'settings' && <SettingsModal onClose={closeModal} />}
        {activeModal === 'help' && (
          <Suspense fallback={<LazyFallback label="Chargement du guide…" />}>
            <LazyHelpGuideModal onClose={closeModal} />
          </Suspense>
        )}
      </>
    );
  }

  if (screen === 'game-setup') {
    return (
      <>
        <Suspense fallback={<LazyFallback label="Chargement de la configuration…" />}>
          <LazyGameSetup
            onStart={handleStartSetupGame}
            onBack={() => {
              setScreen('main-menu');
              closeModal();
            }}
            onOpenCivModal={(playerIndex) => {
              setCivTargetIndex(playerIndex);
              openModal('civ-select');
            }}
            civSelections={civSelections}
          />
        </Suspense>

        {activeModal === 'civ-select' && (
          <CivSelectModal
            selected={
              typeof civTargetIndex === 'number' ? (civSelections[civTargetIndex] ?? null) : null
            }
            onSelect={(civ) => {
              if (typeof civTargetIndex !== 'number') return;
              setCivSelections((prev) => ({ ...prev, [civTargetIndex]: civ }));
              closeModal();
            }}
            onClose={closeModal}
          />
        )}
      </>
    );
  }

  if (screen === 'load-game') {
    return (
      <Suspense fallback={<LazyFallback label="Chargement des sauvegardes…" />}>
        <LazyLoadGame
          saves={saves}
          onLoad={(id) => {
            if (isRemoteSession()) {
              multiplayerClientRef.current?.leaveRoom();
              multiplayerClientRef.current?.disconnect();
              disableRemoteSession();
              clearReconnectSession();
              setMultiplayerGameStarted(false);
              setMultiplayerConnected(false);
              setMultiplayerSeatId(null);
            }
            const result = loadGame(id);
            if (result.ok) {
              setIsMultiplayerSession(false);
              setIsSpectatorMode(false);
              resetInGameUI();
              setScreen('in-game');
            } else {
              reportActionError(result.reason ?? 'Chargement impossible');
            }
          }}
          onDelete={(id) => deleteSave(id)}
          onRename={(id, name) => {
            const result = renameSave(id, name);
            if (!result.ok) {
              reportActionError(result.reason ?? 'Impossible de renommer');
            }
          }}
          onExport={(id) => {
            const bundle = exportSave(id);
            if (!bundle) {
              reportActionError('Export impossible — fichier manquant');
              return;
            }
            const blob = new Blob([JSON.stringify(bundle, null, 2)], {
              type: 'application/json',
            });
            const url = URL.createObjectURL(blob);
            const anchor = document.createElement('a');
            anchor.href = url;
            anchor.download = `${bundle.meta.name.replace(/[^\w\-]+/g, '_') || 'catanx-save'}.json`;
            anchor.click();
            URL.revokeObjectURL(url);
          }}
          onImport={(raw, slot) => {
            const result = importSave(raw, slot);
            if (!result.ok) {
              reportActionError(result.reason ?? 'Import impossible');
            }
          }}
          onBack={() => setScreen('main-menu')}
        />
      </Suspense>
    );
  }

  if (screen === 'multiplayer-lobby') {
    return (
      <Suspense fallback={<LazyFallback label="Chargement du lobby…" />}>
        <LazyMultiplayerLobby
          connected={multiplayerConnected}
          connecting={multiplayerConnecting}
          serverUrl={multiplayerServerUrl}
          roomId={multiplayerRoomId}
          seatId={multiplayerSeatId}
          roomName={multiplayerRoomName}
          playerName={multiplayerPlayerName}
          maxPlayers={multiplayerMaxPlayers}
          lobbyConfig={multiplayerLobbyConfig}
          joinAsSpectator={multiplayerJoinAsSpectator}
          isHost={multiplayerIsHost}
          rooms={multiplayerRooms}
          savedRooms={multiplayerSavedRooms}
          roomPlayers={multiplayerRoomPlayers}
          chatMessages={multiplayerChatMessages}
          error={multiplayerError}
          inviteHint={multiplayerInviteHint}
          hasActiveGame={multiplayerGameStarted}
          onServerUrlChange={setMultiplayerServerUrl}
          onRoomIdChange={setMultiplayerRoomId}
          onRoomNameChange={setMultiplayerRoomName}
          onPlayerNameChange={setMultiplayerPlayerName}
          onMaxPlayersChange={setMultiplayerMaxPlayers}
          onLobbyConfigChange={(patch) =>
            setMultiplayerLobbyConfig((prev) => ({ ...prev, ...patch }))
          }
          onJoinAsSpectatorChange={setMultiplayerJoinAsSpectator}
          onConnect={connectMultiplayer}
          onDisconnect={disconnectMultiplayer}
          onRefreshRooms={refreshMultiplayerRooms}
          onCreateRoom={createMultiplayerRoom}
          onJoinRoom={joinMultiplayerRoom}
          onStartGame={startMultiplayerGame}
          onSetReady={setMultiplayerReady}
          onAddAi={addMultiplayerAi}
          onRemoveAi={removeMultiplayerAi}
          onCopyInvite={copyMultiplayerInvite}
          onResumeSavedRoom={resumeSavedMultiplayerRoom}
          onDiscardSavedRoom={discardSavedMultiplayerRoom}
          onRefreshSavedRooms={() => multiplayerClientRef.current?.listSavedRooms()}
          onBack={leaveMultiplayerLobbyToMenu}
          onSendChat={sendMultiplayerChat}
        />
      </Suspense>
    );
  }

  if (!gameState || !currentPlayer || !currentPlayerId) {
    return (
      <div style={{ width: '100%', height: '100%', display: 'grid', placeItems: 'center' }}>
        <div className="ui-panel" style={{ padding: 18 }}>
          Initialisation du monde de CatanX...
        </div>
      </div>
    );
  }

  return (
    <div
      className="app-shell"
      data-season={shellSeason}
      data-visual-quality={visualQuality}
      data-contrast={highContrast ? 'high' : 'normal'}
      data-ui-scale={shellUiScale}
      data-compact-hud={compactHud ? '1' : '0'}
      data-guided-turn={guidedTurnUI ? '1' : '0'}
    >
      <LiveRegion message={liveAnnouncement} />
      <FpsOverlay enabled={showFpsMeter} />
      <MapErrorBoundary>
        <Suspense fallback={<LazyFallback label="Chargement de la carte…" />}>
          <LazyMapBoard
            gameState={gameState}
            selectedTile={selectedTileId}
            highlightedTiles={highlightedTiles}
            currentPlayerId={displayPlayerId ?? currentPlayerId}
            showGrid={showGrid}
            showAnimations={effectiveShowAnimations}
            animationSpeed={reducedMotionSetting || prefersReducedMotion ? 0.5 : animationSpeed}
            cameraSensitivity={cameraSensitivity}
            focusRequest={cameraFocusRequest}
            initialPlacement={initialPlacement}
            classicBuildMode={classicBuildMode}
            classicBuildIntersectionIds={classicBuildCandidates.intersections}
            classicBuildEdgeIds={classicBuildCandidates.edges}
            onPlacementIntersectionClick={onPlacementIntersectionClick}
            onPlacementEdgeClick={onPlacementEdgeClick}
            onTileClick={onTileClick}
            onTileHover={setHoveredTileId}
            viewMode={boardViewMode}
            boardLayer={boardLayer}
          />
        </Suspense>
      </MapErrorBoundary>

      <div className="ui-layer" id="catanx-main-content" data-compact={compactHud ? '1' : '0'}>
          {isUndergroundSkyEnabled(gameState) && (
            <LayerSelector layer={boardLayer} onChange={setBoardLayer} />
          )}
          <div className="hud-left-status-stack">
            <div className="hud-left-status-slot">
              <TurnIndicator
                turn={gameState.currentTurn}
                season={gameState.season}
                year={gameState.year}
                phase={gameState.turnPhase}
                diceTotal={gameState.lastDiceRoll?.total ?? null}
                players={turnPlayers}
                classicMode={isClassicMode}
              />
            </div>
            <div className="hud-left-status-slot hud-left-phase-slot">
              <PhaseBanner
                phase={gameState.turnPhase}
                classicMode={isClassicMode}
                isInitialPlacement={isInitialPlacementActive}
                activePlayerName={activePlayer?.name ?? currentPlayer.name}
              />
            </div>
            {progressMoment &&
              displayPlayerId &&
              progressMoment.actorId !== displayPlayerId &&
              progressMoment.impact.targetPlayerIds.includes(displayPlayerId) &&
              !dicePresentationToken &&
              !seasonMoment && (
              <div className="hud-left-impact-slot">
                <ProgressImpactMoment
                  token={progressMoment.token}
                  actorId={progressMoment.actorId}
                  viewerId={displayPlayerId}
                  playerNames={Object.fromEntries(
                    [...gameState.players].map(([id, player]) => [id, player.name]),
                  )}
                  impact={progressMoment.impact}
                  pacing={pacingPreset}
                  onComplete={finishProgressMoment}
                />
              </div>
            )}
          </div>
          {isMultiplayerSession && (
            <MultiplayerStatusPanel
              connected={multiplayerConnected}
              roomId={multiplayerRoomId}
              isSpectator={isSpectatorMode}
              players={multiplayerRoomPlayers}
              onOpenLobby={() => setScreen('multiplayer-lobby')}
              onSaveRoom={multiplayerIsHost ? saveMultiplayerRoom : undefined}
              saveBusy={mpSaveBusy}
              saveHint={mpSaveHint}
            />
          )}

          {!isSetupPhaseActive && (
            <InGameSessionMenu
              canSave={!isMultiplayerSession || multiplayerIsHost}
              saveLabel={isMultiplayerSession ? 'Sauver (serveur)' : 'Sauvegarder'}
              onSave={() => {
                if (isMultiplayerSession) {
                  saveMultiplayerRoom();
                  return;
                }
                setSaveModalOpen(true);
              }}
              onOpenSettings={() => openModal('settings')}
              onQuitToMenu={quitToMainMenu}
              onBackToLobby={
                isMultiplayerSession ? () => setScreen('multiplayer-lobby') : undefined
              }
            />
          )}

          {isMultiplayerSession && (
            <ChatBubbles messages={multiplayerChatMessages} playerName={multiplayerPlayerName} />
          )}

          {diceRollOverlayData && (
            <DiceRollOverlay
              die1={diceRollOverlayData.die1}
              die2={diceRollOverlayData.die2}
              total={diceRollOverlayData.total}
              token={diceRollOverlayData.token}
              eventDie={diceRollOverlayData.eventDie}
              diceStyle={diceRollOverlayData.diceStyle}
              durationMs={
                pacingPreset === 'epic' ? 2700 : pacingPreset === 'tabletop' ? 2200 : 1300
              }
              onComplete={handleDiceOverlayComplete}
            />
          )}

          <ResourceFlightLayer />
          {seasonMoment && !dicePresentationToken && (
            <SeasonTransitionMoment
              token={seasonMoment.token}
              season={seasonMoment.season}
              climateId={seasonMoment.climateId}
              year={seasonMoment.year}
              pacing={pacingPreset}
              motionEnabled={effectiveShowAnimations}
              onComplete={finishSeasonMoment}
            />
          )}
          <div className="hud-announcement-rail" aria-live="polite">
            {!dicePresentationToken &&
              !seasonMoment &&
              (ckMoment ? (
                <CkMoment
                  token={ckMoment.token}
                  kind={ckMoment.kind}
                  title={ckMoment.title}
                  detail={ckMoment.detail}
                  pacing={pacingPreset}
                  onComplete={finishCkMoment}
                />
              ) : turnRecap ? (
                <TurnRecap
                  token={turnRecap.token}
                  playerName={turnRecap.playerName}
                  turn={turnRecap.turn}
                  entries={turnRecap.entries}
                  pacing={pacingPreset}
                  onComplete={finishTurnRecap}
                />
              ) : collectionSummary ? (
                <CollectionSummary
                  token={collectionSummary.token}
                  entries={collectionSummary.entries}
                  durationMs={
                    pacingPreset === 'epic' ? 2800 : pacingPreset === 'tabletop' ? 2200 : 1400
                  }
                  onComplete={finishCollectionSummary}
                />
              ) : turnMomentToken ? (
                <TurnMoment
                  token={turnMomentToken}
                  turn={gameState.currentTurn}
                  phase={gameState.turnPhase}
                  season={gameState.season}
                  playerName={activePlayer?.name ?? currentPlayer.name}
                  diceTotal={gameState.lastDiceRoll?.total ?? null}
                  pacing={pacingPreset}
                  onComplete={finishTurnMoment}
                />
              ) : null)}
          </div>

          {pendingDiscardPlayer && (
            <DiscardModal
              required={Math.floor(getPublicResourceCount(pendingDiscardPlayer, gameState) / 2)}
              available={pendingDiscardPlayer.resources}
              availableCommodities={
                gameState.extensions?.citiesKnights?.playerCommodities[pendingDiscardPlayer.id] ??
                {}
              }
              availableMaterials={
                gameState.extensions?.undergroundSky?.playerMaterials[pendingDiscardPlayer.id] ?? {}
              }
              handLimit={ckHandLimit(gameState, pendingDiscardPlayer.id)}
              playerName={hotseatMode ? pendingDiscardPlayer.name : undefined}
              onConfirm={({ resources, commodities, undergroundSkyMaterials }) => {
                if (pendingLocalDiscardPlayerId) {
                  actions.discardOnSeven(
                    resources,
                    pendingLocalDiscardPlayerId,
                    commodities,
                    undergroundSkyMaterials,
                  );
                  audio.playSfx('discard');
                  forceSync();
                }
              }}
            />
          )}

          {gameState.turnPhase === 'move_robber' && canControlActivePlayer && (
            <RobberStealPanel
              mode="move"
              tiles={robberMoveTiles}
              candidates={[]}
              onSelectTile={(tileId) => {
                actions.moveRobber(tileId);
                forceSync();
              }}
            />
          )}

          {gameState.turnPhase === 'steal_resource' && canControlActivePlayer && (
            <RobberStealPanel
              mode="steal"
              tiles={[]}
              candidates={stealCandidates}
              onSelectPlayer={(playerId) => {
                actions.stealFromPlayer(playerId);
                forceSync();
              }}
              onSkipSteal={() => {
                actions.stealFromPlayer(null);
                forceSync();
              }}
            />
          )}

          {showFloatingEconomyPanels && activePlayer && (
            <div className="commerce-stack" aria-label="Commerce">
              <div className="ui-panel commerce-tabs">
                <div className="commerce-tabs__head">
                  <span className="commerce-tabs__title">
                    <i aria-hidden="true">
                      <Icon name="trade" size={18} />
                    </i>
                    <span>
                      <small>COMPTOIR</small>
                      <strong>Commerce</strong>
                    </span>
                  </span>
                  <button
                    type="button"
                    onClick={() => setSidePanelTab('tile')}
                    aria-label="Fermer le commerce"
                  >
                    <Icon name="close" size={14} />
                  </button>
                </div>
                <div className="commerce-tabs__nav" role="tablist" aria-label="Type de commerce">
                  <button
                    type="button"
                    role="tab"
                    aria-selected={commerceView === 'bank'}
                    onClick={() => setCommerceView('bank')}
                  >
                    <Icon name="gold" size={14} />
                    Banque & ports
                  </button>
                  <button
                    type="button"
                    role="tab"
                    aria-selected={commerceView === 'players'}
                    onClick={() => setCommerceView('players')}
                  >
                    <Icon name="diplomacy" size={14} />
                    Joueurs
                  </button>
                  {!isCitiesKnightsEnabled(gameState) && (
                    <button
                      type="button"
                      role="tab"
                      aria-selected={commerceView === 'cards'}
                      onClick={() => setCommerceView('cards')}
                    >
                      <Icon name="tech" size={14} />
                      Développement
                    </button>
                  )}
                </div>
              </div>
              {!isCitiesKnightsEnabled(gameState) && commerceView === 'cards' && (
                <DevCardPanel
                  cards={activePlayer.devCards.filter((card) => !card.played)}
                  classicMode={isClassicMode}
                  layout={isClassicMode ? 'left' : 'right'}
                  currentTurn={gameState.currentTurn}
                  playedDevThisTurn={activePlayer.devCardsPlayedThisTurn > 0}
                  canBuy={
                    diceRolledThisTurn &&
                    (activePlayer.resources.ore ?? 0) >= 1 &&
                    (activePlayer.resources.wheat ?? 0) >= 1 &&
                    (activePlayer.resources.sheep ?? 0) >= 1 &&
                    (!isClassicMode || (gameState.devDeck?.length ?? 0) > 0)
                  }
                  buyReason={
                    !diceRolledThisTurn
                      ? 'Lancez les dés avant d’acheter'
                      : (activePlayer.resources.ore ?? 0) < 1 ||
                          (activePlayer.resources.wheat ?? 0) < 1 ||
                          (activePlayer.resources.sheep ?? 0) < 1
                        ? 'Il faut 1 minerai, 1 blé et 1 laine'
                        : isClassicMode && (gameState.devDeck?.length ?? 0) === 0
                          ? 'Le deck de développement est épuisé'
                          : undefined
                  }
                  bankStock={gameState.bank}
                  onBuy={() => {
                    const result = actions.drawDevCard();
                    forceSync();
                    if (!result.ok && result.reason) reportActionError(result.reason);
                    return result;
                  }}
                  onPlayKnight={(cardId, tileId, targetPlayerId) => {
                    const result = actions.playDevCard(cardId, targetPlayerId || null, tileId);
                    forceSync();
                    if (result.ok) audio.playSfx('robber');
                    else if (result.reason) reportActionError(result.reason);
                    return result;
                  }}
                  onPlayRoadBuilding={(cardId) => {
                    const result = actions.playDevCard(cardId);
                    forceSync();
                    if (result.ok) {
                      audio.playSfx('build');
                      setClassicBuildMode('road');
                      setSidePanelTab('tile');
                    } else if (result.reason) {
                      reportActionError(result.reason);
                    }
                    return result;
                  }}
                  onPlayYearOfPlenty={(cardId, resource1, resource2) => {
                    const result = actions.playDevCard(cardId, null, `${resource1}:${resource2}`);
                    forceSync();
                    if (result.ok) audio.playSfx('collect');
                    else if (result.reason) reportActionError(result.reason);
                    return result;
                  }}
                  onPlayMonopoly={(cardId, resource) => {
                    const result = actions.playDevCard(cardId, null, resource);
                    forceSync();
                    if (result.ok) audio.playSfx('collect');
                    else if (result.reason) reportActionError(result.reason);
                    return result;
                  }}
                  onPlayVictoryPoint={(cardId) => {
                    const result = actions.playDevCard(cardId);
                    forceSync();
                    if (!result.ok && result.reason) reportActionError(result.reason);
                    return result;
                  }}
                  robberTileOptions={robberTargetTiles.map((tile) => ({
                    id: tile.id,
                    label: `${tile.terrain}${tile.diceValue ? ` (${tile.diceValue})` : ''}`,
                  }))}
                  stealTargets={[...gameState.players.values()]
                    .filter((player) => player.id !== activePlayerId)
                    .map((player) => ({ id: player.id, name: player.name }))}
                />
              )}
              {commerceView === 'bank' && (
                <BankTradePanel
                  getRatio={bankTradeRatioFor}
                  getMaterialRatio={
                    isUndergroundSkyEnabled(gameState) ? materialBankTradeRatio : undefined
                  }
                  available={activePlayer.resources}
                  availableMaterials={
                    isUndergroundSkyEnabled(gameState)
                      ? (gameState.extensions?.undergroundSky?.playerMaterials[
                          activePlayerId ?? ''
                        ] ?? {})
                      : undefined
                  }
                  bankStock={gameState.bank}
                  materialBankStock={
                    isUndergroundSkyEnabled(gameState)
                      ? gameState.extensions?.undergroundSky?.materialBank
                      : undefined
                  }
                  tradeEnabled={bankTradeReady}
                  tradeDisabledReason={
                    gameState.turnPhase !== 'player_action'
                      ? 'Attendez la fin de la collecte (après les dés) pour échanger.'
                      : undefined
                  }
                  onTrade={(give, receive, options) => {
                    const result = actions.bankTrade(give, receive, options);
                    if (result.ok) {
                      audio.playSfx('trade');
                      playTradeExchange(give, receive);
                    } else if (result.reason) {
                      reportActionError(result.reason);
                    }
                    forceSync();
                    return result;
                  }}
                />
              )}
              {commerceView === 'players' && (
                <PlayerTradePanel
                  partners={[...gameState.players.values()]
                    .filter((player) => player.id !== activePlayerId && !player.isEliminated)
                    .map((player) => ({ id: player.id, name: player.name }))}
                  available={activePlayer.resources}
                  canPropose={canControlActivePlayer && !gameState.pendingPlayerTrade}
                  pending={
                    gameState.pendingPlayerTrade
                      ? (() => {
                          const trade = gameState.pendingPlayerTrade!;
                          const broadcast = trade.toPlayerId === null;
                          const rejected = trade.rejectedBy ?? [];
                          const role: 'proposer' | 'target' | 'spectator' =
                            displayPlayerId === trade.fromPlayerId
                              ? 'proposer'
                              : broadcast
                                ? displayPlayerId && !rejected.includes(displayPlayerId)
                                  ? 'target'
                                  : 'spectator'
                                : displayPlayerId === trade.toPlayerId
                                  ? 'target'
                                  : 'spectator';
                          return {
                            id: trade.id,
                            fromName: gameState.players.get(trade.fromPlayerId)?.name ?? '?',
                            toName: broadcast
                              ? 'tout le monde'
                              : (gameState.players.get(trade.toPlayerId!)?.name ?? '?'),
                            give: trade.give,
                            receive: trade.receive,
                            termsHidden: Boolean(trade.termsHidden),
                            role,
                          };
                        })()
                      : null
                  }
                  onPropose={(toPlayerId, give, receive) => {
                    const result = actions.proposePlayerTrade(toPlayerId, give, receive);
                    if (result.ok) audio.playSfx('trade');
                    forceSync();
                  }}
                  onAccept={(tradeId) => {
                    const result = actions.acceptPlayerTrade(tradeId, displayPlayerId ?? undefined);
                    if (result.ok) {
                      audio.playSfx('trade');
                      const pending = gameState.pendingPlayerTrade;
                      if (pending && !pending.termsHidden) {
                        playTradeExchange(pending.receive, pending.give);
                      }
                    }
                    forceSync();
                  }}
                  onReject={(tradeId) => {
                    actions.rejectPlayerTrade(tradeId, displayPlayerId ?? undefined);
                    forceSync();
                  }}
                  onCancel={(tradeId) => {
                    actions.cancelPlayerTrade(tradeId);
                    forceSync();
                  }}
                />
              )}
            </div>
          )}

          {/* Offre reçue hors panneau d'action (hotseat / spectateur local) */}
          {(isClassicMode || limitedBankEconomy) &&
            gameState.pendingPlayerTrade &&
            (() => {
              const trade = gameState.pendingPlayerTrade!;
              const broadcast = trade.toPlayerId === null;
              const rejected = trade.rejectedBy ?? [];
              const isTarget =
                Boolean(displayPlayerId) &&
                displayPlayerId !== trade.fromPlayerId &&
                (broadcast
                  ? !rejected.includes(displayPlayerId!)
                  : displayPlayerId === trade.toPlayerId);
              return isTarget && !showClassicActionPanels && !isReadOnlySession;
            })() && (
              <PlayerTradePanel
                partners={[]}
                available={gameState.players.get(displayPlayerId!)?.resources ?? {}}
                canPropose={false}
                pending={{
                  id: gameState.pendingPlayerTrade.id,
                  fromName:
                    gameState.players.get(gameState.pendingPlayerTrade.fromPlayerId)?.name ?? '?',
                  toName:
                    gameState.pendingPlayerTrade.toPlayerId === null
                      ? 'tout le monde'
                      : (gameState.players.get(gameState.pendingPlayerTrade.toPlayerId)?.name ??
                        '?'),
                  give: gameState.pendingPlayerTrade.give,
                  receive: gameState.pendingPlayerTrade.receive,
                  termsHidden: Boolean(gameState.pendingPlayerTrade.termsHidden),
                  role: 'target',
                }}
                onPropose={() => undefined}
                onAccept={(tradeId) => {
                  const result = actions.acceptPlayerTrade(tradeId, displayPlayerId ?? undefined);
                  if (result.ok) {
                    audio.playSfx('trade');
                    const pending = gameState.pendingPlayerTrade;
                    if (pending && !pending.termsHidden) {
                      playTradeExchange(pending.receive, pending.give);
                    }
                  }
                  forceSync();
                }}
                onReject={(tradeId) => {
                  actions.rejectPlayerTrade(tradeId, displayPlayerId ?? undefined);
                  forceSync();
                }}
                onCancel={() => undefined}
              />
            )}

          {privacyScreenPlayerId && gameState.players.get(privacyScreenPlayerId) && (
            <PrivacyScreen
              playerName={gameState.players.get(privacyScreenPlayerId)!.name}
              onConfirm={dismissPrivacyScreen}
            />
          )}

          {isSeasonsEnabled(gameState) && (
            <SeasonWidget
              gameState={gameState}
              localPlayerId={displayPlayerId}
              open={openExtensionDock === 'seasons'}
              onOpenChange={(open) => setOpenExtensionDock(open ? 'seasons' : null)}
              onChoosePreparation={
                isSetupPhaseActive
                  ? undefined
                  : (preparation, targetResource) => {
                      actions.chooseSeasonPreparation(preparation, targetResource);
                      forceSync();
                    }
              }
            />
          )}

          {displayPlayerId && isCitiesKnightsEnabled(gameState) && (
            <CitiesKnightsPanel
              state={gameState}
              expanded={openExtensionDock === 'citiesKnights'}
              onExpandedChange={(expanded) =>
                setOpenExtensionDock(expanded ? 'citiesKnights' : null)
              }
              playerId={
                gameState.extensions?.citiesKnights?.pendingResolutions.find(
                  (r) =>
                    (r.kind === 'aqueduct' ||
                      r.kind === 'place_metropolis' ||
                      r.kind === 'pillage_city' ||
                      r.kind === 'choose_progress_deck' ||
                      r.kind === 'discard_progress' ||
                      r.kind === 'knight_retreat') &&
                    localHumanPlayerIds.includes(r.playerId),
                )?.playerId ?? displayPlayerId
              }
              canAct={canControlActivePlayer && gameState.turnPhase === 'player_action'}
              canPlayAlchemist={canControlActivePlayer && gameState.turnPhase === 'start_of_turn'}
              onImprove={(track) => {
                const result = actions.ckImproveUrban(track);
                forceSync();
                if (result.ok) audio.playSfx('ck_urban');
                if (!result.ok && result.reason) reportActionError(result.reason);
              }}
              onAqueduct={(resource) => {
                const aqueductPlayerId =
                  gameState.extensions?.citiesKnights?.pendingResolutions.find(
                    (r) => r.kind === 'aqueduct' && localHumanPlayerIds.includes(r.playerId),
                  )?.playerId ?? displayPlayerId;
                const result = actions.ckChooseAqueduct(resource, aqueductPlayerId);
                forceSync();
                if (!result.ok && result.reason) reportActionError(result.reason);
              }}
              onPlaceMetropolis={(track, intersectionId) => {
                const metroPlayerId =
                  gameState.extensions?.citiesKnights?.pendingResolutions.find(
                    (r) =>
                      r.kind === 'place_metropolis' && localHumanPlayerIds.includes(r.playerId),
                  )?.playerId ?? displayPlayerId;
                const result = actions.ckPlaceMetropolis(track, intersectionId, metroPlayerId);
                forceSync();
                if (!result.ok && result.reason) reportActionError(result.reason);
              }}
              onBuildWall={(intersectionId) => {
                const result = actions.ckBuildWall(intersectionId);
                forceSync();
                if (result.ok) audio.playSfx('build');
                if (!result.ok && result.reason) reportActionError(result.reason);
              }}
              onChoosePillage={(intersectionId) => {
                const pillagePlayerId =
                  gameState.extensions?.citiesKnights?.pendingResolutions.find(
                    (r) => r.kind === 'pillage_city' && localHumanPlayerIds.includes(r.playerId),
                  )?.playerId ?? displayPlayerId;
                const result = actions.ckChoosePillageCity(intersectionId, pillagePlayerId);
                forceSync();
                if (result.ok) audio.playSfx('ck_invasion');
                if (!result.ok && result.reason) reportActionError(result.reason);
              }}
              onChooseProgressDeck={(deck) => {
                const drawPlayerId =
                  gameState.extensions?.citiesKnights?.pendingResolutions.find(
                    (r) =>
                      r.kind === 'choose_progress_deck' && localHumanPlayerIds.includes(r.playerId),
                  )?.playerId ?? displayPlayerId;
                const result = actions.ckChooseProgressDeck(deck, drawPlayerId);
                forceSync();
                if (!result.ok && result.reason) reportActionError(result.reason);
              }}
              onDiscardProgress={(cardId) => {
                const discardPlayerId =
                  gameState.extensions?.citiesKnights?.pendingResolutions.find(
                    (r) =>
                      r.kind === 'discard_progress' && localHumanPlayerIds.includes(r.playerId),
                  )?.playerId ?? displayPlayerId;
                const result = actions.ckDiscardProgress(cardId, discardPlayerId);
                forceSync();
                if (!result.ok && result.reason) reportActionError(result.reason);
              }}
              onPlayProgress={(cardId, params) => {
                const result = actions.ckPlayProgress(cardId, params);
                forceSync();
                if (!result.ok && result.reason) reportActionError(result.reason);
              }}
              onRecruitKnight={(intersectionId) => {
                const result = actions.ckRecruitKnight(intersectionId);
                forceSync();
                if (result.ok) audio.playSfx('ck_knight');
                if (!result.ok && result.reason) reportActionError(result.reason);
              }}
              onStartRecruitPlacement={() => startClassicBuildMode('ck_knight')}
              recruitPlacementActive={classicBuildMode === 'ck_knight'}
              onActivateKnight={(knightId) => {
                const result = actions.ckActivateKnight(knightId);
                forceSync();
                if (result.ok) audio.playSfx('ck_knight');
                if (!result.ok && result.reason) reportActionError(result.reason);
              }}
              onPromoteKnight={(knightId) => {
                const result = actions.ckPromoteKnight(knightId);
                forceSync();
                if (result.ok) audio.playSfx('ck_knight');
                if (!result.ok && result.reason) reportActionError(result.reason);
              }}
              onMoveKnight={(knightId, toIntersectionId) => {
                const result = actions.ckMoveKnight(knightId, toIntersectionId);
                forceSync();
                if (result.ok) audio.playSfx('ck_knight');
                if (!result.ok && result.reason) reportActionError(result.reason);
              }}
              onDisplaceKnight={(knightId, targetKnightId) => {
                const result = actions.ckDisplaceKnight(knightId, targetKnightId);
                forceSync();
                if (result.ok) audio.playSfx('ck_knight');
                if (!result.ok && result.reason) reportActionError(result.reason);
              }}
              onChaseRobber={(knightId, tileId) => {
                const result = actions.ckChaseRobber(knightId, tileId);
                forceSync();
                if (result.ok) audio.playSfx('robber');
                if (!result.ok && result.reason) reportActionError(result.reason);
              }}
              onResolveKnightRetreat={(knightId, toIntersectionId) => {
                const retreatPlayerId =
                  gameState.extensions?.citiesKnights?.pendingResolutions.find(
                    (r) => r.kind === 'knight_retreat' && localHumanPlayerIds.includes(r.playerId),
                  )?.playerId ?? displayPlayerId;
                const result = actions.ckResolveKnightRetreat(
                  knightId,
                  toIntersectionId,
                  retreatPlayerId,
                );
                forceSync();
                if (result.ok) audio.playSfx('ck_knight');
                if (!result.ok && result.reason) reportActionError(result.reason);
              }}
            />
          )}

          {displayPlayerId && isUndergroundSkyEnabled(gameState) && (
            <UndergroundSkyPanel
              gameState={gameState}
              playerId={
                gameState.extensions?.undergroundSky?.pendingResolutions.find(
                  (r) =>
                    (r.kind === 'thermal_output' ||
                      r.kind === 'discovery_reward' ||
                      r.kind === 'sky_material_choice') &&
                    localHumanPlayerIds.includes(r.playerId),
                )?.playerId ?? displayPlayerId
              }
              open={openExtensionDock === 'undergroundSky'}
              onOpenChange={(open) => setOpenExtensionDock(open ? 'undergroundSky' : null)}
              canAct={canControlActivePlayer && gameState.turnPhase === 'player_action'}
              activeLayer={boardLayer}
              onLayerChange={setBoardLayer}
              onSurveyCavern={(nodeId) => {
                const result = actions.usSurveyCavern(nodeId);
                forceSync();
                if (!result.ok && result.reason) reportActionError(result.reason);
              }}
              onBuildShaft={(intersectionId, entryNodeId) => {
                const result = actions.usBuildShaft(intersectionId, entryNodeId);
                forceSync();
                if (!result.ok && result.reason) reportActionError(result.reason);
              }}
              onBuildTunnel={(edgeId) => {
                const result = actions.usBuildTunnel(edgeId);
                forceSync();
                if (!result.ok && result.reason) reportActionError(result.reason);
              }}
              onBuildOutpost={(nodeId) => {
                const result = actions.usBuildOutpost(nodeId);
                forceSync();
                if (!result.ok && result.reason) reportActionError(result.reason);
              }}
              onUpgradeExtractor={(outpostId) => {
                const result = actions.usUpgradeExtractor(outpostId);
                forceSync();
                if (!result.ok && result.reason) reportActionError(result.reason);
              }}
              onBuildLift={(nodeId) => {
                const result = actions.usBuildLift(nodeId);
                forceSync();
                if (!result.ok && result.reason) reportActionError(result.reason);
              }}
              onBuildAirport={(intersectionId) => {
                const result = actions.usBuildAirport(intersectionId);
                forceSync();
                if (!result.ok && result.reason) reportActionError(result.reason);
              }}
              onBuildAirship={(airportId) => {
                const result = actions.usBuildAirship(airportId);
                forceSync();
                if (!result.ok && result.reason) reportActionError(result.reason);
              }}
              onUpgradeAirship={(airshipId, upgrade) => {
                const result = actions.usUpgradeAirship(airshipId, upgrade);
                forceSync();
                if (!result.ok && result.reason) reportActionError(result.reason);
              }}
              onBuildBeacon={(hubId) => {
                const result = actions.usBuildBeacon(hubId);
                forceSync();
                if (!result.ok && result.reason) reportActionError(result.reason);
              }}
              onDispatchAirship={(airshipId, destinationHubId, cargo) => {
                const result = actions.usDispatchAirship(airshipId, destinationHubId, cargo);
                forceSync();
                if (!result.ok && result.reason) reportActionError(result.reason);
              }}
              onChooseThermalOutput={(outpostId, resource) => {
                const result = actions.usChooseThermalOutput(outpostId, resource);
                forceSync();
                if (!result.ok && result.reason) reportActionError(result.reason);
              }}
              onChooseDiscoveryReward={(nodeId, choice) => {
                const result = actions.usChooseDiscoveryReward(nodeId, choice);
                forceSync();
                if (!result.ok && result.reason) reportActionError(result.reason);
              }}
              onUnloadAirship={(airshipId) => {
                const result = actions.usUnloadAirship(airshipId);
                forceSync();
                if (!result.ok && result.reason) reportActionError(result.reason);
              }}
              onCompleteContract={(contractId, options) => {
                const result = actions.usCompleteContract(contractId, options);
                forceSync();
                if (!result.ok && result.reason) reportActionError(result.reason);
              }}
            />
          )}

          {displayPlayerId && isPactsEmbassiesEnabled(gameState) && (
            <PactsEmbassiesPanel
              gameState={gameState}
              playerId={displayPlayerId}
              open={openExtensionDock === 'pactsEmbassies'}
              onOpenChange={(open) => setOpenExtensionDock(open ? 'pactsEmbassies' : null)}
              canAct={canControlActivePlayer && gameState.turnPhase === 'player_action'}
              onBuildEmbassy={(intersectionId) => {
                const result = actions.peBuildEmbassy(intersectionId);
                forceSync();
                if (!result.ok && result.reason) reportActionError(result.reason);
              }}
              onProposePact={(toPlayerId, clauses) => {
                const result = actions.peProposePact(toPlayerId, clauses);
                forceSync();
                if (!result.ok && result.reason) reportActionError(result.reason);
              }}
              onCounterPact={(offerId, clauses) => {
                const result = actions.peCounterPact(offerId, clauses);
                forceSync();
                if (!result.ok && result.reason) reportActionError(result.reason);
              }}
              onAcceptPact={(offerId) => {
                const result = actions.peAcceptPact(offerId);
                forceSync();
                if (!result.ok && result.reason) reportActionError(result.reason);
              }}
              onRejectPact={(offerId) => {
                const result = actions.peRejectPact(offerId);
                forceSync();
                if (!result.ok && result.reason) reportActionError(result.reason);
              }}
              onBreakPact={(pactId) => {
                const result = actions.peBreakPact(pactId);
                forceSync();
                if (!result.ok && result.reason) reportActionError(result.reason);
              }}
              onProposeMutualDissolution={(pactId) => {
                const result = actions.peProposeMutualDissolution(pactId);
                forceSync();
                if (!result.ok && result.reason) reportActionError(result.reason);
              }}
              onAcceptMutualDissolution={(pactId) => {
                const result = actions.peAcceptMutualDissolution(pactId);
                forceSync();
                if (!result.ok && result.reason) reportActionError(result.reason);
              }}
              onSponsorResolution={(proposalId) => {
                const result = actions.peSponsorResolution(proposalId);
                forceSync();
                if (!result.ok && result.reason) reportActionError(result.reason);
              }}
              onCastCouncilVote={(proposalId, variantId, extraVotes) => {
                const result = actions.peCastCouncilVote(proposalId, variantId, extraVotes);
                forceSync();
                if (!result.ok && result.reason) reportActionError(result.reason);
              }}
              onLobbyNeutralDelegation={(delegationId, amount) => {
                const result = actions.peLobbyNeutralDelegation(delegationId, amount);
                forceSync();
                if (!result.ok && result.reason) reportActionError(result.reason);
              }}
              onContributeToCrisis={(classic, commodities, materials) => {
                const result = actions.peContributeToCrisis(classic, commodities, materials);
                forceSync();
                if (!result.ok && result.reason) reportActionError(result.reason);
              }}
              onClaimMandate={(mandateId) => {
                const result = actions.peClaimMandate(mandateId);
                forceSync();
                if (!result.ok && result.reason) reportActionError(result.reason);
              }}
            />
          )}

          {!isSetupPhaseActive && (
            <div className="hud-right-stack" data-hud-zone="right">
              <ResourceBar
                resources={
                  gameState.players.get(displayPlayerId ?? currentPlayer.id)?.resources ??
                  currentPlayer.resources
                }
                commodities={
                  isCitiesKnightsEnabled(gameState)
                    ? (gameState.extensions?.citiesKnights?.playerCommodities[
                        displayPlayerId ?? currentPlayer.id
                      ] ?? {})
                    : undefined
                }
                materials={
                  isUndergroundSkyEnabled(gameState)
                    ? (gameState.extensions?.undergroundSky?.playerMaterials[
                        displayPlayerId ?? currentPlayer.id
                      ] ?? {})
                    : undefined
                }
              />
              {displayPlayerId && (
                <PlayableCardHand
                  state={gameState}
                  playerId={displayPlayerId}
                  canAct={canControlActivePlayer && gameState.turnPhase === 'player_action'}
                  canPlayAlchemist={
                    canControlActivePlayer && gameState.turnPhase === 'start_of_turn'
                  }
                  selectedTileId={selectedTileId}
                  onTileTargetingChange={handleProgressTileTargeting}
                  onOpenChange={setCardHandOpen}
                  canRollDice={
                    canControlActivePlayer &&
                    !diceRolledThisTurn &&
                    gameState.turnPhase === 'start_of_turn'
                  }
                  onRollDice={() => {
                    if (!canControlActivePlayer) return;
                    setSidePanelTab('tile');
                    audio.playSfx('dice');
                    actions.rollDice();
                    forceSync();
                  }}
                  onPlayDevelopment={(card, params) => {
                    const result =
                      card.type === 'knight'
                        ? actions.playDevCard(
                            card.id,
                            params.targetPlayerId || null,
                            params.tileId ?? null,
                          )
                        : card.type === 'year_of_plenty' && params.resources
                          ? actions.playDevCard(
                              card.id,
                              null,
                              `${params.resources[0]}:${params.resources[1]}`,
                            )
                          : card.type === 'monopoly'
                            ? actions.playDevCard(card.id, null, params.resource ?? null)
                            : actions.playDevCard(card.id);
                    forceSync();
                    if (result.ok) {
                      if (card.type === 'knight') audio.playSfx('robber');
                      else if (card.type === 'road_building') {
                        audio.playSfx('build');
                        setClassicBuildMode('road');
                        setSidePanelTab('tile');
                      } else if (card.type === 'year_of_plenty' || card.type === 'monopoly') {
                        audio.playSfx('collect');
                      }
                    } else if (result.reason) {
                      reportActionError(result.reason);
                    }
                    return result;
                  }}
                  onPlayProgress={(card, params) => {
                    const result = actions.ckPlayProgress(card.id, params);
                    forceSync();
                    if (result.ok) {
                      if (card.type === 'road_building') {
                        setClassicBuildMode('road');
                        setSidePanelTab('tile');
                      }
                    } else if (result.reason) {
                      reportActionError(result.reason);
                    }
                    return result;
                  }}
                />
              )}
            </div>
          )}

          <EventNotification
            events={gameState.activeEvents}
            onOpenEvent={() => openModal('event')}
          />

          {isInitialPlacementActive && initialPlacement && (
            <InitialPlacementPanel
              placement={initialPlacement}
              currentPlayerName={(() => {
                const setupId = gameState.setupPlayerOrder[gameState.setupPlacementIndex] ?? null;
                return setupId
                  ? (gameState.players.get(setupId)?.name ?? currentPlayer.name)
                  : currentPlayer.name;
              })()}
              onConfirm={() => {
                const result = actions.confirmInitialPlacement();
                if (!result.ok) forceSync();
                else {
                  audio.playSfx('build');
                  if (effectiveShowAnimations) animations.playBoardImpact('build', 0.2);
                }
              }}
              onCancel={() => actions.cancelInitialPlacementPreview()}
            />
          )}

          {isHexSetupActive && (
            <div
              className="ui-panel"
              style={{
                position: 'absolute',
                left: '50%',
                top: 86,
                transform: 'translateX(-50%)',
                padding: '10px 14px',
                pointerEvents: 'auto',
                zIndex: 30,
                maxWidth: 'min(520px, calc(100vw - 24px))',
              }}
            >
              <strong>Placement initial</strong>
              <div style={{ marginTop: 6, fontSize: 13 }}>
                {hexSetupPlayerName
                  ? `${hexSetupPlayerName} : cliquez une tuile libre pour placer un village (${hexSetupProgress}).`
                  : 'Cliquez une tuile libre pour placer un village.'}
              </div>
              <div style={{ marginTop: 4, fontSize: 11, opacity: 0.75 }}>
                Tuiles valides surlignées — ordre serpent, 2 villages chacun. Le 2ᵉ donne les
                ressources de la tuile et de ses voisins.
              </div>
            </div>
          )}

          {guidedTurnUI &&
            !cardHandOpen &&
            !isSetupPhaseActive &&
            !isReadOnlySession &&
            canControlActivePlayer && (
            <TurnActionPlanner
              currentTurn={gameState.currentTurn}
              phase={gameState.turnPhase}
              hasRolledDiceThisTurn={diceRolledThisTurn}
              pendingChoice={Boolean(pendingChoice)}
              selectedTileId={selectedTileId}
              sidePanelTab={sidePanelTab}
              actionCountThisTurn={actionCountThisTurn}
              advancedVisible={showAdvancedPanels}
              classicMode={usesTopoPlacement}
              classicBuildMode={classicBuildMode}
              onRollDice={() => {
                if (!canControlActivePlayer) return;
                setSidePanelTab('tile');
                audio.playSfx('dice');
                actions.rollDice();
                forceSync();
              }}
              onOpenEvent={() => openModal('event')}
              onOpenTab={openActionTab}
              onOpenTech={() => openModal('tech-tree')}
              onOpenDiplomacy={() => openModal('diplomacy')}
              onEndTurn={handleEndTurn}
              onToggleAdvanced={setShowAdvancedPanels}
              onSave={
                isMultiplayerSession
                  ? multiplayerIsHost
                    ? () => {
                        saveMultiplayerRoom();
                      }
                    : undefined
                  : () => {
                      setSaveModalOpen(true);
                    }
              }
            />
          )}

          {saveModalOpen && !isMultiplayerSession && (
            <SaveSlotModal
              currentTurn={gameState.currentTurn}
              occupiedSlots={Object.fromEntries(
                saves
                  .filter((entry) => entry.slot !== 'auto')
                  .map((entry) => [String(entry.slot), entry.name]),
              )}
              onClose={() => setSaveModalOpen(false)}
              onSave={(slot, name) => {
                const result = saveToSlot(slot, name);
                if (!result.ok) {
                  reportActionError(result.reason ?? 'Sauvegarde impossible');
                  return false;
                }
                showHudNotice(`Sauvegardé — ${name || `slot ${slot}`}`);
                return true;
              }}
            />
          )}

          {classicBuildMode && !isSetupPhaseActive && (
            <div
              className="ui-panel"
              style={{
                position: 'absolute',
                left: '50%',
                top: 86,
                transform: 'translateX(-50%)',
                padding: '8px 12px',
                pointerEvents: 'auto',
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                maxWidth: 'min(560px, calc(100vw - 24px))',
              }}
            >
              <strong>Construction :</strong>
              <span>
                {classicBuildCandidates.reason
                  ? classicBuildCandidates.reason
                  : classicBuildMode === 'settlement'
                    ? 'Cliquez une intersection pour un village'
                    : classicBuildMode === 'road'
                      ? 'Cliquez une arête pour une route'
                      : classicBuildMode === 'ck_knight'
                        ? 'Cliquez une intersection libre de votre réseau pour recruter un chevalier'
                        : 'Cliquez un village à améliorer en ville'}
              </span>
              <button type="button" onClick={clearClassicBuildMode}>
                Annuler
              </button>
            </div>
          )}

          {activeUnitId && unitCommandMode && (
            <div
              className="ui-panel"
              style={{
                position: 'absolute',
                left: '50%',
                top: 86,
                transform: 'translateX(-50%)',
                padding: '8px 12px',
                pointerEvents: 'auto',
                display: 'flex',
                alignItems: 'center',
                gap: 8,
              }}
            >
              <strong>Ordre actif :</strong>
              <span>{unitCommandMode === 'move' ? 'Déplacement' : 'Attaque'}</span>
              <button onClick={clearUnitCommand}>Annuler</button>
            </div>
          )}

          {!isSetupPhaseActive && (
            <ActionFeed entries={gameState.actionLog} playerNames={playerNameById} />
          )}

          {!isSetupPhaseActive &&
            currentPlayer &&
            activePlayer &&
            activePlayer.id !== currentPlayer.id &&
            !privacyScreenPlayerId && (
              <OpponentPrepShelf
                activePlayerName={activePlayer.name}
                resources={currentPlayer.resources}
                citiesKnights={isCitiesKnightsEnabled(gameState)}
              />
            )}

          {showComplexHUD && (
            <div
              style={{
                position: 'absolute',
                left: 12,
                top: 126,
                display: 'grid',
                gap: 8,
                width: 260,
                pointerEvents: 'auto',
              }}
            >
              {gameState.config.enableTechTree && (
                <TechPanel
                  currentResearch={currentPlayer.currentResearch}
                  progress={currentPlayer.researchProgress}
                  queue={currentPlayer.researchQueue}
                  availableCount={activeTechCount}
                  onOpen={() => openModal('tech-tree')}
                />
              )}
              {gameState.config.enableDiplomacy && (
                <DiplomacyPanel
                  relationCount={diplomacyStats.relationCount}
                  allies={diplomacyStats.allies}
                  wars={diplomacyStats.wars}
                  onOpen={() => openModal('diplomacy')}
                />
              )}
              {gameState.config.enableMilitary && (
                <MilitaryPanel
                  totalUnits={currentPlayer.units.length}
                  militaryStrength={currentPlayer.stats.militaryStrength}
                  damagedUnits={damagedUnits}
                />
              )}
              {gameState.config.worldCouncil &&
                gameState.worldCouncil.active &&
                gameState.worldCouncil.currentResolution && (
                  <CouncilPanel
                    title={gameState.worldCouncil.currentResolution.title}
                    options={gameState.worldCouncil.currentResolution.options}
                    myVote={
                      activePlayerId ? (gameState.worldCouncil.votes[activePlayerId] ?? null) : null
                    }
                    onVote={(optionId) => {
                      actions.castCouncilVote(optionId);
                      forceSync();
                    }}
                  />
                )}
            </div>
          )}

          {showComplexHUD && (
            <TileInfoPanel
              gameState={gameState}
              tile={selectedTile}
              owner={selectedOwner}
              onClose={() => setSelectedTileId(null)}
            />
          )}

          {isMultiplayerSession && (
            <div
              style={{
                position: 'absolute',
                left: 12,
                bottom: showComplexHUD ? 206 : 108,
                width: 320,
                pointerEvents: 'auto',
              }}
            >
              <MultiplayerChat
                connected={multiplayerConnected}
                roomId={multiplayerRoomId}
                playerName={multiplayerPlayerName}
                messages={multiplayerChatMessages}
                onSend={sendMultiplayerChat}
                compact
              />
            </div>
          )}

          {(showComplexHUD || sidePanelTab !== 'tile') && (
            <div className="context-dock">
              {showComplexHUD && !guidedTurnUI && !isReadOnlySession && canControlActivePlayer && (
                <div
                  className="ui-panel"
                  style={{ padding: 8, display: 'flex', gap: 6, flexWrap: 'wrap' }}
                >
                  {usesTopoPlacement ? (
                    <>
                      <button
                        type="button"
                        className={
                          classicBuildMode === 'settlement' ? 'command-button primary' : undefined
                        }
                        onClick={() => startClassicBuildMode('settlement')}
                      >
                        Village
                      </button>
                      <button
                        type="button"
                        className={
                          classicBuildMode === 'road' ? 'command-button primary' : undefined
                        }
                        onClick={() => startClassicBuildMode('road')}
                      >
                        Route
                      </button>
                      <button
                        type="button"
                        className={
                          classicBuildMode === 'city' ? 'command-button primary' : undefined
                        }
                        onClick={() => startClassicBuildMode('city')}
                      >
                        Ville
                      </button>
                      <button type="button" onClick={() => openActionTab('trade')}>
                        Commerce
                      </button>
                      {!isClassicMode && (
                        <>
                          <button
                            type="button"
                            onClick={() => {
                              clearClassicBuildMode();
                              setSidePanelTab('build');
                            }}
                          >
                            Autres
                          </button>
                          <button type="button" onClick={() => openActionTab('units')}>
                            Unités
                          </button>
                          <button type="button" onClick={() => openActionTab('city')}>
                            Villes
                          </button>
                        </>
                      )}
                    </>
                  ) : (
                    <>
                      <button type="button" onClick={() => openActionTab('build')}>
                        Construction
                      </button>
                      <button type="button" onClick={() => openActionTab('trade')}>
                        Commerce
                      </button>
                      <button type="button" onClick={() => openActionTab('units')}>
                        Unités
                      </button>
                      <button type="button" onClick={() => openActionTab('city')}>
                        Villes
                      </button>
                    </>
                  )}
                </div>
              )}

              {sidePanelTab === 'build' && (
                <BuildMenu
                  gameState={gameState}
                  currentPlayerId={currentPlayerId}
                  selectedTileId={selectedTileId}
                  classicMode={isClassicMode || usesTopoPlacement}
                  citiesKnights={isCitiesKnightsEnabled(gameState)}
                  onClassicBuildMode={startClassicBuildMode}
                  onBuild={(tileId, buildingId) => {
                    const result = actions.build(tileId, buildingId);
                    forceSync();
                    if (result.ok) {
                      audio.playSfx('build');
                      if (effectiveShowAnimations) animations.playBoardImpact('build', 0.2);
                      setSelectedTileId(tileId);
                    }
                  }}
                  onClose={() => setSidePanelTab('tile')}
                />
              )}
              {sidePanelTab === 'trade' && !limitedBankEconomy && (
                <TradeMenu
                  prices={gameState.market.prices}
                  resources={currentPlayer.resources}
                  demand={gameState.market.demand}
                  supply={gameState.market.supply}
                  onBuy={(resource, quantity) => {
                    actions.buyResource(resource, quantity);
                    forceSync();
                  }}
                  onSell={(resource, quantity) => {
                    actions.sellResource(resource, quantity);
                    forceSync();
                  }}
                  onClose={() => setSidePanelTab('tile')}
                />
              )}
              {sidePanelTab === 'units' && (
                <UnitActions
                  gameState={gameState}
                  currentPlayerId={currentPlayerId}
                  tile={selectedTile}
                  activeUnitId={activeUnitId}
                  unitCommandMode={unitCommandMode}
                  onSelectUnit={(unitId) => {
                    setActiveUnitId(unitId);
                    if (!unitId) {
                      setUnitCommandMode(null);
                    }
                  }}
                  onSetCommandMode={setUnitCommandMode}
                  onMove={(unitId, targetTileId) => {
                    const result = actions.moveUnit(unitId, targetTileId);
                    forceSync();
                    if (result.ok) {
                      audio.playSfx('next_turn');
                      setSelectedTileId(targetTileId);
                      setUnitCommandMode(null);
                    }
                  }}
                  onAttack={(attackerId, defenderId) => {
                    const result = actions.attackUnit(attackerId, defenderId);
                    forceSync();
                    if (result.ok) {
                      audio.playSfx('combat');
                      animations.playCombat(attackerId, defenderId);
                      setUnitCommandMode(null);
                    }
                  }}
                  onFortify={(unitId) => {
                    actions.fortifyUnit(unitId);
                    forceSync();
                  }}
                  onRecruit={(tileId, unitType) => {
                    const result = actions.recruit(tileId, unitType);
                    forceSync();
                    if (result.ok) {
                      audio.playSfx('build');
                      setSelectedTileId(tileId);
                    }
                  }}
                  onClose={() => {
                    setSidePanelTab('tile');
                    clearUnitCommand();
                  }}
                />
              )}
              {sidePanelTab === 'city' && (
                <CityDetails
                  gameState={gameState}
                  player={currentPlayer}
                  onClose={() => setSidePanelTab('tile')}
                />
              )}
              {sidePanelTab === 'city' && gameState.config.enableProductionChains && (
                <Suspense fallback={<LazyFallback label="Chargement de l’atelier…" />}>
                  <LazyCraftPanel
                    gameState={gameState}
                    playerId={currentPlayer.id}
                    onCraft={(buildingId, recipeId) => {
                      const result = actions.craftRecipe(buildingId, recipeId);
                      forceSync();
                      if (result.ok) audio.playSfx('build');
                    }}
                    onClose={() => setSidePanelTab('tile')}
                  />
                </Suspense>
              )}
            </div>
          )}

          {hudNotice && (
            <div
              className="ui-panel"
              style={{
                position: 'absolute',
                left: '50%',
                bottom: 18,
                transform: 'translateX(-50%)',
                padding: '8px 12px',
                zIndex: 50,
                pointerEvents: 'none',
                fontSize: 13,
                fontWeight: 600,
              }}
              role="status"
            >
              {hudNotice}
            </div>
          )}

          {lastActionError && (
            <div
              className="ui-panel"
              style={{
                position: 'absolute',
                right: 12,
                bottom: 12,
                padding: '8px 10px',
                maxWidth: 340,
                color: '#991b1b',
              }}
            >
              <div style={{ fontWeight: 700 }}>Action impossible</div>
              <div style={{ fontSize: 12, marginTop: 3 }}>{localizedActionError}</div>
              <button style={{ marginTop: 6 }} onClick={clearError}>
                Fermer
              </button>
            </div>
          )}
      </div>

      {pendingEvent && activeModal === 'event' && (
        <EventModal
          event={pendingEvent}
          error={localizedActionError}
          onChoice={(choiceId) => {
            actions.chooseEventOption(choiceId);
            forceSync();
          }}
          onDismiss={() => {
            actions.dismissEvent();
            closeModal();
          }}
        />
      )}

      {activeModal === 'diplomacy' && (
        <Suspense fallback={<LazyFallback label="Chargement de la diplomatie…" />}>
          <LazyDiplomacyModal
            players={[...gameState.players.values()]}
            currentPlayerId={currentPlayerId}
            currentTurn={gameState.currentTurn}
            actionLog={gameState.actionLog}
            onAction={(toPlayerId, actionType) => {
              const data = actionType === 'gift_resources' ? { coins: 3 } : undefined;
              actions.diplomacy(toPlayerId, actionType, data);
              forceSync();
            }}
            onClose={closeModal}
          />
        </Suspense>
      )}

      {activeModal === 'tech-tree' && (
        <Suspense fallback={<LazyFallback label="Chargement des technologies…" />}>
          <LazyTechTreeModal
            player={currentPlayer}
            onResearch={(techId) => {
              actions.startResearch(techId);
              forceSync();
            }}
            onClose={closeModal}
          />
        </Suspense>
      )}

      {activeModal === 'settings' && <SettingsModal onClose={closeModal} />}

      {activeModal === 'help' && (
        <Suspense fallback={<LazyFallback label="Chargement du guide…" />}>
          <LazyHelpGuideModal onClose={closeModal} />
        </Suspense>
      )}

      {activeModal === 'victory' && gameState.winner && (
        <VictoryModal
          winnerName={
            gameState.players.get(gameState.winner)?.name ?? frGenericLabel(gameState.winner)
          }
          rankings={gameState.rankings}
          playerNames={playerNameById}
          season={gameState.season}
          onClose={closeModal}
        />
      )}
    </div>
  );
}

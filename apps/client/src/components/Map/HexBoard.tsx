import { useCallback, useEffect, useMemo, useRef } from 'react';
import { Container, Graphics } from 'pixi.js';
import { GameEvent } from '@catanx/engine';
import { GameState } from '@catanx/engine';
import { HexLayout, hexToId, hexToPixel } from '@catanx/engine';
import { CameraController } from '../../render/CameraController';
import { renderHexMap } from '../../render/HexRenderer';
import { PixiApp } from '../../render/PixiApp';
import { TerrainRenderer } from '../../render/TerrainRenderer';
import { renderUnits } from '../../render/UnitRenderer';
import { renderBuildings } from '../../render/BuildingRenderer';
import { renderRoutes } from '../../render/RouteRenderer';
import { renderFogOfWar } from './FogOfWar';
import { AnimationManager } from '../../render/AnimationManager';
import { ParticleSystem } from '../../render/ParticleSystem';
import { UIOverlay } from '../../render/UIOverlay';
import {
  buildCatanTopology,
  findNearestEdge,
  findNearestIntersection,
  intersectionTouchesLand,
  type CatanTopology,
} from '../../catan/CatanTopology';
import type { InitialPlacementState } from '../../store/gameStore';
import type { ClassicBuildMode } from '../../store/uiStore';
import type { CameraFocusRequest, CameraViewport } from './cameraTypes';
import type { BoardLayer } from './boardLayer';
import { climateParticleKind } from '../../render3d/utils/seasonVisuals';

export type { CameraViewport, CameraFocusRequest } from './cameraTypes';

export interface HexBoardProps {
  gameState: GameState;
  onTileClick: (tileId: string) => void;
  onTileHover: (tileId: string | null) => void;
  initialPlacement?: InitialPlacementState | null;
  onPlacementIntersectionClick?: (intersectionId: string) => void;
  onPlacementEdgeClick?: (edgeId: string) => void;
  classicBuildMode?: ClassicBuildMode | null;
  classicBuildIntersectionIds?: string[];
  classicBuildEdgeIds?: string[];
  selectedTile: string | null;
  highlightedTiles: string[];
  currentPlayerId: string;
  showGrid?: boolean;
  showAnimations?: boolean;
  /** H4 — ambient animation speed multiplier (0.5–2). */
  animationSpeed?: number;
  cameraSensitivity?: number;
  focusRequest?: CameraFocusRequest | null;
  onCameraViewportChange?: (viewport: CameraViewport) => void;
  viewMode?: import('../../render3d/camera/viewMode').BoardViewMode;
  /** Niveau visuel actif de l'extension Souterrain & Ciel. Pixi conserve la surface. */
  boardLayer?: BoardLayer;
}

const PLAYER_COLORS: Record<string, number> = {
  red: 0xd62828,
  blue: 0x1d4ed8,
  green: 0x2a9d8f,
  orange: 0xf77f00,
  purple: 0x7b2cbf,
  white: 0xe5e5e5,
  brown: 0x7f5539,
  cyan: 0x00bcd4,
};

const BASE_LAYOUT: HexLayout = {
  size: 48,
  origin: { x: 0, y: 0 },
  flat: false,
};

interface MapLayers {
  tileLayer: Container;
  buildingLayer: Container;
  routeLayer: Container;
  unitLayer: Container;
  placementLayer: Container;
  fogLayer: Container;
  fxLayer: Container;
  particleLayer: Container;
  overlayLayer: Container;
}

interface UnitSnapshot {
  tileId: string;
  hp: number;
}

function clampHexSize(mapRadius: number): number {
  if (mapRadius <= 3) return 56;
  if (mapRadius <= 5) return 48;
  if (mapRadius <= 6) return 42;
  return 36;
}

function getMapBounds(
  gameState: GameState,
  layout: HexLayout,
): { minX: number; maxX: number; minY: number; maxY: number } {
  let minX = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;

  for (const [, tile] of gameState.map) {
    const center = hexToPixel(tile.coord, layout);
    minX = Math.min(minX, center.x - layout.size);
    maxX = Math.max(maxX, center.x + layout.size);
    minY = Math.min(minY, center.y - layout.size);
    maxY = Math.max(maxY, center.y + layout.size);
  }

  if (!Number.isFinite(minX)) {
    return { minX: -100, maxX: 100, minY: -100, maxY: 100 };
  }

  return { minX, maxX, minY, maxY };
}

function particleForEvent(event: GameEvent): 'fire' | 'snow' | 'rain' | 'mist' | 'gold' | null {
  if (event.type === 'forest_fire' || event.type === 'volcano_eruption') return 'fire';
  if (event.type === 'harsh_winter' || event.type === 'blizzard') return 'snow';
  if (event.type === 'heavy_rains' || event.type === 'flood') return 'rain';
  if (event.type === 'plague_minor' || event.type === 'plague_major') return 'mist';
  if (event.type === 'gold_rush') return 'gold';
  return null;
}

function eventToCanvasPoint(
  event: MouseEvent | PointerEvent,
  canvas: HTMLCanvasElement,
): { x: number; y: number } {
  const rect = canvas.getBoundingClientRect();
  const scaleX = rect.width > 0 ? canvas.width / rect.width : 1;
  const scaleY = rect.height > 0 ? canvas.height / rect.height : 1;
  return {
    x: (event.clientX - rect.left) * scaleX,
    y: (event.clientY - rect.top) * scaleY,
  };
}

function isSetupPlacementActive(
  state: GameState,
  setup: InitialPlacementState | null | undefined,
): setup is InitialPlacementState {
  return state.phase === 'setup' && Boolean(setup?.active);
}

function isClassicBuildActive(
  state: GameState,
  mode: ClassicBuildMode | null | undefined,
): mode is ClassicBuildMode {
  return state.phase === 'playing' && Boolean(mode);
}

function drawClassicBuildOverlay(
  layer: Container,
  topology: CatanTopology | null,
  mode: ClassicBuildMode,
  intersectionIds: string[],
  edgeIds: string[],
  tileSize: number,
): void {
  if (!topology) return;
  const settlementRadius = Math.max(7, tileSize * 0.16);
  const roadWidth = Math.max(4, tileSize * 0.12);
  const color = mode === 'city' ? 0xf59e0b : mode === 'ck_knight' ? 0x48d9cf : 0x34d399;

  if (mode === 'road') {
    for (const edgeId of edgeIds) {
      const edge = topology.edges[edgeId];
      if (!edge) continue;
      const a = topology.intersections[edge.a];
      const b = topology.intersections[edge.b];
      if (!a || !b) continue;
      const g = new Graphics()
        .moveTo(a.x, a.y)
        .lineTo(b.x, b.y)
        .stroke({ width: roadWidth, color, alpha: 0.85 });
      layer.addChild(g);
    }
    return;
  }

  for (const intersectionId of intersectionIds) {
    const intersection = topology.intersections[intersectionId];
    if (!intersection) continue;
    const g = new Graphics()
      .circle(intersection.x, intersection.y, settlementRadius)
      .fill({ color, alpha: 0.72 });
    layer.addChild(g);
  }
}

function drawInitialPlacementOverlay(
  layer: Container,
  state: GameState,
  setup: InitialPlacementState | null,
  topology: CatanTopology | null,
  playerColors: Record<string, number>,
  tileSize: number,
): void {
  layer.removeChildren();
  if (!setup || !setup.active || !topology) return;

  const nodeRadius = Math.max(6, tileSize * 0.12);
  const settlementRadius = Math.max(7, tileSize * 0.16);
  const roadWidth = Math.max(4, tileSize * 0.12);

  const validSettlementIds = new Set<string>();
  if (setup.step === 'settlement') {
    for (const [intersectionId, intersection] of Object.entries(topology.intersections)) {
      if (!intersectionTouchesLand(topology, state.map, intersectionId)) continue;
      if (setup.occupiedIntersections[intersectionId]) continue;
      const blockedByNeighbor = intersection.neighborIds.some((neighborId) =>
        Boolean(setup.occupiedIntersections[neighborId]),
      );
      if (!blockedByNeighbor) {
        validSettlementIds.add(intersectionId);
      }
    }
  }

  const candidateRoadEdges = new Set<string>();
  if (setup.step === 'road' && setup.anchorIntersectionId) {
    for (const [edgeId, edge] of Object.entries(topology.edges)) {
      if (setup.roadsByEdge[edgeId]) continue;
      if (edge.a === setup.anchorIntersectionId || edge.b === setup.anchorIntersectionId) {
        candidateRoadEdges.add(edgeId);
      }
    }
  }

  for (const [edgeId, ownerId] of Object.entries(setup.roadsByEdge)) {
    const edge = topology.edges[edgeId];
    if (!edge) continue;
    const a = topology.intersections[edge.a];
    const b = topology.intersections[edge.b];
    if (!a || !b) continue;

    const road = new Graphics();
    road
      .moveTo(a.x, a.y)
      .lineTo(b.x, b.y)
      .stroke({
        color: playerColors[ownerId] ?? 0xe2e8f0,
        width: roadWidth,
        alpha: 0.9,
      });
    layer.addChild(road);
  }

  if (setup.step === 'road' && setup.anchorIntersectionId) {
    for (const edgeId of candidateRoadEdges) {
      const edge = topology.edges[edgeId];
      if (!edge) continue;
      const a = topology.intersections[edge.a];
      const b = topology.intersections[edge.b];
      if (!a || !b) continue;

      const isPending = setup.pendingEdgeId === edgeId;
      const roadHint = new Graphics();
      roadHint
        .moveTo(a.x, a.y)
        .lineTo(b.x, b.y)
        .stroke({
          color: isPending ? 0xfacc15 : 0x6ee7b7,
          width: isPending ? Math.max(4, roadWidth * 0.85) : Math.max(3, roadWidth * 0.68),
          alpha: isPending ? 0.95 : 0.82,
        });
      layer.addChild(roadHint);
    }
  }

  for (const [intersectionId, intersection] of Object.entries(topology.intersections)) {
    if (!intersectionTouchesLand(topology, state.map, intersectionId)) continue;

    const occupiedBy = setup.occupiedIntersections[intersectionId];
    const marker = new Graphics();

    if (occupiedBy) {
      marker
        .circle(intersection.x, intersection.y, settlementRadius)
        .fill({ color: playerColors[occupiedBy] ?? 0xffffff, alpha: 0.94 });
      marker
        .circle(intersection.x, intersection.y, settlementRadius)
        .stroke({ color: 0x111827, width: 2, alpha: 0.8 });
      layer.addChild(marker);
      continue;
    }

    if (setup.step === 'settlement') {
      const isValid = validSettlementIds.has(intersectionId);
      const isPending = setup.pendingIntersectionId === intersectionId;
      marker
        .circle(intersection.x, intersection.y, isPending ? settlementRadius : nodeRadius)
        .fill({
          color: isPending ? 0xfacc15 : isValid ? 0x86efac : 0xef4444,
          alpha: isPending ? 0.95 : isValid ? 0.76 : 0.34,
        });
      marker
        .circle(intersection.x, intersection.y, isPending ? settlementRadius : nodeRadius)
        .stroke({
          color: isPending ? 0x854d0e : isValid ? 0x14532d : 0x7f1d1d,
          width: isPending ? 2.5 : 1.5,
          alpha: 0.9,
        });
      layer.addChild(marker);
    }
  }

  if (setup.step === 'road' && setup.anchorIntersectionId) {
    const anchor = topology.intersections[setup.anchorIntersectionId];
    if (anchor) {
      const anchorRing = new Graphics();
      anchorRing
        .circle(anchor.x, anchor.y, settlementRadius + 4)
        .stroke({ color: 0xfacc15, width: 3, alpha: 0.9 });
      layer.addChild(anchorRing);
    }
  }
}

export function HexBoard({
  gameState,
  onTileClick,
  onTileHover,
  initialPlacement = null,
  onPlacementIntersectionClick,
  onPlacementEdgeClick,
  classicBuildMode = null,
  classicBuildIntersectionIds = [],
  classicBuildEdgeIds = [],
  selectedTile,
  highlightedTiles,
  currentPlayerId,
  showGrid = true,
  showAnimations = true,
  animationSpeed: _animationSpeed = 1,
  cameraSensitivity = 1,
  focusRequest = null,
  onCameraViewportChange,
}: HexBoardProps) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const pixiRef = useRef<PixiApp | null>(null);
  const terrainRendererRef = useRef<TerrainRenderer>(new TerrainRenderer());
  const cameraRef = useRef<CameraController | null>(null);
  const layersRef = useRef<MapLayers | null>(null);
  const layoutRef = useRef<HexLayout>({ ...BASE_LAYOUT });
  const hoveredTileRef = useRef<string | null>(null);
  const lastMapSignatureRef = useRef<string>('');

  const animationManagerRef = useRef<AnimationManager | null>(null);
  const particleSystemRef = useRef<ParticleSystem | null>(null);
  const overlayRef = useRef<UIOverlay | null>(null);

  const prevUnitsRef = useRef<Map<string, UnitSnapshot>>(new Map());
  const prevBuildingsRef = useRef<Set<string>>(new Set());
  const prevSeasonRef = useRef<string>('');
  const prevEventIdsRef = useRef<Set<string>>(new Set());
  const hasDiffBaselineRef = useRef(false);
  const prevGameIdRef = useRef<string | null>(null);

  const onTileClickRef = useRef(onTileClick);
  const onTileHoverRef = useRef(onTileHover);
  const onPlacementIntersectionClickRef = useRef(onPlacementIntersectionClick);
  const onPlacementEdgeClickRef = useRef(onPlacementEdgeClick);
  const gameStateRef = useRef(gameState);
  const initialPlacementRef = useRef<InitialPlacementState | null>(initialPlacement);
  const classicBuildModeRef = useRef(classicBuildMode);
  const classicBuildIntersectionIdsRef = useRef(classicBuildIntersectionIds);
  const classicBuildEdgeIdsRef = useRef(classicBuildEdgeIds);
  const selectedTileRef = useRef(selectedTile);
  const highlightedTilesRef = useRef(highlightedTiles);
  const currentPlayerIdRef = useRef(currentPlayerId);
  const showGridRef = useRef(showGrid);
  const showAnimationsRef = useRef(showAnimations);
  const cameraSensitivityRef = useRef(cameraSensitivity);
  const focusRequestRef = useRef(focusRequest);
  const onCameraViewportChangeRef = useRef(onCameraViewportChange);
  const detachCameraListenerRef = useRef<(() => void) | null>(null);
  const lastFocusNonceRef = useRef<number | null>(null);
  const lastViewportRef = useRef<CameraViewport | null>(null);

  const playerColorById = useMemo(() => {
    const colorById: Record<string, number> = {};
    for (const [playerId, player] of gameState.players) {
      colorById[playerId] = PLAYER_COLORS[player.color] ?? 0x2b2d42;
    }
    return colorById;
  }, [gameState.players]);
  const playerColorByIdRef = useRef(playerColorById);

  useEffect(() => {
    onTileClickRef.current = onTileClick;
    onTileHoverRef.current = onTileHover;
    onPlacementIntersectionClickRef.current = onPlacementIntersectionClick;
    onPlacementEdgeClickRef.current = onPlacementEdgeClick;
  }, [onPlacementEdgeClick, onPlacementIntersectionClick, onTileClick, onTileHover]);

  useEffect(() => {
    gameStateRef.current = gameState;
    initialPlacementRef.current = initialPlacement;
    classicBuildModeRef.current = classicBuildMode;
    classicBuildIntersectionIdsRef.current = classicBuildIntersectionIds;
    classicBuildEdgeIdsRef.current = classicBuildEdgeIds;
    selectedTileRef.current = selectedTile;
    highlightedTilesRef.current = highlightedTiles;
    currentPlayerIdRef.current = currentPlayerId;
    playerColorByIdRef.current = playerColorById;
    showGridRef.current = showGrid;
    showAnimationsRef.current = showAnimations;
    cameraSensitivityRef.current = cameraSensitivity;
    focusRequestRef.current = focusRequest;
    onCameraViewportChangeRef.current = onCameraViewportChange;
  }, [
    cameraSensitivity,
    classicBuildEdgeIds,
    classicBuildIntersectionIds,
    classicBuildMode,
    currentPlayerId,
    focusRequest,
    gameState,
    highlightedTiles,
    initialPlacement,
    onCameraViewportChange,
    playerColorById,
    selectedTile,
    showAnimations,
    showGrid,
  ]);

  const runStateDiffEffects = useCallback((state: GameState, layout: HexLayout) => {
    const anim = animationManagerRef.current;
    const particles = particleSystemRef.current;
    const overlay = overlayRef.current;
    if (!anim || !particles || !overlay) return;

    if (!hasDiffBaselineRef.current) {
      const baselineUnits = new Map<string, UnitSnapshot>();
      for (const [unitId, unit] of state.units) {
        baselineUnits.set(unitId, {
          tileId: hexToId(unit.position),
          hp: unit.stats.currentHealth,
        });
      }
      prevUnitsRef.current = baselineUnits;
      prevBuildingsRef.current = new Set(state.buildings.keys());
      prevEventIdsRef.current = new Set(state.activeEvents.map((event) => event.id));
      prevSeasonRef.current = state.season;
      hasDiffBaselineRef.current = true;
      overlay.setSeasonTint(state.season);
      return;
    }

    const nextUnits = new Map<string, UnitSnapshot>();
    for (const [unitId, unit] of state.units) {
      const tileId = hexToId(unit.position);
      nextUnits.set(unitId, {
        tileId,
        hp: unit.stats.currentHealth,
      });

      const prev = prevUnitsRef.current.get(unitId);
      if (!prev) continue;

      if (prev.tileId !== tileId) {
        const prevTile = state.map.get(prev.tileId);
        const nextTile = state.map.get(tileId);
        if (prevTile && nextTile) {
          const from = hexToPixel(prevTile.coord, layout);
          const to = hexToPixel(nextTile.coord, layout);
          const ownerColor = playerColorByIdRef.current[unit.ownerId] ?? 0xffffff;
          anim.runMoveTrail(from, to, ownerColor, true);
        }
      }

      if (unit.stats.currentHealth < prev.hp) {
        const tile = state.map.get(tileId);
        if (tile) {
          anim.runCombatImpact(hexToPixel(tile.coord, layout), true);
        }
      }
    }

    for (const [unitId, prev] of prevUnitsRef.current) {
      if (nextUnits.has(unitId)) continue;
      const tile = state.map.get(prev.tileId);
      if (!tile) continue;
      anim.runDeathBurst(hexToPixel(tile.coord, layout), true);
    }

    prevUnitsRef.current = nextUnits;

    const nextBuildings = new Set<string>();
    for (const [buildingId, building] of state.buildings) {
      nextBuildings.add(buildingId);
      if (prevBuildingsRef.current.has(buildingId)) continue;
      const tile = state.map.get(building.tileId);
      if (!tile) continue;
      anim.runConstructionPulse(hexToPixel(tile.coord, layout), 0x7bd389, true);
    }
    prevBuildingsRef.current = nextBuildings;

    if (prevSeasonRef.current !== state.season) {
      overlay.setSeasonTint(state.season);
      prevSeasonRef.current = state.season;

      const center = { x: 0, y: 0 };
      const kind = climateParticleKind(
        state.extensions?.seasons?.currentClimateId,
        state.season,
      );
      if (kind === 'snow') particles.emitSnow(center, 0.8);
      if (kind === 'fire') particles.emitFire(center, 0.4);
      if (kind === 'mist') particles.emitMist(center, 0.5);
      if (kind === 'rain') particles.emitRain(center, 0.6);
    }

    const currentEventIds = new Set(state.activeEvents.map((event) => event.id));
    for (const event of state.activeEvents) {
      if (prevEventIdsRef.current.has(event.id)) continue;

      const type = particleForEvent(event);
      if (!type) continue;

      const targetTileId = event.targetTiles?.[0];
      const targetTile = targetTileId ? state.map.get(targetTileId) : null;
      const center = targetTile ? hexToPixel(targetTile.coord, layout) : { x: 0, y: 0 };

      if (type === 'fire') particles.emitFire(center, 1.1);
      if (type === 'snow') particles.emitSnow(center, 1.1);
      if (type === 'rain') particles.emitRain(center, 1.1);
      if (type === 'mist') particles.emitMist(center, 1.1);
      if (type === 'gold') particles.emitGold(center, 1.2);
    }

    prevEventIdsRef.current = currentEventIds;

    if (state.winner) {
      const winner = state.players.get(state.winner);
      if (winner) overlay.showVictoryBanner(winner.name);
    }
  }, []);

  const draw = useCallback(() => {
    const pixi = pixiRef.current;
    const layers = layersRef.current;
    const state = gameStateRef.current;
    if (!pixi || !layers || !state) return;
    const setup = initialPlacementRef.current;
    const setupActive = isSetupPlacementActive(state, setup);
    const buildMode = classicBuildModeRef.current;
    const buildActive = isClassicBuildActive(state, buildMode);
    const overlayActive = setupActive || buildActive;

    const layout: HexLayout = {
      size: clampHexSize(state.mapRadius),
      origin: { x: 0, y: 0 },
      flat: false,
    };
    layoutRef.current = layout;

    if (prevGameIdRef.current !== state.id) {
      prevGameIdRef.current = state.id;
      hasDiffBaselineRef.current = false;
      prevUnitsRef.current = new Map();
      prevBuildingsRef.current = new Set();
      prevEventIdsRef.current = new Set();
      prevSeasonRef.current = '';
    }

    if (overlayActive && hoveredTileRef.current) {
      hoveredTileRef.current = null;
      onTileHoverRef.current(null);
    }

    renderHexMap(layers.tileLayer, state, terrainRendererRef.current, {
      selectedTile: overlayActive ? null : selectedTileRef.current,
      highlightedTiles: overlayActive ? new Set<string>() : new Set(highlightedTilesRef.current),
      hoveredTile: overlayActive ? null : hoveredTileRef.current,
      currentPlayerId: currentPlayerIdRef.current,
      layout,
      playerColors: playerColorByIdRef.current,
      showGrid: showGridRef.current,
    });

    renderBuildings(layers.buildingLayer, state, layout, playerColorByIdRef.current);
    renderRoutes(layers.routeLayer, state, layout, playerColorByIdRef.current);
    renderUnits(layers.unitLayer, state, layout, playerColorByIdRef.current);
    const topology = overlayActive ? buildCatanTopology(state.map, layout) : null;
    if (setupActive) {
      drawInitialPlacementOverlay(
        layers.placementLayer,
        state,
        setup ?? null,
        topology,
        playerColorByIdRef.current,
        layout.size,
      );
    } else if (buildActive && buildMode) {
      layers.placementLayer.removeChildren();
      drawClassicBuildOverlay(
        layers.placementLayer,
        topology,
        buildMode,
        classicBuildIntersectionIdsRef.current,
        classicBuildEdgeIdsRef.current,
        layout.size,
      );
    } else {
      layers.placementLayer.removeChildren();
    }

    if (state.config.fogOfWar && state.phase !== 'setup') {
      renderFogOfWar(layers.fogLayer, state, currentPlayerIdRef.current, layout);
    } else {
      layers.fogLayer.removeChildren();
    }

    if (!showAnimationsRef.current) {
      layers.fxLayer.removeChildren();
      layers.particleLayer.removeChildren();
    }

    overlayRef.current?.setSeasonTint(state.season);

    cameraRef.current?.setTileResolver({
      getLayout: () => layout,
      hasTile: (tileId) => state.map.has(tileId),
      tileToPixel: (tileId) => {
        const tile = state.map.get(tileId);
        if (!tile) return null;
        return hexToPixel(tile.coord, layout);
      },
    });
    cameraRef.current?.setPanSensitivity(cameraSensitivityRef.current);

    const mapSignature = `${state.mapRadius}:${state.map.size}`;
    if (mapSignature !== lastMapSignatureRef.current) {
      const bounds = getMapBounds(state, layout);
      cameraRef.current?.fitAll(bounds);
      lastMapSignatureRef.current = mapSignature;
    }

    if (showAnimationsRef.current) {
      runStateDiffEffects(state, layout);
    } else {
      const currentUnits = new Map<string, UnitSnapshot>();
      for (const [unitId, unit] of state.units) {
        currentUnits.set(unitId, {
          tileId: hexToId(unit.position),
          hp: unit.stats.currentHealth,
        });
      }
      prevUnitsRef.current = currentUnits;
      prevBuildingsRef.current = new Set(state.buildings.keys());
      prevEventIdsRef.current = new Set(state.activeEvents.map((event) => event.id));
      prevSeasonRef.current = state.season;
    }
  }, [runStateDiffEffects]);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    let isDisposed = false;
    const pixi = new PixiApp(host, { backgroundColor: 0x2f3e37 });
    pixiRef.current = pixi;

    let canvas: HTMLCanvasElement | null = null;
    let detachListeners: (() => void) | null = null;

    void pixi.ready
      .then(async () => {
        if (isDisposed) return;
        canvas = pixi.getCanvas();
        if (!canvas) return;

        const tileLayer = new Container();
        const buildingLayer = new Container();
        const routeLayer = new Container();
        const unitLayer = new Container();
        const placementLayer = new Container();
        const fogLayer = new Container();
        const fxLayer = new Container();
        const particleLayer = new Container();
        const overlayLayer = new Container();

        pixi.world.addChild(
          tileLayer,
          buildingLayer,
          routeLayer,
          unitLayer,
          placementLayer,
          fogLayer,
          fxLayer,
          particleLayer,
        );
        pixi.overlay.addChild(overlayLayer);
        layersRef.current = {
          tileLayer,
          buildingLayer,
          routeLayer,
          unitLayer,
          placementLayer,
          fogLayer,
          fxLayer,
          particleLayer,
          overlayLayer,
        };

        animationManagerRef.current = new AnimationManager(pixi.app, fxLayer);
        particleSystemRef.current = new ParticleSystem(pixi.app, particleLayer);
        overlayRef.current = new UIOverlay(pixi.app, overlayLayer);

        await terrainRendererRef.current.loadTerrainTextures();
        if (isDisposed) return;
        if (!canvas) return;

        const camera = new CameraController(pixi.world, canvas, {
          minZoom: 0.3,
          maxZoom: 2,
          zoomStep: 0.16,
        });
        cameraRef.current = camera;
        camera.setPanSensitivity(cameraSensitivityRef.current);

        detachCameraListenerRef.current = camera.onChange((snapshot) => {
          const nextViewport = {
            minX: snapshot.viewport.minX,
            maxX: snapshot.viewport.maxX,
            minY: snapshot.viewport.minY,
            maxY: snapshot.viewport.maxY,
            zoom: snapshot.zoom,
          };
          const prevViewport = lastViewportRef.current;
          const changed =
            !prevViewport ||
            Math.abs(prevViewport.minX - nextViewport.minX) > 0.5 ||
            Math.abs(prevViewport.maxX - nextViewport.maxX) > 0.5 ||
            Math.abs(prevViewport.minY - nextViewport.minY) > 0.5 ||
            Math.abs(prevViewport.maxY - nextViewport.maxY) > 0.5 ||
            Math.abs(prevViewport.zoom - nextViewport.zoom) > 0.001;
          if (!changed) return;
          lastViewportRef.current = nextViewport;
          onCameraViewportChangeRef.current?.(nextViewport);
        });

        const handlePointerMove = (event: PointerEvent) => {
          if (!canvas) return;
          const point = eventToCanvasPoint(event, canvas);
          const currentState = gameStateRef.current;
          const setup = initialPlacementRef.current;
          const buildMode = classicBuildModeRef.current;
          if (
            currentState &&
            (isSetupPlacementActive(currentState, setup) ||
              isClassicBuildActive(currentState, buildMode))
          ) {
            if (hoveredTileRef.current) {
              hoveredTileRef.current = null;
              onTileHoverRef.current(null);
              draw();
            }
            return;
          }

          const tileId = camera.screenToTile(point.x, point.y);
          if (tileId === hoveredTileRef.current) return;
          hoveredTileRef.current = tileId;
          onTileHoverRef.current(tileId);
          draw();
        };

        const handleClick = (event: MouseEvent) => {
          if (event.button !== 0) return;
          if (!canvas) return;
          const point = eventToCanvasPoint(event, canvas);

          const currentState = gameStateRef.current;
          const setup = initialPlacementRef.current;
          const buildMode = classicBuildModeRef.current;

          if (currentState && isSetupPlacementActive(currentState, setup)) {
            const world = camera.screenToWorld(point.x, point.y);
            const topology = buildCatanTopology(currentState.map, layoutRef.current);

            if (setup.step === 'settlement') {
              const intersectionId = findNearestIntersection(
                topology,
                world,
                Math.max(12, layoutRef.current.size * 0.34),
              );
              if (intersectionId) {
                onPlacementIntersectionClickRef.current?.(intersectionId);
              }
              return;
            }

            if (setup.step === 'road' && setup.anchorIntersectionId) {
              const edgeId = findNearestEdge(
                topology,
                world,
                Math.max(12, layoutRef.current.size * 0.28),
              );
              if (edgeId) {
                onPlacementEdgeClickRef.current?.(edgeId);
              }
              return;
            }
          }

          if (currentState && isClassicBuildActive(currentState, buildMode)) {
            const world = camera.screenToWorld(point.x, point.y);
            const topology = buildCatanTopology(currentState.map, layoutRef.current);
            if (buildMode === 'road') {
              const allowed = new Set(classicBuildEdgeIdsRef.current);
              const edgeId = findNearestEdge(
                topology,
                world,
                Math.max(12, layoutRef.current.size * 0.28),
              );
              if (edgeId && allowed.has(edgeId)) {
                onPlacementEdgeClickRef.current?.(edgeId);
              }
              return;
            }
            const allowed = new Set(classicBuildIntersectionIdsRef.current);
            const intersectionId = findNearestIntersection(
              topology,
              world,
              Math.max(12, layoutRef.current.size * 0.34),
            );
            if (intersectionId && allowed.has(intersectionId)) {
              onPlacementIntersectionClickRef.current?.(intersectionId);
            }
            return;
          }

          const tileId = camera.screenToTile(point.x, point.y);
          if (!tileId) return;
          onTileClickRef.current(tileId);
        };

        const handlePointerLeave = () => {
          if (!hoveredTileRef.current) return;
          hoveredTileRef.current = null;
          onTileHoverRef.current(null);
          draw();
        };

        canvas.addEventListener('pointermove', handlePointerMove);
        canvas.addEventListener('click', handleClick);
        canvas.addEventListener('pointerleave', handlePointerLeave);

        detachListeners = () => {
          canvas?.removeEventListener('pointermove', handlePointerMove);
          canvas?.removeEventListener('click', handleClick);
          canvas?.removeEventListener('pointerleave', handlePointerLeave);
        };

        draw();
      })
      .catch((error) => {
        if (isDisposed) return;
        console.error('Pixi board initialization failed', error);
      });

    return () => {
      isDisposed = true;
      detachListeners?.();
      animationManagerRef.current?.destroy();
      particleSystemRef.current?.destroy();
      overlayRef.current?.destroy();
      detachCameraListenerRef.current?.();
      detachCameraListenerRef.current = null;
      animationManagerRef.current = null;
      particleSystemRef.current = null;
      overlayRef.current = null;
      prevGameIdRef.current = null;
      hasDiffBaselineRef.current = false;
      cameraRef.current?.destroy();
      cameraRef.current = null;
      layersRef.current = null;
      pixi.destroy();
      if (pixiRef.current === pixi) {
        pixiRef.current = null;
      }
    };
  }, [draw]);

  useEffect(() => {
    draw();
  }, [
    classicBuildEdgeIds,
    classicBuildIntersectionIds,
    classicBuildMode,
    draw,
    gameState,
    selectedTile,
    highlightedTiles,
    currentPlayerId,
    playerColorById,
    showGrid,
    showAnimations,
  ]);

  useEffect(() => {
    const handleTilePulse = (event: Event) => {
      const custom = event as CustomEvent<{ tileId?: string }>;
      const tileId = custom.detail?.tileId;
      if (!tileId) return;
      const state = gameStateRef.current;
      const layout = layoutRef.current;
      const anim = animationManagerRef.current;
      if (!state || !layout || !anim) return;
      const tile = state.map.get(tileId);
      if (!tile) return;
      anim.runConstructionPulse(hexToPixel(tile.coord, layout), 0xf6d365, true);
    };

    const handleCombat = (event: Event) => {
      const custom = event as CustomEvent<{ attackerId?: string; defenderId?: string }>;
      const attackerId = custom.detail?.attackerId;
      const defenderId = custom.detail?.defenderId;
      if (!attackerId || !defenderId) return;

      const state = gameStateRef.current;
      const layout = layoutRef.current;
      const anim = animationManagerRef.current;
      if (!state || !layout || !anim) return;

      const attacker = state.units.get(attackerId);
      const defender = state.units.get(defenderId);
      if (attacker) {
        anim.runCombatImpact(hexToPixel(attacker.position, layout), true);
      }
      if (defender) {
        anim.runCombatImpact(hexToPixel(defender.position, layout), true);
      }
    };

    const handleSeasonTransition = (event: Event) => {
      const custom = event as CustomEvent<{ season?: string }>;
      const season = custom.detail?.season;
      if (!season) return;
      overlayRef.current?.setSeasonTint(season);
    };

    const handleResourceFloat = (event: Event) => {
      const custom = event as CustomEvent<{
        label?: string;
        from?: { x: number; y: number };
        to?: { x: number; y: number };
      }>;
      const label = custom.detail?.label;
      const from = custom.detail?.from;
      const to = custom.detail?.to;
      if (!label || !from || !to) return;

      const anim = animationManagerRef.current;
      const camera = cameraRef.current;
      if (!anim || !camera) return;

      const fromWorld = camera.screenToWorld(from.x, from.y);
      const toWorld = camera.screenToWorld(to.x, to.y);
      anim.runResourceFloat(label, fromWorld, toWorld, true);
    };

    window.addEventListener('catanx:tile-pulse', handleTilePulse as EventListener);
    window.addEventListener('catanx:combat', handleCombat as EventListener);
    window.addEventListener('catanx:season-transition', handleSeasonTransition as EventListener);
    window.addEventListener('catanx:resource-float', handleResourceFloat as EventListener);

    return () => {
      window.removeEventListener('catanx:tile-pulse', handleTilePulse as EventListener);
      window.removeEventListener('catanx:combat', handleCombat as EventListener);
      window.removeEventListener(
        'catanx:season-transition',
        handleSeasonTransition as EventListener,
      );
      window.removeEventListener('catanx:resource-float', handleResourceFloat as EventListener);
    };
  }, []);

  useEffect(() => {
    const request = focusRequestRef.current;
    const camera = cameraRef.current;
    if (!request || !camera) return;
    if (lastFocusNonceRef.current === request.nonce) return;
    lastFocusNonceRef.current = request.nonce;
    if (camera.panTo(request.tileId)) {
      draw();
    }
  }, [draw, focusRequest]);

  return <div className="map-layer" data-testid="pixi-hex-board" ref={hostRef} />;
}

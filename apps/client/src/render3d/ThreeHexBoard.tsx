import { Suspense, useMemo } from 'react';
import { Canvas } from '@react-three/fiber';
import * as THREE from 'three';
import type { GameState } from '@catanx/engine';
import type { InitialPlacementState } from '../store/gameStore';
import type { CameraFocusRequest, CameraViewport } from '../components/Map/cameraTypes';
import type { ClassicBuildMode } from '../store/uiStore';
import { useSettingsStore } from '../store/settingsStore';
import { preloadBoardAssets } from './assets/usePremiumGlb';
import { CatanXWorld } from './CatanXWorld';
import type { BoardViewMode } from './camera/viewMode';
import type { BoardLayer } from '../components/Map/boardLayer';
import { RendererExposure } from './fx/RendererExposure';
import { resolveLayoutSize } from './utils/layoutSize';
import {
  dprRangeForProfile,
  resolveRenderQualityProfile,
} from './quality/renderQuality';
import { AdaptiveDprController } from './quality/AdaptiveDprController';

// H2: warm the GLB cache before the first Suspense settle on the live board.
preloadBoardAssets();

export interface ThreeHexBoardProps {
  gameState: GameState;
  selectedTile: string | null;
  highlightedTiles: string[];
  currentPlayerId: string;
  initialPlacement?: InitialPlacementState | null;
  showGrid?: boolean;
  showAnimations?: boolean;
  /** H4 — ambient animation speed multiplier (0.5–2). */
  animationSpeed?: number;
  cameraSensitivity?: number;
  focusRequest?: CameraFocusRequest | null;
  onTileClick: (tileId: string) => void;
  onTileHover: (tileId: string | null) => void;
  onPlacementIntersectionClick?: (intersectionId: string) => void;
  onPlacementEdgeClick?: (edgeId: string) => void;
  classicBuildMode?: ClassicBuildMode | null;
  classicBuildIntersectionIds?: string[];
  classicBuildEdgeIds?: string[];
  onCameraViewportChange?: (viewport: CameraViewport) => void;
  viewMode?: BoardViewMode;
  boardLayer?: BoardLayer;
}

/**
 * Three.js board — Phase G default map renderer (premium meshes, seasons, LOD).
 */
export function ThreeHexBoard({
  gameState,
  selectedTile,
  highlightedTiles,
  currentPlayerId,
  showGrid = false,
  showAnimations = true,
  animationSpeed = 1,
  cameraSensitivity = 1,
  focusRequest = null,
  initialPlacement = null,
  onTileClick,
  onTileHover,
  onPlacementIntersectionClick,
  onPlacementEdgeClick,
  classicBuildMode = null,
  classicBuildIntersectionIds = [],
  classicBuildEdgeIds = [],
  onCameraViewportChange,
  viewMode = 'strategic',
  boardLayer = 'surface',
}: ThreeHexBoardProps) {
  const visualQuality = useSettingsStore((s) => s.visualQuality);
  const layoutSize = useMemo(
    () => resolveLayoutSize(gameState.mapRadius),
    [gameState.mapRadius],
  );
  const qualityProfile = useMemo(
    () => resolveRenderQualityProfile(visualQuality),
    [visualQuality],
  );
  const dpr = dprRangeForProfile(qualityProfile);

  return (
    <div className="map-layer" data-testid="three-hex-board" style={{ touchAction: 'none' }}>
      <Canvas
        orthographic
        shadows
        dpr={dpr}
        gl={{
          antialias: true,
          powerPreference: 'high-performance',
          alpha: false,
        }}
        camera={{
          position: [12, 16, 12],
          zoom: 48,
          near: 0.1,
          far: 280,
        }}
        onCreated={({ gl }) => {
          gl.toneMapping = THREE.ACESFilmicToneMapping;
          gl.toneMappingExposure = viewMode === 'cinematic' ? 1.08 : 1.05;
          gl.outputColorSpace = THREE.SRGBColorSpace;
          gl.shadowMap.enabled = true;
          gl.shadowMap.type = THREE.PCFSoftShadowMap;
        }}
        onPointerMissed={() => onTileHover(null)}
        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', display: 'block' }}
      >
        <AdaptiveDprController
          enabled={visualQuality === 'auto'}
          maxDpr={qualityProfile.maxDpr}
        />
        <RendererExposure viewMode={viewMode} />
        <Suspense fallback={null}>
          <CatanXWorld
            qualityProfile={qualityProfile}
            gameState={gameState}
            selectedTile={selectedTile}
            highlightedTiles={highlightedTiles}
            currentPlayerId={currentPlayerId}
            showGrid={showGrid}
            showAnimations={showAnimations}
            animationSpeed={animationSpeed}
            cameraSensitivity={cameraSensitivity}
            focusRequest={focusRequest}
            layoutSize={layoutSize}
            initialPlacement={initialPlacement}
            classicBuildMode={classicBuildMode}
            classicBuildIntersectionIds={classicBuildIntersectionIds}
            classicBuildEdgeIds={classicBuildEdgeIds}
            onTileClick={onTileClick}
            onTileHover={onTileHover}
            onPlacementIntersectionClick={onPlacementIntersectionClick}
            onPlacementEdgeClick={onPlacementEdgeClick}
            onCameraViewportChange={onCameraViewportChange}
            viewMode={viewMode}
            boardLayer={boardLayer}
          />
        </Suspense>
      </Canvas>
    </div>
  );
}

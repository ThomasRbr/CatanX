import { Suspense, useMemo } from 'react';
import { Canvas } from '@react-three/fiber';
import * as THREE from 'three';
import { useSettingsStore } from '../store/settingsStore';
import type { ThreeHexBoardProps } from './ThreeHexBoard';
import { CatanXWorld } from './CatanXWorld';
import { AdaptiveDprController } from './quality/AdaptiveDprController';
import { dprRangeForProfile, resolveRenderQualityProfile } from './quality/renderQuality';
import { RendererExposure } from './fx/RendererExposure';
import { resolveLayoutSize } from './utils/layoutSize';
import { preloadBoardAssets } from './assets/usePremiumGlb';
import { projectBoardRenderSnapshot } from './diorama/BoardRenderProjector';

preloadBoardAssets();

/**
 * Production Diorama renderer. It consumes a visual projection and uses a
 * long-lens perspective camera while all rules stay in the authoritative
 * engine. WebGL2 is the parity backend; WebGPU remains gated by capability
 * work and never changes the scene contract.
 */
export function DioramaRenderer({
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
  const visualQuality = useSettingsStore((state) => state.visualQuality);
  const backend = useSettingsStore((state) => state.graphicsBackend);
  const layoutSize = useMemo(() => resolveLayoutSize(gameState.mapRadius), [gameState.mapRadius]);
  const qualityProfile = useMemo(
    () => resolveRenderQualityProfile(visualQuality, undefined, backend),
    [backend, visualQuality],
  );
  const snapshot = useMemo(
    () => projectBoardRenderSnapshot(gameState, boardLayer),
    [boardLayer, gameState],
  );

  return (
    <div
      className="map-layer"
      data-testid="diorama-board"
      data-render-revision={snapshot.revision}
      data-graphics-backend="webgl2"
      style={{ touchAction: 'none' }}
    >
      <Canvas
        shadows
        dpr={dprRangeForProfile(qualityProfile)}
        gl={{
          antialias: true,
          powerPreference: 'high-performance',
          alpha: false,
          // A logarithmic depth buffer is incompatible with the sky dome, which
          // pins itself to the far plane by writing w into z. The scene's
          // 0.08–320 range has no depth-precision problem to solve anyway.
          logarithmicDepthBuffer: false,
        }}
        camera={{
          position: [12, 15.4, 12],
          fov: viewMode === 'cinematic' ? 28 : 34,
          near: 0.08,
          far: 320,
        }}
        onCreated={({ gl }) => {
          gl.toneMapping = THREE.ACESFilmicToneMapping;
          gl.toneMappingExposure = viewMode === 'cinematic' ? 1.08 : 1.02;
          gl.outputColorSpace = THREE.SRGBColorSpace;
          gl.shadowMap.enabled = true;
          gl.shadowMap.type = THREE.PCFSoftShadowMap;
        }}
        onPointerMissed={() => onTileHover(null)}
        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', display: 'block' }}
      >
        <AdaptiveDprController enabled={visualQuality === 'auto'} maxDpr={qualityProfile.maxDpr} />
        <RendererExposure viewMode={viewMode} />
        <Suspense fallback={null}>
          <CatanXWorld
            qualityProfile={qualityProfile}
            gameState={gameState}
            renderSnapshot={snapshot}
            cameraModel="perspective"
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


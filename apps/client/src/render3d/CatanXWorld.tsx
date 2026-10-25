import { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import type { GameState } from '@catanx/engine';
import type { InitialPlacementState } from '../store/gameStore';
import type { CameraFocusRequest, CameraViewport } from '../components/Map/cameraTypes';
import { CameraControls } from './camera/CameraControls';
import { DioramaCameraControls } from './camera/DioramaCameraControls';
import { MapLodContext } from './camera/MapLodContext';
import { computeIslandBounds } from './camera/fitOrthographicCamera';
import type { BoardViewMode } from './camera/viewMode';
import { isCinematicView } from './camera/viewMode';
import { BiomeDecorations } from './decorations/BiomeDecorations';
import { Buildings3D } from './entities/Buildings3D';
import { EventMarkers3D } from './entities/EventMarkers3D';
import { FogOfWar3D } from './entities/FogOfWar3D';
import { Ports3D } from './entities/Ports3D';
import { ProductionToken3D } from './entities/ProductionToken3D';
import { Roads3D } from './entities/Roads3D';
import { Robber3D } from './entities/Robber3D';
import { Units3D } from './entities/Units3D';
import { CkPieces3D } from './entities/CkPieces3D';
import { UndergroundSkyWorld3D } from './entities/UndergroundSkyWorld3D';
import { StateDiffFx3D } from './fx/StateDiffFx3D';
import { PerfStats3D } from './fx/PerfStats3D';
import { StaticShadowBake } from './fx/StaticShadowBake';
import { AmbientAnimationProvider } from './fx/AmbientAnimationContext';
import { AmbientLife } from './fx/AmbientLife';
import { SeasonClimateFx } from './fx/SeasonClimateFx';
import { PlacementOverlay3D } from './interaction/PlacementOverlay3D';
import { ClassicBuildOverlay3D } from './interaction/ClassicBuildOverlay3D';
import type { ClassicBuildMode } from '../store/uiStore';
import { SceneEnvironment } from './SceneEnvironment';
import { Coastline } from './terrain/Coastline';
import { HexTerrain } from './terrain/HexTerrain';
import { WaterSurface } from './terrain/WaterSurface';
import { InlandWater } from './terrain/InlandWater';
import { HexBorderNetwork, LagoonMarkers, TileEmphasis3D } from './terrain/DrapedHexLines';
import { cubeToWorld } from './utils/hexToWorld';
import type { MapLodLevel } from './utils/mapLod';
import { buildWorldTopology } from './utils/topologyToWorld';
import type { BoardLayer } from '../components/Map/boardLayer';
import type { RenderQualityProfile } from './quality/renderQuality';
import { RenderQualityProvider } from './quality/RenderQualityContext';
import { CinematicAtmosphere } from './fx/CinematicAtmosphere';
import { BoardPostStack } from './fx/BoardPostStack';
import type { GroundClearings } from './decorations/BladeField';
import { resolveBuildingVisual } from './utils/buildingVisual';
import { resolveRoadsForRender } from './utils/resolveRoads';
import { FogVolumeState } from './fx/fogVolume';
import { BoardHeightfield } from './terrain/BoardHeightfield';
import { SurfaceHeightProvider } from './terrain/SurfaceHeightContext';
import { SeasonalSnowCover } from './terrain/SeasonalSnowCover';
import { SeasonalSnowDrifts } from './terrain/SeasonalSnowDrifts';
import { OrganicIslandPerimeter } from './terrain/OrganicIslandPerimeter';
import { CoastalWetRocks } from './terrain/CoastalWetRocks';
import { IceFloes } from './terrain/IceFloes';
import type { BoardRenderSnapshot } from './diorama/BoardRenderSnapshot';

export interface CatanXWorldProps {
  qualityProfile: RenderQualityProfile;
  gameState: GameState;
  /** Immutable visual projection used by Diorama; legacy rendering may omit it. */
  renderSnapshot?: BoardRenderSnapshot;
  cameraModel?: 'orthographic' | 'perspective';
  selectedTile: string | null;
  highlightedTiles: string[];
  currentPlayerId: string;
  showGrid?: boolean;
  showAnimations?: boolean;
  animationSpeed?: number;
  cameraSensitivity?: number;
  focusRequest?: CameraFocusRequest | null;
  layoutSize: number;
  initialPlacement?: InitialPlacementState | null;
  classicBuildMode?: ClassicBuildMode | null;
  classicBuildIntersectionIds?: string[];
  classicBuildEdgeIds?: string[];
  onTileClick: (tileId: string) => void;
  onTileHover: (tileId: string | null) => void;
  onPlacementIntersectionClick?: (intersectionId: string) => void;
  onPlacementEdgeClick?: (edgeId: string) => void;
  onCameraViewportChange?: (viewport: CameraViewport) => void;
  viewMode?: BoardViewMode;
  boardLayer?: BoardLayer;
}

export function CatanXWorld({
  qualityProfile,
  gameState,
  renderSnapshot,
  cameraModel = 'orthographic',
  selectedTile,
  highlightedTiles,
  currentPlayerId,
  showGrid = false,
  showAnimations = true,
  animationSpeed = 1,
  cameraSensitivity = 1,
  focusRequest = null,
  layoutSize,
  initialPlacement = null,
  classicBuildMode = null,
  classicBuildIntersectionIds = [],
  classicBuildEdgeIds = [],
  onTileClick,
  onTileHover,
  onPlacementIntersectionClick,
  onPlacementEdgeClick,
  onCameraViewportChange,
  viewMode = 'strategic',
  boardLayer = 'surface',
}: CatanXWorldProps) {
  const [hoveredTile, setHoveredTile] = useState<string | null>(null);
  const [isPanning, setIsPanning] = useState(false);
  const [lod, setLod] = useState<MapLodLevel>(1);

  const tiles = useMemo(() => [...gameState.map.values()], [gameState.map]);
  const mapSeed = renderSnapshot?.mapSeed ?? gameState.config.mapSeed;
  const season = renderSnapshot?.season?.season ?? gameState.season;
  const climateId = renderSnapshot?.season?.climateId
    ?? gameState.extensions?.seasons?.currentClimateId
    ?? null;
  const topology = useMemo(() => buildWorldTopology(gameState.map), [gameState.map]);
  /**
   * The heightfield depends on the tiles and nothing else, so it survives every
   * game action untouched.
   *
   * It used to take the dirt-road carve list, memoised on `gameState` — an
   * object whose identity changes on *any* action. Placing a settlement built a
   * new carve array, which built a new heightfield, which changed the context
   * value that nineteen components read. Each of them then re-placed every one
   * of its thousands of instances, and each placement calls `sampleHeight`,
   * which scans all land tiles. Measured cost: a 1.0 s frozen frame for a
   * settlement and up to 3.6 s for a road.
   *
   * `BoardHeightfield` keeps its carving support — it is still covered by its
   * own tests — but nothing carves during play. The 0.042-deep groove was
   * invisible next to terrain that now rises a full hex radius, and `Roads3D`
   * lays its own geometry on the surface regardless.
   */
  const surfaceHeightfield = useMemo(() => new BoardHeightfield(tiles), [tiles]);

  const cinematic = isCinematicView(viewMode);
  const surfaceView = boardLayer === 'surface';

  const islandTiles = useMemo(
    () =>
      tiles.map((tile) => ({
        terrain: tile.terrain,
        position: cubeToWorld(tile.coord),
      })),
    [tiles],
  );

  const bounds = useMemo(() => computeIslandBounds(islandTiles), [islandTiles]);
  const highlightSet = useMemo(() => new Set(highlightedTiles), [highlightedTiles]);

  const focusWorld = useMemo(() => {
    if (!focusRequest) return null;
    const tile = gameState.map.get(focusRequest.tileId);
    if (!tile) return null;
    return cubeToWorld(tile.coord);
  }, [focusRequest, gameState.map]);

  const placementActive = gameState.phase === 'setup' && Boolean(initialPlacement?.active);
  const classicBuildActive = Boolean(classicBuildMode) && gameState.phase === 'playing';
  const overlayActive = placementActive || classicBuildActive;
  // One cloud deck for the session: the composer keeps a stable reference,
  // so game updates only touch textures and never rebuild a pass.
  const fogVolume = useMemo(() => new FogVolumeState(), []);
  useEffect(() => () => fogVolume.dispose(), [fogVolume]);
  const volumetricFog = cameraModel === 'perspective' && qualityProfile.atmosphericFx;
  // Grass and wheat stay off house plots and road beds.
  const groundClearings = useMemo<GroundClearings>(() => {
    const points: Array<{ x: number; z: number; r: number }> = [];
    for (const building of gameState.buildings.values()) {
      if (building.placementKind !== 'intersection' || !building.placementIntersectionId) continue;
      const intersection = topology.intersections[building.placementIntersectionId];
      if (!intersection) continue;
      const visual = resolveBuildingVisual(building.definitionId);
      const r = visual === 'settlement' ? 0.15 : visual === 'city' || visual === 'metropolis' ? 0.21 : 0.13;
      points.push({ x: intersection.x, z: intersection.y, r });
    }
    const segments = resolveRoadsForRender(gameState, topology, initialPlacement).map((road) => ({
      ax: road.ax,
      az: road.az,
      bx: road.bx,
      bz: road.bz,
      r: 0.055,
    }));
    return { points, segments };
  }, [gameState, initialPlacement, topology]);

  const tileInteractionEnabled = !overlayActive && !isPanning;
  const placementInteractionEnabled = overlayActive && !isPanning;

  const handleHover = useCallback(
    (tileId: string | null) => {
      setHoveredTile(tileId);
      onTileHover(tileId);
    },
    [onTileHover],
  );

  const handleTileClick = useCallback(
    (tileId: string) => {
      if (!tileInteractionEnabled) return;
      onTileClick(tileId);
    },
    [onTileClick, tileInteractionEnabled],
  );

  const clearHover = useCallback(() => {
    setHoveredTile(null);
    onTileHover(null);
  }, [onTileHover]);

  return (
    <RenderQualityProvider profile={qualityProfile}>
    <SurfaceHeightProvider sampler={surfaceHeightfield}>
    <MapLodContext.Provider value={lod}>
      <AmbientAnimationProvider enabled={showAnimations} speed={animationSpeed}>
        <SceneEnvironment
          bounds={bounds}
          season={season}
          climateId={climateId}
          cinematic={cinematic}
          layer={boardLayer}
          shadowMapSize={qualityProfile.shadowSize}
        />
        {cameraModel === 'perspective' ? (
          <DioramaCameraControls
            bounds={bounds}
            layoutSize={layoutSize}
            sensitivity={cameraSensitivity}
            focusWorld={focusWorld}
            focusNonce={focusRequest?.nonce ?? 0}
            onViewportChange={onCameraViewportChange}
            onLodChange={setLod}
            onPanningChange={(next) => {
              setIsPanning(next);
              if (next) clearHover();
            }}
            effectsEnabled={showAnimations}
          />
        ) : (
          <CameraControls
            bounds={bounds}
            layoutSize={layoutSize}
            sensitivity={cameraSensitivity}
            focusWorld={focusWorld}
            focusNonce={focusRequest?.nonce ?? 0}
            onViewportChange={onCameraViewportChange}
            onLodChange={setLod}
            onPanningChange={(next) => {
              setIsPanning(next);
              if (next) clearHover();
            }}
            effectsEnabled={showAnimations}
          />
        )}

        {surfaceView && (
          <WaterSurface
            bounds={bounds}
            tiles={tiles}
            season={season}
            climateId={climateId}
            cinematic={cinematic}
            animate={showAnimations}
            onClearHover={clearHover}
          />
        )}

        {surfaceView && (
          <HexTerrain
            tiles={tiles}
            selectedTile={cinematic || overlayActive ? null : selectedTile}
            highlightedTiles={cinematic ? new Set() : highlightSet}
            hoveredTile={cinematic || overlayActive ? null : hoveredTile}
            showGrid={!cinematic && (showGrid || overlayActive)}
            climateId={climateId}
            season={season}
            softBiomeTransitions={cameraModel === 'perspective'}
            interactionEnabled={!cinematic && tileInteractionEnabled}
            onTileClick={handleTileClick}
            onTileHover={handleHover}
            flatEmphasis={cameraModel !== 'perspective'}
          />
        )}
        {/* The island reads as one landscape, but every hex stays a legible
            game space: borders and emphasis are draped on the relief. */}
        {surfaceView && cameraModel === 'perspective' && !cinematic && (
          <HexBorderNetwork tiles={tiles} />
        )}
        {surfaceView && cameraModel === 'perspective' && <LagoonMarkers tiles={tiles} />}
        {surfaceView && cameraModel === 'perspective' && !cinematic && (
          <TileEmphasis3D
            tiles={tiles}
            targetTileIds={highlightSet}
            hoveredTileId={overlayActive ? null : hoveredTile}
            selectedTileId={overlayActive ? null : selectedTile}
            animate={showAnimations}
          />
        )}

        {/* Lakes and rivers are filtered out of the continuous land surface, so
            without this they are holes straight through the island. */}
        {surfaceView && cameraModel === 'perspective' && (
          <InlandWater
            tiles={tiles}
            season={season}
            climateId={climateId}
            cinematic={cinematic}
            animate={showAnimations}
          />
        )}
        {surfaceView && cameraModel === 'perspective' && (
          <OrganicIslandPerimeter tiles={tiles} mapSeed={mapSeed} />
        )}
        {surfaceView && cameraModel === 'perspective' && (
          <CoastalWetRocks tiles={tiles} mapSeed={mapSeed} season={season} />
        )}
        {surfaceView && cameraModel === 'perspective' && (
          <IceFloes tiles={tiles} mapSeed={mapSeed} season={season} />
        )}
        {/* MountainRidgeNetwork is retired on the perspective board: the
            heightfield now carves real summits and arêtes, and the extra ridge
            sheets lay over them as flat grey slabs. */}
        {/* Perspective owns one closed organic shore. The segmented coast is
            retained only by the orthographic renderer. */}
        {surfaceView && cameraModel !== 'perspective' && (
          <Coastline tiles={tiles} mapSeed={mapSeed} />
        )}
        {surfaceView && cameraModel !== 'perspective' && (
          <SeasonalSnowCover tiles={tiles} season={season} climateId={climateId} />
        )}
        {surfaceView && cameraModel === 'perspective' && (
          <SeasonalSnowDrifts
            tiles={tiles}
            season={season}
            climateId={climateId}
            mapSeed={mapSeed}
          />
        )}
        {surfaceView && (
          <BiomeDecorations
            tiles={tiles}
            mapSeed={mapSeed}
            animate={showAnimations}
            season={season}
            climateId={climateId}
            continuousMountains={cameraModel === 'perspective'}
            classic={gameState.config.mode === 'classic'}
            groundClearings={groundClearings}
          />
        )}
        {!cinematic && surfaceView && (
          <ProductionToken3D
            tiles={tiles}
            robberTileId={gameState.robberPosition}
            activeRollTotal={gameState.lastDiceRoll?.total ?? null}
            rollToken={
              gameState.lastDiceRoll
                ? `${gameState.lastDiceRoll.turn}:${gameState.lastDiceRoll.player}:${gameState.lastDiceRoll.die1}:${gameState.lastDiceRoll.die2}`
                : null
            }
          />
        )}

        {surfaceView && <Ports3D gameState={gameState} />}
        {surfaceView && (
          <Roads3D
            gameState={gameState}
            topology={topology}
            initialPlacement={initialPlacement}
            climateId={climateId}
          />
        )}
        {surfaceView && (
          <Buildings3D
            gameState={gameState}
            topology={topology}
            season={season}
            viewMode={viewMode}
          />
        )}
        {/* Drei's off-screen ContactShadows quad is unsafe over the animated
            ocean on several WebGL2 drivers: one half of its transparent plane
            can become an enormous opaque triangle. Terrain AO, PBR normals and
            the directional shadow pass provide stable grounding in gameplay. */}
        {surfaceView && (
          <AmbientLife
            gameState={gameState}
            topology={topology}
            enabled={showAnimations && !cinematic}
          />
        )}
        {surfaceView && (
          <SeasonClimateFx
            tiles={tiles}
            bounds={bounds}
            climateId={climateId}
            enabled={showAnimations}
          />
        )}
        {!cinematic && surfaceView && <Units3D gameState={gameState} />}
        {!cinematic && surfaceView && (
          <Suspense fallback={null}>
            <CkPieces3D gameState={gameState} topology={topology} />
          </Suspense>
        )}
        {!cinematic && (
          <UndergroundSkyWorld3D
            key={boardLayer}
            gameState={gameState}
            layer={boardLayer}
            currentPlayerId={currentPlayerId}
            topology={topology}
            animate={showAnimations}
          />
        )}
        {!cinematic && surfaceView && <Robber3D gameState={gameState} animate={showAnimations} />}
        {!cinematic && surfaceView && <EventMarkers3D gameState={gameState} animate={showAnimations} />}

        {!cinematic && surfaceView && (
          <FogOfWar3D
            gameState={gameState}
            currentPlayerId={currentPlayerId}
            volume={fogVolume}
            volumetric={volumetricFog}
            season={season}
            climateId={climateId}
          />
        )}

        {!cinematic && surfaceView && (
          <StateDiffFx3D
            gameState={gameState}
            topology={topology}
            enabled={showAnimations && !overlayActive}
          />
        )}
        {/* The sun never moves within a season and the board only changes on a
            game action, so the per-frame shadow pass is pure waste. Re-baking is
            keyed on the render revision plus the season grade. */}
        {cameraModel === 'perspective' && (
          <StaticShadowBake
            settleFrames={cinematic ? 56 : 36}
            invalidateKey={`${renderSnapshot?.revision ?? 0}:${season}:${climateId ?? '-'}:${boardLayer}:${lod}`}
          />
        )}
        <PerfStats3D mapRadius={gameState.mapRadius} />

        {placementActive && initialPlacement && !cinematic && surfaceView && (
          <PlacementOverlay3D
            gameState={gameState}
            topology={topology}
            setup={initialPlacement}
            enabled={placementInteractionEnabled}
            onIntersectionClick={onPlacementIntersectionClick}
            onEdgeClick={onPlacementEdgeClick}
          />
        )}

        {classicBuildActive && classicBuildMode && !cinematic && surfaceView && (
          <ClassicBuildOverlay3D
            gameState={gameState}
            topology={topology}
            mode={classicBuildMode}
            validIntersectionIds={classicBuildIntersectionIds}
            validEdgeIds={classicBuildEdgeIds}
            enabled={placementInteractionEnabled}
            onIntersectionClick={onPlacementIntersectionClick}
            onEdgeClick={onPlacementEdgeClick}
          />
        )}
        {/* One composer for the whole perspective view: AO, bloom, tone
            mapping and grade (it also carries the vignette and, in cinematic
            shots, depth of field). */}
        {cameraModel === 'perspective' && (
          // Stays mounted through placement: toggling a composer recompiles
          // every pass and flips the whole image between two looks.
          <BoardPostStack
            season={season}
            cinematic={cinematic}
            depthOfField={cinematic}
            winter={season === 'winter'}
            fogVolume={volumetricFog ? fogVolume : null}
          />
        )}
        {cameraModel === 'perspective' && cinematic && (
          <CinematicAtmosphere
            enabled={!overlayActive}
            winter={season === 'winter'}
          />
        )}
      </AmbientAnimationProvider>
    </MapLodContext.Provider>
    </SurfaceHeightProvider>
    </RenderQualityProvider>
  );
}

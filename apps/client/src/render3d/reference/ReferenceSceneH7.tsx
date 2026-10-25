import { Suspense, useEffect, useMemo, useState, type CSSProperties } from 'react';
import { Canvas } from '@react-three/fiber';
import { useTexture } from '@react-three/drei';
import * as THREE from 'three';
import type { HexTile, Season, TerrainType } from '@catanx/engine';
import { hexToId } from '@catanx/engine';
import { MapLodContext } from '../camera/MapLodContext';
import { RenderQualityProvider } from '../quality/RenderQualityContext';
import { RENDER_QUALITY_PROFILES, dprRangeForProfile } from '../quality/renderQuality';
import { AdaptiveDprController } from '../quality/AdaptiveDprController';
import { CameraControls } from '../camera/CameraControls';
import { DioramaCameraControls } from '../camera/DioramaCameraControls';
import { computeIslandBounds } from '../camera/fitOrthographicCamera';
import {
  readViewModeFromUrl,
  syncViewModeToUrl,
  type BoardViewMode,
  isCinematicView,
} from '../camera/viewMode';
import { BiomeDecorations } from '../decorations/BiomeDecorations';
import { AmbientAnimationProvider } from '../fx/AmbientAnimationContext';
import { BoardContactShadows } from '../fx/BoardContactShadows';
import { StaticShadowBake } from '../fx/StaticShadowBake';
import { RendererExposure } from '../fx/RendererExposure';
import { PerfStats3D } from '../fx/PerfStats3D';
import { SoftVignette } from '../fx/SoftVignette';
import { CinematicDepthOfField } from '../fx/CinematicDepthOfField';
import { CinematicAtmosphere } from '../fx/CinematicAtmosphere';
import { SceneEnvironment } from '../SceneEnvironment';
import { Coastline } from '../terrain/Coastline';
import { OrganicIslandPerimeter } from '../terrain/OrganicIslandPerimeter';
import { CoastalWetRocks } from '../terrain/CoastalWetRocks';
import { MountainRidgeNetwork } from '../terrain/MountainRidgeNetwork';
import { HexTerrain } from '../terrain/HexTerrain';
import { WaterSurface } from '../terrain/WaterSurface';
import { BoardHeightfield } from '../terrain/BoardHeightfield';
import { SurfaceHeightProvider, useSurfaceHeight } from '../terrain/SurfaceHeightContext';
import { SeasonalSnowCover } from '../terrain/SeasonalSnowCover';
import { SeasonalSnowDrifts } from '../terrain/SeasonalSnowDrifts';
import { cubeToWorld } from '../utils/hexToWorld';
import { RealisticVillage } from '../entities/RealisticVillage';

/** Classic Catan ring — validates H7 framing, lighting and cinematic mode. */
const H7_LAYOUT: Array<{ q: number; r: number; terrain: TerrainType }> = [
  { q: -2, r: 0, terrain: 'forest' },
  { q: -2, r: 1, terrain: 'pasture' },
  { q: -2, r: 2, terrain: 'plains' },
  { q: -1, r: -1, terrain: 'mountain' },
  { q: -1, r: 0, terrain: 'forest' },
  { q: -1, r: 1, terrain: 'hill' },
  { q: -1, r: 2, terrain: 'plains' },
  { q: 0, r: -2, terrain: 'mountain' },
  { q: 0, r: -1, terrain: 'pasture' },
  { q: 0, r: 0, terrain: 'pasture' },
  { q: 0, r: 1, terrain: 'pasture' },
  { q: 0, r: 2, terrain: 'forest' },
  { q: 1, r: -2, terrain: 'hill' },
  { q: 1, r: -1, terrain: 'forest' },
  { q: 1, r: 0, terrain: 'pasture' },
  { q: 1, r: 1, terrain: 'mountain' },
  { q: 2, r: -2, terrain: 'desert' },
  { q: 2, r: -1, terrain: 'hill' },
  { q: 2, r: 0, terrain: 'plains' },
];

function readReferenceSeason(): Season {
  const value = new URLSearchParams(window.location.search).get('season');
  return value === 'spring' || value === 'summer' || value === 'autumn' || value === 'winter'
    ? value
    : 'summer';
}

function readReferenceShot(): 'island' | 'village' | 'strategic' {
  const value = new URLSearchParams(window.location.search).get('shot');
  return value === 'village' || value === 'strategic' ? value : 'island';
}

function roadRibbon(
  curve: THREE.CatmullRomCurve3,
  halfWidth: number,
  sampleHeight: (x: number, z: number) => number,
  lift = 0,
) {
  const samples = curve.getPoints(56).map((point) => {
    point.y = sampleHeight(point.x, point.z) + 0.012 + lift;
    return point;
  });
  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  for (let i = 0; i < samples.length; i++) {
    const point = samples[i]!;
    const prev = samples[Math.max(0, i - 1)]!;
    const next = samples[Math.min(samples.length - 1, i + 1)]!;
    const dx = next.x - prev.x;
    const dz = next.z - prev.z;
    const length = Math.max(0.0001, Math.hypot(dx, dz));
    const px = -dz / length;
    const pz = dx / length;
    const leftX = point.x + px * halfWidth;
    const leftZ = point.z + pz * halfWidth;
    const rightX = point.x - px * halfWidth;
    const rightZ = point.z - pz * halfWidth;
    positions.push(
      leftX, sampleHeight(leftX, leftZ) + 0.012 + lift, leftZ,
      rightX, sampleHeight(rightX, rightZ) + 0.012 + lift, rightZ,
    );
    normals.push(0, 1, 0, 0, 1, 0);
    const v = i / Math.max(1, samples.length - 1) * 5.5;
    uvs.push(0, v, 1, v);
    if (i > 0) {
      const a = (i - 1) * 2;
      const b = a + 1;
      const c = i * 2;
      const d = c + 1;
      indices.push(a, b, c, b, d, c);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeBoundingSphere();
  return geometry;
}

function PromoRoad({ points }: { points: Array<[number, number]> }) {
  const surface = useSurfaceHeight();
  const [roadTexture, roadNormal, roadRoughness] = useTexture([
    '/assets/textures/roads/photoreal/rutted_dirt_road_albedo_v3.jpg',
    '/assets/textures/roads/photoreal/rutted_dirt_road_normal_v3.webp',
    '/assets/textures/roads/photoreal/rutted_dirt_road_roughness_v3.jpg',
  ]);
  const curve = useMemo(
    () => new THREE.CatmullRomCurve3(points.map(([x, z]) => new THREE.Vector3(x, 0, z))),
    [points],
  );
  // Wider bed + raised track — must punch through Ultra grass in village close-ups.
  const apron = useMemo(
    () => roadRibbon(curve, 0.16, (x, z) => surface.sampleHeight(x, z), -0.001),
    [curve, surface],
  );
  const shoulder = useMemo(
    () => roadRibbon(curve, 0.12, (x, z) => surface.sampleHeight(x, z), 0.002),
    [curve, surface],
  );
  const track = useMemo(
    () => roadRibbon(curve, 0.072, (x, z) => surface.sampleHeight(x, z), 0.008),
    [curve, surface],
  );
  useEffect(() => () => {
    apron.dispose();
    shoulder.dispose();
    track.dispose();
  }, [apron, shoulder, track]);
  useEffect(() => {
    roadTexture.colorSpace = THREE.SRGBColorSpace;
    for (const texture of [roadTexture, roadNormal, roadRoughness]) {
      texture.wrapS = THREE.RepeatWrapping;
      texture.wrapT = THREE.RepeatWrapping;
      texture.repeat.set(1.15, 4.2);
      texture.anisotropy = 8;
      texture.needsUpdate = true;
    }
  }, [roadNormal, roadRoughness, roadTexture]);
  return (
    <group>
      <mesh geometry={apron} receiveShadow renderOrder={2} raycast={() => undefined}>
        <meshStandardMaterial
          map={roadTexture}
          normalMap={roadNormal}
          normalScale={new THREE.Vector2(0.28, 0.28)}
          roughnessMap={roadRoughness}
          color="#6a5440"
          roughness={1}
          transparent
          opacity={0.42}
          depthWrite={false}
          side={THREE.DoubleSide}
          polygonOffset
          polygonOffsetFactor={-1}
        />
      </mesh>
      <mesh geometry={shoulder} receiveShadow renderOrder={3} raycast={() => undefined}>
        <meshStandardMaterial
          map={roadTexture}
          normalMap={roadNormal}
          normalScale={new THREE.Vector2(0.4, 0.4)}
          roughnessMap={roadRoughness}
          color="#7a6248"
          roughness={1}
          transparent
          opacity={0.62}
          depthWrite={false}
          side={THREE.DoubleSide}
          polygonOffset
          polygonOffsetFactor={-1.5}
        />
      </mesh>
      <mesh geometry={track} receiveShadow castShadow={false} renderOrder={4} raycast={() => undefined}>
        <meshStandardMaterial
          map={roadTexture}
          normalMap={roadNormal}
          normalScale={new THREE.Vector2(0.72, 0.72)}
          roughnessMap={roadRoughness}
          color="#a88868"
          emissive="#5a4430"
          emissiveMap={roadTexture}
          emissiveIntensity={0.18}
          roughness={0.96}
          side={THREE.DoubleSide}
          polygonOffset
          polygonOffsetFactor={-2}
        />
      </mesh>
    </group>
  );
}

function PromoSettlements({ season }: { season: string }) {
  const surface = useSurfaceHeight();
  const sit = (x: number, z: number) => surface.sampleHeight(x, z) + 0.012;
  const roads = useMemo<Array<Array<[number, number]>>>(() => [
    [[0.35, 0.18], [0.05, 0.05], [-0.45, -0.2], [-1.18, -0.34]],
    [[0.35, 0.18], [0.67, 0.02], [1.14, -0.38], [1.56, -0.72]],
    [[0.35, 0.18], [0.4, 0.62], [0.2, 1.1], [-0.02, 1.48]],
  ], []);
  return (
    <group>
      {roads.map((points, index) => <PromoRoad key={index} points={points} />)}
      <group position={[0.35, sit(0.35, 0.18), 0.18]} rotation={[0, -0.28, 0]}>
        <RealisticVillage
          castShadow
          urban
          scale={0.94}
          season={season}
          villageId="promo-city"
        />
      </group>
      <group position={[-1.18, sit(-1.18, -0.34), -0.34]} rotation={[0, 0.4, 0]}>
        <RealisticVillage
          castShadow
          scale={0.82}
          season={season}
          villageId="promo-hamlet-a"
        />
      </group>
      <group position={[1.56, sit(1.56, -0.72), -0.72]} rotation={[0, -0.5, 0]}>
        <RealisticVillage
          castShadow
          scale={0.78}
          season={season}
          villageId="promo-hamlet-b"
        />
      </group>
    </group>
  );
}

function fakeTile(q: number, r: number, terrain: TerrainType): HexTile {
  const coord = { q, r, s: -q - r };
  return {
    id: hexToId(coord),
    coord,
    terrain,
    elevation: terrain === 'mountain' ? 'highland' : 'lowland',
    climate: 'temperate',
    diceValue: terrain === 'ocean' ? null : 6,
    baseProduction: {},
    modifiers: [],
    features: [],
    owner: null,
    building: null,
    units: [],
    robber: false,
    port: null,
  } as unknown as HexTile;
}

const hudButton = (active: boolean): CSSProperties => ({
  padding: '6px 12px',
  cursor: 'pointer',
  border: active ? '1px solid #2a3a30' : '1px solid #8a9a88',
  background: active ? '#e8efe4' : '#d4ddd2',
  color: '#1c281e',
  borderRadius: 4,
  fontFamily: 'Georgia, "Times New Roman", serif',
  fontSize: 13,
});

/**
 * Open with `/?scene=h7` — promo polish on the live orthographic pipeline.
 */
function ReferenceSceneReady() {
  useEffect(() => {
    document.documentElement.dataset.catanxDioramaReady = 'true';
    return () => {
      delete document.documentElement.dataset.catanxDioramaReady;
    };
  }, []);
  return null;
}

export function ReferenceSceneH7Page() {
  const [viewMode, setViewMode] = useState<BoardViewMode>(() => readViewModeFromUrl());
  const cinematic = isCinematicView(viewMode);
  const referenceSeason = useMemo(readReferenceSeason, []);
  const referenceShot = useMemo(readReferenceShot, []);
  const opticalDof = useMemo(
    () => new URLSearchParams(window.location.search).get('opticalDof') !== '0',
    [],
  );
  const captureMode = useMemo(
    () => new URLSearchParams(window.location.search).get('capture') === '1',
    [],
  );
  const perspective = useMemo(
    () => new URLSearchParams(window.location.search).get('scene') === 'diorama',
    [],
  );

  const tiles = useMemo(
    () => H7_LAYOUT.map(({ q, r, terrain }) => fakeTile(q, r, terrain)),
    [],
  );

  const islandTiles = useMemo(
    () => tiles.map((tile) => ({ terrain: tile.terrain, position: cubeToWorld(tile.coord) })),
    [tiles],
  );
  const bounds = useMemo(() => computeIslandBounds(islandTiles), [islandTiles]);
  const heightfield = useMemo(() => {
    const carves = [
      { ax: 0.35, az: 0.18, bx: -1.18, bz: -0.34, halfWidth: 0.2, depth: 0.055 },
      { ax: 0.35, az: 0.18, bx: 1.56, bz: -0.72, halfWidth: 0.2, depth: 0.055 },
      { ax: 0.35, az: 0.18, bx: -0.02, bz: 1.48, halfWidth: 0.18, depth: 0.05 },
    ];
    return new BoardHeightfield(tiles, carves);
  }, [tiles]);
  const dofFocus = referenceShot === 'village' ? 0.008 : 0.016;
  const boardSpan = useMemo(
    () => Math.max(bounds.maxX - bounds.minX, bounds.maxZ - bounds.minZ),
    [bounds],
  );

  const applyMode = (next: BoardViewMode) => {
    setViewMode(next);
    syncViewModeToUrl(next);
  };

  const overlay: CSSProperties = {
    position: 'fixed',
    left: 16,
    bottom: 16,
    zIndex: 10,
    padding: '10px 14px',
    borderRadius: 8,
    background: 'rgba(18, 22, 20, 0.72)',
    color: '#e8efe6',
    fontFamily: 'Georgia, "Times New Roman", serif',
    fontSize: 13,
    lineHeight: 1.45,
    pointerEvents: 'none',
  };

  return (
    <div style={{ position: 'fixed', inset: 0, background: '#1a221c' }}>
      {!cinematic && (
        <div
          style={{
            position: 'fixed',
            zIndex: 12,
            left: 12,
            top: 12,
            display: 'flex',
            gap: 8,
            pointerEvents: 'auto',
          }}
        >
          <button type="button" onClick={() => applyMode('strategic')} style={hudButton(!cinematic)}>
            Stratégique
          </button>
          <button type="button" onClick={() => applyMode('cinematic')} style={hudButton(cinematic)}>
            Cinématique
          </button>
        </div>
      )}
      {cinematic && (
        <button
          type="button"
          onClick={() => applyMode('strategic')}
          style={{
            ...hudButton(false),
            position: 'fixed',
            zIndex: 12,
            right: 14,
            top: 14,
            pointerEvents: 'auto',
            visibility: 'hidden',
          }}
        >
          Quitter cinématique
        </button>
      )}

      {!cinematic && (
        <div style={overlay}>
          <div style={{ fontWeight: 700, marginBottom: 4 }}>Diorama — scène étalon 19 terrains</div>
          <div>{referenceSeason} · {referenceShot} · Contact shadows · ACES</div>
          <div>Forêt · Plaine · Montagne · Prairie · Désert · Côte · Océan</div>
        </div>
      )}

      <Canvas
        orthographic={!perspective}
        shadows
        dpr={dprRangeForProfile(RENDER_QUALITY_PROFILES.ultra, { capture: captureMode })}
        camera={perspective
          ? { position: [12, 15.4, 12], fov: cinematic ? 28 : 34, near: 0.08, far: 320 }
          : { position: [12, 16, 12], zoom: 52, near: 0.1, far: 120 }}
        // Cinematic DoF already resolves AA via the composer — MSAA on the
        // main buffer doubles fill-rate with almost no visible benefit.
        gl={{ antialias: !cinematic, powerPreference: 'high-performance' }}
        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}
        onCreated={({ gl }) => {
          gl.toneMapping = THREE.ACESFilmicToneMapping;
          gl.outputColorSpace = THREE.SRGBColorSpace;
          gl.shadowMap.enabled = true;
          gl.shadowMap.type = THREE.PCFSoftShadowMap;
        }}
      >
        <RendererExposure viewMode={viewMode} />
        <Suspense fallback={null}>
          <RenderQualityProvider profile={RENDER_QUALITY_PROFILES.ultra}>
          <MapLodContext.Provider value={cinematic ? 0 : referenceShot === 'village' ? 0 : 1}>
            <SurfaceHeightProvider sampler={heightfield}>
            <AmbientAnimationProvider enabled={false} speed={1}>
              <AdaptiveDprController
                enabled={!captureMode}
                maxDpr={captureMode ? 2 : cinematic ? 1.25 : 1.5}
                minDpr={1}
              />
              <StaticShadowBake settleFrames={cinematic ? 56 : 36} />
              <SceneEnvironment
                bounds={bounds}
                season={referenceSeason}
                cinematic={cinematic}
                shadowMapSize={2048}
              />
              <BoardContactShadows enabled span={boardSpan} cinematic={cinematic} />
              {perspective ? (
                <DioramaCameraControls
                  bounds={bounds}
                  layoutSize={1}
                  focusWorld={referenceShot === 'village' ? { x: 0.35, y: 0, z: 0.18 } : null}
                  focusNonce={referenceShot === 'village' ? 1 : 0}
                  initialDistanceScale={referenceShot === 'village' ? 0.27 : cinematic ? 0.8 : 0.92}
                />
              ) : (
                <CameraControls
                  bounds={bounds}
                  layoutSize={1}
                  focusWorld={null}
                  focusNonce={0}
                  fitHudInsets={cinematic ? {} : { top: 64, left: 80, right: 80, bottom: 90 }}
                  fitMargin={referenceShot === 'village' ? 0.46 : cinematic ? 0.82 : 0.94}
                />
              )}
              <WaterSurface
                bounds={bounds}
                tiles={tiles}
                season={referenceSeason}
                cinematic={cinematic}
                animate
              />
              <HexTerrain
                tiles={tiles}
                selectedTile={null}
                highlightedTiles={new Set()}
                hoveredTile={null}
                showGrid={!cinematic}
                season={referenceSeason}
                softBiomeTransitions={perspective}
                interactionEnabled={false}
                onTileClick={() => undefined}
                onTileHover={() => undefined}
              />
              {perspective && <OrganicIslandPerimeter tiles={tiles} mapSeed={707} />}
              {perspective && (
                <CoastalWetRocks tiles={tiles} mapSeed={707} season={referenceSeason} />
              )}
              {perspective && <MountainRidgeNetwork tiles={tiles} season={referenceSeason} />}
              {perspective && (
                <SeasonalSnowDrifts
                  tiles={tiles}
                  season={referenceSeason}
                  mapSeed={707}
                />
              )}
              {!perspective && <Coastline tiles={tiles} mapSeed={707} />}
              {!perspective && <SeasonalSnowCover tiles={tiles} season={referenceSeason} />}
              <BiomeDecorations
                tiles={tiles}
                mapSeed={707}
                animate
                season={referenceSeason}
                continuousMountains={perspective}
                promoClears
              />
              <PromoSettlements season={referenceSeason} />
              {perspective && cinematic && opticalDof && (
                <CinematicDepthOfField
                  focusDistance={dofFocus}
                  winter={referenceSeason === 'winter'}
                  shot={referenceShot}
                  focusWorld={referenceShot === 'village' ? { x: 0.35, y: 0.06, z: 0.18 } : null}
                />
              )}
              {perspective && cinematic && (
                <CinematicAtmosphere
                  winter={referenceSeason === 'winter'}
                  shot={referenceShot}
                  strengthScale={opticalDof ? 1 : 1.35}
                />
              )}
              <SoftVignette enabled strength={cinematic ? 0.12 : 0.16} />
              <PerfStats3D mapRadius={2} />
              <ReferenceSceneReady />
            </AmbientAnimationProvider>
            </SurfaceHeightProvider>
          </MapLodContext.Provider>
          </RenderQualityProvider>
        </Suspense>
      </Canvas>
    </div>
  );
}

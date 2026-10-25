import { Suspense, useMemo, type CSSProperties } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import type { HexTile, TerrainType } from '@catanx/engine';
import { hexToId } from '@catanx/engine';
import { MapLodContext } from '../camera/MapLodContext';
import { BiomeDecorations } from '../decorations/BiomeDecorations';
import { AmbientAnimationProvider } from '../fx/AmbientAnimationContext';
import { PerfStats3D } from '../fx/PerfStats3D';
import { SceneEnvironment } from '../SceneEnvironment';
import { HexTerrain } from '../terrain/HexTerrain';
import { WaterSurface } from '../terrain/WaterSurface';
import { computeWorldBounds } from '../camera/fitOrthographicCamera';
import { cubeToWorld } from '../utils/hexToWorld';

/** Advanced biomes ring + center lake — validates H6 recipes / paints. */
const H6_LAYOUT: Array<{ q: number; r: number; terrain: TerrainType }> = [
  { q: 0, r: 0, terrain: 'lake' },
  { q: 1, r: 0, terrain: 'jungle' },
  { q: 0, r: -1, terrain: 'swamp' },
  { q: -1, r: 0, terrain: 'volcano' },
  { q: -1, r: 1, terrain: 'tundra' },
  { q: 0, r: 1, terrain: 'glacier' },
  { q: 1, r: -1, terrain: 'ruins' },
  { q: 1, r: 1, terrain: 'goldmine' },
];

function fakeTile(q: number, r: number, terrain: TerrainType): HexTile {
  const coord = { q, r, s: -q - r };
  return {
    id: hexToId(coord),
    coord,
    terrain,
    elevation: terrain === 'volcano' || terrain === 'goldmine' ? 'highland' : 'lowland',
    climate: 'temperate',
    diceValue: terrain === 'lake' || terrain === 'glacier' ? null : 6,
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

/**
 * Open with `/?scene=h6` — advanced biome board using the live decoration pipeline.
 */
export function ReferenceSceneH6Page() {
  const tiles = useMemo(
    () => H6_LAYOUT.map(({ q, r, terrain }) => fakeTile(q, r, terrain)),
    [],
  );
  const worldPositions = useMemo(() => tiles.map((t) => cubeToWorld(t.coord)), [tiles]);
  const bounds = useMemo(() => computeWorldBounds(worldPositions, 1.5), [worldPositions]);

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
      <div style={overlay}>
        <div style={{ fontWeight: 700, marginBottom: 4 }}>H6 — Biomes avancés</div>
        <div>Jungle · Marais · Volcan · Toundra</div>
        <div>Glacier · Ruines · Mine d’or · Lac</div>
      </div>
      <Canvas
        dpr={[1, 2]}
        shadows
        camera={{ position: [0, 11, 9], fov: 42, near: 0.1, far: 80 }}
        gl={{ antialias: true }}
      >
        <Suspense fallback={null}>
          <MapLodContext.Provider value={1}>
            <AmbientAnimationProvider enabled speed={1}>
              <SceneEnvironment bounds={bounds} season="summer" />
              <WaterSurface bounds={bounds} season="summer" animate />
              <HexTerrain
                tiles={tiles}
                selectedTile={null}
                highlightedTiles={new Set()}
                hoveredTile={null}
                showGrid={false}
                interactionEnabled={false}
                onTileClick={() => undefined}
                onTileHover={() => undefined}
              />
              <BiomeDecorations tiles={tiles} mapSeed={606} animate season="summer" />
              <PerfStats3D mapRadius={2} />
              <OrbitControls
                makeDefault
                target={[0, 0, 0]}
                maxPolarAngle={Math.PI * 0.48}
                minDistance={6}
                maxDistance={22}
              />
            </AmbientAnimationProvider>
          </MapLodContext.Provider>
        </Suspense>
      </Canvas>
    </div>
  );
}

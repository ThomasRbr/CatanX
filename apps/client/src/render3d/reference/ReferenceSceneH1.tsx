import { Suspense, useMemo, useState, type CSSProperties } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, useGLTF } from '@react-three/drei';
import * as THREE from 'three';
import { H1_VISUAL_ASSETS, resolveVisualAssetUrl } from '../assets/visualAssetManifest';
import { usePremiumGlbGeometry } from '../assets/usePremiumGlb';
import { TERRAIN_BASE_COLORS, TERRAIN_SIDE_COLORS } from '../terrain/TerrainCatalog';
import { getColoredHexSlab } from '../terrain/coloredHexSlab';
import { HEX_SLAB_THICKNESS } from '../utils/createHexGeometry';
import { hexToWorld } from '../utils/hexToWorld';
import { PerfStats3D } from '../fx/PerfStats3D';

type RefTerrain = 'forest' | 'plains' | 'mountain' | 'pasture' | 'desert' | 'coast' | 'ocean';

interface DecorSpec {
  assetId: string;
  x: number;
  z: number;
  scale?: number;
  rot?: number;
  /** Multiplicative tint — prefer for banners only, not whole buildings. */
  tint?: string;
}

interface HexSpec {
  q: number;
  r: number;
  terrain: RefTerrain;
  decor: DecorSpec[];
}

/** Dense diorama recipes — no empty land tiles at normal zoom. */
const HEXES: HexSpec[] = [
  {
    q: 0,
    r: 0,
    terrain: 'forest',
    decor: [
      { assetId: 'tree_pine_a', x: -0.42, z: -0.28, scale: 1.15 },
      { assetId: 'tree_pine_b', x: 0.32, z: -0.38, scale: 1.25 },
      { assetId: 'tree_pine_a', x: 0.38, z: 0.18, scale: 0.95, rot: 0.7 },
      { assetId: 'tree_oak_a', x: -0.08, z: 0.36, scale: 1.05 },
      { assetId: 'tree_birch_a', x: -0.35, z: 0.12, scale: 0.9, rot: 1.1 },
      { assetId: 'bush_a', x: 0.12, z: -0.12, scale: 1.1 },
      { assetId: 'bush_b', x: -0.22, z: -0.42, scale: 0.95 },
      { assetId: 'rock_a', x: 0.45, z: -0.08, scale: 0.85 },
      { assetId: 'rock_c', x: -0.48, z: 0.32, scale: 0.7 },
      { assetId: 'crate_a', x: 0.18, z: 0.42, scale: 0.85 },
    ],
  },
  {
    q: 1,
    r: 0,
    terrain: 'plains',
    decor: [
      { assetId: 'grass_tuft_a', x: -0.38, z: -0.28, scale: 1.3 },
      { assetId: 'grass_tuft_a', x: -0.18, z: -0.08, scale: 1.1, rot: 0.5 },
      { assetId: 'grass_tuft_a', x: 0.28, z: 0.22, scale: 1.2 },
      { assetId: 'grass_tuft_a', x: 0.42, z: -0.18, scale: 1.0, rot: 1.2 },
      { assetId: 'fence_a', x: 0.05, z: -0.4, scale: 1.05, rot: 0.15 },
      { assetId: 'fence_a', x: -0.42, z: 0.05, scale: 0.9, rot: 1.4 },
      { assetId: 'well_a', x: -0.2, z: 0.28, scale: 1 },
      { assetId: 'crate_a', x: 0.38, z: 0.12, scale: 0.95 },
      { assetId: 'barrel_a', x: 0.32, z: 0.32, scale: 0.9 },
      { assetId: 'bush_a', x: 0.15, z: 0.4, scale: 0.85 },
    ],
  },
  {
    q: 0,
    r: -1,
    terrain: 'mountain',
    decor: [
      { assetId: 'mountain_peak_a', x: 0.02, z: -0.08, scale: 1.2 },
      { assetId: 'rock_b', x: -0.4, z: 0.28, scale: 1.15 },
      { assetId: 'rock_c', x: 0.4, z: 0.22, scale: 1.05 },
      { assetId: 'rock_a', x: -0.28, z: -0.32, scale: 0.9 },
      { assetId: 'rock_a', x: 0.35, z: -0.28, scale: 0.75, rot: 0.8 },
      { assetId: 'bush_a', x: -0.12, z: 0.42, scale: 0.7 },
    ],
  },
  {
    q: -1,
    r: 0,
    terrain: 'pasture',
    decor: [
      { assetId: 'bush_b', x: -0.32, z: -0.25, scale: 1.25 },
      { assetId: 'bush_a', x: 0.35, z: 0.08, scale: 1.1 },
      { assetId: 'bush_a', x: -0.1, z: -0.38, scale: 0.95, rot: 0.6 },
      { assetId: 'tree_birch_a', x: 0.08, z: 0.32, scale: 1.0 },
      { assetId: 'tree_birch_a', x: -0.4, z: 0.2, scale: 0.85, rot: 0.9 },
      { assetId: 'fence_a', x: -0.05, z: 0.42, scale: 1, rot: 1.15 },
      { assetId: 'fence_a', x: 0.4, z: -0.3, scale: 0.9, rot: 0.2 },
      { assetId: 'grass_tuft_a', x: 0.2, z: -0.15, scale: 1.15 },
      { assetId: 'grass_tuft_a', x: -0.25, z: 0.05, scale: 1.0 },
    ],
  },
  {
    q: -1,
    r: 1,
    terrain: 'desert',
    decor: [
      { assetId: 'dune_a', x: -0.28, z: -0.18, scale: 1.35, rot: 0.3 },
      { assetId: 'dune_a', x: 0.3, z: 0.22, scale: 1.1, rot: 1.4 },
      { assetId: 'dune_a', x: 0.05, z: -0.35, scale: 0.85, rot: 2.1 },
      { assetId: 'rock_a', x: 0.15, z: -0.05, scale: 0.8 },
      { assetId: 'rock_c', x: -0.4, z: 0.3, scale: 0.7 },
      { assetId: 'barrel_a', x: 0.38, z: -0.28, scale: 0.75 },
    ],
  },
  {
    q: 0,
    r: 1,
    terrain: 'coast',
    decor: [
      { assetId: 'dock_a', x: 0.02, z: 0.42, scale: 1.05, rot: Math.PI },
      { assetId: 'barrel_a', x: -0.28, z: 0.18, scale: 1 },
      { assetId: 'barrel_a', x: -0.38, z: 0.28, scale: 0.85, rot: 0.5 },
      { assetId: 'crate_a', x: 0.28, z: 0.22, scale: 0.95 },
      { assetId: 'rock_c', x: 0.4, z: -0.22, scale: 0.9 },
      { assetId: 'rock_a', x: -0.4, z: -0.25, scale: 0.75 },
      { assetId: 'bush_a', x: 0.12, z: -0.35, scale: 0.8 },
    ],
  },
  {
    q: 1,
    r: -1,
    terrain: 'ocean',
    decor: [
      { assetId: 'rock_a', x: -0.25, z: 0.15, scale: 0.55 },
      { assetId: 'rock_c', x: 0.3, z: -0.2, scale: 0.45, rot: 0.8 },
    ],
  },
];

const PLAYER_ACCENT = '#c45a48';

function HexSlab({ q, r, terrain }: { q: number; r: number; terrain: RefTerrain }) {
  const pos = hexToWorld(q, r);
  // Slight oversize hides hairline gaps between neighboring slabs.
  const geo = useMemo(
    () =>
      getColoredHexSlab(
        TERRAIN_BASE_COLORS[terrain],
        TERRAIN_SIDE_COLORS[terrain],
        1.012,
        HEX_SLAB_THICKNESS,
        terrain,
      ),
    [terrain],
  );
  return (
    <mesh
      geometry={geo}
      position={[pos.x, 0, pos.z]}
      receiveShadow
      castShadow={terrain !== 'ocean'}
      raycast={() => undefined}
    >
      <meshStandardMaterial
        vertexColors
        roughness={terrain === 'ocean' ? 0.5 : 0.9}
        metalness={terrain === 'ocean' ? 0.15 : 0.03}
        flatShading
      />
    </mesh>
  );
}

function GlbProp({
  assetId,
  x,
  y,
  z,
  scale = 1,
  rot = 0,
  tint,
}: {
  assetId: string;
  x: number;
  y: number;
  z: number;
  scale?: number;
  rot?: number;
  tint?: string;
}) {
  const geo = usePremiumGlbGeometry(assetId);
  return (
    <mesh
      geometry={geo}
      position={[x, y, z]}
      rotation={[0, rot, 0]}
      scale={[scale, scale, scale]}
      castShadow
      receiveShadow
      raycast={() => undefined}
    >
      <meshStandardMaterial
        color={tint ?? '#ffffff'}
        vertexColors
        roughness={0.86}
        metalness={0.04}
        flatShading
      />
    </mesh>
  );
}

/** Road mesh is elongated on local +X — align that axis with the edge direction. */
function roadYaw(ax: number, az: number, bx: number, bz: number): number {
  return Math.atan2(az - bz, bx - ax);
}

function WaterBed() {
  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.22, 0]} receiveShadow>
        <circleGeometry args={[11, 64]} />
        <meshStandardMaterial color="#2f5a70" roughness={0.78} metalness={0.06} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.19, 0]} receiveShadow>
        <circleGeometry args={[7.2, 48]} />
        <meshStandardMaterial color="#3f7388" roughness={0.72} metalness={0.08} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.165, 0]} receiveShadow>
        <circleGeometry args={[4.8, 40]} />
        <meshStandardMaterial
          color="#5a91a4"
          roughness={0.62}
          metalness={0.1}
          transparent
          opacity={0.92}
        />
      </mesh>
    </group>
  );
}

function ReferenceContent({ cinematic }: { cinematic: boolean }) {
  const center = hexToWorld(0, 0);
  const plains = hexToWorld(1, 0);
  const forest = hexToWorld(0, 0);

  return (
    <>
      <color attach="background" args={[cinematic ? '#b9cfc4' : '#c8d8ce']} />
      <fog attach="fog" args={[cinematic ? '#b9cfc4' : '#c8d8ce', 12, 24]} />
      <hemisphereLight args={['#fff6e8', '#6a7e72', 0.5]} />
      <ambientLight intensity={0.34} />
      <directionalLight
        castShadow
        intensity={1.2}
        color="#ffe6c4"
        position={[-9, 15, -6]}
        shadow-mapSize-width={2048}
        shadow-mapSize-height={2048}
        shadow-camera-near={1}
        shadow-camera-far={40}
        shadow-camera-left={-8}
        shadow-camera-right={8}
        shadow-camera-top={8}
        shadow-camera-bottom={-8}
        shadow-bias={-0.00035}
        shadow-normalBias={0.055}
      />
      <directionalLight intensity={0.35} color="#a8c4d8" position={[8, 6, 4]} />

      <WaterBed />

      <group>
        {HEXES.map((hex) => (
          <HexSlab key={`${hex.q},${hex.r}`} q={hex.q} r={hex.r} terrain={hex.terrain} />
        ))}

        {HEXES.flatMap((hex) => {
          const origin = hexToWorld(hex.q, hex.r);
          return hex.decor.map((d, i) => (
            <GlbProp
              key={`${hex.q},${hex.r}-${d.assetId}-${i}`}
              assetId={d.assetId}
              x={origin.x + d.x}
              y={HEX_SLAB_THICKNESS}
              z={origin.z + d.z}
              scale={d.scale}
              rot={d.rot}
              tint={d.tint}
            />
          ));
        })}

        {/* Road forest → plains (long axis = local X) */}
        <GlbProp
          assetId="road_segment_a"
          x={(forest.x + plains.x) / 2}
          y={HEX_SLAB_THICKNESS + 0.002}
          z={(forest.z + plains.z) / 2}
          rot={roadYaw(forest.x, forest.z, plains.x, plains.z)}
          scale={1.08}
        />

        {/* Settlement cluster — keep house materials, tint only the banner */}
        <GlbProp
          assetId="house_settlement_a"
          x={plains.x - 0.08}
          y={HEX_SLAB_THICKNESS}
          z={plains.z + 0.02}
          scale={1.08}
        />
        <GlbProp
          assetId="house_settlement_b"
          x={plains.x + 0.22}
          y={HEX_SLAB_THICKNESS}
          z={plains.z - 0.18}
          scale={0.92}
          rot={-0.35}
        />
        <GlbProp
          assetId="banner_a"
          x={plains.x + 0.05}
          y={HEX_SLAB_THICKNESS}
          z={plains.z - 0.28}
          scale={1.05}
          tint={PLAYER_ACCENT}
        />

        {!cinematic && (
          <GlbProp
            assetId="token_disc_a"
            x={center.x + 0.08}
            y={HEX_SLAB_THICKNESS + 0.18}
            z={center.z - 0.05}
            scale={0.95}
          />
        )}
      </group>

      <OrbitControls
        makeDefault
        enablePan
        enableRotate
        enableZoom
        minZoom={55}
        maxZoom={160}
        maxPolarAngle={Math.PI / 2.15}
        target={[0.2, 0.15, 0]}
      />
      <PerfStats3D mapRadius={1} />
    </>
  );
}

function preloadH1() {
  for (const asset of H1_VISUAL_ASSETS) {
    useGLTF.preload(asset.url);
  }
}

preloadH1();

const hudButtonStyle = (active: boolean): CSSProperties => ({
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
 * H1 art-direction reference: 7 hexes + Blender GLBs via useGLTF.
 * Open with `?scene=h1` (add `&view=cinematic` to hide token).
 */
export function ReferenceSceneH1Page() {
  const initialCinematic =
    typeof window !== 'undefined' &&
    new URLSearchParams(window.location.search).get('view') === 'cinematic';
  const [mode, setMode] = useState<'normal' | 'cinematic'>(
    initialCinematic ? 'cinematic' : 'normal',
  );
  const [ready, setReady] = useState(false);

  const missing = useMemo(
    () => H1_VISUAL_ASSETS.filter((a) => !resolveVisualAssetUrl(a.id)).map((a) => a.id),
    [],
  );

  const applyMode = (next: 'normal' | 'cinematic') => {
    setMode(next);
    const url = new URL(window.location.href);
    if (next === 'cinematic') url.searchParams.set('view', 'cinematic');
    else url.searchParams.delete('view');
    window.history.replaceState({}, '', url);
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: '#1a221c',
        color: '#e8efe6',
        fontFamily: 'Georgia, "Times New Roman", serif',
      }}
    >
      {mode === 'normal' && (
        <div
          style={{
            position: 'absolute',
            zIndex: 2,
            left: 12,
            top: 12,
            display: 'flex',
            gap: 10,
            alignItems: 'center',
            flexWrap: 'wrap',
            padding: '10px 14px',
            background: 'rgba(24, 32, 26, 0.88)',
            border: '1px solid rgba(200, 220, 200, 0.18)',
            borderRadius: 8,
            backdropFilter: 'blur(6px)',
            maxWidth: 'calc(100% - 24px)',
          }}
        >
          <strong style={{ letterSpacing: '0.03em', color: '#f2f6ef' }}>
            CatanX H1 — scène étalon
          </strong>
          <button type="button" onClick={() => applyMode('normal')} style={hudButtonStyle(true)}>
            Vue normale
          </button>
          <button type="button" onClick={() => applyMode('cinematic')} style={hudButtonStyle(false)}>
            Vue cinématique
          </button>
          <span style={{ opacity: 0.75, fontSize: 12, color: '#c5d4c4' }}>
            {H1_VISUAL_ASSETS.length} GLB · useGLTF
            {!ready ? ' · chargement…' : ''}
            {missing.length ? ` · missing ${missing.length}` : ''}
            {' · orbit / molette'}
          </span>
        </div>
      )}
      {mode === 'cinematic' && (
        <button
          type="button"
          onClick={() => applyMode('normal')}
          style={{
            ...hudButtonStyle(false),
            position: 'absolute',
            zIndex: 2,
            right: 14,
            top: 14,
            opacity: 0.85,
          }}
        >
          Quitter cinématique
        </button>
      )}

      <Canvas
        key={mode}
        orthographic
        shadows
        dpr={[1, 1.75]}
        gl={{ antialias: true, powerPreference: 'high-performance', alpha: false }}
        camera={{
          position: [7.5, 10.5, 7.5],
          zoom: mode === 'cinematic' ? 112 : 96,
          near: 0.1,
          far: 120,
        }}
        onCreated={({ gl, camera }) => {
          gl.toneMapping = THREE.ACESFilmicToneMapping;
          gl.toneMappingExposure = 1.05;
          gl.outputColorSpace = THREE.SRGBColorSpace;
          gl.shadowMap.enabled = true;
          gl.shadowMap.type = THREE.PCFSoftShadowMap;
          camera.lookAt(0.2, 0.1, 0);
          setReady(true);
        }}
        style={{ position: 'absolute', inset: 0 }}
      >
        <Suspense fallback={null}>
          <ReferenceContent cinematic={mode === 'cinematic'} />
        </Suspense>
      </Canvas>
    </div>
  );
}

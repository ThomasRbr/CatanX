import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import type { GameState, CatanTopology, RoadSegment } from '@catanx/engine';
import type { InitialPlacementState } from '../../store/gameStore';
import { useVisualGeometry } from '../assets/usePremiumGlb';
import { playerColor } from '../utils/playerColors';
import {
  distanceXZ,
  geometryLengthX,
  midpointWorld,
  yawAlignLocalX,
  yawBetween,
} from '../utils/topologyToWorld';
import { resolveRoadsForRender, roadYForType } from '../utils/resolveRoads';
import { useAmbientAnimation } from '../fx/AmbientAnimationContext';
import { getClimateVisualPreset } from '../utils/seasonVisuals';
import { useSurfaceHeight } from '../terrain/SurfaceHeightContext';
import type { SurfaceHeightSampler } from '../terrain/BoardHeightfield';
import { useRenderQuality } from '../quality/RenderQualityContext';
import { loadAuthoredTexture } from '../terrain/authoredPbrTextures';
import type { TextureSet } from '../terrain/BiomeMaterialRegistry';

interface Roads3DProps {
  gameState: GameState;
  topology: CatanTopology;
  initialPlacement?: InitialPlacementState | null;
  climateId?: string | null;
}

/** How much of the edge length the road mesh should cover (leave tiny gaps at vertices). */
const ROAD_EDGE_FILL = 0.9;

function roadTexture(channel: 'albedo' | 'normal' | 'roughness' | 'height' | 'ao'): TextureSet {
  // Downscaled set — see tools/build_prop_textures.py. A road is a few pixels
  // wide on screen; the full-size maps were pure upload cost.
  const size = channel === 'roughness' || channel === 'ao' || channel === 'height' ? 256 : 512;
  const source = `/assets/textures/roads/photoreal/rutted_dirt_road_${channel}_v3_s${size}.webp`;
  return {
    sources: { '512': source, '1k': source, '2k': source, '4k': source },
    colorSpace: channel === 'albedo' ? 'srgb' : 'linear',
  };
}

function naturalRoadGeometry(
  ax: number,
  az: number,
  bx: number,
  bz: number,
  surface: SurfaceHeightSampler,
  width: number,
  lateralOffset = 0,
  yLift = 0,
  /** Negative = carved into the heightfield (ruts / sunk bed). */
  carveDepth = 0,
): THREE.BufferGeometry {
  const steps = 26;
  const dx = bx - ax;
  const dz = bz - az;
  const length = Math.max(0.001, Math.hypot(dx, dz));
  const sideX = -dz / length;
  const sideZ = dx / length;
  const phase = (Math.sin((ax + bx) * 12.9898 + (az + bz) * 78.233) * 43758.5453) % 1;
  const bend = Math.min(0.055, length * 0.075) * (phase >= 0 ? 1 : -1);
  const point = (t: number) => {
    const meander = Math.sin(Math.PI * t) * bend + Math.sin(Math.PI * 2 * t + phase * 3) * 0.007;
    return {
      x: THREE.MathUtils.lerp(ax, bx, t) + sideX * meander,
      z: THREE.MathUtils.lerp(az, bz, t) + sideZ * meander,
    };
  };
  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  for (let index = 0; index <= steps; index++) {
    const t = index / steps;
    const current = point(t);
    const previous = point(Math.max(0, t - 1 / steps));
    const next = point(Math.min(1, t + 1 / steps));
    const tangentX = next.x - previous.x;
    const tangentZ = next.z - previous.z;
    const tangentLength = Math.max(0.001, Math.hypot(tangentX, tangentZ));
    const perpendicularX = -tangentZ / tangentLength;
    const perpendicularZ = tangentX / tangentLength;
    const irregularWidth = width * (0.94 + Math.sin(t * 17 + phase * 8) * 0.045);
    const centerX = current.x + perpendicularX * lateralOffset;
    const centerZ = current.z + perpendicularZ * lateralOffset;
    const leftX = centerX + perpendicularX * irregularWidth * 0.5;
    const leftZ = centerZ + perpendicularZ * irregularWidth * 0.5;
    const rightX = centerX - perpendicularX * irregularWidth * 0.5;
    const rightZ = centerZ - perpendicularZ * irregularWidth * 0.5;
    // Carve: centre of the bed sits deeper than the berms so the road reads
    // as worn into the land instead of a ribbon resting on top.
    const rutPulse = 0.55 + 0.45 * Math.sin(t * Math.PI * 3 + phase * 5);
    const centreCarve = carveDepth * (0.85 + rutPulse * 0.35);
    const edgeCarve = carveDepth * 0.35;
    const leftY = surface.sampleHeight(leftX, leftZ) + yLift - edgeCarve;
    const rightY = surface.sampleHeight(rightX, rightZ) + yLift - edgeCarve;
    // Slight crown inverted: mid-span samples use extra carve via yLift callers.
    void centreCarve;
    const leftNormal = surface.sampleNormal(leftX, leftZ);
    const rightNormal = surface.sampleNormal(rightX, rightZ);
    positions.push(
      leftX, leftY, leftZ,
      rightX, rightY, rightZ,
    );
    normals.push(
      leftNormal.x, leftNormal.y, leftNormal.z,
      rightNormal.x, rightNormal.y, rightNormal.z,
    );
    uvs.push(0, t * 3.2, 1, t * 3.2);
    if (index > 0) {
      const base = (index - 1) * 2;
      indices.push(base, base + 1, base + 2, base + 1, base + 3, base + 2);
    }
  }
  // Rebuild with a 3-rail cross-section (left berm / rutted bed / right berm)
  // when carving is requested so the depression is visible from above.
  if (carveDepth > 0.001) {
    positions.length = 0;
    normals.length = 0;
    uvs.length = 0;
    indices.length = 0;
    for (let index = 0; index <= steps; index++) {
      const t = index / steps;
      const current = point(t);
      const previous = point(Math.max(0, t - 1 / steps));
      const next = point(Math.min(1, t + 1 / steps));
      const tangentX = next.x - previous.x;
      const tangentZ = next.z - previous.z;
      const tangentLength = Math.max(0.001, Math.hypot(tangentX, tangentZ));
      const perpendicularX = -tangentZ / tangentLength;
      const perpendicularZ = tangentX / tangentLength;
      const irregularWidth = width * (0.94 + Math.sin(t * 17 + phase * 8) * 0.045);
      const centerX = current.x + perpendicularX * lateralOffset;
      const centerZ = current.z + perpendicularZ * lateralOffset;
      const half = irregularWidth * 0.5;
      const leftX = centerX + perpendicularX * half;
      const leftZ = centerZ + perpendicularZ * half;
      const midLeftX = centerX + perpendicularX * half * 0.35;
      const midLeftZ = centerZ + perpendicularZ * half * 0.35;
      const midRightX = centerX - perpendicularX * half * 0.35;
      const midRightZ = centerZ - perpendicularZ * half * 0.35;
      const rightX = centerX - perpendicularX * half;
      const rightZ = centerZ - perpendicularZ * half;
      const rutPulse = 0.7 + 0.3 * Math.sin(t * Math.PI * 4 + phase * 6);
      const bedCarve = carveDepth * (1.05 + rutPulse * 0.4);
      const bermCarve = carveDepth * 0.28;
      const samples = [
        { x: leftX, z: leftZ, carve: bermCarve, u: 0 },
        { x: midLeftX, z: midLeftZ, carve: bedCarve, u: 0.28 },
        { x: midRightX, z: midRightZ, carve: bedCarve * 0.96, u: 0.72 },
        { x: rightX, z: rightZ, carve: bermCarve, u: 1 },
      ];
      for (const sample of samples) {
        const y = surface.sampleHeight(sample.x, sample.z) + yLift - sample.carve;
        const normal = surface.sampleNormal(sample.x, sample.z);
        positions.push(sample.x, y, sample.z);
        normals.push(normal.x, normal.y, normal.z);
        uvs.push(sample.u, t * 3.2);
      }
      if (index > 0) {
        const a = (index - 1) * 4;
        const b = index * 4;
        for (let col = 0; col < 3; col++) {
          indices.push(a + col, a + col + 1, b + col + 1, a + col, b + col + 1, b + col);
        }
      }
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

function NaturalRoadMesh({
  ax,
  az,
  bx,
  bz,
  color,
}: {
  ax: number;
  az: number;
  bx: number;
  bz: number;
  color: string;
}) {
  const surface = useSurfaceHeight();
  const quality = useRenderQuality();
  // Dirt roads are the path the game actually uses; the paved and procedural
  // variants below are for later road levels. Widths were tuned when the board
  // was nearly flat and the heightfield carved a groove under every road. With
  // the groove gone and the relief three times taller, the same numbers read as
  // a raised causeway rather than a cart track.
  const road = useMemo(
    () => naturalRoadGeometry(ax, az, bx, bz, surface, 0.105, 0, 0.002, 0.014),
    [ax, az, bx, bz, surface],
  );
  const shoulder = useMemo(
    () => naturalRoadGeometry(ax, az, bx, bz, surface, 0.20, 0, -0.001, 0.005),
    [ax, az, bx, bz, surface],
  );
  const leftRut = useMemo(
    () => naturalRoadGeometry(ax, az, bx, bz, surface, 0.022, -0.026, 0.001, 0.012),
    [ax, az, bx, bz, surface],
  );
  const rightRut = useMemo(
    () => naturalRoadGeometry(ax, az, bx, bz, surface, 0.022, 0.026, 0.001, 0.012),
    [ax, az, bx, bz, surface],
  );
  const leftMarker = useMemo(
    () => naturalRoadGeometry(ax, az, bx, bz, surface, 0.0032, -0.058, 0.004, 0.010),
    [ax, az, bx, bz, surface],
  );
  const rightMarker = useMemo(
    () => naturalRoadGeometry(ax, az, bx, bz, surface, 0.0032, 0.058, 0.004, 0.010),
    [ax, az, bx, bz, surface],
  );
  const albedo = loadAuthoredTexture(roadTexture('albedo'), quality.textureTier);
  const normal = loadAuthoredTexture(roadTexture('normal'), quality.textureTier);
  const roughness = loadAuthoredTexture(roadTexture('roughness'), quality.textureTier);
  const height = loadAuthoredTexture(roadTexture('height'), quality.textureTier);
  const ao = loadAuthoredTexture(roadTexture('ao'), quality.textureTier);

  useEffect(() => {
    for (const geometry of [road, shoulder, leftRut, rightRut]) {
      if (!geometry.getAttribute('uv2') && geometry.getAttribute('uv')) {
        geometry.setAttribute('uv2', geometry.getAttribute('uv'));
      }
    }
  }, [leftRut, rightRut, road, shoulder]);

  useEffect(() => () => {
    road.dispose();
    shoulder.dispose();
    leftRut.dispose();
    rightRut.dispose();
    leftMarker.dispose();
    rightMarker.dispose();
  }, [leftMarker, leftRut, rightMarker, rightRut, road, shoulder]);

  return (
    <group renderOrder={4}>
      <mesh geometry={shoulder} receiveShadow raycast={() => undefined} renderOrder={3}>
        <meshPhysicalMaterial
          map={albedo}
          normalMap={normal}
          normalScale={new THREE.Vector2(0.32, 0.32)}
          roughnessMap={roughness}
          aoMap={ao}
          aoMapIntensity={0.55}
          bumpMap={height}
          bumpScale={0.018}
          color="#9a8168"
          transparent
          opacity={0.4}
          depthWrite={false}
          roughness={0.98}
          metalness={0}
          polygonOffset
          polygonOffsetFactor={-1}
        />
      </mesh>
      <mesh geometry={road} receiveShadow raycast={() => undefined} renderOrder={4}>
        <meshPhysicalMaterial
          map={albedo}
          normalMap={normal}
          normalScale={new THREE.Vector2(0.58, 0.58)}
          roughnessMap={roughness}
          aoMap={ao}
          aoMapIntensity={0.72}
          bumpMap={height}
          bumpScale={0.042}
          color="#8a6e52"
          emissive="#6b543c"
          emissiveIntensity={0.08}
          roughness={0.97}
          metalness={0.004}
          clearcoat={0.015}
          clearcoatRoughness={0.92}
          polygonOffset
          polygonOffsetFactor={-2}
        />
      </mesh>
      {[leftRut, rightRut].map((geometry, index) => (
        <mesh key={`rut-${index}`} geometry={geometry} receiveShadow raycast={() => undefined} renderOrder={4}>
          <meshPhysicalMaterial
            map={albedo}
            normalMap={normal}
            normalScale={new THREE.Vector2(0.7, 0.7)}
            roughnessMap={roughness}
            aoMap={ao}
            aoMapIntensity={0.85}
            bumpMap={height}
            bumpScale={0.05}
            color="#5a4534"
            transparent
            opacity={0.72}
            depthWrite={false}
            roughness={1}
            metalness={0}
            polygonOffset
            polygonOffsetFactor={-3}
          />
        </mesh>
      ))}
      {[leftMarker, rightMarker].map((geometry, index) => (
        <mesh key={index} geometry={geometry} raycast={() => undefined} renderOrder={5}>
          <meshStandardMaterial
            color={color}
            emissive={color}
            emissiveIntensity={0.01}
            roughness={0.78}
            metalness={0.02}
            transparent
            opacity={0.55}
          />
        </mesh>
      ))}
    </group>
  );
}

function ProceduralRoadMesh({
  ax,
  az,
  bx,
  bz,
  color,
  type = 'road',
}: {
  ax: number;
  az: number;
  bx: number;
  bz: number;
  color: string;
  type?: RoadSegment['type'];
}) {
  const revealRef = useRef<THREE.Group>(null);
  const revealStart = useRef<number | null>(null);
  const revealDone = useRef(false);
  const ambient = useAmbientAnimation();
  const y = roadYForType(type);
  const a = { x: ax, y, z: az };
  const b = { x: bx, y, z: bz };
  const mid = midpointWorld(a, b, y);
  const len = Math.max(0.08, distanceXZ(a, b) * ROAD_EDGE_FILL);
  const yaw = yawBetween(a, b);

  // Narrower than a cart track looks on a map: the ribbon has to trace the
  // edge, not become the edge.
  const width = type === 'bridge' ? 0.10 : type === 'canal' || type === 'aqueduct' ? 0.13 : 0.12;
  const height = type === 'bridge' ? 0.09 : 0.072;
  const bed = type === 'canal' ? '#365f73' : type === 'aqueduct' ? '#8f897c' : '#706047';
  const top = type === 'canal' ? '#5b91a7' : type === 'aqueduct' ? '#aaa393' : '#a18d6b';

  useFrame(() => {
    const group = revealRef.current;
    if (!group || revealDone.current) return;
    if (!ambient.enabled) {
      group.scale.z = 1;
      revealDone.current = true;
      return;
    }
    const now = performance.now();
    revealStart.current ??= now;
    const t = Math.min(1, (now - revealStart.current) / 460);
    group.scale.z = 0.08 + (1 - Math.pow(1 - t, 3)) * 0.92;
    if (t >= 1) revealDone.current = true;
  });

  return (
    <group ref={revealRef} position={[mid.x, mid.y, mid.z]} rotation={[0, yaw, 0]} renderOrder={4}>
      <mesh position={[0, -0.014, 0]} receiveShadow raycast={() => undefined} renderOrder={4}>
        <boxGeometry args={[width * 1.48, height * 0.42, len]} />
        <meshStandardMaterial
          color={bed}
          roughness={0.95}
          metalness={0.02}
          flatShading={false}
          polygonOffset
          polygonOffsetFactor={-2}
          polygonOffsetUnits={-2}
        />
      </mesh>
      {[-1, 1].map((side) => (
        <mesh
          key={side}
          position={[side * width * 0.58, 0.024, 0]}
          raycast={() => undefined}
          renderOrder={5}
        >
          <boxGeometry args={[0.018, 0.028, len]} />
          <meshStandardMaterial
            color={color}
            emissive={color}
            emissiveIntensity={0.12}
            roughness={0.5}
            metalness={0.08}
          />
        </mesh>
      ))}
      {type === 'bridge' ? (
        <>
          <mesh
            position={[-width * 0.55, 0.02, 0]}
            castShadow
            raycast={() => undefined}
            renderOrder={4}
          >
            <boxGeometry args={[width * 0.35, height, len]} />
            <meshStandardMaterial
              color={top}
              emissive="#000000"
              emissiveIntensity={0}
              roughness={0.78}
              metalness={0.05}
              flatShading={false}
              polygonOffset
              polygonOffsetFactor={-2}
              polygonOffsetUnits={-2}
            />
          </mesh>
          <mesh
            position={[width * 0.55, 0.02, 0]}
            castShadow
            raycast={() => undefined}
            renderOrder={4}
          >
            <boxGeometry args={[width * 0.35, height, len]} />
            <meshStandardMaterial
              color={top}
              emissive="#000000"
              emissiveIntensity={0}
              roughness={0.78}
              metalness={0.05}
              flatShading={false}
              polygonOffset
              polygonOffsetFactor={-2}
              polygonOffsetUnits={-2}
            />
          </mesh>
        </>
      ) : (
        <mesh castShadow receiveShadow raycast={() => undefined} renderOrder={4}>
          <boxGeometry args={[width, height, len]} />
          <meshStandardMaterial
            color={top}
            emissive={type === 'canal' ? '#173d4e' : '#000000'}
            emissiveIntensity={type === 'canal' ? 0.08 : 0}
            roughness={0.85}
            metalness={0.05}
            flatShading={false}
            polygonOffset
            polygonOffsetFactor={-2}
            polygonOffsetUnits={-2}
          />
        </mesh>
      )}
    </group>
  );
}

function StretchRoadMesh({
  ax,
  az,
  bx,
  bz,
  color,
  geo,
  roadType,
  paved,
}: {
  ax: number;
  az: number;
  bx: number;
  bz: number;
  color: string;
  geo: THREE.BufferGeometry;
  roadType: RoadSegment['type'];
  paved: boolean;
}) {
  const revealRef = useRef<THREE.Group>(null);
  const revealStart = useRef<number | null>(null);
  const revealDone = useRef(false);
  const ambient = useAmbientAnimation();
  const y = roadYForType(roadType);
  const a = { x: ax, y, z: az };
  const b = { x: bx, y, z: bz };
  const mid = midpointWorld(a, b, y);
  const edgeLen = distanceXZ(a, b);
  const len = Math.max(0.08, edgeLen * ROAD_EDGE_FILL);
  const yaw = yawAlignLocalX(ax, az, bx, bz);
  const native = geometryLengthX(geo);
  const sx = len / native;
  const roadWidth = roadType === 'bridge' ? 0.27 : paved ? 0.245 : 0.225;

  useFrame(() => {
    const group = revealRef.current;
    if (!group || revealDone.current) return;
    if (!ambient.enabled) {
      group.scale.x = 1;
      revealDone.current = true;
      return;
    }
    const now = performance.now();
    revealStart.current ??= now;
    const t = Math.min(1, (now - revealStart.current) / 460);
    group.scale.x = 0.08 + (1 - Math.pow(1 - t, 3)) * 0.92;
    if (t >= 1) revealDone.current = true;
  });

  return (
    <group ref={revealRef} position={[mid.x, mid.y, mid.z]} rotation={[0, yaw, 0]} renderOrder={4}>
      <mesh position={[0, 0.003, 0]} receiveShadow raycast={() => undefined} renderOrder={3}>
        <boxGeometry args={[len, 0.018, roadWidth + 0.045]} />
        <meshStandardMaterial
          color="#665741"
          roughness={0.96}
          metalness={0.02}
          polygonOffset
          polygonOffsetFactor={-1}
          polygonOffsetUnits={-1}
        />
      </mesh>
      {[-1, 1].map((side) => (
        <mesh
          key={side}
          position={[0, 0.022, side * roadWidth * 0.53]}
          raycast={() => undefined}
          renderOrder={5}
        >
          <boxGeometry args={[len, 0.027, 0.018]} />
          <meshStandardMaterial
            color={color}
            emissive={color}
            emissiveIntensity={0.14}
            roughness={0.38}
            metalness={0.14}
          />
        </mesh>
      ))}
      <mesh
        geometry={geo}
        scale={[sx, paved ? 0.9 : roadType === 'bridge' ? 0.98 : 0.86, paved ? 1.42 : 1.34]}
        castShadow
        receiveShadow
        raycast={() => undefined}
        renderOrder={4}
      >
        <meshPhysicalMaterial
          // Natural road material; ownership remains on the two enamel edge markers.
          color={roadType === 'bridge' ? '#9a8061' : paved ? '#aaa79f' : '#9b8568'}
          emissive="#000000"
          emissiveIntensity={0}
          vertexColors
          roughness={paved ? 0.48 : roadType === 'bridge' ? 0.72 : 0.56}
          metalness={paved ? 0.12 : 0.06}
          clearcoat={roadType === 'bridge' ? 0.08 : paved ? 0.12 : 0.04}
          clearcoatRoughness={0.62}
          flatShading={false}
          polygonOffset
          polygonOffsetFactor={-2}
          polygonOffsetUnits={-2}
        />
      </mesh>
    </group>
  );
}

function RoadWeatherOverlay({
  ax,
  az,
  bx,
  bz,
  color,
  opacity,
  roadType,
}: {
  ax: number;
  az: number;
  bx: number;
  bz: number;
  color: string;
  opacity: number;
  roadType: RoadSegment['type'];
}) {
  const y = roadYForType(roadType) + 0.072;
  const a = { x: ax, y, z: az };
  const b = { x: bx, y, z: bz };
  const mid = midpointWorld(a, b, y);
  const len = Math.max(0.08, distanceXZ(a, b) * 0.91);
  const yaw = yawBetween(a, b);
  return (
    <mesh
      position={[mid.x, mid.y, mid.z]}
      rotation={[0, yaw, 0]}
      raycast={() => undefined}
      renderOrder={7}
    >
      <boxGeometry args={[roadType === 'bridge' ? 0.18 : 0.13, 0.012, len]} />
      <meshStandardMaterial
        color={color}
        transparent
        opacity={opacity}
        roughness={0.98}
        metalness={0}
        depthWrite={false}
        polygonOffset
        polygonOffsetFactor={-4}
        polygonOffsetUnits={-4}
      />
    </mesh>
  );
}

/**
 * Classic roads on topology edges — dirt / paved / coastal bridges (H5).
 */
export function Roads3D({ gameState, topology, initialPlacement, climateId = null }: Roads3DProps) {
  const pavedGeo = useVisualGeometry('road_paved_a');
  const bridgeGeo = useVisualGeometry('bridge_wood_a');
  const roads = useMemo(
    () => resolveRoadsForRender(gameState, topology, initialPlacement),
    [gameState, topology, initialPlacement],
  );
  const climateVisual = getClimateVisualPreset(climateId);

  return (
    <group>
      {roads.map((r) => {
        const player = gameState.players.get(r.ownerId);
        const color = playerColor(player?.color);
        if (r.type === 'bridge') {
          return (
            <StretchRoadMesh
              key={r.key}
              ax={r.ax}
              az={r.az}
              bx={r.bx}
              bz={r.bz}
              color={color}
              geo={bridgeGeo}
              roadType="bridge"
              paved={false}
            />
          );
        }
        if (r.type === 'road') {
          const paved = r.surface === 'paved';
          if (!paved) {
            return (
              <NaturalRoadMesh
                key={r.key}
                ax={r.ax}
                az={r.az}
                bx={r.bx}
                bz={r.bz}
                color={color}
              />
            );
          }
          return (
            <StretchRoadMesh
              key={r.key}
              ax={r.ax}
              az={r.az}
              bx={r.bx}
              bz={r.bz}
              color={color}
              geo={pavedGeo}
              roadType="road"
              paved={paved}
            />
          );
        }
        return (
          <ProceduralRoadMesh
            key={r.key}
            ax={r.ax}
            az={r.az}
            bx={r.bx}
            bz={r.bz}
            color={color}
            type={r.type}
          />
        );
      })}
      {climateVisual &&
        climateVisual.roadOverlayOpacity > 0 &&
        roads
          .filter((road) => road.type === 'road' || road.type === 'bridge')
          .map((road) => (
            <RoadWeatherOverlay
              key={`weather-${road.key}`}
              ax={road.ax}
              az={road.az}
              bx={road.bx}
              bz={road.bz}
              color={climateVisual.roadOverlayColor}
              opacity={climateVisual.roadOverlayOpacity}
              roadType={road.type}
            />
          ))}
    </group>
  );
}

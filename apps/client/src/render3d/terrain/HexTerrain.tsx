import { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import type { HexTile, TerrainType } from '@catanx/engine';
import { hexNeighbor, hexToId } from '@catanx/engine';
import { ThreeEvent, useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import {
  createHexRingGeometry,
  createHexSlabGeometry,
  HEX_SLAB_THICKNESS,
} from '../utils/createHexGeometry';
import { cubeToWorld, HEX_WORLD_RADIUS } from '../utils/hexToWorld';
import { isWaterTerrain } from '../decorations/deterministicDecoration';
import { hashString } from '../utils/seededVisualRandom';
import { useMapLod } from '../camera/MapLodContext';
import { useAmbientAnimation } from '../fx/AmbientAnimationContext';
import { attachWaterWaveShader, setWaterWaveTime } from '../fx/waterWaveMaterial';
import { shouldAnimateDecor } from '../utils/mapLod';
import { TERRAIN_BASE_COLORS, TERRAIN_SIDE_COLORS } from './TerrainCatalog';
import { getColoredHexSlab } from './coloredHexSlab';
import { getClimateVisualPreset, mixHex } from '../utils/seasonVisuals';
import { getBiomeMaterialDefinition } from './BiomeMaterialRegistry';
import { getProceduralPbrTextures } from './proceduralPbrTextures';
import { getAuthoredBiomeTextures } from './authoredPbrTextures';
import { useRenderQuality } from '../quality/RenderQualityContext';
import { attachWorldProjectedPbr } from './worldProjectedPbr';
import { ContinuousTerrainSurface } from './ContinuousTerrainSurface';

interface HexTerrainProps {
  tiles: HexTile[];
  selectedTile: string | null;
  highlightedTiles: ReadonlySet<string>;
  hoveredTile: string | null;
  showGrid: boolean;
  climateId?: string | null;
  season?: string;
  interactionEnabled?: boolean;
  onTileClick: (tileId: string) => void;
  onTileHover: (tileId: string | null) => void;
  softBiomeTransitions?: boolean;
  /** Flat outline rings; the relief board draws draped ones instead. */
  flatEmphasis?: boolean;
}

function seasonalTerrainTint(season: string, terrain: TerrainType): { color: string; strength: number } {
  if (season === 'winter') {
    const strength = terrain === 'forest' || terrain === 'jungle'
      ? 0.1
      : terrain === 'desert' || terrain === 'volcano'
        ? 0.08
        : terrain === 'glacier'
          ? 0.22
          : 0.12;
    // Snow is rendered by SeasonalSnowCover. The base material only receives
    // a restrained cold cast so authored albedo is not multiplied into grey.
    return { color: '#edf3f3', strength };
  }
  if (season === 'autumn') {
    return { color: terrain === 'forest' ? '#9a633d' : '#c39a64', strength: 0.16 };
  }
  if (season === 'spring') return { color: '#8da987', strength: 0.08 };
  return { color: '#ffffff', strength: 0 };
}

const sharedSlab = createHexSlabGeometry(HEX_WORLD_RADIUS, HEX_SLAB_THICKNESS);
const sharedRing = createHexRingGeometry(HEX_WORLD_RADIUS, HEX_SLAB_THICKNESS + 0.008);
const foundationGeo = createHexSlabGeometry(HEX_WORLD_RADIUS * 1.025, 0.082, 1);
const foundationMat = new THREE.MeshPhysicalMaterial({
  color: '#6a5f51',
  roughness: 0.96,
  metalness: 0.01,
  clearcoat: 0.02,
  clearcoatRoughness: 0.86,
});

const pickMat = new THREE.MeshBasicMaterial({
  visible: false,
  transparent: true,
  opacity: 0,
  depthWrite: false,
});

const gridMat = new THREE.LineBasicMaterial({
  color: '#d8d0bc',
  transparent: true,
  opacity: 0.22,
  depthWrite: false,
});

interface TerrainBatch {
  terrain: TerrainType;
  tiles: HexTile[];
  geometry: THREE.BufferGeometry;
  material: THREE.MeshPhysicalMaterial;
}

function IslandFoundation({ tiles }: { tiles: HexTile[] }) {
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const dummy = useMemo(() => new THREE.Object3D(), []);

  useLayoutEffect(() => {
    const mesh = meshRef.current;
    if (!mesh) return;
    for (let i = 0; i < tiles.length; i++) {
      const origin = cubeToWorld(tiles[i]!.coord);
      dummy.position.set(origin.x, -0.076, origin.z);
      dummy.rotation.set(0, 0, 0);
      dummy.scale.set(1, 1, 1);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    }
    mesh.count = tiles.length;
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();
  }, [dummy, tiles]);

  if (tiles.length === 0) return null;
  return (
    <instancedMesh
      ref={meshRef}
      args={[foundationGeo, foundationMat, tiles.length]}
      receiveShadow
      frustumCulled
      raycast={() => undefined}
    />
  );
}

function hexRingPositions(cx: number, cy: number, cz: number, radius: number): number[] {
  const pts: number[] = [];
  for (let i = 0; i < 6; i++) {
    const a0 = (Math.PI / 180) * (60 * i - 30);
    const a1 = (Math.PI / 180) * (60 * ((i + 1) % 6) - 30);
    const r = radius * 0.98;
    pts.push(
      cx + r * Math.cos(a0),
      cy,
      cz + r * Math.sin(a0),
      cx + r * Math.cos(a1),
      cy,
      cz + r * Math.sin(a1),
    );
  }
  return pts;
}

/** One LineSegments draw for the whole contextual grid (Phase F budget). */
function GridLines({ tiles }: { tiles: HexTile[] }) {
  const geo = useMemo(() => {
    const positions: number[] = [];
    for (const tile of tiles) {
      if (isWaterTerrain(tile.terrain)) continue;
      const pos = cubeToWorld(tile.coord);
      positions.push(
        ...hexRingPositions(pos.x, HEX_SLAB_THICKNESS + 0.008, pos.z, HEX_WORLD_RADIUS),
      );
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    return g;
  }, [tiles]);

  useEffect(() => () => geo.dispose(), [geo]);

  if (tiles.length === 0) return null;

  return (
    <lineSegments geometry={geo} material={gridMat} frustumCulled={false} raycast={() => undefined} renderOrder={1} />
  );
}

/** One subtle mineral path draw hides slab seams while preserving the hex grammar. */
function TerrainSeamPaths({ tiles }: { tiles: HexTile[] }) {
  const geometry = useMemo(() => {
    const tileMap = new Map(tiles.map((tile) => [tile.id, tile]));
    const positions: number[] = [];
    const indices: number[] = [];
    const halfWidth = 0.014;
    const y = HEX_SLAB_THICKNESS + 0.011;
    const vertex = (dir: number) => {
      const angle = (Math.PI / 180) * (60 * (dir % 6) - 30);
      return { x: HEX_WORLD_RADIUS * Math.cos(angle), z: HEX_WORLD_RADIUS * Math.sin(angle) };
    };

    for (const tile of tiles) {
      if (isWaterTerrain(tile.terrain)) continue;
      const origin = cubeToWorld(tile.coord);
      for (let dir = 0; dir < 6; dir++) {
        const neighbor = tileMap.get(hexToId(hexNeighbor(tile.coord, dir as 0 | 1 | 2 | 3 | 4 | 5)));
        if (!neighbor || isWaterTerrain(neighbor.terrain) || tile.id >= neighbor.id) continue;
        const a = vertex(dir);
        const b = vertex(dir + 1);
        const dx = b.x - a.x;
        const dz = b.z - a.z;
        const length = Math.max(0.0001, Math.hypot(dx, dz));
        const px = (-dz / length) * halfWidth;
        const pz = (dx / length) * halfWidth;
        const base = positions.length / 3;
        positions.push(
          origin.x + a.x + px, y, origin.z + a.z + pz,
          origin.x + a.x - px, y, origin.z + a.z - pz,
          origin.x + b.x + px, y, origin.z + b.z + pz,
          origin.x + b.x - px, y, origin.z + b.z - pz,
        );
        indices.push(base, base + 1, base + 2, base + 1, base + 3, base + 2);
      }
    }
    const result = new THREE.BufferGeometry();
    result.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    result.setIndex(indices);
    result.computeVertexNormals();
    result.computeBoundingSphere();
    return result;
  }, [tiles]);

  useEffect(() => () => geometry.dispose(), [geometry]);
  if (geometry.getAttribute('position').count === 0) return null;
  return (
    <mesh geometry={geometry} receiveShadow raycast={() => undefined} renderOrder={1}>
      <meshStandardMaterial
        color="#aa9b7d"
        roughness={0.98}
        metalness={0}
        transparent
        opacity={0.48}
        polygonOffset
        polygonOffsetFactor={-2}
        polygonOffsetUnits={-2}
        side={THREE.DoubleSide}
      />
    </mesh>
  );
}

function TerrainInstances({
  batch,
  selectedTile,
  highlightedTiles,
  hoveredTile,
}: {
  batch: TerrainBatch;
  selectedTile: string | null;
  highlightedTiles: ReadonlySet<string>;
  hoveredTile: string | null;
}) {
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const dummy = useMemo(() => new THREE.Object3D(), []);

  useLayoutEffect(() => {
    const mesh = meshRef.current;
    if (!mesh) return;
    const water = isWaterTerrain(batch.terrain);
    for (let i = 0; i < batch.tiles.length; i++) {
      const tile = batch.tiles[i]!;
      const pos = cubeToWorld(tile.coord);
      const selected = tile.id === selectedTile;
      const hovered = tile.id === hoveredTile;
      const highlighted = highlightedTiles.has(tile.id);
      const lift = selected ? 0.05 : hovered ? 0.035 : highlighted ? 0.02 : 0;
      const baseY = water ? -0.08 : 0;
      // 60° steps keep hex edges aligned while rotating the relief pattern.
      const yaw = ((hashString(tile.id) % 6) * Math.PI) / 3;
      dummy.position.set(pos.x, baseY + lift, pos.z);
      dummy.rotation.set(0, yaw, 0);
      dummy.scale.set(1, 1, 1);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    }
    mesh.count = batch.tiles.length;
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();
  }, [batch, dummy, highlightedTiles, hoveredTile, selectedTile]);

  return (
    <instancedMesh
      ref={meshRef}
      args={[batch.geometry, batch.material, batch.tiles.length]}
      castShadow={false}
      receiveShadow={!isWaterTerrain(batch.terrain)}
      frustumCulled
      raycast={() => undefined}
    />
  );
}

export function HexTerrain({
  tiles,
  selectedTile,
  highlightedTiles,
  hoveredTile,
  showGrid,
  climateId = null,
  season = 'summer',
  interactionEnabled = true,
  onTileClick,
  onTileHover,
  softBiomeTransitions = false,
  flatEmphasis = true,
}: HexTerrainProps) {
  const pointerDown = useRef<{ x: number; y: number; tileId: string } | null>(null);
  const lod = useMapLod();
  const quality = useRenderQuality();
  const ambient = useAmbientAnimation();
  const climateVisual = getClimateVisualPreset(climateId);

  const batches = useMemo(() => {
    if (softBiomeTransitions) return [];
    const byTerrain = new Map<TerrainType, HexTile[]>();
    for (const tile of tiles) {
      const list = byTerrain.get(tile.terrain);
      if (list) list.push(tile);
      else byTerrain.set(tile.terrain, [tile]);
    }

    const out: TerrainBatch[] = [];
    for (const [terrain, group] of byTerrain) {
      // Sea tiles remain valid interaction cells but visually merge into the
      // continuous basin. Hex structure only reappears through hover/grid rings.
      if (terrain === 'ocean' || terrain === 'coast') continue;
      const top = TERRAIN_BASE_COLORS[terrain] ?? '#8899aa';
      const side = TERRAIN_SIDE_COLORS[terrain] ?? '#667788';
      const water = isWaterTerrain(terrain);
      const pbr = getBiomeMaterialDefinition(terrain);
      const textureSet = getProceduralPbrTextures(terrain, quality.textureTier);
      const authored = getAuthoredBiomeTextures(terrain, quality.textureTier);
      const authoredAlbedo = authored.albedo;
      const wetClimate = climateVisual?.particle === 'rain' || climateId === 'spring_floods';
      const seasonalTint = seasonalTerrainTint(season, terrain);
      const seasonalColor = mixHex(
        pbr.albedoTint ?? '#ffffff',
        seasonalTint.color,
        seasonalTint.strength,
      );
      const material = new THREE.MeshPhysicalMaterial({
        // Authored albedo already contains full-range color. Multiplying it
        // by the legacy hand-painted vertex palette crushed forest floors
        // almost to black.
        vertexColors: !authoredAlbedo,
        map: authoredAlbedo ?? textureSet.albedo,
        normalMap: authored.normal ?? textureSet.normal,
        normalScale: new THREE.Vector2(
          terrain === 'mountain' ? 0.72 : 0.48,
          terrain === 'mountain' ? 0.72 : 0.48,
        ),
        roughnessMap: authored.roughness ?? textureSet.roughness,
        aoMap: authored.ao,
        aoMapIntensity: terrain === 'mountain' || terrain === 'hill' ? 0.72 : 0.48,
        displacementMap: quality.id === 'ultra' ? authored.height : null,
        displacementScale: quality.id === 'ultra' ? (terrain === 'mountain' ? 0.024 : 0.01) : 0,
        displacementBias: quality.id === 'ultra' ? (terrain === 'mountain' ? -0.008 : -0.003) : 0,
        color: mixHex(
          seasonalColor,
          climateVisual?.terrainTint ?? '#ffffff',
          climateVisual?.terrainTintStrength ?? 0,
        ),
        roughness: Math.max(0.16, Math.min(1, pbr.roughness + (climateVisual?.roughnessDelta ?? 0) - (wetClimate ? 0.18 : 0))),
        metalness: pbr.metalness,
        envMapIntensity: pbr.envMapIntensity,
        clearcoat: wetClimate ? Math.max(0.28, pbr.clearcoat ?? 0) : (pbr.clearcoat ?? 0),
        clearcoatRoughness: wetClimate ? 0.34 : (pbr.clearcoatRoughness ?? 0.62),
        ior: water || terrain === 'glacier' ? 1.33 : 1.46,
        flatShading: false,
      });
      if (authoredAlbedo) attachWorldProjectedPbr(material);
      out.push({
        terrain,
        tiles: group,
        geometry: getColoredHexSlab(
          authoredAlbedo ? '#ffffff' : top,
          authoredAlbedo ? '#746b5d' : side,
          HEX_WORLD_RADIUS,
          HEX_SLAB_THICKNESS,
          terrain,
        ),
        material,
      });
    }
    return out;
  }, [climateId, climateVisual, quality.id, quality.textureTier, season, softBiomeTransitions, tiles]);

  const foundationTiles = useMemo(
    () => tiles.filter((tile) => !isWaterTerrain(tile.terrain)),
    [tiles],
  );

  useEffect(() => {
    for (const batch of batches) {
      if (!isWaterTerrain(batch.terrain)) continue;
      const amp = batch.terrain === 'ocean' ? 0.045 : 0.032;
      const speed = batch.terrain === 'river' ? 0.95 : 0.6;
      attachWaterWaveShader(batch.material, { amplitude: amp, speed, upAxis: 'y' });
    }
  }, [batches]);

  useFrame(() => {
    const t = shouldAnimateDecor(ambient.enabled, lod) ? ambient.time : 0;
    for (const batch of batches) {
      if (isWaterTerrain(batch.terrain)) setWaterWaveTime(batch.material, t);
    }
  });

  useEffect(() => {
    return () => {
      for (const batch of batches) batch.material.dispose();
      document.body.style.cursor = '';
    };
  }, [batches]);

  /** Emphasis rings only (grid is a single LineSegments). */
  const emphasisTiles = useMemo(() => {
    if (!flatEmphasis) return [];
    return tiles.filter(
      (tile) =>
        tile.id === selectedTile ||
        tile.id === hoveredTile ||
        highlightedTiles.has(tile.id),
    );
  }, [flatEmphasis, highlightedTiles, hoveredTile, selectedTile, tiles]);

  const noopRaycast = useMemo(() => {
    return (_raycaster: THREE.Raycaster, _intersects: THREE.Intersection[]) => {
      /* outline non-interactive */
    };
  }, []);

  return (
    <group>
      {!softBiomeTransitions && <IslandFoundation tiles={foundationTiles} />}
      {softBiomeTransitions ? (
        <ContinuousTerrainSurface tiles={foundationTiles} season={season} climateId={climateId} />
      ) : (
        batches.map((batch) => (
          <TerrainInstances
            key={batch.terrain}
            batch={batch}
            selectedTile={selectedTile}
            highlightedTiles={highlightedTiles}
            hoveredTile={hoveredTile}
          />
        ))
      )}
      {/* The island is continuous by default. Geological seams only return with
          the explicit tactical grid, never as permanent tile borders. */}
      {showGrid && <TerrainSeamPaths tiles={foundationTiles} />}

      {/* Invisible pick targets — Three r114+ still raycasts visible=false */}
      {tiles.map((tile) => {
        const pos = cubeToWorld(tile.coord);
        const water = isWaterTerrain(tile.terrain);
        const selected = tile.id === selectedTile;
        const hovered = tile.id === hoveredTile;
        const highlighted = highlightedTiles.has(tile.id);
        const lift = selected ? 0.05 : hovered ? 0.035 : highlighted ? 0.02 : 0;
        const baseY = water ? -0.08 : 0;

        return (
          <mesh
            key={`pick-${tile.id}`}
            geometry={sharedSlab}
            material={pickMat}
            position={[pos.x, baseY + lift, pos.z]}
            visible={false}
            userData={{ kind: 'tile', id: tile.id }}
            onPointerOver={(event: ThreeEvent<PointerEvent>) => {
              if (!interactionEnabled) return;
              event.stopPropagation();
              onTileHover(tile.id);
              document.body.style.cursor = 'pointer';
            }}
            onPointerOut={(event: ThreeEvent<PointerEvent>) => {
              if (!interactionEnabled) return;
              event.stopPropagation();
              const next = event.intersections.find(
                (hit) =>
                  hit.object.userData?.kind === 'tile' && hit.object.userData.id !== tile.id,
              );
              if (next) return;
              onTileHover(null);
              document.body.style.cursor = '';
            }}
            onPointerDown={(event: ThreeEvent<PointerEvent>) => {
              if (!interactionEnabled || event.button !== 0) return;
              event.stopPropagation();
              pointerDown.current = {
                x: event.clientX,
                y: event.clientY,
                tileId: tile.id,
              };
            }}
            onPointerUp={(event: ThreeEvent<PointerEvent>) => {
              if (!interactionEnabled || event.button !== 0) return;
              const down = pointerDown.current;
              pointerDown.current = null;
              if (!down || down.tileId !== tile.id) return;
              const dx = event.clientX - down.x;
              const dy = event.clientY - down.y;
              if (dx * dx + dy * dy > 25) return;
              event.stopPropagation();
              onTileClick(tile.id);
            }}
          />
        );
      })}

      {showGrid && <GridLines tiles={tiles} />}

      {emphasisTiles.map((tile) => {
        const pos = cubeToWorld(tile.coord);
        const water = isWaterTerrain(tile.terrain);
        const selected = tile.id === selectedTile;
        const hovered = tile.id === hoveredTile;
        const highlighted = highlightedTiles.has(tile.id);
        const lift = selected ? 0.05 : hovered ? 0.035 : highlighted ? 0.02 : 0;
        const baseY = water ? -0.08 : 0;

        let outlineColor = '#e0d4b0';
        let outlineOpacity = 0.75;
        if (selected) {
          outlineColor = '#f2e6c4';
          outlineOpacity = 0.95;
        } else if (hovered) {
          outlineColor = '#efe4c8';
          outlineOpacity = 0.9;
        }

        return (
          <lineLoop
            key={`ring-${tile.id}`}
            geometry={sharedRing}
            position={[pos.x, baseY + lift, pos.z]}
            raycast={noopRaycast}
            renderOrder={2}
          >
            <lineBasicMaterial
              color={outlineColor}
              transparent
              opacity={outlineOpacity}
              depthTest
              depthWrite={false}
            />
          </lineLoop>
        );
      })}
    </group>
  );
}

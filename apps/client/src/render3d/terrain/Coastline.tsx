import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import type { HexTile, TerrainType } from '@catanx/engine';
import { hexNeighbor, hexToId } from '@catanx/engine';
import { HEX_SLAB_THICKNESS } from '../utils/createHexGeometry';
import { cubeToWorld, HEX_WORLD_RADIUS } from '../utils/hexToWorld';
import { isWaterTerrain } from '../decorations/deterministicDecoration';
import { useAmbientAnimation } from '../fx/AmbientAnimationContext';
import { hashString } from '../utils/seededVisualRandom';
import { useRenderQuality } from '../quality/RenderQualityContext';
import { getAuthoredBiomeTextures, loadAuthoredTexture } from './authoredPbrTextures';
import { attachWorldProjectedPbr } from './worldProjectedPbr';
import { useSurfaceHeight } from './SurfaceHeightContext';

interface CoastlineProps {
  tiles: HexTile[];
  mapSeed: number;
}

interface CoastBandOptions {
  innerOffset: number;
  outerOffset: number;
  innerY: number;
  outerY: number;
  innerColor: string;
  outerColor: string;
  meander: number;
  segments: number;
  salt: string;
  includeTerrains?: ReadonlySet<TerrainType>;
  sampleInnerY?: (x: number, z: number) => number;
}

const GENTLE_COAST_TERRAINS = new Set<TerrainType>([
  'plains', 'pasture', 'desert', 'coast',
]);

function hexVertex(i: number, radius = HEX_WORLD_RADIUS): { x: number; z: number } {
  const angle = (Math.PI / 180) * (60 * (i % 6) - 30);
  return { x: radius * Math.cos(angle), z: radius * Math.sin(angle) };
}

function edgeCornerStart(direction: number): number {
  return (6 - direction) % 6;
}

function edgeNormal(dir: number): { x: number; z: number } {
  const corner = edgeCornerStart(dir);
  const a = hexVertex(corner);
  const b = hexVertex(corner + 1);
  const x = (a.x + b.x) * 0.5;
  const z = (a.z + b.z) * 0.5;
  const length = Math.hypot(x, z) || 1;
  return { x: x / length, z: z / length };
}

function isSeaCoastEdge(tile: HexTile, dir: number, tileMap: Map<string, HexTile>): boolean {
  if (isWaterTerrain(tile.terrain)) return false;
  const coord = hexNeighbor(tile.coord, dir as 0 | 1 | 2 | 3 | 4 | 5);
  const neighbor = tileMap.get(hexToId(coord));
  // Procedural and classic boards do not always materialise an ocean tile around
  // every outer land edge. Missing neighbours are therefore open sea, while
  // lakes and rivers remain deliberately excluded from the beach perimeter.
  return !neighbor || neighbor.terrain === 'ocean' || neighbor.terrain === 'coast';
}

function signedNoise(key: string): number {
  return (hashString(key) % 2001) / 1000 - 1;
}

/**
 * Builds a segmented, sloped coastal band. Each edge receives deterministic
 * lateral drift and height variation, so the beach reads as terrain rather than
 * a straight decal drawn around the board.
 */
function buildCoastBandGeometry(
  tiles: HexTile[],
  tileMap: Map<string, HexTile>,
  mapSeed: number,
  options: CoastBandOptions,
): THREE.BufferGeometry {
  const positions: number[] = [];
  const colors: number[] = [];
  const indices: number[] = [];
  const innerColor = new THREE.Color(options.innerColor);
  const outerColor = new THREE.Color(options.outerColor);

  const pushVertex = (x: number, y: number, z: number, color: THREE.Color): number => {
    const index = positions.length / 3;
    positions.push(x, y, z);
    colors.push(color.r, color.g, color.b);
    return index;
  };

  for (const tile of tiles) {
    if (isWaterTerrain(tile.terrain)) continue;
    if (options.includeTerrains && !options.includeTerrains.has(tile.terrain)) continue;
    const origin = cubeToWorld(tile.coord);

    for (let dir = 0; dir < 6; dir++) {
      if (!isSeaCoastEdge(tile, dir, tileMap)) continue;
      const corner = edgeCornerStart(dir);
      const a = hexVertex(corner);
      const b = hexVertex(corner + 1);
      const normal = edgeNormal(dir);
      const tangentX = b.x - a.x;
      const tangentZ = b.z - a.z;
      const edgeSeed = `${mapSeed}:${tile.id}:${dir}:${options.salt}`;
      const broadDrift = signedNoise(`${edgeSeed}:broad`) * options.meander;
      const phase = signedNoise(`${edgeSeed}:phase`) * Math.PI;
      const vertices: Array<[number, number]> = [];

      for (let segment = 0; segment <= options.segments; segment++) {
        const t = segment / options.segments;
        const edgeX = origin.x + a.x + tangentX * t;
        const edgeZ = origin.z + a.z + tangentZ * t;
        const sampleNoise = signedNoise(`${edgeSeed}:${segment}`) * options.meander * 0.34;
        const curve =
          broadDrift * Math.sin(Math.PI * t) +
          Math.sin(t * Math.PI * 2 + phase) * options.meander * 0.42 +
          sampleNoise;
        const heightNoise = sampleNoise * 0.055;

        const innerX = edgeX + normal.x * (options.innerOffset + curve * 0.48);
        const innerZ = edgeZ + normal.z * (options.innerOffset + curve * 0.48);
        const inner = pushVertex(
          innerX,
          (options.sampleInnerY?.(innerX, innerZ) ?? options.innerY) + heightNoise + 0.003,
          innerZ,
          innerColor,
        );
        const outer = pushVertex(
          edgeX + normal.x * (options.outerOffset + curve),
          options.outerY + heightNoise * 0.35,
          edgeZ + normal.z * (options.outerOffset + curve),
          outerColor,
        );
        vertices.push([inner, outer]);
      }

      for (let segment = 0; segment < options.segments; segment++) {
        const [innerA, outerA] = vertices[segment]!;
        const [innerB, outerB] = vertices[segment + 1]!;
        indices.push(innerA, innerB, outerB, innerA, outerB, outerA);
      }
    }

    // Close convex shoreline corners with the same height gradient.
    for (let corner = 0; corner < 6; corner++) {
      const previous = (corner + 5) % 6;
      if (!isSeaCoastEdge(tile, previous, tileMap) || !isSeaCoastEdge(tile, corner, tileMap)) {
        continue;
      }
      const vertex = hexVertex((edgeCornerStart(corner) + 1) % 6);
      const previousNormal = edgeNormal(previous);
      const nextNormal = edgeNormal(corner);
      const innerAX = origin.x + vertex.x + previousNormal.x * options.innerOffset;
      const innerAZ = origin.z + vertex.z + previousNormal.z * options.innerOffset;
      const innerBX = origin.x + vertex.x + nextNormal.x * options.innerOffset;
      const innerBZ = origin.z + vertex.z + nextNormal.z * options.innerOffset;
      const innerA = pushVertex(
        innerAX,
        (options.sampleInnerY?.(innerAX, innerAZ) ?? options.innerY) + 0.003,
        innerAZ,
        innerColor,
      );
      const innerB = pushVertex(
        innerBX,
        (options.sampleInnerY?.(innerBX, innerBZ) ?? options.innerY) + 0.003,
        innerBZ,
        innerColor,
      );
      const outerB = pushVertex(
        origin.x + vertex.x + nextNormal.x * options.outerOffset,
        options.outerY,
        origin.z + vertex.z + nextNormal.z * options.outerOffset,
        outerColor,
      );
      const outerA = pushVertex(
        origin.x + vertex.x + previousNormal.x * options.outerOffset,
        options.outerY,
        origin.z + vertex.z + previousNormal.z * options.outerOffset,
        outerColor,
      );
      indices.push(innerA, innerB, outerB, innerA, outerB, outerA);
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  return geometry;
}

export function Coastline({ tiles, mapSeed }: CoastlineProps) {
  const foamRef = useRef<THREE.MeshStandardMaterial>(null);
  const ambient = useAmbientAnimation();
  const quality = useRenderQuality();
  const surface = useSurfaceHeight();
  const sand = getAuthoredBiomeTextures('desert', quality.textureTier);
  const rock = getAuthoredBiomeTextures('mountain', quality.textureTier);
  const cliffAlbedo = loadAuthoredTexture({
    sources: {
      '512': '/assets/textures/terrain/photoreal/coastal_cliff_albedo_1.jpg',
      '1k': '/assets/textures/terrain/photoreal/coastal_cliff_albedo_1.jpg',
      '2k': '/assets/textures/terrain/photoreal/coastal_cliff_albedo_1.jpg',
      '4k': '/assets/textures/terrain/photoreal/coastal_cliff_albedo_1.jpg',
    },
    colorSpace: 'srgb',
    repeat: [0.55, 0.55],
  }, quality.textureTier);
  const cliffNormal = loadAuthoredTexture({
    sources: {
      '512': '/assets/textures/terrain/photoreal/coastal_cliff_normal_1.webp',
      '1k': '/assets/textures/terrain/photoreal/coastal_cliff_normal_1.webp',
      '2k': '/assets/textures/terrain/photoreal/coastal_cliff_normal_1.webp',
      '4k': '/assets/textures/terrain/photoreal/coastal_cliff_normal_1.webp',
    },
    colorSpace: 'linear',
    repeat: [0.55, 0.55],
  }, quality.textureTier);
  const cliffRoughness = loadAuthoredTexture({
    sources: {
      '512': '/assets/textures/terrain/photoreal/coastal_cliff_roughness_1.jpg',
      '1k': '/assets/textures/terrain/photoreal/coastal_cliff_roughness_1.jpg',
      '2k': '/assets/textures/terrain/photoreal/coastal_cliff_roughness_1.jpg',
      '4k': '/assets/textures/terrain/photoreal/coastal_cliff_roughness_1.jpg',
    },
    colorSpace: 'linear',
    repeat: [0.55, 0.55],
  }, quality.textureTier);
  const cliffAo = loadAuthoredTexture({
    sources: {
      '512': '/assets/textures/terrain/photoreal/coastal_cliff_ao_1.jpg',
      '1k': '/assets/textures/terrain/photoreal/coastal_cliff_ao_1.jpg',
      '2k': '/assets/textures/terrain/photoreal/coastal_cliff_ao_1.jpg',
      '4k': '/assets/textures/terrain/photoreal/coastal_cliff_ao_1.jpg',
    },
    colorSpace: 'linear',
    repeat: [0.55, 0.55],
  }, quality.textureTier);
  const tileMap = useMemo(() => new Map(tiles.map((tile) => [tile.id, tile])), [tiles]);

  const [drySandMaterial, rockyCliffMaterial, wetSandMaterial] = useMemo(() => {
    const dry = new THREE.MeshPhysicalMaterial({
      vertexColors: true,
      map: sand.albedo,
      normalMap: sand.normal,
      normalScale: new THREE.Vector2(0.34, 0.34),
      roughnessMap: sand.roughness,
      roughness: 0.92,
      metalness: 0,
      side: THREE.DoubleSide,
    });
    const wet = new THREE.MeshPhysicalMaterial({
      vertexColors: true,
      map: sand.albedo,
      normalMap: sand.normal,
      normalScale: new THREE.Vector2(0.22, 0.22),
      roughnessMap: sand.roughness,
      roughness: 0.42,
      metalness: 0.03,
      clearcoat: 0.32,
      clearcoatRoughness: 0.26,
      side: THREE.DoubleSide,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -1,
    });
    const cliff = new THREE.MeshPhysicalMaterial({
      vertexColors: true,
      map: cliffAlbedo ?? rock.albedo,
      normalMap: cliffNormal ?? rock.normal,
      normalScale: new THREE.Vector2(0.58, 0.58),
      roughnessMap: cliffRoughness ?? rock.roughness,
      aoMap: cliffAo ?? rock.ao,
      aoMapIntensity: 0.7,
      roughness: 0.93,
      metalness: 0.01,
      side: THREE.DoubleSide,
      clearcoat: 0.06,
      clearcoatRoughness: 0.7,
    });
    attachWorldProjectedPbr(dry, 0.48);
    attachWorldProjectedPbr(cliff, 0.52);
    attachWorldProjectedPbr(wet, 0.48);
    return [dry, cliff, wet];
  }, [
    cliffAlbedo, cliffAo, cliffNormal, cliffRoughness,
    rock.albedo, rock.ao, rock.normal, rock.roughness,
    sand.albedo, sand.normal, sand.roughness,
  ]);

  const drySandGeometry = useMemo(
    () =>
      buildCoastBandGeometry(tiles, tileMap, mapSeed, {
        innerOffset: -0.11,
        outerOffset: 0.25,
        innerY: HEX_SLAB_THICKNESS + 0.002,
        outerY: 0.07,
        innerColor: '#ad9a76',
        outerColor: '#776d5c',
        meander: 0.21,
        segments: 18,
        salt: 'dry-sand',
        includeTerrains: GENTLE_COAST_TERRAINS,
        sampleInnerY: (x, z) => surface.sampleHeight(x, z),
      }),
    [mapSeed, surface, tileMap, tiles],
  );

  const rockyCliffGeometry = useMemo(
    () =>
      buildCoastBandGeometry(tiles, tileMap, mapSeed + 11, {
        innerOffset: -0.12,
        outerOffset: 0.29,
        innerY: HEX_SLAB_THICKNESS + 0.004,
        outerY: -0.018,
        innerColor: '#77746b',
        outerColor: '#565950',
        meander: 0.22,
        segments: 18,
        salt: 'rocky-cliff',
        includeTerrains: new Set(
          tiles
            .filter((tile) => !GENTLE_COAST_TERRAINS.has(tile.terrain))
            .map((tile) => tile.terrain),
        ),
        sampleInnerY: (x, z) => surface.sampleHeight(x, z),
      }),
    [mapSeed, surface, tileMap, tiles],
  );

  const wetSandGeometry = useMemo(
    () =>
      buildCoastBandGeometry(tiles, tileMap, mapSeed + 19, {
        innerOffset: 0.07,
        outerOffset: 0.34,
        innerY: 0.068,
        outerY: -0.025,
        innerColor: '#776d5c',
        outerColor: '#416a70',
        meander: 0.12,
        segments: 12,
        salt: 'wet-sand',
      }),
    [mapSeed, tileMap, tiles],
  );

  const foamGeometry = useMemo(
    () =>
      buildCoastBandGeometry(tiles, tileMap, mapSeed + 41, {
        innerOffset: 0.26,
        outerOffset: 0.36,
        innerY: -0.015,
        outerY: -0.032,
        innerColor: '#f8ffff',
        outerColor: '#bfe7e9',
        meander: 0.13,
        segments: 13,
        salt: 'foam',
      }),
    [mapSeed, tileMap, tiles],
  );

  const hasCoast = useMemo(
    () =>
      tiles.some(
        (tile) =>
          !isWaterTerrain(tile.terrain) &&
          [0, 1, 2, 3, 4, 5].some((dir) => isSeaCoastEdge(tile, dir, tileMap)),
      ),
    [tileMap, tiles],
  );

  useEffect(
    () => () => {
      drySandGeometry.dispose();
      rockyCliffGeometry.dispose();
      wetSandGeometry.dispose();
      foamGeometry.dispose();
      drySandMaterial.dispose();
      rockyCliffMaterial.dispose();
      wetSandMaterial.dispose();
    },
    [drySandGeometry, drySandMaterial, foamGeometry, rockyCliffGeometry, rockyCliffMaterial, wetSandGeometry, wetSandMaterial],
  );

  useFrame(() => {
    if (!foamRef.current) return;
    foamRef.current.opacity = 0.4 + Math.sin(ambient.time * 1.9) * 0.1;
  });

  if (!hasCoast) return null;

  return (
    <group>
      <mesh
        geometry={drySandGeometry}
        material={drySandMaterial}
        receiveShadow
        raycast={() => undefined}
      />
      <mesh
        geometry={wetSandGeometry}
        material={wetSandMaterial}
        receiveShadow
        raycast={() => undefined}
      />
      <mesh geometry={foamGeometry} raycast={() => undefined} renderOrder={3}>
        <meshStandardMaterial
          ref={foamRef}
          color="#c5d4d0"
          vertexColors
          roughness={0.55}
          metalness={0}
          transparent
          opacity={0.28}
          depthWrite={false}
          side={THREE.DoubleSide}
        />
      </mesh>
    </group>
  );
}

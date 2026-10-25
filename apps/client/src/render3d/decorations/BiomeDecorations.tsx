import { useMemo } from 'react';
import { hexNeighbor, hexToId, type HexTile } from '@catanx/engine';
import { useMapLod } from '../camera/MapLodContext';
import { getClimateVisualPreset, seasonDecorDensity } from '../utils/seasonVisuals';
import { cubeToWorld } from '../utils/hexToWorld';
import {
  buildMapDecorations,
  filterDecorByLod,
  type DecorInstance,
} from './deterministicDecoration';
import { Fields } from './Fields';
import { BladeField, type GroundClearings } from './BladeField';
import { InstancedProps } from './InstancedProps';
import { InstancedRocks } from './InstancedRocks';
import { TerrainMicroScatter } from './TerrainMicroScatter';
import { InstancedTrees } from './InstancedTrees';
import { useRenderQuality } from '../quality/RenderQualityContext';

/** Promo hamlet footprints (H7 / diorama) — keep tall décor out of roofs. */
const DIORAMA_SETTLEMENT_CLEARS: ReadonlyArray<{ x: number; z: number; treeR: number; grassR: number }> = [
  { x: 0.35, z: 0.18, treeR: 0.78, grassR: 0.32 },
  { x: -1.18, z: -0.34, treeR: 0.58, grassR: 0.24 },
  { x: 1.56, z: -0.72, treeR: 0.58, grassR: 0.24 },
];

const DIORAMA_ROAD_TREE_CLEARS: ReadonlyArray<{
  points: ReadonlyArray<readonly [number, number]>;
  half: number;
}> = [
  { points: [[0.35, 0.18], [0.05, 0.05], [-0.45, -0.2], [-1.18, -0.34]], half: 0.14 },
  { points: [[0.35, 0.18], [0.67, 0.02], [1.14, -0.38], [1.56, -0.72]], half: 0.14 },
  { points: [[0.35, 0.18], [0.4, 0.62], [0.2, 1.1], [-0.02, 1.48]], half: 0.12 },
];

function insideDioramaSettlementClear(
  worldX: number,
  worldZ: number,
  kind: 'tree' | 'grass' | 'scrub',
): boolean {
  for (const clear of DIORAMA_SETTLEMENT_CLEARS) {
    const dx = worldX - clear.x;
    const dz = worldZ - clear.z;
    const radius = kind === 'grass' ? clear.grassR : clear.treeR;
    if (dx * dx + dz * dz < radius * radius) return true;
  }
  return false;
}

function distToRoadSegment(
  x: number,
  z: number,
  ax: number,
  az: number,
  bx: number,
  bz: number,
): number {
  const abx = bx - ax;
  const abz = bz - az;
  const lenSq = abx * abx + abz * abz;
  if (lenSq < 1e-8) return Math.hypot(x - ax, z - az);
  const t = Math.max(0, Math.min(1, ((x - ax) * abx + (z - az) * abz) / lenSq));
  return Math.hypot(x - (ax + abx * t), z - (az + abz * t));
}

function insideDioramaRoadClear(worldX: number, worldZ: number): boolean {
  for (const road of DIORAMA_ROAD_TREE_CLEARS) {
    for (let i = 0; i < road.points.length - 1; i++) {
      const a = road.points[i]!;
      const b = road.points[i + 1]!;
      if (distToRoadSegment(worldX, worldZ, a[0], a[1], b[0], b[1]) < road.half) return true;
    }
  }
  return false;
}

interface BiomeDecorationsProps {
  tiles: HexTile[];
  mapSeed: number;
  animate?: boolean;
  season?: string;
  climateId?: string | null;
  classic?: boolean;
  continuousMountains?: boolean;
  /**
   * Keep décor out of the promo hamlet painted into the H7 reference scene.
   * Those world-space clearings used to apply to every game and emptied the
   * centre of the board.
   */
  promoClears?: boolean;
  /** House plots and road beds kept free of grass and wheat. */
  groundClearings?: GroundClearings | null;
}

/**
 * Deterministic biome props (trees, rocks, fields, peaks, landmarks).
 * Floor detail lives on HexTerrain — no sand/soil footing plates (they fought the detailed hex).
 */
export function BiomeDecorations({
  tiles,
  mapSeed,
  animate = true,
  season = 'summer',
  climateId = null,
  classic = false,
  continuousMountains = false,
  promoClears = false,
  groundClearings = null,
}: BiomeDecorationsProps) {
  const lod = useMapLod();
  const quality = useRenderQuality();
  const tilesById = useMemo(() => {
    const map = new Map<string, HexTile>();
    for (const tile of tiles) map.set(tile.id, tile);
    return map;
  }, [tiles]);

  const items = useMemo(() => {
    const density = seasonDecorDensity(season);
    const climateDensity = getClimateVisualPreset(climateId)?.foliageDensity ?? 1;
    const all = buildMapDecorations(tiles, mapSeed);
    const seasonal = all.filter((item, index) => {
      const tile = tilesById.get(item.tileId);
      const key = Math.abs((item.x * 80) | 0) + Math.abs((item.z * 80) | 0) + index;
      const roll = (key % 100) / 100;
      if (item.kind === 'scrub' || item.kind === 'field') {
        return roll < density.scrub * climateDensity * quality.vegetationDensity;
      }
      if (item.kind === 'tree') {
        return roll < density.tree * climateDensity * quality.vegetationDensity;
      }
      if (item.kind === 'rock') {
        // Keep glacier ice / volcano scree dense across seasons.
        if (tile?.terrain === 'glacier' || tile?.terrain === 'volcano') return true;
        if (continuousMountains) {
          // Natural dioramas use rocks as accents, not as a repeated gameplay
          // symbol. Dense black boulder fields destroyed the biome hierarchy.
          // Raised from 0.2/0.075 for ground interest, but only so far: every
          // extra instance is also a placement-time cost.
          const naturalRockDensity = tile?.terrain === 'hill' ? 0.26 : 0.11;
          return roll < naturalRockDensity;
        }
        return roll < Math.min(1, density.rock);
      }
      return true;
    });
    const filtered = filterDecorByLod(seasonal, lod);
    const forestDensityCopies =
      quality.id === 'ultra' ? 1 : quality.id === 'high' ? 1 : quality.id === 'low' ? 0 : 1;
    const naturalized = continuousMountains && forestDensityCopies > 0
      ? filtered.flatMap((item, index) => {
          const tile = tilesById.get(item.tileId);
          const terrain = tile?.terrain;
          const forestTree = item.kind === 'tree' && (terrain === 'forest' || terrain === 'jungle');
          // Pasture trees stand alone; duplicating them re-closed the canopy.
          const pastureTree = false;
          const lowUndergrowth =
            item.kind === 'scrub' &&
            (terrain === 'pasture' || terrain === 'forest' || terrain === 'jungle' || terrain === 'plains') &&
            (quality.id === 'high' || quality.id === 'ultra');
          if (!forestTree && !pastureTree && !lowUndergrowth) return [item];
          const copies: DecorInstance[] = [item];
          const forestNeighbors = tile && forestTree
            ? Array.from({ length: 6 }, (_, direction) => {
                const neighbor = tilesById.get(hexToId(hexNeighbor(tile.coord, direction as 0 | 1 | 2 | 3 | 4 | 5)));
                return neighbor?.terrain === 'forest' || neighbor?.terrain === 'jungle' ? 1 : 0;
              }).reduce((sum: number, value) => sum + value, 0)
            : 0;
          // One satellite max — denser copies killed FPS and fused into broccoli.
          const copyCount = forestTree
            ? forestDensityCopies
            : pastureTree
              ? (lod === 0 ? 1 : 0)
              : lowUndergrowth
                ? 1
                : 1;
          const minDist = forestTree ? 0.22 : 0.12;
          const minDistSq = minDist * minDist;
          for (let copy = 0; copy < copyCount; copy++) {
            const angle = ((item.variant * 2.399963 + index * 0.61 + copy * 2.17) % (Math.PI * 2));
            const radiusNoise = ((item.variant * 17 + index * 13 + copy * 23) % 19) / 19;
            const radius = forestTree
              ? 0.2 + radiusNoise * 0.48
              : 0.1 + radiusNoise * 0.22;
            const edgeScale = forestTree && forestNeighbors < 2 ? 0.78 : 1;
            const nx = item.x + Math.cos(angle) * radius;
            const nz = item.z + Math.sin(angle) * radius;
            if (copies.some((placed) => {
              const dx = placed.x - nx;
              const dz = placed.z - nz;
              return dx * dx + dz * dz < minDistSq;
            })) continue;
            copies.push({
              ...item,
              x: nx,
              z: nz,
              rotation: item.rotation + 0.73 + copy * 1.31,
              scale:
                item.scale *
                (lowUndergrowth
                  ? 0.48 + ((item.variant + copy) % 5) * 0.06
                  : (0.48 + ((item.variant + copy * 2) % 7) * 0.08) * edgeScale),
              variant: (item.variant + copy * 3 + index) % 7,
            });
          }
          return copies;
        })
      : filtered;
    const readable = classic
      ? naturalized
          .filter((item, index) => {
            const key =
              Math.abs((item.x * 137) | 0) +
              Math.abs((item.z * 173) | 0) +
              index * 7;
            if (item.kind === 'field') return false;
            if (item.kind === 'scrub') return false;
            if (item.kind === 'dune') return false;
            if (item.kind === 'tree') return key % 100 < 62;
            if (item.kind === 'rock') return key % 4 !== 0;
            return true;
          })
          .map((item) => ({
            ...item,
            scale:
              item.scale *
              (item.kind === 'field'
                ? 0.65
                : item.kind === 'tree' || item.kind === 'scrub'
                  ? 0.84
                  : 0.9),
          }))
      : naturalized;
    return readable.filter((item) => {
      const tile = tilesById.get(item.tileId);
      if (!tile) return true;
      if (
        continuousMountains &&
        item.kind === 'peak' &&
        tile.terrain !== 'volcano'
      ) return false;
      // The continuous heightfield already sculpts and textures desert relief.
      // Legacy dune meshes overlap into one opaque blanket at board scale.
      if (continuousMountains && item.kind === 'dune') return false;
      // Lakes / ocean never carry land décor.
      if (tile.terrain === 'lake' || tile.terrain === 'ocean' || tile.terrain === 'river') return false;
      if (tile.terrain === 'desert' && (item.kind === 'tree' || item.kind === 'scrub' || item.kind === 'prop')) {
        return false;
      }
      // Diorama promo villages / roads: world-space clears (item xz is tile-local).
      if (promoClears && continuousMountains && (item.kind === 'tree' || item.kind === 'scrub')) {
        const origin = cubeToWorld(tile.coord);
        const worldX = origin.x + item.x;
        const worldZ = origin.z + item.z;
        if (insideDioramaSettlementClear(worldX, worldZ, item.kind === 'scrub' ? 'scrub' : 'tree')) {
          return false;
        }
        if (insideDioramaRoadClear(worldX, worldZ)) return false;
      }
      return true;
    });
  }, [classic, climateId, continuousMountains, lod, mapSeed, promoClears, quality.id, quality.vegetationDensity, season, tiles, tilesById]);

  return (
    <group>
      <TerrainMicroScatter
        tiles={tiles}
        mapSeed={mapSeed}
        season={season}
        bladeGrass={continuousMountains}
        promoClears={promoClears}
      />
      {continuousMountains && (
        <>
          <BladeField kind="meadow" tiles={tiles} mapSeed={mapSeed} season={season} clearings={groundClearings} />
          <BladeField kind="wheat" tiles={tiles} mapSeed={mapSeed} season={season} clearings={groundClearings} />
        </>
      )}
      <InstancedTrees
        items={items}
        tilesById={tilesById}
        animate={animate}
        season={season}
        climateId={climateId}
        naturalized={continuousMountains}
        clearings={groundClearings}
      />
      <InstancedRocks
        items={items}
        tilesById={tilesById}
        season={season}
        naturalized={continuousMountains}
      />
      {/* Standing wheat is BladeField's job on the naturalized board. */}
      {!continuousMountains && <Fields
        items={items}
        tilesById={tilesById}
        naturalized={continuousMountains}
        season={season}
      />}
      <InstancedProps items={items} tilesById={tilesById} />
    </group>
  );
}

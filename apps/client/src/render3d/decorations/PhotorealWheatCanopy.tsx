import { useEffect, useMemo } from 'react';
import { useTexture } from '@react-three/drei';
import * as THREE from 'three';
import type { HexTile } from '@catanx/engine';
import { useMapLod } from '../camera/MapLodContext';
import { useRenderQuality } from '../quality/RenderQualityContext';
import { useSurfaceHeight } from '../terrain/SurfaceHeightContext';
import { cubeToWorld } from '../utils/hexToWorld';
import { visualRngFor } from '../utils/seededVisualRandom';
import { useAmbientAnimation } from '../fx/AmbientAnimationContext';
import { WindFoliage, type FoliagePlacement } from './WindFoliage';

interface PhotorealWheatCanopyProps {
  tiles: readonly HexTile[];
  mapSeed: number;
  season?: string;
}

/**
 * Ripening gradient: straw at the culm, ripe gold at the ear.
 *
 * Grain is a resource the player has to name at a glance, so it stays gold in
 * every season. The old spring entry sat at hue 68° — an olive that read as one
 * more patch of grass rather than a crop.
 */
const WHEAT_SEASON = {
  spring: { base: '#d8bd51', tip: '#ffe98a' },
  summer: { base: '#dfba3f', tip: '#ffeb85' },
  autumn: { base: '#d2a338', tip: '#f8cf62' },
} as const;

function buildWheatPlacements(
  tiles: readonly HexTile[],
  mapSeed: number,
  density: number,
  sampleHeight: (x: number, z: number) => number,
): FoliagePlacement[] {
  const out: FoliagePlacement[] = [];
  for (const tile of tiles) {
    if (tile.terrain !== 'plains') continue;
    const rng = visualRngFor(mapSeed, tile.id, 'wheat-stand-v2');
    const target = Math.max(0, Math.round(150 * density));
    const origin = cubeToWorld(tile.coord);
    // Keep wheat clear of the promo village apron so close shots stay clean.
    if (origin.x * origin.x + origin.z * origin.z < 0.55) continue;

    const hasChit = typeof tile.diceValue === 'number';
    let accepted = 0;
    for (let attempt = 0; attempt < target * 4 && accepted < target; attempt++) {
      const localX = (rng() * 2 - 1) * 0.8;
      const localZ = (rng() * 2 - 1) * 0.8;
      const edge = Math.max(Math.abs(localX) * 0.866 + Math.abs(localZ) * 0.5, Math.abs(localZ));
      if (edge > 0.78) continue;
      // Leave the production chit a clearing: a 0.34-tall crop swallowed it.
      if (hasChit && localX * localX + localZ * localZ < 0.255 * 0.255) continue;
      const x = origin.x + localX;
      const z = origin.z + localZ;
      out.push({
        x,
        z,
        // Sunk very slightly so the quad's bottom edge never floats over a dip.
        y: sampleHeight(x, z) - 0.01,
        rotation: rng() * Math.PI * 2,
        scale: 0.78 + rng() * 0.5,
        phase: rng(),
      });
      accepted++;
    }
  }
  return out;
}

/**
 * Standing wheat.
 *
 * The previous canopy laid 55 near-horizontal cards per tile on the ground: a
 * golden carpet, with no volume to catch the key light and nothing for the wind
 * to move. A crop is vertical, so this stands it up — the impostor is a cereal
 * tuft with visible ears, and the base-to-tip gradient does the ripening.
 */
export function PhotorealWheatCanopy({
  tiles,
  mapSeed,
  season = 'summer',
}: PhotorealWheatCanopyProps) {
  const lod = useMapLod();
  const quality = useRenderQuality();
  const surface = useSurfaceHeight();
  const ambient = useAmbientAnimation();
  const map = useTexture('/assets/textures/vegetation/grass_blade_impostor_v3.png?v=wheat-stand-1');

  const density = quality.vegetationDensity * (
    quality.id === 'ultra' ? (lod === 0 ? 1.3 : 0.9)
      : quality.id === 'high' ? 0.85
        : 0.5
  );

  const placements = useMemo(
    () => (season === 'winter'
      ? []
      : buildWheatPlacements(tiles, mapSeed, density, (x, z) => surface.sampleHeight(x, z))),
    [density, mapSeed, season, surface, tiles],
  );

  const palette = WHEAT_SEASON[season as keyof typeof WHEAT_SEASON] ?? WHEAT_SEASON.summer;

  // Texture setup is a side effect, not a memo. three re-uploads on
  // `needsUpdate`, so applying it after mount costs nothing.
  useEffect(() => {
    map.colorSpace = THREE.SRGBColorSpace;
    map.anisotropy = 8;
    map.needsUpdate = true;
  }, [map]);

  if (lod >= 2 || placements.length === 0) return null;
  return (
    <WindFoliage
      placements={placements}
      map={map}
      baseColor={palette.base}
      tipColor={palette.tip}
      height={0.34}
      width={0.14}
      windStrength={0.035}
      windSpeed={1.25}
      animate={ambient.enabled}
      alphaTest={0.4}
      roughness={0.9}
    />
  );
}

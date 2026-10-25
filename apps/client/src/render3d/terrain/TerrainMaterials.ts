import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import type { TerrainType } from '@catanx/engine';
import { TERRAIN_BASE_COLORS, TERRAIN_SIDE_COLORS } from './TerrainCatalog';
import { getBiomeMaterialDefinition } from './BiomeMaterialRegistry';

export interface TerrainMaterialPair {
  top: THREE.MeshStandardMaterial;
  side: THREE.MeshStandardMaterial;
}

function makePair(terrain: TerrainType): TerrainMaterialPair {
  const pbr = getBiomeMaterialDefinition(terrain);
  return {
    top: new THREE.MeshStandardMaterial({
      color: TERRAIN_BASE_COLORS[terrain] ?? '#8899aa',
      roughness: pbr.roughness,
      metalness: pbr.metalness,
      envMapIntensity: pbr.envMapIntensity,
      flatShading: false,
    }),
    side: new THREE.MeshStandardMaterial({
      color: TERRAIN_SIDE_COLORS[terrain] ?? '#667788',
      roughness: 0.95,
      metalness: 0.02,
      flatShading: false,
    }),
  };
}

/** Shared terrain materials for the current map; disposed on unmount. */
export function useTerrainMaterials(terrains: readonly TerrainType[]) {
  const key = useMemo(() => [...new Set(terrains)].sort().join(','), [terrains]);

  const materials = useMemo(() => {
    const map = new Map<TerrainType, TerrainMaterialPair>();
    if (!key) return map;
    for (const terrain of key.split(',') as TerrainType[]) {
      map.set(terrain, makePair(terrain));
    }
    return map;
  }, [key]);

  useEffect(() => {
    return () => {
      for (const pair of materials.values()) {
        pair.top.dispose();
        pair.side.dispose();
      }
    };
  }, [materials]);

  return materials;
}

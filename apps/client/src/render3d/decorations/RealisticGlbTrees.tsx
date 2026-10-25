import { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { useGLTF } from '@react-three/drei';
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { HexTile } from '@catanx/engine';
import type { DecorInstance } from './deterministicDecoration';
import { useMapLod } from '../camera/MapLodContext';
import { useRenderQuality } from '../quality/RenderQualityContext';
import { useSurfaceHeight } from '../terrain/SurfaceHeightContext';
import { cubeToWorld } from '../utils/hexToWorld';
import type { TreeSpecies } from './photorealTreeGeometry';

const TREE_URLS: Record<TreeSpecies, readonly [string, string, string]> = {
  spruce: [
    '/assets/models/realistic/vegetation/realistic_spruce_lod0.glb?v=veg-r2',
    '/assets/models/realistic/vegetation/realistic_spruce_lod1.glb?v=veg-r2',
    '/assets/models/realistic/vegetation/realistic_spruce_lod2.glb?v=veg-r2',
  ],
  pine: [
    '/assets/models/realistic/vegetation/realistic_pine_lod0.glb?v=veg-r2',
    '/assets/models/realistic/vegetation/realistic_pine_lod1.glb?v=veg-r2',
    '/assets/models/realistic/vegetation/realistic_pine_lod2.glb?v=veg-r2',
  ],
  deciduous: [
    '/assets/models/realistic/vegetation/realistic_deciduous_lod0.glb?v=veg-r2',
    '/assets/models/realistic/vegetation/realistic_deciduous_lod1.glb?v=veg-r2',
    '/assets/models/realistic/vegetation/realistic_deciduous_lod2.glb?v=veg-r2',
  ],
  beech: [
    '/assets/models/realistic/vegetation/realistic_beech_lod0.glb?v=veg-r2',
    '/assets/models/realistic/vegetation/realistic_beech_lod1.glb?v=veg-r2',
    '/assets/models/realistic/vegetation/realistic_beech_lod2.glb?v=veg-r2',
  ],
};

const FOLIAGE_COLOR: Record<TreeSpecies, string> = {
  spruce: '#2f5a32',
  pine: '#3a6a38',
  deciduous: '#4a7a3c',
  beech: '#456834',
};

const WINTER_FOLIAGE: Record<TreeSpecies, string> = {
  spruce: '#7a8a78',
  pine: '#6e7e6c',
  deciduous: '#b8b4a8',
  beech: '#aea89c',
};

function speciesForTerrain(terrain: HexTile['terrain'], variant: number): TreeSpecies {
  if (terrain === 'glacier' || terrain === 'tundra') return variant % 4 === 0 ? 'pine' : 'spruce';
  if (terrain === 'jungle' || terrain === 'swamp' || terrain === 'pasture') {
    return variant % 5 === 0 ? 'pine' : variant % 2 === 0 ? 'beech' : 'deciduous';
  }
  if (terrain === 'forest') {
    const species = variant % 7;
    return species <= 1 ? 'spruce' : species === 2 ? 'pine' : species <= 4 ? 'beech' : 'deciduous';
  }
  return variant % 4 === 0 ? 'spruce' : variant % 4 === 1 ? 'pine' : variant % 4 === 2 ? 'beech' : 'deciduous';
}

function pickLod(mapLod: number, quality: string): 0 | 1 | 2 {
  if (quality === 'low' || mapLod >= 2) return 2;
  if (quality === 'balanced' || mapLod === 1) return 1;
  return 0;
}

function isFoliageMesh(mesh: THREE.Mesh): boolean {
  const name = mesh.name.toLowerCase();
  const mat = Array.isArray(mesh.material) ? mesh.material[0] : mesh.material;
  const matName = (mat?.name ?? '').toLowerCase();
  if (
    name.includes('trunk')
    || name.includes('bark')
    || name.includes('cylinder')
    || matName.includes('bark')
    || matName.includes('trunk')
  ) {
    return false;
  }
  if (
    name.includes('crown')
    || name.includes('needle')
    || name.includes('foliage')
    || name.includes('branch')
    || name.includes('puff')
    || name.includes('cone')
    || name.includes('icosphere')
    || name.includes('sphere')
    || matName.includes('needle')
    || matName.includes('foliage')
    || matName.includes('crown')
  ) {
    return true;
  }
  // Default unknown meshes to foliage — bark is the minority volume.
  return true;
}

function mergeNamed(scene: THREE.Object3D, foliage: boolean): THREE.BufferGeometry {
  const geometries: THREE.BufferGeometry[] = [];
  scene.updateMatrixWorld(true);
  scene.traverse((child) => {
    if (!(child instanceof THREE.Mesh) || !child.geometry) return;
    if (isFoliageMesh(child) !== foliage) return;
    const cloned = child.geometry.clone();
    cloned.applyMatrix4(child.matrixWorld);
    geometries.push(cloned);
  });
  if (geometries.length === 0) {
    return foliage
      ? new THREE.ConeGeometry(0.18, 0.55, 8)
      : new THREE.CylinderGeometry(0.02, 0.028, 0.45, 6);
  }
  if (geometries.length === 1) return geometries[0]!;
  const merged = mergeGeometries(geometries, false);
  for (const geometry of geometries) geometry.dispose();
  return merged ?? geometries[0]!;
}

function fillMatrices(
  mesh: THREE.InstancedMesh,
  items: DecorInstance[],
  tilesById: Map<string, HexTile>,
  surface: { sampleHeight: (x: number, z: number) => number },
  dummy: THREE.Object3D,
) {
  for (let index = 0; index < items.length; index++) {
    const item = items[index]!;
    const tile = tilesById.get(item.tileId);
    if (!tile) continue;
    const origin = cubeToWorld(tile.coord);
    const x = origin.x + item.x;
    const z = origin.z + item.z;
    dummy.position.set(x, surface.sampleHeight(x, z), z);
    dummy.rotation.set(0, item.rotation, 0);
    const height = 0.78 + ((item.variant * 5) % 11) * 0.055;
    const width = 0.74 + (item.variant % 6) * 0.085;
    const scale = item.scale * 1.05;
    dummy.scale.set(scale * width, scale * height, scale * width);
    dummy.updateMatrix();
    mesh.setMatrixAt(index, dummy.matrix);
  }
  mesh.count = items.length;
  mesh.instanceMatrix.needsUpdate = true;
  mesh.computeBoundingSphere();
}

function GlbSpeciesLayer({
  species,
  items,
  tilesById,
  castShadow,
  season,
}: {
  species: TreeSpecies;
  items: DecorInstance[];
  tilesById: Map<string, HexTile>;
  castShadow: boolean;
  season: string;
}) {
  const mapLod = useMapLod();
  const quality = useRenderQuality();
  const lod = pickLod(mapLod, quality.id);
  const { scene } = useGLTF(TREE_URLS[species][lod]);
  const surface = useSurfaceHeight();
  const trunkRef = useRef<THREE.InstancedMesh>(null);
  const foliageRef = useRef<THREE.InstancedMesh>(null);
  const dummy = useMemo(() => new THREE.Object3D(), []);
  const trunkGeo = useMemo(() => mergeNamed(scene, false), [scene]);
  const foliageGeo = useMemo(() => mergeNamed(scene, true), [scene]);
  const trunkMat = useMemo(() => new THREE.MeshStandardMaterial({
    color: '#4a3424',
    roughness: 0.96,
    metalness: 0.02,
  }), []);
  const foliageMat = useMemo(() => {
    const color = season === 'winter'
      ? WINTER_FOLIAGE[species]
      : season === 'autumn' && (species === 'deciduous' || species === 'beech')
        ? '#b86a2e'
        : FOLIAGE_COLOR[species];
    return new THREE.MeshStandardMaterial({
      color,
      roughness: 0.9,
      metalness: 0,
      flatShading: false,
    });
  }, [season, species]);

  useLayoutEffect(() => {
    if (items.length === 0) return;
    if (trunkRef.current) fillMatrices(trunkRef.current, items, tilesById, surface, dummy);
    if (foliageRef.current) fillMatrices(foliageRef.current, items, tilesById, surface, dummy);
  }, [dummy, items, surface, tilesById]);

  useEffect(() => () => {
    trunkGeo.dispose();
    foliageGeo.dispose();
    trunkMat.dispose();
    foliageMat.dispose();
  }, [foliageGeo, foliageMat, trunkGeo, trunkMat]);

  if (items.length === 0) return null;
  return (
    <group>
      <instancedMesh
        ref={trunkRef}
        args={[trunkGeo, undefined, items.length]}
        material={trunkMat}
        castShadow={castShadow}
        receiveShadow
        frustumCulled
        raycast={() => undefined}
      />
      <instancedMesh
        ref={foliageRef}
        args={[foliageGeo, undefined, items.length]}
        material={foliageMat}
        castShadow={castShadow}
        receiveShadow
        frustumCulled
        raycast={() => undefined}
      />
    </group>
  );
}

/** Blender-authored volumetric trees — trunk and foliage keep separate materials. */
export function RealisticGlbTrees({
  items,
  tilesById,
  season = 'summer',
  castShadow = true,
}: {
  items: DecorInstance[];
  tilesById: Map<string, HexTile>;
  season?: string;
  castShadow?: boolean;
}) {
  const buckets = useMemo(() => {
    const result: Record<TreeSpecies, DecorInstance[]> = {
      spruce: [],
      pine: [],
      deciduous: [],
      beech: [],
    };
    for (const item of items) {
      if (item.kind !== 'tree') continue;
      const terrain = tilesById.get(item.tileId)?.terrain;
      if (!terrain) continue;
      result[speciesForTerrain(terrain, item.variant)].push(item);
    }
    return result;
  }, [items, tilesById]);

  return (
    <group>
      {(Object.keys(buckets) as TreeSpecies[]).map((species) => (
        <GlbSpeciesLayer
          key={species}
          species={species}
          items={buckets[species]}
          tilesById={tilesById}
          castShadow={castShadow}
          season={season}
        />
      ))}
    </group>
  );
}

useGLTF.preload(TREE_URLS.spruce[0]);
useGLTF.preload(TREE_URLS.pine[0]);
useGLTF.preload(TREE_URLS.deciduous[0]);
useGLTF.preload(TREE_URLS.beech[0]);

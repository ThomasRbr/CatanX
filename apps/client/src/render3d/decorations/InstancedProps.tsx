import { useLayoutEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import type { HexTile } from '@catanx/engine';
import { useVisualGeometry } from '../assets/usePremiumGlb';
import { pickVariantId, PROP_VARIANT_IDS } from '../assets/visualAssetManifest';
import { useMapLod } from '../camera/MapLodContext';
import { HEX_SLAB_THICKNESS } from '../utils/createHexGeometry';
import { cubeToWorld } from '../utils/hexToWorld';
import { shouldCastDecorShadows } from '../utils/perfBudgets';
import type { DecorInstance } from './deterministicDecoration';

interface InstancedPropsProps {
  items: DecorInstance[];
  tilesById: Map<string, HexTile>;
}

const propMat = new THREE.MeshStandardMaterial({
  vertexColors: true,
  roughness: 0.88,
  metalness: 0.04,
  flatShading: false,
});

function PropVariantLayer({
  assetId,
  items,
  tilesById,
  castShadow,
}: {
  assetId: string;
  items: DecorInstance[];
  tilesById: Map<string, HexTile>;
  castShadow: boolean;
}) {
  const geo = useVisualGeometry(assetId);
  const ref = useRef<THREE.InstancedMesh>(null);

  useLayoutEffect(() => {
    const mesh = ref.current;
    if (!mesh || items.length === 0) return;
    const dummy = new THREE.Object3D();
    for (let i = 0; i < items.length; i++) {
      const item = items[i]!;
      const tile = tilesById.get(item.tileId);
      if (!tile) continue;
      const o = cubeToWorld(tile.coord);
      dummy.position.set(o.x + item.x, HEX_SLAB_THICKNESS, o.z + item.z);
      dummy.rotation.set(0, item.rotation, 0);
      dummy.scale.setScalar(item.scale);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    }
    mesh.count = items.length;
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();
  }, [geo, items, tilesById]);

  if (items.length === 0) return null;
  return (
    <instancedMesh
      ref={ref}
      args={[geo, propMat, items.length]}
      castShadow={castShadow}
      receiveShadow
      frustumCulled
      raycast={() => undefined}
    />
  );
}

/** Narrative landmarks (camp, mine, fence, well, barrel) — few instances per map. */
export function InstancedProps({ items, tilesById }: InstancedPropsProps) {
  const lod = useMapLod();
  const castShadow = shouldCastDecorShadows(lod);
  const props = useMemo(() => items.filter((i) => i.kind === 'prop'), [items]);

  const buckets = useMemo(() => {
    const out = PROP_VARIANT_IDS.map(() => [] as DecorInstance[]);
    for (const item of props) {
      const idx = ((item.variant % PROP_VARIANT_IDS.length) + PROP_VARIANT_IDS.length) % PROP_VARIANT_IDS.length;
      out[idx]!.push(item);
    }
    return out;
  }, [props]);

  return (
    <group>
      {PROP_VARIANT_IDS.map((assetId, idx) => (
        <PropVariantLayer
          key={assetId}
          assetId={pickVariantId(PROP_VARIANT_IDS, idx)}
          items={buckets[idx]!}
          tilesById={tilesById}
          castShadow={castShadow}
        />
      ))}
    </group>
  );
}

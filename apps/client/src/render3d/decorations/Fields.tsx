import { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import type { HexTile } from '@catanx/engine';
import {
  createFieldPatchGeometry,
  createFieldRowGeometry,
  createFieldSheafGeometry,
} from '../assets/meshCatalog';
import { useMapLod } from '../camera/MapLodContext';
import { useAmbientAnimation } from '../fx/AmbientAnimationContext';
import { attachInstanceWind, setInstanceWindUniforms } from '../fx/instanceWind';
import { useSurfaceHeight } from '../terrain/SurfaceHeightContext';
import { HEX_SLAB_THICKNESS } from '../utils/createHexGeometry';
import { cubeToWorld } from '../utils/hexToWorld';
import { shouldAnimateDecor } from '../utils/mapLod';
import type { DecorInstance } from './deterministicDecoration';

interface FieldsProps {
  items: readonly DecorInstance[];
  tilesById: Map<string, HexTile>;
  naturalized?: boolean;
  season?: string;
}

const FIELD_MESH_REV = 'field-v8-surface-gold';
const fieldMat = new THREE.MeshStandardMaterial({
  vertexColors: true,
  roughness: 0.88,
  metalness: 0.01,
  flatShading: false,
  color: '#fff4c8',
  emissive: '#3a2e14',
  emissiveIntensity: 0.06,
});
attachInstanceWind(fieldMat, { amp: 0.055, speed: 1.35 });

const FIELD_VARIANTS = [
  { id: 'field_row', build: createFieldRowGeometry, sx: 1.35, sy: 0.95, sz: 1.22 },
  { id: 'field_patch', build: createFieldPatchGeometry, sx: 1.28, sy: 0.9, sz: 1.22 },
  { id: 'field_sheaf', build: createFieldSheafGeometry, sx: 1.2, sy: 0.88, sz: 1.12 },
] as const;

function FieldVariantLayer({
  geo,
  items,
  tilesById,
  sx,
  sy,
  sz,
  naturalized,
}: {
  geo: THREE.BufferGeometry;
  items: readonly DecorInstance[];
  tilesById: Map<string, HexTile>;
  sx: number;
  sy: number;
  sz: number;
  naturalized: boolean;
}) {
  const ref = useRef<THREE.InstancedMesh>(null);
  const dummy = useMemo(() => new THREE.Object3D(), []);
  const surface = useSurfaceHeight();

  useLayoutEffect(() => {
    const mesh = ref.current;
    if (!mesh || items.length === 0) return;
    for (let i = 0; i < items.length; i++) {
      const item = items[i]!;
      const tile = tilesById.get(item.tileId);
      if (!tile) continue;
      const o = cubeToWorld(tile.coord);
      const x = o.x + item.x;
      const z = o.z + item.z;
      const y = naturalized
        ? surface.sampleHeight(x, z) + 0.006
        : HEX_SLAB_THICKNESS;
      dummy.position.set(x, y, z);
      dummy.rotation.set(0, item.rotation, 0);
      dummy.scale.set(item.scale * sx, item.scale * sy, item.scale * sz);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    }
    mesh.count = items.length;
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();
  }, [dummy, geo, items, naturalized, surface, sx, sy, sz, tilesById]);

  if (items.length === 0) return null;
  return (
    <instancedMesh
      ref={ref}
      args={[geo, fieldMat, items.length]}
      receiveShadow
      castShadow={false}
      frustumCulled={false}
      raycast={() => undefined}
    />
  );
}

/**
 * Golden wheat fields — procedural rows/patches with GPU wind undulation.
 * Naturalized diorama seats stalks on the continuous heightfield.
 */
export function Fields({ items, tilesById, naturalized = false }: FieldsProps) {
  const ambient = useAmbientAnimation();
  const lod = useMapLod();
  const sway = shouldAnimateDecor(ambient.enabled, lod);

  const fields = useMemo(() => items.filter((i) => i.kind === 'field'), [items]);
  const buckets = useMemo(() => {
    const out = FIELD_VARIANTS.map(() => [] as DecorInstance[]);
    for (const item of fields) {
      const idx = ((item.variant % FIELD_VARIANTS.length) + FIELD_VARIANTS.length) % FIELD_VARIANTS.length;
      out[idx]!.push(item);
    }
    return out;
  }, [fields]);

  const geos = useMemo(() => FIELD_VARIANTS.map((v) => v.build()), [FIELD_MESH_REV]);

  useEffect(() => {
    return () => {
      for (const g of geos) g.dispose();
    };
  }, [geos]);

  useFrame(() => {
    const t = sway ? ambient.time : 0;
    const strength = sway ? ambient.windStrength * 0.85 : 0;
    setInstanceWindUniforms(fieldMat, t, strength, ambient.windAngle);
  });

  if (naturalized) {
    // Toy stalk meshes read as yellow placeholders on the diorama path.
    // PhotorealWheatCanopy owns plains volume instead.
    return null;
  }

  if (fields.length === 0 || lod >= 2) return null;

  return (
    <group>
      {FIELD_VARIANTS.map((variant, idx) => (
        <FieldVariantLayer
          key={variant.id}
          geo={geos[idx]!}
          items={buckets[idx]!}
          tilesById={tilesById}
          sx={variant.sx}
          sy={variant.sy}
          sz={variant.sz}
          naturalized={naturalized}
        />
      ))}
    </group>
  );
}

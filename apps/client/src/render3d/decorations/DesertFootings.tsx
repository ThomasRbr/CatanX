import { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import type { HexTile } from '@catanx/engine';
import { createHexSlabGeometry, HEX_SLAB_THICKNESS } from '../utils/createHexGeometry';
import { cubeToWorld, HEX_WORLD_RADIUS } from '../utils/hexToWorld';

interface DesertFootingsProps {
  tiles: HexTile[];
}

/** Warm sand — matches dune body / desert floor family. */
const SAND = '#e0c898';

function createSandPlate(): THREE.BufferGeometry {
  const plate = createHexSlabGeometry(HEX_WORLD_RADIUS, 0.055, 1.0);
  const pos = plate.getAttribute('position');
  const colors = new Float32Array(pos.count * 3);
  const c = new THREE.Color(SAND);
  for (let i = 0; i < pos.count; i++) {
    const n = 0.94 + ((i * 13) % 6) * 0.015;
    colors[i * 3] = c.r * n;
    colors[i * 3 + 1] = c.g * n;
    colors[i * 3 + 2] = c.b * n;
  }
  plate.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  plate.computeVertexNormals();
  return plate;
}

const footingMat = new THREE.MeshStandardMaterial({
  vertexColors: true,
  roughness: 0.98,
  metalness: 0.01,
  flatShading: false,
  color: '#ffffff',
});

const SKIRT_REV = 'desert-sand-v1';

/**
 * Full-hex sand plate under desert tiles so the floor reads as sand edge-to-edge.
 */
export function DesertFootings({ tiles }: DesertFootingsProps) {
  const desertTiles = useMemo(() => tiles.filter((t) => t.terrain === 'desert'), [tiles]);
  const plateGeo = useMemo(() => createSandPlate(), [SKIRT_REV]);
  const plateRef = useRef<THREE.InstancedMesh>(null);

  useEffect(() => {
    return () => {
      plateGeo.dispose();
    };
  }, [plateGeo]);

  useLayoutEffect(() => {
    const mesh = plateRef.current;
    if (!mesh || desertTiles.length === 0) return;
    const dummy = new THREE.Object3D();
    for (let i = 0; i < desertTiles.length; i++) {
      const tile = desertTiles[i]!;
      const o = cubeToWorld(tile.coord);
      dummy.position.set(o.x, HEX_SLAB_THICKNESS + 0.001, o.z);
      dummy.rotation.set(0, 0, 0);
      dummy.scale.set(1, 1, 1);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    }
    mesh.count = desertTiles.length;
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();
  }, [desertTiles]);

  if (desertTiles.length === 0) return null;

  return (
    <instancedMesh
      ref={plateRef}
      args={[plateGeo, undefined, desertTiles.length]}
        material={footingMat}
      receiveShadow
      frustumCulled={false}
      raycast={() => undefined}
    />
  );
}

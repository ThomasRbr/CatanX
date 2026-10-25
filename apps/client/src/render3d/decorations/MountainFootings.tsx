import { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import type { HexTile } from '@catanx/engine';
import { createHexSlabGeometry, HEX_SLAB_THICKNESS } from '../utils/createHexGeometry';
import { cubeToWorld, HEX_WORLD_RADIUS } from '../utils/hexToWorld';

interface MountainFootingsProps {
  tiles: HexTile[];
}

const MOUNTAIN_TERRAINS = new Set(['mountain', 'goldmine']);

/** Matches peak apron granite exactly. */
const MTN_ROCK = '#7a7872';

/**
 * Thin hex rock plate under peaks — same hue as the peak mesh apron.
 * Peak mesh already fills the floor; this seals seams at instance edges.
 */
function createRockPlate(): THREE.BufferGeometry {
  const plate = createHexSlabGeometry(HEX_WORLD_RADIUS, 0.06, 1.0);
  const pos = plate.getAttribute('position');
  const colors = new Float32Array(pos.count * 3);
  const c = new THREE.Color(MTN_ROCK);
  for (let i = 0; i < pos.count; i++) {
    colors[i * 3] = c.r;
    colors[i * 3 + 1] = c.g;
    colors[i * 3 + 2] = c.b;
  }
  plate.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  plate.computeVertexNormals();
  return plate;
}

const footingMat = new THREE.MeshStandardMaterial({
  vertexColors: true,
  roughness: 0.95,
  metalness: 0.04,
  flatShading: false,
  color: '#ffffff',
});

const SKIRT_REV = 'skirt-v9-flush-hex';

/**
 * Matching granite footing — no second color, no empty hex floor.
 */
export function MountainFootings({ tiles }: MountainFootingsProps) {
  const mountainTiles = useMemo(
    () => tiles.filter((t) => MOUNTAIN_TERRAINS.has(t.terrain)),
    [tiles],
  );

  const plateGeo = useMemo(() => createRockPlate(), [SKIRT_REV]);
  const plateRef = useRef<THREE.InstancedMesh>(null);

  useEffect(() => {
    return () => {
      plateGeo.dispose();
    };
  }, [plateGeo]);

  useLayoutEffect(() => {
    const mesh = plateRef.current;
    if (!mesh || mountainTiles.length === 0) return;
    const dummy = new THREE.Object3D();
    for (let i = 0; i < mountainTiles.length; i++) {
      const tile = mountainTiles[i]!;
      const o = cubeToWorld(tile.coord);
      dummy.position.set(o.x, HEX_SLAB_THICKNESS + 0.001, o.z);
      dummy.rotation.set(0, 0, 0);
      dummy.scale.set(1, 1, 1);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    }
    mesh.count = mountainTiles.length;
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();
  }, [mountainTiles]);

  if (mountainTiles.length === 0) return null;

  return (
    <instancedMesh
      ref={plateRef}
      args={[plateGeo, undefined, mountainTiles.length]}
        material={footingMat}
      receiveShadow
      frustumCulled={false}
      raycast={() => undefined}
    />
  );
}

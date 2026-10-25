import { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import type { HexTile } from '@catanx/engine';
import { createHexSlabGeometry, HEX_SLAB_THICKNESS } from '../utils/createHexGeometry';
import { cubeToWorld, HEX_WORLD_RADIUS } from '../utils/hexToWorld';

interface PlainsFootingsProps {
  tiles: HexTile[];
}

/** Warm golden soil under wheat. */
const SOIL = '#f0d848';

function createSoilPlate(): THREE.BufferGeometry {
  const plate = createHexSlabGeometry(HEX_WORLD_RADIUS, 0.05, 1.0);
  const pos = plate.getAttribute('position');
  const colors = new Float32Array(pos.count * 3);
  const c = new THREE.Color(SOIL);
  for (let i = 0; i < pos.count; i++) {
    const n = 0.94 + ((i * 9) % 5) * 0.016;
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
  roughness: 0.96,
  metalness: 0.02,
  flatShading: false,
  color: '#ffffff',
});

const SKIRT_REV = 'plains-soil-v4-vivid';

export function PlainsFootings({ tiles }: PlainsFootingsProps) {
  const plainsTiles = useMemo(() => tiles.filter((t) => t.terrain === 'plains'), [tiles]);
  const plateGeo = useMemo(() => createSoilPlate(), [SKIRT_REV]);
  const plateRef = useRef<THREE.InstancedMesh>(null);

  useEffect(() => {
    return () => {
      plateGeo.dispose();
    };
  }, [plateGeo]);

  useLayoutEffect(() => {
    const mesh = plateRef.current;
    if (!mesh || plainsTiles.length === 0) return;
    const dummy = new THREE.Object3D();
    for (let i = 0; i < plainsTiles.length; i++) {
      const tile = plainsTiles[i]!;
      const o = cubeToWorld(tile.coord);
      dummy.position.set(o.x, HEX_SLAB_THICKNESS + 0.001, o.z);
      dummy.rotation.set(0, 0, 0);
      dummy.scale.set(1, 1, 1);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    }
    mesh.count = plainsTiles.length;
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();
  }, [plainsTiles]);

  if (plainsTiles.length === 0) return null;

  return (
    <instancedMesh
      ref={plateRef}
      args={[plateGeo, footingMat, plainsTiles.length]}
      receiveShadow
      frustumCulled={false}
      raycast={() => undefined}
    />
  );
}

import { useEffect, useMemo } from 'react';
import { useTexture } from '@react-three/drei';
import * as THREE from 'three';

interface SettlementGroundApronProps {
  radius?: number;
  rotation?: number;
  y?: number;
  season?: string;
}

function createSoftIrregularDisc(): THREE.BufferGeometry {
  const geometry = new THREE.CircleGeometry(1, 64);
  const position = geometry.getAttribute('position');
  for (let index = 1; index < position.count; index++) {
    const x = position.getX(index);
    const y = position.getY(index);
    const angle = Math.atan2(y, x);
    const radius = Math.hypot(x, y);
    const irregularity = 1 + Math.sin(angle * 5 + 0.8) * 0.035 + Math.sin(angle * 9 - 0.4) * 0.018;
    position.setXY(index, x * irregularity * radius, y * irregularity * radius);
  }
  position.needsUpdate = true;
  geometry.computeVertexNormals();
  return geometry;
}

function createRadialAlpha(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Unable to create settlement ground alpha mask');
  const gradient = context.createRadialGradient(128, 128, 18, 128, 128, 126);
  gradient.addColorStop(0, 'rgba(255,255,255,1)');
  gradient.addColorStop(0.28, 'rgba(255,255,255,0.88)');
  gradient.addColorStop(0.58, 'rgba(255,255,255,0.48)');
  gradient.addColorStop(0.8, 'rgba(255,255,255,0.16)');
  gradient.addColorStop(1, 'rgba(255,255,255,0)');
  context.fillStyle = gradient;
  context.fillRect(0, 0, 256, 256);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.NoColorSpace;
  texture.needsUpdate = true;
  return texture;
}

/** Dirt, gravel and worn paths that visually seat a settlement into the land. */
export function SettlementGroundApron({
  radius = 0.42,
  rotation = 0,
  y = -0.058,
  season = 'summer',
}: SettlementGroundApronProps) {
  const [albedo, normal, roughness, ao, height] = useTexture([
    '/assets/textures/buildings/photoreal/village_ground_albedo_1.jpg',
    '/assets/textures/buildings/photoreal/village_ground_normal_1.webp',
    '/assets/textures/buildings/photoreal/village_ground_roughness_1.jpg',
    '/assets/textures/buildings/photoreal/village_ground_ao_1.jpg',
    '/assets/textures/buildings/photoreal/village_ground_height_1.jpg',
  ]);
  const geometry = useMemo(createSoftIrregularDisc, []);
  const alphaMap = useMemo(createRadialAlpha, []);

  useEffect(() => {
    albedo.colorSpace = THREE.SRGBColorSpace;
    for (const texture of [albedo, normal, roughness, ao, height]) {
      texture.wrapS = THREE.RepeatWrapping;
      texture.wrapT = THREE.RepeatWrapping;
      texture.repeat.set(1.15, 1.15);
      texture.anisotropy = 8;
      texture.needsUpdate = true;
    }
    if (!geometry.getAttribute('uv2') && geometry.getAttribute('uv')) {
      geometry.setAttribute('uv2', geometry.getAttribute('uv'));
    }
    return () => {
      geometry.dispose();
      alphaMap.dispose();
    };
  }, [albedo, alphaMap, ao, geometry, height, normal, roughness]);

  return (
    <mesh
      geometry={geometry}
      position={[0, y, 0]}
      rotation={[-Math.PI / 2, 0, rotation]}
      scale={[radius, radius, radius]}
      receiveShadow
      raycast={() => undefined}
      renderOrder={1}
    >
      <meshStandardMaterial
        map={albedo}
        normalMap={normal}
        normalScale={new THREE.Vector2(0.42, 0.42)}
        roughnessMap={roughness}
        aoMap={ao}
        aoMapIntensity={0.58}
        bumpMap={height}
        bumpScale={0.024}
        alphaMap={alphaMap}
        transparent
        opacity={season === 'winter' ? 0.22 : 0.68}
        color={season === 'winter' ? '#c3cbca' : '#b9a88e'}
        depthWrite={false}
        roughness={0.97}
        metalness={0}
        polygonOffset
        polygonOffsetFactor={-1.5}
        polygonOffsetUnits={-1.5}
      />
    </mesh>
  );
}

import { useEffect, useMemo } from 'react';
import { useTexture } from '@react-three/drei';
import * as THREE from 'three';
import {
  createBarrelGeometry,
  createCrateGeometry,
  createFenceGeometry,
} from '../assets/meshCatalog';
import { RealisticSettlementAsset } from './RealisticSettlementAsset';

interface RealisticVillageProps {
  castShadow: boolean;
  urban?: boolean;
  scale?: number;
  season?: string;
  villageId?: string;
  roofColor?: string | null;
}

function hashVillage(id: string): number {
  let hash = 2166136261;
  for (let index = 0; index < id.length; index++) {
    hash ^= id.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function VillageYardProps({
  seed,
  radius,
  castShadow,
  season,
}: {
  seed: number;
  radius: number;
  castShadow: boolean;
  season: string;
}) {
  const fenceGeo = useMemo(createFenceGeometry, []);
  const crateGeo = useMemo(createCrateGeometry, []);
  const barrelGeo = useMemo(createBarrelGeometry, []);
  const woodMat = useMemo(() => new THREE.MeshStandardMaterial({
    color: season === 'winter' ? '#8a8680' : '#6a5040',
    roughness: 0.92,
    metalness: 0.02,
  }), [season]);
  const crateMat = useMemo(() => new THREE.MeshStandardMaterial({
    color: season === 'winter' ? '#9a9084' : '#8a6a48',
    roughness: 0.9,
    metalness: 0.02,
  }), [season]);

  useEffect(() => () => {
    fenceGeo.dispose();
    crateGeo.dispose();
    barrelGeo.dispose();
    woodMat.dispose();
    crateMat.dispose();
  }, [barrelGeo, crateGeo, crateMat, fenceGeo, woodMat]);

  const placements = useMemo(() => {
    const items: Array<{
      kind: 'fence' | 'crate' | 'barrel';
      x: number;
      z: number;
      y: number;
      rot: number;
      scale: number;
    }> = [];
    // Outer fence arc only — GLB already bakes courtyard props; avoid double clutter
    // that clips through roofs on the close village shot.
    for (let i = 0; i < 4; i++) {
      const angle = ((seed % 7) * 0.37 + i * 0.95 + 0.55) % (Math.PI * 2);
      if ((seed + i * 3) % 5 === 0) continue;
      items.push({
        kind: 'fence',
        x: Math.cos(angle) * radius * 0.96,
        z: Math.sin(angle) * radius * 0.96,
        y: 0.01,
        rot: angle + Math.PI / 2,
        scale: 0.55 + ((seed >> (i + 1)) % 5) * 0.04,
      });
    }
    for (let i = 0; i < 2; i++) {
      const angle = (seed * 0.017 + i * 2.4 + 1.1) % (Math.PI * 2);
      items.push({
        kind: i % 2 === 0 ? 'crate' : 'barrel',
        x: Math.cos(angle) * radius * 0.88,
        z: Math.sin(angle) * radius * 0.88,
        y: 0.012,
        rot: angle * 0.7,
        scale: 0.7 + (i % 3) * 0.08,
      });
    }
    return items;
  }, [radius, seed]);

  return (
    <group>
      {placements.map((item, index) => (
        <mesh
          key={`${item.kind}-${index}`}
          geometry={item.kind === 'fence' ? fenceGeo : item.kind === 'crate' ? crateGeo : barrelGeo}
          material={item.kind === 'fence' ? woodMat : crateMat}
          position={[item.x, item.y, item.z]}
          rotation={[0, item.rot, 0]}
          scale={item.scale}
          castShadow={castShadow}
          receiveShadow
          raycast={() => undefined}
        />
      ))}
    </group>
  );
}

function VillageGround({
  radius,
  season,
  rotation,
}: {
  radius: number;
  season: string;
  rotation: number;
}) {
  const [albedo, normal, roughness, ao] = useTexture([
    '/assets/textures/buildings/photoreal/village_ground_albedo_1_s512.webp',
    '/assets/textures/buildings/photoreal/village_ground_normal_1_s512.webp',
    '/assets/textures/buildings/photoreal/village_ground_roughness_1_s256.webp',
    '/assets/textures/buildings/photoreal/village_ground_ao_1_s256.webp',
  ]);
  const geometry = useMemo(() => {
    const geo = new THREE.CircleGeometry(1, 64);
    const position = geo.getAttribute('position');
    for (let index = 1; index < position.count; index++) {
      const x = position.getX(index);
      const y = position.getY(index);
      const angle = Math.atan2(y, x);
      const irregularity = 1
        + Math.sin(angle * 4.2 + 0.6) * 0.07
        + Math.sin(angle * 9.1 - 0.3) * 0.035
        + Math.sin(angle * 2.1) * 0.04;
      position.setXY(index, x * irregularity, y * irregularity);
    }
    position.needsUpdate = true;
    geo.computeVertexNormals();
    return geo;
  }, []);
  const alphaMap = useMemo(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 256;
    const ctx = canvas.getContext('2d')!;
    const image = ctx.createImageData(256, 256);
    for (let y = 0; y < 256; y++) {
      for (let x = 0; x < 256; x++) {
        const nx = (x - 128) / 128;
        const ny = (y - 128) / 128;
        const angle = Math.atan2(ny, nx);
        // Irregular rim so the dirt disc never reads as a hard token pad.
        const rim = 1
          + Math.sin(angle * 5.1 + 0.4) * 0.07
          + Math.sin(angle * 11.3 - 0.8) * 0.04
          + Math.sin(angle * 2.7) * 0.05;
        const r = Math.hypot(nx, ny) / rim;
        // Long soft feather into prairie.
        let a = 1 - THREE.MathUtils.smoothstep(0.12, 0.98, r);
        a *= a;
        // Micro noise breaks concentric banding.
        const noise = Math.abs(Math.sin(x * 12.9898 + y * 78.233) * 43758.5453) % 1;
        a = THREE.MathUtils.clamp(a * (0.92 + noise * 0.12) - (r > 0.55 ? noise * 0.08 : 0), 0, 1);
        const i = (y * 256 + x) * 4;
        const v = Math.round(a * 255);
        image.data[i] = v;
        image.data[i + 1] = v;
        image.data[i + 2] = v;
        image.data[i + 3] = 255;
      }
    }
    ctx.putImageData(image, 0, 0);
    const texture = new THREE.CanvasTexture(canvas);
    texture.needsUpdate = true;
    return texture;
  }, []);

  useEffect(() => {
    albedo.colorSpace = THREE.SRGBColorSpace;
    for (const texture of [albedo, normal, roughness, ao]) {
      texture.wrapS = THREE.RepeatWrapping;
      texture.wrapT = THREE.RepeatWrapping;
      texture.repeat.set(1.45, 1.45);
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
  }, [albedo, alphaMap, ao, geometry, normal, roughness]);

  return (
    <mesh
      geometry={geometry}
      position={[0, 0.002, 0]}
      rotation={[-Math.PI / 2, 0, rotation]}
      scale={[radius, radius, radius]}
      receiveShadow
      raycast={() => undefined}
    >
      <meshStandardMaterial
        map={albedo}
        normalMap={normal}
        normalScale={new THREE.Vector2(0.48, 0.48)}
        roughnessMap={roughness}
        aoMap={ao}
        aoMapIntensity={0.72}
        alphaMap={alphaMap}
        transparent
        opacity={season === 'winter' ? 0.1 : 0.28}
        color={season === 'winter' ? '#c5cdc9' : '#655644'}
        depthWrite={false}
        roughness={0.98}
        metalness={0}
        polygonOffset
        polygonOffsetFactor={-1.5}
      />
    </mesh>
  );
}

/**
 * Cinematic hamlet: Blender GLB core (pitched roofs + baked AO) seated on a
 * soft dirt apron. Procedural box houses were retired — they read as toys
 * against the photo diorama reference.
 */
export function RealisticVillage({
  castShadow,
  urban = false,
  scale = 1,
  season = 'summer',
  villageId = 'village',
  roofColor = null,
}: RealisticVillageProps) {
  const seed = hashVillage(villageId);
  const radius = urban ? 0.62 : 0.48;

  return (
    <group scale={[scale, scale, scale]}>
      <VillageGround radius={radius * 1.18} season={season} rotation={(seed % 7) * 0.4} />
      {/* Soft path through the square — breaks the token-pad silhouette. */}
      <mesh
        position={[0.02, 0.003, 0.01]}
        rotation={[-Math.PI / 2, 0, 0.4]}
        receiveShadow
        raycast={() => undefined}
      >
        <planeGeometry args={[radius * 1.35, 0.055]} />
        <meshStandardMaterial
          color={season === 'winter' ? '#c8cfcd' : '#5f4c38'}
          roughness={1}
          transparent
          opacity={season === 'winter' ? 0.2 : 0.32}
          depthWrite={false}
          polygonOffset
          polygonOffsetFactor={-1}
        />
      </mesh>
      <VillageYardProps
        seed={seed}
        radius={radius}
        castShadow={castShadow}
        season={season}
      />
      {/* Sink foundations into the apron for contact shadow / AO read. */}
      <group position={[0, -0.022, 0]}>
        <RealisticSettlementAsset
          castShadow={castShadow}
          urban={urban}
          scale={urban ? 0.98 : 1.0}
          season={season}
          roofColor={roofColor}
        />
      </group>
    </group>
  );
}

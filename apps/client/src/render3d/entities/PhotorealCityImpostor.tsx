import { useEffect } from 'react';
import { useTexture } from '@react-three/drei';
import * as THREE from 'three';

/**
 * High-detail architectural cutout for the fixed Diorama camera.
 * Gameplay ownership and picking remain on the parent building group.
 */
export function PhotorealCityImpostor({ kind = 'city' }: { kind?: 'city' | 'settlement' }) {
  const texture = useTexture(kind === 'city'
    ? '/assets/textures/buildings/photoreal/medieval_city_impostor_v1.png'
    : '/assets/textures/buildings/photoreal/medieval_settlement_impostor_v1.png');
  const city = kind === 'city';

  useEffect(() => {
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = 12;
    texture.generateMipmaps = true;
    texture.minFilter = THREE.LinearMipmapLinearFilter;
    texture.magFilter = THREE.LinearFilter;
    texture.needsUpdate = true;
  }, [texture]);

  return (
    <sprite
      position={[0, city ? 0.365 : 0.285, 0]}
      scale={city ? [0.9, 0.72, 1] : [0.68, 0.544, 1]}
      raycast={() => undefined}
      renderOrder={4}
    >
      <spriteMaterial
        map={texture}
        color="#d8d2c7"
        alphaTest={0.055}
        transparent={false}
        depthWrite
        depthTest
        toneMapped
      />
    </sprite>
  );
}

import { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import type { HexTile } from '@catanx/engine';
import { hexNeighbor, hexToId } from '@catanx/engine';
import { useTexture } from '@react-three/drei';
import * as THREE from 'three';
import { isWaterTerrain } from '../decorations/deterministicDecoration';
import { cubeToWorld, HEX_WORLD_RADIUS } from '../utils/hexToWorld';
import { hashString } from '../utils/seededVisualRandom';
import { useRenderQuality } from '../quality/RenderQualityContext';
import { useSurfaceHeight } from './SurfaceHeightContext';

interface CoastalWetRocksProps {
  tiles: readonly HexTile[];
  mapSeed: number;
  season?: string;
}

interface WetRockPlacement {
  x: number;
  z: number;
  scale: number;
  rotation: number;
}

/**
 * Wet coastal boulders + spray stones. Breaks the cardboard-cut shoreline and
 * gives the foam something physical to break against.
 */
export function CoastalWetRocks({ tiles, mapSeed, season = 'summer' }: CoastalWetRocksProps) {
  const quality = useRenderQuality();
  const surface = useSurfaceHeight();
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const dummy = useMemo(() => new THREE.Object3D(), []);
  const [albedo, normal, roughness, ao] = useTexture([
    '/assets/textures/terrain/photoreal/coastal_cliff_albedo_1.jpg',
    '/assets/textures/terrain/photoreal/coastal_cliff_normal_1.webp',
    '/assets/textures/terrain/photoreal/coastal_cliff_roughness_1.jpg',
    '/assets/textures/terrain/photoreal/coastal_cliff_ao_1.jpg',
  ]);

  const placements = useMemo(() => {
    if (quality.id === 'low') return [] as WetRockPlacement[];
    const tileMap = new Map(tiles.map((tile) => [tile.id, tile]));
    const density = quality.id === 'ultra' ? 1.2 : quality.id === 'high' ? 1.0 : 0.7;
    const out: WetRockPlacement[] = [];
    for (const tile of tiles) {
      // Glacier shores get drifting pack ice (IceFloes) instead of brown boulders.
      if (isWaterTerrain(tile.terrain) || tile.terrain === 'glacier') continue;
      const origin = cubeToWorld(tile.coord);
      for (let direction = 0; direction < 6; direction++) {
        const neighbor = tileMap.get(hexToId(hexNeighbor(tile.coord, direction as 0 | 1 | 2 | 3 | 4 | 5)));
        if (!neighbor || (neighbor.terrain !== 'ocean' && neighbor.terrain !== 'coast')) continue;
        const count = Math.round((3 + (hashString(`${mapSeed}:${tile.id}:${direction}`) % 4)) * density);
        for (let i = 0; i < count; i++) {
          const seed = hashString(`${mapSeed}:wet:${tile.id}:${direction}:${i}`);
          const t = ((seed % 1000) / 1000);
          const angle = THREE.MathUtils.degToRad(60 * ((6 - direction) % 6) - 30);
          const along = (t - 0.5) * HEX_WORLD_RADIUS * 1.15;
          const outward = 0.68 + ((seed >> 8) % 100) / 100 * 0.42;
          const x = origin.x + Math.cos(angle) * HEX_WORLD_RADIUS * outward
            + Math.cos(angle + Math.PI / 2) * along;
          const z = origin.z + Math.sin(angle) * HEX_WORLD_RADIUS * outward
            + Math.sin(angle + Math.PI / 2) * along;
          out.push({
            x,
            z,
            scale: 0.04 + ((seed >> 4) % 55) / 1000,
            rotation: ((seed % 628) / 100),
          });
        }
      }
    }
    return out;
  }, [mapSeed, quality.id, tiles]);

  const geometry = useMemo(() => {
    // A subdivided dodecahedron is a ball; with a clear coat reflecting the
    // dark sea it rendered as a ring of black marbles round the island.
    // Fractured, flattened boulders instead.
    const geo = new THREE.IcosahedronGeometry(1, 2);
    const position = geo.getAttribute('position');
    for (let index = 0; index < position.count; index++) {
      const x = position.getX(index);
      const y = position.getY(index);
      const z = position.getZ(index);
      const fracture = 1
        + Math.sin(x * 4.1 + z * 2.3) * 0.12
        + Math.sin(y * 5.7 - x * 3.1) * 0.08
        + Math.sin((x + y * 1.7 - z) * 9.3) * 0.035;
      position.setXYZ(index, x * fracture * 1.1, Math.max(-0.35, y) * fracture * 0.62, z * fracture);
    }
    position.needsUpdate = true;
    geo.computeVertexNormals();
    if (!geo.getAttribute('uv2') && geo.getAttribute('uv')) {
      geo.setAttribute('uv2', geo.getAttribute('uv'));
    }
    return geo;
  }, []);

  const material = useMemo(() => {
    albedo.colorSpace = THREE.SRGBColorSpace;
    for (const texture of [albedo, normal, roughness, ao]) {
      texture.wrapS = THREE.RepeatWrapping;
      texture.wrapT = THREE.RepeatWrapping;
      texture.repeat.set(1.4, 1.4);
      texture.anisotropy = 8;
      texture.needsUpdate = true;
    }
    return new THREE.MeshPhysicalMaterial({
      map: albedo,
      normalMap: normal,
      normalScale: new THREE.Vector2(0.55, 0.55),
      roughnessMap: roughness,
      aoMap: ao,
      aoMapIntensity: 0.7,
      color: season === 'winter' ? '#b3b9ba' : '#a39d90',
      roughness: season === 'winter' ? 0.62 : 0.55,
      metalness: 0,
      clearcoat: 0.22,
      clearcoatRoughness: 0.4,
      envMapIntensity: 0.9,
    });
  }, [albedo, ao, normal, roughness, season]);

  useLayoutEffect(() => {
    const mesh = meshRef.current;
    if (!mesh || placements.length === 0) return;
    for (let index = 0; index < placements.length; index++) {
      const rock = placements[index]!;
      const y = THREE.MathUtils.clamp(
        surface.sampleHeight(rock.x, rock.z) * 0.35 - 0.03,
        -0.055,
        0.025,
      );
      dummy.position.set(rock.x, y, rock.z);
      dummy.rotation.set(rock.rotation * 0.3, rock.rotation, rock.rotation * 0.2);
      dummy.scale.set(rock.scale * 1.85, rock.scale * 1.15, rock.scale * 1.55);
      dummy.updateMatrix();
      mesh.setMatrixAt(index, dummy.matrix);
    }
    mesh.count = placements.length;
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();
  }, [dummy, placements, surface]);

  useEffect(() => () => {
    geometry.dispose();
    material.dispose();
  }, [geometry, material]);

  if (placements.length === 0) return null;
  return (
    <instancedMesh
      ref={meshRef}
      args={[geometry, undefined, placements.length]}
      material={material}
      castShadow={false}
      receiveShadow
      raycast={() => undefined}
    />
  );
}

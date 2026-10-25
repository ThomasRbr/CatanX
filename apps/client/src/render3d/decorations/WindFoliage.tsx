import { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

export interface FoliagePlacement {
  x: number;
  z: number;
  /** World Y of the ground under this clump. */
  y: number;
  rotation: number;
  scale: number;
  /** 0..1, decorrelates the wind phase between neighbours. */
  phase: number;
}

export interface WindFoliageProps {
  placements: readonly FoliagePlacement[];
  map: THREE.Texture;
  /** Colour at the ground. */
  baseColor: THREE.ColorRepresentation;
  /** Colour at the tip — the ripening gradient that sells a cereal crop. */
  tipColor: THREE.ColorRepresentation;
  /** Clump height and width in world units at scale 1. */
  height: number;
  width: number;
  /** Horizontal sway in world units at the tip. */
  windStrength?: number;
  windSpeed?: number;
  animate?: boolean;
  /** Blades below this alpha are discarded outright. */
  alphaTest?: number;
  roughness?: number;
  castShadow?: boolean;
  renderOrder?: number;
}

/**
 * Crossed billboard planes, pivoted at the ground.
 *
 * Two quads at right angles read as a volume from any horizontal direction,
 * which is what a single billboard cannot do once the camera orbits. The `aTip`
 * attribute carries 0 at the base and 1 at the top so the shader can bend the
 * clump without a skeleton.
 */
function createClumpGeometry(width: number, height: number): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  for (let index = 0; index < 2; index++) {
    const plane = new THREE.PlaneGeometry(width, height, 1, 3);
    plane.translate(0, height / 2, 0);
    plane.rotateY((index * Math.PI) / 2);
    parts.push(plane);
  }
  const merged = mergeGeometries(parts, false);
  for (const part of parts) part.dispose();
  if (!merged) throw new Error('Unable to merge foliage clump');

  const position = merged.getAttribute('position');
  const tip = new Float32Array(position.count);
  for (let index = 0; index < position.count; index++) {
    tip[index] = THREE.MathUtils.clamp(position.getY(index) / height, 0, 1);
  }
  merged.setAttribute('aTip', new THREE.BufferAttribute(tip, 1));
  merged.computeBoundingBox();
  merged.computeBoundingSphere();
  return merged;
}

/**
 * Instanced wind-animated vegetation.
 *
 * Replaces flat ground cards. A field is not a texture lying on the floor: it
 * has standing volume that catches the key light on one side, casts into itself,
 * and moves. The wind term bends by `aTip` squared so the base stays planted
 * while the heads travel, which is how a stalk actually behaves.
 */
export function WindFoliage({
  placements,
  map,
  baseColor,
  tipColor,
  height,
  width,
  windStrength = 0.05,
  windSpeed = 1.1,
  animate = true,
  alphaTest = 0.42,
  roughness = 0.86,
  castShadow = false,
  renderOrder,
}: WindFoliageProps) {
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const geometry = useMemo(() => createClumpGeometry(width, height), [height, width]);

  const uniforms = useMemo(
    () => ({
      uTime: { value: 0 },
      uWind: { value: windStrength },
      uWindSpeed: { value: windSpeed },
      uBase: { value: new THREE.Color(baseColor) },
      uTip: { value: new THREE.Color(tipColor) },
    }),
    // Values are pushed each frame; rebuilding would drop the shader binding.
    [],
  );

  const material = useMemo(() => {
    const result = new THREE.MeshStandardMaterial({
      map,
      // alphaTest rather than transparent: the clumps write depth, so they sort
      // against each other and the terrain for free. Thousands of transparent
      // quads would need a back-to-front sort every frame and still z-fight.
      alphaTest,
      transparent: false,
      side: THREE.DoubleSide,
      roughness,
      metalness: 0,
    });

    result.onBeforeCompile = (shader) => {
      Object.assign(shader.uniforms, uniforms);
      shader.vertexShader = shader.vertexShader
        .replace(
          '#include <common>',
          `#include <common>
          attribute float aTip;
          uniform float uTime;
          uniform float uWind;
          uniform float uWindSpeed;
          varying float vTipFactor;`,
        )
        .replace(
          '#include <begin_vertex>',
          `#include <begin_vertex>
          vTipFactor = aTip;
          vec4 catanxFoliageWorld = modelMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
          // Phase by world position so neighbouring clumps lean together into a
          // travelling gust instead of each swaying on its own clock.
          float catanxGust = sin(catanxFoliageWorld.x * 0.7 + catanxFoliageWorld.z * 0.5 + uTime * uWindSpeed);
          float catanxFlutter = sin(catanxFoliageWorld.x * 3.1 - catanxFoliageWorld.z * 2.4 + uTime * uWindSpeed * 2.7);
          float catanxBend = (catanxGust * 0.75 + catanxFlutter * 0.25) * uWind * aTip * aTip;
          transformed.x += catanxBend;
          transformed.z += catanxBend * 0.45;
          // Bending shortens the clump; without this the tips stretch upward.
          transformed.y -= abs(catanxBend) * 0.35;`,
        );
      shader.fragmentShader = shader.fragmentShader
        .replace(
          '#include <common>',
          `#include <common>
          uniform vec3 uBase;
          uniform vec3 uTip;
          varying float vTipFactor;`,
        )
        .replace(
          '#include <color_fragment>',
          `#include <color_fragment>
          // Re-colour from luminance rather than multiplying.
          //
          // The impostor is a photograph of green grass. Multiplying it by a
          // gold tint does not make gold wheat — it makes dark, muddy brown,
          // because the texture's green channel is the only one with signal and
          // the tint's blue channel kills it. Taking luminance keeps the blade
          // structure and self-shadowing while letting the palette own the hue.
          float catanxLuma = dot(diffuseColor.rgb, vec3(0.2126, 0.7152, 0.0722));
          vec3 catanxTint = mix(uBase, uTip, smoothstep(0.1, 0.92, vTipFactor));
          diffuseColor.rgb = catanxTint * (0.45 + catanxLuma * 1.15);`,
        );
    };
    result.customProgramCacheKey = () => `catanx-wind-foliage-v2-colorize:${alphaTest}`;
    return result;
  }, [alphaTest, map, roughness, uniforms]);

  useEffect(() => {
    uniforms.uWind.value = windStrength;
    uniforms.uWindSpeed.value = windSpeed;
    uniforms.uBase.value.set(baseColor);
    uniforms.uTip.value.set(tipColor);
  }, [baseColor, tipColor, uniforms, windSpeed, windStrength]);

  useLayoutEffect(() => {
    const mesh = meshRef.current;
    if (!mesh || placements.length === 0) return;
    const dummy = new THREE.Object3D();
    for (let index = 0; index < placements.length; index++) {
      const placement = placements[index]!;
      dummy.position.set(placement.x, placement.y, placement.z);
      dummy.rotation.set(0, placement.rotation, 0);
      dummy.scale.setScalar(placement.scale);
      dummy.updateMatrix();
      mesh.setMatrixAt(index, dummy.matrix);
    }
    mesh.count = placements.length;
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();
  }, [placements]);

  useFrame(({ clock }) => {
    if (animate) uniforms.uTime.value = clock.elapsedTime;
  });

  useEffect(
    () => () => {
      geometry.dispose();
      material.dispose();
    },
    [geometry, material],
  );

  if (placements.length === 0) return null;
  return (
    <instancedMesh
      ref={meshRef}
      args={[geometry, undefined, placements.length]}
        material={material}
      castShadow={castShadow}
      receiveShadow
      renderOrder={renderOrder}
      raycast={() => undefined}
    />
  );
}

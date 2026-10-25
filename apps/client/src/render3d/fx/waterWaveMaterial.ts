import * as THREE from 'three';

export type WaterWaveUpAxis = 'y' | 'z';

export interface WaterWaveOptions {
  amplitude: number;
  speed: number;
  /** Local axis used as height after mesh orientation. */
  upAxis?: WaterWaveUpAxis;
}

/**
 * Mild vertex chop for water materials. Call once per material, then write
 * `material.userData.shader.uniforms.uTime` each frame.
 */
export function attachWaterWaveShader(
  material: THREE.MeshStandardMaterial,
  { amplitude, speed, upAxis = 'z' }: WaterWaveOptions,
): void {
  const displace =
    upAxis === 'y'
      ? `transformed.y += wave;`
      : `transformed.z += wave;`;

  const sample =
    upAxis === 'y'
      ? `(position.x * 0.42 + position.z * 0.28)`
      : `(position.x * 0.42 + position.y * 0.28)`;
  const sample2 =
    upAxis === 'y'
      ? `(position.x * 0.16 - position.z * 0.38)`
      : `(position.x * 0.16 - position.y * 0.38)`;
  const sample3 =
    upAxis === 'y'
      ? `(position.x * 0.9 + position.z * 0.7)`
      : `(position.x * 0.9 + position.y * 0.7)`;

  material.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = { value: 0 };
    shader.uniforms.uAmp = { value: amplitude };
    shader.uniforms.uSpeed = { value: speed };
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
uniform float uTime;
uniform float uAmp;
uniform float uSpeed;`,
      )
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
float wave = sin(${sample} + uTime * uSpeed) * uAmp
  + sin(${sample2} + uTime * uSpeed * 0.72) * uAmp * 0.55
  + sin(${sample3} + uTime * uSpeed * 1.35) * uAmp * 0.22;
${displace}`,
      );
    material.userData.shader = shader;
  };
  material.customProgramCacheKey = () =>
    `water-wave-v2-${upAxis}-${amplitude}-${speed}`;
  material.needsUpdate = true;
}

export function setWaterWaveTime(
  material: THREE.MeshStandardMaterial | null | undefined,
  time: number,
): void {
  const shader = material?.userData.shader as
    | { uniforms?: { uTime?: { value: number } } }
    | undefined;
  if (shader?.uniforms?.uTime) {
    shader.uniforms.uTime.value = time;
  }
}

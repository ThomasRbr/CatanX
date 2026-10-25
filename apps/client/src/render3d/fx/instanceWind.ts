import * as THREE from 'three';

export interface InstanceWindOptions {
  /** Max lateral displacement at unit local Y (default 0.07). */
  amp?: number;
  /** Oscillation rate multiplier (default 1.05). */
  speed?: number;
}

/**
 * GPU wind for InstancedMesh materials — displaces by local Y so crowns move more than trunks.
 * Driven by shared AmbientAnimation time via `setInstanceWindUniforms`.
 */
export function attachInstanceWind(
  material: THREE.MeshStandardMaterial,
  options: InstanceWindOptions = {},
): void {
  const amp = options.amp ?? 0.07;
  const speed = options.speed ?? 1.05;
  material.userData.windBaseAmp = amp;
  material.userData.windSpeed = speed;

  material.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = { value: 0 };
    shader.uniforms.uWindAmp = { value: amp };
    shader.uniforms.uWindSpeed = { value: speed };
    shader.uniforms.uWindAngle = { value: 0.7 };

    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
uniform float uTime;
uniform float uWindAmp;
uniform float uWindSpeed;
uniform float uWindAngle;`,
      )
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
#ifdef USE_INSTANCING
float windPhase = instanceMatrix[3][0] * 0.55 + instanceMatrix[3][2] * 0.41;
#else
float windPhase = transformed.x * 0.55 + transformed.z * 0.41;
#endif
float windH = max(transformed.y, 0.0) + length(transformed.xz) * 0.08;
float gust = sin(uTime * uWindSpeed + windPhase);
float lean = gust * uWindAmp * windH;
transformed.x += cos(uWindAngle) * lean;
transformed.z += sin(uWindAngle) * lean;`,
      );

    material.userData.windShader = shader;
  };

  material.customProgramCacheKey = () => `instance-wind-h4p-${amp}-${speed}`;
  material.needsUpdate = true;
}

export function setInstanceWindUniforms(
  material: THREE.MeshStandardMaterial,
  time: number,
  windStrength: number,
  windAngle: number,
): void {
  const shader = material.userData.windShader as
    | {
        uniforms?: {
          uTime?: { value: number };
          uWindAmp?: { value: number };
          uWindAngle?: { value: number };
        };
      }
    | undefined;
  if (!shader?.uniforms) return;
  const base = (material.userData.windBaseAmp as number | undefined) ?? 0.07;
  if (shader.uniforms.uTime) shader.uniforms.uTime.value = time;
  if (shader.uniforms.uWindAmp) shader.uniforms.uWindAmp.value = base * Math.max(0, windStrength);
  if (shader.uniforms.uWindAngle) shader.uniforms.uWindAngle.value = windAngle;
}

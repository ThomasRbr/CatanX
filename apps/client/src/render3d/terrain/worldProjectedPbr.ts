import * as THREE from 'three';

/**
 * Project authored terrain maps in board-world X/Z space. Instanced hexes then
 * share one continuous material field instead of restarting UVs at every tile.
 */
export function attachWorldProjectedPbr(
  material: THREE.MeshStandardMaterial,
  worldScale = 0.55,
): void {
  material.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader.replace(
      '#include <uv_vertex>',
      `#include <uv_vertex>
      vec4 catanxTextureWorldPosition = modelMatrix * vec4( position, 1.0 );
      #ifdef USE_INSTANCING
        catanxTextureWorldPosition = modelMatrix * instanceMatrix * vec4( position, 1.0 );
      #endif
      vec2 catanxWorldUv = catanxTextureWorldPosition.xz * ${worldScale.toFixed(4)};
      #ifdef USE_MAP
        vMapUv = ( mapTransform * vec3( catanxWorldUv, 1.0 ) ).xy;
      #endif
      #ifdef USE_AOMAP
        vAoMapUv = ( aoMapTransform * vec3( catanxWorldUv, 1.0 ) ).xy;
      #endif
      #ifdef USE_NORMALMAP
        vNormalMapUv = ( normalMapTransform * vec3( catanxWorldUv, 1.0 ) ).xy;
      #endif
      #ifdef USE_DISPLACEMENTMAP
        vDisplacementMapUv = ( displacementMapTransform * vec3( catanxWorldUv, 1.0 ) ).xy;
      #endif
      #ifdef USE_ROUGHNESSMAP
        vRoughnessMapUv = ( roughnessMapTransform * vec3( catanxWorldUv, 1.0 ) ).xy;
      #endif`,
    );
  };
  material.customProgramCacheKey = () => `catanx-world-pbr-v1:${worldScale}`;
  material.needsUpdate = true;
}

import * as THREE from 'three';

/**
 * Wrap-around diffuse plus back-lit transmission for foliage.
 *
 * Standard diffuse cuts to black the instant a surface turns past 90° from the
 * light, which is correct for opaque rock and wrong for a leaf or a needle. Real
 * foliage is thin: light enters the far side, bounces inside and leaves towards
 * the viewer. Without that term a canopy against the sun is a flat black
 * silhouette — which is exactly how the island's conifers were reading.
 *
 * Two effects, both cheap:
 *
 * - **Wrap diffuse** softens the terminator so the shaded side keeps shape
 *   instead of falling off a cliff into shadow.
 * - **Transmission** adds light travelling *through* the crown, strongest when
 *   the viewer looks towards the sun, which is what makes a backlit tree glow
 *   at its edges.
 */
export function attachFoliageTranslucency(
  material: THREE.MeshStandardMaterial,
  options: {
    /** Colour light takes on after passing through the leaf. */
    transmissionColor?: THREE.ColorRepresentation;
    /** Strength of the through-the-leaf term. */
    transmission?: number;
    /** How far diffuse wraps past the terminator, 0..1. */
    wrap?: number;
  } = {},
): void {
  const transmissionColor = new THREE.Color(options.transmissionColor ?? '#8fc25a');
  const transmission = options.transmission ?? 0.8;
  const wrap = options.wrap ?? 0.45;

  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, {
      catanxTransmissionColor: { value: transmissionColor },
      catanxTransmission: { value: transmission },
      catanxWrap: { value: wrap },
    });

    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
        uniform vec3 catanxTransmissionColor;
        uniform float catanxTransmission;
        uniform float catanxWrap;`,
      )
      // Runs after all lights have been accumulated, so it can use the same
      // direct-light direction three already resolved.
      .replace(
        '#include <lights_fragment_end>',
        `#include <lights_fragment_end>
        #if ( NUM_DIR_LIGHTS > 0 )
        {
          DirectionalLight catanxKey = directionalLights[0];
          vec3 catanxL = normalize(catanxKey.direction);
          vec3 catanxV = normalize(vViewPosition);
          vec3 catanxN = normalize(normal);

          // Wrapped diffuse: remap N·L from [-wrap, 1] to [0, 1] instead of
          // clamping at zero, so the terminator rolls rather than cuts.
          float catanxNdotL = dot(catanxN, catanxL);
          float catanxWrapped = max(0.0, (catanxNdotL + catanxWrap) / (1.0 + catanxWrap));
          float catanxDirect = max(0.0, catanxNdotL);
          reflectedLight.directDiffuse += catanxKey.color
            * material.diffuseColor
            * (catanxWrapped - catanxDirect) * 0.5;

          // Transmission: light that went through the crown and continued
          // towards the eye. Peaks when looking into the sun.
          float catanxBack = pow(clamp(dot(catanxV, -catanxL) * 0.5 + 0.5, 0.0, 1.0), 3.0);
          reflectedLight.directDiffuse += catanxKey.color
            * catanxTransmissionColor
            * catanxBack * catanxTransmission * 0.55;
        }
        #endif`,
      );

    material.userData.catanxFoliageShader = shader;
  };
  material.customProgramCacheKey = () => `catanx-foliage-translucency-v2:${transmission}:${wrap}`;
  material.needsUpdate = true;
}

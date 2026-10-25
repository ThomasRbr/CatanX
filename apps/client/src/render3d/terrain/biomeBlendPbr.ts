import * as THREE from 'three';

export interface BiomeBlendTextureSet {
  meadow: THREE.Texture;
  forest: THREE.Texture;
  wheat: THREE.Texture;
  rock: THREE.Texture;
  clay: THREE.Texture;
  sand: THREE.Texture;
}

/**
 * Exactly what the shader samples, and nothing else.
 *
 * Albedo needs all six families. Normals only need the three whose surface
 * relief differs enough to matter — meadow stands in for wheat, clay and sand,
 * which are all fine-grained ground. Roughness and AO are shared: one set of
 * micro-occlusion reads correctly across every soil family at board scale.
 */
export interface BiomeBlendPbrTextures {
  albedo: BiomeBlendTextureSet;
  normal: Pick<BiomeBlendTextureSet, 'meadow' | 'forest' | 'rock'>;
  roughness: THREE.Texture;
  ao: THREE.Texture;
}

/**
 * WebGL2 guarantees only 16 fragment texture units. The terrain material uses
 * four maps plus environment and shadow samplers, so the biome layer must
 * remain comfortably below that ceiling. The current shader adds five albedos,
 * two essential specialist normals and one macro map: 14 estimated units
 * including the six standard lighting samplers.
 */
export const BIOME_BLEND_ESTIMATED_TEXTURE_UNITS = 14;

const VERTEX_DECLARATIONS = `
attribute vec4 biomeWeightsA;
attribute float biomeWeightSand;
attribute float biomeWeightForest;
attribute float biomeWeightIce;
varying float vBiomeWeightIce;
varying vec4 vBiomeWeightsA;
varying float vBiomeWeightSand;
varying float vBiomeWeightForest;
varying vec2 vBiomeWorldUv;
varying vec3 vBiomeWorldPosition;
varying vec3 vBiomeWorldNormal;
`;

const FRAGMENT_DECLARATIONS = `
uniform sampler2D catanxWheatAlbedo;
uniform sampler2D catanxForestAlbedo;
uniform sampler2D catanxRockAlbedo;
uniform sampler2D catanxClayAlbedo;
uniform sampler2D catanxSandAlbedo;
uniform sampler2D catanxForestNormal;
uniform sampler2D catanxRockNormal;
uniform sampler2D catanxMacroAlbedo;
uniform float catanxHasMacroAlbedo;
varying float vBiomeWeightIce;
varying vec4 vBiomeWeightsA;
varying float vBiomeWeightSand;
varying float vBiomeWeightForest;
varying vec2 vBiomeWorldUv;
varying vec3 vBiomeWorldPosition;
varying vec3 vBiomeWorldNormal;

// Three summed sines interfere into a visible regular lattice. Value noise has
// no preferred direction, which is what natural ground variation looks like.
float catanxHash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
}

float catanxValueNoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(catanxHash(i), catanxHash(i + vec2(1.0, 0.0)), u.x),
    mix(catanxHash(i + vec2(0.0, 1.0)), catanxHash(i + vec2(1.0, 1.0)), u.x),
    u.y
  );
}

float catanxMacroVariation(vec2 point) {
  return catanxValueNoise(point * 0.42) * 0.62
    + catanxValueNoise(point * 1.13 + 7.3) * 0.26
    + catanxValueNoise(point * 2.71 - 3.1) * 0.12;
}

/**
 * Triplanar sample.
 *
 * The terrain's UVs are a planar XZ projection, which is fine on ground and
 * wrong on a cliff: a near-vertical face receives one texel column smeared down
 * its whole height. Raising the mountain relief made that unmissable. Only the
 * rock channel pays for this, because the weight function already forces rock
 * onto anything steep.
 */
vec4 catanxTriplanar(sampler2D tex, vec3 worldPosition, vec3 worldNormal, float scale) {
  vec3 blend = pow(abs(worldNormal), vec3(5.0));
  blend /= max(1e-4, blend.x + blend.y + blend.z);
  vec4 x = texture2D(tex, worldPosition.zy * scale);
  vec4 y = texture2D(tex, worldPosition.xz * scale);
  vec4 z = texture2D(tex, worldPosition.xy * scale);
  return x * blend.x + y * blend.y + z * blend.z;
}

void catanxNormalisedBiomeWeights(out vec4 weightsA, out float weightSand, out float weightForest) {
  weightsA = max(vBiomeWeightsA, vec4(0.0));
  weightSand = max(vBiomeWeightSand, 0.0);
  weightForest = max(vBiomeWeightForest, 0.0);

  // Natural cuts expose stone regardless of the underlying biome. The onset is
  // late on purpose: starting at 0.9 meant every gentle undulation of the
  // heightfield turned pasture grey, which is most of the playable surface.
  float slopeRock = smoothstep(0.82, 0.46, abs(normalize(vBiomeWorldNormal).y));
  weightsA.z += slopeRock * 0.44;

  // One narrow noise-warped bridge where sand meets meadow, so the desert edge
  // is irregular rather than a clean arc. The vertex weights already feather
  // every frontier; the broad cross-bleed that used to sit here re-mixed all
  // five biomes back into a single averaged surface.
  float frontierNoise = catanxMacroVariation(vBiomeWorldPosition.xz * 1.85 + vec2(2.1, -1.4));
  float sandMeadowBridge = min(weightsA.x, weightSand) * mix(0.18, 0.34, frontierNoise);
  weightsA.x += sandMeadowBridge;
  weightSand += sandMeadowBridge * 0.9;

  float total = max(0.0001, dot(weightsA, vec4(1.0)) + weightSand + weightForest);
  weightsA /= total;
  weightSand /= total;
  weightForest /= total;
}
`;

const mapFragment = (worldScale: number) => `
#ifdef USE_MAP
  vec4 catanxMapWeightsA;
  float catanxMapWeightSand;
  float catanxMapWeightForest;
  catanxNormalisedBiomeWeights(catanxMapWeightsA, catanxMapWeightSand, catanxMapWeightForest);

  // Anti-tiling on the dominant ground. One repeat spans about 1.3 world units,
  // so at any zoom that resolves the texture at all, the same patch of grass is
  // visible several times over. A second tap at a rotated, non-commensurate
  // scale, cross-faded by low-frequency noise, breaks the lattice.
  vec2 catanxMeadowUv = vBiomeWorldUv * 1.06;
  vec2 catanxMeadowUvB = vec2(
    catanxMeadowUv.x * 0.62 - catanxMeadowUv.y * 0.48,
    catanxMeadowUv.x * 0.48 + catanxMeadowUv.y * 0.62
  ) + 4.7;
  float catanxTileMix = smoothstep(0.34, 0.66, catanxValueNoise(vBiomeWorldPosition.xz * 0.29));
  vec4 catanxMeadow = mix(
    texture2D(map, catanxMeadowUv),
    texture2D(map, catanxMeadowUvB),
    catanxTileMix
  );

  vec3 catanxWorldN = normalize(vBiomeWorldNormal);

  // Per-biome grade. A player has to name the resource from across the table.
  //
  // These multipliers are solved, not eyeballed: each one maps its scan's mean
  // colour onto an art-directed target, and the six targets are checked for
  // pairwise separation. The previous values left pasture at hue 67° and forest
  // at 61° — two near-identical olives, the closest pair at 0.138. Re-solving
  // for green pasture / dark litter / golden grain / cool stone / red clay /
  // pale sand lifts the closest pair to 0.279.
  vec4 sampledDiffuseColor =
    catanxMeadow * vec4(0.92, 1.52, 0.74, 1.0) * catanxMapWeightsA.x +
    texture2D(catanxForestAlbedo, vBiomeWorldUv * 0.94) * vec4(0.62, 0.76, 0.52, 1.0) * catanxMapWeightForest +
    texture2D(catanxWheatAlbedo, vBiomeWorldUv * vec2(0.82, 0.94)) * vec4(1.55, 1.40, 0.79, 1.0) * catanxMapWeightsA.y +
    catanxTriplanar(catanxRockAlbedo, vBiomeWorldPosition, catanxWorldN, ${(worldScale * 0.74).toFixed(5)}) * vec4(0.81, 0.84, 0.91, 1.0) * catanxMapWeightsA.z +
    texture2D(catanxClayAlbedo, vBiomeWorldUv * 0.92) * vec4(1.35, 1.04, 0.91, 1.0) * catanxMapWeightsA.w +
    texture2D(catanxSandAlbedo, vBiomeWorldUv * 0.9) * vec4(1.23, 1.21, 1.29, 1.0) * catanxMapWeightSand;

  // Macro breakup. This is the layer that survives minification: at gameplay
  // distance the photo detail averages to a flat colour, and without patchiness
  // at the scale of a tile the island reads as painted card.
  float catanxMacro = catanxMacroVariation(vBiomeWorldPosition.xz);
  sampledDiffuseColor.rgb *= mix(0.87, 1.11, catanxMacro);
  if (catanxHasMacroAlbedo > 0.5) {
    vec3 catanxMacroColor = texture2D(catanxMacroAlbedo, vBiomeWorldUv * 0.115 + vec2(0.17, 0.31)).rgb;
    float catanxMacroLuma = max(0.07, dot(catanxMacroColor, vec3(0.2126, 0.7152, 0.0722)));
    vec3 catanxMacroChrominance = clamp(catanxMacroColor / catanxMacroLuma, vec3(0.68), vec3(1.35));
    float catanxNaturalGround = clamp(catanxMapWeightsA.x + catanxMapWeightForest * 0.72, 0.0, 1.0);
    // Warm macro chrominance — dry meadow, not neon turf.
    sampledDiffuseColor.rgb *= mix(vec3(1.0), catanxMacroChrominance, catanxNaturalGround * 0.24);
    sampledDiffuseColor.rgb *= mix(0.94, 1.06, smoothstep(0.18, 0.62, catanxMacroLuma) * catanxNaturalGround);
  }
  diffuseColor *= sampledDiffuseColor;
#endif
`;

const AO_FRAGMENT = `
float ambientOcclusion = 1.0;
#ifdef USE_AOMAP
  vec4 catanxAoWeightsA;
  float catanxAoWeightSand;
  float catanxAoWeightForest;
  catanxNormalisedBiomeWeights(catanxAoWeightsA, catanxAoWeightSand, catanxAoWeightForest);
  float catanxAoBase = texture2D(aoMap, vBiomeWorldUv * 1.06).r;
  float catanxCrevice = clamp(
    catanxAoWeightsA.z * 0.09 + catanxAoWeightForest * 0.055 + catanxAoWeightsA.w * 0.035,
    0.0,
    0.12
  );
  float catanxAo = clamp(catanxAoBase - catanxCrevice, 0.62, 1.0);
  ambientOcclusion = (catanxAo - 1.0) * aoMapIntensity + 1.0;
#endif
`;

const normalFragment = (worldScale: number) => `
#ifdef USE_NORMALMAP_TANGENTSPACE
  vec4 catanxNormalWeightsA;
  float catanxNormalWeightSand;
  float catanxNormalWeightForest;
  catanxNormalisedBiomeWeights(catanxNormalWeightsA, catanxNormalWeightSand, catanxNormalWeightForest);
  float catanxSharedNormalWeight = catanxNormalWeightsA.x
    + catanxNormalWeightsA.y
    + catanxNormalWeightsA.w
    + catanxNormalWeightSand;
  vec3 catanxNormalWorldN = normalize(vBiomeWorldNormal);
  vec3 mapN =
    texture2D(normalMap, vBiomeWorldUv * 1.06).xyz * catanxSharedNormalWeight +
    texture2D(catanxForestNormal, vBiomeWorldUv * 0.94).xyz * catanxNormalWeightForest +
    catanxTriplanar(catanxRockNormal, vBiomeWorldPosition, catanxNormalWorldN, ${(worldScale * 0.74).toFixed(5)}).xyz * catanxNormalWeightsA.z;
  mapN = mapN * 2.0 - 1.0;
  mapN.xy *= normalScale;
  normal = normalize(tbn * mapN);
#elif defined(USE_NORMALMAP_OBJECTSPACE)
  normal = normalize(normalMatrix * (texture2D(normalMap, vNormalMapUv).xyz * 2.0 - 1.0));
#endif
`;

const ROUGHNESS_FRAGMENT = `
float roughnessFactor = roughness;
#ifdef USE_ROUGHNESSMAP
  vec4 catanxRoughnessWeightsA;
  float catanxRoughnessWeightSand;
  float catanxRoughnessWeightForest;
  catanxNormalisedBiomeWeights(catanxRoughnessWeightsA, catanxRoughnessWeightSand, catanxRoughnessWeightForest);
  float catanxRoughnessBase = texture2D(roughnessMap, vBiomeWorldUv * 1.06).g;
  float catanxRoughness = clamp(
    catanxRoughnessBase
      + catanxRoughnessWeightForest * 0.035
      + catanxRoughnessWeightsA.z * 0.055
      + catanxRoughnessWeightsA.w * 0.025
      - catanxRoughnessWeightSand * 0.018,
    0.58,
    1.0
  );
  roughnessFactor *= catanxRoughness;
#endif
`;

/** Five-way world-space PBR blend on top of the standard lighting model. */
export function attachBiomeBlendPbr(
  material: THREE.MeshStandardMaterial,
  textures: BiomeBlendPbrTextures,
  worldScale = 0.72,
  snowAmount = 0,
  macroAlbedo: THREE.Texture | null = null,
): void {
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, {
      catanxWheatAlbedo: { value: textures.albedo.wheat },
      catanxForestAlbedo: { value: textures.albedo.forest },
      catanxRockAlbedo: { value: textures.albedo.rock },
      catanxClayAlbedo: { value: textures.albedo.clay },
      catanxSandAlbedo: { value: textures.albedo.sand },
      catanxForestNormal: { value: textures.normal.forest },
      catanxRockNormal: { value: textures.normal.rock },
      catanxMacroAlbedo: { value: macroAlbedo ?? textures.albedo.meadow },
      catanxHasMacroAlbedo: { value: macroAlbedo ? 1 : 0 },
    });
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\n${VERTEX_DECLARATIONS}`)
      .replace(
        '#include <uv_vertex>',
        `#include <uv_vertex>
        vec4 catanxBiomeWorldPosition = modelMatrix * vec4(position, 1.0);
        vBiomeWorldUv = catanxBiomeWorldPosition.xz * ${worldScale.toFixed(4)};
        vBiomeWorldPosition = catanxBiomeWorldPosition.xyz;
        vBiomeWorldNormal = normalize(mat3(modelMatrix) * normal);
        vBiomeWeightsA = biomeWeightsA;
        vBiomeWeightSand = biomeWeightSand;
        vBiomeWeightForest = biomeWeightForest;
        vBiomeWeightIce = biomeWeightIce;`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\n${FRAGMENT_DECLARATIONS}`)
      .replace(
        '#include <map_fragment>',
        `${mapFragment(worldScale)}
        // Snow. The previous version *added* two noise fields to a near-zero
        // altitude term, which laid grey blotches over every lowland biome in
        // every season. Coverage is now multiplicative: the alpine snow line
        // caps the summits year-round, seasonal snow only exists in winter.
        vec3 catanxSnowN = normalize(vBiomeWorldNormal);
        // Summits are steep; snow still clings to anything flatter than ~70°.
        float catanxSnowFacing = smoothstep(0.16, 0.6, catanxSnowN.y);
        float catanxSnowBreakup = catanxMacroVariation(vBiomeWorldPosition.xz * 2.3 + 1.7);
        float catanxSnowLine = ${(0.9 - snowAmount * 0.7).toFixed(4)};
        float catanxAlpineSnow = smoothstep(
          catanxSnowLine - 0.06,
          catanxSnowLine + 0.12,
          vBiomeWorldPosition.y + (catanxSnowBreakup - 0.5) * 0.18
        ) * catanxSnowFacing;
        float catanxSnowLee = smoothstep(0.22, 0.82, catanxSnowN.y + catanxSnowN.x * 0.28);
        // Snow settles per biome so every tile keeps its identity in winter:
        // summits and forest floors whiten, pastures only frost, wheat stubble
        // and red clay show through, sand stays bare.
        float catanxBiomeSnow = dot(vBiomeWeightsA, vec4(0.42, 0.3, 1.0, 0.3)) + vBiomeWeightForest * 0.85;
        float catanxSeasonalSnow = ${snowAmount.toFixed(4)} * catanxSnowFacing * catanxSnowLee
          * smoothstep(0.25, 0.6, catanxSnowBreakup + 0.2) * catanxBiomeSnow;
        // Glaciers carry permanent snow, thinning to blue ice on steep faces.
        float catanxGlacier = smoothstep(0.22, 0.62, vBiomeWeightIce) * mix(0.82, 1.0, catanxSnowBreakup);
        float catanxSnowCoverage = clamp(max(max(catanxAlpineSnow, catanxSeasonalSnow), catanxGlacier), 0.0, 0.96);
        // Rock strata: faint horizontal banding sells the massif's scale.
        float catanxStrata = 0.9 + 0.1 * sin(vBiomeWorldPosition.y * 34.0 + catanxSnowBreakup * 5.0);
        #ifdef USE_MAP
        diffuseColor.rgb *= mix(1.0, catanxStrata, catanxMapWeightsA.z);
        #endif
        vec3 catanxSnowColor = mix(vec3(0.8, 0.84, 0.9), vec3(0.95, 0.97, 0.99), catanxSnowFacing);
        catanxSnowColor = mix(catanxSnowColor, vec3(0.66, 0.82, 0.9), catanxGlacier * (1.0 - catanxSnowFacing) * 0.8);
        diffuseColor.rgb = mix(diffuseColor.rgb, catanxSnowColor, catanxSnowCoverage);`,
      )
      .replace('#include <normal_fragment_maps>', normalFragment(worldScale))
      .replace('#include <roughnessmap_fragment>', ROUGHNESS_FRAGMENT)
      .replace('#include <aomap_fragment>', AO_FRAGMENT);
  };
  material.customProgramCacheKey = () => `catanx-biome-blend-pbr-v34-biome-snow:${worldScale}:${snowAmount}:${macroAlbedo ? 1 : 0}`;
  material.needsUpdate = true;
}

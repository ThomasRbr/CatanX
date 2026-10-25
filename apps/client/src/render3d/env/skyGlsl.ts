/**
 * Sky gradient shared by the dome and by everything that reflects it.
 *
 * The ocean has to reflect exactly the sky that is drawn behind it. Duplicating
 * the gradient in two shaders is how the horizon line ends up mismatched, so
 * both sample this one function.
 *
 * Expects the uniforms declared by `SKY_UNIFORM_DECLARATIONS`.
 */
export const SKY_UNIFORM_DECLARATIONS = /* glsl */ `
uniform vec3 uZenith;
uniform vec3 uHorizon;
uniform vec3 uHaze;
uniform vec3 uGroundBounce;
uniform vec3 uSunDirection;
uniform vec3 uSunColor;
`;

export const SKY_COLOR_FUNCTION = /* glsl */ `
vec3 catanxSkyColor(vec3 direction) {
  float height = direction.y;

  float skyBlend = pow(clamp(height, 0.0, 1.0), 0.42);
  vec3 sky = mix(uHorizon, uZenith, skyBlend);

  float belowBlend = pow(clamp(-height, 0.0, 1.0), 0.55);
  vec3 below = mix(uHorizon, uGroundBounce, belowBlend);
  vec3 color = mix(sky, below, step(height, 0.0));

  float sunAngle = dot(direction, normalize(uSunDirection));
  float haze = pow(max(sunAngle, 0.0), 5.0);
  float horizonHug = 1.0 - pow(clamp(abs(height), 0.0, 1.0), 0.5);
  color = mix(color, uHaze, haze * 0.34 + horizonHug * haze * 0.26);
  color = mix(color, uHaze * 0.82 + uHorizon * 0.18, horizonHug * 0.22);
  return color;
}
`;

import { useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import type { AtmosphereGrade } from './atmosphere';
import { SKY_COLOR_FUNCTION, SKY_UNIFORM_DECLARATIONS } from './skyGlsl';

interface SkyDomeProps {
  grade: AtmosphereGrade;
  /** Transition speed in ms, matched to the climate cross-fade. */
  transitionMs?: number;
}

const VERTEX = /* glsl */ `
varying vec3 vDirection;
void main() {
  vDirection = normalize(position);
  // Keep the dome pinned to the far plane: w == z after projection means the
  // sky can never intersect terrain, whatever the camera does.
  vec4 clip = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  gl_Position = clip.xyww;
}
`;

const FRAGMENT = /* glsl */ `
${SKY_UNIFORM_DECLARATIONS}
uniform float uSunIntensity;
varying vec3 vDirection;

${SKY_COLOR_FUNCTION}

void main() {
  vec3 direction = normalize(vDirection);
  vec3 color = catanxSkyColor(direction);

  float sunAngle = dot(direction, normalize(uSunDirection));
  // The disc itself. Kept small and only mildly over-range so ACES rolls it off
  // into a clean white core instead of clipping to a flat square.
  float disc = smoothstep(0.9985, 0.99975, sunAngle);
  float bloom = pow(max(sunAngle, 0.0), 220.0);
  color += uSunColor * (disc * 2.6 + bloom * 0.55) * uSunIntensity;

  gl_FragColor = vec4(color, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

/**
 * Full-sky gradient with a real sun disc.
 *
 * This replaces `<color attach="background">`. A single flat colour left the
 * ocean plane hanging in an empty void with a visible edge; a dome gives the
 * water something to meet and the scene a horizon.
 */
export function SkyDome({ grade, transitionMs = 1200 }: SkyDomeProps) {
  const { scene } = useThree();

  const uniforms = useMemo(
    () => ({
      uZenith: { value: grade.zenith.clone() },
      uHorizon: { value: grade.horizon.clone() },
      uHaze: { value: grade.haze.clone() },
      uGroundBounce: { value: grade.groundBounce.clone() },
      uSunDirection: { value: grade.sunDirection.clone() },
      uSunColor: { value: grade.sunColor.clone() },
      uSunIntensity: { value: grade.sunIntensity },
    }),
    // Built once; every field is animated towards the live grade below.
    [],
  );

  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        uniforms,
        vertexShader: VERTEX,
        fragmentShader: FRAGMENT,
        side: THREE.BackSide,
        depthWrite: false,
        depthTest: true,
        fog: false,
        toneMapped: true,
      }),
    [uniforms],
  );

  const geometry = useMemo(() => new THREE.SphereGeometry(1, 32, 16), []);
  const meshRef = useRef<THREE.Mesh>(null);
  const gradeRef = useRef(grade);
  gradeRef.current = grade;

  // The dome supplies the background, so nothing else has to clear to a colour.
  useEffect(() => {
    const previous = scene.background;
    scene.background = null;
    return () => {
      scene.background = previous;
    };
  }, [scene]);

  useEffect(
    () => () => {
      material.dispose();
      geometry.dispose();
    },
    [geometry, material],
  );

  useFrame((state, delta) => {
    const mesh = meshRef.current;
    if (mesh) mesh.position.copy(state.camera.position);

    const speed = Math.min(1, (delta * 1000) / Math.max(160, transitionMs));
    const target = gradeRef.current;
    uniforms.uZenith.value.lerp(target.zenith, speed);
    uniforms.uHorizon.value.lerp(target.horizon, speed);
    uniforms.uHaze.value.lerp(target.haze, speed);
    uniforms.uGroundBounce.value.lerp(target.groundBounce, speed);
    uniforms.uSunColor.value.lerp(target.sunColor, speed);
    uniforms.uSunDirection.value.lerp(target.sunDirection, speed).normalize();
    uniforms.uSunIntensity.value += (target.sunIntensity - uniforms.uSunIntensity.value) * speed;
  });

  return (
    <mesh
      ref={meshRef}
      geometry={geometry}
      material={material}
      renderOrder={-1000}
      frustumCulled={false}
      raycast={() => undefined}
    />
  );
}

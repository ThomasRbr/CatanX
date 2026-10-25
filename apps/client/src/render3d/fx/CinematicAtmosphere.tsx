import { useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { useRenderQuality } from '../quality/RenderQualityContext';

interface CinematicAtmosphereProps {
  enabled?: boolean;
  winter?: boolean;
  shot?: 'island' | 'village' | 'strategic' | string;
  /** Multiplier when optical DoF is off and this grade carries the tilt-shift. */
  strengthScale?: number;
}

/**
 * Lightweight cinematic grade without @react-three/postprocessing (peer conflict
 * with three@0.172). Stronger horizontal focus falloff approximates tilt-shift
 * DoF for High/Ultra cinematic captures.
 */
export function CinematicAtmosphere({
  enabled = true,
  winter = false,
  shot = 'island',
  strengthScale = 1,
}: CinematicAtmosphereProps) {
  const quality = useRenderQuality();
  const { size } = useThree();
  const meshRef = useRef<THREE.Mesh>(null);
  const strengthRef = useRef(0);
  const active = enabled && quality.cinematicDepthOfField && quality.atmosphericFx;
  const village = shot === 'village';

  const material = useMemo(() => new THREE.ShaderMaterial({
    transparent: true,
    depthTest: false,
    depthWrite: false,
    toneMapped: false,
    uniforms: {
      uStrength: { value: 0 },
      uWinter: { value: winter ? 1 : 0 },
      uAspect: { value: size.width / Math.max(1, size.height) },
      uVillage: { value: village ? 1 : 0 },
    },
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = vec4(position.xy, 0.0, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      varying vec2 vUv;
      uniform float uStrength;
      uniform float uWinter;
      uniform float uAspect;
      uniform float uVillage;
      void main() {
        vec2 p = (vUv - 0.5) * vec2(uAspect, 1.0);
        float r = length(p);
        // Village close-up: tighter mid band so haze reads as tilt-shift DoF.
        float bandStart = mix(0.05, 0.08, uVillage);
        float bandEnd = mix(0.38, 0.28, uVillage);
        float focusBand = smoothstep(bandStart, bandEnd, abs(p.y));
        float outerBlur = smoothstep(mix(0.22, 0.14, uVillage), mix(0.72, 0.55, uVillage), abs(p.y));
        float vignette = smoothstep(0.28, 1.25, r);
        float cool = mix(0.015, 0.07, uWinter);
        vec3 grade = mix(
          vec3(0.04, 0.03, 0.02),
          vec3(0.02, 0.04, 0.07),
          uWinter
        );
        float hazeBoost = mix(1.0, 1.35, uVillage);
        float a = (vignette * 0.48 + focusBand * 0.52 + outerBlur * 0.46) * uStrength * hazeBoost;
        gl_FragColor = vec4(grade + vec3(0.0, cool * 0.12, cool * 0.22), a);
      }
    `,
  }), [size.height, size.width, village, winter]);

  useEffect(() => {
    material.uniforms.uWinter!.value = winter ? 1 : 0;
    material.uniforms.uVillage!.value = village ? 1 : 0;
  }, [material, village, winter]);

  useEffect(() => {
    material.uniforms.uAspect!.value = size.width / Math.max(1, size.height);
  }, [material, size.height, size.width]);

  useEffect(() => () => material.dispose(), [material]);

  useFrame((_, dt) => {
    // Slightly stronger grade after DoF bokeh cut — keeps tilt-shift presence.
    const target = active
      ? (winter ? 0.36 : village ? 0.4 : 0.32) * strengthScale
      : 0;
    strengthRef.current = THREE.MathUtils.damp(strengthRef.current, target, 6, dt);
    material.uniforms.uStrength!.value = strengthRef.current;
    if (meshRef.current) {
      meshRef.current.visible = strengthRef.current > 0.002;
    }
  });

  return (
    <mesh ref={meshRef} frustumCulled={false} renderOrder={980} raycast={() => undefined}>
      <planeGeometry args={[2, 2]} />
      <primitive object={material} attach="material" />
    </mesh>
  );
}

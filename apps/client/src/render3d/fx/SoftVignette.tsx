import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { useMapLod } from '../camera/MapLodContext';

const VERT = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`;

const FRAG = /* glsl */ `
varying vec2 vUv;
uniform float uStrength;
void main() {
  vec2 p = vUv * 2.0 - 1.0;
  float d = dot(p, p);
  float a = smoothstep(0.55, 1.45, d) * uStrength;
  gl_FragColor = vec4(0.05, 0.04, 0.03, a);
}
`;

interface SoftVignetteProps {
  enabled?: boolean;
  strength?: number;
}

/**
 * NDC fullscreen vignette (1 draw when strength &gt; 0).
 * Stays mounted so LOD / disable fades instead of popping.
 */
export function SoftVignette({ enabled = true, strength = 0.22 }: SoftVignetteProps) {
  const lod = useMapLod();
  const target = enabled && lod < 2 ? strength : 0;
  const current = useRef(0);
  const meshRef = useRef<THREE.Mesh>(null);

  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        transparent: true,
        depthTest: false,
        depthWrite: false,
        toneMapped: false,
        uniforms: { uStrength: { value: 0 } },
        vertexShader: VERT,
        fragmentShader: FRAG,
      }),
    [],
  );

  useEffect(() => {
    return () => {
      material.dispose();
    };
  }, [material]);

  useFrame((_, dt) => {
    current.current = THREE.MathUtils.damp(current.current, target, 8, dt);
    material.uniforms.uStrength!.value = current.current;
    if (meshRef.current) {
      meshRef.current.visible = current.current > 0.002;
    }
  });

  return (
    <mesh ref={meshRef} frustumCulled={false} renderOrder={1000} raycast={() => undefined}>
      <planeGeometry args={[2, 2]} />
      <primitive object={material} attach="material" />
    </mesh>
  );
}

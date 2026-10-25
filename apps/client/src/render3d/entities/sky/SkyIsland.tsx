import { useEffect, useMemo, useRef, type ReactNode } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import type { SkySiteKind } from '@catanx/engine';
import { createVisualRng, rngRange } from '../../utils/seededVisualRandom';
import { buildIsland, type IslandBuild } from './islandBuilder';
import { PartBuilder, flatTriangleDouble, spanMatrix, unitRod } from './skyGeometry';
import { skyClock } from './skyClock';
import {
  skyGlowMaterial,
  skyIslandMaterial,
  skyDensePuffTexture,
  skyPuffTexture,
  skyQuestionTexture,
  skyVeilMaterial,
} from './skyMaterials';

const noRaycast = () => undefined;

// ---------------------------------------------------------------------------
// Waterfall

const WATERFALL_VERTEX = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const WATERFALL_FRAGMENT = /* glsl */ `
uniform float uTime;
varying vec2 vUv;
float h(vec2 p) { return fract(sin(dot(p, vec2(41.3, 289.1))) * 43758.5453); }
void main() {
  float across = abs(vUv.x - 0.5) * 2.0;
  float column = floor(vUv.x * 9.0);
  float speed = 1.4 + h(vec2(column, 1.0)) * 0.8;
  float streak = fract(vUv.y * 3.0 - uTime * speed + h(vec2(column, 3.0)));
  float s = smoothstep(0.0, 0.25, streak) * (1.0 - smoothstep(0.55, 1.0, streak));
  float body = 1.0 - smoothstep(0.55, 1.0, across);
  float fade = smoothstep(0.0, 0.05, vUv.y) * (1.0 - smoothstep(0.55, 1.0, vUv.y));
  vec3 col = mix(vec3(0.55, 0.85, 1.0), vec3(1.25, 1.35, 1.4), s);
  gl_FragColor = vec4(col, body * fade * (0.55 + 0.45 * s));
}
`;

function Waterfall({ points }: { points: THREE.Vector3[] }) {
  const geometry = useMemo(() => {
    const curve = new THREE.CatmullRomCurve3(points);
    const segments = 24;
    const positions: number[] = [];
    const uvs: number[] = [];
    const indices: number[] = [];
    const first = points[0]!;
    const out = new THREE.Vector3(first.x, 0, first.z).normalize();
    const side = new THREE.Vector3(-out.z, 0, out.x);
    for (let i = 0; i <= segments; i++) {
      const t = i / segments;
      const p = curve.getPoint(t);
      const width = 0.05 + t * 0.06;
      positions.push(p.x - side.x * width, p.y, p.z - side.z * width, p.x + side.x * width, p.y, p.z + side.z * width);
      uvs.push(0, t, 1, t);
      if (i < segments) {
        const a = i * 2;
        indices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    g.setIndex(indices);
    return g;
  }, [points]);
  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: WATERFALL_VERTEX,
        fragmentShader: WATERFALL_FRAGMENT,
        uniforms: { uTime: skyClock },
        transparent: true,
        depthWrite: false,
        side: THREE.DoubleSide,
      }),
    [],
  );
  useEffect(() => () => {
    geometry.dispose();
    material.dispose();
  }, [geometry, material]);
  const bottom = points[points.length - 1]!;
  return (
    <group>
      <mesh geometry={geometry} material={material} renderOrder={3} raycast={noRaycast} />
      <sprite position={[bottom.x, bottom.y + 0.1, bottom.z]} scale={[0.32, 0.22, 1]} raycast={noRaycast}>
        <spriteMaterial map={skyPuffTexture()} color="#eef8ff" transparent opacity={0.75} depthWrite={false} />
      </sprite>
    </group>
  );
}

// ---------------------------------------------------------------------------
// Small animated props

function Spinner({
  children,
  axis,
  speed,
  position,
  rotation,
}: {
  children: ReactNode;
  axis: 'x' | 'y' | 'z';
  speed: number;
  position?: THREE.Vector3 | [number, number, number];
  rotation?: [number, number, number];
}) {
  const ref = useRef<THREE.Group>(null);
  useFrame(() => {
    if (ref.current) ref.current.rotation[axis] = skyClock.value * speed;
  });
  return (
    <group position={position} rotation={rotation}>
      <group ref={ref}>{children}</group>
    </group>
  );
}

/** Build a merged part mesh once per `key` (the build closure is not a dependency). */
function usePartMesh(build: (builder: PartBuilder) => void, key: string) {
  const geometry = useMemo(() => {
    const builder = new PartBuilder();
    build(builder);
    return builder.build();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  useEffect(() => () => geometry?.dispose(), [geometry]);
  return geometry;
}

function Pinwheel({ position, facing }: { position: THREE.Vector3; facing: number }) {
  const pole = usePartMesh((b) => {
    b.add(unitRod(5), '#6b4a33', {
      matrix: spanMatrix(position, position.clone().setY(position.y + 0.24), 0.006),
    });
  }, `${position.x}:${position.y}:${position.z}`);
  const blades = usePartMesh((b) => {
    const colors = ['#ffc94a', '#d9423a', '#2a9d9a', '#fff3da'];
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2;
      const a2 = a + 0.9;
      b.add(
        flatTriangleDouble(
          new THREE.Vector3(0, 0, 0),
          new THREE.Vector3(Math.cos(a) * 0.08, Math.sin(a) * 0.08, 0),
          new THREE.Vector3(Math.cos(a2) * 0.06, Math.sin(a2) * 0.06, 0.012),
        ),
        colors[i]!,
      );
    }
  }, 'pinwheel');
  return (
    <group>
      {pole && <mesh geometry={pole} material={skyIslandMaterial()} castShadow raycast={noRaycast} />}
      <Spinner axis="z" speed={2.4} position={[position.x, position.y + 0.24, position.z]} rotation={[0, facing, 0]}>
        {blades && <mesh geometry={blades} material={skyIslandMaterial()} raycast={noRaycast} />}
      </Spinner>
    </group>
  );
}

function Armillary({ position }: { position: THREE.Vector3 }) {
  const ring = (radius: number) => {
    const b = new PartBuilder();
    b.add(new THREE.TorusGeometry(radius, 0.005, 5, 28), '#d8b25a');
    return b.build();
  };
  const rings = useMemo(() => [ring(0.06), ring(0.05), ring(0.04)], []);
  useEffect(() => () => rings.forEach((g) => g?.dispose()), [rings]);
  const core = useMemo(() => {
    const b = new PartBuilder();
    b.add(new THREE.IcosahedronGeometry(0.014, 1), '#9ff0ff', { intensity: 2.6 });
    return b.build();
  }, []);
  useEffect(() => () => core?.dispose(), [core]);
  const at: [number, number, number] = [position.x, position.y + 0.15, position.z];
  return (
    <group position={at}>
      {core && <mesh geometry={core} material={skyGlowMaterial()} raycast={noRaycast} />}
      <Spinner axis="y" speed={0.7}>
        {rings[0] && <mesh geometry={rings[0]} material={skyIslandMaterial()} raycast={noRaycast} />}
        <Spinner axis="x" speed={1.1}>
          {rings[1] && <mesh geometry={rings[1]} material={skyIslandMaterial()} raycast={noRaycast} />}
          <Spinner axis="z" speed={-1.5} rotation={[Math.PI / 2, 0, 0]}>
            {rings[2] && <mesh geometry={rings[2]} material={skyIslandMaterial()} raycast={noRaycast} />}
          </Spinner>
        </Spinner>
      </Spinner>
    </group>
  );
}

const BEAM_FRAGMENT = /* glsl */ `
uniform vec3 uColor;
uniform float uTime;
varying vec2 vUv;
void main() {
  float fade = pow(max(1.0 - vUv.y, 1e-4), 1.6) * smoothstep(0.0, 0.08, vUv.y);
  float ripple = 0.75 + 0.25 * sin(vUv.y * 22.0 - uTime * 3.0 + vUv.x * 6.2831);
  gl_FragColor = vec4(uColor * ripple, fade * 0.55);
}
`;

/** Soft vertical light shaft (additive), used by the aether spring. */
function LightShaft({
  position,
  color,
  radius,
  height,
}: {
  position: THREE.Vector3;
  color: string;
  radius: number;
  height: number;
}) {
  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: WATERFALL_VERTEX,
        fragmentShader: BEAM_FRAGMENT,
        uniforms: {
          uTime: skyClock,
          uColor: { value: new THREE.Color(color).multiplyScalar(1.6) },
        },
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide,
      }),
    [color],
  );
  useEffect(() => () => material.dispose(), [material]);
  return (
    <mesh position={[position.x, position.y + height / 2, position.z]} material={material} renderOrder={5} raycast={noRaycast}>
      <cylinderGeometry args={[radius * 0.55, radius, height, 20, 1, true]} />
    </mesh>
  );
}

function AetherSpring({ position }: { position: THREE.Vector3 }) {
  const motes = usePartMesh((b) => {
    const rng = createVisualRng(91);
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      const r = rngRange(rng, 0.1, 0.22);
      b.add(new THREE.OctahedronGeometry(rngRange(rng, 0.008, 0.014), 0), i % 3 ? '#c9b4ff' : '#f0e6ff', {
        position: [Math.cos(a) * r, rngRange(rng, 0.08, 0.4), Math.sin(a) * r],
        intensity: 3,
      });
    }
  }, 'motes');
  return (
    <group>
      <LightShaft position={position} color="#a889ff" radius={0.13} height={0.6} />
      <Spinner axis="y" speed={0.6} position={position}>
        {motes && <mesh geometry={motes} material={skyGlowMaterial()} raycast={noRaycast} />}
      </Spinner>
    </group>
  );
}

// ---------------------------------------------------------------------------
// Turbulent zone: a rotating ring of storm cloud with lightning.

function StormCell({ seed }: { seed: number }) {
  const puffs = useMemo(() => {
    const rng = createVisualRng(seed ^ 0x5707);
    const dark = new THREE.Color('#34354f');
    const light = new THREE.Color('#9491b6');
    const list: Array<{ position: [number, number, number]; scale: number; color: THREE.Color; opacity: number }> = [];
    // Two spiral arms of billowing cloud wound around a calm eye.
    const perArm = 13;
    for (let arm = 0; arm < 2; arm++) {
      for (let i = 0; i < perArm; i++) {
        const u = i / (perArm - 1);
        const angle = arm * Math.PI + u * Math.PI * 1.6 + rng() * 0.2;
        const r = 0.6 - u * 0.36;
        const y = Math.sin(u * 7 + arm) * 0.03 + (1 - u) * -0.02 + rng() * 0.04;
        list.push({
          position: [Math.cos(angle) * r, y, Math.sin(angle) * r],
          scale: (0.42 + 0.3 * Math.sin(Math.PI * Math.min(1, u * 1.2))) * rngRange(rng, 0.85, 1.15),
          color: dark.clone().lerp(light, THREE.MathUtils.clamp(0.25 + y * 6 + rng() * 0.35, 0, 1)),
          opacity: rngRange(rng, 0.85, 1),
        });
      }
    }
    return list;
  }, [seed]);
  const bolts = useMemo(() => {
    const rng = createVisualRng(seed ^ 0xb017);
    return [0, 1].map((index) => {
      const b = new PartBuilder();
      const a = rng() * Math.PI * 2;
      let p = new THREE.Vector3(Math.cos(a) * 0.4, 0, Math.sin(a) * 0.4);
      const target = new THREE.Vector3(Math.cos(a + 2.4) * 0.15, -0.64, Math.sin(a + 2.4) * 0.15);
      const steps = 6;
      for (let s = 1; s <= steps; s++) {
        const next = p.clone().lerp(target, 1 / (steps - s + 1));
        if (s < steps) next.add(new THREE.Vector3(rngRange(rng, -0.05, 0.05), 0, rngRange(rng, -0.05, 0.05)));
        b.add(unitRod(4), '#d9e8ff', { matrix: spanMatrix(p, next, 0.0055 - s * 0.0004), intensity: 4.5 });
        p = next;
      }
      void index;
      return b.build();
    });
  }, [seed]);
  useEffect(() => () => bolts.forEach((g) => g?.dispose()), [bolts]);
  const boltRefs = useRef<Array<THREE.Mesh | null>>([]);
  const flashRef = useRef<THREE.Sprite>(null);
  useFrame(() => {
    const t = skyClock.value + (seed % 97);
    // Two short flickers every few seconds, at deterministic times.
    const cycle = t % 4.3;
    const flicker = (cycle > 0.1 && cycle < 0.18) || (cycle > 0.27 && cycle < 0.33);
    const second = t % 6.1;
    const flicker2 = second > 2.0 && second < 2.07;
    if (boltRefs.current[0]) boltRefs.current[0].visible = flicker;
    if (boltRefs.current[1]) boltRefs.current[1].visible = flicker2;
    if (flashRef.current) {
      (flashRef.current.material as THREE.SpriteMaterial).opacity = flicker || flicker2 ? 0.55 : 0;
    }
  });
  return (
    <group position={[0, 0.66, 0]}>
      <Spinner axis="y" speed={0.45}>
        {[0, 1, 2, 3, 4].map((i) => (
          <sprite
            key={`ember-${i}`}
            position={[Math.cos(i * 1.26) * 0.26, -0.08, Math.sin(i * 1.26) * 0.26]}
            scale={[0.3, 0.2, 1]}
            raycast={noRaycast}
          >
            <spriteMaterial
              map={skyPuffTexture()}
              color="#ff5a3c"
              transparent
              opacity={0.75}
              depthWrite={false}
              blending={THREE.AdditiveBlending}
            />
          </sprite>
        ))}
        {puffs.map((puff, i) => (
          <sprite key={i} position={puff.position} scale={[puff.scale, puff.scale * 0.72, 1]} raycast={noRaycast}>
            <spriteMaterial map={skyDensePuffTexture()} color={puff.color} transparent opacity={puff.opacity} depthWrite={false} />
          </sprite>
        ))}
      </Spinner>
      {bolts.map((geometry, index) =>
        geometry ? (
          <mesh
            key={index}
            ref={(mesh) => {
              boltRefs.current[index] = mesh;
            }}
            geometry={geometry}
            material={skyGlowMaterial()}
            visible={false}
            raycast={noRaycast}
          />
        ) : null,
      )}
      <sprite ref={flashRef} scale={[1.3, 1.0, 1]} position={[0, -0.05, 0]} raycast={noRaycast}>
        <spriteMaterial
          map={skyPuffTexture()}
          color="#c9d8ff"
          transparent
          opacity={0}
          depthWrite={false}
          blending={THREE.AdditiveBlending}
        />
      </sprite>
    </group>
  );
}

// ---------------------------------------------------------------------------
// Veil for undiscovered islands

function Veil({ seed }: { seed: number }) {
  const puffs = useMemo(() => {
    const rng = createVisualRng(seed ^ 0x7e11);
    // A drifting shroud: a ring hugging the rim plus banks across the top, so
    // only the island's outline and mass read through.
    return Array.from({ length: 16 }, (_, i) => {
      const ring = i < 10;
      const a = ring ? (i / 10) * Math.PI * 2 + rng() * 0.4 : rng() * Math.PI * 2;
      const r = ring ? rngRange(rng, 0.5, 0.75) : rngRange(rng, 0.05, 0.4);
      return {
        position: [
          Math.cos(a) * r,
          ring ? rngRange(rng, -0.3, 0.05) : rngRange(rng, 0.08, 0.2),
          Math.sin(a) * r,
        ] as [number, number, number],
        scale: ring ? rngRange(rng, 0.7, 1.0) : rngRange(rng, 0.55, 0.8),
        opacity: ring ? 0.85 : 0.5,
      };
    });
  }, [seed]);
  const ref = useRef<THREE.Group>(null);
  useFrame(() => {
    if (ref.current) ref.current.rotation.y = skyClock.value * 0.08;
  });
  return (
    <group>
      <group ref={ref}>
        {puffs.map((puff, index) => (
          <sprite key={index} position={puff.position} scale={[puff.scale, puff.scale * 0.62, 1]} raycast={noRaycast} renderOrder={6}>
            <spriteMaterial map={skyPuffTexture()} color="#e6ecf8" transparent opacity={puff.opacity} depthWrite={false} />
          </sprite>
        ))}
      </group>
      <sprite position={[0, 0.5, 0]} scale={[0.42, 0.42, 1]} raycast={noRaycast} renderOrder={7}>
        <spriteMaterial map={skyQuestionTexture()} transparent depthWrite={false} />
      </sprite>
    </group>
  );
}

// ---------------------------------------------------------------------------

/** Clouds clinging to the underside of an island. */
function UnderPuffs({ build, seed }: { build: IslandBuild; seed: number }) {
  const puffs = useMemo(() => {
    const rng = createVisualRng(seed ^ 0xc10d);
    return Array.from({ length: 3 }, () => {
      const a = rng() * Math.PI * 2;
      return {
        position: [
          build.tip.x * 0.6 + Math.cos(a) * 0.22,
          build.tip.y * rngRange(rng, 0.55, 0.8),
          build.tip.z * 0.6 + Math.sin(a) * 0.22,
        ] as [number, number, number],
        scale: rngRange(rng, 0.38, 0.55),
      };
    });
  }, [build, seed]);
  return (
    <>
      {puffs.map((puff, index) => (
        <sprite key={index} position={puff.position} scale={[puff.scale, puff.scale * 0.55, 1]} raycast={noRaycast}>
          <spriteMaterial map={skyPuffTexture()} color="#fff1df" transparent opacity={0.6} depthWrite={false} />
        </sprite>
      ))}
    </>
  );
}

export interface SkyIslandProps {
  seed: number;
  site: SkySiteKind | null;
  yaw: number;
}

/** One floating island, its landmark and its animated details (local frame). */
export function SkyIsland({ seed, site, yaw }: SkyIslandProps) {
  const build = useMemo(() => buildIsland(seed, site), [seed, site]);
  useEffect(
    () => () => {
      build.body?.dispose();
      build.glow?.dispose();
    },
    [build],
  );
  const revealed = site !== null;
  const { anchors } = build;
  return (
    <group>
      <group rotation={[0, yaw, 0]}>
        {build.body && (
          <mesh
            geometry={build.body}
            material={revealed ? skyIslandMaterial() : skyVeilMaterial()}
            castShadow
            receiveShadow
            raycast={noRaycast}
          />
        )}
        {revealed && build.glow && <mesh geometry={build.glow} material={skyGlowMaterial()} raycast={noRaycast} />}
        {anchors.waterfall && <Waterfall points={anchors.waterfall} />}
        {anchors.pinwheel && <Pinwheel position={anchors.pinwheel.position} facing={anchors.pinwheel.facing} />}
        {anchors.armillary && <Armillary position={anchors.armillary} />}
        {anchors.aetherPool && <AetherSpring position={anchors.aetherPool} />}
        {anchors.storm && <StormCell seed={seed} />}
        {revealed && <UnderPuffs build={build} seed={seed} />}
      </group>
      {!revealed && <Veil seed={seed} />}
    </group>
  );
}

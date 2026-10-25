import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { PartBuilder, flatTriangleDouble, spanMatrix, unitRod } from './skyGeometry';
import { skyClock } from './skyClock';
import { skyGlowMaterial, skyIslandMaterial, skyPuffTexture } from './skyMaterials';

const noRaycast = () => undefined;

/** Build a geometry once per `key` (the build closure is not a dependency). */
function useBuilt(build: () => THREE.BufferGeometry | null, key: string) {
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const geometry = useMemo(() => build(), [key]);
  useEffect(() => () => geometry?.dispose(), [geometry]);
  return geometry;
}

/** Owner colour pushed into HDR for the bloom pass, never below a floor. */
function glowColor(hex: string, gain: number): THREE.Color {
  const color = new THREE.Color(hex);
  const luminance = color.r * 0.2126 + color.g * 0.7152 + color.b * 0.0722;
  const lift = luminance < 0.08 ? 0.08 / Math.max(luminance, 0.01) : 1;
  return color.multiplyScalar(gain * Math.min(lift, 3));
}

// ---------------------------------------------------------------------------
// Beacon: crystal lighthouse in the owner's colour.

export function SkyBeacon({ color }: { color: string }) {
  const body = useBuilt(() => {
    const b = new PartBuilder();
    b.add(new THREE.CylinderGeometry(0.07, 0.08, 0.035, 6), '#d9d0c0', { position: [0, 0.0175, 0], flat: true });
    b.add(new THREE.CylinderGeometry(0.036, 0.05, 0.2, 8), '#f4efe6', { position: [0, 0.135, 0] });
    for (const y of [0.08, 0.16]) {
      b.add(new THREE.CylinderGeometry(0.047 - y * 0.06, 0.049 - y * 0.06, 0.022, 8), color, { position: [0, y, 0] });
    }
    b.add(new THREE.CylinderGeometry(0.058, 0.05, 0.016, 8), '#3a3a46', { position: [0, 0.243, 0] });
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
      const p = new THREE.Vector3(Math.cos(a) * 0.036, 0.25, Math.sin(a) * 0.036);
      b.add(unitRod(4), '#3a3a46', { matrix: spanMatrix(p, p.clone().setY(0.33), 0.0045) });
    }
    b.add(new THREE.ConeGeometry(0.056, 0.06, 8), color, { position: [0, 0.36, 0], flat: true });
    b.add(new THREE.SphereGeometry(0.012, 8, 6), '#c8a24a', { position: [0, 0.395, 0] });
    return b.build();
  }, color);
  const glow = useBuilt(() => {
    const b = new PartBuilder();
    const hot = glowColor(color, 3.2);
    b.add(new THREE.OctahedronGeometry(0.03, 0), hot, { position: [0, 0.29, 0], scale: [1, 1.6, 1] });
    // Owner ring on the ground, so ownership reads even from far away.
    b.add(new THREE.TorusGeometry(0.11, 0.008, 4, 32), glowColor(color, 1.8), {
      position: [0, 0.006, 0],
      rotation: [Math.PI / 2, 0, 0],
    });
    return b.build();
  }, color);
  const beams = useBuilt(() => {
    const b = new PartBuilder();
    for (const s of [-1, 1]) {
      // Two flat light blades sweeping like a lighthouse.
      b.add(
        flatTriangleDouble(
          new THREE.Vector3(0, 0, 0),
          new THREE.Vector3(s * 0.5, 0.05, 0),
          new THREE.Vector3(s * 0.5, -0.05, 0),
        ),
        glowColor(color, 0.9),
      );
    }
    return b.build();
  }, color);
  const beamMaterial = useMemo(
    () =>
      new THREE.MeshBasicMaterial({
        vertexColors: true,
        transparent: true,
        opacity: 0.32,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        side: THREE.DoubleSide,
        toneMapped: false,
      }),
    [],
  );
  useEffect(() => () => beamMaterial.dispose(), [beamMaterial]);
  const spin = useRef<THREE.Group>(null);
  useFrame(() => {
    if (spin.current) spin.current.rotation.y = skyClock.value * 1.2;
  });
  return (
    <group>
      {body && <mesh geometry={body} material={skyIslandMaterial()} castShadow raycast={noRaycast} />}
      {glow && <mesh geometry={glow} material={skyGlowMaterial()} raycast={noRaycast} />}
      <group ref={spin} position={[0, 0.29, 0]}>
        {beams && <mesh geometry={beams} material={beamMaterial} renderOrder={8} raycast={noRaycast} />}
      </group>
      <sprite position={[0, 0.29, 0]} scale={[0.26, 0.26, 1]} raycast={noRaycast} renderOrder={8}>
        <spriteMaterial
          map={skyPuffTexture()}
          color={glowColor(color, 1.4)}
          transparent
          opacity={0.6}
          depthWrite={false}
          blending={THREE.AdditiveBlending}
          toneMapped={false}
        />
      </sprite>
    </group>
  );
}

// ---------------------------------------------------------------------------
// Airship

const ENVELOPE_LENGTH = 0.42;

function buildAirshipBody(color: string): THREE.BufferGeometry | null {
  const b = new PartBuilder();
  const cream = '#f4ead8';
  // Envelope: a lathe profile, fuller at the nose, tapering at the tail.
  const profile: THREE.Vector2[] = [];
  const steps = 14;
  for (let i = 0; i <= steps; i++) {
    const t = i / steps; // 0 tail → 1 nose
    const shape = Math.pow(Math.sin(Math.PI * Math.pow(t, 0.8)), 0.75);
    profile.push(new THREE.Vector2(Math.max(0.002, shape * 0.082), (t - 0.5) * ENVELOPE_LENGTH));
  }
  const envelope = new THREE.LatheGeometry(profile, 16);
  b.add(
    envelope,
    (p, out) => {
      // Gores alternate owner colour and cream; a cream nose cap.
      const sector = Math.floor(((Math.atan2(p.z, p.x) + Math.PI) / (Math.PI * 2)) * 16);
      out.set(p.y > ENVELOPE_LENGTH * 0.42 ? cream : sector % 2 ? color : cream);
    },
    { rotation: [0, 0, -Math.PI / 2], perFace: true },
  );
  // Brass bands.
  for (const x of [-0.1, 0.06]) {
    const r = 0.082 * Math.pow(Math.sin(Math.PI * Math.pow((x / ENVELOPE_LENGTH + 0.5), 0.8)), 0.75);
    b.add(new THREE.TorusGeometry(r + 0.002, 0.0045, 4, 20), '#c8a24a', { position: [x, 0, 0], rotation: [0, Math.PI / 2, 0] });
  }
  // Tail fins (owner colour) in a cross.
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2;
    const dir = new THREE.Vector3(0, Math.cos(a), Math.sin(a));
    const root = new THREE.Vector3(-0.15, 0, 0).addScaledVector(dir, 0.03);
    b.add(
      flatTriangleDouble(
        root,
        root.clone().add(new THREE.Vector3(-0.07, 0, 0)).addScaledVector(dir, 0.07),
        root.clone().add(new THREE.Vector3(0.05, 0, 0)).addScaledVector(dir, 0.01),
      ),
      color,
    );
    b.add(
      flatTriangleDouble(
        root.clone().add(new THREE.Vector3(-0.07, 0, 0)).addScaledVector(dir, 0.07),
        root.clone().add(new THREE.Vector3(-0.065, 0, 0)).addScaledVector(dir, 0.02),
        root,
      ),
      cream,
    );
  }
  // Gondola: a little wooden hull with a cabin.
  const gy = -0.115;
  b.add(new THREE.BoxGeometry(0.17, 0.035, 0.055), '#8b5a36', { position: [0, gy, 0], flat: true });
  b.add(new THREE.ConeGeometry(0.028, 0.05, 4), '#8b5a36', {
    position: [0.105, gy, 0],
    rotation: [0, Math.PI / 4, -Math.PI / 2],
    scale: [1, 1, 0.98],
    flat: true,
  });
  b.add(new THREE.BoxGeometry(0.1, 0.03, 0.045), '#efe2c8', { position: [-0.01, gy + 0.032, 0], flat: true });
  b.add(new THREE.BoxGeometry(0.112, 0.008, 0.052), color, { position: [-0.01, gy + 0.05, 0], flat: true });
  b.add(new THREE.BoxGeometry(0.18, 0.006, 0.06), '#c8a24a', { position: [0, gy + 0.018, 0] });
  // Rigging.
  for (const x of [-0.06, 0.06]) {
    for (const z of [-0.024, 0.024]) {
      b.add(unitRod(3), '#3d2d22', {
        matrix: spanMatrix(new THREE.Vector3(x, gy + 0.02, z), new THREE.Vector3(x * 1.3, -0.06, z * 1.8), 0.0016),
      });
    }
  }
  // Side sail on a short mast (owner colour).
  const mastBase = new THREE.Vector3(0.03, gy + 0.05, 0);
  b.add(unitRod(4), '#5b3f2c', { matrix: spanMatrix(mastBase, mastBase.clone().setY(gy + 0.1), 0.003) });
  for (const s of [-1, 1]) {
    b.add(
      flatTriangleDouble(
        new THREE.Vector3(0.03, gy + 0.03, s * 0.03),
        new THREE.Vector3(-0.05, gy + 0.03, s * 0.075),
        new THREE.Vector3(0.0, gy - 0.025, s * 0.065),
      ),
      color,
    );
  }
  // Propeller housing at the stern.
  b.add(new THREE.CylinderGeometry(0.008, 0.012, 0.03, 6), '#3a3a46', {
    position: [-0.1, gy, 0],
    rotation: [0, 0, Math.PI / 2],
  });
  return b.build();
}

function buildAirshipGlow(color: string): THREE.BufferGeometry | null {
  const b = new PartBuilder();
  const gy = -0.115;
  for (const z of [-0.0235, 0.0235]) {
    for (const x of [-0.035, -0.005, 0.025]) {
      b.add(new THREE.BoxGeometry(0.014, 0.012, 0.002), '#ffd58f', { position: [x, gy + 0.034, z], intensity: 2.4 });
    }
  }
  b.add(new THREE.SphereGeometry(0.009, 8, 6), glowColor(color, 2.6), { position: [0.132, gy, 0] });
  return b.build();
}

function buildPropeller(): THREE.BufferGeometry | null {
  const b = new PartBuilder();
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2;
    b.add(new THREE.BoxGeometry(0.003, 0.05, 0.012), '#d8b25a', {
      position: [0, Math.cos(a) * 0.025, Math.sin(a) * 0.025],
      rotation: [a, 0, 0],
    });
  }
  return b.build();
}

function buildBanner(color: string): THREE.BufferGeometry | null {
  const b = new PartBuilder();
  // Swallow-tailed pennant trailing from the tail.
  const quad = (a: THREE.Vector3, c: THREE.Vector3, d: THREE.Vector3, e: THREE.Vector3) => {
    b.add(flatTriangleDouble(a, c, d), color);
    b.add(flatTriangleDouble(a, d, e), color);
  };
  quad(
    new THREE.Vector3(0, 0.018, 0),
    new THREE.Vector3(-0.09, 0.018, 0),
    new THREE.Vector3(-0.07, 0, 0),
    new THREE.Vector3(0, -0.018, 0),
  );
  b.add(flatTriangleDouble(new THREE.Vector3(-0.07, 0, 0), new THREE.Vector3(-0.09, -0.018, 0), new THREE.Vector3(0, -0.018, 0)), color);
  return b.build();
}

export function SkyAirship({ color, phase }: { color: string; phase: number }) {
  const body = useBuilt(() => buildAirshipBody(color), color);
  const glow = useBuilt(() => buildAirshipGlow(color), color);
  const propeller = useBuilt(() => buildPropeller(), 'propeller');
  const banner = useBuilt(() => buildBanner(color), color);
  const sway = useRef<THREE.Group>(null);
  const prop = useRef<THREE.Group>(null);
  const flag = useRef<THREE.Group>(null);
  useFrame(() => {
    const t = skyClock.value;
    if (sway.current) {
      sway.current.position.y = Math.sin(t * 1.1 + phase) * 0.025;
      sway.current.rotation.x = Math.sin(t * 0.8 + phase) * 0.04;
      sway.current.rotation.z = Math.sin(t * 0.6 + phase * 1.3) * 0.03;
    }
    if (prop.current) prop.current.rotation.x = t * 14;
    if (flag.current) flag.current.rotation.y = Math.sin(t * 3.1 + phase) * 0.3;
  });
  return (
    <group ref={sway}>
      {body && <mesh geometry={body} material={skyIslandMaterial()} castShadow raycast={noRaycast} />}
      {glow && <mesh geometry={glow} material={skyGlowMaterial()} raycast={noRaycast} />}
      <group ref={prop} position={[-0.118, -0.115, 0]}>
        {propeller && <mesh geometry={propeller} material={skyIslandMaterial()} raycast={noRaycast} />}
      </group>
      <group ref={flag} position={[-0.215, 0.02, 0]}>
        {banner && <mesh geometry={banner} material={skyIslandMaterial()} raycast={noRaycast} />}
      </group>
    </group>
  );
}

// ---------------------------------------------------------------------------
// Airport pier: where an airport's ships wait in the sky.

export function SkyAirportPier({ color }: { color: string }) {
  const body = useBuilt(() => {
    const b = new PartBuilder();
    b.add(new THREE.CylinderGeometry(0.15, 0.13, 0.03, 7), '#9a7a5a', { position: [0, -0.015, 0], flat: true, jitter: 0.08, seed: 2 });
    b.add(new THREE.ConeGeometry(0.13, 0.32, 7), (p, out) => {
      const t = THREE.MathUtils.clamp(-p.y / 0.35, 0, 1);
      out.set('#8f7b6a').lerp(new THREE.Color('#4d4659'), t);
    }, { position: [0, -0.19, 0], rotation: [Math.PI, 0.3, 0], flat: true, jitter: 0.1, seed: 9 });
    b.add(new THREE.CylinderGeometry(0.135, 0.135, 0.012, 16), '#b0814f', { position: [0, 0.006, 0] });
    const mast = new THREE.Vector3(0.05, 0.012, -0.03);
    b.add(new THREE.CylinderGeometry(1, 1.3, 1, 6), '#5b3f2c', { matrix: spanMatrix(mast, mast.clone().setY(0.36), 0.01) });
    b.add(new THREE.TorusGeometry(0.03, 0.005, 4, 12), '#c8a24a', { position: [0.05, 0.33, -0.03], rotation: [Math.PI / 2, 0, 0] });
    b.add(
      flatTriangleDouble(
        new THREE.Vector3(0.05, 0.355, -0.03),
        new THREE.Vector3(0.05, 0.29, -0.03),
        new THREE.Vector3(0.16, 0.32, 0.0),
      ),
      color,
    );
    return b.build();
  }, color);
  const glow = useBuilt(() => {
    const b = new PartBuilder();
    b.add(new THREE.TorusGeometry(0.15, 0.009, 4, 32), glowColor(color, 1.8), {
      position: [0, 0.014, 0],
      rotation: [Math.PI / 2, 0, 0],
    });
    b.add(new THREE.OctahedronGeometry(0.014, 0), '#ffe2a8', { position: [0.05, 0.375, -0.03], intensity: 3 });
    return b.build();
  }, color);
  return (
    <group>
      {body && <mesh geometry={body} material={skyIslandMaterial()} castShadow raycast={noRaycast} />}
      {glow && <mesh geometry={glow} material={skyGlowMaterial()} raycast={noRaycast} />}
    </group>
  );
}

// ---------------------------------------------------------------------------
// Planned route of an airship: owner-coloured beads along the remaining legs.

export function SkyRouteTrail({ points, color }: { points: THREE.Vector3[]; color: string }) {
  const mesh = useMemo(() => {
    const geometry = new THREE.SphereGeometry(0.014, 6, 4);
    const material = new THREE.MeshBasicMaterial({ color: glowColor(color, 2.2), toneMapped: false });
    const instanced = new THREE.InstancedMesh(geometry, material, Math.max(1, points.length));
    const matrix = new THREE.Matrix4();
    points.forEach((point, index) => {
      instanced.setMatrixAt(index, matrix.makeTranslation(point.x, point.y + 0.03, point.z));
    });
    instanced.count = points.length;
    instanced.instanceMatrix.needsUpdate = true;
    instanced.raycast = noRaycast;
    instanced.frustumCulled = false;
    return instanced;
  }, [color, points]);
  useEffect(
    () => () => {
      mesh.geometry.dispose();
      (mesh.material as THREE.Material).dispose();
    },
    [mesh],
  );
  return <primitive object={mesh} />;
}

/** Owner-coloured ring marking an airship's destination hub. */
export function SkyDestinationRing({ color }: { color: string }) {
  const geometry = useBuilt(() => {
    const b = new PartBuilder();
    const segments = 12;
    for (let i = 0; i < segments; i++) {
      const a0 = (i / segments) * Math.PI * 2;
      b.add(new THREE.TorusGeometry(0.78, 0.012, 3, 6, (Math.PI * 2) / segments * 0.6), glowColor(color, 2), {
        rotation: [Math.PI / 2, 0, a0],
      });
    }
    return b.build();
  }, color);
  const ref = useRef<THREE.Group>(null);
  useFrame(() => {
    if (ref.current) ref.current.rotation.y = skyClock.value * 0.3;
  });
  return (
    <group ref={ref} position={[0, 0.02, 0]}>
      {geometry && <mesh geometry={geometry} material={skyGlowMaterial()} raycast={noRaycast} />}
    </group>
  );
}

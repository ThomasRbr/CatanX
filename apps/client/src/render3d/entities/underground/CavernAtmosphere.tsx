import { useEffect, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { createVisualRng, mixSeeds } from '../../utils/seededVisualRandom';
import { BLOCK_BOTTOM, type CavernLayout } from './cavernLayout';
import { getRadialTexture, type CavernMaterials } from './cavernMaterials';

export interface BeamSpot {
  x: number;
  y: number;
  z: number;
  /** Bottom radius of the shaft of light. */
  radius: number;
  height: number;
  color: THREE.Color;
}

export interface HaloSpot {
  x: number;
  y: number;
  z: number;
  size: number;
  color: THREE.Color;
}

interface CavernAtmosphereProps {
  layout: CavernLayout;
  beams: BeamSpot[];
  /** Soft light haze hanging over lit chambers (camera-facing sprites). */
  halos: HaloSpot[];
  steam: Array<{ x: number; y: number; z: number }>;
  materials: CavernMaterials;
  animate: boolean;
}

const noRaycast = () => undefined;

let beamGeo: THREE.BufferGeometry | null = null;
function getBeamGeometry(): THREE.BufferGeometry {
  // Camera-facing card (the diorama camera never rotates): soft on both
  // sides from the texture, base at y = 0, uv.y = 0 at the floor.
  beamGeo ??= new THREE.PlaneGeometry(2, 1).translate(0, 0.5, 0).rotateY(Math.PI / 4);
  return beamGeo;
}

let wispGeo: THREE.BufferGeometry | null = null;
function getWispGeometry(): THREE.BufferGeometry {
  wispGeo ??= new THREE.PlaneGeometry(1, 1).translate(0, 0.5, 0);
  return wispGeo;
}

/**
 * Mood: the magma glow far below the block, shafts of light falling from
 * ceiling cracks and surface shafts, drifting dust and spring steam. All
 * additive and unlit, so it costs fill rate only and no lighting.
 */
/** The diorama camera never rotates, so sprites can face it once. */
const VIEW_DIRECTION = new THREE.Vector3(1, 1.28, 1).normalize();

let haloGeo: THREE.BufferGeometry | null = null;
function getHaloGeometry(): THREE.BufferGeometry {
  if (haloGeo) return haloGeo;
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), VIEW_DIRECTION);
  haloGeo = new THREE.PlaneGeometry(1, 1).applyQuaternion(q);
  return haloGeo;
}

export function CavernAtmosphere({ layout, beams, halos, steam, materials, animate }: CavernAtmosphereProps) {
  const { bounds, centre } = layout;
  const span = Math.max(bounds.maxX - bounds.minX, bounds.maxZ - bounds.minZ);

  const beamMeshes = useMemo(
    () =>
      beams.map((beam) => {
        const material = materials.beam.clone();
        material.color.copy(beam.color);
        return { beam, material };
      }),
    [beams, materials.beam],
  );
  useEffect(() => () => beamMeshes.forEach(({ material }) => material.dispose()), [beamMeshes]);

  // Dust motes drifting through the cave.
  const motes = useMemo(() => {
    const rng = createVisualRng(mixSeeds(layout.seed, 'motes'));
    const count = Math.round(THREE.MathUtils.clamp(span * 22, 120, 360));
    const positions = new Float32Array(count * 3);
    const seeds = new Float32Array(count);
    let n = 0;
    for (let attempt = 0; attempt < count * 6 && n < count; attempt++) {
      const x = bounds.minX + rng() * (bounds.maxX - bounds.minX);
      const z = bounds.minZ + rng() * (bounds.maxZ - bounds.minZ);
      if (layout.footprint(x, z) > 0.2) continue;
      positions[n * 3] = x;
      positions[n * 3 + 1] = 0.1 + rng() * 1.3;
      positions[n * 3 + 2] = z;
      seeds[n] = rng() * 100;
      n++;
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions.slice(0, n * 3), 3));
    const material = new THREE.PointsMaterial({
      map: getRadialTexture(),
      color: new THREE.Color('#ffcf9a').multiplyScalar(0.7),
      size: 0.034,
      sizeAttenuation: true,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      toneMapped: false,
    });
    const points = new THREE.Points(geometry, material);
    points.frustumCulled = false;
    points.raycast = noRaycast;
    return { points, base: positions.slice(0, n * 3), seeds: seeds.slice(0, n) };
  }, [bounds, layout, span]);
  useEffect(
    () => () => {
      motes.points.geometry.dispose();
      (motes.points.material as THREE.Material).dispose();
    },
    [motes],
  );

  // Steam wisps above thermal springs.
  const wisps = useMemo(() => {
    const perSpring = 4;
    const count = steam.length * perSpring;
    if (count === 0) return null;
    const material = new THREE.MeshBasicMaterial({
      map: getRadialTexture(),
      color: new THREE.Color('#ffe2cc').multiplyScalar(0.16),
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
      toneMapped: false,
    });
    const mesh = new THREE.InstancedMesh(getWispGeometry(), material, count);
    mesh.frustumCulled = false;
    mesh.raycast = noRaycast;
    return { mesh, material, perSpring };
  }, [steam]);
  useEffect(() => () => {
    wisps?.mesh.dispose();
    wisps?.material.dispose();
  }, [wisps]);

  const haloMesh = useMemo(() => {
    if (halos.length === 0) return null;
    const mesh = new THREE.InstancedMesh(getHaloGeometry(), materials.additive, halos.length);
    const m = new THREE.Matrix4();
    halos.forEach((halo, i) => {
      m.makeScale(halo.size, halo.size, halo.size).setPosition(halo.x, halo.y, halo.z);
      mesh.setMatrixAt(i, m);
      mesh.setColorAt(i, halo.color);
    });
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.frustumCulled = false;
    mesh.raycast = noRaycast;
    mesh.renderOrder = 6;
    return mesh;
  }, [halos, materials.additive]);
  useEffect(() => () => haloMesh?.dispose(), [haloMesh]);

  useEffect(() => {
    if (wisps) updateWisps(wisps, steam, 0);
  }, [steam, wisps]);

  useFrame((state) => {
    if (!animate) return;
    const time = state.clock.elapsedTime;
    updateMotes(motes, time);
    if (wisps) updateWisps(wisps, steam, time);
  });

  return (
    <group>
      {/* Magma glow far below the block: silhouettes the cut-away cliffs. */}
      <mesh
        position={[centre.x, BLOCK_BOTTOM - 0.9, centre.z]}
        rotation={[-Math.PI / 2, 0, 0]}
        material={materials.abyss}
        raycast={noRaycast}
      >
        <planeGeometry args={[span * 2.6, span * 2.6]} />
      </mesh>
      {beamMeshes.map(({ beam, material }, index) => (
        <mesh
          key={index}
          geometry={getBeamGeometry()}
          material={material}
          position={[beam.x, beam.y, beam.z]}
          scale={[beam.radius, beam.height, beam.radius]}
          raycast={noRaycast}
          renderOrder={5}
          dispose={null}
        />
      ))}
      <primitive object={motes.points} />
      {wisps && <primitive object={wisps.mesh} />}
      {haloMesh && <primitive object={haloMesh} />}
    </group>
  );
}

interface MoteField {
  points: THREE.Points;
  base: Float32Array;
  seeds: Float32Array;
}

function updateMotes(motes: MoteField, time: number) {
  const attr = motes.points.geometry.attributes.position as THREE.BufferAttribute;
  const arr = attr.array as Float32Array;
  for (let i = 0; i < motes.seeds.length; i++) {
    const seed = motes.seeds[i]!;
    arr[i * 3] = motes.base[i * 3]! + Math.sin(time * 0.21 + seed) * 0.12;
    arr[i * 3 + 1] = motes.base[i * 3 + 1]! + Math.sin(time * 0.17 + seed * 1.7) * 0.1;
    arr[i * 3 + 2] = motes.base[i * 3 + 2]! + Math.cos(time * 0.19 + seed * 0.6) * 0.12;
  }
  attr.needsUpdate = true;
}

const _wm = new THREE.Matrix4();
const _wq = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI / 4);
const _wp = new THREE.Vector3();
const _ws = new THREE.Vector3();

function updateWisps(
  wisps: { mesh: THREE.InstancedMesh; perSpring: number },
  steam: Array<{ x: number; y: number; z: number }>,
  time: number,
) {
  steam.forEach((spring, si) => {
    for (let k = 0; k < wisps.perSpring; k++) {
      const phase = (time * 0.22 + k / wisps.perSpring + si * 0.37) % 1;
      const size = 0.12 + phase * 0.26;
      _wp.set(
        spring.x + Math.sin(phase * 5 + k) * 0.04,
        spring.y + 0.08 + phase * 0.42,
        spring.z + Math.cos(phase * 4 + k) * 0.04,
      );
      // Fade in, then out, by shrinking at both ends.
      const fade = Math.sin(phase * Math.PI);
      _ws.set(size * fade, size * 1.5 * fade, 1);
      _wm.compose(_wp, _wq, _ws);
      wisps.mesh.setMatrixAt(si * wisps.perSpring + k, _wm);
    }
  });
  wisps.mesh.instanceMatrix.needsUpdate = true;
}

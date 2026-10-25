import { useEffect, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import type { ChamberKit, KitSlot } from './chamberKits';
import { slotMaterial, type CavernMaterials } from './cavernMaterials';

export interface InstanceItem {
  matrix: THREE.Matrix4;
  /** Instance tint (multiplies vertex colours; may exceed 1 for glow). */
  color?: THREE.Color;
}

interface InstancedSetProps {
  geometry: THREE.BufferGeometry;
  material: THREE.Material;
  items: InstanceItem[];
  castShadow?: boolean;
  receiveShadow?: boolean;
  renderOrder?: number;
}

const noRaycast = () => undefined;

/** One InstancedMesh for a list of placements; geometry is shared, never disposed here. */
export function InstancedSet({
  geometry,
  material,
  items,
  castShadow = false,
  receiveShadow = false,
  renderOrder,
}: InstancedSetProps) {
  const mesh = useMemo(() => {
    if (items.length === 0) return null;
    const instanced = new THREE.InstancedMesh(geometry, material, items.length);
    const hasColor = items.some((item) => item.color);
    items.forEach((item, index) => {
      instanced.setMatrixAt(index, item.matrix);
      if (hasColor) instanced.setColorAt(index, item.color ?? WHITE);
    });
    instanced.instanceMatrix.needsUpdate = true;
    if (instanced.instanceColor) instanced.instanceColor.needsUpdate = true;
    instanced.castShadow = castShadow;
    instanced.receiveShadow = receiveShadow;
    instanced.frustumCulled = false;
    instanced.raycast = noRaycast;
    if (renderOrder !== undefined) instanced.renderOrder = renderOrder;
    return instanced;
  }, [castShadow, geometry, items, material, receiveShadow, renderOrder]);

  useEffect(() => () => mesh?.dispose(), [mesh]);
  if (!mesh) return null;
  return <primitive object={mesh} />;
}

const WHITE = new THREE.Color(1, 1, 1);

const SHADOW_SLOTS = new Set<KitSlot>(['body', 'stone', 'metal', 'owner']);

export interface KitPlacement {
  matrix: THREE.Matrix4;
  owner?: THREE.Color;
}

interface KitInstancesProps {
  kit: ChamberKit;
  placements: KitPlacement[];
  materials: CavernMaterials;
  animate: boolean;
}

const _pivot = new THREE.Matrix4();
const _pivotInv = new THREE.Matrix4();
const _spin = new THREE.Matrix4();
const _out = new THREE.Matrix4();

/** Render every slot of a kit for a list of placements. */
export function KitInstances({ kit, placements, materials, animate }: KitInstancesProps) {
  const items = useMemo(() => {
    const plain: InstanceItem[] = placements.map((p) => ({ matrix: p.matrix }));
    const owned: InstanceItem[] = placements.map((p) => ({ matrix: p.matrix, color: p.owner ?? WHITE }));
    return { plain, owned };
  }, [placements]);

  const spinGeometry = kit.slots.spin;
  return (
    <group>
      {(Object.keys(kit.slots) as KitSlot[]).map((slot) => {
        if (slot === 'spin') return null;
        const geometry = kit.slots[slot]!;
        const ownerSlot = slot === 'owner' || slot === 'ownerGlow';
        return (
          <InstancedSet
            key={slot}
            geometry={geometry}
            material={slotMaterial(slot, materials)}
            items={ownerSlot ? items.owned : items.plain}
            castShadow={SHADOW_SLOTS.has(slot)}
            receiveShadow={SHADOW_SLOTS.has(slot)}
          />
        );
      })}
      {spinGeometry && kit.spin && (
        <SpinningSet
          geometry={spinGeometry}
          material={slotMaterial('spin', materials)}
          placements={placements}
          spin={kit.spin}
          animate={animate}
        />
      )}
    </group>
  );
}

function SpinningSet({
  geometry,
  material,
  placements,
  spin,
  animate,
}: {
  geometry: THREE.BufferGeometry;
  material: THREE.Material;
  placements: KitPlacement[];
  spin: NonNullable<ChamberKit['spin']>;
  animate: boolean;
}) {
  const mesh = useMemo(() => {
    const instanced = new THREE.InstancedMesh(geometry, material, Math.max(1, placements.length));
    instanced.count = placements.length;
    placements.forEach((p, i) => instanced.setMatrixAt(i, p.matrix));
    instanced.frustumCulled = false;
    instanced.raycast = noRaycast;
    return instanced;
  }, [geometry, material, placements]);
  useEffect(() => () => mesh.dispose(), [mesh]);

  useFrame((state) => {
    if (!animate || placements.length === 0) return;
    applySpin(mesh, placements, spin, state.clock.elapsedTime * spin.speed);
  });

  if (placements.length === 0) return null;
  return <primitive object={mesh} />;
}

function applySpin(
  mesh: THREE.InstancedMesh,
  placements: KitPlacement[],
  spin: NonNullable<ChamberKit['spin']>,
  angle: number,
) {
  const [px, py, pz] = spin.pivot;
  _pivot.makeTranslation(px, py, pz);
  _pivotInv.makeTranslation(-px, -py, -pz);
  if (spin.axis === 'y') _spin.makeRotationY(angle);
  else _spin.makeRotationZ(angle);
  for (let i = 0; i < placements.length; i++) {
    _out.copy(placements[i]!.matrix).multiply(_pivot).multiply(_spin).multiply(_pivotInv);
    mesh.setMatrixAt(i, _out);
  }
  mesh.instanceMatrix.needsUpdate = true;
}

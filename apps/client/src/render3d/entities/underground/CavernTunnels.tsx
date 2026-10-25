import { useMemo } from 'react';
import * as THREE from 'three';
import { colouredPart } from './cavernGeometry';
import { CHAMBER_RADIUS, type CavernEdgeInfo, type CavernLayout } from './cavernLayout';
import type { CavernMaterials } from './cavernMaterials';
import { InstancedSet, type InstanceItem } from './KitInstances';

export interface OwnedTunnel {
  edge: CavernEdgeInfo;
  color: THREE.Color;
}

interface CavernTunnelsProps {
  layout: CavernLayout;
  owned: OwnedTunnel[];
  /** Edges between two revealed chambers that nobody has dug yet. */
  buildable: CavernEdgeInfo[];
  materials: CavernMaterials;
}

let unitBox: THREE.BufferGeometry | null = null;
function getUnitBox(): THREE.BufferGeometry {
  unitBox ??= colouredPart(new THREE.BoxGeometry(1, 1, 1), '#ffffff');
  return unitBox;
}
let lanternGeo: THREE.BufferGeometry | null = null;
function getLanternGeometry(): THREE.BufferGeometry {
  lanternGeo ??= colouredPart(new THREE.OctahedronGeometry(1, 0), '#ffffff', { s: [0.022, 0.034, 0.022] });
  return lanternGeo;
}
let dotGeo: THREE.BufferGeometry | null = null;
function getDotGeometry(): THREE.BufferGeometry {
  dotGeo ??= new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
  return dotGeo;
}

const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();
function orient(x: number, y: number, z: number, yaw: number, pitch: number, sx: number, sy: number, sz: number) {
  // Local +X along the track, pitched to follow the floor.
  _e.set(0, yaw, pitch, 'YXZ');
  _q.setFromEuler(_e);
  return new THREE.Matrix4().compose(_p.set(x, y, z), _q, _s.set(sx, sy, sz));
}

const WOOD = ['#7a5638', '#6b4a31', '#86603f', '#5e4330'].map((c) => new THREE.Color(c));
const SLEEPER_STEP = 0.075;
const RAIL_GAUGE = 0.045;
/** Track stops short of the chamber centre so centrepieces stay readable. */
const TRACK_INSET = 0.34;

/**
 * Dug tunnels: a mine track with owner-coloured rails, timber frames and
 * owner-coloured lanterns. Possible (undug) tunnels between explored chambers
 * are a faint dotted trace on the passage floor.
 */
export function CavernTunnels({ layout, owned, buildable, materials }: CavernTunnelsProps) {
  const sets = useMemo(() => {
    const sleepers: InstanceItem[] = [];
    const rails: InstanceItem[] = [];
    const timber: InstanceItem[] = [];
    const lanterns: InstanceItem[] = [];
    const dots: InstanceItem[] = [];
    const ribbons: InstanceItem[] = [];
    let woodIndex = 0;

    for (const { edge, color } of owned) {
      const dx = (edge.bx - edge.ax) / edge.length;
      const dz = (edge.bz - edge.az) / edge.length;
      const nx = -dz;
      const nz = dx;
      const yaw = Math.atan2(-dz, dx);
      const ribbonColor = color.clone().multiplyScalar(0.55);
      const start = TRACK_INSET;
      const end = edge.length - TRACK_INSET;
      const steps = Math.max(2, Math.round((end - start) / SLEEPER_STEP));
      const pts: Array<{ x: number; y: number; z: number }> = [];
      for (let i = 0; i <= steps; i++) {
        const t = start + ((end - start) * i) / steps;
        const x = edge.ax + dx * t;
        const z = edge.az + dz * t;
        pts.push({ x, y: layout.heightAt(x, z), z });
      }
      // Smooth the bed so the track does not jitter with floor noise.
      const bed = pts.map((p, i) => {
        const a = pts[Math.max(0, i - 1)]!;
        const b = pts[Math.min(pts.length - 1, i + 1)]!;
        return { ...p, y: (a.y + p.y * 2 + b.y) / 4 + 0.012 };
      });
      bed.forEach((p, i) => {
        const wood = WOOD[woodIndex++ % WOOD.length]!;
        sleepers.push({ matrix: orient(p.x, p.y, p.z, yaw + Math.PI / 2, 0, 0.15, 0.014, 0.034), color: wood });
        if (i === 0) return;
        const prev = bed[i - 1]!;
        const segLen = Math.hypot(p.x - prev.x, p.z - prev.z);
        const pitch = Math.atan2(p.y - prev.y, segLen);
        // Soft owner-coloured light pooled along the bed: the colour reads at
        // board zoom even when the rails themselves are a few pixels wide.
        ribbons.push({
          matrix: orient((p.x + prev.x) / 2, (p.y + prev.y) / 2 + 0.006, (p.z + prev.z) / 2, yaw, pitch, segLen + 0.002, 1, 0.3),
          color: ribbonColor,
        });
        for (const side of [-1, 1]) {
          rails.push({
            matrix: orient(
              (p.x + prev.x) / 2 + nx * RAIL_GAUGE * side,
              (p.y + prev.y) / 2 + 0.014,
              (p.z + prev.z) / 2 + nz * RAIL_GAUGE * side,
              yaw,
              pitch,
              segLen + 0.004,
              0.014,
              0.013,
            ),
            color,
          });
        }
      });
      // Timber frames + lanterns along the narrow part of the passage.
      const passageStart = CHAMBER_RADIUS - 0.02;
      const passageEnd = edge.length - CHAMBER_RADIUS + 0.02;
      const span = passageEnd - passageStart;
      const frames = Math.max(1, Math.round(span / 0.32));
      for (let f = 0; f < frames; f++) {
        const t = passageStart + (span * (f + 0.5)) / frames;
        const cx = edge.ax + dx * t;
        const cz = edge.az + dz * t;
        const floor = layout.heightAt(cx, cz);
        const half = 0.125;
        const postH = 0.25;
        for (const side of [-1, 1]) {
          const px = cx + nx * half * side;
          const pz = cz + nz * half * side;
          const base = Math.min(layout.heightAt(px, pz), floor + 0.05);
          const h = floor + postH - base;
          timber.push({
            matrix: orient(px, base + h / 2, pz, yaw, 0, 0.026, h, 0.026),
            color: WOOD[(f + side + 2) % WOOD.length],
          });
        }
        timber.push({
          matrix: orient(cx, floor + postH + 0.012, cz, yaw + Math.PI / 2, 0, half * 2 + 0.06, 0.026, 0.03),
          color: WOOD[f % WOOD.length],
        });
        lanterns.push({
          matrix: orient(cx + nx * 0.07, floor + postH - 0.045, cz + nz * 0.07, 0, 0, 1, 1, 1),
          color: color.clone().multiplyScalar(2.6),
        });
      }
    }

    for (const edge of buildable) {
      const dx = (edge.bx - edge.ax) / edge.length;
      const dz = (edge.bz - edge.az) / edge.length;
      const start = TRACK_INSET + 0.04;
      const end = edge.length - TRACK_INSET - 0.04;
      const count = Math.max(2, Math.round((end - start) / 0.09));
      for (let i = 0; i <= count; i++) {
        const t = start + ((end - start) * i) / count;
        const x = edge.ax + dx * t;
        const z = edge.az + dz * t;
        dots.push({
          matrix: orient(x, layout.heightAt(x, z) + 0.02, z, 0, 0, 0.055, 1, 0.055),
          color: new THREE.Color('#ffd49a').multiplyScalar(0.5),
        });
      }
    }
    return { sleepers, rails, timber, lanterns, dots, ribbons };
  }, [buildable, layout, owned]);

  return (
    <group>
      <InstancedSet geometry={getUnitBox()} material={materials.prop} items={sets.sleepers} receiveShadow />
      <InstancedSet geometry={getUnitBox()} material={materials.metal} items={sets.rails} castShadow />
      <InstancedSet geometry={getUnitBox()} material={materials.prop} items={sets.timber} castShadow receiveShadow />
      <InstancedSet geometry={getLanternGeometry()} material={materials.glow} items={sets.lanterns} />
      <InstancedSet geometry={getDotGeometry()} material={materials.additive} items={sets.dots} renderOrder={3} />
      <InstancedSet geometry={getDotGeometry()} material={materials.ribbon} items={sets.ribbons} renderOrder={3} />
    </group>
  );
}

/**
 * Static cave dressing: stalagmites, columns, boulders, wall crystals and the
 * glow sources that come with them. Pure and deterministic (seeded by the
 * board), computed once per board alongside the terrain.
 */
import * as THREE from 'three';
import { createVisualRng, mixSeeds } from '../../utils/seededVisualRandom';
import { BACK_DIR, CHAMBER_RADIUS, type CavernLayout } from './cavernLayout';
import type { GlowSource } from './cavernGlow';
import type { InstanceItem } from './KitInstances';

export interface CavernDecor {
  stalagmites: InstanceItem[];
  columns: InstanceItem[];
  boulders: InstanceItem[];
  crystals: InstanceItem[];
  glows: GlowSource[];
}

const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();

function placement(
  x: number,
  y: number,
  z: number,
  sx: number,
  sy: number,
  sz: number,
  rx = 0,
  ry = 0,
  rz = 0,
): THREE.Matrix4 {
  _e.set(rx, ry, rz, 'YXZ');
  _q.setFromEuler(_e);
  return new THREE.Matrix4().compose(_p.set(x, y, z), _q, _s.set(sx, sy, sz));
}

const WALL_CRYSTAL_TINTS = ['#4fe6ff', '#62f2e7', '#a78cff', '#4fe6ff'];

export function buildCavernDecor(layout: CavernLayout): CavernDecor {
  const rng = createVisualRng(mixSeeds(layout.seed, 'decor'));
  const { heightAt, openDistance, footprint } = layout;
  const stalagmites: InstanceItem[] = [];
  const columns: InstanceItem[] = [];
  const boulders: InstanceItem[] = [];
  const crystals: InstanceItem[] = [];
  const glows: GlowSource[] = [];

  const stalagmite = (x: number, z: number, h: number, r: number) => {
    const y = heightAt(x, z) - 0.02;
    const tint = 0.85 + rng() * 0.3;
    stalagmites.push({
      matrix: placement(x, y, z, r * 2, h, r * 2, (rng() - 0.5) * 0.18, rng() * Math.PI * 2, (rng() - 0.5) * 0.18),
      color: new THREE.Color(tint, tint * (0.96 + rng() * 0.06), tint * (0.9 + rng() * 0.08)),
    });
  };

  // Clusters around hex corners that sit in solid rock.
  for (const corner of layout.corners) {
    const open = openDistance(corner.x, corner.z);
    if (open < 0.1) continue;
    if (footprint(corner.x, corner.z) > -0.08) continue;
    const behind = footprint(corner.x + BACK_DIR.x * 0.7, corner.z + BACK_DIR.z * 0.7);
    const onBackRim = behind > -0.05;
    const count = 2 + Math.floor(rng() * 3);
    for (let i = 0; i < count; i++) {
      const a = rng() * Math.PI * 2;
      const d = rng() * 0.2;
      const x = corner.x + Math.cos(a) * d;
      const z = corner.z + Math.sin(a) * d;
      if (openDistance(x, z) < 0.04) continue;
      stalagmite(x, z, 0.14 + rng() * (onBackRim ? 0.3 : 0.16), 0.035 + rng() * 0.035);
    }
    const wantColumn = onBackRim ? rng() < 0.55 : corner.landCount === 3 && rng() < 0.16;
    if (wantColumn) {
      const h = onBackRim ? 0.7 + rng() * 0.4 : 0.5 + rng() * 0.18;
      const r = onBackRim ? 0.12 + rng() * 0.05 : 0.09 + rng() * 0.03;
      const y = heightAt(corner.x, corner.z) - 0.04;
      columns.push({
        matrix: placement(corner.x, y, corner.z, r * 2, h, r * 2, 0, rng() * Math.PI * 2, 0),
        color: new THREE.Color().setScalar(0.88 + rng() * 0.2),
      });
    }
  }

  for (const node of layout.nodes) {
    // Small stalagmites fringing each chamber rim.
    const fringe = 3 + Math.floor(rng() * 3);
    for (let i = 0; i < fringe; i++) {
      const a = rng() * Math.PI * 2;
      const d = CHAMBER_RADIUS + 0.02 + rng() * 0.12;
      const x = node.x + Math.cos(a) * d;
      const z = node.z + Math.sin(a) * d;
      const open = openDistance(x, z);
      if (open < 0.0 || open > 0.2) continue;
      stalagmite(x, z, 0.06 + rng() * 0.1, 0.03 + rng() * 0.025);
    }
    // Fallen boulders on the far half of the floor (the near half is kept
    // clear for outposts and extractors).
    const fallen = 2 + Math.floor(rng() * 2);
    for (let i = 0; i < fallen; i++) {
      const a = Math.PI * 1.25 + (rng() - 0.5) * 2.2;
      const d = 0.38 + rng() * 0.12;
      const x = node.x + Math.cos(a) * d;
      const z = node.z + Math.sin(a) * d;
      const open = openDistance(x, z);
      if (open > 0.02) continue;
      const s = 0.03 + rng() * 0.035;
      boulders.push({
        matrix: placement(x, heightAt(x, z) + s * 0.1, z, s * (1 + rng() * 0.4), s, s, 0, rng() * Math.PI * 2, 0),
        color: new THREE.Color().setScalar(1.2 + rng() * 0.4),
      });
    }
    // Crystal clusters growing out of the walls of roughly one chamber in three.
    if (rng() < 0.36) {
      const tint = new THREE.Color(WALL_CRYSTAL_TINTS[Math.floor(rng() * WALL_CRYSTAL_TINTS.length)]!);
      let placed = false;
      for (let attempt = 0; attempt < 8 && !placed; attempt++) {
        const a = rng() * Math.PI * 2;
        const d = CHAMBER_RADIUS + 0.12 + rng() * 0.1;
        const x = node.x + Math.cos(a) * d;
        const z = node.z + Math.sin(a) * d;
        const open = openDistance(x, z);
        if (open < 0.08 || open > 0.3 || footprint(x, z) > -0.1) continue;
        placed = true;
        const base = heightAt(x, z);
        const n = 3 + Math.floor(rng() * 3);
        for (let i = 0; i < n; i++) {
          const ox = (rng() - 0.5) * 0.08;
          const oz = (rng() - 0.5) * 0.08;
          const h = 0.08 + rng() * 0.12;
          const w = 0.025 + rng() * 0.02;
          // Lean inwards, towards the chamber.
          const yaw = Math.atan2(node.x - x, node.z - z);
          crystals.push({
            matrix: placement(x + ox, base - 0.03, z + oz, w, h, w, 0.35 + rng() * 0.5, yaw + (rng() - 0.5) * 1.2, 0),
            color: tint.clone().multiplyScalar(1.7 + rng() * 0.5),
          });
        }
        glows.push({
          x,
          y: base + 0.12,
          z,
          radius: 0.75,
          color: tint,
          intensity: 1.0,
          mode: 'breathe',
          priority: 20,
        });
      }
    }
  }

  // Seam glow: a few warm sources along the lava cracks light the rock beside them.
  const seamPoints: Array<{ x: number; z: number }> = [];
  const { bounds, noise } = layout;
  for (let x = bounds.minX; x <= bounds.maxX; x += 0.3) {
    for (let z = bounds.minZ; z <= bounds.maxZ; z += 0.3) {
      if (footprint(x, z) > -0.15) continue;
      const field = Math.abs(noise.n2(x * 0.36 + 100, z * 0.36 - 50) + 0.08 * noise.n2(x * 2.2, z * 2.2));
      if (field > 0.02 || openDistance(x, z) < 0.18) continue;
      if (seamPoints.some((p) => Math.hypot(p.x - x, p.z - z) < 1.4)) continue;
      seamPoints.push({ x, z });
      if (seamPoints.length >= 8) break;
    }
    if (seamPoints.length >= 8) break;
  }
  for (const p of seamPoints) {
    glows.push({
      x: p.x,
      y: heightAt(p.x, p.z) + 0.1,
      z: p.z,
      radius: 0.7,
      color: '#ff6a24',
      intensity: 0.9,
      mode: 'breathe',
      priority: 10,
    });
  }

  return { stalagmites, columns, boulders, crystals, glows };
}

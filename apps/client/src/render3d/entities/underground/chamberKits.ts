/**
 * Procedural centrepieces of the underground: one "kit" per discovery kind,
 * plus the sealed rubble heap, outposts, extractors, shafts and lifts.
 *
 * A kit is a handful of merged, vertex-coloured geometries, one per material
 * slot. Every chamber of a given kind is then a single instance of each slot,
 * so twenty revealed chambers cost a few dozen draw calls in total.
 *
 * Kit space: y up from the chamber floor, +Z faces the camera when the kit is
 * marked `faceCamera`, footprint within ~0.32 of the origin.
 */
import * as THREE from 'three';
import type { UndergroundDiscoveryKind } from '@catanx/engine';
import { createVisualRng, hashString } from '../../utils/seededVisualRandom';
import {
  KitBuilder,
  getBoulderGeometry,
  getCrystalGeometry,
  getRubbleGeometry,
  getStalagmiteGeometry,
  type PartTransform,
} from './cavernGeometry';

export type KitSlot = 'body' | 'stone' | 'metal' | 'glow' | 'hazard' | 'spin' | 'owner' | 'ownerGlow';

export const KIT_SLOTS: readonly KitSlot[] = [
  'body',
  'stone',
  'metal',
  'glow',
  'hazard',
  'spin',
  'owner',
  'ownerGlow',
];

export interface ChamberKit {
  slots: Partial<Record<KitSlot, THREE.BufferGeometry>>;
  /** Kit front (+Z) should face the camera instead of a random yaw. */
  faceCamera: boolean;
  /** Spin slot rotation: axis and pivot in kit space, radians per second. */
  spin?: { axis: 'y' | 'z'; pivot: readonly [number, number, number]; speed: number };
  /** Emit rising steam wisps above the kit (thermal spring). */
  steam?: boolean;
}

const TAU = Math.PI * 2;

// ---- primitive shorthands --------------------------------------------------
const box = (w: number, h: number, d: number) => new THREE.BoxGeometry(w, h, d);
const cyl = (rt: number, rb: number, h: number, seg = 10) => new THREE.CylinderGeometry(rt, rb, h, seg);
const sphere = (r: number, ws = 10, hs = 8) => new THREE.SphereGeometry(r, ws, hs);
const dome = (r: number, ws = 12) => new THREE.SphereGeometry(r, ws, 6, 0, TAU, 0, Math.PI / 2);
const cone = (r: number, h: number, seg = 6) => new THREE.ConeGeometry(r, h, seg);
const ico = (r: number, detail = 0) => new THREE.IcosahedronGeometry(r, detail);
const disc = (r: number, seg = 20) => new THREE.CircleGeometry(r, seg).rotateX(-Math.PI / 2);
const torus = (r: number, tube: number, arc = TAU, rs = 6, ts = 18) => new THREE.TorusGeometry(r, tube, rs, ts, arc);

function plain(geo: THREE.BufferGeometry): THREE.BufferGeometry {
  const g = geo.clone();
  g.deleteAttribute('color');
  return g;
}

function tube(points: Array<[number, number, number]>, radius: number, segments = 24): THREE.BufferGeometry {
  const curve = new THREE.CatmullRomCurve3(points.map(([x, y, z]) => new THREE.Vector3(x, y, z)));
  return new THREE.TubeGeometry(curve, segments, radius, 5, false);
}

/** Place a box between two floor points (planks, cracks, rails). */
function between(
  ax: number,
  az: number,
  bx: number,
  bz: number,
  y: number,
): PartTransform & { length: number } {
  const dx = bx - ax;
  const dz = bz - az;
  return {
    p: [(ax + bx) / 2, y, (az + bz) / 2],
    // Local +X along the segment.
    r: [0, Math.atan2(-dz, dx), 0],
    length: Math.hypot(dx, dz),
  };
}

function rngFor(name: string) {
  return createVisualRng(hashString(`catanx-underground-kit:${name}`));
}

function finish(builder: KitBuilder, rest: Omit<ChamberKit, 'slots'>): ChamberKit {
  const slots: Partial<Record<KitSlot, THREE.BufferGeometry>> = {};
  for (const slot of KIT_SLOTS) {
    const geo = builder.build(slot);
    if (geo) slots[slot] = geo;
  }
  return { slots, ...rest };
}

// ---- discovery kits --------------------------------------------------------

function crystalGeode(): ChamberKit {
  const k = new KitBuilder();
  const rng = rngFor('geode');
  k.add('stone', cyl(0.21, 0.24, 0.04, 12), '#2c2433', { p: [0, 0.02, 0] });
  // Cracked shell: slabs leaning outward around the cavity.
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * TAU + rng() * 0.3;
    const r = 0.205 + rng() * 0.02;
    const h = 0.12 + rng() * 0.09;
    k.add('stone', box(0.1 + rng() * 0.04, h, 0.05), i % 2 ? '#4b4054' : '#3c3344', {
      p: [Math.cos(a) * r, h * 0.42, Math.sin(a) * r],
      r: [0.32 + rng() * 0.25, Math.PI / 2 - a, (rng() - 0.5) * 0.3],
    });
  }
  const crystal = getCrystalGeometry();
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * TAU + rng() * 0.5;
    const d = i === 0 ? 0 : 0.04 + rng() * 0.09;
    const h = i === 0 ? 0.36 : 0.15 + rng() * 0.16;
    const w = i === 0 ? 0.1 : 0.05 + rng() * 0.035;
    const tilt = i === 0 ? 0.05 : 0.2 + rng() * 0.4;
    k.add('glow', crystal, i % 3 === 0 ? '#9ffff6' : '#2fe6dc', {
      p: [Math.cos(a) * d, 0.03, Math.sin(a) * d],
      r: [tilt, Math.PI / 2 - a, 0],
      s: [w, h, w],
    }, 1.45);
  }
  for (let i = 0; i < 7; i++) {
    const a = rng() * TAU;
    const d = 0.29 + rng() * 0.08;
    const h = 0.05 + rng() * 0.07;
    k.add('glow', crystal, '#62f2e7', {
      p: [Math.cos(a) * d, 0, Math.sin(a) * d],
      r: [0.5 + rng() * 0.4, Math.PI / 2 - a, 0],
      s: [0.03, h, 0.03],
    }, 1.4);
  }
  return finish(k, { faceCamera: false });
}

function aetherBreath(): ChamberKit {
  const k = new KitBuilder();
  const rng = rngFor('aether');
  const boulder = plain(getBoulderGeometry());
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * TAU + rng() * 0.25;
    const s = 0.045 + rng() * 0.035;
    k.add('stone', boulder, i % 2 ? '#4a4760' : '#3a384d', {
      p: [Math.cos(a) * 0.19, s * 0.25, Math.sin(a) * 0.19],
      r: [0, rng() * TAU, 0],
      s: [s * 1.2, s, s],
    });
  }
  k.add('stone', cyl(0.15, 0.17, 0.025, 16), '#0e0b18', { p: [0, 0.012, 0] });
  k.add('glow', disc(0.13, 24), '#6c4cff', { p: [0, 0.027, 0] }, 1.5);
  k.add('glow', disc(0.07, 20), '#c9b6ff', { p: [0, 0.029, 0] }, 2.2);
  for (let i = 0; i < 6; i++) {
    const a = rng() * TAU;
    const d = 0.04 + rng() * 0.16;
    k.add('glow', ico(0.012 + rng() * 0.012), '#d6c8ff', {
      p: [Math.cos(a) * d, 0.22 + rng() * 0.3, Math.sin(a) * d],
    }, 2.4);
  }
  for (let s = 0; s < 3; s++) {
    const offset = (s / 3) * TAU;
    const points: Array<[number, number, number]> = [];
    for (let i = 0; i <= 14; i++) {
      const t = i / 14;
      const a = offset + t * TAU * 1.25;
      const r = 0.045 + 0.11 * t;
      points.push([Math.cos(a) * r, 0.03 + 0.5 * t, Math.sin(a) * r]);
    }
    k.add('spin', tube(points, 0.011 - s * 0.002, 48), s === 1 ? '#d2c2ff' : '#9a7cff', {}, 2.1);
  }
  return finish(k, { faceCamera: false, spin: { axis: 'y', pivot: [0, 0, 0], speed: 0.9 } });
}

function thermalSpring(): ChamberKit {
  const k = new KitBuilder();
  const rng = rngFor('thermal');
  const tiers: Array<[number, number, number, string]> = [
    [0.29, 0, 0, '#9c5a3a'],
    [0.2, -0.05, -0.05, '#b36a45'],
    [0.12, -0.085, -0.085, '#c97c52'],
  ];
  // Travertine terraces, each brimming with a hot orange pool.
  tiers.forEach(([r, ox, oz, color], i) => {
    k.add('body', cyl(r, r + 0.025, 0.055, 11), color, { p: [ox, 0.0275 + i * 0.05, oz], r: [0, i * 0.4, 0] });
    k.add('glow', disc(r - 0.025, 18), i === 2 ? '#ffa860' : '#ff6a24', { p: [ox, 0.056 + i * 0.05, oz] }, 1.0 + i * 0.25);
  });
  for (let i = 0; i < 5; i++) {
    const a = rng() * TAU;
    const d = rng() * 0.07;
    k.add('glow', sphere(0.012 + rng() * 0.01, 6, 4), '#fff0dc', {
      p: [-0.085 + Math.cos(a) * d * 0.8, 0.158, -0.085 + Math.sin(a) * d * 0.8],
    }, 2);
  }
  const boulder = plain(getBoulderGeometry());
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * TAU + 0.4;
    k.add('stone', boulder, '#5a4a40', {
      p: [Math.cos(a) * 0.32, 0.01, Math.sin(a) * 0.32],
      s: [0.05, 0.04, 0.05],
      r: [0, rng() * TAU, 0],
    });
  }
  return finish(k, { faceCamera: false, steam: true });
}

function naturalWell(): ChamberKit {
  const k = new KitBuilder();
  const stones = 14;
  for (let i = 0; i < stones; i++) {
    const a = (i / stones) * TAU;
    k.add('stone', box(0.075, 0.075, 0.05), i % 2 ? '#8e9099' : '#74767f', {
      p: [Math.cos(a) * 0.165, 0.0375, Math.sin(a) * 0.165],
      r: [0, Math.PI / 2 - a, 0],
    });
  }
  k.add('stone', cyl(0.15, 0.15, 0.03, 16), '#1d2a35', { p: [0, 0.015, 0] });
  k.add('glow', disc(0.14, 24), '#3fa9ff', { p: [0, 0.05, 0] }, 1.25);
  k.add('glow', disc(0.07, 18), '#a8e2ff', { p: [0.02, 0.052, -0.01] }, 1.7);
  // Wooden windlass.
  for (const x of [-0.2, 0.2]) {
    k.add('body', box(0.028, 0.34, 0.028), '#6b4a31', { p: [x, 0.17, 0] });
  }
  k.add('body', cyl(0.016, 0.016, 0.44, 8), '#7a5638', { p: [0, 0.31, 0], r: [0, 0, Math.PI / 2] });
  k.add('body', box(0.5, 0.018, 0.12), '#5c4030', { p: [0, 0.37, -0.03], r: [0.35, 0, 0] });
  k.add('body', box(0.5, 0.018, 0.12), '#5c4030', { p: [0, 0.37, 0.03], r: [-0.35, 0, 0] });
  k.add('body', cyl(0.004, 0.004, 0.13, 4), '#c9b48a', { p: [0, 0.245, 0] });
  k.add('body', cyl(0.035, 0.028, 0.05, 10), '#7d5a3a', { p: [0, 0.16, 0] });
  k.add('metal', torus(0.034, 0.004, TAU, 4, 12), '#8c8f96', { p: [0, 0.18, 0], r: [Math.PI / 2, 0, 0] });
  return finish(k, { faceCamera: true });
}

function ironVein(): ChamberKit {
  const k = new KitBuilder();
  const rng = rngFor('iron');
  const boulder = plain(getBoulderGeometry());
  const ore: Array<[number, number, number]> = [
    [-0.12, -0.12, 0.13],
    [0.1, -0.16, 0.1],
    [-0.2, 0.06, 0.085],
  ];
  const crystal = getCrystalGeometry();
  for (const [x, z, s] of ore) {
    k.add('stone', boulder, '#535b66', { p: [x, s * 0.2, z], s: [s, s * 0.95, s], r: [0, rng() * TAU, 0] });
    for (let i = 0; i < 4; i++) {
      const a = rng() * TAU;
      const up = 0.25 + rng() * 0.5;
      k.add('glow', crystal, '#b6dcff', {
        p: [x + Math.cos(a) * s * 0.78, s * (0.2 + up * 0.7), z + Math.sin(a) * s * 0.78],
        r: [0.9, Math.PI / 2 - a, 0],
        s: [0.022, 0.05 + rng() * 0.03, 0.022],
      }, 1.3);
    }
  }
  // Mine cart on a stub of track.
  const cx = 0.07;
  const cz = 0.1;
  for (const off of [-0.045, 0.045]) {
    k.add('metal', box(0.34, 0.012, 0.012), '#8a8d94', { p: [cx, 0.008, cz + off] });
  }
  for (let i = 0; i < 4; i++) {
    k.add('body', box(0.025, 0.01, 0.14), '#5a3f2b', { p: [cx - 0.13 + i * 0.087, 0.004, cz] });
  }
  k.add('body', cyl(0.13, 0.095, 0.1, 4), '#6e4b31', { p: [cx, 0.09, cz], r: [0, Math.PI / 4, 0], s: [1.15, 1, 0.8] });
  k.add('metal', box(0.205, 0.014, 0.15), '#5d6068', { p: [cx, 0.13, cz] });
  for (const [wx, wz] of [[-0.06, -0.05], [0.06, -0.05], [-0.06, 0.05], [0.06, 0.05]] as const) {
    k.add('metal', cyl(0.032, 0.032, 0.014, 12), '#2f3136', { p: [cx + wx, 0.034, cz + wz], r: [Math.PI / 2, 0, 0] });
  }
  const rubble = plain(getRubbleGeometry());
  for (let i = 0; i < 7; i++) {
    k.add('metal', rubble, i % 2 ? '#9fb2c6' : '#7d8ea0', {
      p: [cx + (rng() - 0.5) * 0.14, 0.145 + rng() * 0.02, cz + (rng() - 0.5) * 0.08],
      s: 0.028 + rng() * 0.012,
      r: [rng() * 3, rng() * 3, 0],
    });
  }
  return finish(k, { faceCamera: true });
}

function clayBank(): ChamberKit {
  const k = new KitBuilder();
  const rng = rngFor('clay');
  const boulder = plain(getBoulderGeometry());
  k.add('body', boulder, '#a8573a', { p: [-0.06, 0.0, -0.08], s: [0.26, 0.14, 0.2] });
  k.add('body', boulder, '#c46a47', { p: [-0.09, 0.08, -0.1], s: [0.17, 0.1, 0.13] });
  k.add('body', boulder, '#d9845f', { p: [-0.1, 0.15, -0.12], s: [0.09, 0.06, 0.08] });
  // Cut face (flat terrace) of fresh clay.
  k.add('body', cyl(0.16, 0.18, 0.02, 9), '#e09070', { p: [0.0, 0.07, 0.02], r: [0, 0.3, 0] });
  // Brick stack.
  const bx = 0.15;
  const bz = 0.13;
  for (let row = 0; row < 3; row++) {
    for (let i = 0; i < 3 - row; i++) {
      for (let j = 0; j < 2; j++) {
        k.add('body', box(0.068, 0.032, 0.034), (i + j + row) % 2 ? '#c25a3a' : '#a54c31', {
          p: [bx + (i - (2 - row) / 2) * 0.072, 0.017 + row * 0.034, bz + (j - 0.5) * 0.038],
          r: [0, (rng() - 0.5) * 0.08, 0],
        });
      }
    }
  }
  // Shovel planted in the bank, lantern on a post.
  k.add('body', cyl(0.007, 0.007, 0.26, 5), '#7a5a3a', { p: [0.02, 0.17, -0.02], r: [0.25, 0, -0.35] });
  k.add('metal', box(0.05, 0.06, 0.008), '#8f8f94', { p: [0.06, 0.05, -0.05], r: [0.25, 0, -0.35] });
  k.add('body', box(0.018, 0.3, 0.018), '#5a3f2b', { p: [-0.24, 0.15, 0.12] });
  k.add('body', box(0.08, 0.014, 0.014), '#5a3f2b', { p: [-0.21, 0.29, 0.12] });
  k.add('glow', box(0.026, 0.036, 0.026), '#ffb35c', { p: [-0.18, 0.26, 0.12] }, 2.4);
  return finish(k, { faceCamera: true });
}

function fossilRoots(): ChamberKit {
  const k = new KitBuilder();
  const rng = rngFor('fossil');
  const bone = '#ddc9a3';
  k.add('body', cyl(0.024, 0.02, 0.48, 8), bone, { p: [0, 0.025, 0], r: [0, 0, Math.PI / 2] });
  for (let i = 0; i < 6; i++) {
    const x = -0.19 + i * 0.075;
    const r = 0.17 - Math.abs(i - 1.5) * 0.022;
    // Rib arcs rising from the floor, plane perpendicular to the spine.
    k.add('body', torus(r, 0.014, Math.PI, 5, 14), i % 2 ? bone : '#cdb892', {
      p: [x, 0.0, 0],
      r: [0, Math.PI / 2, 0],
      s: [1, 0.9, 1],
    });
  }
  const boulder = plain(getBoulderGeometry());
  k.add('body', boulder, '#d6c29c', { p: [0.29, 0.04, 0], s: [0.1, 0.075, 0.085], r: [0, 0.2, 0.2] });
  k.add('stone', sphere(0.016, 6, 4), '#1d1612', { p: [0.32, 0.075, 0.05] });
  k.add('stone', sphere(0.016, 6, 4), '#1d1612', { p: [0.32, 0.075, -0.05] });
  // Petrified roots snaking out of the floor.
  for (let i = 0; i < 4; i++) {
    const a = rng() * TAU;
    const pts: Array<[number, number, number]> = [];
    for (let j = 0; j <= 5; j++) {
      const t = j / 5;
      const r = 0.36 - t * 0.2;
      const aa = a + t * 0.9;
      pts.push([Math.cos(aa) * r, 0.01 + Math.sin(t * Math.PI) * 0.09, Math.sin(aa) * r]);
    }
    k.add('body', tube(pts, 0.013, 16), i % 2 ? '#6e4f38' : '#5a3f2c');
  }
  for (let i = 0; i < 5; i++) {
    const a = rng() * TAU;
    const d = 0.2 + rng() * 0.12;
    k.add('glow', ico(0.018 + rng() * 0.01, 1), '#ffae3b', { p: [Math.cos(a) * d, 0.02, Math.sin(a) * d] }, 2.1);
  }
  return finish(k, { faceCamera: true });
}

function fungiculture(): ChamberKit {
  const k = new KitBuilder();
  const rng = rngFor('fungi');
  const boulder = plain(getBoulderGeometry());
  k.add('stone', boulder, '#3b2d28', { p: [0, -0.01, 0], s: [0.27, 0.05, 0.24] });
  k.add('body', cyl(0.03, 0.035, 0.3, 8), '#4a3528', { p: [0.06, 0.03, 0.17], r: [0, 0.6, Math.PI / 2] });
  const shrooms: Array<[number, number, number, number, string]> = [
    [0, 0, 0.27, 0.13, '#e39cff'],
    [0.14, 0.06, 0.17, 0.08, '#ff9ce6'],
    [-0.13, 0.08, 0.13, 0.07, '#c88cff'],
    [0.05, -0.15, 0.11, 0.06, '#9cf0ff'],
    [-0.09, -0.11, 0.08, 0.045, '#ff9ce6'],
    [0.18, -0.09, 0.065, 0.04, '#e39cff'],
    [-0.2, -0.02, 0.055, 0.035, '#9cf0ff'],
    [0.21, 0.15, 0.05, 0.03, '#c88cff'],
    [-0.04, 0.19, 0.06, 0.035, '#e39cff'],
  ];
  for (const [x, z, h, r, color] of shrooms) {
    const lean = (rng() - 0.5) * 0.25;
    k.add('body', cyl(r * 0.2, r * 0.3, h, 7), '#efe4d2', { p: [x, h / 2, z], r: [lean, 0, 0] });
    k.add('glow', dome(r), color, { p: [x, h - r * 0.08, z + lean * h * 0.5], s: [1, 0.55, 1] }, 1.3);
    k.add('glow', disc(r * 0.92, 12).rotateX(Math.PI), color, { p: [x, h - r * 0.09, z + lean * h * 0.5] }, 0.9);
  }
  for (let i = 0; i < 10; i++) {
    const a = rng() * TAU;
    const d = rng() * 0.28;
    k.add('glow', ico(0.006 + rng() * 0.005), '#f4d8ff', {
      p: [Math.cos(a) * d, 0.12 + rng() * 0.3, Math.sin(a) * d],
    }, 2.6);
  }
  return finish(k, { faceCamera: false });
}

function woollyLichen(): ChamberKit {
  const k = new KitBuilder();
  const rng = rngFor('lichen');
  const boulder = plain(getBoulderGeometry());
  k.add('stone', boulder, '#4e4844', { p: [0.02, 0, -0.04], s: [0.16, 0.12, 0.14] });
  const mounds: Array<[number, number, number, string]> = [
    [0.02, -0.04, 0.17, '#86c39c'],
    [-0.15, 0.07, 0.12, '#9fd7b4'],
    [0.15, 0.09, 0.11, '#6fae86'],
    [-0.04, 0.17, 0.09, '#a9e2bf'],
    [0.2, -0.12, 0.08, '#86c39c'],
    [-0.2, -0.13, 0.075, '#6fae86'],
  ];
  for (const [x, z, s, color] of mounds) {
    const lift = x === 0.02 ? 0.09 : 0;
    k.add('body', boulder, color, { p: [x, lift, z], s: [s, s * 0.62, s], r: [0, rng() * TAU, 0] });
    for (let i = 0; i < 6; i++) {
      const a = rng() * TAU;
      const el = 0.3 + rng() * 0.9;
      k.add('glow', ico(0.007 + rng() * 0.006), '#d8ffe8', {
        p: [x + Math.cos(a) * Math.cos(el) * s * 0.95, lift + Math.sin(el) * s * 0.6, z + Math.sin(a) * Math.cos(el) * s * 0.95],
      }, 1.9);
    }
  }
  return finish(k, { faceCamera: false });
}

function ancientWorkshop(): ChamberKit {
  const k = new KitBuilder();
  k.add('stone', box(0.52, 0.03, 0.18), '#8c7558', { p: [0, 0.015, -0.02] });
  for (const x of [-0.18, 0.18]) {
    k.add('stone', box(0.07, 0.32, 0.07), '#b49a76', { p: [x, 0.19, -0.02] });
    k.add('stone', box(0.095, 0.03, 0.095), '#c4aa84', { p: [x, 0.36, -0.02] });
    k.add('stone', box(0.095, 0.03, 0.095), '#a68c69', { p: [x, 0.045, -0.02] });
  }
  k.add('stone', box(0.48, 0.065, 0.1), '#a88e6b', { p: [0, 0.405, -0.02] });
  for (let i = 0; i < 5; i++) {
    k.add('glow', box(0.022, 0.03, 0.006), '#ffd98a', { p: [-0.12 + i * 0.06, 0.405, 0.032] }, 2.4);
  }
  // Anvil and hammer in front of the arch.
  k.add('metal', box(0.05, 0.05, 0.045), '#3c3e45', { p: [0.13, 0.055, 0.13] });
  k.add('metal', box(0.11, 0.035, 0.05), '#4a4c54', { p: [0.13, 0.097, 0.13] });
  k.add('metal', cone(0.025, 0.04, 4), '#4a4c54', { p: [0.2, 0.097, 0.13], r: [0, 0, -Math.PI / 2] });
  k.add('body', cyl(0.006, 0.006, 0.12, 5), '#6b4a31', { p: [0.1, 0.13, 0.15], r: [0, 0, 1.2] });
  // Brazier.
  k.add('metal', cyl(0.045, 0.03, 0.05, 8), '#3a3330', { p: [-0.16, 0.06, 0.14] });
  k.add('metal', cyl(0.008, 0.008, 0.04, 4), '#3a3330', { p: [-0.16, 0.02, 0.14] });
  k.add('glow', ico(0.035, 0), '#ff8a2c', { p: [-0.16, 0.09, 0.14] }, 2.6);
  // Golden cog standing in the arch (spins).
  k.add('spin', torus(0.085, 0.016, TAU, 6, 22), '#ffc85c', { p: [0, 0.2, -0.02] }, 1.8);
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * TAU;
    k.add('spin', box(0.026, 0.03, 0.026), '#ffc85c', {
      p: [Math.cos(a) * 0.106, 0.2 + Math.sin(a) * 0.106, -0.02],
      r: [0, 0, a],
    }, 1.8);
  }
  k.add('spin', cyl(0.025, 0.025, 0.04, 10), '#ffe4a0', { p: [0, 0.2, -0.02], r: [Math.PI / 2, 0, 0] }, 2.2);
  return finish(k, { faceCamera: true, spin: { axis: 'z', pivot: [0, 0.2, -0.02], speed: 0.6 } });
}

function sealedChamber(): ChamberKit {
  const k = new KitBuilder();
  k.add('stone', box(0.52, 0.08, 0.17), '#5b556b', { p: [0, 0.04, -0.03] });
  k.add('stone', torus(0.185, 0.055, TAU, 8, 24), '#6d6680', { p: [0, 0.25, -0.03] });
  k.add('stone', cyl(0.16, 0.16, 0.05, 28), '#8d84a8', { p: [0, 0.25, -0.03], r: [Math.PI / 2, 0, 0] });
  k.add('metal', box(0.3, 0.022, 0.012), '#5d5a66', { p: [0, 0.25, 0.0] });
  k.add('metal', box(0.022, 0.3, 0.012), '#5d5a66', { p: [0, 0.25, 0.0] });
  k.add('glow', torus(0.115, 0.007, TAU, 4, 32), '#d7c5ff', { p: [0, 0.25, 0.004] }, 2.1);
  k.add('glow', new THREE.OctahedronGeometry(1, 0), '#efe6ff', { p: [0, 0.25, 0.01], s: [0.036, 0.05, 0.012] }, 2.6);
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * TAU + Math.PI / 8;
    k.add('glow', box(0.016, 0.016, 0.01), '#cbb5ff', {
      p: [Math.cos(a) * 0.185, 0.25 + Math.sin(a) * 0.185, 0.05],
      r: [0, 0, a],
    }, 2);
  }
  return finish(k, { faceCamera: true });
}

function unstableFault(): ChamberKit {
  const k = new KitBuilder();
  const rng = rngFor('fault');
  const crack: Array<[number, number]> = [
    [-0.36, 0.0],
    [-0.2, 0.08],
    [-0.06, -0.05],
    [0.08, 0.07],
    [0.21, -0.04],
    [0.36, 0.05],
  ];
  for (let i = 0; i < crack.length - 1; i++) {
    const [ax, az] = crack[i]!;
    const [bx, bz] = crack[i + 1]!;
    const t = between(ax, az, bx, bz, 0.006);
    k.add('hazard', box(t.length + 0.03, 0.02, 0.055), '#ff2a1c', t, 2.1);
    k.add('hazard', box(t.length + 0.02, 0.024, 0.018), '#ffc09a', t, 2.8);
    // Broken, tilted slabs on both lips of the fissure.
    for (const side of [-1, 1]) {
      const nx = -(bz - az) / t.length;
      const nz = (bx - ax) / t.length;
      const off = 0.07 + rng() * 0.03;
      k.add('stone', box(t.length * 0.95, 0.04, 0.09), side > 0 ? '#45363a' : '#3a2e30', {
        p: [(ax + bx) / 2 + nx * off * side, 0.03, (az + bz) / 2 + nz * off * side],
        r: [side * (0.22 + rng() * 0.2), t.r![1], (rng() - 0.5) * 0.2],
      });
    }
  }
  const spike = plain(getStalagmiteGeometry());
  for (let i = 0; i < 5; i++) {
    const a = rng() * TAU;
    const d = 0.2 + rng() * 0.12;
    k.add('stone', spike, '#352a2a', {
      p: [Math.cos(a) * d, 0, Math.sin(a) * d],
      r: [(rng() - 0.5) * 0.7, rng() * TAU, (rng() - 0.5) * 0.7],
      s: [0.06, 0.12 + rng() * 0.1, 0.06],
    });
  }
  const crystal = getCrystalGeometry();
  for (let i = 0; i < 6; i++) {
    const [cx, cz] = crack[1 + Math.floor(rng() * (crack.length - 2))]!;
    const a = rng() * TAU;
    k.add('hazard', crystal, '#ff4a3a', {
      p: [cx + Math.cos(a) * 0.05, 0.0, cz + Math.sin(a) * 0.05],
      r: [0.5 + rng() * 0.3, Math.PI / 2 - a, 0],
      s: [0.03, 0.08 + rng() * 0.06, 0.03],
    }, 1.8);
  }
  return finish(k, { faceCamera: true });
}

const DISCOVERY_KIT_BUILDERS: Record<UndergroundDiscoveryKind, () => ChamberKit> = {
  crystal_geode: crystalGeode,
  aether_breath: aetherBreath,
  thermal_spring: thermalSpring,
  natural_well: naturalWell,
  iron_vein: ironVein,
  clay_bank: clayBank,
  fossil_roots: fossilRoots,
  fungiculture,
  woolly_lichen: woollyLichen,
  ancient_workshop: ancientWorkshop,
  sealed_chamber: sealedChamber,
  unstable_fault: unstableFault,
};

const kitCache = new Map<string, ChamberKit>();

export function getDiscoveryKit(kind: UndergroundDiscoveryKind): ChamberKit {
  let kit = kitCache.get(kind);
  if (!kit) {
    kit = (DISCOVERY_KIT_BUILDERS[kind] ?? crystalGeode)();
    kitCache.set(kind, kit);
  }
  return kit;
}

// ---- sealed rubble ----------------------------------------------------------

export function getRubbleHeapKit(): ChamberKit {
  const cached = kitCache.get('__rubble');
  if (cached) return cached;
  const k = new KitBuilder();
  const rng = rngFor('rubble');
  const rubble = getRubbleGeometry();
  // A collapsed heap of rock choking the chamber. A hot core sits inside the
  // pile, so light only escapes through the gaps between the stones.
  k.add('glow', ico(0.17, 1), '#ff7424', { p: [0, 0.04, 0], s: [1.2, 0.7, 1.2] }, 0.4);
  const chunks: Array<[number, number, number, number]> = [];
  // Capstones over the core.
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * TAU + rng() * 0.5;
    const d = 0.08 + rng() * 0.03;
    chunks.push([Math.cos(a) * d, Math.sin(a) * d, 0.07 + rng() * 0.02, 0.1]);
  }
  // Ring around the core.
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * TAU + rng() * 0.35;
    const d = 0.21 + rng() * 0.05;
    chunks.push([Math.cos(a) * d, Math.sin(a) * d, 0.06 + rng() * 0.03, 0.01]);
  }
  // Scree spilling onto the floor.
  for (let i = 0; i < 14; i++) {
    const a = rng() * TAU;
    const d = 0.27 + rng() * 0.15;
    chunks.push([Math.cos(a) * d, Math.sin(a) * d, 0.022 + rng() * 0.028, 0]);
  }
  for (const [x, z, s, lift] of chunks) {
    const shade = 0.75 + rng() * 0.45;
    k.add('stone', rubble, new THREE.Color('#a39283').multiplyScalar(shade), {
      p: [x, s * 0.4 + lift, z],
      s: [s * (1 + rng() * 0.35), s * (0.7 + rng() * 0.3), s * (0.9 + rng() * 0.3)],
      r: [rng() * 3, rng() * 3, rng() * 3],
    });
  }
  // Planks nailed across the heap: barred, not yet explored.
  k.add('body', box(0.44, 0.02, 0.045), '#6b4a31', { p: [0.0, 0.2, 0.06], r: [0.35, 0, 0.16] });
  k.add('body', box(0.4, 0.02, 0.045), '#5b4130', { p: [0.02, 0.215, 0.04], r: [0.35, 0, -0.2] });
  const kit = finish(k, { faceCamera: true });
  kitCache.set('__rubble', kit);
  return kit;
}

// ---- player pieces ------------------------------------------------------------

/** Outpost: stone platform, timber hut with an owner-coloured roof and banner. */
export function getOutpostKit(): ChamberKit {
  const cached = kitCache.get('__outpost');
  if (cached) return cached;
  const k = new KitBuilder();
  k.add('stone', cyl(0.16, 0.18, 0.05, 6), '#6f6862', { p: [0, 0.025, 0] });
  k.add('owner', cyl(0.165, 0.165, 0.016, 6), '#ffffff', { p: [0, 0.052, 0] });
  k.add('body', box(0.17, 0.12, 0.14), '#8a6a4a', { p: [0, 0.12, -0.01] });
  // Corner posts.
  for (const [x, z] of [[-0.085, -0.075], [0.085, -0.075], [-0.085, 0.055], [0.085, 0.055]] as const) {
    k.add('body', box(0.022, 0.13, 0.022), '#5a3f2b', { p: [x, 0.125, z] });
  }
  k.add('body', box(0.05, 0.08, 0.008), '#2c1f17', { p: [0.02, 0.1, 0.062] });
  // Pitched roof: a four-sided pyramid stretched along X.
  k.add('owner', cyl(0, 0.15, 0.1, 4), '#ffffff', { p: [0, 0.23, -0.01], r: [0, Math.PI / 4, 0], s: [1.2, 1, 1] });
  // Banner pole + flag.
  k.add('body', cyl(0.009, 0.011, 0.42, 6), '#4d3a2a', { p: [-0.12, 0.25, 0.07] });
  k.add('owner', box(0.11, 0.075, 0.008), '#ffffff', { p: [-0.065, 0.405, 0.07] });
  k.add('ownerGlow', new THREE.OctahedronGeometry(1, 0), '#ffffff', { p: [-0.12, 0.485, 0.07], s: [0.024, 0.036, 0.024] }, 2.2);
  // Torch by the door.
  k.add('body', cyl(0.006, 0.008, 0.1, 5), '#4d3a2a', { p: [0.08, 0.1, 0.08] });
  k.add('glow', new THREE.OctahedronGeometry(1, 0), '#ffb45c', { p: [0.08, 0.16, 0.08], s: [0.016, 0.026, 0.016] }, 3);
  const kit = finish(k, { faceCamera: true });
  kitCache.set('__outpost', kit);
  return kit;
}

/** Extractor: timber derrick with a glowing crystal core and a spinning drill. */
export function getExtractorKit(): ChamberKit {
  const cached = kitCache.get('__extractor');
  if (cached) return cached;
  const k = new KitBuilder();
  const top = 0.44;
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * TAU + Math.PI / 6;
    const r = 0.11;
    const lean = Math.atan2(r, top);
    k.add('body', box(0.02, top / Math.cos(lean), 0.02), '#6b4a31', {
      p: [Math.cos(a) * r * 0.5, top / 2, Math.sin(a) * r * 0.5],
      r: [-lean, Math.PI / 2 - a, 0],
    });
  }
  k.add('metal', cyl(0.035, 0.04, 0.04, 8), '#55585f', { p: [0, top, 0] });
  k.add('owner', cyl(0.042, 0.042, 0.018, 8), '#ffffff', { p: [0, top - 0.035, 0] });
  k.add('metal', cyl(0.006, 0.006, 0.3, 5), '#9a9da5', { p: [0, top - 0.17, 0] });
  k.add('metal', torus(0.08, 0.008, TAU, 4, 16), '#55585f', { p: [0, 0.02, 0], r: [Math.PI / 2, 0, 0] });
  k.add('glow', new THREE.OctahedronGeometry(1, 0), '#7dfff2', { p: [0, 0.27, 0], s: [0.045, 0.07, 0.045] }, 2.6);
  // Drill bit with spiral flutes.
  k.add('spin', cone(0.045, 0.16, 8), '#7ef6ff', { p: [0, 0.09, 0], r: [Math.PI, 0, 0] }, 1.5);
  for (let i = 0; i < 3; i++) {
    const pts: Array<[number, number, number]> = [];
    for (let j = 0; j <= 8; j++) {
      const t = j / 8;
      const a = (i / 3) * TAU + t * TAU;
      const r = 0.047 * (1 - t);
      pts.push([Math.cos(a) * r, 0.17 - t * 0.16, Math.sin(a) * r]);
    }
    k.add('spin', tube(pts, 0.006, 16), '#e4ffff', {}, 2.2);
  }
  const kit = finish(k, { faceCamera: false, spin: { axis: 'y', pivot: [0, 0, 0], speed: 3.2 } });
  kitCache.set('__extractor', kit);
  return kit;
}

/** Shaft foot: timber headframe and ladder where a surface shaft comes down. */
export function getShaftKit(): ChamberKit {
  const cached = kitCache.get('__shaft');
  if (cached) return cached;
  const k = new KitBuilder();
  k.add('stone', cyl(0.12, 0.13, 0.02, 16), '#1b1714', { p: [0, 0.01, 0] });
  k.add('owner', torus(0.125, 0.014, TAU, 6, 24), '#ffffff', { p: [0, 0.022, 0], r: [Math.PI / 2, 0, 0] });
  for (const x of [-0.1, 0.1]) {
    k.add('body', box(0.022, 0.5, 0.022), '#6b4a31', { p: [x, 0.25, -0.02] });
  }
  k.add('body', box(0.25, 0.026, 0.03), '#5a3f2b', { p: [0, 0.49, -0.02] });
  for (let i = 0; i < 6; i++) {
    k.add('body', box(0.12, 0.012, 0.012), '#7a5638', { p: [0, 0.07 + i * 0.07, -0.02] });
  }
  k.add('metal', cyl(0.028, 0.028, 0.03, 10), '#55585f', { p: [0, 0.52, -0.02], r: [0, 0, Math.PI / 2] });
  k.add('ownerGlow', box(0.03, 0.04, 0.03), '#ffffff', { p: [0.1, 0.42, 0.02] }, 2.2);
  const kit = finish(k, { faceCamera: true });
  kitCache.set('__shaft', kit);
  return kit;
}

/** Lift: iron cage with an owner-coloured platform. */
export function getLiftKit(): ChamberKit {
  const cached = kitCache.get('__lift');
  if (cached) return cached;
  const k = new KitBuilder();
  const h = 0.36;
  for (const [x, z] of [[-0.07, -0.07], [0.07, -0.07], [-0.07, 0.07], [0.07, 0.07]] as const) {
    k.add('metal', box(0.014, h, 0.014), '#6a6e76', { p: [x, h / 2, z] });
  }
  for (const y of [0.02, h]) {
    k.add('metal', box(0.16, 0.014, 0.014), '#6a6e76', { p: [0, y, -0.07] });
    k.add('metal', box(0.16, 0.014, 0.014), '#6a6e76', { p: [0, y, 0.07] });
    k.add('metal', box(0.014, 0.014, 0.16), '#6a6e76', { p: [-0.07, y, 0] });
    k.add('metal', box(0.014, 0.014, 0.16), '#6a6e76', { p: [0.07, y, 0] });
  }
  k.add('owner', box(0.13, 0.02, 0.13), '#ffffff', { p: [0, 0.03, 0] });
  k.add('metal', cyl(0.004, 0.004, 0.5, 4), '#8a8d94', { p: [0, h + 0.25, 0] });
  k.add('ownerGlow', box(0.026, 0.026, 0.026), '#ffffff', { p: [0, h + 0.02, 0] }, 2.2);
  const kit = finish(k, { faceCamera: true });
  kitCache.set('__lift', kit);
  return kit;
}

const _kq = new THREE.Quaternion();
const _up = new THREE.Vector3(0, 1, 0);

/** Placement matrix of a kit: floor position, yaw, uniform scale. */
export function kitMatrix(x: number, y: number, z: number, yaw: number, scale: number): THREE.Matrix4 {
  _kq.setFromAxisAngle(_up, yaw);
  return new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), _kq, new THREE.Vector3(scale, scale, scale));
}

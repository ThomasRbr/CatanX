import * as THREE from 'three';
import type { SkySiteKind } from '@catanx/engine';
import { createVisualRng, rngRange } from '../../utils/seededVisualRandom';
import { ISLAND_RADIUS, SKY_SITE_COLORS } from './skyLayout';
import { PartBuilder, flatTriangleDouble, ringNoise, spanMatrix, unitRod } from './skyGeometry';

/**
 * Procedural floating island.
 *
 * Local frame: grass top at y ≈ 0 (dome peaks at +DOME), the landmark "front"
 * faces local +Z (the island is yawed so that front points at the camera).
 * Everything static is baked into two vertex-coloured geometries:
 *   - `body`: lit (rock, turf, trees, buildings...)
 *   - `glow`: unlit HDR accents (crystals, lanterns, lenses) that bloom.
 * Animated pieces are returned as anchors for small dedicated components.
 */

const SEGMENTS = 30;
const DOME = 0.05;

export interface IslandAnchors {
  waterfall?: THREE.Vector3[];
  pinwheel?: { position: THREE.Vector3; facing: number };
  armillary?: THREE.Vector3;
  aetherPool?: THREE.Vector3;
  storm?: boolean;
}

export interface IslandBuild {
  body: THREE.BufferGeometry | null;
  glow: THREE.BufferGeometry | null;
  anchors: IslandAnchors;
  depth: number;
  /** Bottom tip of the rock, local. */
  tip: THREE.Vector3;
}

interface Palette {
  grassA: string;
  grassB: string;
  turf: string;
  rock: [string, string, string, string];
}

const DEFAULT_ROCK: Palette['rock'] = ['#6d4a33', '#b48c62', '#8a7473', '#4d4659'];

const PALETTES: Record<SkySiteKind | 'veiled', Palette> = {
  floating_garden: { grassA: '#4f9f45', grassB: '#7fc25a', turf: '#3d5a2a', rock: DEFAULT_ROCK },
  wind_bazaar: { grassA: '#86a84a', grassB: '#b1bd62', turf: '#5a5530', rock: ['#7a5236', '#c39a68', '#927a70', '#544a58'] },
  hanging_ruins: { grassA: '#8f9d58', grassB: '#b4b479', turf: '#5b5835', rock: ['#7a5a3e', '#cdb08a', '#9a8678', '#5a5060'] },
  observatory: { grassA: '#5f9f68', grassB: '#8cc08a', turf: '#3e5a3e', rock: ['#6a5040', '#a99a8a', '#7d7882', '#47465a'] },
  aether_source: { grassA: '#4f9a8a', grassB: '#80b9a5', turf: '#35554f', rock: ['#5f4a4a', '#9d8aa0', '#76688c', '#40385c'] },
  calm_mooring: { grassA: '#6aab55', grassB: '#98c86e', turf: '#44602f', rock: DEFAULT_ROCK },
  turbulent_zone: { grassA: '#475149', grassB: '#5e6457', turf: '#2c2f2c', rock: ['#3e3436', '#5d5157', '#45404c', '#2a2733'] },
  veiled: { grassA: '#7f8c80', grassB: '#93a091', turf: '#5f645c', rock: ['#6b6262', '#8b8384', '#6f6b75', '#4d4a58'] },
};

const tmpColorB = new THREE.Color();

function lerpHex(a: string, b: string, t: number, out: THREE.Color): THREE.Color {
  return out.set(a).lerp(tmpColorB.set(b), THREE.MathUtils.clamp(t, 0, 1));
}

/** Indexed loft between rings of `SEGMENTS` points (wrapping). */
function loft(rings: Array<(theta: number, j: number) => THREE.Vector3>): THREE.BufferGeometry {
  const positions: number[] = [];
  for (const ring of rings) {
    for (let j = 0; j < SEGMENTS; j++) {
      const p = ring((j / SEGMENTS) * Math.PI * 2, j);
      positions.push(p.x, p.y, p.z);
    }
  }
  const indices: number[] = [];
  for (let k = 0; k < rings.length - 1; k++) {
    for (let j = 0; j < SEGMENTS; j++) {
      const a = k * SEGMENTS + j;
      const b = k * SEGMENTS + ((j + 1) % SEGMENTS);
      const c = (k + 1) * SEGMENTS + j;
      const d = (k + 1) * SEGMENTS + ((j + 1) % SEGMENTS);
      indices.push(a, b, c, b, d, c);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

interface Ctx {
  body: PartBuilder;
  glow: PartBuilder;
  rng: () => number;
  radiusAt: (theta: number) => number;
  /** Grass height at a local (x, z). */
  top: (x: number, z: number) => number;
  accent: THREE.Color;
  anchors: IslandAnchors;
}

function placeOnTop(ctx: Ctx, x: number, z: number, lift = 0): [number, number, number] {
  return [x, ctx.top(x, z) + lift, z];
}

function polar(ctx: Ctx, theta: number, fraction: number): [number, number] {
  const r = ctx.radiusAt(theta) * fraction;
  return [Math.cos(theta) * r, Math.sin(theta) * r];
}

// ---------------------------------------------------------------------------
// Shared vegetation / props

function addTree(ctx: Ctx, x: number, z: number, size: number, blossom = false) {
  const { body, rng } = ctx;
  const y = ctx.top(x, z);
  const trunkHeight = 0.1 * size;
  body.add(new THREE.CylinderGeometry(0.011 * size, 0.018 * size, trunkHeight, 6), '#6a4630', {
    position: [x, y + trunkHeight / 2, z],
    flat: true,
  });
  const greens = blossom
    ? ['#f1a9c6', '#f7c4d8', '#e78fb5']
    : ['#3f8a42', '#5aa54e', '#77bd5c', '#4c9a4a'];
  const blobs = 3;
  for (let i = 0; i < blobs; i++) {
    const angle = rng() * Math.PI * 2;
    const offset = i === 0 ? 0 : 0.035 * size;
    body.add(new THREE.IcosahedronGeometry(rngRange(rng, 0.05, 0.068) * size, 0), greens[i % greens.length]!, {
      position: [
        x + Math.cos(angle) * offset,
        y + trunkHeight + 0.04 * size + (i === 0 ? 0.03 * size : 0),
        z + Math.sin(angle) * offset,
      ],
      rotation: [rng() * 3, rng() * 3, rng() * 3],
      flat: true,
      jitter: 0.08,
      seed: Math.floor(rng() * 1e9),
    });
  }
}

function addRimTufts(ctx: Ctx, palette: Palette, count: number) {
  const { body, rng } = ctx;
  for (let i = 0; i < count; i++) {
    const theta = (i / count) * Math.PI * 2 + rng() * 0.3;
    const [x, z] = polar(ctx, theta, rngRange(rng, 0.84, 0.97));
    const height = rngRange(rng, 0.03, 0.06);
    body.add(new THREE.ConeGeometry(rngRange(rng, 0.018, 0.03), height, 5), i % 2 ? palette.grassA : palette.grassB, {
      position: [x, ctx.top(x, z) + height / 2 - 0.004, z],
      rotation: [rngRange(rng, -0.2, 0.2), 0, rngRange(rng, -0.2, 0.2)],
      flat: true,
      jitter: 0.12,
      seed: i + 7,
    });
  }
}

function addBoulders(ctx: Ctx, count: number, color = '#9a918a') {
  const { body, rng } = ctx;
  for (let i = 0; i < count; i++) {
    const theta = rng() * Math.PI * 2;
    const [x, z] = polar(ctx, theta, rngRange(rng, 0.7, 0.92));
    const size = rngRange(rng, 0.025, 0.05);
    body.add(new THREE.DodecahedronGeometry(size, 0), color, {
      position: placeOnTop(ctx, x, z, size * 0.35),
      rotation: [rng() * 3, rng() * 3, rng() * 3],
      scale: [1, rngRange(rng, 0.6, 0.9), 1],
      flat: true,
      jitter: 0.1,
      seed: i + 31,
    });
  }
}

function addFlowers(ctx: Ctx, count: number, spread: number, cx = 0, cz = 0) {
  const { body, rng } = ctx;
  const colors = ['#ff9ec4', '#ffe27a', '#ffffff', '#c7a6ff', '#ff8a65'];
  for (let i = 0; i < count; i++) {
    const angle = rng() * Math.PI * 2;
    const r = Math.sqrt(rng()) * spread;
    const x = cx + Math.cos(angle) * r;
    const z = cz + Math.sin(angle) * r;
    body.add(new THREE.IcosahedronGeometry(0.011, 0), colors[i % colors.length]!, {
      position: placeOnTop(ctx, x, z, 0.012),
      flat: true,
    });
  }
}

function addLantern(ctx: Ctx, position: [number, number, number], color = '#ffcf7a') {
  ctx.glow.add(new THREE.OctahedronGeometry(0.018, 0), color, {
    position,
    scale: [1, 1.4, 1],
    intensity: 3.2,
  });
}

// ---------------------------------------------------------------------------
// Landmarks

function buildGarden(ctx: Ctx) {
  const { rng } = ctx;
  const treeSpots: Array<[number, number, number, boolean]> = [
    [-0.26, -0.22, 1.25, false],
    [0.05, -0.36, 1.05, true],
    [0.3, -0.18, 1.15, false],
    [-0.38, 0.08, 0.95, false],
    [-0.12, -0.02, 0.85, false],
  ];
  for (const [x, z, size, blossom] of treeSpots) addTree(ctx, x, z, size, blossom);
  // Hedge arcs and flower beds.
  addFlowers(ctx, 26, 0.16, -0.05, 0.22);
  addFlowers(ctx, 12, 0.1, 0.32, 0.08);
  for (let i = 0; i < 7; i++) {
    const angle = -0.4 + i * 0.32;
    ctx.body.add(new THREE.IcosahedronGeometry(0.034, 0), i % 2 ? '#4b9346' : '#3f8340', {
      position: placeOnTop(ctx, -0.05 + Math.cos(angle + Math.PI) * 0.2, 0.22 + Math.sin(angle + Math.PI) * 0.2, 0.018),
      scale: [1.1, 0.75, 1.1],
      flat: true,
      jitter: 0.1,
      seed: i,
    });
  }
  // Pond on the front-right, spilling over the rim as a waterfall.
  const theta = Math.PI * 0.32;
  const [px, pz] = polar(ctx, theta, 0.62);
  ctx.glow.add(new THREE.CylinderGeometry(0.115, 0.115, 0.008, 18), '#76d3ee', {
    position: placeOnTop(ctx, px, pz, 0.006),
    scale: [1, 1, 0.8],
    intensity: 0.92,
  });
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2;
    ctx.body.add(new THREE.DodecahedronGeometry(0.02, 0), '#a39a90', {
      position: placeOnTop(ctx, px + Math.cos(a) * 0.12, pz + Math.sin(a) * 0.096, 0.006),
      rotation: [rng(), rng(), rng()],
      flat: true,
    });
  }
  const rim = ctx.radiusAt(theta);
  const out = new THREE.Vector3(Math.cos(theta), 0, Math.sin(theta));
  const start = out.clone().multiplyScalar(rim * 0.96).setY(0.004);
  ctx.anchors.waterfall = [
    start,
    start.clone().addScaledVector(out, 0.06).setY(-0.03),
    start.clone().addScaledVector(out, 0.1).setY(-0.36),
    start.clone().addScaledVector(out, 0.12).setY(-0.95),
  ];
}

const TENT_COLORS: Array<[string, string]> = [
  ['#ffc94a', '#d9423a'],
  ['#ffc94a', '#2a9d9a'],
  ['#ffe9c2', '#e0702c'],
];

function addTent(ctx: Ctx, x: number, z: number, radius: number, colors: [string, string], seed: number) {
  const y = ctx.top(x, z);
  const wall = 0.055;
  ctx.body.add(new THREE.CylinderGeometry(radius, radius, wall, 10, 1, true), '#f3e6cc', {
    position: [x, y + wall / 2, z],
    flat: true,
  });
  const roof = radius * 1.25;
  ctx.body.add(
    new THREE.ConeGeometry(radius * 1.12, roof, 10, 1),
    (p, out) => {
      const sector = Math.floor(((Math.atan2(p.z - z, p.x - x) + Math.PI) / (Math.PI * 2)) * 10);
      out.set(sector % 2 ? colors[0] : colors[1]);
    },
    { position: [x, y + wall + roof / 2, z], flat: true, perFace: true, seed },
  );
  ctx.body.add(unitRod(4), '#5b3f2c', {
    matrix: spanMatrix(new THREE.Vector3(x, y + wall + roof * 0.9, z), new THREE.Vector3(x, y + wall + roof + 0.07, z), 0.005),
  });
  ctx.body.add(
    flatTriangleDouble(
      new THREE.Vector3(x, y + wall + roof + 0.07, z),
      new THREE.Vector3(x, y + wall + roof + 0.04, z),
      new THREE.Vector3(x + 0.05, y + wall + roof + 0.055, z + 0.01),
    ),
    colors[1],
  );
}

function buildBazaar(ctx: Ctx) {
  const { rng, body } = ctx;
  // Sandy plaza.
  body.add(new THREE.CylinderGeometry(0.34, 0.36, 0.012, 22), '#d9bb8a', {
    position: placeOnTop(ctx, 0, -0.04, 0.0),
    scale: [1, 1, 0.85],
    jitter: 0.05,
    seed: 3,
  });
  addTent(ctx, -0.2, -0.2, 0.11, TENT_COLORS[0]!, 1);
  addTent(ctx, 0.17, -0.27, 0.095, TENT_COLORS[1]!, 2);
  addTent(ctx, -0.34, 0.12, 0.085, TENT_COLORS[2]!, 3);
  // Market stalls with striped awnings.
  const stalls: Array<[number, number, number, [string, string]]> = [
    [0.27, 0.02, -0.6, ['#2a9d9a', '#fff3da']],
    [0.02, 0.2, 0.15, ['#d9423a', '#fff3da']],
  ];
  for (const [x, z, yaw, colors] of stalls) {
    const y = ctx.top(x, z);
    body.add(new THREE.BoxGeometry(0.12, 0.04, 0.05), '#8b5a36', {
      position: [x, y + 0.02, z],
      rotation: [0, yaw, 0],
      flat: true,
    });
    for (let s = 0; s < 4; s++) {
      body.add(new THREE.BoxGeometry(0.032, 0.006, 0.07), s % 2 ? colors[0] : colors[1], {
        position: [x + Math.cos(-yaw) * (s - 1.5) * 0.031, y + 0.085, z + Math.sin(-yaw) * (s - 1.5) * 0.031],
        rotation: [0.35, yaw, 0],
      });
    }
    for (const side of [-1, 1]) {
      body.add(unitRod(4), '#5b3f2c', {
        matrix: spanMatrix(
          new THREE.Vector3(x + Math.cos(-yaw) * side * 0.055, y, z + Math.sin(-yaw) * side * 0.055),
          new THREE.Vector3(x + Math.cos(-yaw) * side * 0.055, y + 0.085, z + Math.sin(-yaw) * side * 0.055),
          0.004,
        ),
      });
    }
  }
  // Crates and barrels.
  for (let i = 0; i < 6; i++) {
    const x = rngRange(rng, -0.1, 0.32);
    const z = rngRange(rng, 0.1, 0.34);
    if (i % 2) {
      body.add(new THREE.BoxGeometry(0.03, 0.03, 0.03), '#a8743f', {
        position: placeOnTop(ctx, x, z, 0.015),
        rotation: [0, rng() * 3, 0],
        flat: true,
      });
    } else {
      body.add(new THREE.CylinderGeometry(0.014, 0.014, 0.034, 8), '#7d5233', {
        position: placeOnTop(ctx, x, z, 0.017),
        flat: true,
      });
    }
  }
  // Bunting strung between poles.
  const poles = [
    new THREE.Vector3(-0.42, 0, -0.18),
    new THREE.Vector3(0.0, 0, -0.5),
    new THREE.Vector3(0.42, 0, -0.14),
    new THREE.Vector3(0.12, 0, 0.38),
  ];
  for (const pole of poles) pole.y = ctx.top(pole.x, pole.z);
  const poleHeight = 0.2;
  for (const pole of poles) {
    body.add(unitRod(5), '#6b4a33', {
      matrix: spanMatrix(pole, pole.clone().setY(pole.y + poleHeight), 0.006),
    });
  }
  const flagColors = ['#ffc94a', '#d9423a', '#2a9d9a', '#ffffff', '#e0702c', '#7a5cd6'];
  let flag = 0;
  for (let i = 0; i < poles.length; i++) {
    const a = poles[i]!.clone().setY(poles[i]!.y + poleHeight);
    const b = poles[(i + 1) % poles.length]!.clone();
    b.y += poleHeight;
    const steps = 7;
    for (let s = 0; s < steps; s++) {
      const t0 = s / steps;
      const t1 = (s + 1) / steps;
      const p0 = a.clone().lerp(b, t0);
      const p1 = a.clone().lerp(b, t1);
      p0.y -= Math.sin(t0 * Math.PI) * 0.06;
      p1.y -= Math.sin(t1 * Math.PI) * 0.06;
      body.add(unitRod(3), '#3d2d22', { matrix: spanMatrix(p0, p1, 0.0018) });
      const mid = p0.clone().lerp(p1, 0.5);
      body.add(
        flatTriangleDouble(p0.clone().lerp(p1, 0.15), p0.clone().lerp(p1, 0.85), mid.clone().setY(mid.y - 0.04)),
        flagColors[flag++ % flagColors.length]!,
      );
    }
  }
  addLantern(ctx, placeOnTop(ctx, 0.27, 0.02, 0.12));
  addLantern(ctx, placeOnTop(ctx, 0.02, 0.2, 0.12));
  ctx.anchors.pinwheel = {
    position: new THREE.Vector3(0.36, ctx.top(0.36, 0.2), 0.2),
    facing: Math.PI * 0.25,
  };
}

function buildRuins(ctx: Ctx) {
  const { body, rng } = ctx;
  const stone = '#e6d3b0';
  const stoneShade = '#c9b38d';
  // Broken paving.
  for (let i = 0; i < 26; i++) {
    const angle = rng() * Math.PI * 2;
    const r = Math.sqrt(rng()) * 0.36;
    const x = Math.cos(angle) * r;
    const z = Math.sin(angle) * r - 0.05;
    body.add(new THREE.BoxGeometry(rngRange(rng, 0.05, 0.08), 0.012, rngRange(rng, 0.05, 0.08)), i % 3 ? stoneShade : stone, {
      position: placeOnTop(ctx, x, z, 0.002),
      rotation: [rngRange(rng, -0.05, 0.05), rng() * 3, rngRange(rng, -0.05, 0.05)],
      flat: true,
      jitter: 0.08,
      seed: i,
    });
  }
  // Colonnade in a broken semicircle.
  const heights = [0.32, 0.12, 0.3, 0.2, 0.33, 0.07];
  heights.forEach((height, i) => {
    const angle = Math.PI * (1.05 + i * 0.18);
    const x = Math.cos(angle) * 0.3;
    const z = Math.sin(angle) * 0.3 - 0.02;
    const y = ctx.top(x, z);
    body.add(new THREE.BoxGeometry(0.075, 0.025, 0.075), stoneShade, { position: [x, y + 0.0125, z], flat: true });
    body.add(new THREE.CylinderGeometry(0.026, 0.03, height, 10), stone, {
      position: [x, y + 0.025 + height / 2, z],
      jitter: 0.04,
      seed: i,
    });
    if (height > 0.28) {
      body.add(new THREE.BoxGeometry(0.075, 0.022, 0.075), stoneShade, {
        position: [x, y + 0.025 + height + 0.011, z],
        flat: true,
      });
      if (i < heights.length - 1) {
        // Lintel fragment reaching towards the next column.
        const next = Math.PI * (1.05 + (i + 0.6) * 0.18);
        body.add(new THREE.BoxGeometry(0.11, 0.03, 0.045), stone, {
          position: [(x + Math.cos(next) * 0.3) / 2, y + height + 0.06, (z + Math.sin(next) * 0.3 - 0.02) / 2],
          rotation: [0, -(angle + next) / 2 + Math.PI / 2, 0.08],
          flat: true,
        });
      }
    }
    if (i % 2) {
      body.add(new THREE.IcosahedronGeometry(0.022, 0), '#5f8f45', {
        position: [x + 0.02, y + height * 0.6, z + 0.02],
        scale: [1, 1.6, 1],
        flat: true,
      });
    }
  });
  // Fallen drums.
  for (let i = 0; i < 3; i++) {
    const x = rngRange(rng, -0.1, 0.3);
    const z = rngRange(rng, 0.05, 0.3);
    body.add(new THREE.CylinderGeometry(0.027, 0.027, 0.07, 10), stone, {
      position: placeOnTop(ctx, x, z, 0.026),
      rotation: [Math.PI / 2, rng() * 3, 0],
    });
  }
  // Broken arch on the right.
  const ax = 0.3;
  const az = -0.12;
  const ay = ctx.top(ax, az);
  const archYaw = -0.5;
  const side = new THREE.Vector3(Math.cos(archYaw), 0, -Math.sin(archYaw));
  for (const s of [-1, 1]) {
    body.add(new THREE.BoxGeometry(0.05, 0.22, 0.05), stone, {
      position: [ax + side.x * s * 0.09, ay + 0.11, az + side.z * s * 0.09],
      rotation: [0, archYaw, 0],
      flat: true,
    });
  }
  body.add(new THREE.TorusGeometry(0.09, 0.024, 5, 12, Math.PI * 0.72), stone, {
    position: [ax, ay + 0.22, az],
    rotation: [0, archYaw, 0],
    flat: true,
  });
  // Relic on a pedestal: the reward of the ruins.
  body.add(new THREE.CylinderGeometry(0.035, 0.045, 0.07, 8), stoneShade, {
    position: placeOnTop(ctx, -0.05, -0.08, 0.035),
    flat: true,
  });
  ctx.glow.add(new THREE.OctahedronGeometry(0.03, 0), '#ffd27a', {
    position: placeOnTop(ctx, -0.05, -0.08, 0.11),
    scale: [1, 1.3, 1],
    intensity: 2.6,
  });
}

function buildObservatory(ctx: Ctx) {
  const { body } = ctx;
  const cx = -0.02;
  const cz = -0.1;
  const y = ctx.top(cx, cz);
  body.add(new THREE.CylinderGeometry(0.22, 0.24, 0.04, 20), '#cfc8bd', {
    position: [cx, y + 0.02, cz],
    jitter: 0.03,
    seed: 4,
  });
  body.add(new THREE.CylinderGeometry(0.15, 0.155, 0.17, 20), '#f2ebdf', {
    position: [cx, y + 0.04 + 0.085, cz],
  });
  // Window band.
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    ctx.glow.add(new THREE.BoxGeometry(0.022, 0.04, 0.01), '#ffd99a', {
      position: [cx + Math.cos(a) * 0.152, y + 0.13, cz + Math.sin(a) * 0.152],
      rotation: [0, -a + Math.PI / 2, 0],
      intensity: 1.9,
    });
  }
  body.add(new THREE.TorusGeometry(0.157, 0.009, 5, 24), '#c8a24a', {
    position: [cx, y + 0.21, cz],
    rotation: [Math.PI / 2, 0, 0],
  });
  const domeY = y + 0.21;
  body.add(new THREE.SphereGeometry(0.155, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2), (p, out) => {
    // Copper-teal dome with radial panel seams.
    const sector = Math.floor(((Math.atan2(p.z - cz, p.x - cx) + Math.PI) / (Math.PI * 2)) * 10);
    out.set(sector % 2 ? '#3fb2c6' : '#58c6d6');
  }, { position: [cx, domeY, cz], perFace: true });
  // Slit and telescope, aimed up and to the front.
  const aim = Math.PI * 0.35;
  const dir = new THREE.Vector3(Math.cos(aim) * 0.62, 0.78, Math.sin(aim) * 0.62).normalize();
  body.add(new THREE.BoxGeometry(0.05, 0.16, 0.02), '#1d2a36', {
    matrix: new THREE.Matrix4()
      .makeRotationY(-aim + Math.PI / 2)
      .premultiply(new THREE.Matrix4().makeTranslation(cx + dir.x * 0.11, domeY + 0.07, cz + dir.z * 0.11))
      .multiply(new THREE.Matrix4().makeRotationX(-0.6)),
  });
  const base = new THREE.Vector3(cx, domeY + 0.04, cz);
  const tipPoint = base.clone().addScaledVector(dir, 0.27);
  body.add(new THREE.CylinderGeometry(1, 1.15, 1, 10), '#c8a24a', { matrix: spanMatrix(base, tipPoint, 0.026) });
  body.add(new THREE.CylinderGeometry(1, 1, 1, 10), '#7d5a2a', {
    matrix: spanMatrix(base.clone().addScaledVector(dir, 0.09), base.clone().addScaledVector(dir, 0.13), 0.032),
  });
  ctx.glow.add(new THREE.CylinderGeometry(1, 1, 1, 10), '#9ff0ff', {
    matrix: spanMatrix(tipPoint, tipPoint.clone().addScaledVector(dir, 0.006), 0.024),
    intensity: 3.4,
  });
  // Stairs to the door, lamp posts.
  for (let s = 0; s < 3; s++) {
    body.add(new THREE.BoxGeometry(0.09, 0.014, 0.03), '#d9d2c6', {
      position: [cx + 0.02, y + 0.008 + s * 0.012, cz + 0.27 - s * 0.028],
      flat: true,
    });
  }
  body.add(new THREE.BoxGeometry(0.05, 0.08, 0.01), '#5b3f2c', {
    position: [cx + 0.02, y + 0.08, cz + 0.153],
  });
  for (const lx of [-0.06, 0.1]) {
    const lz = cz + 0.3;
    const ly = ctx.top(cx + lx, lz);
    body.add(unitRod(4), '#3a3530', {
      matrix: spanMatrix(new THREE.Vector3(cx + lx, ly, lz), new THREE.Vector3(cx + lx, ly + 0.09, lz), 0.004),
    });
    addLantern(ctx, [cx + lx, ly + 0.1, lz]);
  }
  ctx.anchors.armillary = new THREE.Vector3(0.3, ctx.top(0.3, 0.16), 0.16);
  body.add(new THREE.CylinderGeometry(0.02, 0.03, 0.08, 8), '#cfc8bd', {
    position: placeOnTop(ctx, 0.3, 0.16, 0.04),
    flat: true,
  });
}

function addCrystal(
  ctx: Ctx,
  base: THREE.Vector3,
  direction: THREE.Vector3,
  length: number,
  radius: number,
  color: THREE.ColorRepresentation,
  glow: boolean,
  intensity = 2.2,
) {
  const target = glow ? ctx.glow : ctx.body;
  const dir = direction.clone().normalize();
  const shaftEnd = base.clone().addScaledVector(dir, length * 0.72);
  const tipEnd = base.clone().addScaledVector(dir, length);
  target.add(new THREE.CylinderGeometry(1, 0.85, 1, 6), color, {
    matrix: spanMatrix(base, shaftEnd, radius),
    flat: true,
    intensity: glow ? intensity : 1,
    jitter: glow ? 0.18 : 0.1,
    seed: Math.floor(length * 1e4),
  });
  target.add(new THREE.ConeGeometry(1, 1, 6), color, {
    matrix: spanMatrix(shaftEnd, tipEnd, radius),
    flat: true,
    intensity: glow ? intensity * 1.15 : 1,
    jitter: glow ? 0.18 : 0.1,
    seed: Math.floor(length * 2e4),
  });
}

function buildAether(ctx: Ctx) {
  const { rng, body } = ctx;
  const cx = 0;
  const cz = -0.04;
  const y = ctx.top(cx, cz);
  // Spring basin.
  for (let i = 0; i < 14; i++) {
    const a = (i / 14) * Math.PI * 2;
    body.add(new THREE.DodecahedronGeometry(0.03, 0), i % 2 ? '#8f86a8' : '#a49cbc', {
      position: [cx + Math.cos(a) * 0.15, y + 0.012, cz + Math.sin(a) * 0.15],
      rotation: [rng(), rng(), rng()],
      scale: [1, 0.7, 1],
      flat: true,
    });
  }
  ctx.glow.add(new THREE.CylinderGeometry(0.14, 0.14, 0.01, 20), '#b48cff', {
    position: [cx, y + 0.012, cz],
    intensity: 1.7,
  });
  // Crystal crown around the spring.
  const violet = '#a98bff';
  const deep = '#7d5ce0';
  addCrystal(ctx, new THREE.Vector3(cx - 0.05, y, cz - 0.17), new THREE.Vector3(-0.1, 1, -0.15), 0.36, 0.045, violet, true, 2.4);
  addCrystal(ctx, new THREE.Vector3(cx + 0.08, y, cz - 0.16), new THREE.Vector3(0.25, 1, -0.2), 0.24, 0.035, deep, true, 2.0);
  addCrystal(ctx, new THREE.Vector3(cx - 0.17, y, cz - 0.04), new THREE.Vector3(-0.45, 1, 0.05), 0.2, 0.03, violet, true, 1.8);
  addCrystal(ctx, new THREE.Vector3(cx + 0.17, y, cz + 0.02), new THREE.Vector3(0.5, 1, 0.1), 0.17, 0.028, '#c7b2ff', true, 1.9);
  for (let i = 0; i < 9; i++) {
    const theta = rng() * Math.PI * 2;
    const [x, z] = polar(ctx, theta, rngRange(rng, 0.45, 0.85));
    addCrystal(
      ctx,
      new THREE.Vector3(x, ctx.top(x, z) - 0.01, z),
      new THREE.Vector3(x * 0.8 + rngRange(rng, -0.3, 0.3), 1, z * 0.8 + rngRange(rng, -0.3, 0.3)),
      rngRange(rng, 0.06, 0.13),
      rngRange(rng, 0.012, 0.022),
      i % 3 === 0 ? violet : '#8d78c8',
      i % 3 === 0,
      1.6,
    );
  }
  ctx.anchors.aetherPool = new THREE.Vector3(cx, y + 0.02, cz);
}

function buildMooring(ctx: Ctx) {
  const { body } = ctx;
  const theta = Math.PI * 0.5; // dock points along local +Z, towards the camera
  const out = new THREE.Vector3(Math.cos(theta), 0, Math.sin(theta));
  const side = new THREE.Vector3(-out.z, 0, out.x);
  const rim = ctx.radiusAt(theta);
  const deckY = 0.022;
  const start = out.clone().multiplyScalar(rim * 0.35);
  const length = rim * 0.65 + 0.4;
  // Planks across the dock.
  const planks = 16;
  for (let i = 0; i < planks; i++) {
    const t = (i + 0.5) / planks;
    const center = start.clone().addScaledVector(out, t * length);
    body.add(new THREE.BoxGeometry(0.15, 0.012, length / planks - 0.006), i % 2 ? '#b0814f' : '#a07345', {
      position: [center.x, deckY, center.z],
      rotation: [0, -theta + Math.PI / 2, 0],
      flat: true,
    });
  }
  for (const s of [-1, 1]) {
    // Rails.
    const a = start.clone().addScaledVector(side, s * 0.07).setY(deckY + 0.045);
    const b = a.clone().addScaledVector(out, length);
    body.add(unitRod(4), '#7a5532', { matrix: spanMatrix(a, b, 0.004) });
    for (let i = 0; i <= 4; i++) {
      const p = start.clone().addScaledVector(out, (i / 4) * length).addScaledVector(side, s * 0.07);
      body.add(unitRod(5), '#6b4a2f', {
        matrix: spanMatrix(p.clone().setY(i > 2 ? -0.16 : deckY - 0.01), p.clone().setY(deckY + 0.05), 0.0065),
      });
    }
  }
  // Mooring masts: one at the dock head, one inland.
  const masts = [
    start.clone().addScaledVector(out, length - 0.03).addScaledVector(side, 0.1),
    new THREE.Vector3(-0.28, 0, -0.18),
  ];
  masts.forEach((mast, index) => {
    const baseY = index === 0 ? deckY : ctx.top(mast.x, mast.z);
    const height = index === 0 ? 0.42 : 0.5;
    const top = mast.clone().setY(baseY + height);
    body.add(new THREE.CylinderGeometry(1, 1.3, 1, 6), '#7a5532', { matrix: spanMatrix(mast.clone().setY(baseY - 0.02), top, 0.012) });
    body.add(new THREE.TorusGeometry(0.035, 0.006, 5, 14), '#c8a24a', {
      position: [top.x, top.y - 0.03, top.z],
      rotation: [Math.PI / 2, 0, 0],
    });
    body.add(unitRod(4), '#7a5532', {
      matrix: spanMatrix(top.clone().addScaledVector(side, -0.06).setY(top.y - 0.08), top.clone().addScaledVector(side, 0.06).setY(top.y - 0.08), 0.005),
    });
    addLantern(ctx, [top.x, top.y + 0.022, top.z], '#ffe2a8');
    // Pale pennant (the mooring's accent).
    ctx.body.add(
      flatTriangleDouble(
        top.clone().setY(top.y - 0.005),
        top.clone().setY(top.y - 0.06),
        top.clone().addScaledVector(side, 0.1).setY(top.y - 0.035),
      ),
      '#eaf5ff',
    );
    // Guy ropes.
    for (const s of [-1, 1]) {
      body.add(unitRod(3), '#3d2d22', {
        matrix: spanMatrix(top.clone().setY(top.y - 0.04), mast.clone().addScaledVector(side, s * 0.09).setY(baseY), 0.0018),
      });
    }
  });
  // Harbour master's hut.
  const hx = 0.18;
  const hz = -0.2;
  const hy = ctx.top(hx, hz);
  body.add(new THREE.BoxGeometry(0.15, 0.1, 0.12), '#efe4cf', { position: [hx, hy + 0.05, hz], rotation: [0, 0.4, 0], flat: true });
  body.add(new THREE.ConeGeometry(0.125, 0.09, 4), '#4f78a8', {
    position: [hx, hy + 0.145, hz],
    rotation: [0, 0.4 + Math.PI / 4, 0],
    flat: true,
  });
  addLantern(ctx, [hx + 0.05, hy + 0.07, hz + 0.08]);
  // Barrels and rope coils.
  for (let i = 0; i < 4; i++) {
    const x = -0.05 + i * 0.05;
    const z = 0.12 + (i % 2) * 0.04;
    body.add(new THREE.CylinderGeometry(0.014, 0.014, 0.034, 8), '#7d5233', {
      position: placeOnTop(ctx, x, z, 0.017),
      flat: true,
    });
  }
  body.add(new THREE.TorusGeometry(0.022, 0.008, 5, 12), '#c9a978', {
    position: placeOnTop(ctx, -0.12, 0.2, 0.008),
    rotation: [Math.PI / 2, 0, 0],
  });
  addFlowers(ctx, 10, 0.12, -0.3, 0.12);
  addTree(ctx, -0.36, 0.2, 0.85);
}

function buildTurbulent(ctx: Ctx) {
  const { rng } = ctx;
  // Jagged shards thrust up through scorched turf.
  for (let i = 0; i < 9; i++) {
    const theta = rng() * Math.PI * 2;
    const [x, z] = polar(ctx, theta, rngRange(rng, 0.15, 0.8));
    const height = rngRange(rng, 0.1, 0.28);
    ctx.body.add(new THREE.ConeGeometry(rngRange(rng, 0.03, 0.055), height, 4), i % 2 ? '#3d3a45' : '#4b4652', {
      position: placeOnTop(ctx, x, z, height * 0.42),
      rotation: [rngRange(rng, -0.35, 0.35), rng() * 3, rngRange(rng, -0.35, 0.35)],
      flat: true,
      jitter: 0.12,
      seed: i,
    });
  }
  // Glowing fissures.
  for (let i = 0; i < 5; i++) {
    const theta = rng() * Math.PI * 2;
    const [x, z] = polar(ctx, theta, rngRange(rng, 0.1, 0.6));
    ctx.glow.add(new THREE.BoxGeometry(rngRange(rng, 0.12, 0.22), 0.006, 0.012), '#ff6a4d', {
      position: placeOnTop(ctx, x, z, 0.002),
      rotation: [0, rng() * 3, 0],
      intensity: 2.2,
    });
  }
  ctx.anchors.storm = true;
}

// ---------------------------------------------------------------------------

/** Build the island for a hub. `site === null` means unrevealed (generic). */
export function buildIsland(seed: number, site: SkySiteKind | null): IslandBuild {
  const rng = createVisualRng(seed);
  const palette = PALETTES[site ?? 'veiled'];
  const outline = ringNoise(seed ^ 0x51ed, 5);
  const radiusAt = (theta: number) => ISLAND_RADIUS * (1 + outline(theta) * 0.14);
  const depth = rngRange(rng, 0.85, 1.1) * (site === 'turbulent_zone' ? 0.9 : 1);
  const tipOffset = new THREE.Vector2(rngRange(rng, -0.12, 0.12), rngRange(rng, -0.12, 0.12));
  const lumpA = ringNoise(seed ^ 0x2b, 6);
  const lumpB = ringNoise(seed ^ 0x9d, 7);
  const body = new PartBuilder();
  const glow = new PartBuilder();
  const anchors: IslandAnchors = {};
  const top = (x: number, z: number) => {
    const theta = Math.atan2(z, x);
    const t = Math.min(1, Math.hypot(x, z) / radiusAt(theta));
    return DOME * (1 - t * t);
  };
  const ctx: Ctx = {
    body,
    glow,
    rng,
    radiusAt,
    top,
    accent: new THREE.Color(site ? SKY_SITE_COLORS[site] : '#c8d2e0'),
    anchors,
  };

  // --- Grassy cap (smooth) ---------------------------------------------------
  const capRings = [0, 0.3, 0.55, 0.78, 0.92, 1].map((t) => (theta: number) => {
    const r = radiusAt(theta) * t;
    return new THREE.Vector3(Math.cos(theta) * r, DOME * (1 - t * t), Math.sin(theta) * r);
  });
  body.add(loft(capRings), (p, out) => {
    const n = Math.sin(p.x * 13.1 + p.z * 4.7) * Math.sin(p.z * 11.3 - p.x * 3.1);
    const rimFade = Math.hypot(p.x, p.z) / ISLAND_RADIUS;
    lerpHex(palette.grassA, palette.grassB, 0.5 + n * 0.5, out);
    out.multiplyScalar(1 - Math.max(0, rimFade - 0.85) * 0.5);
  });

  // --- Turf lip: a slight overhang, then tucked under ------------------------
  const lipRings = [
    (theta: number) => {
      const r = radiusAt(theta);
      return new THREE.Vector3(Math.cos(theta) * r, 0, Math.sin(theta) * r);
    },
    (theta: number) => {
      const r = radiusAt(theta) * 1.018;
      return new THREE.Vector3(Math.cos(theta) * r, -0.03, Math.sin(theta) * r);
    },
    (theta: number) => {
      const r = radiusAt(theta) * 0.99;
      return new THREE.Vector3(Math.cos(theta) * r, -0.07 - Math.max(0, lumpA(theta)) * 0.02, Math.sin(theta) * r);
    },
  ];
  body.add(loft(lipRings), palette.turf, { flat: true, jitter: 0.1, seed: seed ^ 3 });

  // --- Rock mass (faceted), tapering to an off-centre tip --------------------
  const layers = 8;
  const rockRings: Array<(theta: number) => THREE.Vector3> = [];
  for (let k = 0; k <= layers; k++) {
    const u = k / layers;
    rockRings.push((theta: number) => {
      const base = k === layers ? 0.04 : Math.pow(1 - u, 0.72) * (k === 0 ? 0.99 : 1.02);
      const wobble = 1 + (k === 0 ? 0 : lumpA(theta * 1.7 + k * 1.3) * 0.16 + lumpB(theta + k) * 0.07);
      const r = radiusAt(theta) * base * wobble;
      const yNoise = k === 0 ? 0 : lumpB(theta * 2 + k * 0.7) * 0.035;
      const y = -0.07 - Math.pow(u, 1.12) * depth + yNoise;
      const shift = u * u;
      return new THREE.Vector3(
        Math.cos(theta) * r + tipOffset.x * shift,
        y,
        Math.sin(theta) * r + tipOffset.y * shift,
      );
    });
  }
  const [earth, sand, mauve, slate] = palette.rock;
  body.add(
    loft(rockRings),
    (p, out) => {
      const t = THREE.MathUtils.clamp(-p.y / depth, 0, 1) + Math.sin(p.y * 46 + p.x * 5) * 0.035;
      if (t < 0.12) lerpHex(earth, sand, t / 0.12, out);
      else if (t < 0.45) lerpHex(sand, mauve, (t - 0.12) / 0.33, out);
      else lerpHex(mauve, slate, (t - 0.45) / 0.55, out);
    },
    { flat: true, jitter: 0.09, seed: seed ^ 5, perFace: true },
  );

  // --- Hanging stalactites, roots and accent crystals underneath -------------
  const tip = new THREE.Vector3(tipOffset.x, -0.07 - depth, tipOffset.y);
  const stalactites = 4 + Math.floor(rng() * 3);
  for (let i = 0; i < stalactites; i++) {
    const theta = rng() * Math.PI * 2;
    const u = rngRange(rng, 0.3, 0.7);
    const r = radiusAt(theta) * Math.pow(1 - u, 0.72) * 0.8;
    const y = -0.07 - Math.pow(u, 1.12) * depth;
    const length = rngRange(rng, 0.14, 0.32);
    const width = rngRange(rng, 0.04, 0.08);
    body.add(new THREE.ConeGeometry(width, length, 5), slate, {
      position: [Math.cos(theta) * r + tipOffset.x * u * u, y - length / 2 + 0.03, Math.sin(theta) * r + tipOffset.y * u * u],
      rotation: [Math.PI + rngRange(rng, -0.2, 0.2), rng() * 3, rngRange(rng, -0.2, 0.2)],
      flat: true,
      jitter: 0.1,
      seed: i + 101,
    });
  }
  const roots = 4 + Math.floor(rng() * 3);
  for (let i = 0; i < roots; i++) {
    const theta = rng() * Math.PI * 2;
    const r = radiusAt(theta) * 0.97;
    const start = new THREE.Vector3(Math.cos(theta) * r, -0.04, Math.sin(theta) * r);
    const drop = rngRange(rng, 0.1, 0.3);
    const sway = rngRange(rng, -0.05, 0.05);
    const curve = new THREE.CatmullRomCurve3([
      start,
      start.clone().add(new THREE.Vector3(Math.cos(theta) * 0.03, -drop * 0.4, Math.sin(theta) * 0.03)),
      start.clone().add(new THREE.Vector3(Math.cos(theta) * 0.02 + sway, -drop, Math.sin(theta) * 0.02 - sway)),
    ]);
    body.add(new THREE.TubeGeometry(curve, 6, rngRange(rng, 0.003, 0.0055), 3, false), i % 2 ? '#6a5238' : '#557a38', {
      flat: true,
    });
  }
  if (site) {
    const crystals = 3 + Math.floor(rng() * 3);
    for (let i = 0; i < crystals; i++) {
      const theta = rng() * Math.PI * 2;
      const u = rngRange(rng, 0.25, 0.75);
      const r = radiusAt(theta) * Math.pow(1 - u, 0.72) * 0.92;
      const y = -0.07 - Math.pow(u, 1.12) * depth;
      const base = new THREE.Vector3(Math.cos(theta) * r + tipOffset.x * u * u, y, Math.sin(theta) * r + tipOffset.y * u * u);
      const direction = new THREE.Vector3(Math.cos(theta), rngRange(rng, -0.9, -0.2), Math.sin(theta));
      addCrystal(ctx, base, direction, rngRange(rng, 0.1, 0.2), rngRange(rng, 0.02, 0.034), ctx.accent, true, 1.9);
    }
  }

  // --- Edge dressing -------------------------------------------------------
  addRimTufts(ctx, palette, site === 'turbulent_zone' ? 10 : 22);
  addBoulders(ctx, 3, site === 'turbulent_zone' ? '#45404a' : '#a39a92');

  // --- Landmark ------------------------------------------------------------
  switch (site) {
    case 'floating_garden':
      buildGarden(ctx);
      break;
    case 'wind_bazaar':
      buildBazaar(ctx);
      break;
    case 'hanging_ruins':
      buildRuins(ctx);
      break;
    case 'observatory':
      buildObservatory(ctx);
      break;
    case 'aether_source':
      buildAether(ctx);
      break;
    case 'calm_mooring':
      buildMooring(ctx);
      break;
    case 'turbulent_zone':
      buildTurbulent(ctx);
      break;
    default:
      // Veiled: a few anonymous shapes so the silhouette is not a bare disc.
      addTree(ctx, -0.2, -0.15, 1.1);
      addTree(ctx, 0.15, -0.25, 0.9);
      addBoulders(ctx, 3, '#8f8a86');
      break;
  }
  return { body: body.build(), glow: glow.build(), anchors, depth, tip };
}

import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/** Stable IDs for premium low-poly props (GLB siblings in public/assets/models). */
export const PREMIUM_MODEL_IDS = [
  'tree',
  'scrub',
  'rock',
  'peak',
  'dune',
  'settlement',
  'city',
  'robber',
] as const;

export type PremiumModelId = (typeof PREMIUM_MODEL_IDS)[number];

export const PREMIUM_MODEL_URL: Record<PremiumModelId, string> = {
  tree: '/assets/models/tree.glb',
  scrub: '/assets/models/scrub.glb',
  rock: '/assets/models/rock.glb',
  peak: '/assets/models/peak.glb',
  dune: '/assets/models/dune.glb',
  settlement: '/assets/models/settlement.glb',
  city: '/assets/models/city.glb',
  robber: '/assets/models/robber.glb',
};

function tintGeometry(geo: THREE.BufferGeometry, hex: string): THREE.BufferGeometry {
  // Keep the source index so shared vertices retain their averaged normals.
  // Converting every authored mesh to non-indexed geometry was the main reason
  // otherwise smooth mountains, dunes and vegetation still looked faceted.
  const g = geo.clone();
  if (!g.index) {
    const count = g.getAttribute('position').count;
    g.setIndex(Array.from({ length: count }, (_, index) => index));
  }
  const pos = g.getAttribute('position');
  const colors = new Float32Array(pos.count * 3);
  const c = new THREE.Color(hex);
  for (let i = 0; i < pos.count; i++) {
    colors[i * 3] = c.r;
    colors[i * 3 + 1] = c.g;
    colors[i * 3 + 2] = c.b;
  }
  g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  return g;
}

function place(
  geo: THREE.BufferGeometry,
  hex: string,
  x: number,
  y: number,
  z: number,
  sx = 1,
  sy = 1,
  sz = 1,
  ry = 0,
): THREE.BufferGeometry {
  const g = tintGeometry(geo, hex);
  g.scale(sx, sy, sz);
  g.rotateY(ry);
  g.translate(x, y, z);
  return g;
}

/** Like `place`, but tips the mesh with a lean (radians) on X/Z for natural peaks. */
function placeLean(
  geo: THREE.BufferGeometry,
  hex: string,
  x: number,
  y: number,
  z: number,
  leanZ = 0,
  leanX = 0,
  sx = 1,
  sy = 1,
  sz = 1,
): THREE.BufferGeometry {
  const g = tintGeometry(geo, hex);
  g.scale(sx, sy, sz);
  g.rotateZ(leanZ);
  g.rotateX(leanX);
  g.translate(x, y, z);
  return g;
}

function mergeParts(parts: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const merged = mergeGeometries(parts, false);
  for (const p of parts) p.dispose();
  if (!merged) throw new Error('mergeGeometries failed');
  merged.computeVertexNormals();
  merged.computeBoundingBox();
  merged.computeBoundingSphere();
  return merged;
}

/** Faceted evergreen: trunk + two foliage tiers (1 draw when instanced). */
export function createTreeGeometry(): THREE.BufferGeometry {
  return mergeParts([
    place(new THREE.CylinderGeometry(0.035, 0.05, 0.2, 10), '#5a4030', 0, 0.1, 0),
    place(new THREE.ConeGeometry(0.18, 0.26, 12), '#294c36', 0, 0.27, 0),
    place(new THREE.ConeGeometry(0.145, 0.23, 12), '#315a3d', 0.008, 0.39, -0.004),
    place(new THREE.ConeGeometry(0.095, 0.18, 12), '#3d6846', -0.006, 0.51, 0.006),
  ]);
}

export function createScrubGeometry(): THREE.BufferGeometry {
  return mergeParts([
    place(new THREE.SphereGeometry(0.1, 5, 4), '#7a9458', -0.04, 0.08, 0.02, 1, 0.85, 1),
    place(new THREE.SphereGeometry(0.08, 5, 4), '#6a8450', 0.05, 0.07, -0.02, 1.1, 0.8, 0.9),
  ]);
}

export function createRockGeometry(): THREE.BufferGeometry {
  return mergeParts([
    place(new THREE.IcosahedronGeometry(0.11, 0), '#8a8580', 0, 0.07, 0, 1.1, 0.75, 0.95),
    place(new THREE.TetrahedronGeometry(0.06, 0), '#7a7570', 0.06, 0.1, 0.03, 1, 0.9, 1),
  ]);
}

export function createPeakGeometry(): THREE.BufferGeometry {
  return createPeakSpireGeometry();
}

/** Shared granite family — scree and summit stay the same rock. */
const MTN_DARK = '#6e6c66';
const MTN_ROCK = '#7a7872';
const MTN_BODY = '#82807a';
const MTN_HIGH = '#908e88';
const MTN_SNOW = '#c4c0ba';

interface MountainPeak {
  x: number;
  z: number;
  height: number;
  width: number;
}

/** Continuous indexed massif with a buried skirt and deterministic strata. */
function createMountainSurfaceGeometry(
  peaks: readonly MountainPeak[],
  phase: number,
  stretchX = 1,
  stretchZ = 1,
): THREE.BufferGeometry {
  // A polar surface has no hidden square corners and cannot expose the large
  // vertical faces produced by the former clipped Cartesian grid.
  const radialSegments = 34;
  const angularSegments = 96;
  const spanX = 1.42 * stretchX;
  const spanZ = 1.26 * stretchZ;
  const positions: number[] = [];
  const colors: number[] = [];
  const indices: number[] = [];
  const low = new THREE.Color(MTN_DARK);
  const body = new THREE.Color(MTN_BODY);
  const high = new THREE.Color(MTN_HIGH);
  const snow = new THREE.Color(MTN_SNOW);
  const shade = new THREE.Color();

  const pushSurfaceVertex = (x: number, z: number, radius: number, sampleIndex: number) => {
    // The smoothstep reaches exactly zero on the outer ring. The massif meets
    // the terrain as a broad foothill instead of a vertical skirt.
    const envelope = THREE.MathUtils.smoothstep(1 - radius, 0, 0.62);
    let y = -0.012 + 0.085 * envelope;
    let blendedPeakPower = 0;
    for (const peak of peaks) {
      const dx = x - peak.x;
      const dz = z - peak.z;
      const distance = Math.sqrt(dx * dx + dz * dz);
      const angle = Math.atan2(dz, dx);
      const distanceSq = dx * dx + dz * dz;
      const core = Math.exp(-distanceSq / (peak.width * 1.34));
      const shoulder = Math.exp(-distanceSq / (peak.width * 4.8));
      const localCrag = 1 + Math.sin(angle * 7 + phase * 5 + distance * 21) * 0.065 * core;
      const contribution = peak.height * (core * 0.86 + shoulder * 0.1) * localCrag;
      // Smooth maximum: overlapping peaks form a continuous saddle without
      // adding into a plateau or introducing a hard max() crease.
      blendedPeakPower += Math.pow(Math.max(0, contribution), 4);
    }
    y += Math.pow(blendedPeakPower, 0.25) * envelope;
    y += (
      Math.sin(x * 19 + phase * 3.1) * Math.cos(z * 17 - phase) * 0.024 +
      Math.sin((x + z) * 39 + phase * 7) * 0.01
    ) * envelope;

    positions.push(x, y, z);
    const normalizedHeight = THREE.MathUtils.clamp(y / 1.04, 0, 1);
    if (normalizedHeight > 0.9) {
      shade.copy(high).lerp(snow, (normalizedHeight - 0.9) / 0.1);
    } else if (normalizedHeight > 0.32) {
      shade.copy(body).lerp(high, (normalizedHeight - 0.32) / 0.58);
    } else {
      shade.copy(low).lerp(body, normalizedHeight / 0.32);
    }
    const mineralVariation = 0.91 + 0.065 * Math.sin(sampleIndex * 1.73 + phase * 5.1);
    colors.push(
      Math.min(1, shade.r * mineralVariation),
      Math.min(1, shade.g * mineralVariation),
      Math.min(1, shade.b * mineralVariation),
    );
  };

  pushSurfaceVertex(0, 0, 0, 0);
  for (let ring = 1; ring <= radialSegments; ring++) {
    const radius = ring / radialSegments;
    for (let sector = 0; sector < angularSegments; sector++) {
      const angle = sector / angularSegments * Math.PI * 2;
      const x = Math.cos(angle) * radius * spanX * 0.5;
      const z = Math.sin(angle) * radius * spanZ * 0.5;
      pushSurfaceVertex(x, z, radius, ring * angularSegments + sector);
    }
  }

  const ringVertex = (ring: number, sector: number) =>
    1 + (ring - 1) * angularSegments + (sector + angularSegments) % angularSegments;
  for (let sector = 0; sector < angularSegments; sector++) {
    indices.push(0, ringVertex(1, sector), ringVertex(1, sector + 1));
  }
  for (let ring = 1; ring < radialSegments; ring++) {
    for (let sector = 0; sector < angularSegments; sector++) {
      const a = ringVertex(ring, sector);
      const b = ringVertex(ring, sector + 1);
      const c = ringVertex(ring + 1, sector);
      const d = ringVertex(ring + 1, sector + 1);
      indices.push(a, c, b, b, c, d);
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}

/**
 * Dense scree / boulder field baked into the peak mesh (same granite hue).
 * Kept inside ~0.70 so rotation never pushes past the tile flats (~0.866).
 */
function peakScreeField(phase = 0): THREE.BufferGeometry[] {
  const parts: THREE.BufferGeometry[] = [];
  const colors = [MTN_DARK, MTN_ROCK, MTN_BODY, MTN_DARK, MTN_ROCK];
  // Rim rubble — densifies the floor near the hex edge
  for (let i = 0; i < 14; i++) {
    const a = (i / 14) * Math.PI * 2 + phase * 0.5;
    const r = 0.62 + (i % 3) * 0.04;
    const s = 0.7 + (i % 4) * 0.1;
    parts.push(
      place(
        new THREE.IcosahedronGeometry(0.08, 0),
        colors[i % colors.length]!,
        Math.cos(a) * r,
        0.06,
        Math.sin(a) * r,
        s * 1.15,
        s * 0.5,
        s * 1.0,
        a * 0.3,
      ),
    );
  }
  // Outer ring
  for (let i = 0; i < 14; i++) {
    const a = (i / 14) * Math.PI * 2 + phase;
    const r = 0.48 + (i % 3) * 0.045;
    const s = 0.9 + (i % 4) * 0.12;
    parts.push(
      place(
        new THREE.IcosahedronGeometry(0.1, 0),
        colors[i % colors.length]!,
        Math.cos(a) * r,
        0.07,
        Math.sin(a) * r,
        s * 1.25,
        s * 0.55,
        s * 1.05,
        a * 0.4,
      ),
    );
  }
  // Mid scree
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2 + phase * 1.3 + 0.2;
    const r = 0.3 + (i % 4) * 0.04;
    const s = 0.8 + (i % 3) * 0.15;
    parts.push(
      place(
        new THREE.TetrahedronGeometry(0.09, 0),
        colors[(i + 1) % colors.length]!,
        Math.cos(a) * r,
        0.09,
        Math.sin(a) * r,
        s * 1.3,
        s * 0.7,
        s * 1.1,
        a,
      ),
    );
  }
  // Inner rubble near the peak foot
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2 + phase * 0.7;
    const r = 0.14 + (i % 3) * 0.03;
    parts.push(
      place(
        new THREE.IcosahedronGeometry(0.08, 0),
        colors[(i + 2) % colors.length]!,
        Math.cos(a) * r,
        0.1,
        Math.sin(a) * r,
        1.15,
        0.7,
        1.05,
        a * 0.5,
      ),
    );
  }
  return parts;
}

/**
 * Rocky massif with a true summit spike — stepped transition mid → tip.
 * Tips lean slightly so peaks aren't stiff vertical cones.
 */
function createLegacyPeakSpireGeometry(): THREE.BufferGeometry {
  return mergeParts([
    ...peakScreeField(0.05),
    // Broad irregular base
    place(new THREE.IcosahedronGeometry(0.42, 2), MTN_ROCK, 0, 0.18, 0, 1.55, 0.55, 1.45),
    place(new THREE.IcosahedronGeometry(0.28, 2), MTN_DARK, 0.28, 0.2, 0.14, 1.35, 0.7, 1.2),
    place(new THREE.IcosahedronGeometry(0.26, 2), MTN_BODY, -0.26, 0.18, -0.16, 1.3, 0.65, 1.15),
    place(new THREE.IcosahedronGeometry(0.24, 2), MTN_DARK, 0.08, 0.2, -0.3, 1.25, 0.6, 1.2),
    // Mid body — slightly off-center mass
    place(new THREE.IcosahedronGeometry(0.36, 2), MTN_BODY, 0.04, 0.42, -0.03, 1.25, 0.95, 1.2),
    place(new THREE.IcosahedronGeometry(0.22, 2), MTN_DARK, 0.18, 0.48, -0.1, 1.15, 1.1, 1.0),
    place(new THREE.IcosahedronGeometry(0.2, 2), MTN_ROCK, -0.12, 0.46, 0.14, 1.1, 1.05, 0.95),
    // Transition neck — leans toward +X
    place(new THREE.IcosahedronGeometry(0.24, 2), MTN_BODY, 0.06, 0.68, -0.02, 1.0, 1.05, 0.95),
    place(new THREE.IcosahedronGeometry(0.18, 2), MTN_HIGH, 0.1, 0.84, 0.02, 0.9, 1.1, 0.85),
    // Leaning summit spike
    placeLean(new THREE.ConeGeometry(0.14, 0.36, 18), MTN_HIGH, 0.14, 1.06, 0.02, 0.18, 0.08),
    placeLean(new THREE.ConeGeometry(0.055, 0.16, 8), MTN_SNOW, 0.2, 1.26, 0.04, 0.22, 0.1),
  ]);
}

/** Twin-summit massif — tips lean apart. */
function createLegacyPeakMassifGeometry(): THREE.BufferGeometry {
  return mergeParts([
    ...peakScreeField(0.4),
    place(new THREE.IcosahedronGeometry(0.4, 2), MTN_ROCK, 0, 0.16, 0, 1.5, 0.5, 1.4),
    place(new THREE.IcosahedronGeometry(0.24, 0), MTN_DARK, 0.3, 0.18, 0.06, 1.25, 0.65, 1.1),
    place(new THREE.IcosahedronGeometry(0.22, 0), MTN_BODY, -0.28, 0.16, -0.08, 1.2, 0.6, 1.05),
    // Left mass → neck → leaning tip
    place(new THREE.IcosahedronGeometry(0.28, 2), MTN_BODY, -0.2, 0.4, 0.06, 1.15, 1.1, 1.1),
    place(new THREE.IcosahedronGeometry(0.16, 2), MTN_HIGH, -0.24, 0.62, 0.08, 0.95, 1.05, 0.9),
    placeLean(new THREE.ConeGeometry(0.1, 0.28, 18), MTN_HIGH, -0.28, 0.8, 0.1, -0.22, 0.12),
    placeLean(new THREE.ConeGeometry(0.04, 0.1, 8), MTN_SNOW, -0.32, 0.96, 0.12, -0.26, 0.14),
    // Right mass → neck → leaning tip
    place(new THREE.IcosahedronGeometry(0.26, 2), MTN_BODY, 0.22, 0.38, -0.05, 1.1, 1.05, 1.05),
    place(new THREE.IcosahedronGeometry(0.14, 2), MTN_HIGH, 0.26, 0.58, -0.06, 0.9, 1.0, 0.85),
    placeLean(new THREE.ConeGeometry(0.09, 0.24, 18), MTN_HIGH, 0.3, 0.74, -0.08, 0.24, -0.1),
    placeLean(new THREE.ConeGeometry(0.035, 0.09, 8), MTN_SNOW, 0.34, 0.88, -0.1, 0.28, -0.12),
  ]);
}

/** Elongated ridge with a rising, tilted crest tip. */
function createLegacyPeakRidgeGeometry(): THREE.BufferGeometry {
  return mergeParts([
    ...peakScreeField(0.85),
    place(new THREE.IcosahedronGeometry(0.36, 2), MTN_ROCK, 0, 0.15, 0, 1.7, 0.48, 1.15),
    place(new THREE.IcosahedronGeometry(0.22, 0), MTN_DARK, 0.32, 0.16, 0.02, 1.35, 0.6, 1.0),
    place(new THREE.IcosahedronGeometry(0.2, 0), MTN_BODY, -0.32, 0.14, -0.02, 1.3, 0.55, 0.95),
    // Ridge spine drifts along +X
    place(new THREE.IcosahedronGeometry(0.28, 2), MTN_BODY, 0.04, 0.36, 0, 1.75, 0.9, 0.95),
    place(new THREE.IcosahedronGeometry(0.2, 2), MTN_DARK, 0.14, 0.52, 0.03, 1.35, 1.0, 0.85),
    place(new THREE.IcosahedronGeometry(0.16, 2), MTN_HIGH, 0.1, 0.7, 0.02, 1.1, 1.05, 0.8),
    placeLean(new THREE.ConeGeometry(0.1, 0.3, 18), MTN_HIGH, 0.16, 0.9, 0.04, 0.2, 0.06, 1.15, 1, 0.75),
    placeLean(new THREE.ConeGeometry(0.04, 0.12, 8), MTN_SNOW, 0.22, 1.08, 0.05, 0.24, 0.08, 1.05, 1, 0.7),
  ]);
}

export function createPeakSpireGeometry(): THREE.BufferGeometry {
  return createMountainSurfaceGeometry([
    { x: -0.1, z: 0.02, height: 1.08, width: 0.105 },
    { x: 0.24, z: -0.12, height: 0.56, width: 0.12 },
    { x: -0.25, z: 0.2, height: 0.42, width: 0.13 },
  ], 0.17, 0.96, 1.03);
}

export function createPeakMassifGeometry(): THREE.BufferGeometry {
  return createMountainSurfaceGeometry([
    { x: -0.2, z: 0.02, height: 0.9, width: 0.13 },
    { x: 0.19, z: -0.04, height: 0.84, width: 0.14 },
    { x: 0.02, z: 0.22, height: 0.48, width: 0.15 },
  ], 0.53, 1.04, 0.98);
}

export function createPeakRidgeGeometry(): THREE.BufferGeometry {
  return createMountainSurfaceGeometry([
    { x: -0.28, z: 0.02, height: 0.66, width: 0.13 },
    { x: 0.02, z: -0.02, height: 0.88, width: 0.12 },
    { x: 0.3, z: 0.04, height: 0.62, width: 0.13 },
  ], 0.81, 1.12, 0.9);
}

export function createDuneGeometry(): THREE.BufferGeometry {
  return createDuneMoundGeometry();
}

/** Warm sand family — related to desert floor (#dbc492), with crest / lee contrast. */
const SAND_LEE = '#c4a878';
const SAND_BODY = '#d6bc8c';
const SAND_MID = '#e0c898';
const SAND_CREST = '#ebd8ac';

/**
 * Soft sand mound with layered body + bright windward crest.
 * Reads as a real dune, not a pebble.
 */
export function createDuneMoundGeometry(): THREE.BufferGeometry {
  return mergeParts([
    place(new THREE.SphereGeometry(0.22, 7, 5), SAND_BODY, 0, 0.08, 0, 1.7, 0.55, 1.35),
    place(new THREE.SphereGeometry(0.16, 6, 4), SAND_LEE, -0.1, 0.06, 0.04, 1.4, 0.45, 1.15),
    place(new THREE.SphereGeometry(0.14, 6, 4), SAND_MID, 0.12, 0.1, -0.02, 1.25, 0.5, 1.05),
    place(new THREE.SphereGeometry(0.1, 5, 4), SAND_CREST, 0.06, 0.16, -0.04, 1.15, 0.45, 0.9),
    place(new THREE.SphereGeometry(0.07, 5, 3), SAND_CREST, 0.02, 0.2, 0, 1.0, 0.4, 0.8),
  ]);
}

/**
 * Classic barchan crescent — horns + slip face.
 */
export function createDuneCrescentGeometry(): THREE.BufferGeometry {
  return mergeParts([
    // Main body
    place(new THREE.SphereGeometry(0.18, 7, 5), SAND_BODY, 0, 0.07, 0, 1.9, 0.48, 1.05),
    place(new THREE.SphereGeometry(0.12, 6, 4), SAND_LEE, -0.02, 0.05, 0.06, 1.6, 0.4, 0.9),
    // Horns
    place(new THREE.SphereGeometry(0.1, 6, 4), SAND_MID, 0.22, 0.06, 0.08, 1.3, 0.4, 0.75),
    place(new THREE.SphereGeometry(0.1, 6, 4), SAND_MID, 0.22, 0.06, -0.08, 1.3, 0.4, 0.75),
    place(new THREE.SphereGeometry(0.07, 5, 3), SAND_BODY, 0.32, 0.045, 0.1, 1.1, 0.35, 0.65),
    place(new THREE.SphereGeometry(0.07, 5, 3), SAND_BODY, 0.32, 0.045, -0.1, 1.1, 0.35, 0.65),
    // Crest highlight
    place(new THREE.SphereGeometry(0.08, 5, 3), SAND_CREST, 0.08, 0.14, 0, 1.4, 0.35, 0.7),
  ]);
}

/**
 * Wind ripple field — several parallel low ridges.
 */
export function createDuneRippleGeometry(): THREE.BufferGeometry {
  return mergeParts([
    place(new THREE.SphereGeometry(0.1, 6, 4), SAND_BODY, 0, 0.04, 0, 2.4, 0.35, 0.7),
    place(new THREE.SphereGeometry(0.08, 5, 3), SAND_MID, 0.02, 0.055, -0.12, 2.1, 0.3, 0.6),
    place(new THREE.SphereGeometry(0.08, 5, 3), SAND_LEE, -0.02, 0.045, 0.12, 2.0, 0.28, 0.58),
    place(new THREE.SphereGeometry(0.06, 5, 3), SAND_CREST, 0.04, 0.07, -0.02, 1.8, 0.28, 0.5),
    place(new THREE.SphereGeometry(0.055, 5, 3), SAND_BODY, -0.05, 0.04, 0.2, 1.6, 0.26, 0.5),
    place(new THREE.SphereGeometry(0.055, 5, 3), SAND_MID, 0.06, 0.04, -0.22, 1.5, 0.25, 0.48),
  ]);
}

/** Golden wheat palette — ripe harvest gold (ref diorama). */
const WHEAT_SOIL = '#7a5a32';
const WHEAT_STALK = '#c4a048';
const WHEAT_HEAD = '#e8c858';
const WHEAT_RIPE = '#f2d86a';

function wheatStalk(x: number, z: number, h: number, lean = 0): THREE.BufferGeometry[] {
  return [
    place(new THREE.CylinderGeometry(0.008, 0.012, h, 4), WHEAT_STALK, x, h * 0.5, z, 1, 1, 1, lean),
    place(new THREE.ConeGeometry(0.022, 0.055, 4), WHEAT_HEAD, x + lean * 0.02, h + 0.02, z, 1, 1, 1, lean),
    place(new THREE.SphereGeometry(0.016, 4, 3), WHEAT_RIPE, x + lean * 0.025, h + 0.045, z),
  ];
}

/** Classic plow row — soil bed + dense wheat stalks along X. */
export function createFieldRowGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [
    place(new THREE.BoxGeometry(0.42, 0.03, 0.1), WHEAT_SOIL, 0, 0.015, 0),
    place(new THREE.BoxGeometry(0.4, 0.02, 0.04), '#9d824d', 0, 0.012, 0.035),
  ];
  const xs = [-0.18, -0.14, -0.1, -0.06, -0.02, 0.02, 0.06, 0.1, 0.14, 0.18];
  for (let i = 0; i < xs.length; i++) {
    const h = 0.12 + (i % 3) * 0.015;
    const z = ((i % 2) * 2 - 1) * 0.018;
    parts.push(...wheatStalk(xs[i]!, z, h, (i % 5) * 0.05));
  }
  return mergeParts(parts);
}

/** Wider ripe patch — fuller wheat cluster. */
export function createFieldPatchGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [
    place(new THREE.BoxGeometry(0.38, 0.028, 0.16), WHEAT_SOIL, 0, 0.014, 0),
  ];
  for (let row = 0; row < 3; row++) {
    for (let col = 0; col < 8; col++) {
      const x = -0.16 + col * 0.045;
      const z = -0.05 + row * 0.05;
      const h = 0.11 + ((col + row) % 4) * 0.012;
      parts.push(...wheatStalk(x, z, h, ((col + row) % 3) * 0.04));
    }
  }
  return mergeParts(parts);
}

/** Short edge furrow for filling hex rims. */
export function createFieldSheafGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [
    place(new THREE.BoxGeometry(0.28, 0.025, 0.08), WHEAT_SOIL, 0, 0.012, 0),
  ];
  for (let i = 0; i < 7; i++) {
    const x = -0.12 + i * 0.04;
    parts.push(...wheatStalk(x, ((i % 2) * 2 - 1) * 0.012, 0.1 + (i % 3) * 0.012, i * 0.03));
  }
  return mergeParts(parts);
}

/** Neutral settlement shell — white verts so player `material.color` stays vivid. */
export function createSettlementGeometry(): THREE.BufferGeometry {
  return mergeParts([
    place(new THREE.CylinderGeometry(0.12, 0.12, 0.03, 8), '#ffffff', 0, 0.015, 0),
    place(new THREE.BoxGeometry(0.18, 0.12, 0.16), '#f2f0ea', 0, 0.09, 0),
    place(new THREE.ConeGeometry(0.14, 0.12, 4), '#ffffff', 0, 0.18, 0, 1, 1, 1, Math.PI / 4),
  ]);
}

export function createCityGeometry(): THREE.BufferGeometry {
  return mergeParts([
    place(new THREE.CylinderGeometry(0.16, 0.16, 0.03, 8), '#ffffff', 0, 0.015, 0),
    place(new THREE.BoxGeometry(0.16, 0.16, 0.14), '#f2f0ea', -0.06, 0.1, 0),
    place(new THREE.BoxGeometry(0.14, 0.2, 0.14), '#ebe6dc', 0.08, 0.12, 0.02),
    place(new THREE.ConeGeometry(0.12, 0.1, 4), '#ffffff', -0.06, 0.22, 0, 1, 1, 1, Math.PI / 4),
    place(new THREE.ConeGeometry(0.11, 0.12, 4), '#ffffff', 0.08, 0.26, 0.02, 1, 1, 1, Math.PI / 5),
  ]);
}

export function createRobberGeometry(): THREE.BufferGeometry {
  return mergeParts([
    place(new THREE.CylinderGeometry(0.16, 0.16, 0.025, 10), '#0e0c12', 0, 0.012, 0),
    place(new THREE.CylinderGeometry(0.1, 0.14, 0.16, 6), '#2a2430', 0, 0.1, 0),
    place(new THREE.SphereGeometry(0.09, 8, 6), '#1a1520', 0, 0.22, 0),
    place(new THREE.ConeGeometry(0.08, 0.12, 5), '#3a3040', 0, 0.32, 0),
  ]);
}

/** Low-poly sheep — wool clumps, dark face, stub legs (ambient life). */
export function createSheepGeometry(): THREE.BufferGeometry {
  const wool = '#f4f0e8';
  const woolShade = '#e4ddd2';
  const woolDark = '#d5cec3';
  const face = '#3a342e';
  const snout = '#2a2622';
  const leg = '#2c2824';
  return mergeParts([
    place(new THREE.SphereGeometry(0.058, 8, 6), wool, 0, 0.078, 0, 1.45, 1.12, 1.22),
    place(new THREE.SphereGeometry(0.03, 5, 4), woolShade, -0.045, 0.1, 0.032, 1.25, 1.05, 1.15),
    place(new THREE.SphereGeometry(0.028, 5, 4), woolDark, 0.025, 0.108, -0.038, 1.15, 1, 1.05),
    place(new THREE.SphereGeometry(0.026, 5, 4), woolShade, -0.015, 0.112, -0.02, 1.05, 1, 1),
    place(new THREE.SphereGeometry(0.024, 5, 4), wool, 0.04, 0.098, 0.042, 1.15, 0.95, 1.05),
    place(new THREE.SphereGeometry(0.02, 4, 3), woolShade, -0.06, 0.085, -0.01, 1, 0.95, 1),
    place(new THREE.SphereGeometry(0.036, 6, 5), face, 0.068, 0.082, 0, 1.08, 0.95, 0.9),
    place(new THREE.SphereGeometry(0.018, 5, 4), snout, 0.095, 0.072, 0, 1.25, 0.85, 0.95),
    place(new THREE.SphereGeometry(0.014, 4, 3), face, 0.058, 0.102, 0.03, 0.7, 1.35, 0.5),
    place(new THREE.SphereGeometry(0.014, 4, 3), face, 0.058, 0.102, -0.03, 0.7, 1.35, 0.5),
    place(new THREE.CylinderGeometry(0.011, 0.013, 0.042, 4), leg, 0.032, 0.021, 0.03),
    place(new THREE.CylinderGeometry(0.011, 0.013, 0.042, 4), leg, 0.032, 0.021, -0.03),
    place(new THREE.CylinderGeometry(0.011, 0.013, 0.042, 4), leg, -0.038, 0.021, 0.03),
    place(new THREE.CylinderGeometry(0.011, 0.013, 0.042, 4), leg, -0.038, 0.021, -0.03),
    place(new THREE.SphereGeometry(0.016, 4, 3), woolShade, -0.075, 0.082, 0, 0.95, 0.9, 0.95),
  ]);
}

/** Windmill tower + conical roof (blades are separate so they can spin). */
export function createWindmillTowerGeometry(): THREE.BufferGeometry {
  // Keep the mill grounded under hard cinematic light.  The previous pale
  // limestone pedestal clipped to a white disc in the strategic camera and
  // looked like an editor gizmo whenever foliage crossed the tower.
  const stone = '#5f584e';
  const stoneMid = '#4d4740';
  const stoneDark = '#38342f';
  const roof = '#382920';
  const roofDark = '#211815';
  const door = '#493429';
  const wood = '#6f513b';
  return mergeParts([
    place(new THREE.CylinderGeometry(0.09, 0.1, 0.035, 8), stoneDark, 0, 0.016, 0),
    place(new THREE.CylinderGeometry(0.058, 0.078, 0.2, 8), stone, 0, 0.12, 0),
    place(new THREE.CylinderGeometry(0.052, 0.058, 0.1, 7), stoneMid, 0, 0.26, 0),
    place(new THREE.CylinderGeometry(0.048, 0.05, 0.05, 6), stoneDark, 0, 0.335, 0),
    place(new THREE.ConeGeometry(0.1, 0.13, 8), roof, 0, 0.43, 0),
    place(new THREE.ConeGeometry(0.035, 0.05, 5), roofDark, 0, 0.51, 0),
    place(new THREE.BoxGeometry(0.038, 0.07, 0.022), door, 0, 0.09, 0.075),
    place(new THREE.BoxGeometry(0.022, 0.028, 0.016), '#b59b70', 0.028, 0.22, 0.068),
    place(new THREE.BoxGeometry(0.022, 0.028, 0.016), '#b59b70', -0.028, 0.22, 0.068),
    place(new THREE.BoxGeometry(0.06, 0.012, 0.04), wood, 0, 0.3, 0.07),
    place(new THREE.CylinderGeometry(0.014, 0.014, 0.05, 5), wood, 0, 0.32, 0.095),
  ]);
}

/** Four-arm windmill sails (spin around local Z at hub; disc faces +Z). */
export function createWindmillBladesGeometry(): THREE.BufferGeometry {
  const wood = '#8a7060';
  const woodDark = '#6e5848';
  const cloth = '#b9aa90';
  const clothShade = '#958975';
  const parts: THREE.BufferGeometry[] = [];
  for (let i = 0; i < 4; i++) {
    const clothHex = i % 2 === 0 ? cloth : clothShade;
    const a = mergeParts([
      place(new THREE.BoxGeometry(0.34, 0.026, 0.032), wood, 0.15, 0, 0),
      place(new THREE.BoxGeometry(0.24, 0.095, 0.014), clothHex, 0.19, 0, 0.016),
      place(new THREE.BoxGeometry(0.04, 0.04, 0.02), woodDark, 0.04, 0, 0),
    ]);
    a.rotateZ((i * Math.PI) / 2);
    parts.push(a);
  }
  const hub = place(new THREE.CylinderGeometry(0.032, 0.032, 0.055, 7), woodDark, 0, 0, 0);
  hub.rotateX(Math.PI / 2);
  parts.push(hub);
  return mergeParts(parts);
}

/** Harbor skiff hull + cabin (sail separate; share the same instance origin). */
export function createBoatHullGeometry(): THREE.BufferGeometry {
  const hull = '#6e4e34';
  const hullDark = '#523828';
  const gunwale = '#8a6a48';
  const cabin = '#c8b898';
  const mast = '#8a7060';
  return mergeParts([
    place(new THREE.BoxGeometry(0.3, 0.055, 0.13), hull, 0, 0.028, 0),
    place(new THREE.BoxGeometry(0.1, 0.045, 0.09), hullDark, 0.14, 0.035, 0, 1.15, 0.95, 0.8),
    place(new THREE.BoxGeometry(0.08, 0.04, 0.07), hullDark, -0.14, 0.032, 0, 1.05, 0.9, 0.75),
    place(new THREE.BoxGeometry(0.28, 0.015, 0.02), gunwale, 0, 0.055, 0.055),
    place(new THREE.BoxGeometry(0.28, 0.015, 0.02), gunwale, 0, 0.055, -0.055),
    place(new THREE.BoxGeometry(0.09, 0.07, 0.09), cabin, -0.03, 0.09, 0),
    place(new THREE.BoxGeometry(0.04, 0.03, 0.05), '#5a4030', -0.03, 0.085, 0.05),
    place(new THREE.CylinderGeometry(0.012, 0.015, 0.22, 5), mast, 0.04, 0.15, 0),
  ]);
}

export function createBoatSailGeometry(): THREE.BufferGeometry {
  return mergeParts([
    place(new THREE.BoxGeometry(0.018, 0.17, 0.13), '#ece6d8', 0.04, 0.2, 0.02),
    place(new THREE.BoxGeometry(0.12, 0.018, 0.018), '#8a7060', 0.04, 0.29, 0),
    place(new THREE.BoxGeometry(0.015, 0.015, 0.08), '#8a7060', 0.04, 0.14, 0.04),
  ]);
}

/** Pasture fence segment — two posts + rails. */
export function createFenceGeometry(): THREE.BufferGeometry {
  const post = '#6a5040';
  const rail = '#8a6a50';
  const railLight = '#9a7a5c';
  return mergeParts([
    place(new THREE.CylinderGeometry(0.016, 0.02, 0.17, 5), post, -0.13, 0.085, 0),
    place(new THREE.CylinderGeometry(0.016, 0.02, 0.17, 5), post, 0.13, 0.085, 0),
    place(new THREE.CylinderGeometry(0.012, 0.014, 0.05, 4), post, -0.13, 0.18, 0),
    place(new THREE.CylinderGeometry(0.012, 0.014, 0.05, 4), post, 0.13, 0.18, 0),
    place(new THREE.BoxGeometry(0.3, 0.022, 0.028), rail, 0, 0.12, 0),
    place(new THREE.BoxGeometry(0.3, 0.02, 0.024), railLight, 0, 0.065, 0),
  ]);
}

export function createWellGeometry(): THREE.BufferGeometry {
  const stone = '#b8b0a4';
  const stoneDark = '#9a9488';
  const wood = '#6a5040';
  const rope = '#c4a878';
  return mergeParts([
    place(new THREE.CylinderGeometry(0.09, 0.1, 0.1, 8), stone, 0, 0.05, 0),
    place(new THREE.CylinderGeometry(0.06, 0.06, 0.04, 8), stoneDark, 0, 0.09, 0),
    place(new THREE.CylinderGeometry(0.012, 0.012, 0.16, 4), wood, -0.07, 0.18, 0),
    place(new THREE.CylinderGeometry(0.012, 0.012, 0.16, 4), wood, 0.07, 0.18, 0),
    place(new THREE.BoxGeometry(0.18, 0.02, 0.02), wood, 0, 0.26, 0),
    place(new THREE.CylinderGeometry(0.02, 0.02, 0.05, 5), rope, 0, 0.2, 0),
  ]);
}

export function createBarrelGeometry(): THREE.BufferGeometry {
  const wood = '#8a5a38';
  const band = '#4a4038';
  const bandLo = place(new THREE.TorusGeometry(0.058, 0.008, 4, 10), band, 0, 0.035, 0);
  bandLo.rotateX(Math.PI / 2);
  const bandHi = place(new THREE.TorusGeometry(0.056, 0.008, 4, 10), band, 0, 0.09, 0);
  bandHi.rotateX(Math.PI / 2);
  return mergeParts([
    place(new THREE.CylinderGeometry(0.055, 0.06, 0.12, 8), wood, 0, 0.06, 0),
    bandLo,
    bandHi,
    place(new THREE.CylinderGeometry(0.052, 0.052, 0.012, 8), '#6a4830', 0, 0.118, 0),
  ]);
}

export function createCrateGeometry(): THREE.BufferGeometry {
  const wood = '#9a7a50';
  const dark = '#6a5040';
  return mergeParts([
    place(new THREE.BoxGeometry(0.12, 0.1, 0.12), wood, 0, 0.05, 0),
    place(new THREE.BoxGeometry(0.125, 0.015, 0.02), dark, 0, 0.08, 0.055),
    place(new THREE.BoxGeometry(0.125, 0.015, 0.02), dark, 0, 0.08, -0.055),
    place(new THREE.BoxGeometry(0.02, 0.015, 0.125), dark, 0.055, 0.08, 0),
    place(new THREE.BoxGeometry(0.02, 0.015, 0.125), dark, -0.055, 0.08, 0),
  ]);
}

/** H5 — watchtower / metropolis spire. */
export function createTowerGeometry(): THREE.BufferGeometry {
  const stone = '#c4b8a4';
  const dark = '#8a8070';
  const roof = '#7a5040';
  return mergeParts([
    place(new THREE.CylinderGeometry(0.06, 0.075, 0.28, 6), stone, 0, 0.14, 0),
    place(new THREE.CylinderGeometry(0.07, 0.07, 0.04, 6), dark, 0, 0.28, 0),
    place(new THREE.ConeGeometry(0.09, 0.12, 6), roof, 0, 0.36, 0),
    place(new THREE.BoxGeometry(0.03, 0.035, 0.02), '#d8c8a0', 0.04, 0.2, 0.06),
  ]);
}

export function createCampfireGeometry(): THREE.BufferGeometry {
  const wood = '#6a4a30';
  const ember = '#c45a28';
  const flame = '#e8a040';
  return mergeParts([
    place(new THREE.CylinderGeometry(0.05, 0.06, 0.03, 6), '#4a4038', 0, 0.015, 0),
    place(new THREE.BoxGeometry(0.08, 0.02, 0.025), wood, 0, 0.03, 0, 1, 1, 1, 0.4),
    place(new THREE.BoxGeometry(0.08, 0.02, 0.025), wood, 0, 0.03, 0, 1, 1, 1, -0.5),
    place(new THREE.ConeGeometry(0.035, 0.08, 5), ember, 0, 0.07, 0),
    place(new THREE.ConeGeometry(0.02, 0.05, 4), flame, 0, 0.11, 0),
  ]);
}

export function createCivColumnGeometry(): THREE.BufferGeometry {
  const stone = '#e0d8c8';
  const dark = '#c0b8a8';
  return mergeParts([
    place(new THREE.CylinderGeometry(0.04, 0.045, 0.04, 8), dark, 0, 0.02, 0),
    place(new THREE.CylinderGeometry(0.028, 0.032, 0.22, 8), stone, 0, 0.14, 0),
    place(new THREE.CylinderGeometry(0.042, 0.042, 0.03, 8), dark, 0, 0.26, 0),
  ]);
}

export function createCivAwningGeometry(): THREE.BufferGeometry {
  const cloth = '#c45a48';
  const pole = '#6a5040';
  return mergeParts([
    place(new THREE.CylinderGeometry(0.01, 0.012, 0.16, 4), pole, -0.06, 0.08, 0),
    place(new THREE.CylinderGeometry(0.01, 0.012, 0.16, 4), pole, 0.06, 0.08, 0),
    place(new THREE.BoxGeometry(0.16, 0.02, 0.12), cloth, 0, 0.16, 0.02),
  ]);
}

/** Stretchable dirt road along local +X. */
export function createDirtRoadGeometry(): THREE.BufferGeometry {
  const dirt = '#7a6348';
  const edge = '#5a4834';
  return mergeParts([
    place(new THREE.BoxGeometry(0.84, 0.035, 0.13), dirt, 0, 0.018, 0),
    place(new THREE.BoxGeometry(0.84, 0.02, 0.02), edge, 0, 0.012, 0.06),
    place(new THREE.BoxGeometry(0.84, 0.02, 0.02), edge, 0, 0.012, -0.06),
  ]);
}

/** Stretchable paved road along local +X (same convention as road_segment_a). */
export function createPavedRoadGeometry(): THREE.BufferGeometry {
  const stoneA = '#a8a298';
  const stoneB = '#90887c';
  const edge = '#6a6458';
  const parts: THREE.BufferGeometry[] = [
    place(new THREE.BoxGeometry(0.84, 0.028, 0.15), edge, 0, 0.012, 0),
  ];
  // Cobble strips — readable paving without a flat slab look.
  for (let i = -3; i <= 3; i++) {
    const x = i * 0.12;
    const tone = Math.abs(i) % 2 === 0 ? stoneA : stoneB;
    parts.push(place(new THREE.BoxGeometry(0.1, 0.038, 0.13), tone, x, 0.022, 0));
  }
  return mergeParts(parts);
}

/** Wooden bridge deck + rails along local +X. */
export function createBridgeGeometry(): THREE.BufferGeometry {
  const wood = '#8a6a48';
  const dark = '#5a4030';
  return mergeParts([
    place(new THREE.BoxGeometry(0.84, 0.05, 0.16), wood, 0, 0.04, 0),
    place(new THREE.BoxGeometry(0.84, 0.08, 0.03), dark, 0, 0.1, 0.08),
    place(new THREE.BoxGeometry(0.84, 0.08, 0.03), dark, 0, 0.1, -0.08),
    place(new THREE.CylinderGeometry(0.025, 0.03, 0.12, 5), dark, -0.38, 0.02, 0.1),
    place(new THREE.CylinderGeometry(0.025, 0.03, 0.12, 5), dark, 0.38, 0.02, 0.1),
    place(new THREE.CylinderGeometry(0.025, 0.03, 0.12, 5), dark, -0.38, 0.02, -0.1),
    place(new THREE.CylinderGeometry(0.025, 0.03, 0.12, 5), dark, 0.38, 0.02, -0.1),
  ]);
}

export function createWarehouseGeometry(): THREE.BufferGeometry {
  const wood = '#b89a70';
  const dark = '#8a6a48';
  const roof = '#7a5040';
  return mergeParts([
    place(new THREE.BoxGeometry(0.2, 0.12, 0.14), wood, 0, 0.06, 0),
    place(new THREE.BoxGeometry(0.22, 0.035, 0.16), roof, 0, 0.145, 0),
    place(new THREE.BoxGeometry(0.06, 0.08, 0.02), '#5a4030', 0, 0.06, 0.072),
    place(new THREE.BoxGeometry(0.018, 0.1, 0.018), dark, -0.08, 0.06, -0.05),
    place(new THREE.BoxGeometry(0.018, 0.1, 0.018), dark, 0.08, 0.06, -0.05),
  ]);
}

/** H6 — glacial ice block with snow cap. */
export function createIceBlockGeometry(): THREE.BufferGeometry {
  const ice = '#c8dff0';
  const deep = '#8eb4d0';
  const snow = '#f4f8fc';
  const snowShade = '#d8e4f0';
  return mergeParts([
    place(new THREE.BoxGeometry(0.18, 0.12, 0.14), ice, 0, 0.06, 0, 1, 1, 1, 0.2),
    place(new THREE.BoxGeometry(0.12, 0.1, 0.1), deep, 0.05, 0.1, -0.03, 1, 1, 1, -0.35),
    // Soft snow blanket on top.
    place(new THREE.SphereGeometry(0.11, 6, 4), snow, 0, 0.16, 0, 1.15, 0.45, 1.05),
    place(new THREE.SphereGeometry(0.07, 5, 3), snowShade, 0.05, 0.17, 0.04, 1.1, 0.4, 1),
    place(new THREE.SphereGeometry(0.05, 5, 3), snow, -0.06, 0.15, -0.03, 1, 0.35, 1.1),
  ]);
}

/** H6 — swamp reed clump (layered, slightly leaned stems). */
export function createReedClumpGeometry(): THREE.BufferGeometry {
  const stem = '#3a4e32';
  const stemLight = '#4a6040';
  const tip = '#5e7048';
  const tipDark = '#4a5838';
  const parts: THREE.BufferGeometry[] = [
    place(new THREE.CylinderGeometry(0.055, 0.065, 0.02, 7), '#2a3026', 0, 0.01, 0),
  ];
  for (let i = 0; i < 11; i++) {
    const a = (i / 11) * Math.PI * 2 + 0.11;
    const spread = 0.022 + (i % 4) * 0.011;
    const x = Math.cos(a) * spread;
    const z = Math.sin(a) * spread;
    const h = 0.13 + (i % 5) * 0.026;
    const lean = ((i % 5) - 2) * 0.014;
    parts.push(
      place(
        new THREE.CylinderGeometry(0.0035, 0.0085, h, 4),
        i % 2 === 0 ? stem : stemLight,
        x + lean,
        h * 0.5,
        z,
      ),
    );
    // Soft plume tip (not a hard cone).
    parts.push(
      place(
        new THREE.SphereGeometry(0.012 + (i % 3) * 0.003, 4, 3),
        i % 2 === 0 ? tip : tipDark,
        x + lean * 1.25,
        h + 0.01,
        z,
        0.7,
        1.6,
        0.7,
      ),
    );
    if (i % 2 === 0) {
      parts.push(
        place(
          new THREE.SphereGeometry(0.008, 4, 3),
          '#6a7850',
          x + lean * 1.1,
          h + 0.022,
          z,
          0.55,
          1.4,
          0.55,
        ),
      );
    }
  }
  return mergeParts(parts);
}

/** H6 — glacial melt pool (clear cold water). */
export function createMeltPoolGeometry(): THREE.BufferGeometry {
  const iceRim = '#c8dce8';
  const water = '#5a9ab8';
  const deep = '#3a78a0';
  return mergeParts([
    place(new THREE.CylinderGeometry(0.1, 0.11, 0.022, 8), iceRim, 0, 0.011, 0),
    place(new THREE.CylinderGeometry(0.07, 0.075, 0.018, 8), water, 0, 0.02, 0),
    place(new THREE.CylinderGeometry(0.04, 0.045, 0.014, 6), deep, 0, 0.026, 0),
    place(new THREE.SphereGeometry(0.02, 5, 3), '#e8f4fa', 0.03, 0.028, -0.02, 1.3, 0.35, 1),
  ]);
}

/** H6 — dull marsh puddle with muddy rim. */
export function createMarshPoolGeometry(): THREE.BufferGeometry {
  const mud = '#3a4030';
  const water = '#3a5048';
  const scum = '#4a5840';
  return mergeParts([
    place(new THREE.CylinderGeometry(0.11, 0.12, 0.025, 8), mud, 0, 0.012, 0),
    place(new THREE.CylinderGeometry(0.08, 0.085, 0.02, 8), water, 0, 0.022, 0),
    place(new THREE.SphereGeometry(0.03, 5, 3), scum, 0.04, 0.03, -0.02, 1.4, 0.35, 1.1),
    place(new THREE.CylinderGeometry(0.006, 0.008, 0.08, 4), '#3e5034', -0.07, 0.05, 0.05),
    place(new THREE.CylinderGeometry(0.005, 0.007, 0.06, 4), '#3e5034', 0.06, 0.04, 0.04),
  ]);
}

/** H6 — ground snow patch for glaciers. */
export function createSnowPatchGeometry(): THREE.BufferGeometry {
  const snow = '#f2f6fa';
  const shade = '#d0dce8';
  return mergeParts([
    place(new THREE.SphereGeometry(0.1, 6, 4), snow, 0, 0.025, 0, 1.4, 0.28, 1.2),
    place(new THREE.SphereGeometry(0.06, 5, 3), shade, 0.06, 0.022, 0.04, 1.2, 0.25, 1),
    place(new THREE.SphereGeometry(0.05, 5, 3), snow, -0.05, 0.02, -0.03, 1.1, 0.22, 1.15),
  ]);
}

/** H6 — dark northern fir (tundra) — vert sapin lisible, pas noir. */
export function createDarkPineGeometry(): THREE.BufferGeometry {
  const trunk = '#3a2a1c';
  const dark = '#1f5538';
  const mid = '#2a6844';
  const tip = '#378056';
  return mergeParts([
    place(new THREE.CylinderGeometry(0.028, 0.042, 0.22, 5), trunk, 0, 0.11, 0),
    place(new THREE.ConeGeometry(0.16, 0.22, 6), dark, 0, 0.26, 0),
    place(new THREE.ConeGeometry(0.13, 0.2, 6), mid, 0, 0.4, 0),
    place(new THREE.ConeGeometry(0.09, 0.16, 6), tip, 0, 0.52, 0),
    place(new THREE.ConeGeometry(0.055, 0.12, 5), dark, 0, 0.62, 0),
  ]);
}

/** H6 — palm canopy (jungle). */
export function createPalmGeometry(variant = 0): THREE.BufferGeometry {
  const trunk = variant === 0 ? '#8a6a40' : '#7a5a38';
  const frond = variant === 0 ? '#2e7048' : '#3a8050';
  const frondDark = '#1e5034';
  const parts: THREE.BufferGeometry[] = [
    place(new THREE.CylinderGeometry(0.028, 0.04, 0.36, 6), trunk, 0, 0.18, 0),
    place(new THREE.SphereGeometry(0.035, 5, 4), '#6a5030', 0, 0.38, 0),
  ];
  const fronds = 7;
  for (let i = 0; i < fronds; i++) {
    const a = (i / fronds) * Math.PI * 2 + variant * 0.2;
    const lean = 0.35 + (i % 3) * 0.08;
    const len = 0.2 + (i % 2) * 0.04;
    const fx = Math.cos(a) * lean * 0.5;
    const fz = Math.sin(a) * lean * 0.5;
    parts.push(
      place(
        new THREE.BoxGeometry(0.04, 0.015, len),
        i % 2 === 0 ? frond : frondDark,
        fx,
        0.4 + (i % 3) * 0.015,
        fz,
        1,
        1,
        1,
        a,
      ),
    );
    // Drooping tip.
    parts.push(
      place(
        new THREE.BoxGeometry(0.03, 0.012, len * 0.55),
        frondDark,
        fx * 1.55,
        0.36,
        fz * 1.55,
        1,
        1,
        1,
        a + 0.15,
      ),
    );
  }
  if (variant === 0) {
    parts.push(place(new THREE.SphereGeometry(0.018, 4, 3), '#6a4030', 0.03, 0.37, 0.02));
    parts.push(place(new THREE.SphereGeometry(0.016, 4, 3), '#5a3828', -0.02, 0.36, -0.03));
  }
  // Petite banana bunch under the crown.
  const banana = '#e8c84a';
  const bananaShade = '#c4a038';
  for (let b = 0; b < 6; b++) {
    const ba = (b / 6) * Math.PI * 2 + 0.4;
    const bx = Math.cos(ba) * 0.045;
    const bz = Math.sin(ba) * 0.045;
    parts.push(
      place(
        new THREE.SphereGeometry(0.014, 5, 4),
        b % 2 === 0 ? banana : bananaShade,
        bx,
        0.325 - (b % 3) * 0.01,
        bz,
        0.45,
        1.85,
        0.55,
      ),
    );
  }
  parts.push(place(new THREE.SphereGeometry(0.016, 4, 3), '#5a4030', 0, 0.34, 0));
  return mergeParts(parts);
}

export function createPalmAGeometry(): THREE.BufferGeometry {
  return createPalmGeometry(0);
}

export function createPalmBGeometry(): THREE.BufferGeometry {
  return createPalmGeometry(1);
}

/** H6 — broken ruin wall segment. */
export function createRuinWallGeometry(): THREE.BufferGeometry {
  const stone = '#9a8a78';
  const dark = '#6a5a4c';
  const moss = '#4a6040';
  return mergeParts([
    place(new THREE.BoxGeometry(0.22, 0.14, 0.06), stone, 0, 0.07, 0),
    place(new THREE.BoxGeometry(0.08, 0.1, 0.055), dark, -0.1, 0.12, 0),
    place(new THREE.BoxGeometry(0.06, 0.06, 0.05), stone, 0.08, 0.16, 0),
    place(new THREE.BoxGeometry(0.04, 0.03, 0.04), moss, 0.02, 0.15, 0.02),
    place(new THREE.BoxGeometry(0.05, 0.04, 0.04), dark, -0.02, 0.02, 0.04),
  ]);
}

/** H6 — ruined arch. */
export function createRuinArchGeometry(): THREE.BufferGeometry {
  const stone = '#a89884';
  const dark = '#7a6a58';
  return mergeParts([
    place(new THREE.BoxGeometry(0.05, 0.2, 0.05), stone, -0.08, 0.1, 0),
    place(new THREE.BoxGeometry(0.05, 0.16, 0.05), stone, 0.08, 0.08, 0),
    place(new THREE.BoxGeometry(0.18, 0.04, 0.05), dark, 0, 0.2, 0),
    place(new THREE.BoxGeometry(0.04, 0.04, 0.04), stone, -0.02, 0.23, 0),
    place(new THREE.BoxGeometry(0.03, 0.05, 0.03), '#5a6a48', 0.06, 0.14, 0.03),
  ]);
}

/** H6 — glowing lava pool. */
export function createLavaPoolGeometry(): THREE.BufferGeometry {
  const rim = '#3a3230';
  const crust = '#5a4038';
  const lava = '#e85820';
  const glow = '#f0a038';
  return mergeParts([
    place(new THREE.CylinderGeometry(0.1, 0.11, 0.03, 7), rim, 0, 0.015, 0),
    place(new THREE.CylinderGeometry(0.07, 0.075, 0.025, 7), crust, 0, 0.025, 0),
    place(new THREE.CylinderGeometry(0.05, 0.055, 0.02, 6), lava, 0, 0.032, 0),
    place(new THREE.SphereGeometry(0.025, 5, 3), glow, 0.02, 0.04, -0.01, 1.2, 0.5, 1),
  ]);
}

/** H6 — scorched lava rock. */
export function createLavaRockGeometry(): THREE.BufferGeometry {
  const ash = '#4a4044';
  const hot = '#c45028';
  const ember = '#e87830';
  return mergeParts([
    place(new THREE.IcosahedronGeometry(0.09, 0), ash, 0, 0.06, 0, 1.15, 0.8, 1),
    place(new THREE.TetrahedronGeometry(0.045, 0), hot, 0.04, 0.08, 0.02),
    place(new THREE.BoxGeometry(0.03, 0.02, 0.04), ember, -0.03, 0.05, 0.03),
  ]);
}

/** H6 — volcano: uniform cinder cone + subtle slope imperfections. */
export function createVolcanoConeGeometry(): THREE.BufferGeometry {
  const ash = '#4a4048';
  const dark = '#2e282c';
  const mid = '#3a3438';
  const lava = '#e05020';
  const glow = '#f08830';
  const parts: THREE.BufferGeometry[] = [
    // Clean mountain-scale cone (slight oval squeeze = soft imperfection).
    place(new THREE.ConeGeometry(0.46, 0.78, 10), ash, 0, 0.39, 0, 1.04, 1, 0.96),
    place(new THREE.ConeGeometry(0.34, 0.52, 9), mid, 0.012, 0.52, -0.008, 1.02, 1, 0.98),
    place(new THREE.ConeGeometry(0.2, 0.28, 8), dark, -0.01, 0.68, 0.006, 1.03, 1, 0.97),
    // Soft rim lip around crater (not a sharp cylinder stack).
    place(new THREE.TorusGeometry(0.095, 0.028, 5, 10), dark, 0, 0.78, 0, 1.05, 0.55, 1.02),
    // Crater lava bowl.
    place(new THREE.CylinderGeometry(0.07, 0.1, 0.04, 8), lava, 0, 0.76, 0),
    place(new THREE.CylinderGeometry(0.04, 0.055, 0.028, 6), glow, 0, 0.79, 0),
  ];
  // Slope imperfections: a few low bumps hugging the cone, not rocky chaos.
  const bumps = [
    { a: 0.4, h: 0.28, r: 0.28, s: 0.07 },
    { a: 1.8, h: 0.42, r: 0.22, s: 0.055 },
    { a: 3.3, h: 0.22, r: 0.32, s: 0.065 },
    { a: 4.7, h: 0.5, r: 0.18, s: 0.05 },
    { a: 5.6, h: 0.34, r: 0.26, s: 0.06 },
  ];
  for (const b of bumps) {
    parts.push(
      place(
        new THREE.SphereGeometry(b.s, 5, 4),
        dark,
        Math.cos(b.a) * b.r,
        b.h,
        Math.sin(b.a) * b.r,
        1.35,
        0.55,
        1.15,
      ),
    );
  }
  // One thin lava streak down the flank.
  parts.push(
    place(new THREE.BoxGeometry(0.035, 0.02, 0.28), lava, 0.16, 0.48, 0.08, 1, 1, 1, 0.55),
  );
  parts.push(
    place(new THREE.BoxGeometry(0.028, 0.016, 0.18), glow, 0.2, 0.36, 0.12, 1, 1, 1, 0.55),
  );
  // Tiny uniform apron pebbles (sparse).
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 + 0.15;
    const r = 0.42 + (i % 2) * 0.03;
    parts.push(
      place(
        new THREE.IcosahedronGeometry(0.035, 0),
        i % 2 === 0 ? ash : dark,
        Math.cos(a) * r,
        0.03,
        Math.sin(a) * r,
        1.1,
        0.55,
        1,
      ),
    );
  }
  return mergeParts(parts);
}

/** H6 — mine shaft mouth (goldmine landmark). */
export function createMineEntranceGeometry(): THREE.BufferGeometry {
  const rock = '#7a7468';
  const dark = '#3a3834';
  const timber = '#6a5040';
  return mergeParts([
    place(new THREE.BoxGeometry(0.22, 0.16, 0.12), rock, 0, 0.08, 0),
    place(new THREE.BoxGeometry(0.12, 0.12, 0.06), dark, 0, 0.08, 0.05),
    place(new THREE.BoxGeometry(0.14, 0.025, 0.04), timber, 0, 0.15, 0.04),
    place(new THREE.BoxGeometry(0.025, 0.14, 0.04), timber, -0.06, 0.08, 0.04),
    place(new THREE.BoxGeometry(0.025, 0.14, 0.04), timber, 0.06, 0.08, 0.04),
    place(new THREE.BoxGeometry(0.04, 0.03, 0.03), '#c9a84a', 0.08, 0.03, 0.08),
  ]);
}

const builders: Record<PremiumModelId, () => THREE.BufferGeometry> = {
  tree: createTreeGeometry,
  scrub: createScrubGeometry,
  rock: createRockGeometry,
  peak: createPeakGeometry,
  dune: createDuneGeometry,
  settlement: createSettlementGeometry,
  city: createCityGeometry,
  robber: createRobberGeometry,
};

const cache = new Map<PremiumModelId, THREE.BufferGeometry>();

/**
 * Procedural fallback geometry (do not dispose while scene is mounted).
 * H1+: Blender GLBs loaded via useGLTF are the primary visuals; this catalog
 * remains for tests, offline fallback, and Node GLB export mirrors.
 */
export function getPremiumGeometry(id: PremiumModelId): THREE.BufferGeometry {
  let geo = cache.get(id);
  if (!geo) {
    geo = builders[id]();
    cache.set(id, geo);
  }
  return geo;
}

export function createPremiumGeometry(id: PremiumModelId): THREE.BufferGeometry {
  return builders[id]();
}

/** Rough triangle budget helper for tests / docs. */
export function countTriangles(geo: THREE.BufferGeometry): number {
  const index = geo.getIndex();
  if (index) return index.count / 3;
  const pos = geo.getAttribute('position');
  return pos ? pos.count / 3 : 0;
}

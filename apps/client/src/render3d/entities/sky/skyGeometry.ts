import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/**
 * Vertex-coloured part merger.
 *
 * Every static piece of an island (rock, turf, trees, tents, columns...) is
 * baked into one geometry with per-vertex colour, so a whole island costs one
 * draw call (plus one for its glowing accents) instead of dozens of meshes.
 * Colours are stored linear, and may exceed 1 for the emissive set so that
 * the bloom pass picks them up.
 */
export class PartBuilder {
  private readonly parts: THREE.BufferGeometry[] = [];
  private readonly matrix = new THREE.Matrix4();
  private readonly quaternion = new THREE.Quaternion();
  private readonly euler = new THREE.Euler();
  private readonly scaleVector = new THREE.Vector3();
  private readonly positionVector = new THREE.Vector3();

  get size(): number {
    return this.parts.length;
  }

  /**
   * Add a geometry. `color` is a hex/Color (linearised by three) or a function
   * of the transformed vertex position. `flat` re-derives faceted normals;
   * `jitter` adds deterministic per-face brightness noise.
   */
  add(
    source: THREE.BufferGeometry,
    color: THREE.ColorRepresentation | ((position: THREE.Vector3, out: THREE.Color) => void),
    options: {
      position?: [number, number, number];
      rotation?: [number, number, number];
      scale?: number | [number, number, number];
      matrix?: THREE.Matrix4;
      flat?: boolean;
      jitter?: number;
      intensity?: number;
      seed?: number;
      /** Evaluate a colour function once per triangle (at its centroid). */
      perFace?: boolean;
    } = {},
  ): this {
    const geometry = source.index ? source.toNonIndexed() : source.clone();
    source.dispose();
    for (const name of Object.keys(geometry.attributes)) {
      if (name !== 'position' && name !== 'normal') geometry.deleteAttribute(name);
    }
    if (options.matrix) {
      geometry.applyMatrix4(options.matrix);
    } else {
      const [px, py, pz] = options.position ?? [0, 0, 0];
      const [rx, ry, rz] = options.rotation ?? [0, 0, 0];
      const scale = options.scale ?? 1;
      const [sx, sy, sz] = typeof scale === 'number' ? [scale, scale, scale] : scale;
      this.quaternion.setFromEuler(this.euler.set(rx, ry, rz));
      this.matrix.compose(
        this.positionVector.set(px, py, pz),
        this.quaternion,
        this.scaleVector.set(sx, sy, sz),
      );
      geometry.applyMatrix4(this.matrix);
    }
    if (options.flat || !geometry.getAttribute('normal')) geometry.computeVertexNormals();

    const positions = geometry.getAttribute('position') as THREE.BufferAttribute;
    const colors = new Float32Array(positions.count * 3);
    const base = new THREE.Color();
    const vertex = new THREE.Vector3();
    const intensity = options.intensity ?? 1;
    const jitter = options.jitter ?? 0;
    let state = (options.seed ?? 1) >>> 0;
    let faceShade = 1;
    if (typeof color !== 'function') base.set(color);
    for (let i = 0; i < positions.count; i++) {
      if (typeof color === 'function') {
        if (options.perFace) {
          if (i % 3 === 0) {
            vertex.fromBufferAttribute(positions, i);
            vertex.x += positions.getX(i + 1) + positions.getX(i + 2);
            vertex.y += positions.getY(i + 1) + positions.getY(i + 2);
            vertex.z += positions.getZ(i + 1) + positions.getZ(i + 2);
            vertex.multiplyScalar(1 / 3);
            color(vertex, base);
          }
        } else {
          vertex.fromBufferAttribute(positions, i);
          color(vertex, base);
        }
      }
      if (jitter > 0 && i % 3 === 0) {
        state = (Math.imul(state ^ (state >>> 15), 2246822519) + 0x9e3779b9) >>> 0;
        faceShade = 1 + ((state / 4294967296) * 2 - 1) * jitter;
      }
      const shade = intensity * (jitter > 0 ? faceShade : 1);
      colors[i * 3] = base.r * shade;
      colors[i * 3 + 1] = base.g * shade;
      colors[i * 3 + 2] = base.b * shade;
    }
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    this.parts.push(geometry);
    return this;
  }

  build(): THREE.BufferGeometry | null {
    if (!this.parts.length) return null;
    const merged = mergeGeometries(this.parts, false);
    for (const part of this.parts) part.dispose();
    this.parts.length = 0;
    if (!merged) return null;
    merged.computeBoundingSphere();
    merged.computeBoundingBox();
    return merged;
  }
}

/** Builds the transform of a thin cylinder spanning two points. */
export function spanMatrix(
  from: THREE.Vector3,
  to: THREE.Vector3,
  radius: number,
  out = new THREE.Matrix4(),
): THREE.Matrix4 {
  const direction = to.clone().sub(from);
  const length = direction.length();
  const quaternion = new THREE.Quaternion().setFromUnitVectors(
    new THREE.Vector3(0, 1, 0),
    direction.normalize(),
  );
  return out.compose(
    from.clone().add(to).multiplyScalar(0.5),
    quaternion,
    new THREE.Vector3(radius, length, radius),
  );
}

/** Unit cylinder (radius 1, height 1) used with `spanMatrix`. */
export function unitRod(segments = 6): THREE.BufferGeometry {
  return new THREE.CylinderGeometry(1, 1, 1, segments, 1);
}

/** Small deterministic value noise on a circle, for organic outlines. */
export function ringNoise(seed: number, harmonics = 4): (angle: number) => number {
  let state = seed >>> 0;
  const next = () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let r = Math.imul(state ^ (state >>> 15), 1 | state);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
  const terms = Array.from({ length: harmonics }, (_, index) => ({
    frequency: index + 2,
    amplitude: (next() * 0.6 + 0.4) / (index + 1.4),
    phase: next() * Math.PI * 2,
  }));
  const norm = terms.reduce((sum, term) => sum + term.amplitude, 0);
  return (angle: number) =>
    terms.reduce((sum, term) => sum + Math.sin(angle * term.frequency + term.phase) * term.amplitude, 0) /
    norm;
}

/** A triangle duplicated with reversed winding, so it shows from both sides. */
export function flatTriangleDouble(a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3): THREE.BufferGeometry {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    'position',
    new THREE.Float32BufferAttribute(
      [a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z, a.x, a.y, a.z, c.x, c.y, c.z, b.x, b.y, b.z],
      3,
    ),
  );
  geometry.computeVertexNormals();
  return geometry;
}

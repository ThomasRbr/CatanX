import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { skyClock } from './skyClock';
import type { LaneCurve } from './skyLayout';

/**
 * Wind currents between hubs.
 *
 * Every lane is a ribbon swept along its arc, all merged into one geometry and
 * drawn with one shader: a translucent blue band with a bright core and
 * chevrons streaming in the direction of the current. The ribbon is turned
 * towards the (fixed-direction) diorama camera so it keeps its width at any
 * zoom. Lanes away from any discovered hub are drawn fainter.
 */

const VIEW_DIRECTION = new THREE.Vector3(1, 1.28, 1).normalize();
const FACE = new THREE.Vector3(0, 1, 0).multiplyScalar(0.45).add(VIEW_DIRECTION.clone().multiplyScalar(0.55)).normalize();

const VERTEX = /* glsl */ `
attribute vec3 aLane;
varying vec3 vLane;
varying float vAcross;
varying float vFogDepth;
attribute float aAcross;
void main() {
  vLane = aLane;
  vAcross = aAcross;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  vFogDepth = -mv.z;
  gl_Position = projectionMatrix * mv;
}
`;

const FRAGMENT = /* glsl */ `
uniform float uTime;
varying vec3 vLane;
varying float vAcross;
void main() {
  float s = vLane.x;
  float total = vLane.y;
  float strength = vLane.z;
  float a = abs(vAcross);

  float band = 1.0 - smoothstep(0.25, 1.0, a);
  float core = 1.0 - smoothstep(0.0, 0.18, a);

  // Chevrons pointing downstream (+s), streaming with the current.
  float k = (s + a * 0.085) * 5.2 - uTime * 0.9;
  float f = fract(k);
  float chevron = smoothstep(0.0, 0.07, f) * (1.0 - smoothstep(0.16, 0.3, f));
  chevron *= 1.0 - smoothstep(0.6, 0.95, a);

  // Faint streamlines sliding faster, for the feel of moving air.
  float lane = floor((vAcross * 0.5 + 0.5) * 5.0);
  float streak = fract(s * 1.6 - uTime * (1.3 + lane * 0.17) + lane * 0.37);
  float wisp = smoothstep(0.0, 0.2, streak) * (1.0 - smoothstep(0.35, 0.6, streak)) * band;

  float ends = smoothstep(0.0, 0.16, s) * smoothstep(0.0, 0.22, total - s);
  vec3 edge = vec3(0.1, 0.3, 0.68);
  vec3 col = mix(edge, vec3(0.55, 0.85, 1.1), core * 0.7 + wisp * 0.35);
  col = mix(col, vec3(1.35, 1.85, 2.3), chevron * strength);
  float alpha = (band * 0.62 + core * 0.2 + wisp * 0.12 + chevron * 0.8) * ends;
  alpha *= mix(0.45, 1.0, strength);
  gl_FragColor = vec4(col, clamp(alpha, 0.0, 1.0));
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

export interface WindLane {
  id: string;
  curve: LaneCurve;
  /** 1 when at least one end is discovered, lower otherwise. */
  strength: number;
}

function buildRibbons(lanes: WindLane[]): THREE.BufferGeometry | null {
  if (!lanes.length) return null;
  const positions: number[] = [];
  const lane: number[] = [];
  const across: number[] = [];
  const indices: number[] = [];
  const side = new THREE.Vector3();
  const width = 0.2;
  let vertex = 0;
  for (const entry of lanes) {
    const { curve, length } = entry.curve;
    const segments = Math.max(16, Math.ceil(length * 22));
    for (let i = 0; i <= segments; i++) {
      const t = i / segments;
      const p = curve.getPointAt(t);
      const tangent = curve.getTangentAt(t);
      side.crossVectors(tangent, FACE).normalize();
      const half = (width * (0.62 + 0.38 * Math.sin(Math.PI * t))) / 2;
      positions.push(p.x - side.x * half, p.y - side.y * half, p.z - side.z * half);
      positions.push(p.x + side.x * half, p.y + side.y * half, p.z + side.z * half);
      lane.push(t * length, length, entry.strength, t * length, length, entry.strength);
      across.push(-1, 1);
      if (i < segments) {
        const a = vertex + i * 2;
        indices.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
      }
    }
    vertex += (segments + 1) * 2;
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('aLane', new THREE.Float32BufferAttribute(lane, 3));
  geometry.setAttribute('aAcross', new THREE.Float32BufferAttribute(across, 1));
  geometry.setIndex(indices);
  geometry.computeBoundingSphere();
  return geometry;
}

export function SkyWindLanes({ lanes }: { lanes: WindLane[] }) {
  const geometry = useMemo(() => buildRibbons(lanes), [lanes]);
  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: VERTEX,
        fragmentShader: FRAGMENT,
        uniforms: { uTime: skyClock },
        transparent: true,
        depthWrite: false,
        side: THREE.DoubleSide,
      }),
    [],
  );
  useEffect(() => () => geometry?.dispose(), [geometry]);
  useEffect(() => () => material.dispose(), [material]);
  if (!geometry) return null;
  return <mesh geometry={geometry} material={material} renderOrder={4} raycast={() => undefined} />;
}

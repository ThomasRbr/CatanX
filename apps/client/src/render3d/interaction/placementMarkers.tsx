import { useCallback, useEffect, useMemo, useRef } from 'react';
import { useFrame, type ThreeEvent } from '@react-three/fiber';
import * as THREE from 'three';
import { buildDrapedRibbon } from '../terrain/DrapedHexLines';
import { useSurfaceHeight } from '../terrain/SurfaceHeightContext';

/**
 * Placement markers shared by the setup and mid-game build overlays.
 *
 * Both overlays used to pin every marker at the flat slab height. On the relief
 * board that buried the candidates on hills and mountains — invisible and
 * unclickable — so everything here is anchored on the sampled surface.
 */

export type MarkerState = 'idle' | 'hover' | 'pending';
export type MarkerAccent = 'settle' | 'city' | 'knight';

const DRAG_SLOP_SQ = 10 * 10;
const HIT_NODE = 0.26;
const HIT_EDGE_W = 0.3;
/** Markers float a little above the ground so grass never swallows them. */
const NODE_LIFT = 0.07;
const EDGE_LIFT = 0.03;

const ACCENT_COLORS: Record<MarkerAccent, string> = {
  settle: '#3fe0cf',
  city: '#ffb648',
  knight: '#8be9ff',
};
const ACTIVE_COLOR = '#ffcd4a';

export function markerColor(accent: MarkerAccent, state: MarkerState): string {
  return state === 'idle' ? ACCENT_COLORS[accent] : ACTIVE_COLOR;
}

/** Height of the board surface under (x, z) plus a lift. */
export function useSurfaceY(): (x: number, z: number, lift?: number) => number {
  const surface = useSurfaceHeight();
  return useCallback((x: number, z: number, lift = 0) => surface.sampleHeight(x, z) + lift, [surface]);
}

export function nodeMarkerY(sample: (x: number, z: number, lift?: number) => number, x: number, z: number) {
  return sample(x, z, NODE_LIFT);
}

export function edgeMarkerY(
  sample: (x: number, z: number, lift?: number) => number,
  a: { x: number; z: number },
  b: { x: number; z: number },
) {
  return sample((a.x + b.x) / 2, (a.z + b.z) / 2, EDGE_LIFT + 0.02);
}

export function usePlacementClick(enabled: boolean, onFire: () => void) {
  const pointerDown = useRef<{ x: number; y: number } | null>(null);
  return {
    onPointerDown: (e: ThreeEvent<PointerEvent>) => {
      if (!enabled || e.button !== 0) return;
      e.stopPropagation();
      pointerDown.current = { x: e.clientX, y: e.clientY };
    },
    onPointerUp: (e: ThreeEvent<PointerEvent>) => {
      if (!enabled || e.button !== 0) return;
      e.stopPropagation();
      const down = pointerDown.current;
      pointerDown.current = null;
      if (!down) return;
      const dx = e.clientX - down.x;
      const dy = e.clientY - down.y;
      if (dx * dx + dy * dy > DRAG_SLOP_SQ) return;
      onFire();
    },
  };
}

function hoverHandlers(id: string, onHover: (id: string | null) => void) {
  return {
    onPointerOver: (e: ThreeEvent<PointerEvent>) => {
      e.stopPropagation();
      document.body.style.cursor = 'pointer';
      onHover(id);
    },
    onPointerOut: () => {
      document.body.style.cursor = '';
      onHover(null);
    },
  };
}

const coreGeo = new THREE.SphereGeometry(0.052, 20, 14);
const haloGeo = new THREE.RingGeometry(0.085, 0.125, 40);
const glowGeo = new THREE.CircleGeometry(0.17, 40);
const hitNodeGeo = new THREE.SphereGeometry(HIT_NODE, 12, 10);
const hitMat = new THREE.MeshBasicMaterial();

function noopRaycast() {
  /* visuals never steal picking */
}

/**
 * A buildable corner: glowing bead, halo ring and a soft pool of light on the
 * ground. Idle markers breathe gently; hover and pending selection turn gold
 * and grow so the choice is unmistakable.
 */
export function NodeMarker({
  id,
  x,
  z,
  state,
  accent = 'settle',
  enabled,
  onClick,
  onHover,
}: {
  id: string;
  x: number;
  z: number;
  state: MarkerState;
  accent?: MarkerAccent;
  enabled: boolean;
  onClick: () => void;
  onHover: (id: string | null) => void;
}) {
  const sample = useSurfaceY();
  const ground = sample(x, z, 0.012);
  const y = nodeMarkerY(sample, x, z);
  const handlers = usePlacementClick(enabled, onClick);
  const color = markerColor(accent, state);
  const pulseRef = useRef<THREE.Group>(null);
  const phase = useMemo(() => (Math.abs(Math.sin(x * 12.9898 + z * 78.233)) * 6.28) % 6.28, [x, z]);

  useFrame(({ clock }) => {
    const group = pulseRef.current;
    if (!group) return;
    const base = state === 'pending' ? 1.3 : state === 'hover' ? 1.2 : 1;
    const breathe = state === 'idle' ? Math.sin(clock.elapsedTime * 2.4 + phase) * 0.07 : 0;
    group.scale.setScalar(base + breathe);
  });

  return (
    <group>
      <mesh
        position={[x, y, z]}
        geometry={hitNodeGeo}
        material={hitMat}
        visible={false}
        userData={{ kind: 'intersection', id }}
        {...handlers}
        {...hoverHandlers(id, onHover)}
      />
      <group ref={pulseRef} position={[x, y, z]}>
        <mesh geometry={coreGeo} raycast={noopRaycast} renderOrder={7}>
          <meshBasicMaterial color={color} toneMapped={false} />
        </mesh>
      </group>
      <group position={[x, ground, z]} rotation={[-Math.PI / 2, 0, 0]}>
        <mesh geometry={haloGeo} raycast={noopRaycast} renderOrder={6}>
          <meshBasicMaterial
            color={color}
            transparent
            opacity={state === 'idle' ? 0.85 : 1}
            depthWrite={false}
            toneMapped={false}
            side={THREE.DoubleSide}
            polygonOffset
            polygonOffsetFactor={-4}
            polygonOffsetUnits={-4}
          />
        </mesh>
        <mesh geometry={glowGeo} raycast={noopRaycast} renderOrder={5}>
          <meshBasicMaterial
            color={color}
            transparent
            opacity={state === 'idle' ? 0.16 : 0.3}
            depthWrite={false}
            toneMapped={false}
            side={THREE.DoubleSide}
            polygonOffset
            polygonOffsetFactor={-3}
            polygonOffsetUnits={-3}
          />
        </mesh>
      </group>
    </group>
  );
}

/**
 * A buildable road edge: a glowing strip draped along the ground, with a hit
 * box tilted to follow the slope between its two corners.
 */
export function EdgeMarker({
  id,
  a,
  b,
  state,
  enabled,
  onClick,
  onHover,
}: {
  id: string;
  a: { x: number; z: number };
  b: { x: number; z: number };
  state: MarkerState;
  enabled: boolean;
  onClick: () => void;
  onHover: (id: string | null) => void;
}) {
  const surface = useSurfaceHeight();
  const handlers = usePlacementClick(enabled, onClick);
  const color = markerColor('settle', state);

  const { geometry, hit } = useMemo(() => {
    // Leave the corners free so the strip never covers the anchor marker.
    const inset = 0.12;
    const start = { x: a.x + (b.x - a.x) * inset, z: a.z + (b.z - a.z) * inset };
    const end = { x: b.x + (a.x - b.x) * inset, z: b.z + (a.z - b.z) * inset };
    const width = state === 'idle' ? 0.05 : 0.065;
    const ribbon = buildDrapedRibbon([[start, end]], surface, width, EDGE_LIFT, 0.04);
    const ya = surface.sampleHeight(a.x, a.z);
    const yb = surface.sampleHeight(b.x, b.z);
    const length = Math.hypot(b.x - a.x, b.z - a.z);
    return {
      geometry: ribbon,
      hit: {
        x: (a.x + b.x) / 2,
        y: (ya + yb) / 2 + EDGE_LIFT + 0.02,
        z: (a.z + b.z) / 2,
        yaw: Math.atan2(b.x - a.x, b.z - a.z),
        pitch: Math.atan2(yb - ya, length),
        length: length * 0.8,
      },
    };
  }, [a.x, a.z, b.x, b.z, state, surface]);
  useEffect(() => () => geometry.dispose(), [geometry]);

  return (
    <group>
      <group position={[hit.x, hit.y, hit.z]} rotation={[0, hit.yaw, 0]}>
        <mesh
          rotation={[-hit.pitch, 0, 0]}
          visible={false}
          userData={{ kind: 'edge', id }}
          {...handlers}
          {...hoverHandlers(id, onHover)}
        >
          <boxGeometry args={[HIT_EDGE_W, 0.16, hit.length]} />
          <meshBasicMaterial />
        </mesh>
      </group>
      <mesh geometry={geometry} raycast={noopRaycast} renderOrder={7}>
        <meshBasicMaterial
          color={color}
          transparent
          opacity={state === 'idle' ? 0.88 : 1}
          depthWrite={false}
          toneMapped={false}
          side={THREE.DoubleSide}
          polygonOffset
          polygonOffsetFactor={-6}
          polygonOffsetUnits={-6}
        />
      </mesh>
    </group>
  );
}

/** Flat ring on the ground — anchor of the road being placed, or an owner's corner. */
export function GroundRing({
  x,
  z,
  color,
  inner = 0.14,
  outer = 0.19,
  opacity = 0.8,
  peg = false,
}: {
  x: number;
  z: number;
  color: string;
  inner?: number;
  outer?: number;
  opacity?: number;
  /** Small owner peg where no building stands yet. */
  peg?: boolean;
}) {
  const sample = useSurfaceY();
  const y = sample(x, z, 0.014);
  return (
    <group position={[x, y, z]}>
      {peg && (
        <mesh position={[0, 0.04, 0]} raycast={noopRaycast} castShadow>
          <cylinderGeometry args={[0.1, 0.11, 0.08, 20]} />
          <meshStandardMaterial color={color} roughness={0.7} metalness={0.05} />
        </mesh>
      )}
      <mesh rotation={[-Math.PI / 2, 0, 0]} raycast={noopRaycast} renderOrder={6}>
        <ringGeometry args={[inner, outer, 32]} />
        <meshBasicMaterial
          color={color}
          transparent
          opacity={opacity}
          depthWrite={false}
          toneMapped={false}
          side={THREE.DoubleSide}
          polygonOffset
          polygonOffsetFactor={-4}
          polygonOffsetUnits={-4}
        />
      </mesh>
    </group>
  );
}

import { useFrame } from '@react-three/fiber';
import { Billboard } from '@react-three/drei';
import { useMemo, useRef } from 'react';
import * as THREE from 'three';
import type { Group } from 'three';
import type { GameState } from '@catanx/engine';
import { useAmbientAnimation } from '../fx/AmbientAnimationContext';
import { HEX_SLAB_THICKNESS } from '../utils/createHexGeometry';
import { useSurfaceHeight } from '../terrain/SurfaceHeightContext';
import { cubeToWorld, HEX_WORLD_RADIUS } from '../utils/hexToWorld';
import {
  EVENT_MARKER_COLOR,
  eventMarkerKind,
  type EventMarkerKind,
} from '../utils/eventMarkerKind';

interface EventMarkers3DProps {
  gameState: GameState;
  animate?: boolean;
}

const labelMatCache = new Map<string, THREE.SpriteMaterial>();
const ringMatCache = new Map<string, THREE.LineBasicMaterial>();

/** Proper LineSegments hex ring (pairs), not a continuous Line polyline. */
function createEventHexRing(radius: number): THREE.BufferGeometry {
  const positions: number[] = [];
  for (let i = 0; i < 6; i++) {
    const a0 = (Math.PI / 180) * (60 * i - 30);
    const a1 = (Math.PI / 180) * (60 * ((i + 1) % 6) - 30);
    const r = radius * 0.98;
    positions.push(
      r * Math.cos(a0),
      0,
      r * Math.sin(a0),
      r * Math.cos(a1),
      0,
      r * Math.sin(a1),
    );
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  return g;
}

const sharedRing = createEventHexRing(HEX_WORLD_RADIUS * 0.62);

function ringMaterial(tint: string): THREE.LineBasicMaterial {
  const cached = ringMatCache.get(tint);
  if (cached) return cached;
  const mat = new THREE.LineBasicMaterial({
    color: tint,
    transparent: true,
    opacity: 0.5,
    depthWrite: false,
  });
  ringMatCache.set(tint, mat);
  return mat;
}

function labelMaterial(kind: EventMarkerKind, tint: string): THREE.SpriteMaterial {
  const key = `${kind}|${tint}`;
  const cached = labelMatCache.get(key);
  if (cached) return cached;

  const size = 96;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  ctx.clearRect(0, 0, size, size);
  ctx.fillStyle = 'rgba(26, 21, 32, 0.75)';
  ctx.beginPath();
  ctx.arc(size / 2, size / 2, size * 0.38, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = tint;
  ctx.lineWidth = 5;
  ctx.stroke();
  ctx.fillStyle = '#f5efe4';
  ctx.font = `bold ${kind === 'generic' ? 52 : 36}px Georgia, "Times New Roman", serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(kind === 'generic' ? '!' : '●', size / 2, size / 2 + 2);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const mat = new THREE.SpriteMaterial({
    map: texture,
    transparent: true,
    depthTest: false,
    depthWrite: false,
  });
  labelMatCache.set(key, mat);
  return mat;
}

function EventMarker({
  x,
  z,
  kind,
  animate,
}: {
  x: number;
  z: number;
  kind: EventMarkerKind;
  animate: boolean;
}) {
  const gem = useRef<Group>(null);
  const washRef = useRef<THREE.MeshBasicMaterial>(null);
  const phase = useMemo(() => Math.random() * Math.PI * 2, []);
  const color = EVENT_MARKER_COLOR[kind];
  const ambient = useAmbientAnimation();
  const surface = useSurfaceHeight();
  const ground = Math.max(surface.sampleHeight(x, z), HEX_SLAB_THICKNESS);
  const groundY = ground + 0.035;
  const gemY = ground + 0.38;

  useFrame(() => {
    if (!gem.current) return;
    if (!animate || !ambient.enabled) {
      gem.current.position.y = gemY;
      if (washRef.current) washRef.current.opacity = 0.16;
      return;
    }
    const pulse = 0.5 + 0.5 * Math.sin(ambient.time * 2.2 + phase);
    gem.current.position.y = gemY + Math.sin(ambient.time * 2.2 + phase) * 0.04;
    if (washRef.current) washRef.current.opacity = 0.1 + pulse * 0.12;
  });

  return (
    <group position={[x, 0, z]}>
      {/* Ground FX stays planted — only the gem bobs. */}
      <mesh
        position={[0, groundY, 0]}
        rotation={[-Math.PI / 2, 0, 0]}
        raycast={() => undefined}
        renderOrder={2}
      >
        <circleGeometry args={[HEX_WORLD_RADIUS * 0.48, 6]} />
        <meshBasicMaterial
          ref={washRef}
          color={color}
          transparent
          opacity={0.16}
          depthWrite={false}
        />
      </mesh>
      <lineSegments
        geometry={sharedRing}
        position={[0, groundY + 0.01, 0]}
        material={ringMaterial(color)}
        raycast={() => undefined}
        renderOrder={2}
      />
      <group ref={gem} position={[0, gemY, 0]}>
        <mesh raycast={() => undefined}>
          <octahedronGeometry args={[0.09, 0]} />
          <meshStandardMaterial
            color={color}
            emissive={color}
            emissiveIntensity={0.45}
            roughness={0.45}
            metalness={0.12}
            flatShading
            transparent
            opacity={0.94}
          />
        </mesh>
        <Billboard follow position={[0, 0.18, 0]}>
          <sprite
            scale={[0.26, 0.26, 1]}
            material={labelMaterial(kind, color)}
            raycast={() => undefined}
          />
        </Billboard>
      </group>
    </group>
  );
}

/**
 * Persistent localized event markers on target tiles (fallback: generic !).
 * H6 polish: ground wash + hex ring stay on the slab; gem bobs independently.
 */
export function EventMarkers3D({ gameState, animate = true }: EventMarkers3DProps) {
  const markers = useMemo(() => {
    if (!gameState.config.enableEvents) return [];
    const out: Array<{ key: string; x: number; z: number; kind: EventMarkerKind }> = [];

    for (const event of gameState.activeEvents) {
      const kind = eventMarkerKind(event);
      const tiles = event.targetTiles?.length ? event.targetTiles : [];
      if (tiles.length === 0) continue;
      for (const tileId of tiles.slice(0, 4)) {
        const tile = gameState.map.get(tileId);
        if (!tile) continue;
        const c = cubeToWorld(tile.coord);
        out.push({
          key: `${event.id}-${tileId}`,
          x: c.x,
          z: c.z,
          kind,
        });
      }
    }
    return out;
  }, [gameState.activeEvents, gameState.config.enableEvents, gameState.map]);

  if (markers.length === 0) return null;

  return (
    <group>
      {markers.map((m) => (
        <EventMarker key={m.key} x={m.x} z={m.z} kind={m.kind} animate={animate} />
      ))}
    </group>
  );
}

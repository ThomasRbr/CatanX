import { useMemo } from 'react';
import * as THREE from 'three';
import type { GameState, PortType } from '@catanx/engine';
import { hexNeighbor, hexToId, normalizePortType } from '@catanx/engine';
import { useVisualGeometry } from '../assets/usePremiumGlb';
import { HEX_SLAB_THICKNESS } from '../utils/createHexGeometry';
import { cubeToWorld, HEX_WORLD_RADIUS } from '../utils/hexToWorld';
import { edgeOffset, radialRotationY } from '../utils/hexEdges';
import { findSeaDirection } from '../utils/seaDirection';
import { isWaterTerrain } from '../decorations/deterministicDecoration';

interface Ports3DProps {
  gameState: GameState;
}

const PORT_COLOR: Partial<Record<PortType, string>> = {
  'generic_3:1': '#c4b896',
  'wood_2:1': '#4a6b40',
  'ore_2:1': '#6a6e74',
  'wheat_2:1': '#c4a85a',
  'sheep_2:1': '#8aab6a',
  'clay_2:1': '#a4744a',
};

const PORT_LABEL: Partial<Record<PortType, string>> = {
  'generic_3:1': 'TOUTES · 3:1',
  'wood_2:1': 'BOIS · 2:1',
  'ore_2:1': 'MINERAI · 2:1',
  'wheat_2:1': 'BLÉ · 2:1',
  'sheep_2:1': 'LAINE · 2:1',
  'clay_2:1': 'ARGILE · 2:1',
};

const labelMatCache = new Map<string, THREE.SpriteMaterial>();

/**
 * Port sign: a small parchment pill in the same material language as the
 * production chits, instead of the large navy UI plaque that floated over the
 * coast like a tooltip. The resource colour survives as a stripe and border.
 */
function labelMaterial(text: string, tint: string): THREE.SpriteMaterial {
  const key = `${text}|${tint}`;
  const cached = labelMatCache.get(key);
  if (cached) return cached;

  const width = 256;
  const height = 112;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d')!;
  ctx.clearRect(0, 0, width, height);
  ctx.shadowColor = 'rgba(20, 14, 6, 0.38)';
  ctx.shadowBlur = 10;
  ctx.shadowOffsetY = 3;
  const paper = ctx.createLinearGradient(0, 14, 0, 98);
  paper.addColorStop(0, '#fbf4e0');
  paper.addColorStop(1, '#e8dab6');
  ctx.fillStyle = paper;
  ctx.beginPath();
  ctx.roundRect(10, 14, width - 20, 80, 40);
  ctx.fill();
  ctx.shadowColor = 'transparent';
  ctx.lineWidth = 5;
  ctx.strokeStyle = tint;
  ctx.stroke();
  // Resource swatch.
  ctx.fillStyle = tint;
  ctx.beginPath();
  ctx.arc(52, 54, 22, 0, Math.PI * 2);
  ctx.fill();
  ctx.lineWidth = 3;
  ctx.strokeStyle = 'rgba(43, 33, 23, 0.35)';
  ctx.stroke();
  const [resource = text, ratio = ''] = text.split(' · ');
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#2b2117';
  ctx.font = `700 ${resource.length > 6 ? 30 : 34}px "Book Antiqua", "Palatino Linotype", Georgia, serif`;
  ctx.fillText(resource, 84, 40);
  ctx.fillStyle = '#8a5412';
  ctx.font = '700 36px "Book Antiqua", "Palatino Linotype", Georgia, serif';
  ctx.fillText(ratio, 84, 74);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  const mat = new THREE.SpriteMaterial({
    map: texture,
    transparent: true,
    depthTest: false,
    depthWrite: false,
    toneMapped: false,
  });
  labelMatCache.set(key, mat);
  return mat;
}


function PortDock({ color, label, variant }: { color: string; label: string; variant: number }) {
  const dockGeo = useVisualGeometry(variant % 2 === 0 ? 'dock_a' : 'dock_b');
  const warehouseGeo = useVisualGeometry('warehouse_a');
  const crateGeo = useVisualGeometry('crate_a');
  const barrelGeo = useVisualGeometry('barrel_a');

  return (
    <group scale={[1.12, 1.08, 1.12]}>
      <mesh geometry={dockGeo} castShadow receiveShadow raycast={() => undefined}>
        <meshPhysicalMaterial
          color="#ffffff"
          vertexColors
          roughness={0.58}
          metalness={0.06}
          clearcoat={0.22}
          clearcoatRoughness={0.42}
          flatShading={false}
        />
      </mesh>
      {/* Warehouse inland (local −Z faces land with radialRotationY). */}
      <mesh
        geometry={warehouseGeo}
        position={[0.01, 0, -0.18]}
        scale={[0.62, 0.62, 0.62]}
        rotation={[0, 0.08, 0]}
        castShadow
        receiveShadow
        raycast={() => undefined}
      >
        <meshPhysicalMaterial
          color="#ffffff"
          vertexColors
          roughness={0.6}
          metalness={0.06}
          clearcoat={0.2}
          clearcoatRoughness={0.44}
          flatShading={false}
        />
      </mesh>
      <mesh
        geometry={crateGeo}
        position={[0.09, 0, 0.04]}
        scale={[0.36, 0.36, 0.36]}
        rotation={[0, 0.35, 0]}
        castShadow
        raycast={() => undefined}
      >
        <meshPhysicalMaterial
          color={color}
          vertexColors
          roughness={0.5}
          metalness={0.08}
          clearcoat={0.32}
          clearcoatRoughness={0.4}
          flatShading={false}
        />
      </mesh>
      <mesh
        geometry={barrelGeo}
        position={[-0.08, 0, 0.05]}
        scale={[0.34, 0.34, 0.34]}
        castShadow
        raycast={() => undefined}
      >
        <meshPhysicalMaterial
          color={color}
          vertexColors
          roughness={0.5}
          metalness={0.08}
          clearcoat={0.32}
          clearcoatRoughness={0.4}
          flatShading={false}
        />
      </mesh>
      <mesh position={[0, 0.12, 0.16]} castShadow raycast={() => undefined}>
        <boxGeometry args={[0.09, 0.04, 0.016]} />
        <meshStandardMaterial color={color} roughness={0.8} metalness={0.05} flatShading={false} />
      </mesh>
      <sprite
        position={[0, 0.34, 0.18]}
        scale={[0.6, 0.26, 1]}
        material={labelMaterial(label, color)}
        raycast={() => undefined}
        renderOrder={4}
      />
    </group>
  );
}

/** Coastal docks with warehouse + cargo (H5 commerce). */
export function Ports3D({ gameState }: Ports3DProps) {
  const ports = useMemo(() => {
    const out: Array<{
      key: string;
      x: number;
      y: number;
      z: number;
      rot: number;
      color: string;
      label: string;
      variant: number;
    }> = [];

    let i = 0;
    for (const tile of gameState.map.values()) {
      const port = normalizePortType(tile.port);
      if (!port) continue;
      let anchor = tile;
      let dir = findSeaDirection(tile.coord, gameState.map);

      // Classic maps may store a port on the coastal water cell. Anchor the
      // miniature dock to the adjacent land edge so it never floats detached.
      if (isWaterTerrain(tile.terrain)) {
        for (let landDir = 0; landDir < 6; landDir++) {
          const candidateCoord = hexNeighbor(tile.coord, landDir as 0 | 1 | 2 | 3 | 4 | 5);
          const candidate = gameState.map.get(hexToId(candidateCoord));
          if (!candidate || isWaterTerrain(candidate.terrain)) continue;
          anchor = candidate;
          dir = (landDir + 3) % 6;
          break;
        }
      }

      const origin = cubeToWorld(anchor.coord);
      const off = edgeOffset(dir, HEX_WORLD_RADIUS * 0.9);
      out.push({
        key: tile.id,
        x: origin.x + off.x,
        y: HEX_SLAB_THICKNESS + 0.035,
        z: origin.z + off.z,
        rot: radialRotationY(dir),
        color: PORT_COLOR[port] ?? '#c4b896',
        label: PORT_LABEL[port] ?? 'TOUTES · 3:1',
        variant: i++,
      });
    }
    return out;
  }, [gameState.map]);

  if (ports.length === 0) return null;

  return (
    <group>
      {ports.map((p) => (
        <group key={p.key} position={[p.x, p.y, p.z]} rotation={[0, p.rot, 0]}>
          <PortDock color={p.color} label={p.label} variant={p.variant} />
        </group>
      ))}
    </group>
  );
}

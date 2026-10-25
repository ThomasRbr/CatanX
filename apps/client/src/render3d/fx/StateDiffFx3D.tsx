import { useCallback, useEffect, useRef, useState } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import type { CatanTopology, GameState } from '@catanx/engine';
import { hexToId } from '@catanx/engine';
import { eventMarkerKind } from '../utils/eventMarkerKind';
import { climateParticleKind } from '../utils/seasonVisuals';
import { HEX_SLAB_THICKNESS } from '../utils/createHexGeometry';
import { useSurfaceHeight } from '../terrain/SurfaceHeightContext';
import { cubeToWorld } from '../utils/hexToWorld';
import { playerColor } from '../utils/playerColors';
import { collectEdgeRoads } from '../utils/resolveRoads';
import { intersectionToWorld } from '../utils/topologyToWorld';
import { buildBarbarianCoastRoute } from '../entities/barbarianCoastRoute';

interface StateDiffFx3DProps {
  gameState: GameState;
  topology: CatanTopology;
  enabled: boolean;
}

type BurstKind =
  | 'move'
  | 'combat'
  | 'death'
  | 'build'
  | 'road'
  | 'fire'
  | 'snow'
  | 'rain'
  | 'mist'
  | 'gold'
  | 'ruins'
  | 'sacred'
  | 'ckShip'
  | 'ckInvasion';

interface Burst {
  id: number;
  kind: BurstKind;
  x: number;
  y: number;
  z: number;
  color: string;
  born: number;
  life: number;
  /** Optional second point for move / road trails */
  tx?: number;
  tz?: number;
}

const BURST_COLOR: Record<BurstKind, string> = {
  move: '#f6d587',
  combat: '#e16047',
  death: '#6a3040',
  build: '#7bd389',
  road: '#c4a574',
  fire: '#e07040',
  snow: '#c8d8f0',
  rain: '#4a8ab8',
  mist: '#8a90a0',
  gold: '#d4a84a',
  ruins: '#b89870',
  sacred: '#b090d0',
  ckShip: '#ff6b5f',
  ckInvasion: '#ffcd4a',
};

function resourceBurstColor(label: string | undefined): string {
  const normalized = label?.toLocaleLowerCase('fr') ?? '';
  if (normalized.includes('bois')) return '#57c785';
  if (normalized.includes('argile')) return '#ff765f';
  if (normalized.includes('blé') || normalized.includes('ble')) return '#ffcd4a';
  if (normalized.includes('laine') || normalized.includes('mouton')) return '#c9eca9';
  if (normalized.includes('minerai')) return '#8aa8c2';
  return BURST_COLOR.gold;
}

let nextBurstId = 1;

function buildingWorldXZ(
  building: {
    tileId: string;
    placementKind?: 'tile' | 'intersection';
    placementIntersectionId?: string;
  },
  gameState: GameState,
  topology: CatanTopology,
): { x: number; z: number } | null {
  if (building.placementKind === 'intersection' && building.placementIntersectionId) {
    const intersection = topology.intersections[building.placementIntersectionId];
    if (intersection) {
      const w = intersectionToWorld(intersection, HEX_SLAB_THICKNESS + 0.02);
      return { x: w.x, z: w.z };
    }
  }
  const tile = gameState.map.get(building.tileId);
  if (!tile) return null;
  const c = cubeToWorld(tile.coord);
  return { x: c.x, z: c.z };
}

function BurstMesh({ burst }: { burst: Burst }) {
  const meshRef = useRef<THREE.Mesh>(null);
  const matRef = useRef<THREE.MeshBasicMaterial>(null);
  const trailRef = useRef<THREE.Mesh>(null);
  const trailMatRef = useRef<THREE.MeshBasicMaterial>(null);
  const ringRef = useRef<THREE.Mesh>(null);
  const ringMatRef = useRef<THREE.MeshBasicMaterial>(null);

  const hasTrail = burst.tx != null && burst.tz != null;
  const trailLen = hasTrail ? Math.hypot(burst.tx! - burst.x, burst.tz! - burst.z) : 0;
  const trailYaw = hasTrail ? Math.atan2(burst.tx! - burst.x, burst.tz! - burst.z) : 0;

  useFrame(() => {
    const age = (performance.now() - burst.born) / 1000;
    const t = Math.min(1, age / burst.life);
    const rise = burst.kind === 'gold' ? t * 0.75 : burst.kind === 'road' ? t * 0.12 : t * 0.42;
    const scale =
      burst.kind === 'death'
        ? 0.5 + t * 1.8
        : burst.kind === 'road'
          ? 0.22 + t * 0.45
          : burst.kind === 'build'
            ? 0.3 + t * 1.1
            : 0.35 + t * 1.35;
    const opacity =
      (1 - t) *
      (burst.kind === 'build' || burst.kind === 'road'
        ? 0.88
        : burst.kind === 'gold'
          ? 0.92
          : 0.75);
    const mesh = meshRef.current;
    const mat = matRef.current;
    if (mesh && mat) {
      mesh.position.y = burst.y + rise;
      mesh.scale.set(scale, scale * 0.65, scale);
      mat.opacity = opacity;
    }

    if (burst.kind === 'build' && ringRef.current && ringMatRef.current) {
      const rs = 0.4 + t * 1.6;
      ringRef.current.scale.set(rs, 1, rs);
      ringMatRef.current.opacity = (1 - t) * 0.55;
    }

    if (hasTrail && trailRef.current && trailMatRef.current && trailLen > 0.05) {
      const grow = burst.kind === 'road' ? Math.min(1, t * 1.25) : Math.max(0.15, 1 - t * 0.35);
      const mx = burst.x + (burst.tx! - burst.x) * (grow * 0.5);
      const mz = burst.z + (burst.tz! - burst.z) * (grow * 0.5);
      trailRef.current.position.set(mx, burst.y, mz);
      trailRef.current.scale.set(1, 1, Math.max(0.04, grow));
      trailMatRef.current.opacity = opacity * (burst.kind === 'road' ? 0.75 : 0.55);
    }
  });

  return (
    <group>
      <mesh
        ref={meshRef}
        position={[burst.x, burst.y, burst.z]}
        raycast={() => undefined}
        renderOrder={20}
      >
        <sphereGeometry args={[0.12, 8, 6]} />
        <meshBasicMaterial
          ref={matRef}
          color={burst.color}
          transparent
          opacity={0.75}
          depthWrite={false}
        />
      </mesh>
      {burst.kind === 'build' && (
        <mesh
          ref={ringRef}
          position={[burst.x, burst.y - 0.08, burst.z]}
          rotation={[-Math.PI / 2, 0, 0]}
          raycast={() => undefined}
          renderOrder={19}
        >
          <ringGeometry args={[0.08, 0.14, 20]} />
          <meshBasicMaterial
            ref={ringMatRef}
            color={burst.color}
            transparent
            opacity={0.5}
            depthWrite={false}
            side={THREE.DoubleSide}
          />
        </mesh>
      )}
      {hasTrail && trailLen > 0.05 && (
        <mesh
          ref={trailRef}
          position={[burst.x, burst.y, burst.z]}
          rotation={[0, trailYaw, 0]}
          raycast={() => undefined}
          renderOrder={19}
        >
          <boxGeometry args={[0.07, 0.045, trailLen]} />
          <meshBasicMaterial
            ref={trailMatRef}
            color={burst.color}
            transparent
            opacity={0.45}
            depthWrite={false}
          />
        </mesh>
      )}
    </group>
  );
}

/**
 * Short FX from GameState diffs + window bridge (Pixi AnimationManager parity).
 * H4: build at intersection, road draw trail, production float.
 */
export function StateDiffFx3D({ gameState, topology, enabled }: StateDiffFx3DProps) {
  const [bursts, setBursts] = useState<Burst[]>([]);
  const surface = useSurfaceHeight();
  const burstsRef = useRef(bursts);

  const baseline = useRef(false);
  const prevGameId = useRef<string | null>(null);
  const prevUnits = useRef(new Map<string, { tileId: string; hp: number }>());
  const prevBuildings = useRef(new Map<string, string>());
  const prevRoads = useRef(new Set<string>());
  const prevEvents = useRef(new Set<string>());
  const prevSeason = useRef<string | null>(null);
  const prevCkShipPosition = useRef<number | null>(null);
  const prevCkInvasionToken = useRef<string | null>(null);
  const gameStateRef = useRef(gameState);
  const topologyRef = useRef(topology);

  const { camera, gl } = useThree();
  const cameraRef = useRef(camera);
  const glRef = useRef(gl);

  useEffect(() => {
    burstsRef.current = bursts;
  }, [bursts]);

  useEffect(() => {
    gameStateRef.current = gameState;
  }, [gameState]);

  useEffect(() => {
    topologyRef.current = topology;
  }, [topology]);

  useEffect(() => {
    cameraRef.current = camera;
    glRef.current = gl;
  }, [camera, gl]);

  const pushBurst = useCallback(
    (
      kind: BurstKind,
      x: number,
      z: number,
      color?: string,
      life = 0.7,
      extra?: { tx?: number; tz?: number; y?: number },
    ) => {
      const id = nextBurstId++;
      const born = performance.now();
      setBursts((prev) => [
        ...prev.slice(-20),
        {
          id,
          kind,
          x,
          // Offsets are relative to the old flat slab; lift them onto the relief.
          y:
            (extra?.y ?? HEX_SLAB_THICKNESS + 0.22) +
            Math.max(0, surface.sampleHeight(x, z) - HEX_SLAB_THICKNESS),
          z,
          color: color ?? BURST_COLOR[kind],
          born,
          life,
          tx: extra?.tx,
          tz: extra?.tz,
        },
      ]);
    },
    [surface],
  );

  // Prune expired bursts (membership only — animation is per-mesh useFrame)
  useFrame(() => {
    const now = performance.now();
    const cur = burstsRef.current;
    if (cur.length === 0) return;
    if (cur.every((b) => (now - b.born) / 1000 < b.life)) return;
    setBursts((prev) => prev.filter((b) => (now - b.born) / 1000 < b.life));
  });

  useEffect(() => {
    if (!enabled) {
      setBursts([]);
      return;
    }

    if (prevGameId.current !== gameState.id) {
      prevGameId.current = gameState.id;
      baseline.current = false;
      prevUnits.current = new Map();
      prevBuildings.current = new Map();
      prevRoads.current = new Set();
      prevEvents.current = new Set();
      prevSeason.current = null;
      prevCkShipPosition.current = null;
      prevCkInvasionToken.current = null;
      setBursts([]);
    }

    if (!baseline.current) {
      const units = new Map<string, { tileId: string; hp: number }>();
      for (const [id, unit] of gameState.units) {
        units.set(id, { tileId: hexToId(unit.position), hp: unit.stats.currentHealth });
      }
      prevUnits.current = units;
      prevBuildings.current = new Map(
        [...gameState.buildings.entries()].map(([id, b]) => [id, b.definitionId]),
      );
      prevRoads.current = new Set(Object.keys(collectEdgeRoads(gameState)));
      prevEvents.current = new Set(gameState.activeEvents.map((e) => e.id));
      prevSeason.current = gameState.season;
      const ck = gameState.extensions?.citiesKnights;
      prevCkShipPosition.current = ck?.barbarianTrackPosition ?? null;
      prevCkInvasionToken.current = ck?.lastInvasionResult
        ? `${ck.lastInvasionResult.turn}-${ck.lastInvasionResult.outcome}`
        : null;
      baseline.current = true;
      return;
    }

    const nextUnits = new Map<string, { tileId: string; hp: number }>();
    for (const [id, unit] of gameState.units) {
      const tileId = hexToId(unit.position);
      nextUnits.set(id, { tileId, hp: unit.stats.currentHealth });
      const prev = prevUnits.current.get(id);
      if (!prev) continue;

      if (prev.tileId !== tileId) {
        const fromTile = gameState.map.get(prev.tileId);
        const toTile = gameState.map.get(tileId);
        if (fromTile && toTile) {
          const from = cubeToWorld(fromTile.coord);
          const to = cubeToWorld(toTile.coord);
          const player = gameState.players.get(unit.ownerId);
          pushBurst('move', to.x, to.z, playerColor(player?.color), 0.55, {
            tx: from.x,
            tz: from.z,
          });
        }
      }
      if (unit.stats.currentHealth < prev.hp) {
        const tile = gameState.map.get(tileId);
        if (tile) {
          const c = cubeToWorld(tile.coord);
          pushBurst('combat', c.x, c.z);
        }
      }
    }

    for (const [id, prev] of prevUnits.current) {
      if (nextUnits.has(id)) continue;
      const tile = gameState.map.get(prev.tileId);
      if (!tile) continue;
      const c = cubeToWorld(tile.coord);
      pushBurst('death', c.x, c.z, undefined, 0.85);
    }
    prevUnits.current = nextUnits;

    const nextBuildings = new Map<string, string>();
    for (const [id, building] of gameState.buildings) {
      nextBuildings.set(id, building.definitionId);
      const prevDef = prevBuildings.current.get(id);
      if (prevDef === building.definitionId) continue;
      const pos = buildingWorldXZ(building, gameState, topology);
      if (!pos) continue;
      // New build or upgrade (settlement → city).
      pushBurst('build', pos.x, pos.z, undefined, prevDef ? 0.55 : 0.7);
    }
    prevBuildings.current = nextBuildings;

    const edgeRoads = collectEdgeRoads(gameState);
    const nextRoads = new Set(Object.keys(edgeRoads));
    for (const edgeId of nextRoads) {
      if (prevRoads.current.has(edgeId)) continue;
      const edge = topology.edges[edgeId];
      if (!edge) continue;
      const a = topology.intersections[edge.a];
      const b = topology.intersections[edge.b];
      if (!a || !b) continue;
      const wa = intersectionToWorld(a);
      const wb = intersectionToWorld(b);
      const ownerId = edgeRoads[edgeId];
      const player = ownerId ? gameState.players.get(ownerId) : undefined;
      pushBurst('road', wa.x, wa.z, playerColor(player?.color), 0.75, {
        tx: wb.x,
        tz: wb.z,
        y: HEX_SLAB_THICKNESS + 0.08,
      });
    }
    prevRoads.current = nextRoads;

    for (const event of gameState.activeEvents) {
      if (prevEvents.current.has(event.id)) continue;
      const kind = eventMarkerKind(event);
      const tileId = event.targetTiles?.[0];
      const tile = tileId ? gameState.map.get(tileId) : null;
      const c = tile ? cubeToWorld(tile.coord) : { x: 0, z: 0 };
      pushBurst(kind === 'generic' ? 'build' : kind, c.x, c.z, undefined, 1.0);
    }
    prevEvents.current = new Set(gameState.activeEvents.map((e) => e.id));

    const ck = gameState.extensions?.citiesKnights;
    if (ck) {
      const centers = [...gameState.map.values()].map((tile) => cubeToWorld(tile.coord));
      const route = buildBarbarianCoastRoute(centers, ck.barbarianTrackLength, 0.78);
      const previousPosition = prevCkShipPosition.current;
      if (previousPosition !== null && ck.barbarianTrackPosition > previousPosition) {
        const current = route[Math.min(ck.barbarianTrackPosition, route.length - 1)];
        const previous = route[Math.min(previousPosition, route.length - 1)];
        if (current) {
          pushBurst('ckShip', current.x, current.z, undefined, 1.05, {
            tx: previous?.x,
            tz: previous?.z,
            y: HEX_SLAB_THICKNESS + 0.34,
          });
        }
      }
      prevCkShipPosition.current = ck.barbarianTrackPosition;

      const invasionToken = ck.lastInvasionResult
        ? `${ck.lastInvasionResult.turn}-${ck.lastInvasionResult.outcome}`
        : null;
      if (invasionToken && invasionToken !== prevCkInvasionToken.current) {
        const center = centers.reduce(
          (sum, point) => ({
            x: sum.x + point.x / centers.length,
            z: sum.z + point.z / centers.length,
          }),
          { x: 0, z: 0 },
        );
        const color = ck.lastInvasionResult?.outcome === 'defenders_win' ? '#1fc8c4' : '#ff6b5f';
        pushBurst('ckInvasion', center.x, center.z, color, 1.35);
        for (let index = 0; index < 5; index++) {
          const angle = (index / 5) * Math.PI * 2;
          pushBurst(
            'ckInvasion',
            center.x + Math.cos(angle) * 1.9,
            center.z + Math.sin(angle) * 1.9,
            color,
            0.95 + index * 0.06,
          );
        }
      }
      prevCkInvasionToken.current = invasionToken;
    }

    // Track season for baseline; burst only via catanx:season-transition (Pixi parity)
    if (prevSeason.current !== gameState.season) {
      prevSeason.current = gameState.season;
    }
  }, [enabled, gameState, topology, pushBurst]);

  useEffect(() => {
    if (!enabled) return;

    const onPulse = (ev: Event) => {
      const detail = (ev as CustomEvent<{ tileId?: string }>).detail;
      const tile = detail?.tileId ? gameStateRef.current.map.get(detail.tileId) : null;
      if (!tile) return;
      const c = cubeToWorld(tile.coord);
      pushBurst('build', c.x, c.z, '#7bd389', 0.5);
    };

    const onCombat = (ev: Event) => {
      const detail = (ev as CustomEvent<{ attackerId?: string; defenderId?: string }>).detail;
      const state = gameStateRef.current;
      const attacker = detail?.attackerId ? state.units.get(detail.attackerId) : null;
      const defender = detail?.defenderId ? state.units.get(detail.defenderId) : null;
      if (attacker) {
        const c = cubeToWorld(attacker.position);
        pushBurst('combat', c.x, c.z);
      }
      if (defender) {
        const c = cubeToWorld(defender.position);
        pushBurst('combat', c.x, c.z);
      }
    };

    const onResource = (ev: Event) => {
      const detail = (
        ev as CustomEvent<{ label?: string; from?: { x: number; y: number }; tileId?: string }>
      ).detail;
      const color = resourceBurstColor(detail?.label);
      if (detail?.tileId) {
        const tile = gameStateRef.current.map.get(detail.tileId);
        if (tile) {
          const c = cubeToWorld(tile.coord);
          pushBurst('gold', c.x, c.z, color, 0.7);
          return;
        }
      }
      const from = detail?.from;
      if (!from) {
        pushBurst('gold', 0, 0, color, 0.55);
        return;
      }
      const cam = cameraRef.current;
      const canvas = glRef.current.domElement;
      const rect = canvas.getBoundingClientRect();
      const ndcX = ((from.x - rect.left) / Math.max(1, rect.width)) * 2 - 1;
      const ndcY = -((from.y - rect.top) / Math.max(1, rect.height)) * 2 + 1;
      const vec = new THREE.Vector3(ndcX, ndcY, 0.5).unproject(cam);
      const dir = vec.clone().sub(cam.position).normalize();
      const planeY = HEX_SLAB_THICKNESS;
      const t = Math.abs(dir.y) > 0.001 ? (planeY - cam.position.y) / dir.y : 0;
      const hit = cam.position.clone().add(dir.multiplyScalar(t));
      pushBurst('gold', hit.x, hit.z, color, 0.6);
    };

    const onSeason = (ev: Event) => {
      const detail = (ev as CustomEvent<{ season?: string; climateId?: string | null }>).detail;
      const season = detail?.season ?? gameStateRef.current.season;
      const climateId =
        detail?.climateId ?? gameStateRef.current.extensions?.seasons?.currentClimateId ?? null;
      if (prevSeason.current === season) return;
      prevSeason.current = season;
      pushBurst(climateParticleKind(climateId, season), 0, 0, undefined, 0.9);
    };

    window.addEventListener('catanx:tile-pulse', onPulse);
    window.addEventListener('catanx:combat', onCombat);
    window.addEventListener('catanx:resource-float', onResource);
    window.addEventListener('catanx:season-transition', onSeason);
    return () => {
      window.removeEventListener('catanx:tile-pulse', onPulse);
      window.removeEventListener('catanx:combat', onCombat);
      window.removeEventListener('catanx:resource-float', onResource);
      window.removeEventListener('catanx:season-transition', onSeason);
    };
  }, [enabled, pushBurst]);

  if (!enabled || bursts.length === 0) return null;

  return (
    <group>
      {bursts.map((b) => (
        <BurstMesh key={b.id} burst={b} />
      ))}
    </group>
  );
}

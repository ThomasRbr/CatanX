import { useMemo, useRef, type ReactNode } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import type { GameState, SkyAirship as SkyAirshipState } from '@catanx/engine';
import { resolveAtmosphere } from '../env/atmosphere';
import { HEX_SLAB_THICKNESS } from '../utils/createHexGeometry';
import { cubeToWorld } from '../utils/hexToWorld';
import { playerColor } from '../utils/playerColors';
import { intersectionToWorld, type buildWorldTopology } from '../utils/topologyToWorld';
import { SkyCloudSea, type CloudShadowCaster } from './sky/SkyCloudSea';
import { SkyIsland } from './sky/SkyIsland';
import {
  SkyAirportPier,
  SkyAirship,
  SkyBeacon,
  SkyDestinationRing,
  SkyRouteTrail,
} from './sky/SkyPieces';
import { SkyWindLanes, type WindLane } from './sky/SkyWindLanes';
import { advanceSkyClock, refreshShadowMap, skyClock } from './sky/skyClock';
import { spanMatrix } from './sky/skyGeometry';
import {
  CLOUD_DECK_Y,
  HUB_SCALE,
  ISLAND_RADIUS,
  ISLAND_WORLD_RADIUS,
  laneCurve,
  layoutSkyHubs,
  type HubPlacement,
  type LaneCurve,
} from './sky/skyLayout';

type WorldTopology = ReturnType<typeof buildWorldTopology>;

interface LayerProps {
  gameState: GameState;
  currentPlayerId: string;
  topology: WorldTopology;
  animate: boolean;
}

const noRaycast = () => undefined;

/** World-space slots (polar angle from +X towards +Z), chosen for the camera. */
const BEACON_SLOTS = [112, 66, 150].map((deg) => THREE.MathUtils.degToRad(deg));
const DOCK_SLOTS = [-14, -68, 196].map((deg) => THREE.MathUtils.degToRad(deg));
/** Ships moor nose-in towards their island, broadside to the camera. */
const DOCK_HEADING = -Math.PI * 0.75;
/** Airships are modelled small; this is their size on the board. */
const AIRSHIP_SCALE = 1.4;

function headingFor(direction: THREE.Vector3): number {
  return Math.atan2(-direction.z, direction.x);
}

/** Gentle idle bob shared by an island and everything standing on it. */
function Bobbing({ phase, children }: { phase: number; children: ReactNode }) {
  const ref = useRef<THREE.Group>(null);
  useFrame(() => {
    const group = ref.current;
    if (!group) return;
    const t = skyClock.value;
    group.position.y = Math.sin(t * 0.55 + phase) * 0.035;
    group.rotation.x = Math.sin(t * 0.37 + phase * 1.7) * 0.012;
    group.rotation.z = Math.sin(t * 0.29 + phase * 0.6) * 0.012;
  });
  return <group ref={ref}>{children}</group>;
}

interface LaneEntry {
  id: string;
  source: string;
  sink: string;
  curve: LaneCurve;
}

interface ShipPlacement {
  airship: SkyAirshipState;
  color: string;
  position: THREE.Vector3;
  heading: number;
  rope?: { from: THREE.Vector3; to: THREE.Vector3 };
  trail?: THREE.Vector3[];
  destinationHubId?: string;
}

function sampleTrail(curve: LaneCurve, from: number, to: number, out: THREE.Vector3[]) {
  const span = Math.abs(to - from) * curve.length;
  const beads = Math.max(1, Math.floor(span / 0.13));
  for (let i = 1; i <= beads; i++) {
    const t = from + ((to - from) * i) / (beads + 0.5);
    out.push(curve.curve.getPointAt(THREE.MathUtils.clamp(t, 0, 1)));
  }
}

/** Sky layer of Souterrain & Ciel: "Les Alizés". */
export function SkyLayer3D({ gameState, topology, animate }: LayerProps) {
  const extension = gameState.extensions?.undergroundSky;
  const gl = useThree((state) => state.gl);

  useFrame((_, delta) => {
    if (!animate) return;
    advanceSkyClock(delta);
    // Islands bob and ships sway: keep their shadows attached. The sky set is
    // a few dozen casters, so refreshing the map is cheap compared with the
    // surface board that StaticShadowBake protects.
    refreshShadowMap(gl);
  });

  const grade = useMemo(() => resolveAtmosphere({ layer: 'sky' }), []);

  const hubs = extension ? Object.values(extension.skyGraph.hubs) : [];
  const layoutKey = hubs.map((hub) => `${hub.id}:${hub.anchorTileId ?? '-'}`).join('|');
  const placements = useMemo(
    () => (extension ? layoutSkyHubs(gameState, hubs) : []),
    // Layout depends only on hub ids and anchors; recomputing per action would
    // churn every downstream memo.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [layoutKey],
  );
  const byHub = useMemo(() => new Map(placements.map((p) => [p.hub.id, p])), [placements]);

  const revealedKey = extension ? [...extension.revealedSkyHubIds].sort().join('|') : '';
  const revealed = useMemo(() => new Set(revealedKey ? revealedKey.split('|') : []), [revealedKey]);

  const lanesKey = extension
    ? Object.values(extension.skyGraph.lanes)
        .map((lane) => `${lane.id}:${lane.from}:${lane.to}:${lane.currentDirection}`)
        .join('|')
    : '';
  const laneEntries = useMemo<LaneEntry[]>(() => {
    if (!extension) return [];
    const entries: LaneEntry[] = [];
    for (const lane of Object.values(extension.skyGraph.lanes)) {
      const reverse = lane.currentDirection === 'reverse';
      const source = reverse ? lane.to : lane.from;
      const sink = reverse ? lane.from : lane.to;
      const a = byHub.get(source);
      const b = byHub.get(sink);
      if (!a || !b) continue;
      entries.push({ id: lane.id, source, sink, curve: laneCurve(a.position, b.position, lane.id) });
    }
    return entries;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lanesKey, byHub]);

  const windLanes = useMemo<WindLane[]>(
    () =>
      laneEntries.map((entry) => ({
        id: entry.id,
        curve: entry.curve,
        strength: revealed.has(entry.source) || revealed.has(entry.sink) ? 1 : 0.35,
      })),
    [laneEntries, revealed],
  );

  const center = useMemo(() => {
    const land = [...gameState.map.values()];
    if (!land.length) return new THREE.Vector2();
    let x = 0;
    let z = 0;
    for (const tile of land) {
      const world = cubeToWorld(tile.coord);
      x += world.x;
      z += world.z;
    }
    return new THREE.Vector2(x / land.length, z / land.length);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gameState.map.size]);

  const casters = useMemo<CloudShadowCaster[]>(
    () =>
      placements.map((placement) => ({
        x: placement.position.x,
        z: placement.position.z,
        height: placement.position.y - CLOUD_DECK_Y,
        depth: 0.95,
        radius: ISLAND_WORLD_RADIUS * 1.05,
        strength: revealed.has(placement.hub.id) ? 0.55 : 0.4,
      })),
    [placements, revealed],
  );

  if (!extension) return null;

  // --- Airport piers: above the airport, nudged clear of any island --------
  const piers = new Map<string, { position: THREE.Vector3; color: string }>();
  for (const airport of extension.airports) {
    const point = topology.intersections[airport.intersectionId];
    if (!point) continue;
    const world = intersectionToWorld(point, HEX_SLAB_THICKNESS + 0.85);
    const position = new THREE.Vector3(world.x, world.y, world.z);
    for (let pass = 0; pass < 6; pass++) {
      for (const placement of placements) {
        const dx = position.x - placement.position.x;
        const dz = position.z - placement.position.z;
        const distance = Math.hypot(dx, dz);
        const clear = ISLAND_WORLD_RADIUS + 0.55;
        if (distance >= clear) continue;
        const nx = distance > 1e-3 ? dx / distance : 1;
        const nz = distance > 1e-3 ? dz / distance : 0;
        position.x = placement.position.x + nx * clear;
        position.z = placement.position.z + nz * clear;
      }
    }
    const owner = gameState.players.get(airport.playerId);
    piers.set(airport.id, { position, color: playerColor(owner?.color, '#a889ff') });
  }

  // --- Beacons, grouped by hub --------------------------------------------
  const beaconsByHub = new Map<string, Array<{ id: string; color: string }>>();
  for (const beacon of extension.beacons) {
    const owner = gameState.players.get(beacon.playerId);
    const list = beaconsByHub.get(beacon.hubId) ?? [];
    list.push({ id: beacon.id, color: playerColor(owner?.color, '#a889ff') });
    beaconsByHub.set(beacon.hubId, list);
  }

  // --- Airships ----------------------------------------------------------
  const ships: ShipPlacement[] = [];
  const dockCount = new Map<string, number>();
  const findLane = (a: string, b: string) =>
    laneEntries.find((entry) => (entry.source === a && entry.sink === b) || (entry.source === b && entry.sink === a));
  for (const airship of extension.airships) {
    const owner = gameState.players.get(airship.playerId);
    const color = playerColor(owner?.color, '#dce5ef');
    const route = airship.route;
    if (route && route.pathIndex < route.hubPath.length - 1) {
      const fromId = route.hubPath[route.pathIndex]!;
      const toId = route.hubPath[route.pathIndex + 1]!;
      const lane = findLane(fromId, toId);
      if (lane) {
        const legCost = route.legCosts[route.pathIndex] ?? 0;
        const progress = legCost > 0
          ? THREE.MathUtils.clamp(1 - route.remainingPointsThisLeg / legCost, 0.18, 0.82)
          : 0.5;
        const forward = lane.source === fromId;
        const t = forward ? progress : 1 - progress;
        const position = lane.curve.curve.getPointAt(t).add(new THREE.Vector3(0, 0.22, 0));
        const tangent = lane.curve.curve.getTangentAt(t);
        if (!forward) tangent.negate();
        const trail: THREE.Vector3[] = [];
        sampleTrail(lane.curve, t, forward ? 1 : 0, trail);
        for (let i = route.pathIndex + 1; i < route.hubPath.length - 1; i++) {
          const a = route.hubPath[i]!;
          const b = route.hubPath[i + 1]!;
          const next = findLane(a, b);
          if (!next) continue;
          const along = next.source === a;
          sampleTrail(next.curve, along ? 0 : 1, along ? 1 : 0, trail);
        }
        ships.push({
          airship,
          color,
          position,
          heading: headingFor(tangent),
          trail,
          destinationHubId: route.destinationHubId,
        });
        continue;
      }
    }
    const hubId = route ? route.hubPath[route.pathIndex] : airship.currentHubId;
    const hub = hubId ? byHub.get(hubId) : undefined;
    if (hub && hubId) {
      const slotIndex = dockCount.get(hubId) ?? 0;
      dockCount.set(hubId, slotIndex + 1);
      const angle = DOCK_SLOTS[slotIndex % DOCK_SLOTS.length]!;
      const out = new THREE.Vector3(Math.cos(angle), 0, Math.sin(angle));
      const position = hub.position.clone().addScaledVector(out, ISLAND_WORLD_RADIUS + 0.5).add(new THREE.Vector3(0, 0.36, 0));
      const nose = position
        .clone()
        .add(new THREE.Vector3(Math.cos(DOCK_HEADING), 0, -Math.sin(DOCK_HEADING)).multiplyScalar(0.2 * AIRSHIP_SCALE))
        .add(new THREE.Vector3(0, -0.04 * AIRSHIP_SCALE, 0));
      ships.push({
        airship,
        color,
        position,
        heading: DOCK_HEADING,
        rope: { from: nose, to: hub.position.clone().addScaledVector(out, ISLAND_WORLD_RADIUS * 0.94).add(new THREE.Vector3(0, 0.03, 0)) },
      });
      continue;
    }
    const pier = piers.get(airship.airportId);
    if (pier) {
      const key = `pier:${airship.airportId}`;
      const slotIndex = dockCount.get(key) ?? 0;
      dockCount.set(key, slotIndex + 1);
      const angle = -0.4 - slotIndex * 1.1;
      ships.push({
        airship,
        color,
        position: pier.position.clone().add(new THREE.Vector3(Math.cos(angle) * 0.36, 0.26, Math.sin(angle) * 0.36)),
        heading: DOCK_HEADING,
      });
    }
  }
  const destinations = new Map<string, string>();
  for (const ship of ships) {
    if (ship.destinationHubId) destinations.set(ship.destinationHubId, ship.color);
  }

  return (
    <group>
      <SkyCloudSea grade={grade} center={center} casters={casters} animate={animate} />
      {<SkyWindLanes lanes={windLanes} />}

      {placements.map((placement: HubPlacement) => {
        const hubRevealed = revealed.has(placement.hub.id);
        const beacons = beaconsByHub.get(placement.hub.id) ?? [];
        const destination = destinations.get(placement.hub.id);
        return (
          <group key={placement.hub.id} position={placement.position}>
            <Bobbing phase={placement.phase}>
              <group scale={HUB_SCALE}>
                <SkyIsland
                  seed={placement.seed}
                  site={hubRevealed ? placement.hub.site : null}
                  yaw={Math.PI * 0.25 + (((placement.seed >>> 8) % 1000) / 1000 - 0.5) * 1.0}
                />
                {beacons.map((beacon, index) => {
                  const angle = BEACON_SLOTS[index % BEACON_SLOTS.length]!;
                  const r = ISLAND_RADIUS * 0.6;
                  return (
                    <group key={beacon.id} position={[Math.cos(angle) * r, 0.03, Math.sin(angle) * r]}>
                      {<SkyBeacon color={beacon.color} />}
                    </group>
                  );
                })}
              </group>
            </Bobbing>
            {destination && (
              <group scale={HUB_SCALE}>
                {<SkyDestinationRing color={destination} />}
              </group>
            )}
          </group>
        );
      })}

      {[...piers.entries()].map(([id, pier]) => (
        <group key={id} position={pier.position}>
          {<SkyAirportPier color={pier.color} />}
        </group>
      ))}

      {ships.map((ship, index) => (
        <group key={ship.airship.id}>
          <group position={ship.position} rotation={[0, ship.heading, 0]} scale={AIRSHIP_SCALE}>
            {<SkyAirship color={ship.color} phase={index * 1.9} />}
          </group>
          {ship.rope && (
            <mesh matrix={spanMatrix(ship.rope.from, ship.rope.to, 0.0025)} matrixAutoUpdate={false} raycast={noRaycast}>
              <cylinderGeometry args={[1, 1, 1, 4]} />
              <meshStandardMaterial color="#4a3a2c" roughness={0.9} />
            </mesh>
          )}
          {ship.trail && ship.trail.length > 0 && <SkyRouteTrail points={ship.trail} color={ship.color} />}
        </group>
      ))}
    </group>
  );
}

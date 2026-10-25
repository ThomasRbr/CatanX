import * as THREE from 'three';
import type { GameState, SkyHub, SkySiteKind } from '@catanx/engine';
import { HEX_SLAB_THICKNESS } from '../../utils/createHexGeometry';
import { cubeToWorld } from '../../utils/hexToWorld';
import { createVisualRng, hashString } from '../../utils/seededVisualRandom';

/**
 * Accent colour per sky site. The semantics predate the redesign and are used
 * by the landmark of each island (dome, tents, crystals...) so a site kind
 * stays recognisable at a glance.
 */
export const SKY_SITE_COLORS: Record<SkySiteKind, string> = {
  calm_mooring: '#e8f4ff',
  aether_source: '#a889ff',
  floating_garden: '#9ce5ae',
  wind_bazaar: '#ffd271',
  observatory: '#72d9ee',
  hanging_ruins: '#e9c9a0',
  turbulent_zone: '#ff877d',
};

/** Radius of an island's grassy top in its own (unscaled) frame. */
export const ISLAND_RADIUS = 0.64;
/** Islands are modelled at unit scale and enlarged as a whole on the board. */
export const HUB_SCALE = 1.32;
/** Radius of an island's grassy top in world units (a hex is radius 1). */
export const ISLAND_WORLD_RADIUS = ISLAND_RADIUS * HUB_SCALE;
/** Centre-to-centre spacing the layout relaxes towards. */
const MIN_HUB_SPACING = 2.45;
/** Height of the cloud deck. Islands float well above it. */
export const CLOUD_DECK_Y = -0.55;
/** Base altitude of an island's grass. */
const HUB_BASE_Y = HEX_SLAB_THICKNESS + 1.2;

export interface HubPlacement {
  hub: SkyHub;
  position: THREE.Vector3;
  /** Stable per-hub seed for procedural geometry. */
  seed: number;
  /** Deterministic phase for the idle bob. */
  phase: number;
  /** Yaw applied to the island, so neighbours never look copy-pasted. */
  yaw: number;
}

/**
 * Hub positions: anchor tile + golden-angle offset (as before), then a few
 * rounds of pairwise relaxation so islands never overlap even when two hubs
 * share an anchor or sit on adjacent tiles. Fully deterministic: same graph,
 * same layout on every client.
 */
export function layoutSkyHubs(gameState: GameState, hubs: SkyHub[]): HubPlacement[] {
  const placements: HubPlacement[] = [];
  hubs.forEach((hub, index) => {
    const tile = hub.anchorTileId ? gameState.map.get(hub.anchorTileId) : undefined;
    if (!tile) return;
    const world = cubeToWorld(tile.coord);
    const seed = hashString(`sky-hub::${hub.id}`);
    const rng = createVisualRng(seed);
    const angle = index * 2.399;
    placements.push({
      hub,
      seed,
      phase: rng() * Math.PI * 2,
      yaw: rng() * Math.PI * 2,
      position: new THREE.Vector3(
        world.x + Math.cos(angle) * 0.38,
        HUB_BASE_Y + (index % 3) * 0.17 + rng() * 0.08,
        world.z + Math.sin(angle) * 0.38,
      ),
    });
  });

  for (let iteration = 0; iteration < 48; iteration++) {
    let moved = false;
    for (let i = 0; i < placements.length; i++) {
      for (let j = i + 1; j < placements.length; j++) {
        const a = placements[i]!.position;
        const b = placements[j]!.position;
        let dx = b.x - a.x;
        let dz = b.z - a.z;
        let distance = Math.hypot(dx, dz);
        if (distance >= MIN_HUB_SPACING) continue;
        if (distance < 1e-4) {
          // Identical anchors: split along a deterministic direction.
          const angle = (i * 7 + j * 13) * 0.7;
          dx = Math.cos(angle);
          dz = Math.sin(angle);
          distance = 1;
        }
        const push = (MIN_HUB_SPACING - Math.hypot(b.x - a.x, b.z - a.z)) * 0.5 + 1e-3;
        const nx = dx / distance;
        const nz = dz / distance;
        a.x -= nx * push;
        a.z -= nz * push;
        b.x += nx * push;
        b.z += nz * push;
        moved = true;
      }
    }
    if (!moved) break;
  }
  return placements;
}

export interface LaneCurve {
  curve: THREE.QuadraticBezierCurve3;
  length: number;
}

/**
 * A wind current from `source` to `sink`, leaving and landing at the island
 * rims. It bows sideways and lifts slightly so parallel currents separate and
 * read as moving air rather than as rigid bridges.
 */
export function laneCurve(
  source: THREE.Vector3,
  sink: THREE.Vector3,
  laneId: string,
): LaneCurve {
  const flat = new THREE.Vector3(sink.x - source.x, 0, sink.z - source.z);
  const span = flat.length();
  const direction = flat.clone().normalize();
  const side = new THREE.Vector3(-direction.z, 0, direction.x);
  const rim = Math.min(ISLAND_WORLD_RADIUS * 0.9, span * 0.32);
  const start = source.clone().addScaledVector(direction, rim);
  const end = sink.clone().addScaledVector(direction, -rim);
  start.y += 0.06;
  end.y += 0.06;
  const bow = ((hashString(laneId) % 2) * 2 - 1) * Math.min(0.32, span * 0.1);
  const control = start
    .clone()
    .add(end)
    .multiplyScalar(0.5)
    .addScaledVector(side, bow);
  control.y += 0.16 + span * 0.05;
  const curve = new THREE.QuadraticBezierCurve3(start, control, end);
  return { curve, length: curve.getLength() };
}

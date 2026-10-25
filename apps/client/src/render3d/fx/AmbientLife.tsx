import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import type { CatanTopology, GameState } from '@catanx/engine';
import { hexNeighbor, hexToId } from '@catanx/engine';
import {
  createBoatHullGeometry,
  createBoatSailGeometry,
  createSheepGeometry,
  createWindmillBladesGeometry,
  createWindmillTowerGeometry,
} from '../assets/meshCatalog';
import { useAmbientAnimation } from './AmbientAnimationContext';
import { isWaterTerrain } from '../decorations/deterministicDecoration';
import { HEX_SLAB_THICKNESS } from '../utils/createHexGeometry';
import { cubeToWorld, HEX_WORLD_RADIUS } from '../utils/hexToWorld';
import { edgeOffset, radialRotationY } from '../utils/hexEdges';
import { intersectionToWorld } from '../utils/topologyToWorld';
import { resolveBuildingVisual } from '../utils/buildingVisual';
import { createVisualRng } from '../utils/seededVisualRandom';
import { useRenderQuality } from '../quality/RenderQualityContext';
import { useSurfaceHeight } from '../terrain/SurfaceHeightContext';
import { findSeaDirection } from '../utils/seaDirection';

interface AmbientLifeProps {
  gameState: GameState;
  topology: CatanTopology;
  enabled?: boolean;
}

interface SmokeSpot {
  x: number;
  y: number;
  z: number;
  phase: number;
}

interface BoatSpot {
  x: number;
  y: number;
  z: number;
  rot: number;
  phase: number;
}

interface MillSpot {
  x: number;
  y: number;
  z: number;
  yaw: number;
  phase: number;
}

interface CritterSpot {
  x: number;
  y: number;
  z: number;
  phase: number;
  radius: number;
  scale: number;
}

interface BirdSpot {
  x: number;
  y: number;
  z: number;
  phase: number;
  radius: number;
  speed: number;
  scale: number;
}

function createBirdGeometry(): THREE.BufferGeometry {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute([
    0, 0, -0.012, -0.055, 0, 0.02, -0.01, 0.004, 0.035,
    0, 0, -0.012, 0.01, 0.004, 0.035, 0.055, 0, 0.02,
  ], 3));
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute([
    0, 1, 0, 0, 1, 0, 0, 1, 0,
    0, 1, 0, 0, 1, 0, 0, 1, 0,
  ], 3));
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}

/** Ocean surface height. Anything above this is beach, not sea. */
const WATERLINE = -0.05;
/** How deep a hull sits, relative to the ocean surface. */
const BOAT_DRAFT = -0.03;


/**
 * Ambient life: chimney smoke, harbor boats, windmills, pasture/tundra sheep.
 * Vertex-colored low-poly meshes — shared AmbientAnimation clock.
 */
export function AmbientLife({ gameState, topology, enabled = true }: AmbientLifeProps) {
  const ambient = useAmbientAnimation();
  const quality = useRenderQuality();
  const surface = useSurfaceHeight();
  const seed = gameState.config.mapSeed;

  const spots = useMemo(() => {
    const out: SmokeSpot[] = [];
    let i = 0;
    for (const building of gameState.buildings.values()) {
      const visual = resolveBuildingVisual(building.definitionId);
      if (visual !== 'settlement' && visual !== 'city' && visual !== 'metropolis') continue;

      let x = 0;
      let z = 0;
      let y = HEX_SLAB_THICKNESS + (visual === 'settlement' ? 0.36 : visual === 'metropolis' ? 0.62 : 0.52);
      if (building.placementKind === 'intersection' && building.placementIntersectionId) {
        const intersection = topology.intersections[building.placementIntersectionId];
        if (!intersection) continue;
        const base = intersectionToWorld(intersection, HEX_SLAB_THICKNESS + 0.02);
        x = base.x;
        z = base.z;
        y = base.y + (visual === 'settlement' ? 0.32 : visual === 'metropolis' ? 0.56 : 0.46);
      } else if (building.tileId) {
        const tile = gameState.map.get(building.tileId);
        if (!tile) continue;
        const o = cubeToWorld(tile.coord);
        x = o.x;
        z = o.z;
      } else {
        continue;
      }

      out.push({
        x: x + 0.05,
        y,
        z: z - 0.02,
        phase: (i++ * 1.7) % (Math.PI * 2),
      });
    }
    return out;
  }, [gameState.buildings, gameState.map, topology]);

  const boats = useMemo(() => {
    const out: BoatSpot[] = [];
    let i = 0;
    for (const tile of gameState.map.values()) {
      if (!tile.port) continue;
      const dir = findSeaDirection(tile.coord, gameState.map);
      if (dir < 0) continue;
      const origin = cubeToWorld(tile.coord);
      const off = edgeOffset(dir, HEX_WORLD_RADIUS * 1.18);
      const x = origin.x + off.x;
      const z = origin.z + off.z;
      // Hex adjacency says which way the sea is; only the heightfield knows
      // whether this exact spot is under water. The island's coastal apron
      // reaches past the tile boundary, so the topological answer alone still
      // beaches boats.
      if (surface.sampleHeight(x, z) > WATERLINE) continue;
      out.push({
        x,
        y: BOAT_DRAFT,
        z,
        rot: radialRotationY(dir),
        phase: (i++ * 1.3) % (Math.PI * 2),
      });
    }
    // Small coastal fishing traffic makes quiet maps feel inhabited without
    // turning boats into gameplay symbols. Ports remain the densest anchors.
    const rng = createVisualRng(seed ^ 0x424f4154);
    const maxFishingBoats = quality.id === 'ultra' ? 7 : quality.id === 'high' ? 5 : 3;
    const coast = [...gameState.map.values()].filter((tile) => {
      if (isWaterTerrain(tile.terrain) || tile.port) return false;
      const dir = findSeaDirection(tile.coord, gameState.map);
      if (dir < 0) return false;
      const adjacent = gameState.map.get(hexToId(hexNeighbor(tile.coord, dir as 0 | 1 | 2 | 3 | 4 | 5)));
      return !adjacent || isWaterTerrain(adjacent.terrain);
    });
    let fishingCount = 0;
    for (let attempt = 0; attempt < coast.length * 4 && fishingCount < maxFishingBoats; attempt++) {
      const tile = coast[Math.floor(rng() * coast.length)];
      if (!tile || rng() > 0.58) continue;
      const dir = findSeaDirection(tile.coord, gameState.map);
      if (dir < 0) continue;
      const origin = cubeToWorld(tile.coord);
      // Pushed further out than the port moorings: fishing traffic works open
      // water, and the extra clearance keeps it off the widened shore apron.
      const off = edgeOffset(dir, HEX_WORLD_RADIUS * (1.35 + rng() * 0.3));
      const x = origin.x + off.x + (rng() - 0.5) * 0.16;
      const z = origin.z + off.z + (rng() - 0.5) * 0.16;
      if (surface.sampleHeight(x, z) > WATERLINE) continue;
      out.push({
        x,
        y: BOAT_DRAFT,
        z,
        rot: radialRotationY(dir) + (rng() - 0.5) * 0.38,
        phase: rng() * Math.PI * 2,
      });
      i++;
      fishingCount++;
    }
    return out;
  }, [gameState.map, quality.id, seed, surface]);

  const mills = useMemo(() => {
    const out: MillSpot[] = [];
    const plains = [...gameState.map.values()].filter((tile) => {
      if (tile.terrain !== 'plains') return false;
      // A mill seen through a neighbouring tree canopy turns its canvas sails
      // into a pale circular artefact. Reserve mills for genuinely open fields.
      return !([0, 1, 2, 3, 4, 5] as const).some((direction) => {
        const neighbor = gameState.map.get(hexToId(hexNeighbor(tile.coord, direction)));
        return neighbor?.terrain === 'forest' || neighbor?.terrain === 'jungle';
      });
    });
    const rng = createVisualRng(seed ^ 0x4d494c4c);
    const used = new Set<string>();
    let attempts = 0;
    const maxMills = quality.id === 'ultra' ? 3 : quality.id === 'high' ? 2 : 1;
    while (out.length < Math.min(maxMills, plains.length) && attempts < plains.length * 4) {
      attempts++;
      const tile = plains[Math.floor(rng() * plains.length)]!;
      if (used.has(tile.id)) continue;
      used.add(tile.id);
      const o = cubeToWorld(tile.coord);
      const ang = rng() * Math.PI * 2;
      const r = 0.1 + rng() * 0.14;
      out.push({
        x: o.x + Math.cos(ang) * r,
        y: HEX_SLAB_THICKNESS,
        z: o.z + Math.sin(ang) * r,
        yaw: rng() * Math.PI * 2,
        phase: rng() * Math.PI * 2,
      });
    }
    return out;
  }, [gameState.map, quality.id, seed]);

  const critters = useMemo(() => {
    const out: CritterSpot[] = [];
    const grazing = [...gameState.map.values()].filter(
      (t) => t.terrain === 'pasture' || t.terrain === 'tundra',
    );
    const rng = createVisualRng(seed ^ 0x53484545);
    const maxSheep = quality.id === 'ultra' ? 42 : quality.id === 'high' ? 32 : quality.id === 'balanced' ? 24 : 16;
    let n = 0;
    for (const tile of grazing) {
      if (n >= maxSheep) break;
      // Toundra un peu plus peuplée (lien mouton) ; pâturage comme avant.
      const spawnChance = tile.terrain === 'tundra' ? 0.9 : quality.id === 'ultra' ? 0.94 : 0.8;
      if (rng() > spawnChance) continue;
      const o = cubeToWorld(tile.coord);
      const count =
        tile.terrain === 'tundra'
          ? 2 + Math.floor(rng() * 4)
          : 2 + Math.floor(rng() * (quality.id === 'ultra' ? 5 : 3));
      for (let k = 0; k < count && n < maxSheep; k++) {
        const ang = rng() * Math.PI * 2;
        const r = 0.14 + rng() * (tile.terrain === 'tundra' ? 0.4 : 0.32);
        const sx = o.x + Math.cos(ang) * r;
        const sz = o.z + Math.sin(ang) * r;
        out.push({
          x: sx,
          // Follow the terrain. A fixed slab height buried the whole flock once
          // the elevation table was raised — pasture is no longer flat.
          y: surface.sampleHeight(sx, sz),
          z: sz,
          phase: rng() * Math.PI * 2,
          radius: 0.035 + rng() * 0.04,
          // Livestock is ambient scale information, not a game piece. At the
          // strategic camera it should read as a herd, never as white boulders.
          scale: 0.34 + rng() * 0.12,
        });
        n++;
      }
    }
    return out;
  }, [gameState.map, quality.id, seed, surface]);

  const birds = useMemo(() => {
    if (quality.id === 'low') return [] as BirdSpot[];
    const rng = createVisualRng(seed ^ 0x47554c4c);
    const coast = [...gameState.map.values()].filter((tile) => {
      if (isWaterTerrain(tile.terrain)) return false;
      const dir = findSeaDirection(tile.coord, gameState.map);
      if (dir < 0) return false;
      const adjacent = gameState.map.get(hexToId(hexNeighbor(tile.coord, dir as 0 | 1 | 2 | 3 | 4 | 5)));
      return !adjacent || isWaterTerrain(adjacent.terrain);
    });
    const count = Math.min(quality.id === 'ultra' ? 14 : quality.id === 'high' ? 10 : 6, coast.length * 2);
    const out: BirdSpot[] = [];
    for (let index = 0; index < count; index++) {
      const tile = coast[Math.floor(rng() * coast.length)];
      if (!tile) break;
      const origin = cubeToWorld(tile.coord);
      const bx = origin.x + (rng() - 0.5) * 0.9;
      const bz = origin.z + (rng() - 0.5) * 0.9;
      out.push({
        x: bx,
        // Relative to the ground, not absolute. A fixed 0.9-1.6 put gulls
        // inside the mountains once the elevation table was raised.
        y: surface.sampleHeight(bx, bz) + 0.85 + rng() * 0.6,
        z: bz,
        phase: rng() * Math.PI * 2,
        radius: 0.11 + rng() * 0.2,
        speed: 0.18 + rng() * 0.14,
        scale: 0.42 + rng() * 0.24,
      });
    }
    return out;
  }, [gameState.map, quality.id, seed]);

  const smokeMeshRef = useRef<THREE.InstancedMesh>(null);
  const boatHullRef = useRef<THREE.InstancedMesh>(null);
  const boatSailRef = useRef<THREE.InstancedMesh>(null);
  const millTowerRef = useRef<THREE.InstancedMesh>(null);
  const millBladeRef = useRef<THREE.InstancedMesh>(null);
  const critterRef = useRef<THREE.InstancedMesh>(null);
  const birdRef = useRef<THREE.InstancedMesh>(null);
  const dummy = useMemo(() => new THREE.Object3D(), []);

  const smokeMat = useMemo(
    () =>
      new THREE.MeshBasicMaterial({
        color: '#c8c4bc',
        transparent: true,
        opacity: 0.35,
        depthWrite: false,
      }),
    [],
  );
  const lifeMat = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        vertexColors: true,
        roughness: 0.88,
        metalness: 0.04,
        flatShading: false,
      }),
    [],
  );

  const smokeGeo = useMemo(() => new THREE.SphereGeometry(0.05, 5, 4), []);
  const hullGeo = useMemo(() => createBoatHullGeometry(), []);
  const sailGeo = useMemo(() => createBoatSailGeometry(), []);
  const towerGeo = useMemo(() => createWindmillTowerGeometry(), []);
  const bladeGeo = useMemo(() => createWindmillBladesGeometry(), []);
  const critterGeo = useMemo(() => createSheepGeometry(), []);
  const birdGeo = useMemo(createBirdGeometry, []);
  // Lit, and a gull's upper surface — not an unlit near-white.
  //
  // MeshBasic ignores lighting, so at #e8e4dc these were the brightest pixels
  // anywhere on the board. A dozen bright specks drifting over the island read
  // as falling snow rather than as birds.
  const birdMat = useMemo(() => new THREE.MeshStandardMaterial({
    color: '#8b9299',
    roughness: 0.85,
    metalness: 0,
    side: THREE.DoubleSide,
  }), []);

  useEffect(() => {
    return () => {
      smokeMat.dispose();
      lifeMat.dispose();
      smokeGeo.dispose();
      hullGeo.dispose();
      sailGeo.dispose();
      towerGeo.dispose();
      bladeGeo.dispose();
      critterGeo.dispose();
      birdGeo.dispose();
      birdMat.dispose();
    };
  }, [smokeMat, lifeMat, smokeGeo, hullGeo, sailGeo, towerGeo, bladeGeo, critterGeo, birdGeo, birdMat]);

  useFrame(() => {
    const active = ambient.enabled && enabled;
    const t = active ? ambient.time : 0;
    const strength = active ? 1 : 0;

    const smoke = smokeMeshRef.current;
    if (smoke && spots.length > 0) {
      for (let i = 0; i < spots.length; i++) {
        const s = spots[i]!;
        const cycle = ((t * 0.55 + s.phase) % 2.4) / 2.4;
        const rise = cycle * 0.35;
        const drift = Math.sin(t * 0.4 + s.phase) * 0.04 * ambient.windStrength;
        const scale = (0.55 + cycle * 1.1) * strength;
        const terrainLift = Math.max(0, surface.sampleHeight(s.x, s.z) - HEX_SLAB_THICKNESS);
        dummy.position.set(s.x + drift, s.y + terrainLift + rise, s.z + drift * 0.5);
        dummy.rotation.set(0, 0, 0);
        dummy.scale.setScalar(Math.max(0.01, scale));
        dummy.updateMatrix();
        smoke.setMatrixAt(i, dummy.matrix);
      }
      smoke.count = spots.length;
      smoke.instanceMatrix.needsUpdate = true;
      smokeMat.opacity = 0.28 * strength;
    }

    const hull = boatHullRef.current;
    const sail = boatSailRef.current;
    if (hull && boats.length > 0) {
      for (let i = 0; i < boats.length; i++) {
        const b = boats[i]!;
        const bob = active ? Math.sin(t * 1.1 + b.phase) * 0.022 : 0;
        const yaw = b.rot + (active ? Math.sin(t * 0.35 + b.phase) * 0.07 : 0);
        const roll = bob * 0.8;
        dummy.position.set(b.x, b.y + bob, b.z);
        dummy.rotation.set(roll, yaw, bob * 0.45);
        dummy.scale.set(0.72, 0.72, 0.72);
        dummy.updateMatrix();
        hull.setMatrixAt(i, dummy.matrix);
        if (sail) {
          const flap = Math.sin(t * 1.8 + b.phase) * 0.1 * strength;
          dummy.position.set(b.x, b.y + bob, b.z);
          dummy.rotation.set(roll, yaw, flap);
          dummy.scale.set(0.72, 0.72, 0.72);
          dummy.updateMatrix();
          sail.setMatrixAt(i, dummy.matrix);
        }
      }
      hull.count = boats.length;
      hull.instanceMatrix.needsUpdate = true;
      if (sail) {
        sail.count = boats.length;
        sail.instanceMatrix.needsUpdate = true;
      }
    }

    const tower = millTowerRef.current;
    const blades = millBladeRef.current;
    if (tower && mills.length > 0) {
      for (let i = 0; i < mills.length; i++) {
        const m = mills[i]!;
        const groundY = surface.sampleHeight(m.x, m.z) + 0.006;
        dummy.position.set(m.x, groundY, m.z);
        dummy.rotation.set(0, m.yaw, 0);
        dummy.scale.set(0.68, 0.68, 0.68);
        dummy.updateMatrix();
        tower.setMatrixAt(i, dummy.matrix);
        if (blades) {
          const spin = active ? t * 1.35 + m.phase : m.phase;
          const face = 0.085 * 0.68;
          dummy.position.set(
            m.x + Math.sin(m.yaw) * face,
            groundY + 0.32 * 0.68,
            m.z + Math.cos(m.yaw) * face,
          );
          dummy.rotation.order = 'YZX';
          dummy.rotation.set(0, m.yaw, spin);
          dummy.scale.set(0.68, 0.68, 0.68);
          dummy.updateMatrix();
          blades.setMatrixAt(i, dummy.matrix);
        }
      }
      tower.count = mills.length;
      tower.instanceMatrix.needsUpdate = true;
      if (blades) {
        blades.count = mills.length;
        blades.instanceMatrix.needsUpdate = true;
      }
    }

    const crit = critterRef.current;
    if (crit && critters.length > 0) {
      for (let i = 0; i < critters.length; i++) {
        const c = critters[i]!;
        const wander = active ? t * 0.32 + c.phase : c.phase;
        const ox = Math.cos(wander) * c.radius;
        const oz = Math.sin(wander * 0.85) * c.radius;
        const hop = active ? Math.abs(Math.sin(t * 3.2 + c.phase)) * 0.012 : 0;
        // Mesh head is +X — face along the wander tangent.
        const x = c.x + ox;
        const z = c.z + oz;
        dummy.position.set(x, surface.sampleHeight(x, z) + 0.004 + hop, z);
        dummy.rotation.set(0, wander + Math.PI / 2, 0);
        dummy.scale.setScalar(c.scale);
        dummy.updateMatrix();
        crit.setMatrixAt(i, dummy.matrix);
      }
      crit.count = critters.length;
      crit.instanceMatrix.needsUpdate = true;
    }

    const birdMesh = birdRef.current;
    if (birdMesh && birds.length > 0) {
      for (let i = 0; i < birds.length; i++) {
        const bird = birds[i]!;
        const orbit = bird.phase + t * bird.speed;
        const flap = active ? 0.82 + Math.abs(Math.sin(t * 4.8 + bird.phase)) * 0.28 : 1;
        dummy.position.set(
          bird.x + Math.cos(orbit) * bird.radius,
          bird.y + Math.sin(t * 0.45 + bird.phase) * 0.035,
          bird.z + Math.sin(orbit) * bird.radius,
        );
        dummy.rotation.set(0, -orbit + Math.PI * 0.5, Math.sin(orbit * 0.7) * 0.12);
        dummy.scale.set(bird.scale * flap, bird.scale, bird.scale);
        dummy.updateMatrix();
        birdMesh.setMatrixAt(i, dummy.matrix);
      }
      birdMesh.count = birds.length;
      birdMesh.instanceMatrix.needsUpdate = true;
    }
  });

  if (!enabled) return null;
  if (spots.length === 0 && boats.length === 0 && mills.length === 0 && critters.length === 0 && birds.length === 0) {
    return null;
  }

  return (
    <group>
      {spots.length > 0 && (
        <instancedMesh
          ref={smokeMeshRef}
          args={[smokeGeo, smokeMat, Math.max(1, spots.length)]}
          frustumCulled={false}
          raycast={() => undefined}
          renderOrder={8}
        />
      )}
      {boats.length > 0 && (
        <>
          <instancedMesh
            ref={boatHullRef}
            args={[hullGeo, lifeMat, Math.max(1, boats.length)]}
            frustumCulled={false}
            raycast={() => undefined}
            renderOrder={3}
          />
          <instancedMesh
            ref={boatSailRef}
            args={[sailGeo, lifeMat, Math.max(1, boats.length)]}
            frustumCulled={false}
            raycast={() => undefined}
            renderOrder={3}
          />
        </>
      )}
      {mills.length > 0 && (
        <>
          <instancedMesh
            ref={millTowerRef}
            args={[towerGeo, lifeMat, Math.max(1, mills.length)]}
            castShadow
            frustumCulled={false}
            raycast={() => undefined}
          />
          <instancedMesh
            ref={millBladeRef}
            args={[bladeGeo, lifeMat, Math.max(1, mills.length)]}
            frustumCulled={false}
            raycast={() => undefined}
          />
        </>
      )}
      {critters.length > 0 && (
        <instancedMesh
          ref={critterRef}
          args={[critterGeo, lifeMat, Math.max(1, critters.length)]}
          frustumCulled={false}
          raycast={() => undefined}
        />
      )}
      {birds.length > 0 && (
        <instancedMesh
          ref={birdRef}
          args={[birdGeo, birdMat, Math.max(1, birds.length)]}
          frustumCulled={false}
          raycast={() => undefined}
          renderOrder={9}
        />
      )}
    </group>
  );
}

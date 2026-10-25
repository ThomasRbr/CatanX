import { useEffect, useMemo } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import type { GameState, UndergroundSkyState } from '@catanx/engine';
import { useRenderQuality } from '../quality/RenderQualityContext';
import { getAuthoredBiomeTextures } from '../terrain/authoredPbrTextures';
import { playerColor } from '../utils/playerColors';
import type { buildWorldTopology } from '../utils/topologyToWorld';
import { CavernAtmosphere, type BeamSpot, type HaloSpot } from './underground/CavernAtmosphere';
import { getCavernBuild } from './underground/cavernCache';
import { CavernChambers } from './underground/CavernChambers';
import { CavernGlowField, glowBudgetFor, type GlowSource } from './underground/cavernGlow';
import { chamberAnchors, type CavernEdgeInfo } from './underground/cavernLayout';
import { createCavernMaterials, type CavernMaterials } from './underground/cavernMaterials';
import { CavernPieces, type PiecePlacement } from './underground/CavernPieces';
import { CavernTunnels, type OwnedTunnel } from './underground/CavernTunnels';
import { InstancedSet } from './underground/KitInstances';
import {
  getBoulderGeometry,
  getColumnGeometry,
  getCrystalGeometry,
  getStalagmiteGeometry,
} from './underground/cavernGeometry';
import { CHAMBER_LIGHT, DAYLIGHT_COLOR, LEAK_COLOR, TORCH_COLOR } from './underground/palette';


type WorldTopology = ReturnType<typeof buildWorldTopology>;

interface LayerProps {
  gameState: GameState;
  currentPlayerId: string;
  topology: WorldTopology;
  animate: boolean;
}

const noRaycast = () => undefined;
/** Chamber glow strength relative to the palette values. */
const CHAMBER_GLOW_GAIN = 2.3;

/** The fault's fissure breathes; one shared material, so one write per frame. */
function pulseHazard(materials: CavernMaterials, time: number) {
  materials.hazard.emissiveIntensity = 0.7 + 0.45 * (0.5 + 0.5 * Math.sin(time * 3.1));
}

/**
 * Underground layer of Souterrain & Ciel — "Les Profondeurs".
 *
 * A cut-away cave diorama under the island: a basalt block following the land
 * footprint, one chamber carved under every land hex, natural passages along
 * the graph edges, strata cliffs and a magma glow far below. Revealed chambers
 * are lit and show what they hold; unexplored ones are choked with rubble.
 * Tunnels, outposts and extractors carry their owner's colour.
 *
 * Lighting budget: two point lights for the whole layer. Every chamber,
 * lantern and crack lights the rock through the shared glow field (see
 * `cavernGlow.ts`) and emissive materials designed for the bloom pass.
 */
export function UndergroundLayer3D({ gameState, topology, animate }: LayerProps) {
  const extension = gameState.extensions?.undergroundSky;
  if (!extension) return null;
  return <UndergroundScene gameState={gameState} extension={extension} topology={topology} animate={animate} />;
}

function UndergroundScene({
  gameState,
  extension,
  topology,
  animate,
}: {
  gameState: GameState;
  extension: UndergroundSkyState;
  topology: WorldTopology;
  animate: boolean;
}) {
  const gl = useThree((state) => state.gl);
  const quality = useRenderQuality();
  const graph = extension.undergroundGraph;
  const mapSeed = gameState.config.mapSeed;
  const maxVertices = quality.id === 'low' ? 16_000 : quality.id === 'balanced' ? 30_000 : 44_000;

  const build = useMemo(
    () => getCavernBuild(gameState.map, graph, mapSeed, maxVertices),
    [gameState.map, graph, mapSeed, maxVertices],
  );
  const { layout, terrain, seam, decor } = build;

  const field = useMemo(() => new CavernGlowField(glowBudgetFor(gl.capabilities.maxFragmentUniforms)), [gl]);
  const textures = useMemo(() => {
    const set = getAuthoredBiomeTextures('mountain', quality.textureTier);
    return { albedo: set.albedo, normal: set.normal, roughness: set.roughness };
  }, [quality.textureTier]);
  const materials = useMemo(() => createCavernMaterials(field, textures), [field, textures]);
  useEffect(() => () => materials.dispose(), [materials]);

  // ---- game state → visual inputs -----------------------------------------
  const revealed = useMemo(
    () => new Set(extension.revealedUndergroundNodeIds),
    [extension.revealedUndergroundNodeIds],
  );
  const ownerColor = (playerId: string, fallback: string) =>
    new THREE.Color(playerColor(gameState.players.get(playerId)?.color, fallback));

  const derived = useMemo(() => {
    const occupied = new Set(extension.outposts.map((o) => o.nodeId));
    const outposts: PiecePlacement[] = [];
    const extractors: PiecePlacement[] = [];
    for (const outpost of extension.outposts) {
      const node = layout.nodeById.get(outpost.nodeId);
      if (!node) continue;
      const anchors = chamberAnchors(node, true);
      const color = ownerColor(outpost.playerId, '#63e6dc');
      outposts.push({ id: outpost.id, ...anchors.outpost, color });
      if (outpost.upgradedExtractor) extractors.push({ id: `${outpost.id}-x`, ...anchors.extractor, color });
    }

    const tunnelByEdge = new Map(extension.tunnels.map((t) => [t.edgeId, t]));
    const owned: OwnedTunnel[] = [];
    const buildable: CavernEdgeInfo[] = [];
    for (const edge of layout.edges) {
      const tunnel = tunnelByEdge.get(edge.id);
      if (tunnel) owned.push({ edge, color: ownerColor(tunnel.playerId, '#f1a06d') });
      else if (revealed.has(edge.a) && revealed.has(edge.b)) buildable.push(edge);
    }

    const shafts: PiecePlacement[] = [];
    for (const shaft of extension.shafts) {
      const point = topology.intersections[shaft.intersectionId];
      const node = layout.nodeById.get(shaft.entryNodeId);
      if (!point || !node) continue;
      // The shaft comes down at the hex corner; its foot sits on the chamber rim.
      const t = 0.4;
      shafts.push({
        id: shaft.id,
        x: point.x + (node.x - point.x) * t,
        z: point.y + (node.z - point.y) * t,
        color: ownerColor(shaft.playerId, '#63e6dc'),
      });
    }

    const lifts: PiecePlacement[] = [];
    for (const lift of extension.lifts ?? []) {
      const node = layout.nodeById.get(lift.nodeId);
      if (!node) continue;
      const edge = topology.edges[lift.surfaceEdgeId];
      const a = edge ? topology.intersections[edge.a] : undefined;
      const b = edge ? topology.intersections[edge.b] : undefined;
      let dirX = -Math.SQRT1_2;
      let dirZ = -Math.SQRT1_2;
      if (a && b) {
        const mx = (a.x + b.x) / 2 - node.x;
        const mz = (a.y + b.y) / 2 - node.z;
        const len = Math.hypot(mx, mz) || 1;
        dirX = mx / len;
        dirZ = mz / len;
      }
      lifts.push({
        id: lift.id,
        x: node.x + dirX * 0.4,
        z: node.z + dirZ * 0.4,
        color: ownerColor(lift.playerId, '#63e6dc'),
      });
    }
    return { occupied, outposts, extractors, owned, buildable, shafts, lifts };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [extension.outposts, extension.tunnels, extension.shafts, extension.lifts, gameState.players, layout, revealed, topology]);

  // ---- glow field ------------------------------------------------------------
  const glows = useMemo(() => {
    const list: GlowSource[] = [...decor.glows];
    for (const node of layout.nodes) {
      const data = graph.nodes[node.id];
      if (!data) continue;
      if (revealed.has(node.id)) {
        const light = CHAMBER_LIGHT[data.discovery];
        const danger = data.geologyCategory === 'danger';
        const lively = data.discovery === 'crystal_geode' || data.discovery === 'aether_breath' || data.discovery === 'fungiculture';
        list.push({
          x: node.x,
          y: 0.32,
          z: node.z,
          radius: danger ? 1.4 : 1.15,
          color: light.color,
          intensity: light.intensity * CHAMBER_GLOW_GAIN,
          mode: danger ? 'pulse' : lively ? 'breathe' : 'steady',
          priority: danger ? 100 : 90,
        });
      } else {
        list.push({ x: node.x, y: 0.22, z: node.z, radius: 0.75, color: LEAK_COLOR, intensity: 0.9, mode: 'flicker', priority: 40 });
      }
    }
    for (const piece of derived.outposts) {
      list.push({ x: piece.x + 0.06, y: 0.26, z: piece.z + 0.06, radius: 0.65, color: TORCH_COLOR, intensity: 1.1, mode: 'flicker', priority: 80 });
      list.push({ x: piece.x - 0.1, y: 0.5, z: piece.z, radius: 0.6, color: piece.color, intensity: 1.0, priority: 79 });
    }
    for (const piece of derived.extractors) {
      list.push({ x: piece.x, y: 0.3, z: piece.z, radius: 0.62, color: '#5ff7ff', intensity: 1.2, mode: 'breathe', priority: 78 });
    }
    for (const piece of derived.shafts) {
      list.push({ x: piece.x, y: 0.7, z: piece.z, radius: 1.0, color: DAYLIGHT_COLOR, intensity: 1.6, priority: 85 });
    }
    for (const piece of derived.lifts) {
      list.push({ x: piece.x, y: 0.4, z: piece.z, radius: 0.5, color: piece.color, intensity: 0.9, priority: 60 });
    }
    for (const { edge, color } of derived.owned) {
      list.push({
        x: (edge.ax + edge.bx) / 2,
        y: 0.24,
        z: (edge.az + edge.bz) / 2,
        radius: 0.85,
        color,
        intensity: 1.6,
        mode: 'flicker',
        priority: 70,
      });
    }
    return list;
  }, [decor.glows, derived, graph.nodes, layout.nodes, revealed]);

  useEffect(() => {
    field.set(glows);
  }, [field, glows]);

  useFrame((state) => {
    if (!animate) return;
    const t = state.clock.elapsedTime;
    field.tick(t);
    pulseHazard(materials, t);
  });

  // ---- atmosphere inputs -------------------------------------------------------
  const beams = useMemo<BeamSpot[]>(() => {
    // Only surface shafts get a shaft of daylight: light in the cave means
    // "someone dug down here", never decoration.
    const list: BeamSpot[] = [];
    for (const shaft of derived.shafts) {
      list.push({
        x: shaft.x,
        y: layout.heightAt(shaft.x, shaft.z),
        z: shaft.z,
        radius: 0.2,
        height: 2.6,
        color: new THREE.Color(DAYLIGHT_COLOR).multiplyScalar(0.16),
      });
    }
    return list;
  }, [derived.shafts, layout]);

  const halos = useMemo<HaloSpot[]>(() => {
    const list: HaloSpot[] = [];
    for (const node of layout.nodes) {
      const data = graph.nodes[node.id];
      if (!data || !revealed.has(node.id)) continue;
      const danger = data.geologyCategory === 'danger';
      list.push({
        x: node.x,
        y: 0.3,
        z: node.z,
        size: danger ? 1.9 : 1.6,
        color: new THREE.Color(CHAMBER_LIGHT[data.discovery].color).multiplyScalar(danger ? 0.2 : 0.11),
      });
    }
    for (const shaft of derived.shafts) {
      list.push({ x: shaft.x, y: 0.5, z: shaft.z, size: 1.1, color: new THREE.Color(DAYLIGHT_COLOR).multiplyScalar(0.14) });
    }
    return list;
  }, [derived.shafts, graph.nodes, layout.nodes, revealed]);

  const steam = useMemo(() => {
    const list: Array<{ x: number; y: number; z: number }> = [];
    for (const node of layout.nodes) {
      const data = graph.nodes[node.id];
      if (!data || data.discovery !== 'thermal_spring' || !revealed.has(node.id)) continue;
      const anchor = chamberAnchors(node, derived.occupied.has(node.id)).centrepiece;
      list.push({ x: anchor.x - 0.05, y: layout.heightAt(anchor.x, anchor.z) + 0.15, z: anchor.z - 0.05 });
    }
    return list;
  }, [derived.occupied, graph.nodes, layout, revealed]);

  const { centre, bounds } = layout;
  const span = Math.max(bounds.maxX - bounds.minX, bounds.maxZ - bounds.minZ);

  return (
    <group>
      {/* The whole layer's light budget: warm torch fill and a cool crystal rim. */}
      <pointLight
        position={[centre.x - span * 0.22, 2.4, centre.z + span * 0.18]}
        color="#ffa45e"
        intensity={span * 1.1}
        distance={span * 1.15}
        decay={1.4}
      />
      <pointLight
        position={[centre.x + span * 0.26, 2.0, centre.z - span * 0.24]}
        color="#5fd8ff"
        intensity={span * 0.75}
        distance={span * 1.05}
        decay={1.4}
      />

      <mesh geometry={terrain} material={materials.rock} castShadow receiveShadow raycast={noRaycast} dispose={null} />
      {seam && <mesh geometry={seam} material={materials.emissiveBasic} raycast={noRaycast} dispose={null} />}

      <InstancedSet geometry={getStalagmiteGeometry()} material={materials.stone} items={decor.stalagmites} castShadow receiveShadow />
      <InstancedSet geometry={getColumnGeometry()} material={materials.stone} items={decor.columns} castShadow receiveShadow />
      <InstancedSet geometry={getBoulderGeometry()} material={materials.stone} items={decor.boulders} castShadow receiveShadow />
      <InstancedSet geometry={getCrystalGeometry()} material={materials.glow} items={decor.crystals} />

      <CavernChambers
        layout={layout}
        graph={graph}
        revealed={revealed}
        occupied={derived.occupied}
        materials={materials}
        animate={animate}
      />
      <CavernTunnels layout={layout} owned={derived.owned} buildable={derived.buildable} materials={materials} />
      <CavernPieces
        layout={layout}
        outposts={derived.outposts}
        extractors={derived.extractors}
        shafts={derived.shafts}
        lifts={derived.lifts}
        materials={materials}
        animate={animate}
      />
      <CavernAtmosphere layout={layout} beams={beams} halos={halos} steam={steam} materials={materials} animate={animate} />
    </group>
  );
}

import { useMemo } from 'react';
import type { UndergroundGraph } from '@catanx/engine';
import { createVisualRng, mixSeeds } from '../../utils/seededVisualRandom';
import { chamberAnchors, type CavernLayout } from './cavernLayout';
import type { CavernMaterials } from './cavernMaterials';
import { getDiscoveryKit, getRubbleHeapKit, kitMatrix, type ChamberKit } from './chamberKits';
import { KitInstances, type KitPlacement } from './KitInstances';

interface CavernChambersProps {
  layout: CavernLayout;
  graph: UndergroundGraph;
  revealed: ReadonlySet<string>;
  occupied: ReadonlySet<string>;
  materials: CavernMaterials;
  animate: boolean;
}

const CAMERA_YAW = Math.PI / 4;

/**
 * Chamber centrepieces. Revealed chambers show what they hold; unexplored ones
 * are choked with rubble, a little light leaking between the stones.
 */
export function CavernChambers({ layout, graph, revealed, occupied, materials, animate }: CavernChambersProps) {
  const groups = useMemo(() => {
    const byKit = new Map<string, { kit: ChamberKit; placements: KitPlacement[] }>();
    const push = (key: string, kit: ChamberKit, placement: KitPlacement) => {
      const entry = byKit.get(key) ?? { kit, placements: [] };
      entry.placements.push(placement);
      byKit.set(key, entry);
    };
    for (const node of layout.nodes) {
      const data = graph.nodes[node.id];
      if (!data) continue;
      const rng = createVisualRng(mixSeeds(layout.seed, node.id, 'chamber'));
      if (revealed.has(node.id)) {
        const kit = getDiscoveryKit(data.discovery);
        const anchor = chamberAnchors(node, occupied.has(node.id)).centrepiece;
        const yaw = kit.faceCamera ? CAMERA_YAW + (rng() - 0.5) * 0.25 : rng() * Math.PI * 2;
        push(data.discovery, kit, {
          matrix: kitMatrix(anchor.x, layout.heightAt(anchor.x, anchor.z), anchor.z, yaw, anchor.scale),
        });
      } else {
        const kit = getRubbleHeapKit();
        push('__rubble', kit, {
          matrix: kitMatrix(node.x, layout.heightAt(node.x, node.z), node.z, CAMERA_YAW + (rng() - 0.5) * 0.7, 1.25),
        });
      }
    }
    return [...byKit.entries()];
  }, [graph.nodes, layout, occupied, revealed]);

  return (
    <group>
      {groups.map(([key, { kit, placements }]) => (
        <KitInstances key={key} kit={kit} placements={placements} materials={materials} animate={animate} />
      ))}
    </group>
  );
}

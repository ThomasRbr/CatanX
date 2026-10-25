import { Container } from 'pixi.js';
import { GameState } from '@catanx/engine';
import { HexLayout } from '@catanx/engine';
import { createBuildingSprite } from '../components/Map/BuildingSprite';
import { buildCatanTopology } from '../catan/CatanTopology';

export function renderBuildings(
  container: Container,
  gameState: GameState,
  layout: HexLayout,
  playerColors: Record<string, number>,
): void {
  container.removeChildren();
  const topology = buildCatanTopology(gameState.map, layout);

  const tileStack = new Map<string, number>();
  const intersectionStack = new Map<string, number>();

  for (const [buildingId, building] of gameState.buildings) {
    const tileId = building.tileId;
    const tile = gameState.map.get(tileId);
    if (!tile) continue;

    let idx = tileStack.get(tileId) ?? 0;
    let customCenter: { x: number; y: number } | undefined;

    if (building.placementKind === 'intersection' && building.placementIntersectionId) {
      const intersection = topology.intersections[building.placementIntersectionId];
      if (intersection) {
        customCenter = { x: intersection.x, y: intersection.y };
        idx = intersectionStack.get(building.placementIntersectionId) ?? 0;
        intersectionStack.set(building.placementIntersectionId, idx + 1);
      }
    }

    if (!customCenter) {
      tileStack.set(tileId, idx + 1);
    }

    const sprite = createBuildingSprite(
      building,
      tile,
      layout,
      playerColors[building.ownerId] ?? 0x6b7280,
      idx,
      customCenter,
    );
    container.addChild(sprite);
  }
}

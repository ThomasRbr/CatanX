import { Container, Graphics, Text } from 'pixi.js';
import { BuildingInstance } from '@catanx/engine';
import { HexTile } from '@catanx/engine';
import { HexLayout, hexToPixel } from '@catanx/engine';

function buildingShortLabel(definitionId: string): string {
  const value = definitionId.replace(/_/g, ' ').trim();
  return value.slice(0, 2).toUpperCase();
}

export function createBuildingSprite(
  building: BuildingInstance,
  tile: HexTile,
  layout: HexLayout,
  color: number,
  index = 0,
  customCenter?: { x: number; y: number },
): Container {
  const container = new Container();
  const center = customCenter ?? hexToPixel(tile.coord, layout);

  const isIntersectionPlacement = Boolean(customCenter);
  const cellX = index % 2;
  const cellY = Math.floor(index / 2);
  const baseX = isIntersectionPlacement ? center.x - 8 : center.x - 14;
  const baseY = isIntersectionPlacement ? center.y - 10 : center.y + 8;
  const x = baseX + cellX * 14;
  const y = baseY + cellY * 13;

  const shadow = new Graphics();
  shadow.ellipse(x + 8, y + 11, 8, 3).fill({ color: 0x0c0b0a, alpha: 0.32 });

  const body = new Graphics();
  body.roundRect(x + 2, y + 1, 12, 10, 2).fill({ color: 0xd8ccb6, alpha: 0.95 });
  body.roundRect(x + 2, y + 1, 12, 10, 2).stroke({ color: 0x3b3024, width: 1 });

  const roof = new Graphics();
  roof.poly([x, y + 3, x + 8, y - 3, x + 16, y + 3]).fill({ color: 0x6a3f2d, alpha: 0.98 });
  roof.poly([x, y + 3, x + 8, y - 3, x + 16, y + 3]).stroke({ color: 0x2f1d14, width: 1 });

  const banner = new Graphics();
  banner.rect(x + 12, y - 6, 2, 7).fill({ color: 0x151515, alpha: 0.95 });
  banner.poly([x + 14, y - 6, x + 19, y - 4, x + 14, y - 2]).fill({ color, alpha: 0.9 });

  const hpRatio = Math.max(0, building.health / 100);
  const hp = new Graphics();
  hp.rect(x, y - 10, 16, 3).fill({ color: 0x171717, alpha: 0.78 });
  hp.rect(x, y - 10, 16 * hpRatio, 3).fill({ color: hpRatio > 0.45 ? 0x56c47c : 0xcf6341 });

  const label = new Text({
    text: buildingShortLabel(building.definitionId),
    style: { fontSize: 7, fill: 0x2d241b, fontWeight: '800' },
  });
  label.anchor.set(0.5);
  label.position.set(x + 8, y + 7);

  const level = new Text({
    text: String(building.level),
    style: { fontSize: 7, fill: 0xfef4cf, fontWeight: '700' },
  });
  level.anchor.set(0.5);
  level.position.set(x + 12, y - 2);

  container.addChild(shadow, body, roof, banner, hp, label, level);
  return container;
}

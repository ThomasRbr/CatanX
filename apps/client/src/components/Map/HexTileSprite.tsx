import { Container, Graphics, Text } from 'pixi.js';
import { HexTile } from '@catanx/engine';
import { HexLayout, hexCorners, hexToPixel } from '@catanx/engine';
import { TerrainRenderer } from '../../render/TerrainRenderer';
import { frResource } from '../../i18n/fr';

export interface HexTileSpriteOptions {
  tile: HexTile;
  tileId: string;
  layout: HexLayout;
  terrainRenderer: TerrainRenderer;
  borderColor: number;
  borderWidth: number;
  isHovered: boolean;
}

export function createHexTileSprite(options: HexTileSpriteOptions): Container {
  const { tile, layout, terrainRenderer, borderColor, borderWidth, isHovered } = options;
  const container = new Container();

  const center = hexToPixel(tile.coord, layout);
  const corners = hexCorners(center, layout.size, layout.flat);

  const polygon = new Graphics();
  polygon
    .poly(corners.flatMap((corner) => [corner.x, corner.y]))
    .fill({ color: terrainRenderer.getTerrainColor(tile.terrain), alpha: isHovered ? 0.95 : 1 });
  polygon.stroke({ color: borderColor, width: borderWidth });
  container.addChild(polygon);

  if (tile.diceValue) {
    const diceValue = new Text({
      text: String(tile.diceValue),
      style: {
        fontSize: 13,
        fill: tile.diceValue === 6 || tile.diceValue === 8 ? 0xaf1f1f : 0x202020,
        fontWeight: '700',
      },
    });
    diceValue.anchor.set(0.5);
    diceValue.position.set(center.x, center.y);
    container.addChild(diceValue);
  }

  const firstResource = Object.keys(tile.baseProduction)[0];
  if (firstResource) {
    const label = new Text({
      text: frResource(firstResource).slice(0, 2).toUpperCase(),
      style: { fontSize: 9, fill: 0xffffff, fontWeight: '700' },
    });
    label.anchor.set(0.5);
    label.position.set(center.x, center.y + layout.size * 0.42);
    container.addChild(label);
  }

  return container;
}

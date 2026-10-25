import { Container, Graphics, Text } from 'pixi.js';
import { GameState } from '@catanx/engine';
import { HexLayout, hexCorners, hexToPixel } from '@catanx/engine';
import { TerrainRenderer } from './TerrainRenderer';
import { frResource } from '../i18n/fr';

export interface HexRenderOptions {
  selectedTile: string | null;
  highlightedTiles: Set<string>;
  hoveredTile: string | null;
  currentPlayerId: string;
  layout: HexLayout;
  playerColors: Record<string, number>;
  showGrid: boolean;
}

function scalePolygonTowardsCenter(
  points: number[],
  centerX: number,
  centerY: number,
  factor: number,
): number[] {
  const scaled: number[] = [];
  for (let i = 0; i < points.length; i += 2) {
    const x = points[i];
    const y = points[i + 1];
    scaled.push(centerX + (x - centerX) * factor, centerY + (y - centerY) * factor);
  }
  return scaled;
}

function resourceHint(tile: { baseProduction: Record<string, number> }): string {
  const first = Object.keys(tile.baseProduction)[0];
  if (!first) return '';
  return frResource(first).slice(0, 2).toUpperCase();
}

function drawTerrainPattern(
  g: Graphics,
  terrain: string,
  centerX: number,
  centerY: number,
  radius: number,
): void {
  if (terrain === 'forest' || terrain === 'jungle') {
    for (let i = 0; i < 3; i += 1) {
      const x = centerX - radius * 0.38 + i * radius * 0.36;
      const y = centerY + radius * 0.02 + (i % 2 === 0 ? -2 : 2);
      g.moveTo(x, y + 7)
        .lineTo(x + 4, y)
        .lineTo(x + 8, y + 7)
        .stroke({ color: 0x203d22, width: 1.2, alpha: 0.65 });
    }
    return;
  }

  if (terrain === 'mountain' || terrain === 'hill') {
    g.moveTo(centerX - radius * 0.4, centerY + radius * 0.2)
      .lineTo(centerX - radius * 0.1, centerY - radius * 0.22)
      .lineTo(centerX + radius * 0.15, centerY + radius * 0.18)
      .stroke({ color: 0x2e3138, width: 1.2, alpha: 0.75 });
    g.moveTo(centerX + radius * 0.02, centerY + radius * 0.18)
      .lineTo(centerX + radius * 0.28, centerY - radius * 0.12)
      .lineTo(centerX + radius * 0.4, centerY + radius * 0.18)
      .stroke({ color: 0x2e3138, width: 1, alpha: 0.65 });
    return;
  }

  if (terrain === 'ocean' || terrain === 'coast' || terrain === 'river' || terrain === 'lake') {
    for (let i = 0; i < 2; i += 1) {
      const y = centerY - 2 + i * 5;
      g.moveTo(centerX - radius * 0.32, y)
        .bezierCurveTo(
          centerX - radius * 0.12,
          y - 3,
          centerX + radius * 0.05,
          y + 3,
          centerX + radius * 0.28,
          y,
        )
        .stroke({ color: 0xd9f3ff, width: 1.1, alpha: 0.5 });
    }
  }
}

function drawReliefEdges(g: Graphics, points: { x: number; y: number }[]): void {
  if (points.length < 6) return;

  g.moveTo(points[5].x, points[5].y)
    .lineTo(points[0].x, points[0].y)
    .lineTo(points[1].x, points[1].y)
    .stroke({ color: 0xffffff, width: 1.35, alpha: 0.22 });

  g.moveTo(points[2].x, points[2].y)
    .lineTo(points[3].x, points[3].y)
    .lineTo(points[4].x, points[4].y)
    .stroke({ color: 0x1b110a, width: 1.45, alpha: 0.18 });
}

export function renderHexMap(
  container: Container,
  gameState: GameState,
  terrainRenderer: TerrainRenderer,
  options: HexRenderOptions,
): void {
  container.removeChildren();

  for (const [tileId, tile] of gameState.map) {
    const center = hexToPixel(tile.coord, options.layout);
    const corners = hexCorners(center, options.layout.size, options.layout.flat);
    const polygonPoints = corners.flatMap((corner) => [corner.x, corner.y]);
    const innerPoints = scalePolygonTowardsCenter(polygonPoints, center.x, center.y, 0.88);
    const highlightPoints = scalePolygonTowardsCenter(polygonPoints, center.x, center.y, 0.72);

    const g = new Graphics();
    const terrainTexture = terrainRenderer.getTerrainTexture(tile.terrain);
    const baseColor = terrainRenderer.getTerrainColor(tile.terrain);
    const accentColor = terrainRenderer.getTerrainAccentColor(tile.terrain);

    if (terrainTexture) {
      g.poly(polygonPoints).fill({ texture: terrainTexture, alpha: 1 });
    } else {
      g.poly(polygonPoints).fill({ color: baseColor, alpha: 1 });
    }

    g.poly(innerPoints).fill({ color: accentColor, alpha: 0.22 });
    g.poly(highlightPoints).fill({
      color: 0xffffff,
      alpha: tile.terrain === 'ocean' ? 0.07 : 0.05,
    });
    drawTerrainPattern(g, tile.terrain, center.x, center.y, options.layout.size);
    drawReliefEdges(g, corners);

    const ownerColor = tile.owner ? (options.playerColors[tile.owner] ?? 0x352f2b) : 0x3a302a;
    const selected = options.selectedTile === tileId;
    const highlighted = options.highlightedTiles.has(tileId);
    const hovered = options.hoveredTile === tileId;
    const borderColor = selected
      ? 0xf8e7a8
      : highlighted
        ? 0x6ad9c2
        : hovered
          ? 0xf3bf75
          : options.showGrid
            ? ownerColor
            : 0x1a1a1a;
    const borderWidth = selected
      ? 4
      : highlighted
        ? 3
        : hovered
          ? 2.4
          : options.showGrid
            ? 1.8
            : 0.6;
    const borderAlpha = selected || highlighted || hovered ? 0.96 : options.showGrid ? 0.78 : 0.22;
    g.stroke({ color: borderColor, width: borderWidth, alpha: borderAlpha });
    container.addChild(g);

    if (tile.diceValue) {
      const diceBadge = new Graphics();
      diceBadge.circle(center.x, center.y - 1, 11).fill({ color: 0xf6ecd2, alpha: 0.95 });
      diceBadge
        .circle(center.x, center.y - 1, 11)
        .stroke({ color: 0x4b3d2a, width: 1.4, alpha: 0.9 });
      container.addChild(diceBadge);

      const diceText = new Text({
        text: String(tile.diceValue),
        style: {
          fill: tile.diceValue === 6 || tile.diceValue === 8 ? 0x8d1414 : 0x2a2a2a,
          fontSize: 13,
          fontWeight: '800',
        },
      });
      diceText.anchor.set(0.5);
      diceText.position.set(center.x, center.y - 1);
      container.addChild(diceText);
    }

    const terrainGlyph = new Text({
      text: terrainRenderer.getTerrainGlyph(tile.terrain),
      style: {
        fill: 0x1f1d1a,
        fontSize: 8,
        fontWeight: '700',
      },
    });
    terrainGlyph.anchor.set(0.5);
    terrainGlyph.position.set(
      center.x - options.layout.size * 0.32,
      center.y + options.layout.size * 0.34,
    );
    container.addChild(terrainGlyph);

    const res = resourceHint(tile);
    if (res) {
      const badgeBg = new Graphics();
      badgeBg
        .roundRect(
          center.x + options.layout.size * 0.06,
          center.y + options.layout.size * 0.24,
          22,
          12,
          4,
        )
        .fill({ color: 0x1f2937, alpha: 0.64 })
        .stroke({ color: 0xe9d8a6, width: 1, alpha: 0.7 });
      container.addChild(badgeBg);

      const badge = new Text({
        text: res,
        style: {
          fill: 0xf8f2df,
          fontSize: 8,
          fontWeight: '700',
        },
      });
      badge.anchor.set(0.5);
      badge.position.set(
        center.x + options.layout.size * 0.21,
        center.y + options.layout.size * 0.31,
      );
      container.addChild(badge);
    }

    if (tile.port) {
      const port = new Text({
        text: 'PORT',
        style: { fill: 0xd9fbff, fontSize: 7, fontWeight: '700' },
      });
      port.anchor.set(0.5);
      port.position.set(
        center.x - options.layout.size * 0.36,
        center.y - options.layout.size * 0.33,
      );
      container.addChild(port);
    }

    if (tile.robber) {
      const robber = new Text({
        text: 'BRI',
        style: { fill: 0xfca5a5, fontSize: 7, fontWeight: '700' },
      });
      robber.anchor.set(0.5);
      robber.position.set(
        center.x + options.layout.size * 0.35,
        center.y - options.layout.size * 0.33,
      );
      container.addChild(robber);
    }
  }
}

import { Container, Graphics } from 'pixi.js';
import { HexLayout, hexToId, hexToPixel } from '@catanx/engine';
import { GameState } from '@catanx/engine';
import { RoadSegment } from '@catanx/engine';

function drawSolid(
  g: Graphics,
  from: { x: number; y: number },
  to: { x: number; y: number },
  color: number,
  width: number,
  alpha = 0.95,
): void {
  g.moveTo(from.x, from.y).lineTo(to.x, to.y).stroke({ color, width, alpha });
}

function drawDashed(
  g: Graphics,
  from: { x: number; y: number },
  to: { x: number; y: number },
  color: number,
  width: number,
): void {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const length = Math.hypot(dx, dy);
  if (length <= 0.01) return;

  const ux = dx / length;
  const uy = dy / length;
  const dash = 9;
  const gap = 6;
  let offset = 0;

  while (offset < length) {
    const start = offset;
    const end = Math.min(length, offset + dash);
    drawSolid(
      g,
      { x: from.x + ux * start, y: from.y + uy * start },
      { x: from.x + ux * end, y: from.y + uy * end },
      color,
      width,
    );
    offset += dash + gap;
  }
}

function drawBridge(
  g: Graphics,
  from: { x: number; y: number },
  to: { x: number; y: number },
  color: number,
): void {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const length = Math.hypot(dx, dy);
  if (length <= 0.01) return;
  const nx = -dy / length;
  const ny = dx / length;
  const offset = 2.4;

  drawSolid(
    g,
    { x: from.x + nx * offset, y: from.y + ny * offset },
    { x: to.x + nx * offset, y: to.y + ny * offset },
    color,
    2.3,
    0.94,
  );
  drawSolid(
    g,
    { x: from.x - nx * offset, y: from.y - ny * offset },
    { x: to.x - nx * offset, y: to.y - ny * offset },
    color,
    2.3,
    0.94,
  );
}

function drawCanal(
  g: Graphics,
  from: { x: number; y: number },
  to: { x: number; y: number },
  ownerColor: number,
): void {
  drawSolid(g, from, to, 0x2f89bd, 5.8, 0.76);
  drawSolid(g, from, to, 0x9dd5ff, 2.2, 0.88);
  drawSolid(g, from, to, ownerColor, 1.2, 0.62);
}

function drawAqueduct(
  g: Graphics,
  from: { x: number; y: number },
  to: { x: number; y: number },
  color: number,
): void {
  drawSolid(g, from, to, 0xe7d2a2, 6, 0.74);
  drawSolid(g, from, to, color, 3.4, 0.88);
  drawSolid(g, from, to, 0x4a3b2c, 1.1, 0.45);
}

function renderRoadByType(
  g: Graphics,
  road: RoadSegment,
  from: { x: number; y: number },
  to: { x: number; y: number },
  ownerColor: number,
): void {
  if (road.type === 'bridge') {
    drawBridge(g, from, to, ownerColor);
    return;
  }
  if (road.type === 'canal') {
    drawCanal(g, from, to, ownerColor);
    return;
  }
  if (road.type === 'aqueduct') {
    drawAqueduct(g, from, to, ownerColor);
    return;
  }
  drawDashed(g, from, to, ownerColor, 3);
}

export function renderRoutes(
  container: Container,
  gameState: GameState,
  layout: HexLayout,
  playerColors: Record<string, number>,
): void {
  container.removeChildren();
  const seen = new Set<string>();

  for (const [playerId, player] of gameState.players) {
    const ownerColor = playerColors[playerId] ?? 0xe4ccb2;
    for (const road of player.roads) {
      const a = hexToPixel(road.from, layout);
      const b = hexToPixel(road.to, layout);
      const key = `${[hexToId(road.from), hexToId(road.to)].sort().join('|')}|${playerId}|${road.type}`;
      if (seen.has(key)) continue;
      seen.add(key);

      const g = new Graphics();
      renderRoadByType(g, road, a, b, ownerColor);
      g.circle(a.x, a.y, 2.2).fill({ color: ownerColor, alpha: 0.8 });
      g.circle(b.x, b.y, 2.2).fill({ color: ownerColor, alpha: 0.8 });
      container.addChild(g);
    }
  }
}

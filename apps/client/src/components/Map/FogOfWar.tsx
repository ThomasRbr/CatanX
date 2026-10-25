import { Container, Graphics } from 'pixi.js';
import { GameState } from '@catanx/engine';
import { HexLayout, hexCorners, hexToPixel } from '@catanx/engine';

const fogCache = new WeakMap<Container, Map<string, Graphics>>();

function getFogMap(container: Container): Map<string, Graphics> {
  let value = fogCache.get(container);
  if (!value) {
    value = new Map<string, Graphics>();
    fogCache.set(container, value);
  }
  return value;
}

export function renderFogOfWar(
  container: Container,
  gameState: GameState,
  currentPlayerId: string,
  layout: HexLayout,
): void {
  const fogByTile = getFogMap(container);
  const seen = new Set<string>();

  for (const [tileId, tile] of gameState.map) {
    const explored = tile.explored.has(currentPlayerId);
    const visible = tile.visible.has(currentPlayerId);
    const targetAlpha = visible ? 0 : explored ? 0.34 : 0.76;

    let fog = fogByTile.get(tileId);
    if (!fog) {
      fog = new Graphics();
      fogByTile.set(tileId, fog);
      container.addChild(fog);
    }

    const center = hexToPixel(tile.coord, layout);
    const corners = hexCorners(center, layout.size, layout.flat);

    fog.clear();
    fog.poly(corners.flatMap((corner) => [corner.x, corner.y])).fill({
      color: explored ? 0x3a404c : 0x0b0d10,
      alpha: targetAlpha,
    });

    seen.add(tileId);
  }

  for (const [tileId, fog] of fogByTile) {
    if (seen.has(tileId)) continue;
    fog.destroy();
    fogByTile.delete(tileId);
  }
}

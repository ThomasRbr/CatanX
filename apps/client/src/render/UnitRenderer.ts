import { Container } from 'pixi.js';
import { GameState } from '@catanx/engine';
import { HexLayout } from '@catanx/engine';
import { createUnitSprite } from '../components/Map/UnitSprite';

export function renderUnits(
  container: Container,
  gameState: GameState,
  layout: HexLayout,
  playerColors: Record<string, number>,
): void {
  container.removeChildren();

  const tileCounters = new Map<string, number>();

  for (const [, unit] of gameState.units) {
    const tileKey = `${unit.position.q},${unit.position.r},${unit.position.s}`;
    const index = tileCounters.get(tileKey) ?? 0;
    tileCounters.set(tileKey, index + 1);

    const sprite = createUnitSprite(unit, layout, playerColors[unit.ownerId] ?? 0x2f3e46);

    // Offset multiple units on the same tile into a small arc.
    const angle = (Math.PI / 3) * index;
    sprite.position.set(Math.cos(angle) * 8, Math.sin(angle) * 8);

    container.addChild(sprite);
  }
}

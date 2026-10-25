/** World-space offsets for stacking multiple entities on one tile / intersection. */

export function tileStackOffset(index: number): { x: number; z: number } {
  const cellX = index % 2;
  const cellY = Math.floor(index / 2);
  return {
    x: -0.22 + cellX * 0.28,
    z: 0.12 + cellY * 0.26,
  };
}

export function intersectionStackOffset(index: number): { x: number; z: number } {
  const cellX = index % 2;
  const cellY = Math.floor(index / 2);
  return {
    x: -0.1 + cellX * 0.16,
    z: -0.08 + cellY * 0.14,
  };
}

/** Arc layout for multiple units on the same hex (matches Pixi UnitRenderer). */
export function unitStackOffset(index: number, radius = 0.22): { x: number; z: number } {
  const angle = (Math.PI / 3) * index;
  return {
    x: Math.cos(angle) * radius,
    z: Math.sin(angle) * radius,
  };
}

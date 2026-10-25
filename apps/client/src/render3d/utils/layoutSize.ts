/** Map layout size (Pixi-compatible) from map radius — used by ThreeHexBoard. */
export function resolveLayoutSize(mapRadius: number): number {
  if (mapRadius <= 3) return 56;
  if (mapRadius <= 5) return 48;
  if (mapRadius <= 6) return 42;
  return 36;
}

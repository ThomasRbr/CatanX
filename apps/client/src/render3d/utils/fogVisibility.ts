/**
 * Fog alpha for a tile given viewer visibility (matches Pixi FogOfWar).
 * visible → 0, explored → ~0.34, unexplored → ~0.76
 */
export function fogAlphaForTile(explored: boolean, visible: boolean): number {
  if (visible) return 0;
  if (explored) return 0.34;
  return 0.76;
}

export function fogColorForTile(explored: boolean): string {
  return explored ? '#3a404c' : '#0b0d10';

}

export function shouldRenderFog(fogOfWar: boolean, phase: string): boolean {
  return fogOfWar && phase !== 'setup';
}

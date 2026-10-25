/** Orthographic zoom → LOD (CameraControls MIN=22 MAX=130). */
export type MapLodLevel = 0 | 1 | 2;

/**
 * Classify zoom with hysteresis to avoid scrub thrash near thresholds.
 * enterLod2 < 38, leaveLod2 > 42; enterLod0 > 72, leaveLod0 < 66.
 */
export function zoomToLod(zoom: number, previous: MapLodLevel = 1): MapLodLevel {
  if (previous === 2) {
    if (zoom > 42) return zoom > 72 ? 0 : 1;
    return 2;
  }
  if (previous === 0) {
    if (zoom < 66) return zoom < 38 ? 2 : 1;
    return 0;
  }
  // previous === 1
  if (zoom < 38) return 2;
  if (zoom > 72) return 0;
  return 1;
}

export function shouldAnimateDecor(animate: boolean, lod: MapLodLevel): boolean {
  return animate && lod < 2;
}

export function shouldShowScrub(lod: MapLodLevel): boolean {
  return lod < 2;
}

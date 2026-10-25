import type { TerrainType } from '@catanx/engine';
import type { OrthographicCamera, Vector3 } from 'three';
import type { WorldCoord } from '../utils/hexToWorld';

const WATER_TERRAINS = new Set<TerrainType>(['ocean', 'coast', 'lake', 'river']);

export interface WorldBounds {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

export function computeWorldBounds(
  positions: WorldCoord[],
  padding = 1.2,
): WorldBounds {
  if (positions.length === 0) {
    return { minX: -5, maxX: 5, minZ: -5, maxZ: 5 };
  }

  let minX = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let minZ = Number.POSITIVE_INFINITY;
  let maxZ = Number.NEGATIVE_INFINITY;

  for (const p of positions) {
    minX = Math.min(minX, p.x);
    maxX = Math.max(maxX, p.x);
    minZ = Math.min(minZ, p.z);
    maxZ = Math.max(maxZ, p.z);
  }

  return {
    minX: minX - padding,
    maxX: maxX + padding,
    minZ: minZ - padding,
    maxZ: maxZ + padding,
  };
}

export function boundsCenter(bounds: WorldBounds): { x: number; z: number } {
  return {
    x: (bounds.minX + bounds.maxX) / 2,
    z: (bounds.minZ + bounds.maxZ) / 2,
  };
}

/** H7 — frame the island, not the full ocean padding. */
export function computeIslandBounds(
  tiles: Array<{ terrain: TerrainType; position: WorldCoord }>,
  landPadding = 0.72,
  oceanFallbackPadding = 1.35,
): WorldBounds {
  const land = tiles.filter((t) => !WATER_TERRAINS.has(t.terrain));
  const source = land.length > 0 ? land : tiles;
  const padding = land.length > 0 ? landPadding : oceanFallbackPadding;
  return computeWorldBounds(
    source.map((t) => t.position),
    padding,
  );
}

/** Choose orthographic zoom so the full map fits the viewport (with margin). */
export interface FitZoomOptions {
  margin?: number;
  /** HUD safe-area insets in CSS pixels — island frames into remaining space. */
  hudInsets?: { top?: number; right?: number; bottom?: number; left?: number };
}

export function fitOrthographicZoom(
  camera: OrthographicCamera,
  bounds: WorldBounds,
  viewWidth: number,
  viewHeight: number,
  marginOrOptions: number | FitZoomOptions = 1.05,
): number {
  const options: FitZoomOptions =
    typeof marginOrOptions === 'number' ? { margin: marginOrOptions } : marginOrOptions;
  const margin = options.margin ?? 1.05;
  const insets = options.hudInsets ?? {};
  const usableW = Math.max(120, viewWidth - (insets.left ?? 0) - (insets.right ?? 0));
  const usableH = Math.max(120, viewHeight - (insets.top ?? 0) - (insets.bottom ?? 0));

  const mapWidth = Math.max(1e-3, bounds.maxX - bounds.minX) * margin;
  const mapHeight = Math.max(1e-3, bounds.maxZ - bounds.minZ) * margin;

  // R3F ortho frustum: visible = (viewSize / zoom) along each axis (before tilt).
  const zoomX = usableW / mapWidth;
  const zoomZ = usableH / mapHeight;
  // Tilted view foreshortens the board — bias zoom slightly lower so the map fits.
  // The sea is continuous now, so the landmass can occupy the premium table
  // frame more confidently without exposing an artificial ocean-tile ring.
  return Math.min(zoomX, zoomZ) * 0.95;
}

export function clampTargetToBounds(
  target: Vector3,
  bounds: WorldBounds,
  slack = 0.5,
): void {
  target.x = Math.min(bounds.maxX + slack, Math.max(bounds.minX - slack, target.x));
  target.z = Math.min(bounds.maxZ + slack, Math.max(bounds.minZ - slack, target.z));
  target.y = 0;
}

import type { CivilizationType } from '@catanx/engine';
import type { BuildingVisual } from '../utils/buildingVisual';

export type ClusterPartKind =
  | 'house'
  | 'cottage'
  | 'hall'
  | 'tower'
  | 'well'
  | 'crate'
  | 'barrel'
  | 'campfire'
  | 'civColumn'
  | 'civAwning';

export interface ClusterPart {
  kind: ClusterPartKind;
  assetId: string;
  x: number;
  z: number;
  rot: number;
  scale: number;
  playerTint?: boolean;
}

function hashString(value: string): number {
  let h = 0;
  for (let i = 0; i < value.length; i++) h = (h * 31 + value.charCodeAt(i)) | 0;
  return Math.abs(h);
}

function houseAsset(seed: number, i: number): string {
  return (seed + i) % 2 === 0 ? 'house_settlement_a' : 'house_settlement_b';
}

/**
 * Compact multi-building layouts (H5 polish).
 * Cities read clearly larger than settlements at intersection scale.
 */
export function resolveBuildingCluster(
  visual: BuildingVisual,
  buildingId: string,
  civilization: CivilizationType | string | null | undefined = 'empire',
): ClusterPart[] {
  if (visual !== 'settlement' && visual !== 'city' && visual !== 'metropolis') return [];

  const seed = hashString(buildingId);
  const civ = (civilization ?? 'empire') as CivilizationType | string;
  const parts: ClusterPart[] = [];

  if (visual === 'settlement') {
    // Primary + one satellite (readable hameau, not a crowd).
    parts.push({
      kind: 'house',
      assetId: houseAsset(seed, 0),
      x: -0.05,
      z: 0.02,
      rot: (seed % 6) * (Math.PI / 6),
      scale: 0.72,
    });
    parts.push({
      kind: 'cottage',
      assetId: houseAsset(seed, 1),
      x: 0.09,
      z: -0.04,
      rot: Math.PI * 0.7 + (seed % 5) * 0.1,
      scale: 0.55,
    });
    if (seed % 2 === 0) {
      parts.push({
        kind: 'well',
        assetId: 'well_a',
        x: 0.02,
        z: 0.11,
        rot: 0,
        scale: 0.4,
      });
    } else {
      parts.push({
        kind: 'campfire',
        assetId: 'campfire_a',
        x: 0.01,
        z: 0.1,
        rot: 0,
        scale: 0.45,
      });
    }
  } else {
    // City hall dominant; satellites in a wider ring so the mass reads as a ville.
    parts.push({
      kind: 'hall',
      assetId: 'house_city_a',
      x: 0,
      z: -0.02,
      rot: (seed % 6) * (Math.PI / 3),
      scale: visual === 'metropolis' ? 1.15 : 1.05,
    });
    const sats = visual === 'metropolis' ? 4 : 3;
    for (let i = 0; i < sats; i++) {
      const a = (i / sats) * Math.PI * 2 + 0.35;
      const rr = 0.18 + (i % 2) * 0.03;
      parts.push({
        kind: 'house',
        assetId: houseAsset(seed, i + 2),
        x: Math.cos(a) * rr,
        z: Math.sin(a) * rr,
        rot: a + Math.PI,
        scale: 0.52 + (i % 2) * 0.06,
      });
    }
    parts.push({
      kind: 'crate',
      assetId: 'crate_a',
      x: 0.12,
      z: 0.08,
      rot: 0.5,
      scale: 0.38,
    });
    parts.push({
      kind: 'barrel',
      assetId: 'barrel_a',
      x: -0.11,
      z: 0.09,
      rot: 0.2,
      scale: 0.4,
    });
    if (visual === 'metropolis') {
      parts.push({
        kind: 'tower',
        assetId: 'tower_a',
        x: -0.06,
        z: -0.14,
        rot: 0,
        scale: 0.72,
        playerTint: true,
      });
    }
  }

  appendCivAccent(parts, civ, seed, visual);
  return parts;
}

function appendCivAccent(
  parts: ClusterPart[],
  civ: string,
  seed: number,
  visual: BuildingVisual,
): void {
  // Keep settlements light — civ flair mostly on cities.
  const cityLike = visual === 'city' || visual === 'metropolis';

  switch (civ) {
    case 'merchants':
      parts.push({
        kind: 'civAwning',
        assetId: 'civ_awning_a',
        x: cityLike ? 0.07 : 0.05,
        z: cityLike ? -0.09 : -0.08,
        rot: 0.25,
        scale: cityLike ? 0.42 : 0.34,
        playerTint: true,
      });
      if (cityLike) {
        parts.push({
          kind: 'crate',
          assetId: 'crate_a',
          x: -0.11,
          z: -0.05,
          rot: 1.0,
          scale: 0.28,
        });
      }
      break;
    case 'empire':
      if (cityLike) {
        parts.push({
          kind: 'civColumn',
          assetId: 'civ_column_a',
          x: -0.12,
          z: 0.05,
          rot: 0,
          scale: 0.52,
        });
      }
      break;
    case 'northerners':
      if (!parts.some((p) => p.kind === 'campfire')) {
        parts.push({
          kind: 'campfire',
          assetId: 'campfire_a',
          x: 0.04,
          z: -0.1,
          rot: 0,
          scale: 0.4,
        });
      }
      break;
    case 'scholars':
      if (cityLike) {
        parts.push({
          kind: 'civColumn',
          assetId: 'civ_column_a',
          x: 0.09,
          z: -0.06,
          rot: 0.15,
          scale: 0.4,
          playerTint: true,
        });
      }
      break;
    case 'engineers':
      if (cityLike) {
        parts.push({
          kind: 'crate',
          assetId: 'crate_a',
          x: 0.08,
          z: 0.09,
          rot: 0.6,
          scale: 0.3,
        });
      }
      break;
    case 'theocracy':
      if (cityLike) {
        parts.push({
          kind: 'civColumn',
          assetId: 'civ_column_a',
          x: 0,
          z: 0.1,
          rot: 0,
          scale: 0.38,
          playerTint: true,
        });
      }
      break;
    case 'nomads':
    case 'diplomats':
    default:
      if (cityLike && seed % 2 === 0) {
        parts.push({
          kind: 'barrel',
          assetId: 'barrel_a',
          x: 0.11,
          z: -0.03,
          rot: 0.4,
          scale: 0.3,
        });
      }
      break;
  }
}

export function clusterPartCount(visual: BuildingVisual): number {
  return resolveBuildingCluster(visual, 'probe', 'empire').length;
}

import type { UndergroundDiscoveryKind } from '@catanx/engine';

/**
 * Signature colour of each discovery. Kept from the first underground pass so
 * a kind stays recognisable across the 3D layer, the panel and the docs.
 */
export const DISCOVERY_COLORS: Record<UndergroundDiscoveryKind, string> = {
  fossil_roots: '#9a775a',
  clay_bank: '#d07455',
  fungiculture: '#df9cff',
  woolly_lichen: '#9fd7b4',
  iron_vein: '#9db0c2',
  crystal_geode: '#62f2e7',
  aether_breath: '#a78cff',
  thermal_spring: '#ff9f72',
  natural_well: '#63c7ff',
  ancient_workshop: '#ffc85c',
  sealed_chamber: '#d7c5ff',
  unstable_fault: '#ff665f',
};

/**
 * Colour of the light a revealed chamber throws on its walls. Dull kinds
 * (roots, clay, iron) get a warm torch tint so they still read as "explored".
 */
export const CHAMBER_LIGHT: Record<UndergroundDiscoveryKind, { color: string; intensity: number }> = {
  fossil_roots: { color: '#ffb36b', intensity: 1.35 },
  clay_bank: { color: '#ff9a62', intensity: 1.35 },
  fungiculture: { color: '#e08cff', intensity: 1.65 },
  woolly_lichen: { color: '#8cffbf', intensity: 1.35 },
  iron_vein: { color: '#a9cfff', intensity: 1.35 },
  crystal_geode: { color: '#4ff5ea', intensity: 1.85 },
  aether_breath: { color: '#9d7bff', intensity: 1.8 },
  thermal_spring: { color: '#ff8a4f', intensity: 1.7 },
  natural_well: { color: '#4fb8ff', intensity: 1.6 },
  ancient_workshop: { color: '#ffc457', intensity: 1.6 },
  sealed_chamber: { color: '#cdb8ff', intensity: 1.45 },
  unstable_fault: { color: '#ff3a2c', intensity: 2.2 },
};

export const TORCH_COLOR = '#ffae5c';
export const CRYSTAL_COLOR = '#5fe8ff';
export const LEAK_COLOR = '#ff9a40';
export const DAYLIGHT_COLOR = '#ffe3b8';

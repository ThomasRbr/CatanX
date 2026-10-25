import type { GameEvent } from '@catanx/engine';

export type EventMarkerKind = 'fire' | 'snow' | 'rain' | 'mist' | 'gold' | 'ruins' | 'sacred' | 'generic';

export function eventMarkerKind(event: Pick<GameEvent, 'type'>): EventMarkerKind {
  const t = event.type;
  if (
    t === 'forest_fire' ||
    t === 'volcano_eruption' ||
    t === 'meteor_impact' ||
    t === 'drought'
  ) {
    return 'fire';
  }
  if (t === 'harsh_winter' || t === 'blizzard') return 'snow';
  if (t === 'heavy_rains' || t === 'flood' || t === 'tsunami' || t === 'storm') return 'rain';
  if (t === 'plague_minor' || t === 'plague_major' || t === 'famine' || t === 'heresy') {
    return 'mist';
  }
  if (t === 'gold_rush' || t === 'new_deposit' || t === 'golden_summer' || t === 'trade_boom') {
    return 'gold';
  }
  if (t === 'ancient_ruins_found' || t === 'earthquake' || t === 'landslide') return 'ruins';
  if (t === 'miracle' || t === 'pilgrimage' || t === 'prophecy' || t === 'crusade') return 'sacred';
  return 'generic';
}

export const EVENT_MARKER_COLOR: Record<EventMarkerKind, string> = {
  fire: '#e07040',
  snow: '#c8d8f0',
  rain: '#4a8ab8',
  mist: '#8a90a0',
  gold: '#d4a84a',
  ruins: '#b89870',
  sacred: '#b090d0',
  generic: '#f0c040',
};

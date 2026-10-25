import { describe, expect, it } from 'vitest';
import { eventMarkerKind, EVENT_MARKER_COLOR } from '../eventMarkerKind';

describe('eventMarkerKind H6', () => {
  it('maps natural disasters to readable kinds', () => {
    expect(eventMarkerKind({ type: 'volcano_eruption' })).toBe('fire');
    expect(eventMarkerKind({ type: 'blizzard' })).toBe('snow');
    expect(eventMarkerKind({ type: 'flood' })).toBe('rain');
    expect(eventMarkerKind({ type: 'gold_rush' })).toBe('gold');
    expect(eventMarkerKind({ type: 'ancient_ruins_found' })).toBe('ruins');
    expect(eventMarkerKind({ type: 'miracle' })).toBe('sacred');
  });

  it('exposes colors for every kind', () => {
    for (const kind of Object.keys(EVENT_MARKER_COLOR) as Array<keyof typeof EVENT_MARKER_COLOR>) {
      expect(EVENT_MARKER_COLOR[kind].startsWith('#')).toBe(true);
    }
  });
});

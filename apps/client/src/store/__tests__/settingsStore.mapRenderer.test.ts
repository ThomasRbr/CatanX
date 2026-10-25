import { describe, expect, it } from 'vitest';
import { migrateSettingsState, useSettingsStore } from '../settingsStore';

describe('settingsStore mapRenderer', () => {
  it('exposes Diorama as the production renderer and keeps both fallbacks', () => {
    useSettingsStore.setState({ mapRenderer: 'diorama' });
    expect(useSettingsStore.getState().mapRenderer).toBe('diorama');
    useSettingsStore.getState().setMapRenderer('threeLegacy');
    expect(useSettingsStore.getState().mapRenderer).toBe('threeLegacy');
    useSettingsStore.getState().setMapRenderer('pixi');
    expect(useSettingsStore.getState().mapRenderer).toBe('pixi');
    useSettingsStore.getState().setMapRenderer('diorama');
    expect(useSettingsStore.getState().mapRenderer).toBe('diorama');
  });
});

describe('migrateSettingsState', () => {
  it('forces three when upgrading from pre-G (version < 1)', () => {
    const next = migrateSettingsState({ mapRenderer: 'pixi', showGrid: false }, 0);
    expect(next.mapRenderer).toBe('diorama');
    expect(next.showGrid).toBe(false);
  });

  it('recovers three when upgrading past the transient Pixi fallback bug', () => {
    const next = migrateSettingsState({ mapRenderer: 'pixi', showFpsMeter: true }, 1);
    expect(next.mapRenderer).toBe('diorama');
    expect(next.showFpsMeter).toBe(true);
  });

  it('adds visualQuality and uiScale when upgrading to v2', () => {
    const next = migrateSettingsState({ mapRenderer: 'pixi' }, 1);
    expect(next.mapRenderer).toBe('diorama');
    expect(next.visualQuality).toBe('auto');
    expect(next.uiScale).toBe(1);
  });

  it('preserves explicit visualQuality on v2+', () => {
    const next = migrateSettingsState(
      { mapRenderer: 'diorama', visualQuality: 'high', uiScale: 1.1 },
      2,
    );
    expect(next.visualQuality).toBe('high');
    expect(next.uiScale).toBe(1.1);
    expect(next.mapRenderer).toBe('diorama');
  });

  it('preserves an explicit Pixi choice after the v3 recovery migration', () => {
    const next = migrateSettingsState({ mapRenderer: 'pixi' }, 3);
    expect(next.mapRenderer).toBe('pixi');
  });

  it('recovers a valid visual tier while migrating to v4', () => {
    const invalid = migrateSettingsState({ visualQuality: 'cinematic' as never }, 3);
    expect(invalid.visualQuality).toBe('auto');
    const ultra = migrateSettingsState({ visualQuality: 'ultra' }, 3);
    expect(ultra.visualQuality).toBe('ultra');
  });

  it('migrates the former Three value to Diorama and adds the backend preference', () => {
    const next = migrateSettingsState({ mapRenderer: 'three' as never }, 4);
    expect(next.mapRenderer).toBe('diorama');
    expect(next.graphicsBackend).toBe('auto');
  });
});

describe('settingsStore visualQuality', () => {
  it('defaults to auto and accepts every realistic tier', () => {
    useSettingsStore.setState({ visualQuality: 'auto', uiScale: 1 });
    expect(useSettingsStore.getState().visualQuality).toBe('auto');
    useSettingsStore.getState().setVisualQuality('balanced');
    expect(useSettingsStore.getState().visualQuality).toBe('balanced');
    useSettingsStore.getState().setVisualQuality('low');
    expect(useSettingsStore.getState().visualQuality).toBe('low');
    useSettingsStore.getState().setVisualQuality('ultra');
    expect(useSettingsStore.getState().visualQuality).toBe('ultra');
    useSettingsStore.getState().setUiScale(1.5);
    expect(useSettingsStore.getState().uiScale).toBe(1.25);
  });
});

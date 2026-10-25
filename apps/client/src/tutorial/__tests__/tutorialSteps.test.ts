import { describe, expect, it } from 'vitest';
import { buildTutorialSteps, findActiveTutorialStep } from '../tutorialSteps';

describe('buildTutorialSteps', () => {
  it('marks classic dice step done when player rolled this turn', () => {
    const steps = buildTutorialSteps({
      classicMode: true,
      isInitialPlacement: false,
      hasRolledDiceThisTurn: true,
      selectedTileId: null,
      sidePanelTab: 'tile',
      currentTurn: 1,
      turnPhase: 'player_action',
      hasBuiltThisTurn: false,
      hasTradedThisTurn: false,
      hasEndedTurnOnce: false,
    });

    expect(steps.find((step) => step.id === 'dice')?.done).toBe(true);
    expect(findActiveTutorialStep(steps).id).not.toBe('dice');
  });

  it('keeps seven step open during robber phase after dice roll', () => {
    const steps = buildTutorialSteps({
      classicMode: true,
      isInitialPlacement: false,
      hasRolledDiceThisTurn: true,
      selectedTileId: null,
      sidePanelTab: 'tile',
      currentTurn: 2,
      turnPhase: 'move_robber',
      hasBuiltThisTurn: false,
      hasTradedThisTurn: false,
      hasEndedTurnOnce: false,
    });

    expect(steps.find((step) => step.id === 'seven')?.done).toBe(false);
    expect(findActiveTutorialStep(steps).id).toBe('seven');
  });

  it('does not mark seven step done before dice roll', () => {
    const steps = buildTutorialSteps({
      classicMode: true,
      isInitialPlacement: false,
      hasRolledDiceThisTurn: false,
      selectedTileId: null,
      sidePanelTab: 'tile',
      currentTurn: 1,
      turnPhase: 'player_action',
      hasBuiltThisTurn: false,
      hasTradedThisTurn: false,
      hasEndedTurnOnce: false,
    });

    expect(steps.find((step) => step.id === 'seven')?.done).toBe(false);
  });

  it('tracks placement settlement step from placement phase', () => {
    const steps = buildTutorialSteps({
      classicMode: true,
      isInitialPlacement: true,
      placementStep: 'road',
      hasRolledDiceThisTurn: false,
      selectedTileId: null,
      sidePanelTab: 'tile',
      currentTurn: 1,
      turnPhase: 'setup',
      hasBuiltThisTurn: false,
      hasTradedThisTurn: false,
      hasEndedTurnOnce: false,
    });

    expect(steps.find((step) => step.id === 'settlement')?.done).toBe(true);
    expect(findActiveTutorialStep(steps).id).toBe('road');
  });

  it('uses catanx tile inspection flow outside classic mode', () => {
    const steps = buildTutorialSteps({
      classicMode: false,
      isInitialPlacement: false,
      hasRolledDiceThisTurn: false,
      selectedTileId: 'tile-1',
      sidePanelTab: 'tile',
      currentTurn: 1,
      turnPhase: 'player_action',
      hasBuiltThisTurn: false,
      hasTradedThisTurn: false,
      hasEndedTurnOnce: false,
    });

    expect(steps.find((step) => step.id === 'tile')?.done).toBe(true);
    expect(findActiveTutorialStep(steps).id).toBe('dice');
  });

  it('adds cities & knights coach steps when extension is on', () => {
    const steps = buildTutorialSteps({
      classicMode: true,
      citiesKnights: true,
      isInitialPlacement: false,
      hasRolledDiceThisTurn: true,
      selectedTileId: null,
      sidePanelTab: 'tile',
      currentTurn: 2,
      turnPhase: 'player_action',
      hasBuiltThisTurn: false,
      hasTradedThisTurn: false,
      hasEndedTurnOnce: false,
      hasCkKnight: false,
      hasSeenBarbarians: false,
      hasImprovedUrban: false,
    });

    expect(steps.some((step) => step.id === 'ck_barbarians')).toBe(true);
    expect(steps.some((step) => step.id === 'ck_knights')).toBe(true);
    expect(steps.find((step) => step.id === 'seven')).toBeUndefined();
    expect(findActiveTutorialStep(steps).id).toBe('ck_barbarians');
  });
});

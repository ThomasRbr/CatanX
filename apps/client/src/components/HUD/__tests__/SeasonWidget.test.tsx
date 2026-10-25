// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { GameState } from '@catanx/engine';
import { SeasonWidget } from '../SeasonWidget';

afterEach(cleanup);

function vigilState(): GameState {
  return {
    config: {
      mode: 'catanx',
      extensions: {
        seasons: {
          enabled: true,
          ruleset: 'catanx-seasons-v2',
          roundsPerSeason: 5,
          forecastDepth: 1,
          preparationMode: 'secret-simultaneous',
          maxSeverePerYear: 2,
          allowConsecutiveSevere: false,
        },
      },
    },
    turnOrder: ['p1', 'p2', 'p3'],
    players: new Map(),
    extensions: {
      seasons: {
        currentSeason: 'summer',
        roundInSeason: 5,
        seasonYear: 2,
        currentClimateId: 'summer_golden',
        forecastClimateId: 'autumn_golden_harvest',
        decks: { spring: [], summer: [], autumn: [], winter: [] },
        discards: { spring: [], summer: [], autumn: [], winter: [] },
        severeClimatesThisYear: 0,
        previousClimateWasSevere: false,
        preparations: { p1: 'reserve', p2: 'reserve', p3: 'reserve' },
        nextPreparations: { p1: 'harvest', p2: 'shelter', p3: null },
        preparationTargets: { p1: null, p2: null, p3: null },
        nextPreparationTargets: { p1: 'wood', p2: null, p3: null },
        preparationReady: { p1: true, p2: true, p3: false },
        preparationUses: {
          p1: {
            harvestUsed: false,
            commerceUsed: false,
            worksUsed: false,
            shelterUsed: false,
          },
        },
        climateUses: {},
        climateGlobalUses: {} as never,
        history: [],
        preparationWindowOpen: true,
        springPrepPending: false,
      },
    },
  } as unknown as GameState;
}

describe('SeasonWidget — Veillée saisonnière', () => {
  it('affiche seulement les statuts prêts et permet de cibler Adaptation', () => {
    const onChoose = vi.fn();
    render(
      <SeasonWidget
        gameState={vigilState()}
        localPlayerId="p1"
        onChoosePreparation={onChoose}
        open
      />,
    );

    expect(screen.getByText('Veillée saisonnière')).toBeTruthy();
    expect(screen.getByText('2/3 prêts')).toBeTruthy();
    expect(screen.queryByText('shelter')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Adapter Minerai' }));
    expect(onChoose).toHaveBeenCalledWith('harvest', 'ore');
  });

  it('propose les cinq engagements dont Abri', () => {
    const onChoose = vi.fn();
    render(
      <SeasonWidget
        gameState={vigilState()}
        localPlayerId="p1"
        onChoosePreparation={onChoose}
        open
      />,
    );

    const shelter = screen.getByRole('button', { name: 'Abri — Absorber un climat rude' });
    fireEvent.click(shelter);
    expect(onChoose).toHaveBeenCalledWith('shelter', undefined);
  });
});

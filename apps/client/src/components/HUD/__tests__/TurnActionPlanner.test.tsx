// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { TurnActionPlanner } from '../TurnActionPlanner';

afterEach(cleanup);

function renderPlanner(overrides: Partial<Parameters<typeof TurnActionPlanner>[0]> = {}) {
  const onRollDice = vi.fn();
  const onOpenTab = vi.fn();
  const onEndTurn = vi.fn();

  render(
    <TurnActionPlanner
      currentTurn={7}
      phase="start_of_turn"
      hasRolledDiceThisTurn={false}
      pendingChoice={false}
      selectedTileId={null}
      sidePanelTab="tile"
      actionCountThisTurn={0}
      advancedVisible={false}
      onRollDice={onRollDice}
      onOpenEvent={vi.fn()}
      onOpenTab={onOpenTab}
      onOpenTech={vi.fn()}
      onOpenDiplomacy={vi.fn()}
      onEndTurn={onEndTurn}
      onToggleAdvanced={vi.fn()}
      {...overrides}
    />,
  );

  return { onRollDice, onOpenTab, onEndTurn };
}

describe('TurnActionPlanner', () => {
  it('donne accès au lancer et aux actions principales sans onglet intermédiaire', () => {
    const { onRollDice, onOpenTab } = renderPlanner();

    expect(screen.getByText('Tour en cours')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /Lancer les dés/ }));
    expect(onRollDice).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole('button', { name: 'Construire' }));
    expect(onOpenTab).toHaveBeenCalledWith('build');
  });

  it('range les commandes secondaires dans un tiroir compact', () => {
    const onOpenTech = vi.fn();
    renderPlanner({ onOpenTech });

    expect(screen.queryByRole('button', { name: 'Recherche' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Plus d’actions' }));
    fireEvent.click(screen.getByRole('button', { name: 'Recherche' }));
    expect(onOpenTech).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('button', { name: 'Recherche' })).toBeNull();
  });

  it('affiche la fin de tour après le lancer', () => {
    const { onEndTurn } = renderPlanner({
      phase: 'player_action',
      hasRolledDiceThisTurn: true,
      selectedTileId: 'tile-1',
      actionCountThisTurn: 1,
    });

    expect(screen.getByLabelText('3 étapes sur 3 terminées')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /Fin du tour/ }));
    expect(onEndTurn).toHaveBeenCalledTimes(1);
  });
});

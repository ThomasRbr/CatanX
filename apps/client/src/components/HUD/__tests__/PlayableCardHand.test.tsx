// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { GameState } from '@catanx/engine';
import { PlayableCardHand } from '../PlayableCardHand';

afterEach(cleanup);

function minimalState(card: 'development' | 'progress'): GameState {
  const player = {
    id: 'p1',
    name: 'Ariane',
    isEliminated: false,
    devCardsPlayedThisTurn: 0,
    devCards:
      card === 'development'
        ? [{ id: 'dev-1', type: 'knight', acquiredTurn: 1, played: false }]
        : [],
  };
  return {
    currentTurn: 2,
    turnOrder: ['p1', 'p2'],
    players: new Map([
      ['p1', player],
      [
        'p2',
        {
          id: 'p2',
          name: 'Bastien',
          isEliminated: false,
          devCardsPlayedThisTurn: 0,
          devCards: [],
        },
      ],
    ]),
    map: new Map([
      ['tile-1', { id: 'tile-1', terrain: 'forest', diceValue: 8 }],
      ['tile-2', { id: 'tile-2', terrain: 'fields', diceValue: 5 }],
    ]),
    buildings: new Map(),
    robberPosition: 'tile-2',
    extensions:
      card === 'progress'
        ? {
            citiesKnights: {
              progressHands: {
                p1: [{ id: 'progress-1', type: 'warlord', deck: 'politics' }],
              },
              walls: {},
              knights: [],
            },
          }
        : undefined,
  } as unknown as GameState;
}

describe('PlayableCardHand', () => {
  it('joue un Chevalier directement depuis la main Développement', () => {
    const playDevelopment = vi.fn(() => ({ ok: true }));
    const state = minimalState('development');
    const targeting = vi.fn();
    const view = render(
      <PlayableCardHand
        state={state}
        playerId="p1"
        canAct
        canPlayAlchemist={false}
        onPlayDevelopment={playDevelopment}
        onPlayProgress={() => ({ ok: false })}
        selectedTileId={null}
        onTileTargetingChange={targeting}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /Développement/i }));
    const knightCard = screen
      .getAllByRole('button')
      .find((button) => button.textContent?.includes('Chevalier'));
    expect(knightCard).toBeDefined();
    fireEvent.click(knightCard!);
    expect(targeting).toHaveBeenCalledWith(['tile-1']);
    view.rerender(
      <PlayableCardHand
        state={state}
        playerId="p1"
        canAct
        canPlayAlchemist={false}
        onPlayDevelopment={playDevelopment}
        onPlayProgress={() => ({ ok: false })}
        selectedTileId="tile-1"
        onTileTargetingChange={targeting}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /Jouer cette carte/i }));

    expect(playDevelopment).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'dev-1', type: 'knight' }),
      expect.objectContaining({ tileId: 'tile-1' }),
    );
  });

  it('remplace la main Développement par la main Progrès avec Villes & Chevaliers', () => {
    const playProgress = vi.fn(() => ({ ok: true }));
    const onOpenChange = vi.fn();
    render(
      <PlayableCardHand
        state={minimalState('progress')}
        playerId="p1"
        canAct
        canPlayAlchemist={false}
        onPlayDevelopment={() => ({ ok: false })}
        onPlayProgress={playProgress}
        onOpenChange={onOpenChange}
      />,
    );

    expect(screen.queryByText('Développement')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /Progrès/i }));
    expect(onOpenChange).toHaveBeenLastCalledWith(true);
    const warlordCard = screen
      .getAllByRole('button')
      .find((button) => button.textContent?.includes('Seigneur de guerre'));
    expect(warlordCard).toBeDefined();
    fireEvent.click(warlordCard!);
    fireEvent.click(screen.getByRole('button', { name: /Jouer cette carte/i }));

    expect(playProgress).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'progress-1', type: 'warlord' }),
      {},
    );
    expect(screen.queryByRole('region', { name: /Main de cartes Progrès/i })).toBeNull();
    expect(onOpenChange).toHaveBeenLastCalledWith(false);
  });

  it('conserve un lancer de dés compact dans la main ouverte', () => {
    const rollDice = vi.fn();
    const onOpenChange = vi.fn();
    render(
      <PlayableCardHand
        state={minimalState('progress')}
        playerId="p1"
        canAct={false}
        canPlayAlchemist={false}
        canRollDice
        onRollDice={rollDice}
        onPlayDevelopment={() => ({ ok: false })}
        onPlayProgress={() => ({ ok: false })}
        onOpenChange={onOpenChange}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /Progrès/i }));
    fireEvent.click(screen.getByRole('button', { name: 'Lancer les dés' }));

    expect(rollDice).toHaveBeenCalledOnce();
    expect(onOpenChange).toHaveBeenLastCalledWith(false);
  });

  it('ne propose pas les jetons 6 et 8 à Inventeur', () => {
    const state = minimalState('progress');
    state.extensions!.citiesKnights!.progressHands.p1 = [
      { id: 'inventor-1', type: 'inventor', deck: 'science' },
    ];
    state.map.set('tile-3', {
      id: 'tile-3',
      terrain: 'hill',
      diceValue: 6,
    } as never);
    const targeting = vi.fn();
    render(
      <PlayableCardHand
        state={state}
        playerId="p1"
        canAct
        canPlayAlchemist={false}
        onPlayDevelopment={() => ({ ok: false })}
        onPlayProgress={() => ({ ok: false })}
        onTileTargetingChange={targeting}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /Progrès/i }));
    fireEvent.click(screen.getByTestId('playable-card-inventor'));

    expect(targeting).toHaveBeenLastCalledWith(['tile-2']);
  });

  it('ne propose à Intrigue que les chevaliers au contact du réseau du joueur', () => {
    const state = minimalState('progress');
    const ck = state.extensions!.citiesKnights!;
    ck.progressHands.p1 = [{ id: 'intrigue-1', type: 'intrigue', deck: 'politics' }];
    ck.knights = [
      {
        id: 'legal-knight',
        ownerId: 'p2',
        intersectionId: 'i-contact',
        rank: 1,
        activated: false,
        activatedThisTurn: false,
        promotedThisTurn: false,
      },
      {
        id: 'remote-knight',
        ownerId: 'p2',
        intersectionId: 'i-remote',
        rank: 2,
        activated: false,
        activatedThisTurn: false,
        promotedThisTurn: false,
      },
    ];
    state.classicBoard = {
      occupiedIntersections: {},
      buildingByIntersection: {},
      roadsByEdge: { 'e-network': 'p1' },
      topology: {
        edges: {
          'e-network': { id: 'e-network', a: 'i-contact', b: 'i-owned', tileIds: ['tile-1'] },
        },
        intersections: {
          'i-contact': { id: 'i-contact', x: 0, y: 0, tileIds: ['tile-1'] },
          'i-owned': { id: 'i-owned', x: 1, y: 0, tileIds: ['tile-1'] },
          'i-remote': { id: 'i-remote', x: 3, y: 3, tileIds: ['tile-2'] },
        },
      },
    } as unknown as GameState['classicBoard'];
    const playProgress = vi.fn(() => ({ ok: true }));

    render(
      <PlayableCardHand
        state={state}
        playerId="p1"
        canAct
        canPlayAlchemist={false}
        onPlayDevelopment={() => ({ ok: false })}
        onPlayProgress={playProgress}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /Progrès/i }));
    fireEvent.click(screen.getByTestId('playable-card-intrigue'));
    const target = screen.getByLabelText(/Chevalier à déloger/i) as HTMLSelectElement;
    expect(Array.from(target.options).map((option) => option.value)).toEqual(['', 'legal-knight']);
    fireEvent.change(target, { target: { value: 'legal-knight' } });
    fireEvent.click(screen.getByRole('button', { name: /Jouer cette carte/i }));

    expect(playProgress).toHaveBeenCalledWith(expect.objectContaining({ id: 'intrigue-1' }), {
      knightId: 'legal-knight',
    });
  });
});

// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { TurnRecap } from '../TurnRecap';
import { CkMoment } from '../CkMoment';
import { ProgressImpactMoment } from '../ProgressImpactMoment';
import { SeasonTransitionMoment } from '../SeasonTransitionMoment';
import { OpponentPrepShelf } from '../OpponentPrepShelf';

afterEach(cleanup);

describe('Tabletop moments', () => {
  it('résume uniquement les descriptions publiques du tour', () => {
    render(
      <TurnRecap
        token="turn-4"
        playerName="Bastien"
        turn={4}
        pacing="tabletop"
        entries={[
          {
            id: 'public-action',
            turn: 4,
            playerId: 'bastien',
            type: 'build',
            description: 'Construction d’une route',
            data: { hiddenDecision: 'ne doit pas être rendu' },
            timestamp: 1,
          },
        ]}
      />,
    );

    expect(screen.getByText('Construction d’une route')).toBeTruthy();
    expect(screen.queryByText('ne doit pas être rendu')).toBeNull();
  });

  it('affiche un moment CK sans détail stratégique privé', () => {
    render(
      <CkMoment
        token="ship-3"
        kind="ship"
        title="Le navire barbare se rapproche"
        detail="3/7 étapes vers Catan"
        pacing="tabletop"
      />,
    );

    expect(screen.getByText('Le navire barbare se rapproche')).toBeTruthy();
    expect(screen.getByText('3/7 étapes vers Catan')).toBeTruthy();
  });

  it('explique clairement une carte Progrès jouée contre le joueur', () => {
    render(
      <ProgressImpactMoment
        token="progress-1"
        actorId="p1"
        viewerId="p2"
        playerNames={{ p1: 'Bastien', p2: 'Lina' }}
        pacing="tabletop"
        impact={{
          version: 1,
          cardType: 'resource_monopoly',
          deck: 'trade',
          targetPlayerIds: ['p2'],
          choice: { resource: 'wheat' },
          impacts: {
            p2: {
              resourceDelta: { wheat: -2 },
              commodityDelta: {},
              progressCardDelta: 0,
              roadsRemoved: 0,
              roadsAdded: 0,
              knightsRemoved: 0,
              knightsAdded: 0,
              knightsMoved: 0,
              knightsActivated: 0,
              knightsPromoted: 0,
            },
          },
        }}
      />,
    );

    expect(screen.getByText('Carte jouée contre vous')).toBeTruthy();
    expect(screen.getByText('Monopole des ressources')).toBeTruthy();
    expect(screen.getByText('Bastien vous cible')).toBeTruthy();
    expect(screen.getByText('−2 blé')).toBeTruthy();
  });

  it('annonce clairement une nouvelle saison et son climat', () => {
    render(
      <SeasonTransitionMoment
        token="year-2-winter"
        season="winter"
        climateId="winter_announced_blizzard"
        year={2}
        pacing="tabletop"
        motionEnabled
      />,
    );

    expect(screen.getByText('Hiver')).toBeTruthy();
    expect(screen.getByText('Blizzard annoncé')).toBeTruthy();
    expect(screen.getByText('Climat rude')).toBeTruthy();
    expect(screen.getByLabelText('Ressources favorisées').textContent).toContain(
      'Priorité : +1 Bois',
    );
  });

  it('permet de préparer ses constructions pendant le tour adverse', () => {
    render(
      <OpponentPrepShelf
        activePlayerName="Bastien"
        resources={{ wood: 1, clay: 1, sheep: 0, wheat: 0, ore: 0 }}
        citiesKnights
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Préparer votre tour — Bastien joue' }));
    expect(screen.getByText('Route')).toBeTruthy();
    expect(screen.getByText('Prêt')).toBeTruthy();
    expect(
      screen.getByText('Marchandises et cartes Progrès restent consultables dans votre main.'),
    ).toBeTruthy();
  });
});

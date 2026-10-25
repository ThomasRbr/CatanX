// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { BankTradePanel } from '../BankTradePanel';
import { PlayerTradePanel } from '../PlayerTradePanel';

afterEach(cleanup);

describe('premium trade panels', () => {
  it('présente un échange banque lisible et envoie les bons lots', () => {
    const onTrade = vi.fn(() => ({ ok: true }));
    render(
      <BankTradePanel
        getRatio={() => 4}
        available={{ wood: 4, clay: 0, wheat: 0, sheep: 0, ore: 0 }}
        bankStock={{ wood: 19, clay: 19, wheat: 19, sheep: 19, ore: 19 }}
        onTrade={onTrade}
      />,
    );

    const bankPanel = screen.getByRole('complementary', { name: 'Commerce avec la banque' });
    expect(bankPanel).toBeTruthy();
    expect(bankPanel.classList.contains('ui-panel')).toBe(true);
    expect(screen.getByText('Banque & ports')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /Confirmer l’échange/ }));
    expect(onTrade).toHaveBeenCalledWith({ wood: 4 }, { ore: 1 });
  });

  it('ne révèle pas les termes privés d’une offre observée', () => {
    render(
      <PlayerTradePanel
        partners={[]}
        available={{ wood: 2 }}
        canPropose={false}
        pending={{
          id: 'private-offer',
          fromName: 'Ariane',
          toName: 'Bastien',
          give: { wood: 2 },
          receive: { ore: 1 },
          role: 'spectator',
          termsHidden: true,
        }}
        onPropose={() => undefined}
        onAccept={() => undefined}
        onReject={() => undefined}
        onCancel={() => undefined}
      />,
    );

    expect(
      screen
        .getByRole('complementary', { name: 'Commerce entre joueurs' })
        .classList.contains('ui-panel'),
    ).toBe(true);
    expect(screen.getByText(/Les termes restent privés/)).toBeTruthy();
    expect(screen.queryByText(/2 Bois/)).toBeNull();
    expect(screen.queryByText(/1 Minerai/)).toBeNull();
  });
});

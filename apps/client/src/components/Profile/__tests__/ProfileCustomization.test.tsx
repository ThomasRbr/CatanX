// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { createDefaultProfile, normalizeProfile } from '../../../profile/profileCatalog';
import { ProfileCustomizerModal } from '../ProfileCustomizerModal';
import { TurnIndicator } from '../../HUD/TurnIndicator';
import { DiceRollOverlay } from '../../HUD/DiceRollOverlay';

afterEach(cleanup);

describe('player profile customization', () => {
  it('complète automatiquement les anciens profils avec les options collector', () => {
    const current = createDefaultProfile(0);
    const legacy = {
      portrait: current.portrait,
      accessory: current.accessory,
      emblem: current.emblem,
      banner: current.banner,
      frame: current.frame,
      title: current.title,
      tagline: current.tagline,
      pieceColor: current.pieceColor,
    };
    expect(normalizeProfile(legacy)).toMatchObject({
      skinTone: 'sand',
      outfit: 'voyager',
      cardMaterial: 'acrylic',
      diceStyle: 'navy',
    });
  });

  it('permet de composer puis enregistrer une identité complète', () => {
    const onSave = vi.fn();
    render(
      <ProfileCustomizerModal
        open
        playerIndex={0}
        playerName="Ariane"
        profile={createDefaultProfile(0)}
        civilization="merchants"
        usedPieceColors={['blue', 'red']}
        onSave={onSave}
        onClose={() => undefined}
      />,
    );

    expect(screen.getByRole('dialog', { name: /Personnaliser Ariane/ })).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Devise'), { target: { value: 'Bâtir plus loin.' } });
    fireEvent.click(screen.getByRole('button', { name: 'Personnage' }));
    fireEvent.click(screen.getByRole('button', { name: /Architecte/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Ébène' }));
    fireEvent.click(screen.getByRole('button', { name: 'Tenue' }));
    fireEvent.click(screen.getByRole('button', { name: /Stratège/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Signature' }));
    fireEvent.click(screen.getByRole('button', { name: /Sommet/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Tabletop' }));
    fireEvent.click(screen.getByRole('button', { name: 'Marbré collector' }));
    fireEvent.click(screen.getByRole('button', { name: 'Obsidienne' }));
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer le profil' }));

    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({
        portrait: 'architect',
        skinTone: 'ebony',
        outfit: 'strategist',
        emblem: 'peak',
        pieceFinish: 'marbled',
        diceStyle: 'obsidian',
        tagline: 'Bâtir plus loin.',
      }),
    );
  });

  it('ouvre une carte publique depuis le HUD sans exposer de données privées', () => {
    render(
      <TurnIndicator
        turn={4}
        season="summer"
        year={1}
        phase="player_action"
        players={[
          {
            id: 'p1',
            name: 'Ariane',
            vp: 6,
            isActive: true,
            color: 'blue',
            civilization: 'merchants',
            profile: createDefaultProfile(0),
            handSize: 4,
            devCardCount: 2,
          },
        ]}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Voir le profil de Ariane' }));
    expect(screen.getByText(/Toujours un cap d’avance/)).toBeTruthy();
    expect(screen.getByText('Ressources')).toBeTruthy();
    expect(screen.queryByText(/intention/i)).toBeNull();
  });

  it('applique la collection de dés choisie pendant les lancers', () => {
    const { container } = render(
      <DiceRollOverlay
        die1={3}
        die2={5}
        total={8}
        token="profile-dice"
        diceStyle="obsidian"
        durationMs={10_000}
      />,
    );
    expect(container.querySelector('[data-dice-style="obsidian"]')).toBeTruthy();
    expect(screen.getByLabelText('Dé rouge : 3')).toBeTruthy();
  });
});

import { useState, type CSSProperties } from 'react';
import type { PlayerProfile } from '@catanx/engine';
import { frSeason, frTurnPhase } from '../../i18n/fr';
import {
  createDefaultProfile,
  normalizeProfile,
  pieceColorHex,
  profileTitleLabel,
} from '../../profile/profileCatalog';
import { ProfileAvatar } from '../Profile/ProfileAvatar';
import { PlayerProfileCard } from '../Profile/PlayerProfileCard';
import styles from './TurnIndicator.module.css';

interface TurnPlayerRow {
  id: string;
  name: string;
  vp: number;
  isActive: boolean;
  color?: string;
  civilization?: string;
  type?: string;
  handSize?: number;
  devCardCount?: number;
  profile?: PlayerProfile;
}
interface TurnIndicatorProps {
  turn: number;
  season: string;
  year: number;
  phase: string;
  diceTotal?: number | null;
  players?: TurnPlayerRow[];
  classicMode?: boolean;
}

export function TurnIndicator({
  turn,
  season,
  year,
  phase,
  diceTotal,
  players = [],
  classicMode = false,
}: TurnIndicatorProps) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = players.find((player) => player.id === selectedId) ?? null;
  const resolvedProfile = (player: TurnPlayerRow, index: number): PlayerProfile =>
    normalizeProfile(
      {
        ...(player.profile ?? {}),
        pieceColor: (player.profile?.pieceColor ??
          player.color ??
          createDefaultProfile(index).pieceColor) as PlayerProfile['pieceColor'],
      },
      index,
    );

  return (
    <section className={styles.panel} aria-label="Joueurs et tour" data-hud-zone="players">
      <header className={styles.turnHeader}>
        <div>
          <span>
            TOUR {turn}
            {!classicMode && ` · ANNÉE ${year}`}
          </span>
          <strong>{classicMode ? frTurnPhase(phase) : frSeason(season)}</strong>
        </div>
        <span className={styles.dice}>
          DÉ <b>{diceTotal ?? '—'}</b>
        </span>
      </header>
      <div className={styles.phase}>{frTurnPhase(phase)}</div>
      {players.length > 0 && (
        <div className={styles.players} aria-label="Participants">
          {players.map((player, index) => {
            const profile = resolvedProfile(player, index);
            return (
              <button
                key={player.id}
                type="button"
                className={player.isActive ? styles.playerActive : styles.player}
                aria-label={`Voir le profil de ${player.name}`}
                aria-pressed={selectedId === player.id}
                style={{ '--piece': pieceColorHex(profile.pieceColor) } as CSSProperties}
                onClick={() =>
                  setSelectedId((current) => (current === player.id ? null : player.id))
                }
              >
                <ProfileAvatar profile={profile} size={36} label="" />
                <span className={styles.playerIdentity}>
                  <strong>{player.name}</strong>
                  <small>{profileTitleLabel(profile.title)}</small>
                  {typeof player.handSize === 'number' && (
                    <span className={styles.meta}>
                      <b data-warn={player.handSize > 7 ? 'true' : undefined}>
                        {player.handSize}
                      </b>{' '}
                      {player.handSize > 1 ? 'cartes' : 'carte'}
                      {typeof player.devCardCount === 'number' && player.devCardCount > 0
                        ? ` · ${player.devCardCount} dév.`
                        : ''}
                    </span>
                  )}
                </span>
                <span className={styles.score}>
                  {player.vp}
                  <small>PV</small>
                </span>
                <i
                  className={styles.pieceDot}
                  style={{ background: pieceColorHex(profile.pieceColor) }}
                />
              </button>
            );
          })}
        </div>
      )}
      {selected &&
        (() => {
          const index = Math.max(
            0,
            players.findIndex((player) => player.id === selected.id),
          );
          return (
            <div className={styles.profilePopover}>
              <button
                type="button"
                aria-label="Fermer la carte joueur"
                onClick={() => setSelectedId(null)}
              >
                ×
              </button>
              <PlayerProfileCard
                compact
                name={selected.name}
                profile={resolvedProfile(selected, index)}
                civilization={selected.civilization}
                victoryPoints={selected.vp}
                handSize={selected.handSize}
                devCardCount={selected.devCardCount}
              />
            </div>
          );
        })()}
    </section>
  );
}

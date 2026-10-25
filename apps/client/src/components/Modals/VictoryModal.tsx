import type { PlayerRanking } from '@catanx/engine';
import { Button } from '../../ui';

interface VictoryModalProps {
  winnerName: string;
  rankings: PlayerRanking[];
  playerNames?: Record<string, string>;
  onClose: () => void;
  season?: string;
}

/** Célébration saisonnière de victoire. */
export function VictoryModal({
  winnerName,
  rankings,
  playerNames,
  onClose,
  season = 'summer',
}: VictoryModalProps) {
  return (
    <div className="modal-backdrop" data-season={season} data-scene="victory-celebration">
      <div
        className="modal-card"
        role="dialog"
        aria-modal="true"
        aria-labelledby="victory-title"
        style={{
          borderColor: 'var(--season-accent, var(--antique-gold))',
          boxShadow: '0 30px 56px rgba(8, 14, 12, 0.55), 0 0 0 2px var(--antique-gold)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
          <img src="/brand/season-rose.svg" alt="" width={40} height={40} />
          <h2 id="victory-title" style={{ margin: 0 }}>
            Victoire du royaume
          </h2>
        </div>
        <p className="narrative" style={{ fontSize: 18 }}>
          {winnerName} remporte la partie.
        </p>

        <div style={{ marginTop: 10, display: 'grid', gap: 6 }}>
          {rankings.map((entry) => (
            <div
              key={entry.playerId}
              className="ui-panel"
              style={{
                padding: 8,
                display: 'flex',
                justifyContent: 'space-between',
                background: 'var(--panel-ivory)',
                color: 'var(--ink)',
              }}
            >
              <span>
                #{entry.rank} — {playerNames?.[entry.playerId] ?? entry.playerId}
              </span>
              <strong>{entry.victoryPoints} PV</strong>
            </div>
          ))}
        </div>

        <Button variant="primary" style={{ marginTop: 14 }} onClick={onClose}>
          Fermer
        </Button>
      </div>
    </div>
  );
}

import { useEffect, useState } from 'react';
import type { ActionLogEntry, GamePacingPreset } from '@catanx/engine';
import styles from './TurnRecap.module.css';

interface TurnRecapProps {
  token: string;
  playerName: string;
  turn: number;
  entries: ActionLogEntry[];
  pacing: GamePacingPreset;
  onComplete?: () => void;
}

export function TurnRecap({ token, playerName, turn, entries, pacing, onComplete }: TurnRecapProps) {
  const [visible, setVisible] = useState(true);
  const duration = pacing === 'epic' ? 3200 : pacing === 'tabletop' ? 2600 : 1500;

  useEffect(() => {
    setVisible(true);
    const timeout = window.setTimeout(() => {
      setVisible(false);
      onComplete?.();
    }, duration);
    return () => window.clearTimeout(timeout);
  }, [duration, onComplete, token]);

  if (!visible) return null;

  return (
    <aside className={styles.recap} aria-label={`Résumé du tour ${turn}`}>
      <span className={styles.eyebrow}>Tour {turn} terminé</span>
      <strong>{playerName}</strong>
      {entries.length > 0 ? (
        <ul>
          {entries.slice(-3).map((entry) => (
            <li key={entry.id}>{entry.description}</li>
          ))}
        </ul>
      ) : (
        <small>Aucune action publique notable</small>
      )}
    </aside>
  );
}

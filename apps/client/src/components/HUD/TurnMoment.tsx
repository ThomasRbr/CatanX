import { useEffect, useState } from 'react';
import type { GamePacingPreset } from '@catanx/engine';
import { frSeason, frTurnPhase } from '../../i18n/fr';
import styles from './TurnMoment.module.css';

interface TurnMomentProps {
  token: string;
  turn: number;
  phase: string;
  season: string;
  playerName: string;
  diceTotal?: number | null;
  pacing?: GamePacingPreset;
  onComplete?: () => void;
}

/** A brief physical-tabletop announcement that gives each turn a readable beat. */
export function TurnMoment({
  token,
  turn,
  phase,
  season,
  playerName,
  diceTotal,
  pacing = 'dynamic',
  onComplete,
}: TurnMomentProps) {
  const [visible, setVisible] = useState(true);
  const duration = pacing === 'epic' ? 2800 : pacing === 'tabletop' ? 2200 : 1300;
  useEffect(() => {
    setVisible(true);
    const id = window.setTimeout(() => {
      setVisible(false);
      onComplete?.();
    }, duration);
    return () => window.clearTimeout(id);
  }, [duration, onComplete, token]);
  if (!visible) return null;
  return (
    <div className={styles.moment} role="status" aria-live="polite">
      <span>
        Tour {turn} · {frSeason(season)}
      </span>
      <strong>{playerName}</strong>
      <small>
        {frTurnPhase(phase)}
        {diceTotal != null ? ` · Dé ${diceTotal}` : ''}
      </small>
    </div>
  );
}

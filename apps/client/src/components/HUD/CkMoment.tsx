import { useEffect, useState } from 'react';
import type { GamePacingPreset } from '@catanx/engine';
import styles from './CkMoment.module.css';

export type CkMomentKind = 'ship' | 'invasion-win' | 'invasion-loss' | 'progress';

interface CkMomentProps {
  token: string;
  kind: CkMomentKind;
  title: string;
  detail: string;
  pacing: GamePacingPreset;
  onComplete?: () => void;
}

function MomentIcon({ kind }: { kind: CkMomentKind }) {
  if (kind === 'ship') {
    return (
      <svg viewBox="0 0 32 32" aria-hidden="true">
        <path d="M5 22h22l-3.5 5H9L5 22Zm10-17h2v15h-2V5Zm3 3 8 11h-8V8Z" />
      </svg>
    );
  }
  if (kind === 'progress') {
    return (
      <svg viewBox="0 0 32 32" aria-hidden="true">
        <path d="m16 4 2.6 7.4L26 14l-7.4 2.6L16 24l-2.6-7.4L6 14l7.4-2.6L16 4Zm8 15 1.2 3.8L29 24l-3.8 1.2L24 29l-1.2-3.8L19 24l3.8-1.2L24 19Z" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 32 32" aria-hidden="true">
      <path d="m9 5 3 3-2 2 5 5 5-5-2-2 3-3 6 6-3 3-2-2-5 5 5 5 2-2 3 3-6 6-3-3 2-2-5-5-5 5 2 2-3 3-6-6 3-3 2 2 5-5-5-5-2 2-3-3 6-6Z" />
    </svg>
  );
}

export function CkMoment({ token, kind, title, detail, pacing, onComplete }: CkMomentProps) {
  const [visible, setVisible] = useState(true);
  const duration = pacing === 'epic' ? 3400 : pacing === 'tabletop' ? 2700 : 1600;

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
    <div className={styles.moment} data-kind={kind} role="status" aria-live="polite">
      <span className={styles.icon} aria-hidden="true">
        <MomentIcon kind={kind} />
      </span>
      <span>
        <small>Villes &amp; Chevaliers</small>
        <strong>{title}</strong>
        <em>{detail}</em>
      </span>
    </div>
  );
}

import { useEffect, useState } from 'react';
import { frResource } from '../../i18n/fr';
import styles from './CollectionSummary.module.css';

export interface CollectionSummaryEntry {
  resource: string;
  delta: number;
}

interface CollectionSummaryProps {
  token: string;
  entries: CollectionSummaryEntry[];
  durationMs?: number;
  onComplete?: () => void;
}

/** Résumé privé et compact : il ne montre que la récolte du joueur local. */
export function CollectionSummary({
  token,
  entries,
  durationMs = 2100,
  onComplete,
}: CollectionSummaryProps) {
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    setVisible(true);
    const timeout = window.setTimeout(() => {
      setVisible(false);
      onComplete?.();
    }, durationMs);
    return () => window.clearTimeout(timeout);
  }, [durationMs, onComplete, token]);

  if (!visible) return null;

  return (
    <div className={styles.summary} role="status" aria-live="polite">
      <span className={styles.eyebrow}>Votre récolte</span>
      {entries.length > 0 ? (
        <div className={styles.cards}>
          {entries.map((entry) => (
            <span key={entry.resource} className={styles.card} data-resource={entry.resource}>
              <i aria-hidden="true" />
              <strong>+{Math.floor(entry.delta)}</strong>
              <small>{frResource(entry.resource)}</small>
            </span>
          ))}
        </div>
      ) : (
        <strong className={styles.empty}>Aucune production</strong>
      )}
    </div>
  );
}

import { useState } from 'react';
import type { ActionLogEntry } from '@catanx/engine';
import styles from './ActionFeed.module.css';

interface ActionFeedProps {
  entries: ActionLogEntry[];
  playerNames: Record<string, string>;
}

export function ActionFeed({ entries, playerNames }: ActionFeedProps) {
  const [expanded, setExpanded] = useState(false);
  const recent = entries.slice(-4).reverse();
  if (recent.length === 0) return null;

  return (
    <aside
      className={`${styles.feed} ${expanded ? styles.expanded : styles.collapsed}`}
      aria-label="Activité récente"
    >
      <button
        type="button"
        className={styles.header}
        onClick={() => setExpanded((value) => !value)}
        aria-expanded={expanded}
      >
        <span className={styles.liveDot} aria-hidden="true" />
        <strong>{expanded ? 'Activité récente' : 'Dernière action'}</strong>
        <small>{expanded ? '−' : '+'}</small>
      </button>
      <div className={styles.list}>
        {recent.map((entry, index) => (
          <div key={entry.id} className={index === 0 ? styles.latest : styles.entry}>
            <span className={styles.turn}>T{entry.turn}</span>
            <div>
              <strong>{playerNames[entry.playerId] ?? entry.playerId}</strong>
              <p>{entry.description}</p>
            </div>
          </div>
        ))}
      </div>
    </aside>
  );
}

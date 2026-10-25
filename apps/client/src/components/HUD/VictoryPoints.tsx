import styles from './VictoryPoints.module.css';
import { Icon } from '../../ui';

interface VictoryPointsProps {
  current: number;
  target: number;
  rank?: number;
}

export function VictoryPoints({ current, target, rank }: VictoryPointsProps) {
  const progress = target <= 0 ? 0 : Math.min(100, (current / target) * 100);

  return (
    <div className={`ui-panel ${styles.panel}`} data-hud-zone="victory">
      <div className={styles.row}>
        <span className={styles.identity}>
          <i aria-hidden="true"><Icon name="victory" size={16} /></i>
          <span>
            <small>Ascension</small>
            <strong>Points de victoire</strong>
          </span>
        </span>
        <span className={styles.score}>
          <strong>{current}</strong><small>/{target}</small>
        </span>
      </div>
      <div
        className={styles.track}
        role="progressbar"
        aria-valuenow={current}
        aria-valuemin={0}
        aria-valuemax={target}
        aria-label="Progression vers la victoire"
      >
        <div className={styles.fill} style={{ width: `${progress}%` }} />
      </div>
      <div className={styles.rank}>
        <span>Rang actuel</span>
        <strong>#{rank ?? '—'}</strong>
      </div>
    </div>
  );
}

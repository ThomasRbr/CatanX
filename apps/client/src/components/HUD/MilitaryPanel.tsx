interface MilitaryPanelProps {
  totalUnits: number;
  militaryStrength: number;
  damagedUnits: number;
}

export function MilitaryPanel({ totalUnits, militaryStrength, damagedUnits }: MilitaryPanelProps) {
  return (
    <div className={`${styles.panel} ui-panel`} data-tone="military">
      <header className={styles.header}>
        <i className={styles.seal} aria-hidden="true"><Icon name="army" size={18} /></i>
        <span><small>Commandement</small><strong>Armées</strong></span>
        <b className={styles.heroMetric}>{militaryStrength}</b>
      </header>
      <div className={styles.metrics}>
        <span><small>Unités</small><strong>{totalUnits}</strong></span>
        <span data-alert={damagedUnits > 0 ? 'true' : undefined}><small>Blessées</small><strong>{damagedUnits}</strong></span>
      </div>
    </div>
  );
}
import { Icon } from '../../ui';
import styles from './SystemSummaryPanel.module.css';

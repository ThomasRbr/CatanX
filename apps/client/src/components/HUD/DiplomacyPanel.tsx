interface DiplomacyPanelProps {
  relationCount: number;
  allies: number;
  wars: number;
  onOpen: () => void;
}

export function DiplomacyPanel({ relationCount, allies, wars, onOpen }: DiplomacyPanelProps) {
  return (
    <div className={`${styles.panel} ui-panel`} data-tone="diplomacy">
      <header className={styles.header}>
        <i className={styles.seal} aria-hidden="true"><Icon name="diplomacy" size={18} /></i>
        <span><small>Relations</small><strong>Diplomatie</strong></span>
        <button className={styles.openButton} type="button" onClick={onOpen}>Ouvrir</button>
      </header>
      <div className={styles.metrics}>
        <span><small>Contacts</small><strong>{relationCount}</strong></span>
        <span><small>Alliés</small><strong>{allies}</strong></span>
        <span data-alert={wars > 0 ? 'true' : undefined}><small>Guerres</small><strong>{wars}</strong></span>
      </div>
    </div>
  );
}
import { Icon } from '../../ui';
import styles from './SystemSummaryPanel.module.css';

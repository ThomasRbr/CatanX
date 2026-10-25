import { frGenericLabel } from '../../i18n/fr';
import { Icon } from '../../ui';
import styles from './SystemSummaryPanel.module.css';

interface TechPanelProps {
  currentResearch: string | null;
  progress: number;
  queue: string[];
  availableCount: number;
  onOpen: () => void;
}

export function TechPanel({
  currentResearch,
  progress,
  queue,
  availableCount,
  onOpen,
}: TechPanelProps) {
  const progressPercent = Math.max(0, Math.min(100, progress));

  return (
    <div className={`${styles.panel} ui-panel`} data-tone="science">
      <header className={styles.header}>
        <i className={styles.seal} aria-hidden="true"><Icon name="tech" size={18} /></i>
        <span><small>Innovation</small><strong>Recherche</strong></span>
        <button className={styles.openButton} type="button" onClick={onOpen}>Arbre</button>
      </header>
      <div className={styles.subject}>
        {currentResearch ? frGenericLabel(currentResearch) : 'Aucune recherche active'}
      </div>
      <div className={styles.progress} role="progressbar" aria-label="Progression de la recherche" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progressPercent}>
        <div style={{ width: `${progressPercent}%` }} />
      </div>
      <div className={styles.metrics}>
        <span><small>Progression</small><strong>{progressPercent}%</strong></span>
        <span><small>En attente</small><strong>{queue.length}</strong></span>
        <span><small>Disponibles</small><strong>{availableCount}</strong></span>
      </div>
    </div>
  );
}

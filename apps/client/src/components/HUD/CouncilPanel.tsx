interface CouncilPanelProps {
  title: string;
  options: Array<{ id: string; label: string }>;
  myVote: string | null;
  onVote: (optionId: string) => void;
}

export function CouncilPanel({ title, options, myVote, onVote }: CouncilPanelProps) {
  return (
    <section className={`${styles.panel} ui-panel`} data-tone="council" aria-label="Conseil mondial">
      <header className={styles.header}>
        <i className={styles.seal} aria-hidden="true"><Icon name="victory" size={18} /></i>
        <span><small>Assemblée</small><strong>Conseil mondial</strong></span>
      </header>
      <div className={styles.subject}>{title}</div>
      {myVote && (
        <div className={styles.confirmation}>
          Votre vote est enregistré. Résolution au prochain scrutin.
        </div>
      )}
      <div className={styles.choices}>
        {options.map((option) => (
          <button
            key={option.id}
            type="button"
            className={myVote === option.id ? 'command-button primary' : 'command-button secondary'}
            onClick={() => onVote(option.id)}
            disabled={Boolean(myVote)}
          >
            {option.label}
            {myVote === option.id ? ' (vote)' : ''}
          </button>
        ))}
      </div>
    </section>
  );
}
import { Icon } from '../../ui';
import styles from './SystemSummaryPanel.module.css';

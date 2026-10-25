import { Button, Progress } from '../../ui';
import type { InitialPlacementState } from '../../store/gameStore';
import styles from './InitialPlacementPanel.module.css';

interface InitialPlacementPanelProps {
  placement: InitialPlacementState;
  currentPlayerName: string;
  onConfirm: () => void;
  onCancel: () => void;
}

export function InitialPlacementPanel({
  placement,
  currentPlayerName,
  onConfirm,
  onCancel,
}: InitialPlacementPanelProps) {
  const total = placement.sequence.length;
  const index = Math.min(total, placement.cursor + (placement.step === 'road' ? 1 : 0));
  const progress = total <= 0 ? 0 : Math.round((index / total) * 100);
  const hasPending = Boolean(placement.pendingIntersectionId || placement.pendingEdgeId);
  const stepLabel =
    placement.step === 'settlement' ? 'Placez un village' : 'Placez une route';

  return (
    <aside
      className={`ui-panel ${styles.panel}`}
      aria-label="Placement initial"
    >
      <div className={styles.kicker}>Mise en place</div>
      <div className={styles.player}>
        <strong>{currentPlayerName}</strong>
        <span>
          {index}/{total}
        </span>
      </div>
      <div className={styles.step}>{stepLabel}</div>
      <Progress value={progress} label="Progression" />
      {hasPending && (
        <div className={styles.actions}>
          <Button variant="primary" size="sm" onClick={onConfirm}>
            Confirmer
          </Button>
          <Button variant="ghost" size="sm" onClick={onCancel}>
            Annuler
          </Button>
        </div>
      )}
    </aside>
  );
}

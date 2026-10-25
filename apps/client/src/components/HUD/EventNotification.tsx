import type { GameEvent } from '@catanx/engine';
import { Icon } from '../../ui';
import styles from './EventNotification.module.css';

interface EventNotificationProps {
  events: GameEvent[];
  onOpenEvent: () => void;
}

export function EventNotification({ events, onOpenEvent }: EventNotificationProps) {
  if (!events.length) return null;

  return (
    <button
      type="button"
      className={`${styles.notification} ui-panel hud-secondary-panel`}
      onClick={onOpenEvent}
      aria-label={`${events.length} événement${events.length > 1 ? 's' : ''} actif${events.length > 1 ? 's' : ''}`}
    >
      <span className={styles.icon} aria-hidden="true"><Icon name="warning" size={16} /></span>
      <span className={styles.copy}>
        <small>Monde vivant</small>
        <strong>Événement actif</strong>
      </span>
      <span className={styles.count}>{events.length}</span>
    </button>
  );
}

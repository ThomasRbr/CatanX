import { useEffect, type ReactNode } from 'react';
import { IconButton } from './IconButton';
import styles from './ModalShell.module.css';

export type ModalShellProps = {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
  className?: string;
};

export function ModalShell({ open, title, onClose, children, className }: ModalShellProps) {
  useEffect(() => {
    if (!open) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className={styles.backdrop} onClick={onClose}>
      <div
        className={[styles.dialog, className].filter(Boolean).join(' ')}
        role="dialog"
        aria-modal="true"
        aria-labelledby="catanx-modal-title"
        onClick={(event) => event.stopPropagation()}
      >
        <header className={styles.header}>
          <h2 id="catanx-modal-title" className={styles.title}>
            {title}
          </h2>
          <IconButton icon="close" aria-label="Fermer" onClick={onClose} size="sm" variant="ghost" />
        </header>
        <div className={styles.body}>{children}</div>
      </div>
    </div>
  );
}

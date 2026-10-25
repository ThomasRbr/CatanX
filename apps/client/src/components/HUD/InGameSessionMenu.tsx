import { useEffect, useRef, useState } from 'react';
import { Button, IconButton } from '../../ui';
import styles from './InGameSessionMenu.module.css';

interface InGameSessionMenuProps {
  canSave: boolean;
  saveLabel: string;
  onSave: () => void;
  onOpenSettings: () => void;
  onQuitToMenu: () => void;
  onBackToLobby?: () => void;
}

/** Menu session toujours accessible en partie (sauver / réglages / quitter). */
export function InGameSessionMenu({
  canSave,
  saveLabel,
  onSave,
  onOpenSettings,
  onQuitToMenu,
  onBackToLobby,
}: InGameSessionMenuProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    const onPointer = (event: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('mousedown', onPointer);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('mousedown', onPointer);
    };
  }, [open]);

  return (
    <div className={styles.root} ref={rootRef} data-hud-zone="session-menu">
      <IconButton
        icon="more"
        aria-label="Menu de session"
        aria-expanded={open}
        aria-haspopup="menu"
        onClick={() => setOpen((value) => !value)}
      />
      {open && (
        <div role="menu" className={`ui-panel ${styles.menu}`}>
          {canSave && (
            <Button
              variant="ghost"
              fullWidth
              role="menuitem"
              onClick={() => {
                onSave();
                setOpen(false);
              }}
            >
              {saveLabel}
            </Button>
          )}
          <Button
            variant="ghost"
            fullWidth
            role="menuitem"
            onClick={() => {
              onOpenSettings();
              setOpen(false);
            }}
          >
            Paramètres
          </Button>
          {onBackToLobby && (
            <Button
              variant="ghost"
              fullWidth
              role="menuitem"
              onClick={() => {
                onBackToLobby();
                setOpen(false);
              }}
            >
              Retour lobby
            </Button>
          )}
          <Button
            variant="danger"
            fullWidth
            role="menuitem"
            onClick={() => {
              onQuitToMenu();
              setOpen(false);
            }}
          >
            Menu principal
          </Button>
        </div>
      )}
    </div>
  );
}

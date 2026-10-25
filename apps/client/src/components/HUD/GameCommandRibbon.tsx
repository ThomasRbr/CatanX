import { useEffect, useRef, useState } from 'react';
import { Button, IconButton } from '../../ui';
import styles from './GameCommandRibbon.module.css';

interface GameCommandRibbonProps {
  guidedTurnUI: boolean;
  isReadOnlySession: boolean;
  isInitialPlacementActive: boolean;
  initialPlacementStep?: 'settlement' | 'road' | null;
  diceRolledThisTurn: boolean;
  showAdvancedPanels: boolean;
  currentTurn: number;
  onRollDice: () => void;
  onEndTurn: () => void;
  onOpenSettings: () => void;
  onOpenHelp?: () => void;
  onSave: () => void;
  onToggleAdvanced: () => void;
  onQuitToMenu: () => void;
  onBackToLobby: () => void;
  onOpenTech?: () => void;
  onOpenDiplomacy?: () => void;
}

/**
 * Dock bas : une action dominante (dés / fin de tour) + menu secondaire.
 */
export function GameCommandRibbon({
  guidedTurnUI: _guidedTurnUI,
  isReadOnlySession,
  isInitialPlacementActive,
  initialPlacementStep: _initialPlacementStep,
  diceRolledThisTurn,
  showAdvancedPanels,
  currentTurn,
  onRollDice,
  onEndTurn,
  onOpenSettings,
  onOpenHelp,
  onSave,
  onToggleAdvanced,
  onQuitToMenu,
  onBackToLobby,
  onOpenTech,
  onOpenDiplomacy,
}: GameCommandRibbonProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const primaryLabel = diceRolledThisTurn ? 'Terminer le tour' : 'Lancer les dés';
  const primaryAction = diceRolledThisTurn ? onEndTurn : onRollDice;

  useEffect(() => {
    if (!menuOpen) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMenuOpen(false);
    };
    const onPointer = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setMenuOpen(false);
      }
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('mousedown', onPointer);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('mousedown', onPointer);
    };
  }, [menuOpen]);

  return (
    <nav
      className={`ui-panel command-ribbon ${styles.ribbon}${
        isInitialPlacementActive ? ` ${styles.ribbonPlacement}` : ''
      }`}
      aria-label="Actions de partie"
      data-hud-zone="dock"
    >
      {isReadOnlySession && !isInitialPlacementActive ? (
        <>
          <div className={styles.spectator}>
            <strong>Mode spectateur</strong>
            <span>Observation uniquement. Aucune action de jeu n’est autorisée.</span>
          </div>
          <Button variant="secondary" onClick={onBackToLobby}>
            Retour lobby
          </Button>
          <Button variant="ghost" onClick={onOpenSettings}>
            Réglages
          </Button>
        </>
      ) : (
        <>
          {isInitialPlacementActive ? null : (
            <Button
              variant="primary"
              size="lg"
              aria-label={primaryLabel}
              onClick={primaryAction}
              data-testid="primary-turn-action"
              className={styles.primaryCta}
            >
              {primaryLabel}
            </Button>
          )}

          <div className={styles.menuWrap} ref={menuRef}>
            <IconButton
              icon="more"
              aria-label="Menu secondaire"
              aria-expanded={menuOpen}
              aria-haspopup="menu"
              onClick={() => setMenuOpen((v) => !v)}
            />
            {menuOpen && (
              <div role="menu" className={`ui-panel ${styles.menu}`}>
                <Button
                  variant="ghost"
                  fullWidth
                  role="menuitem"
                  onClick={() => {
                    onSave();
                    setMenuOpen(false);
                  }}
                >
                  Sauver T{currentTurn}
                </Button>
                {onOpenHelp && (
                  <Button
                    variant="ghost"
                    fullWidth
                    role="menuitem"
                    onClick={() => {
                      onOpenHelp();
                      setMenuOpen(false);
                    }}
                  >
                    Guide
                  </Button>
                )}
                <Button
                  variant="ghost"
                  fullWidth
                  role="menuitem"
                  onClick={() => {
                    onOpenSettings();
                    setMenuOpen(false);
                  }}
                >
                  Paramètres
                </Button>
                <Button
                  variant="ghost"
                  fullWidth
                  role="menuitem"
                  onClick={() => {
                    onToggleAdvanced();
                    setMenuOpen(false);
                  }}
                >
                  {showAdvancedPanels ? 'Vue simple' : 'Vue avancée'}
                </Button>
                {onOpenTech && (
                  <Button
                    variant="ghost"
                    fullWidth
                    role="menuitem"
                    onClick={() => {
                      onOpenTech();
                      setMenuOpen(false);
                    }}
                  >
                    Technologies
                  </Button>
                )}
                {onOpenDiplomacy && (
                  <Button
                    variant="ghost"
                    fullWidth
                    role="menuitem"
                    onClick={() => {
                      onOpenDiplomacy();
                      setMenuOpen(false);
                    }}
                  >
                    Diplomatie
                  </Button>
                )}
                <Button
                  variant="danger"
                  fullWidth
                  role="menuitem"
                  onClick={() => {
                    onQuitToMenu();
                    setMenuOpen(false);
                  }}
                >
                  Menu principal
                </Button>
              </div>
            )}
          </div>
        </>
      )}
    </nav>
  );
}

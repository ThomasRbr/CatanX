import { TurnPhase } from '@catanx/engine';
import { useState } from 'react';
import { frTurnPhase } from '../../i18n/fr';
import type { ClassicBuildMode } from '../../store/uiStore';
import { Icon, type CatanXIconName } from '../../ui';
import styles from './TurnActionPlanner.module.css';

type PlannerTab = 'build' | 'trade' | 'units' | 'city';

interface TurnActionPlannerProps {
  currentTurn: number;
  phase: TurnPhase;
  hasRolledDiceThisTurn: boolean;
  pendingChoice: boolean;
  selectedTileId: string | null;
  sidePanelTab: 'tile' | PlannerTab;
  actionCountThisTurn: number;
  advancedVisible: boolean;
  classicMode?: boolean;
  classicBuildMode?: ClassicBuildMode | null;
  onRollDice: () => void;
  onOpenEvent: () => void;
  onOpenTab: (tab: PlannerTab) => void;
  onOpenTech: () => void;
  onOpenDiplomacy: () => void;
  onEndTurn: () => void;
  onToggleAdvanced: (next: boolean) => void;
  onSave?: () => void;
}

type PlannerAction = {
  id: PlannerTab | 'research' | 'diplomacy';
  label: string;
  icon: CatanXIconName;
  action: () => void;
};

/** One-click turn controls. Only uncommon actions live in the optional drawer. */
export function TurnActionPlanner({
  currentTurn,
  phase,
  hasRolledDiceThisTurn,
  pendingChoice,
  selectedTileId,
  sidePanelTab,
  actionCountThisTurn,
  advancedVisible,
  classicMode = false,
  classicBuildMode = null,
  onRollDice,
  onOpenEvent,
  onOpenTab,
  onOpenTech,
  onOpenDiplomacy,
  onEndTurn,
  onToggleAdvanced,
  onSave,
}: TurnActionPlannerProps) {
  const [moreOpen, setMoreOpen] = useState(false);
  const actionStarted = actionCountThisTurn > 0 || sidePanelTab !== 'tile' || Boolean(classicBuildMode);
  const steps = [hasRolledDiceThisTurn, Boolean(selectedTileId), actionStarted];
  const progress = steps.filter(Boolean).length;

  let primaryLabel = 'Fin du tour';
  let primaryHint = 'Passer la main';
  let primaryIcon: CatanXIconName = 'endTurn';
  let primaryAction = onEndTurn;
  let primaryDisabled = false;
  if (!hasRolledDiceThisTurn) {
    primaryLabel = 'Lancer les dés';
    primaryHint = 'Production de l’île';
    primaryIcon = 'dice';
    primaryAction = onRollDice;
  } else if (pendingChoice) {
    primaryLabel = 'Résoudre le choix';
    primaryHint = 'Décision en attente';
    primaryIcon = 'warning';
    primaryAction = onOpenEvent;
  } else if (classicMode && phase === 'resource_collect') {
    primaryLabel = 'Collecte en cours';
    primaryHint = 'Distribution des ressources';
    primaryIcon = 'season';
    primaryDisabled = true;
  }

  const coreActions: PlannerAction[] = [
    { id: 'build', label: 'Construire', icon: 'build', action: () => onOpenTab('build') },
    { id: 'trade', label: 'Commerce', icon: 'trade', action: () => onOpenTab('trade') },
  ];
  const secondaryActions: PlannerAction[] = classicMode
    ? []
    : [
        { id: 'units', label: 'Unités', icon: 'army', action: () => onOpenTab('units') },
        { id: 'city', label: 'Ville', icon: 'city', action: () => onOpenTab('city') },
        { id: 'research', label: 'Recherche', icon: 'tech', action: onOpenTech },
        { id: 'diplomacy', label: 'Diplomatie', icon: 'diplomacy', action: onOpenDiplomacy },
      ];

  const runSecondaryAction = (action: () => void) => {
    action();
    setMoreOpen(false);
  };

  return (
    <aside
      className={`ui-panel turn-planner ${styles.panel}`}
      aria-label="Actions de tour"
      data-more-open={moreOpen ? 'true' : undefined}
    >
      <header className={styles.header}>
        <span className={styles.turnNumber} aria-label={`Tour ${currentTurn}`}>{currentTurn}</span>
        <div className={styles.phaseIdentity}>
          <small>Tour en cours</small>
          <strong>{frTurnPhase(phase)}</strong>
        </div>
        <div className={styles.progress} aria-label={`${progress} étapes sur 3 terminées`}>
          {steps.map((done, index) => (
            <i key={index} data-done={done ? 'true' : undefined} aria-hidden="true" />
          ))}
        </div>
      </header>

      <button
        type="button"
        className={styles.primaryAction}
        data-tone={pendingChoice ? 'warning' : hasRolledDiceThisTurn ? 'end' : 'dice'}
        disabled={primaryDisabled}
        onClick={primaryAction}
      >
        <span className={styles.primaryIcon} aria-hidden="true">
          <Icon name={primaryIcon} size={20} />
        </span>
        <span className={styles.primaryCopy}>
          <strong>{primaryLabel}</strong>
          <small>{primaryHint}</small>
        </span>
        <Icon name="check" size={15} aria-hidden="true" />
      </button>

      <nav className={styles.quickActions} aria-label="Actions rapides">
        {coreActions.map((action) => (
          <button
            key={action.id}
            type="button"
            data-active={sidePanelTab === action.id ? 'true' : undefined}
            onClick={action.action}
            aria-label={action.label}
          >
            <span aria-hidden="true"><Icon name={action.icon} size={18} /></span>
            <strong>{action.label}</strong>
          </button>
        ))}
        <button
          type="button"
          className={styles.moreButton}
          aria-label="Plus d’actions"
          aria-expanded={moreOpen}
          onClick={() => setMoreOpen((open) => !open)}
        >
          <span aria-hidden="true"><Icon name={moreOpen ? 'close' : 'more'} size={18} /></span>
          <strong>{moreOpen ? 'Fermer' : 'Plus'}</strong>
        </button>
      </nav>

      {moreOpen && (
        <section className={styles.secondaryDrawer} aria-label="Actions secondaires">
          <header>
            <span>Autres commandes</span>
            <small>Actions moins fréquentes</small>
          </header>
          {secondaryActions.length > 0 && (
            <div className={styles.secondaryGrid}>
              {secondaryActions.map((action) => (
                <button
                  key={action.id}
                  type="button"
                  data-active={sidePanelTab === action.id ? 'true' : undefined}
                  onClick={() => runSecondaryAction(action.action)}
                >
                  <Icon name={action.icon} size={17} />
                  <span>{action.label}</span>
                </button>
              ))}
            </div>
          )}
          <button
            type="button"
            className={styles.advancedToggle}
            onClick={() => onToggleAdvanced(!advancedVisible)}
            aria-pressed={advancedVisible}
          >
            <Icon name="settings" size={15} />
            <span>{advancedVisible ? 'Masquer les panneaux avancés' : 'Afficher les panneaux avancés'}</span>
          </button>
          {onSave && (
            <button type="button" className={styles.advancedToggle} onClick={() => runSecondaryAction(onSave)}>
              <Icon name="save" size={15} />
              <span>Sauvegarder la partie</span>
            </button>
          )}
        </section>
      )}
    </aside>
  );
}

import { useEffect, useMemo, useState } from 'react';
import type { TurnPhase } from '@catanx/engine';
import { TUTORIAL_STORAGE_KEY } from '../../design/tokens';
import {
  buildTutorialSteps,
  findActiveTutorialStep,
} from '../../tutorial/tutorialSteps';

interface TutorialCoachProps {
  classicMode: boolean;
  citiesKnights?: boolean;
  isInitialPlacement: boolean;
  placementStep?: 'settlement' | 'road' | null;
  hasRolledDiceThisTurn: boolean;
  selectedTileId: string | null;
  sidePanelTab: 'tile' | 'build' | 'trade' | 'units' | 'city';
  currentTurn: number;
  turnPhase: TurnPhase | string;
  hasBuiltThisTurn: boolean;
  hasTradedThisTurn: boolean;
  hasEndedTurnOnce: boolean;
  hasCkKnight?: boolean;
  hasSeenBarbarians?: boolean;
  hasImprovedUrban?: boolean;
  docked?: boolean;
  onOpenTech?: () => void;
  onOpenDiplomacy?: () => void;
}

function readTutorialDone(): boolean {
  if (typeof window === 'undefined') return false;
  return window.localStorage.getItem(TUTORIAL_STORAGE_KEY) === '1';
}

function persistTutorialDone(value: boolean): void {
  if (typeof window === 'undefined') return;
  if (value) {
    window.localStorage.setItem(TUTORIAL_STORAGE_KEY, '1');
    return;
  }
  window.localStorage.removeItem(TUTORIAL_STORAGE_KEY);
}

export function TutorialCoach({
  classicMode,
  citiesKnights = false,
  isInitialPlacement,
  placementStep,
  hasRolledDiceThisTurn,
  selectedTileId,
  sidePanelTab,
  currentTurn,
  turnPhase,
  hasBuiltThisTurn,
  hasTradedThisTurn,
  hasEndedTurnOnce,
  hasCkKnight = false,
  hasSeenBarbarians = false,
  hasImprovedUrban = false,
  docked = false,
  onOpenTech,
  onOpenDiplomacy,
}: TutorialCoachProps) {
  const [isOpen, setIsOpen] = useState(() => !readTutorialDone());

  const steps = useMemo(
    () =>
      buildTutorialSteps({
        classicMode,
        citiesKnights,
        isInitialPlacement,
        placementStep,
        hasRolledDiceThisTurn,
        selectedTileId,
        sidePanelTab,
        currentTurn,
        turnPhase,
        hasBuiltThisTurn,
        hasTradedThisTurn,
        hasEndedTurnOnce,
        hasCkKnight,
        hasSeenBarbarians,
        hasImprovedUrban,
      }),
    [
      classicMode,
      citiesKnights,
      currentTurn,
      hasBuiltThisTurn,
      hasCkKnight,
      hasEndedTurnOnce,
      hasImprovedUrban,
      hasRolledDiceThisTurn,
      hasSeenBarbarians,
      hasTradedThisTurn,
      isInitialPlacement,
      placementStep,
      selectedTileId,
      sidePanelTab,
      turnPhase,
    ],
  );

  const completedCount = steps.filter((step) => step.done).length;
  const allDone = completedCount === steps.length;
  const activeStep = findActiveTutorialStep(steps);

  useEffect(() => {
    if (!allDone) return;
    persistTutorialDone(true);
  }, [allDone]);

  const panelClassName = docked
    ? 'ui-panel tutorial-coach tutorial-coach--docked'
    : 'ui-panel tutorial-coach';

  const panelStyle = docked
    ? {
        position: 'absolute' as const,
        left: 12,
        bottom: 84,
        width: 320,
        maxHeight: 'min(36vh, 280px)',
        overflow: 'auto' as const,
        padding: 12,
        pointerEvents: 'auto' as const,
      }
    : {
        position: 'absolute' as const,
        right: 12,
        top: 76,
        width: 340,
        padding: 12,
        pointerEvents: 'auto' as const,
      };

  const collapsedStyle = docked
    ? { position: 'absolute' as const, left: 12, bottom: 84, pointerEvents: 'auto' as const }
    : {
        position: 'absolute' as const,
        right: 12,
        top: 76,
        pointerEvents: 'auto' as const,
      };

  if (!isOpen) {
    return (
      <div style={collapsedStyle}>
        <button
          type="button"
          className="command-button"
          aria-label="Ouvrir l’aide et le tutoriel"
          onClick={() => setIsOpen(true)}
        >
          Aide et tutoriel
        </button>
      </div>
    );
  }

  return (
    <aside
      className={panelClassName}
      aria-label="Tutoriel interactif"
      style={panelStyle}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ fontWeight: 800, fontSize: 15 }}>Conseiller royal</div>
        <button
          type="button"
          className="command-button secondary"
          aria-label="Masquer le tutoriel"
          onClick={() => setIsOpen(false)}
        >
          Masquer
        </button>
      </div>

      <div style={{ marginTop: 8, fontSize: 12, opacity: 0.82 }}>
        Progression tutoriel : {completedCount}/{steps.length}
      </div>

      <div className="tutorial-step-card" style={{ marginTop: 8, padding: 10 }}>
        <div style={{ fontWeight: 700 }}>{activeStep.title}</div>
        <div style={{ marginTop: 4, fontSize: 12, opacity: 0.86 }}>{activeStep.detail}</div>
      </div>

      <ol style={{ marginTop: 10, display: 'grid', gap: 6, padding: 0, listStyle: 'none' }}>
        {steps.map((step) => (
          <li
            key={step.id}
            style={{
              borderRadius: 10,
              border: `1px solid ${step.done ? 'rgba(25,135,84,0.45)' : 'rgba(88,66,40,0.28)'}`,
              background: step.done ? 'rgba(193,255,224,0.18)' : 'rgba(255,248,235,0.45)',
              padding: '8px 10px',
              fontSize: 12,
            }}
            aria-current={step.id === activeStep.id ? 'step' : undefined}
          >
            <strong>{step.done ? 'OK' : '--'}</strong> {step.title}
          </li>
        ))}
      </ol>

      <div style={{ marginTop: 10, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {onOpenTech && (
          <button type="button" className="command-button secondary" onClick={onOpenTech}>
            Ouvrir l’arbre techno
          </button>
        )}
        {onOpenDiplomacy && (
          <button type="button" className="command-button secondary" onClick={onOpenDiplomacy}>
            Ouvrir la diplomatie
          </button>
        )}
        <button
          type="button"
          className="command-button secondary"
          onClick={() => {
            persistTutorialDone(false);
            setIsOpen(true);
          }}
        >
          Réinitialiser le tutoriel
        </button>
      </div>

      {allDone && (
        <div style={{ marginTop: 10, fontSize: 12, fontWeight: 700, color: '#185a2d' }}>
          Tutoriel terminé. Vous pouvez le rouvrir via Aide et tutoriel.
        </div>
      )}
    </aside>
  );
}

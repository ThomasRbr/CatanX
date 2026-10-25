import type { TurnPhase } from '@catanx/engine';
import { frTurnPhase } from '../../i18n/fr';
import styles from './PhaseBanner.module.css';

interface PhaseBannerProps {
  phase: TurnPhase | string;
  classicMode: boolean;
  isInitialPlacement: boolean;
  activePlayerName: string;
}

const CLASSIC_HINTS: Partial<Record<string, string>> = {
  setup: 'Ordre serpent : 2 villages + 2 routes.',
  resource_collect: 'Les ressources arrivent sur les tuiles.',
  discard_resources: 'Défaussez la moitié de vos cartes.',
  move_robber: 'Déplacez le brigand.',
  steal_resource: 'Volez un joueur adjacent.',
  player_action: 'Construisez, commercez ou carte dev.',
};

export function PhaseBanner({
  phase,
  classicMode,
  isInitialPlacement,
  activePlayerName,
}: PhaseBannerProps) {
  if (!classicMode || isInitialPlacement) return null;

  const label = isInitialPlacement ? 'Placement initial' : frTurnPhase(phase);
  const hint = isInitialPlacement
    ? CLASSIC_HINTS.setup
    : (CLASSIC_HINTS[phase] ?? 'Suivez le plan de tour.');

  return (
    <div className={styles.banner} role="status" aria-live="polite" data-hud-zone="phase">
      <span className={styles.player}>{activePlayerName}</span>
      <strong className={styles.label}>{label}</strong>
      <span className={styles.hint}>{hint}</span>
    </div>
  );
}

import { useEffect, useState, type CSSProperties } from 'react';
import {
  getClimateDefinition,
  type GamePacingPreset,
  type Season,
  type SeasonClimateId,
} from '@catanx/engine';
import { frResource, frSeason } from '../../i18n/fr';
import { Icon, type CatanXIconName } from '../../ui';
import styles from './SeasonTransitionMoment.module.css';

const RESOURCE_ICONS: Record<string, CatanXIconName> = {
  wood: 'wood',
  clay: 'brick',
  wheat: 'wheat',
  sheep: 'sheep',
  ore: 'ore',
};

const SEASON_KICKERS: Record<Season, string> = {
  spring: 'La terre s’éveille',
  summer: 'L’île rayonne',
  autumn: 'Le temps des récoltes',
  winter: 'Le froid gagne Catan',
};

interface SeasonTransitionMomentProps {
  token: string;
  season: Season;
  climateId: SeasonClimateId;
  year: number;
  pacing: GamePacingPreset;
  motionEnabled: boolean;
  onComplete?: () => void;
}

export function SeasonTransitionMoment({
  token,
  season,
  climateId,
  year,
  pacing,
  motionEnabled,
  onComplete,
}: SeasonTransitionMomentProps) {
  const [visible, setVisible] = useState(true);
  const climate = getClimateDefinition(climateId);
  const duration = motionEnabled
    ? pacing === 'epic'
      ? 7600
      : pacing === 'tabletop'
        ? 6400
        : 5000
    : 4600;
  const severe = climate.severity === 'severe';

  useEffect(() => {
    setVisible(true);
    const timeout = window.setTimeout(() => {
      setVisible(false);
      onComplete?.();
    }, duration);
    return () => window.clearTimeout(timeout);
  }, [duration, onComplete, token]);

  if (!visible) return null;

  return (
    <div
      className={styles.layer}
      data-season={season}
      data-severity={severe ? 'severe' : 'standard'}
      data-motion={motionEnabled ? 'on' : 'off'}
      style={{ '--season-duration': `${duration}ms` } as CSSProperties}
      role="status"
      aria-live="assertive"
      aria-label={`${frSeason(season)}, ${climate.labelFr}`}
    >
      <div className={styles.wash} aria-hidden="true" />
      <div className={styles.horizon} aria-hidden="true" />
      <div className={styles.particles} aria-hidden="true">
        {Array.from({ length: 14 }, (_, index) => (
          <i
            key={index}
            style={
              {
                '--particle-left': `${(index * 17 + 7) % 100}%`,
                '--particle-delay': `${index * 70}ms`,
                '--particle-drift': `${(index - 7) * 2}vw`,
              } as CSSProperties
            }
          />
        ))}
      </div>

      <section className={styles.announcement}>
        <span className={styles.crest} aria-hidden="true">
          <Icon name="season" size={32} />
        </span>
        <div className={styles.heading}>
          <small>Année {year} · Nouvelle saison</small>
          <strong>{frSeason(season)}</strong>
          <em>{SEASON_KICKERS[season]}</em>
        </div>
        <div className={styles.climate}>
          <span className={styles.severity}>{severe ? 'Climat rude' : 'Climat standard'}</span>
          <b>{climate.labelFr}</b>
          <p>{climate.summaryFr}</p>
        </div>
        <div className={styles.favored} aria-label="Ressources favorisées">
          <small>Abondance</small>
          {climate.favoredResources.map((resource, index) => (
            <span key={resource}>
              <Icon name={RESOURCE_ICONS[resource]} size={17} />
              <b>{index === 0 ? 'Priorité' : 'Puis'} : +1 {frResource(resource)}</b>
            </span>
          ))}
        </div>
      </section>
      <span className={styles.timeline} aria-hidden="true" />
    </div>
  );
}

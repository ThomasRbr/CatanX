import type { CSSProperties } from 'react';
import type { PlayerProfile } from '@catanx/engine';
import { frCivilization } from '../../i18n/fr';
import {
  PIECE_FINISHES,
  normalizeProfile,
  pieceColorHex,
  profileTitleLabel,
} from '../../profile/profileCatalog';
import { ProfileAvatar, ProfileEmblem } from './ProfileAvatar';
import styles from './PlayerProfileCard.module.css';

interface PlayerProfileCardProps {
  name: string;
  profile: PlayerProfile;
  civilization?: string;
  victoryPoints?: number;
  handSize?: number;
  devCardCount?: number;
  compact?: boolean;
}

export function PlayerProfileCard({
  name,
  profile,
  civilization,
  victoryPoints,
  handSize,
  devCardCount,
  compact = false,
}: PlayerProfileCardProps) {
  const visual = normalizeProfile(profile);
  const pieceFinish = PIECE_FINISHES.find((item) => item.id === visual.pieceFinish)?.label;
  return (
    <article
      className={`${styles.card} ${compact ? styles.compact : ''}`}
      data-banner={visual.banner}
      data-material={visual.cardMaterial}
      data-aura={visual.aura}
      style={{ '--identity-color': pieceColorHex(visual.pieceColor) } as CSSProperties}
    >
      <div className={styles.pattern} aria-hidden="true" />
      <header className={styles.identity}>
        <ProfileAvatar profile={visual} size={compact ? 52 : 88} label={`Portrait de ${name}`} />
        <div className={styles.names}>
          <span className={styles.title}>{profileTitleLabel(visual.title)}</span>
          <h3>{name}</h3>
          {civilization && (
            <span className={styles.civilization}>{frCivilization(civilization as never)}</span>
          )}
        </div>
        <span className={styles.heroEmblem}>
          <ProfileEmblem id={visual.emblem} size={22} />
        </span>
      </header>
      <blockquote>« {visual.tagline || 'Une nouvelle légende commence.'} »</blockquote>
      {(victoryPoints != null || handSize != null || devCardCount != null) && (
        <dl className={styles.stats}>
          {victoryPoints != null && (
            <div>
              <dt>Prestige</dt>
              <dd>{victoryPoints} PV</dd>
            </div>
          )}
          {handSize != null && (
            <div>
              <dt>Ressources</dt>
              <dd>{handSize}</dd>
            </div>
          )}
          {devCardCount != null && (
            <div>
              <dt>Cartes</dt>
              <dd>{devCardCount}</dd>
            </div>
          )}
        </dl>
      )}
      <footer>
        <i style={{ background: pieceColorHex(visual.pieceColor) }} /> Pièces{' '}
        {pieceFinish?.toLowerCase()}
      </footer>
    </article>
  );
}

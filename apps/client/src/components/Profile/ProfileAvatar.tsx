import { useId, type CSSProperties } from 'react';
import type { PlayerEmblemId, PlayerProfile } from '@catanx/engine';
import {
  hairColorHex,
  normalizeProfile,
  pieceColorHex,
  skinToneHex,
} from '../../profile/profileCatalog';
import styles from './ProfileAvatar.module.css';

interface ProfileAvatarProps {
  profile: PlayerProfile;
  size?: number;
  label?: string;
  className?: string;
}

export function ProfileEmblem({ id, size = 18 }: { id: PlayerEmblemId; size?: number }) {
  const common = {
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.8,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
  };
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true">
      {id === 'compass' && (
        <>
          <circle cx="12" cy="12" r="8" {...common} />
          <path d="m15.5 8.5-2 5-5 2 2-5 5-2Z" {...common} />
        </>
      )}
      {id === 'peak' && (
        <>
          <path d="M3 18 10 6l3 5 2-3 6 10H3Z" {...common} />
          <path d="m8 13 2-2 2 2" {...common} />
        </>
      )}
      {id === 'harbor' && (
        <>
          <path d="M5 19V8m14 11V8M3 19h18M8 8h8l-1.5-3h-5L8 8Z" {...common} />
          <path d="M8 14c2-2 6-2 8 0" {...common} />
        </>
      )}
      {id === 'sun' && (
        <>
          <circle cx="12" cy="12" r="4" {...common} />
          <path
            d="M12 2v3m0 14v3M2 12h3m14 0h3M5 5l2 2m10 10 2 2M19 5l-2 2M7 17l-2 2"
            {...common}
          />
        </>
      )}
      {id === 'oak' && (
        <>
          <path d="M12 21v-7m0 2-4-3m4 1 4-3" {...common} />
          <path d="M7 13a4 4 0 0 1 1-8 4.5 4.5 0 0 1 8 1 3.5 3.5 0 0 1 1 7H7Z" {...common} />
        </>
      )}
      {id === 'star' && (
        <path
          d="m12 3 2.4 5 5.6.8-4 3.9.9 5.5-4.9-2.6-4.9 2.6.9-5.5-4-3.9 5.6-.8L12 3Z"
          {...common}
        />
      )}
      {id === 'anchor' && (
        <>
          <circle cx="12" cy="6" r="2.5" {...common} />
          <path d="M12 8.5V20M6 13H3m18 0h-3M5 15c1 4 4 6 7 6s6-2 7-6M8 11h8" {...common} />
        </>
      )}
      {id === 'wave' && (
        <path
          d="M3 10c2.5 0 2.5-2 5-2s2.5 2 5 2 2.5-2 5-2 2.5 2 3 2M3 15c2.5 0 2.5-2 5-2s2.5 2 5 2 2.5-2 5-2 2.5 2 3 2"
          {...common}
        />
      )}
      {id === 'hammer' && (
        <>
          <path d="m8 4 5 5-3 3-5-5 3-3Zm4 6 8 8-3 3-8-8" {...common} />
          <path d="m15 5 4 4" {...common} />
        </>
      )}
      {id === 'wheat' && (
        <>
          <path d="M12 21V4" {...common} />
          <path
            d="M12 8C8 7 7 5 7 3c4 0 5 2 5 5Zm0 5c-4-1-5-3-5-5 4 0 5 2 5 5Zm0 4c4-1 5-3 5-5-4 0-5 2-5 5Zm0-5c4-1 5-3 5-5-4 0-5 2-5 5Z"
            {...common}
          />
        </>
      )}
      {id === 'shield' && (
        <path d="M12 3 20 6v5c0 5-3.2 8.5-8 10-4.8-1.5-8-5-8-10V6l8-3Zm0 4v10m-4-5h8" {...common} />
      )}
      {id === 'moon' && (
        <>
          <path d="M17.5 17.5A8 8 0 0 1 9 4a8 8 0 1 0 8.5 13.5Z" {...common} />
          <path d="m18 5 .6 1.4L20 7l-1.4.6L18 9l-.6-1.4L16 7l1.4-.6L18 5Z" {...common} />
        </>
      )}
    </svg>
  );
}

function hairPath(portrait: PlayerProfile['portrait']): string {
  if (['navigator', 'merchant', 'cartographer', 'astronomer'].includes(portrait)) {
    return 'M27 45c-2-26 12-35 26-34 17 1 24 15 20 38-7-12-14-20-31-20-4 7-9 13-15 16Z';
  }
  if (['architect', 'scholar', 'artisan', 'diplomat'].includes(portrait)) {
    return 'M28 39c1-21 13-30 27-28 11 2 18 10 19 25-14-7-32-8-46 3Z';
  }
  if (portrait === 'commander') return 'M29 36c4-19 15-26 28-24 9 1 15 8 16 19-15-5-30-4-44 5Z';
  if (portrait === 'ranger') return 'M27 43c0-22 10-32 23-32 18 0 26 15 22 35-10-9-29-15-45-3Z';
  return 'M28 43c-1-22 10-32 23-32 16 0 25 13 22 34-10-8-29-14-45-2Z';
}

export function ProfileAvatar({
  profile,
  size = 64,
  label = 'Avatar du joueur',
  className = '',
}: ProfileAvatarProps) {
  const visual = normalizeProfile(profile);
  const gradientId = `coat-${useId().replace(/:/g, '')}`;
  const style = {
    '--avatar-size': `${size}px`,
    '--piece-color': pieceColorHex(visual.pieceColor),
    '--skin-color': skinToneHex(visual.skinTone),
    '--hair-color': hairColorHex(visual.hairColor),
  } as CSSProperties;
  const smilePath =
    visual.expression === 'calm'
      ? 'M46 55h9'
      : visual.expression === 'focused'
        ? 'M46 57c3-1 6-1 9 0'
        : visual.expression === 'bold'
          ? 'M46 57c3 1 6 1 9 0'
          : 'M45 54c3 4 8 4 11 0';
  return (
    <div
      className={`${styles.avatar} ${className}`}
      data-banner={visual.banner}
      data-frame={visual.frame}
      data-aura={visual.aura}
      style={style}
      role="img"
      aria-label={label}
    >
      <svg className={styles.portrait} viewBox="0 0 100 100" aria-hidden="true">
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="1" y2="1">
            <stop stopColor="var(--piece-color)" />
            <stop offset="1" stopColor="#14263b" />
          </linearGradient>
        </defs>
        <path d="M14 99c2-25 16-37 36-37s35 12 37 37H14Z" fill={`url(#${gradientId})`} />
        {visual.outfit === 'artisan' && (
          <path d="M35 65h30l6 34H29l6-34Z" fill="#f1b84a" opacity=".78" />
        )}
        {visual.outfit === 'diplomat' && (
          <path d="m32 66 18 17 18-17 10 33H22l10-33Z" fill="#f7f8fc" opacity=".82" />
        )}
        {visual.outfit === 'scholar' && (
          <path d="M25 75 39 63l11 19 11-19 14 12-4 24H29l-4-24Z" fill="#8b6cff" opacity=".65" />
        )}
        {visual.outfit === 'guardian' && (
          <path d="m25 77 12-14 13 9 13-9 12 14-4 22H29l-4-22Z" fill="#c8d3dc" opacity=".72" />
        )}
        {visual.outfit === 'nomad' && (
          <path d="M22 83c13-21 43-25 57-5l-5 21H26l-4-16Z" fill="#8f6044" opacity=".8" />
        )}
        {visual.outfit === 'harbormaster' && (
          <>
            <path d="M28 69h44l8 30H20l8-30Z" fill="#173653" opacity=".9" />
            <path d="M36 70h28" stroke="#ffcd4a" strokeWidth="3" />
          </>
        )}
        {visual.outfit === 'strategist' && (
          <>
            <path d="m25 76 13-12 12 9 12-9 13 12-4 23H29l-4-23Z" fill="#202735" />
            <path d="m39 65 11 21 11-21" fill="none" stroke="var(--piece-color)" strokeWidth="3" />
          </>
        )}
        {visual.outfit === 'voyager' && (
          <path
            d="M23 91c7-18 18-27 27-27s21 9 28 27l-8 8H29l-6-8Z"
            fill="var(--piece-color)"
            opacity=".55"
          />
        )}
        {visual.portrait === 'guardian' && (
          <path d="M23 68c2-31 12-46 27-46 17 0 27 15 30 48L68 61H32L23 68Z" fill="#1b2b3c" />
        )}
        <ellipse
          cx="50"
          cy="44"
          rx={visual.portrait === 'commander' ? 22 : 21}
          ry={visual.portrait === 'astronomer' ? 26 : 25}
          fill="var(--skin-color)"
        />
        <path d={hairPath(visual.portrait)} fill="var(--hair-color)" />
        {['navigator', 'merchant', 'cartographer', 'astronomer'].includes(visual.portrait) && (
          <path
            d="M29 43c-5 18 1 31 7 37l5-10c-8-9-9-20-6-31l-6 4Zm42-1c5 18 0 31-6 38l-5-10c8-9 9-20 6-31l5 3Z"
            fill="var(--hair-color)"
          />
        )}
        <path
          d={visual.expression === 'focused' ? 'M37 43l8 2m10 0 8-2' : 'M38 45h7m10 0h7'}
          stroke="#26313b"
          strokeWidth="2.5"
          strokeLinecap="round"
        />
        <path d={smilePath} fill="none" stroke="#7e493b" strokeWidth="2" strokeLinecap="round" />
        {visual.expression === 'joyful' && (
          <>
            <path d="M34 51h4m24 0h4" stroke="#dd7c73" strokeWidth="2" />
            <path d="M48 58c2 1 4 1 6 0" stroke="#fff" strokeWidth="1.5" />
          </>
        )}
        {visual.portrait === 'explorer' && (
          <path
            d="M32 62c8 9 28 11 37-1-2 12-8 19-19 19-10 0-16-7-18-18Z"
            fill="var(--hair-color)"
            opacity=".72"
          />
        )}
        {visual.accessory === 'captain' && (
          <>
            <path d="M25 27c9-15 41-16 50 0l-9 7H34l-9-7Z" fill="#f7f8fc" />
            <path d="M34 33h32" stroke="var(--piece-color)" strokeWidth="5" />
          </>
        )}
        {visual.accessory === 'laurel' && (
          <path
            d="M25 35c3-14 10-21 22-25M75 35c-3-14-10-21-22-25"
            fill="none"
            stroke="#ffcd4a"
            strokeWidth="4"
            strokeDasharray="3 4"
            strokeLinecap="round"
          />
        )}
        {visual.accessory === 'monocle' && (
          <>
            <circle cx="59" cy="45" r="8" fill="none" stroke="#ffcd4a" strokeWidth="2" />
            <path d="M66 51 73 66" stroke="#ffcd4a" strokeWidth="2" />
          </>
        )}
        {visual.accessory === 'hood' && (
          <path
            d="M22 52c0-29 12-43 29-43 18 0 30 16 30 44l-10-9c0-17-8-26-20-26-11 0-19 8-20 26l-9 8Z"
            fill="#1a2939"
            opacity=".92"
          />
        )}
        {visual.accessory === 'diadem' && (
          <path d="m30 31 7-9 8 7 7-12 8 12 8-7 4 10c-14-5-29-5-42-1Z" fill="#ffcd4a" />
        )}
        {visual.accessory === 'goggles' && (
          <>
            <rect
              x="31"
              y="39"
              width="16"
              height="12"
              rx="5"
              fill="none"
              stroke="#0b1f38"
              strokeWidth="3"
            />
            <rect
              x="53"
              y="39"
              width="16"
              height="12"
              rx="5"
              fill="none"
              stroke="#0b1f38"
              strokeWidth="3"
            />
            <path d="M47 44h6" stroke="#0b1f38" strokeWidth="3" />
          </>
        )}
        {visual.accessory === 'feather' && (
          <>
            <path d="M67 31c12-15 17-14 15-4-2 8-8 12-15 13" fill="#ff6b5f" />
            <path d="m67 39 10-9" stroke="#f7f8fc" strokeWidth="1.5" />
          </>
        )}
        {visual.accessory === 'scarf' && (
          <>
            <path d="M31 64c11 8 28 8 39 0l4 12c-16 8-32 7-47 0l4-12Z" fill="#ff6b5f" />
            <path d="m65 71 11 19-8 2-8-19" fill="#ff6b5f" />
          </>
        )}
        {visual.accessory === 'earring' && (
          <circle cx="72" cy="54" r="4" fill="none" stroke="#ffcd4a" strokeWidth="2.5" />
        )}
        {visual.accessory === 'headset' && (
          <>
            <path d="M26 45c0-24 48-24 48 0" fill="none" stroke="#202735" strokeWidth="4" />
            <rect x="22" y="42" width="8" height="17" rx="4" fill="#1fc8c4" />
            <path d="M73 50c8 0 8 8 1 8h-8" fill="none" stroke="#1fc8c4" strokeWidth="3" />
          </>
        )}
        {visual.accessory === 'circlet' && (
          <path
            d="M29 31c13-6 29-6 43 0l-3 5c-12-4-25-4-37 0l-3-5Z"
            fill="#f7f8fc"
            stroke="#ffcd4a"
            strokeWidth="1"
          />
        )}
        {visual.accessory === 'bandana' && (
          <>
            <path d="M27 31c14-6 31-6 46 0l-2 8c-14-5-28-5-42 0l-2-8Z" fill="var(--piece-color)" />
            <path d="m70 34 12 3-9 8" fill="var(--piece-color)" />
          </>
        )}
      </svg>
      <span className={styles.emblem}>
        <ProfileEmblem id={visual.emblem} size={Math.max(12, size * 0.24)} />
      </span>
    </div>
  );
}

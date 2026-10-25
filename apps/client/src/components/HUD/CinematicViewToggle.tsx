import type { CSSProperties } from 'react';
import type { BoardViewMode } from '../../render3d/camera/viewMode';

const btn: CSSProperties = {
  padding: '6px 12px',
  cursor: 'pointer',
  border: '1px solid rgba(200, 220, 200, 0.28)',
  background: 'rgba(24, 32, 26, 0.82)',
  color: '#e8efe6',
  borderRadius: 6,
  fontFamily: 'Georgia, "Times New Roman", serif',
  fontSize: 13,
  backdropFilter: 'blur(6px)',
  pointerEvents: 'auto',
};

interface CinematicViewToggleProps {
  mode: BoardViewMode;
  onChange: (mode: BoardViewMode) => void;
}

/** H7 — switch between strategic HUD and promo cinematic framing. */
export function CinematicViewToggle({ mode, onChange }: CinematicViewToggleProps) {
  const cinematic = mode === 'cinematic';

  return (
    <div
      style={{
        position: 'fixed',
        zIndex: 30,
        left: cinematic ? undefined : 12,
        right: cinematic ? 14 : undefined,
        bottom: cinematic ? undefined : 12,
        top: cinematic ? 14 : undefined,
        pointerEvents: 'none',
      }}
    >
      <button
        type="button"
        style={btn}
        onClick={() => onChange(cinematic ? 'strategic' : 'cinematic')}
        aria-pressed={cinematic}
        data-testid="cinematic-view-toggle"
      >
        {cinematic ? 'Vue stratégique' : 'Vue cinématique'}
      </button>
    </div>
  );
}

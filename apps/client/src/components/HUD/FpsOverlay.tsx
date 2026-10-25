import { useEffect, useState } from 'react';
import { getLastAiRationale } from '@catanx/engine';

interface FpsOverlayProps {
  enabled: boolean;
}

/**
 * Compteur FPS du thread principal (rAF), pas du ticker Pixi.
 * Affiché seulement si activé dans les paramètres.
 * Cible desktop : ≥ 30 FPS en partie classique (carte tiny/medium).
 * Quand activé, affiche aussi la dernière rationale IA (debug).
 */
export function FpsOverlay({ enabled }: FpsOverlayProps) {
  const [fps, setFps] = useState<number | null>(null);
  const [aiLine, setAiLine] = useState<string | null>(null);

  useEffect(() => {
    if (!enabled) {
      setFps(null);
      setAiLine(null);
      return;
    }

    let frames = 0;
    let last = performance.now();
    let raf = 0;
    let alive = true;

    const tick = (now: number) => {
      if (!alive) return;
      frames += 1;
      const elapsed = now - last;
      if (elapsed >= 500) {
        setFps(Math.round((frames * 1000) / elapsed));
        frames = 0;
        last = now;
        const rationale = getLastAiRationale();
        if (rationale) {
          setAiLine(`${rationale.layer} · ${rationale.summary}`);
        }
      }
      raf = requestAnimationFrame(tick);
    };

    raf = requestAnimationFrame(tick);
    return () => {
      alive = false;
      cancelAnimationFrame(raf);
    };
  }, [enabled]);

  if (!enabled) return null;

  const color =
    fps === null ? '#4d3724' : fps >= 50 ? '#14532d' : fps >= 30 ? '#854d0e' : '#7f1d1d';

  return (
    <div
      aria-live="polite"
      title="FPS + dernière décision IA (debug)"
      style={{
        position: 'fixed',
        left: 10,
        bottom: 10,
        zIndex: 80,
        pointerEvents: 'none',
        padding: '4px 8px',
        borderRadius: 8,
        fontSize: 12,
        fontWeight: 700,
        fontFamily: 'ui-monospace, monospace',
        background: 'rgba(255,247,232,0.92)',
        color,
        border: '1px solid rgba(74,53,30,0.25)',
        maxWidth: 320,
      }}
    >
      <div>{fps === null ? '— FPS' : `${fps} FPS`}</div>
      {aiLine ? (
        <div style={{ fontWeight: 500, fontSize: 10, marginTop: 2, opacity: 0.85 }}>{aiLine}</div>
      ) : null}
    </div>
  );
}

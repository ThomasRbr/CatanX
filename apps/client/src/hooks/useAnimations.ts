import { useMemo } from 'react';

function emitAnimationEvent(type: string, detail: Record<string, unknown>): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(type, { detail }));
}

export function useAnimations() {
  return useMemo(
    () => ({
      playTilePulse: (tileId: string) => {
        emitAnimationEvent('catanx:tile-pulse', { tileId });
      },
      playCombat: (attackerId: string, defenderId: string) => {
        emitAnimationEvent('catanx:combat', { attackerId, defenderId });
      },
      playSeasonTransition: (season: string, climateId?: string | null) => {
        emitAnimationEvent('catanx:season-transition', { season, climateId });
      },
      playResourceFloat: (
        label: string,
        from: { x: number; y: number },
        to: { x: number; y: number },
        tileId?: string,
        resource?: string,
      ) => {
        emitAnimationEvent('catanx:resource-float', { label, from, to, tileId, resource });
      },
      playBoardImpact: (
        kind: 'build' | 'trade' | 'ck-ship' | 'ck-invasion' | 'ck-progress' | 'pe-seal' | 'pe-vote',
        intensity = 0.45,
      ) => {
        emitAnimationEvent('catanx:board-impact', {
          kind,
          intensity: Math.max(0, Math.min(1, intensity)),
        });
      },
      playPePactSigned: (pactId: string) => {
        emitAnimationEvent('catanx:pe-pact-signed', { pactId });
      },
      playPePactBroken: (pactId: string) => {
        emitAnimationEvent('catanx:pe-pact-broken', { pactId });
      },
      playPeVoteDeposited: (playerId: string) => {
        emitAnimationEvent('catanx:pe-vote-deposited', { playerId });
      },
      playPeChancellorChanged: (playerId: string | null) => {
        emitAnimationEvent('catanx:pe-chancellor-changed', { playerId });
      },
    }),
    [],
  );
}

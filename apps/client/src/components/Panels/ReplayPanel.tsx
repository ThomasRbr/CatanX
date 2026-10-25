import type { GameCommand } from '@catanx/protocol';

/** Utilitaire d'export — l'UI replay vit dans ActionFeed. */
export function downloadCommandLog(commands: GameCommand[], seed: number): void {
  const blob = new Blob([JSON.stringify({ seed, commands }, null, 2)], {
    type: 'application/json',
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `catanx-replay-${seed}.json`;
  anchor.click();
  URL.revokeObjectURL(url);
}

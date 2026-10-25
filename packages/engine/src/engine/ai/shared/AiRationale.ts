/** Last AI decision rationale (dev/debug). Module-level, not persisted. */

export interface AiRationale {
  playerId: string;
  difficulty: string;
  layer: 'L0' | 'L1' | 'L2' | 'pending' | 'recovery';
  summary: string;
  score?: number;
  at: number;
}

let lastRationale: AiRationale | null = null;

export function setAiRationale(rationale: Omit<AiRationale, 'at'>): void {
  lastRationale = { ...rationale, at: Date.now() };
}

export function getLastAiRationale(): AiRationale | null {
  return lastRationale;
}

export function clearAiRationale(): void {
  lastRationale = null;
}

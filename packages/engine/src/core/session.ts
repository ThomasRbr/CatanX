import type { GameCommand } from '@catanx/protocol';
import { createEngineContext, EngineContext } from './context';
import { FixedClock } from './clock';
import { IncrementalIdGenerator, setActiveIdGenerator } from './ids';
import { SeededRandom, setActiveRandom } from './rng';
import { applyCommand } from './applyCommand';
import { CommandResult } from './errors';

export function createDefaultEngineContext(seed: number, time = 1_700_000_000_000): EngineContext {
  const ids = new IncrementalIdGenerator();
  setActiveIdGenerator(ids);
  setActiveRandom(new SeededRandom(seed));
  return createEngineContext(new SeededRandom(seed), new FixedClock(time), ids);
}

export function resetEngineIds(): void {
  setActiveIdGenerator(new IncrementalIdGenerator());
}

export type CommandDispatchResult = CommandResult & { command: GameCommand };

export function dispatchCommand(
  state: import('../types/game').GameState | null,
  command: GameCommand,
  context: EngineContext,
): CommandDispatchResult {
  const result = applyCommand(state, command, context);
  return { ...result, command };
}

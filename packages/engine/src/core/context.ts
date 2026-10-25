import { RandomSource } from './rng';
import { Clock } from './clock';
import { IdGenerator } from './ids';

export interface EngineContext {
  random: RandomSource;
  clock: Clock;
  ids: IdGenerator;
  playerId?: string;
}

export function createEngineContext(
  random: RandomSource,
  clock: Clock,
  ids: IdGenerator,
  playerId?: string,
): EngineContext {
  return { random, clock, ids, playerId };
}

export interface RandomSource {
  next(): number;
  nextInt(min: number, max: number): number;
  nextFloat(min: number, max: number): number;
  shuffle<T>(arr: T[]): T[];
}

export class SeededRandom implements RandomSource {
  private seed: number;

  constructor(seed: number) {
    this.seed = seed >>> 0;
  }

  next(): number {
    this.seed = (this.seed * 1664525 + 1013904223) & 0xffffffff;
    return (this.seed >>> 0) / 0xffffffff;
  }

  nextInt(min: number, max: number): number {
    return Math.floor(this.next() * (max - min + 1)) + min;
  }

  nextFloat(min: number, max: number): number {
    return this.next() * (max - min) + min;
  }

  shuffle<T>(arr: T[]): T[] {
    const copy = [...arr];
    for (let i = copy.length - 1; i > 0; i--) {
      const j = Math.floor(this.next() * (i + 1));
      [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    return copy;
  }
}

export function createGameRandom(seed: number): SeededRandom {
  return new SeededRandom(seed);
}

/** RNG global du moteur — remplacé par contexte de commande en Phase 2+. */
let activeRandom: RandomSource = new SeededRandom(1);

export function setActiveRandom(rng: RandomSource): void {
  activeRandom = rng;
}

export function getActiveRandom(): RandomSource {
  return activeRandom;
}

export function randomInt(min: number, max: number): number {
  return activeRandom.nextInt(min, max);
}

export function randomFloat(min = 0, max = 1): number {
  return activeRandom.nextFloat(min, max);
}

export function randomChoice<T>(items: T[]): T | undefined {
  if (items.length === 0) return undefined;
  return items[activeRandom.nextInt(0, items.length - 1)];
}

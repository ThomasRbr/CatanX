export interface Clock {
  now(): number;
}

export class SystemClock implements Clock {
  now(): number {
    return Date.now();
  }
}

export class FixedClock implements Clock {
  constructor(private readonly fixedTime: number) {}

  now(): number {
    return this.fixedTime;
  }
}

let activeClock: Clock = new SystemClock();

export function setActiveClock(clock: Clock): void {
  activeClock = clock;
}

export function getActiveClock(): Clock {
  return activeClock;
}

export function now(): number {
  return activeClock.now();
}

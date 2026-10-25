export interface IdGenerator {
  next(prefix: string): string;
}

export class IncrementalIdGenerator implements IdGenerator {
  private counter = 0;

  next(prefix: string): string {
    this.counter += 1;
    return `${prefix}_${this.counter}`;
  }

  reset(start = 0): void {
    this.counter = start;
  }
}

export function resetActiveIdGenerator(): void {
  const current = activeIdGenerator;
  if (current instanceof IncrementalIdGenerator) {
    current.reset();
    return;
  }
  activeIdGenerator = new IncrementalIdGenerator();
}

let activeIdGenerator: IdGenerator = new IncrementalIdGenerator();

export function setActiveIdGenerator(generator: IdGenerator): void {
  activeIdGenerator = generator;
}

export function getActiveIdGenerator(): IdGenerator {
  return activeIdGenerator;
}

export function nextId(prefix: string): string {
  return activeIdGenerator.next(prefix);
}

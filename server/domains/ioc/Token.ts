let counter = 0;

export class Token<T = unknown> {
  public readonly key: symbol;

  constructor(description: string) {
    this.key = Symbol(`${description}:${counter++}`);
  }

  as(value: T): T {
    return value;
  }
}

import { Expression } from '../expression';

export class Identifier extends Expression {
  readonly comments?: string[];

  public constructor(public readonly name: string) {
    super();
  }
}

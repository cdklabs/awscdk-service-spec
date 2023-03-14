import { Expression } from '../expression';

export class Identifier extends Expression {
  public constructor(public readonly _identifier_: string) {
    super();
  }
}

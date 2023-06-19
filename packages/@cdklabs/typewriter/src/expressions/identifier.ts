import { Expression } from './expressions';

export class Identifier extends Expression {
  public constructor(public readonly _identifier_: string) {
    super();
  }
}

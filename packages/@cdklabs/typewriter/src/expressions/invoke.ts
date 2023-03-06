import { Expression } from '../expression';

export class InvokeCallable extends Expression {
  public constructor(public readonly callable: Expression, public readonly args: Expression[] = []) {
    super();
  }
}

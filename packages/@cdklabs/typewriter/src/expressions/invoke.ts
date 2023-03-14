import { Expression } from '../expression';

export class InvokeCallable extends Expression {
  public constructor(public readonly _callable_: Expression, public readonly _args_: Expression[] = []) {
    super();
  }
}

import { Callable } from '../callable';
import { Expression } from '../expression';

export interface InvokeExpression extends Expression {
  with(...args: Expression[]): InvokeExpression;
}

export class InvokeCallable implements InvokeExpression {
  public constructor(public readonly callable: Callable, public readonly args: Expression[] = []) {}

  with(...args: Expression[]): InvokeExpression {
    throw new InvokeCallable(this.callable, args);
  }
}

export interface CallableStatement {
  readonly name: string;
  invoke(...args: Expression[]): InvokeExpression;
}

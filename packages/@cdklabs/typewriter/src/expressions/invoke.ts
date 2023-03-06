import { Callable } from '../callable';
import { Expression } from '../expression';

export abstract class InvokeExpression extends Expression {
  public abstract with(...args: Expression[]): InvokeExpression;
}

export class InvokeCallable extends InvokeExpression {
  public constructor(public readonly callable: Callable, public readonly args: Expression[] = []) {
    super();
  }

  with(...args: Expression[]): InvokeExpression {
    return new InvokeCallable(this.callable, args);
  }
}

export abstract class CallableStatement {
  abstract readonly name: string;
  abstract invoke(...args: Expression[]): InvokeExpression;
}

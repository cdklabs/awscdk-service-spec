import { Callable } from '../callable';
import { Expression } from '../expression';

export interface Statement {
  readonly comments?: string[];
}

export class ReturnStatement implements Statement {
  readonly comments?: string[];

  public constructor(public readonly expression?: Expression) {}
}

export interface InvokeStatement extends Statement {
  with(...args: Statement[]): InvokeStatement;
}

export class InvokeCallable implements InvokeStatement {
  public constructor(public readonly callable: Callable, public readonly args: Statement[] = []) {}

  with(...args: Statement[]): InvokeStatement {
    throw new InvokeCallable(this.callable, args);
  }
}

export interface CallableStatement {
  readonly name: string;
  invoke(...args: Statement[]): InvokeStatement;
}

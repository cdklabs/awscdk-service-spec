import { Callable } from '../callable';

export interface Statement {}

export class ReturnStatement implements Statement {
  public constructor(public readonly statement?: Statement) {}
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

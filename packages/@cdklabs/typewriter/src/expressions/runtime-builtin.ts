import { Expression } from '../expression';

export class BuiltInFunction extends Expression {
  public readonly args: Expression[];

  constructor(public readonly jsBuiltinName: string, ...args: Expression[]) {
    super();
    this.args = args;
  }
}

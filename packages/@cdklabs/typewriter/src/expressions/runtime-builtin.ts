import { Expression } from '../expression';

export class BuiltInFunction extends Expression {
  public readonly _args_: Expression[];

  constructor(public readonly _jsBuiltinName_: string, ...args: Expression[]) {
    super();
    this._args_ = args;
  }
}

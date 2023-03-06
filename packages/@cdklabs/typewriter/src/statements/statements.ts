import { Expression } from '../expression';

export class Statement {
  readonly comments?: string[];
}

export class ReturnStatement extends Statement {
  readonly comments?: string[];

  public constructor(public readonly expression?: Expression) {
    super();
  }
}

export class ExpressionStatement extends Statement {
  readonly comments?: string[];

  public constructor(public readonly expression: Expression) {
    super();
  }
}

export class IfThenElse extends Statement {
  readonly comments?: string[];

  public thenStatement?: Statement;
  public elseStatement?: Statement;

  public constructor(public readonly condition: Expression) {
    super();
  }

  public then(then_: Statement) {
    this.thenStatement = then_;
    return this;
  }

  public else(else_: Statement) {
    this.elseStatement = else_;
    return this;
  }
}

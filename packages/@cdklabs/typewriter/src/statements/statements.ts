import { asStmt } from './private';
import { Expression } from '../expression';

export class Statement {
  readonly comments?: string[];

  /**
   * Declare a private field to make this type nominally typed
   */
  private readonly isStatement = true;

  constructor() {
    Array.isArray(this.isStatement);
  }
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

export class AssignmentStatement extends Statement {
  readonly comments?: string[];

  public constructor(public readonly lhs: Expression, public readonly rhs: Expression) {
    super();
  }
}

export enum Mut {
  Mutable,
  Immutable,
}

export class VariableDeclaration extends Statement {
  readonly comments?: string[];

  public constructor(public readonly mut: Mut, public readonly varName: Expression, public readonly rhs: Expression) {
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

  public then(then_: Statement | Expression) {
    this.thenStatement = asStmt(then_);
    return this;
  }

  public else(else_: Statement | Expression) {
    this.elseStatement = asStmt(else_);
    return this;
  }
}

export class ForLoop extends Statement {
  constructor(
    public readonly mut: Mut,
    public readonly iterator: Expression,
    public iterable?: Expression,
    public loopBody?: Statement,
  ) {
    super();
  }

  public in(iterable: Expression) {
    this.iterable = iterable;
    return this;
  }

  public do(statement: Statement) {
    this.loopBody = statement;
    return this;
  }
}

export class SuperInitializer extends Statement {
  public readonly args: Expression[];

  constructor(...args: Expression[]) {
    super();
    this.args = args;
  }
}

export class StatementSeparator extends Statement {}

export class ThrowStatement extends Statement {
  constructor(public readonly expression: Expression) {
    super();
  }
}

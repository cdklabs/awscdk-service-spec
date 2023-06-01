import { Block } from './block';
import { asStmt } from './private';
import { CommentableImpl, ICommentable } from '../code-fragments';
import { Expression } from '../expressions';
import { Parameter } from '../parameter';

export class Statement extends CommentableImpl implements ICommentable {}

export class ReturnStatement extends Statement {
  public constructor(public readonly expression?: Expression) {
    super();
  }
}

export class ExpressionStatement extends Statement {
  public constructor(public readonly expression: Expression) {
    super();
  }
}

export class AssignmentStatement extends Statement {
  public constructor(public readonly lhs: Expression, public readonly rhs: Expression) {
    super();
  }
}

export enum Mut {
  Mutable,
  Immutable,
}

export class VariableDeclaration extends Statement {
  public constructor(public readonly mut: Mut, public readonly varName: Expression, public readonly rhs: Expression) {
    super();
  }
}

export class IfThenElse extends Statement {
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

/**
 * A monkey patching statement
 *
 * Adds/overwrites a method on a particular class. Only available in certain languages.
 */
export class MonkeyPatchMethod extends Statement {
  constructor(
    public readonly targetClass: Expression,
    public readonly method: string,
    public readonly parameters: Parameter[],
    public readonly body: Block,
  ) {
    super();
  }
}

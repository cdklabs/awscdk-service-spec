import { Expression } from '../expression';

export class ObjectPropertyAccess extends Expression {
  readonly comments?: string[];
  public constructor(public readonly obj: Expression, public readonly property: string) {
    super();
  }
}

export class ObjectMethodInvoke extends Expression {
  public constructor(
    public readonly obj: Expression,
    public readonly method: string,
    public readonly args: Expression[] = [],
  ) {
    super();
  }
}

export class ObjectLiteral extends Expression {
  public constructor(public readonly contents: Record<string, Expression> = {}) {
    super();
  }

  public get keys(): string[] {
    return Object.keys(this.contents);
  }

  public get entries(): Array<[string, Expression]> {
    return Object.entries(this.contents);
  }
}

export class NotExpression extends Expression {
  constructor(public readonly operand: Expression) {
    super();
  }
}

export class EqualsExpression extends Expression {
  constructor(public readonly left: Expression, public readonly right: Expression) {
    super();
  }
}

export class JsLiteralExpression extends Expression {
  constructor(public readonly value: any) {
    super();
  }
}

export class NewExpression extends Expression {
  public readonly args: Expression[];

  constructor(public readonly ctr: Expression, ...args: Expression[]) {
    super();
    this.args = args;
  }
}

export class TruthyOr extends Expression {
  constructor(public readonly value: Expression, public readonly defaultValue: Expression) {
    super();
  }
}

export enum Structure {
  Array,
  Object,
}

export class DestructuringBind extends Expression {
  constructor(public readonly structure: Structure, readonly names: Expression[]) {
    super();
  }
}

export class Ternary extends Expression {
  public constructor(
    public readonly condition: Expression,
    public thenExpression?: Expression,
    public elseExpression?: Expression,
  ) {
    super();
  }

  public then(then_: Expression) {
    this.thenExpression = then_;
    return this;
  }

  public else(else_: Expression) {
    this.elseExpression = else_;
    return this;
  }
}

export class ThisInstance extends Expression {}

export class Null extends Expression {}

export const NULL = new Null();

export class Undefined extends Expression {}

export const UNDEFINED = new Undefined();

export class BinOp extends Expression {
  constructor(public readonly lhs: Expression, public readonly op: string, public readonly rhs: Expression) {
    super();
  }
}

export class IsObject extends Expression {
  constructor(public readonly operand: Expression) {
    super();
  }
}

export class IsNotNullish extends Expression {
  constructor(public readonly operand: Expression) {
    super();
  }
}

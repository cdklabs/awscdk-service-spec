import { Expression } from '../expression';
import { Type } from '../type';

export class ObjectPropertyAccess extends Expression {
  readonly _comments_?: string[];
  public constructor(public readonly _obj_: Expression, public readonly _property_: string) {
    super();
  }
}

export class ObjectMethodInvoke extends Expression {
  public constructor(
    public readonly _obj_: Expression,
    public readonly _method_: string,
    public readonly _args_: Expression[] = [],
  ) {
    super();
  }
}

export class ObjectLiteral extends Expression {
  public constructor(public readonly _contents_: Record<string, Expression> = {}) {
    super();
  }

  public get keys(): string[] {
    return Object.keys(this._contents_);
  }

  public get entries(): Array<[string, Expression]> {
    return Object.entries(this._contents_);
  }
}

export class NotExpression extends Expression {
  constructor(public readonly _operand_: Expression) {
    super();
  }
}

export class JsLiteralExpression extends Expression {
  constructor(public readonly _value_: any) {
    super();
  }
}

export class NewExpression extends Expression {
  public readonly _args_: Expression[];

  constructor(public readonly _typ_: Type, ...args: Expression[]) {
    super();
    this._args_ = args;
  }
}

export class TruthyOr extends Expression {
  constructor(public readonly _value_: Expression, public readonly _defaultValue_: Expression) {
    super();
  }
}

export enum Structure {
  Array,
  Object,
}

export class DestructuringBind extends Expression {
  constructor(public readonly _structure_: Structure, readonly _names_: Expression[]) {
    super();
  }
}

export class Ternary extends Expression {
  public constructor(
    public readonly _condition_: Expression,
    public _thenExpression_?: Expression,
    public _elseExpression_?: Expression,
  ) {
    super();
  }

  public then(then_: Expression) {
    this._thenExpression_ = then_;
    return this;
  }

  public else(else_: Expression) {
    this._elseExpression_ = else_;
    return this;
  }
}

export class ThisInstance extends Expression {}

export class Null extends Expression {}

export class Undefined extends Expression {}

export class BinOp extends Expression {
  constructor(public readonly _lhs_: Expression, public readonly _op_: string, public readonly _rhs_: Expression) {
    super();
  }
}

export class IsObject extends Expression {
  constructor(public readonly _operand_: Expression) {
    super();
  }
}

export class IsNotNullish extends Expression {
  constructor(public readonly _operand_: Expression) {
    super();
  }
}

export class StrContact extends Expression {
  constructor(public readonly _operands_: Expression[]) {
    super();
  }
}

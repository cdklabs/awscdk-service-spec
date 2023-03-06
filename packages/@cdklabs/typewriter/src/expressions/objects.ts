import { Callable } from '../callable';
import { Expression } from '../expression';
import { InvokeCallable } from './invoke';

export interface ObjectLike extends Expression {
  prop(property: string): Expression;
  invoke(method: string, ...args: Expression[]): Expression;
}

export class ObjectPropertyAccess extends Expression {
  readonly comments?: string[];
  public constructor(public readonly obj: ObjectLiteral | ObjectReference, public readonly property: string) {
    super();
  }
}

export class ObjectMethodInvoke extends Expression {
  public constructor(
    public readonly obj: ObjectLiteral | ObjectReference,
    public readonly method: string,
    public readonly args: Expression[] = [],
  ) {
    super();
  }
}

export class ObjectLiteral extends Expression implements ObjectLike {
  public constructor(public readonly contents: Record<string, Expression> = {}) {
    super();
  }

  public get keys(): string[] {
    return Object.keys(this.contents);
  }

  public get entries(): Array<[string, Expression]> {
    return Object.entries(this.contents);
  }

  public prop(property: string): Expression {
    return new ObjectPropertyAccess(this, property);
  }

  public invoke(name: string, ...args: Expression[]): Expression {
    const callable = this.contents[name];
    if (callable && callable instanceof Callable) {
      return new InvokeCallable(callable, args);
    }

    throw Error(`Method '${name}' not found on object`);
  }
}

export class ObjectReference implements ObjectLike {
  public constructor(public readonly symbol: Expression) {}

  public prop(property: string): ObjectPropertyAccess {
    return new ObjectPropertyAccess(this, property);
  }
  public invoke(method: string, ...args: Expression[]): ObjectMethodInvoke {
    return new ObjectMethodInvoke(this, method, args);
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

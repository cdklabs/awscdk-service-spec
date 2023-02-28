import { LocalSymbol } from './references';
import { InvokeCallable, InvokeStatement } from './statements';
import { Callable } from '../callable';
import { Expression } from '../expression';

export interface ObjectLike {
  prop(property: string): ObjectPropertyAccess;
  invoke(method: string, ...args: Expression[]): InvokeStatement;
}

export class ObjectPropertyAccess implements Expression {
  readonly comments?: string[];
  public constructor(public readonly obj: ObjectLiteral | ObjectReference, public readonly property: string) {}
}

export class ObjectMethodInvoke implements InvokeStatement {
  public constructor(
    public readonly obj: ObjectLiteral | ObjectReference,
    public readonly method: string,
    public readonly args: Expression[] = [],
  ) {}

  with(...args: Expression[]): InvokeStatement {
    return new ObjectMethodInvoke(this.obj, this.method, args);
  }
}

export class ObjectLiteral implements Expression, ObjectLike {
  readonly comments?: string[];
  public constructor(public readonly contents: Record<string, Expression> = {}) {}

  public get keys(): string[] {
    return Object.keys(this.contents);
  }

  public get entries(): Array<[string, Expression]> {
    return Object.entries(this.contents);
  }

  public prop(property: string): ObjectPropertyAccess {
    return new ObjectPropertyAccess(this, property);
  }

  public invoke(name: string, ...args: Expression[]): InvokeStatement {
    const callable = this.contents[name];
    if (callable && callable instanceof Callable) {
      return new InvokeCallable(callable, args);
    }

    throw Error(`Method '${name}' not found on object`);
  }
}

export class ObjectReference extends LocalSymbol implements ObjectLike {
  public constructor(public readonly symbol: LocalSymbol) {
    super(symbol.name);
  }

  public prop(property: string): ObjectPropertyAccess {
    return new ObjectPropertyAccess(this, property);
  }
  public invoke(method: string, ...args: Expression[]): ObjectMethodInvoke {
    return new ObjectMethodInvoke(this, method, args);
  }
}

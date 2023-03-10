import { InvokeCallable, ObjectMethodInvoke, ObjectPropertyAccess } from './expressions';
import { ThingSymbol } from './symbol';

export class Expression {
  readonly comments?: string[];

  /**
   * Declare a private field to make this type nominally typed
   */
  private readonly isExpression = true;

  constructor() {
    Array.isArray(this.isExpression);
  }

  public prop(property: string): ObjectPropertyAccess {
    return new ObjectPropertyAccess(this, property);
  }

  public callMethod(method: string, ...args: Expression[]): ObjectMethodInvoke {
    return new ObjectMethodInvoke(this, method, args);
  }

  public call(...args: Expression[]) {
    return new InvokeCallable(this, args);
  }
}

export class SymbolReference extends Expression {
  constructor(public readonly symbol: ThingSymbol) {
    super();
  }
}

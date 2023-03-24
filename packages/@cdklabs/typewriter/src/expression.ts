import { InvokeCallable, ObjectMethodInvoke, ObjectPropertyAccess } from './expressions';
import { Parameter } from './parameter';
import { Block, ExpressionStatement, Statement } from './statements';
import { ThingSymbol } from './symbol';

export class Expression {
  public readonly _comments_?: string[];

  /**
   * Declare a private field to make this type nominally typed
   */
  private readonly _isExpression_ = true;

  constructor() {
    Array.isArray(this._isExpression_);
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

  public asStmt(): Statement {
    return new ExpressionStatement(this);
  }
}

export class SymbolReference extends Expression {
  constructor(public readonly symbol: ThingSymbol) {
    super();
  }
}

/**
 * An anonymous implementation of an interface.
 *
 * In JavaScript, an object literal with a couple of methods/properties on it.
 *
 * (Not currently tracking the implemented type)
 */
export class AnonymousInterfaceImplementation extends Expression {
  constructor(public readonly members: Record<string, Expression>) {
    super();
  }
}

/**
 * A Lambda function
 */
export class Lambda extends Expression {
  public readonly body: Block | Expression;

  constructor(public readonly params: Parameter[], body: Statement | Expression) {
    super();
    this.body = body instanceof Expression ? body : body instanceof Block ? body : Block.with(body);
  }
}

/**
 * Splat expression (...xyz)
 */
export class Splat extends Expression {
  constructor(public readonly _operand_: Expression) {
    super();
  }
}

import { Expression } from './expressions';
import { NewExpression } from './objects';
import { CallableExpr } from '../callable';
import { IScope } from '../scope';
import { ThingSymbol } from '../symbol';
import { Type } from '../type';
import * as expr from './builder';
import { sym } from './builder';
import { Method } from '../type-member';

const isProxy = Symbol();

/**
 * Expression Proxy
 *
 * Builds a JavaScript object that will mirror the JavaScript operations done to it
 * in an expression tree.
 *
 * This only extends to operations that are: calls, method calls and property lookups.
 * We can't translate operations like comparisons, additions etc, because JavaScript
 * has no way to intercept these.
 *
 * (It's not necessarily clear that this is a good idea... it may become very unclear
 * what is actually running code and what is building an AST).
 */
export function $E(exp: Expression): ExpressionProxy<Expression> {
  // If it is already a proxy, don't wrap it again
  if ((exp as any)[isProxy]) {
    return exp as ExpressionProxy<Expression>;
  }

  // First, we MUST start with a Function, because any other object will not be
  // considered callable by JavaScript.
  const fn = (...args: Expression[]): Expression => {
    return $E(exp.call(...args));
  };

  const ret = new Proxy(Object.assign(fn, exp), EXPRESSION_HANDLERS);
  Object.setPrototypeOf(ret, Object.getPrototypeOf(exp));
  return ret as any;
}

const EXPRESSION_HANDLERS: ProxyHandler<Expression> = {
  get: (exp, key) => {
    if (key === isProxy) {
      return true;
    }
    // Function has '.name', but we never want that
    if (Reflect.has(exp, key) && key !== 'name') {
      return Reflect.get(exp, key);
    }

    return $E(exp.prop(String(key)));
  },
  set: (exp, key, value) => {
    if (Reflect.has(exp, key)) {
      Reflect.set(exp, key, value);

      return true;
    }
    return false;
  },
  has: () => true,
};

/**
 * Provides access to the local `this` as an expression proxy.
 */
export const $this: ExpressionProxy<Expression> = $E(expr.this_());

export type ExpressionProxy<E> = E & {
  (...args: Expression[]): ExpressionProxy<Expression>;
  [key: string]: ExpressionProxy<Expression>;
};

export type TypeExpressionProxy<T> = T & {
  (...args: Expression[]): ExpressionProxy<Expression>;
  [key: string]: ExpressionProxy<Expression>;
  new (...args: Expression[]): ExpressionProxy<Expression>;
};

/**
 * Make a proxy for a type
 */
export function $T(type: Type): TypeExpressionProxy<Type> {
  // If it is already a proxy, don't wrap it again
  if ((type as any)[isProxy]) {
    return type as TypeExpressionProxy<Type>;
  }

  // First, we MUST start with a non-arrow Function, otherwise JavaScript will not consider this
  // object to be constructible (and the 'new' operator will fail before we can intercept it).
  const fn = function (): Expression {
    throw new Error('This should never be called');
  };

  const ret = new Proxy(Object.assign(fn, type), TYPE_HANDLERS);
  Object.setPrototypeOf(ret, Object.getPrototypeOf(type));
  return ret as any;
}

const TYPE_HANDLERS: ProxyHandler<Type> = {
  get: (type, key) => {
    if (key === isProxy) {
      return true;
    }
    return Reflect.has(type, key) ? Reflect.get(type, key) : $E(expr.type(type).prop(String(key)));
  },
  construct: (type, args) => {
    return $E(new NewExpression(type, ...args));
  },
  set: () => false,
  has: () => true,
};

/**
 * A class representing an expression proxy which builds a JavaScript object that
 * will mirror the JavaScript operations done to it in an expression tree.
 */
export class CallableProxy implements CallableExpr {
  /**
   * Creates a new CallableProxy that can be called with the specified name.
   */
  public static fromName(name: string, scope: IScope) {
    return new CallableProxy($E(sym(new ThingSymbol(name, scope))), name);
  }

  public static fromMethod(method: Method) {
    if (method.static) {
      return new CallableProxy($E(sym(method.type.symbol).prop(method.name)), method.name);
    }
    return new CallableProxy($this[method.name], method.name);
  }

  private readonly expr: Expression;
  private readonly name: string;

  private constructor(expression: Expression, name: string) {
    this.expr = expression;
    this.name = name;
  }

  /**
   * Invokes the callable expression with the provided arguments.
   */
  public invoke(...args: Expression[]) {
    return this.expr.call(...args);
  }

  /**
   * The name of the expression proxy.
   */
  public toString() {
    return this.name;
  }
}

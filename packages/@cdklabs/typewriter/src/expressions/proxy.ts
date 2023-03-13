import * as expr from './builder';
import { Expression } from '../expression';
import { Type } from '../type';
import { NewExpression } from './objects';

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
    return key in exp ? (exp as any)[key] : $E(exp.prop(String(key)));
  },
  set: () => false,
  has: () => true,
};

export type ExpressionProxy<E> = E & {
  (...args: Expression[]): ExpressionProxy<Expression>;
  [key: string]: ExpressionProxy<Expression>;
};

export type TypeExpressionProxy<T> = T & {
  (...args: Expression[]): ExpressionProxy<Expression>;
  [key: string]: ExpressionProxy<Expression>;
  new (...args: Expression[]): Expression;
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
    return key in type ? (type as any)[key] : $E(expr.type(type).prop(String(key)));
  },
  construct: (type, args) => {
    return new NewExpression(expr.type(type), ...args);
  },
  set: () => false,
  has: () => true,
};

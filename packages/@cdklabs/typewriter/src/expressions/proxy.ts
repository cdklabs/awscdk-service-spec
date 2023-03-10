import { Expression } from '../expression';

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
export function $E(exp: Expression): ExpressionProxy {
  // If it is already a proxy, don't wrap it again
  if ((exp as any)[isProxy]) {
    return exp as ExpressionProxy;
  }

  // First, we MUST start with a Function, because any other object will not be
  // considered callable by JavaScript.

  const fn = (...args: Expression[]): Expression => {
    return exp.call(...args);
  };

  const ret = new Proxy(Object.assign(fn, exp), {
    get: (_target, key) => {
      if (key === isProxy) {
        return true;
      }
      return key in exp ? (exp as any)[key] : $E(exp.prop(String(key)));
    },
    set: () => false,
    has: () => true,
  }) as any;
  Object.setPrototypeOf(ret, Object.getPrototypeOf(exp));
  return ret;
}

export type ExpressionProxy = Expression & {
  (...args: Expression[]): ExpressionProxy;
  [key: string]: ExpressionProxy;
};

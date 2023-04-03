// Ensures you must use `fail()` to construct an instance of type Failure
const errorSym = Symbol('error');

export type Result<A> = A | Failure;
export interface Failure {
  readonly [errorSym]: string;
}

export interface Fail {
  (error: string): Failure;
  in(prefix: string): Fail;
  locate<A>(x: Result<A>): Result<A>;
}

function mkLocate(prefix: string): Fail {
  const ret: Fail = (error: string) => failure(`${prefix}: ${error}`);
  ret.in = (prefix2: string) => mkLocate(`${prefix}: ${prefix2}`);
  ret.locate = locateFailure(prefix);
  return ret;
}

export interface failure extends Fail {}

export function failure(error: string): Failure {
  return { [errorSym]: error };
}
failure.in = (prefix: string) => mkLocate(prefix);
failure.locate = <A>(x: Result<A>) => x;

export function isFailure<A>(x: Result<A>): x is Failure {
  return !!x && typeof x === 'object' && (x as any)[errorSym];
}

export function isSuccess<A>(x: Result<A>): x is A {
  return !isFailure(x);
}

export function unpack<A>(x: Result<A>): A {
  if (isFailure(x)) {
    throw new Error(`unpack: ${x[errorSym]}`);
  }
  return x;
}

export function unpackOr<A, B>(x: Result<A>, def: B): B extends A ? A : A | B {
  return (isFailure(x) ? def : x) as any;
}

export function errorMessage(x: Failure): string {
  return x[errorSym];
}

export function errorFrom(x: Failure): Error {
  return new Error(errorMessage(x));
}

export function assertSuccess<A>(x: Result<A>): asserts x is A;
export function assertSuccess(x: Failure): never;
export function assertSuccess(x: Failure): void {
  if (isFailure(x)) {
    throw errorFrom(x);
  }
}

export function tryCatch<A>(block: () => A): Result<A>;
export function tryCatch<A>(failFn: Fail, block: () => A): Result<A>;
export function tryCatch<A>(failOrBlock: Fail | (() => A), maybeBlock?: () => A): Result<A> {
  const block: () => A = (maybeBlock ?? failOrBlock) as any;
  const f: Fail = (maybeBlock ? failOrBlock : failure) as any;

  try {
    return block();
  } catch (e: any) {
    return f(`Error: ${e.message}\n${e.stack}`);
  }
}

export function using<A, B>(value: Result<A>, block: (x: A) => Result<B>): Result<B> {
  if (isFailure(value)) {
    return value;
  }
  return block(value);
}

/**
 * Like 'using', but can take any number of functions
 */
/* eslint-disable prettier/prettier */
export function chain<A, B>(value: Result<A>, b0: (x: A) => Result<B>): Result<B>;
export function chain<A, B, C>(value: Result<A>, b0: (x: A) => Result<B>, b1: (x: B) => Result<C>): Result<C>;
export function chain<A, B, C, D>(value: Result<A>, b0: (x: A) => Result<B>, b1: (x: B) => Result<C>, b2: (x: C) => Result<D>): Result<D>;
export function chain<A, B, C, D, E>(value: Result<A>, b0: (x: A) => Result<B>, b1: (x: B) => Result<C>, b2: (x: C) => Result<D>, b3: (x: D) => Result<E>): Result<E>;
export function chain<A, B, C, D, E, F>(value: Result<A>, b0: (x: A) => Result<B>, b1: (x: B) => Result<C>, b2: (x: C) => Result<D>, b3: (x: D) => Result<E>, b4: (x: E) => Result<F>): Result<F>;
export function chain<A, B, C, D, E, F, G>(value: Result<A>, b0: (x: A) => Result<B>, b1: (x: B) => Result<C>, b2: (x: C) => Result<D>, b3: (x: D) => Result<E>, b4: (x: E) => Result<F>, b5: (x: F) => Result<G>): Result<G>;
export function chain(value: Result<any>, ...fns: Array<(x: any) => Result<any>>): Result<any> {
  for (const fn of fns) {
    if (isFailure(value)) {
      return value;
    }
    value = fn(value);
  }
  return value;
}
/* eslint-enable prettier/prettier */

/**
 * Make a function that will prepend a prefix to error messages
 *
 * This is one way to be specific about the location where errors originate, by prefixing
 * errors as the call stack unwinds.
 *
 * A different method is to pass in a modified failure function using `failure.in(...)`,
 * to build the error message as the call stack deepens.
 */
export function locateFailure(prefix: string) {
  return <A>(x: Result<A>): Result<A> => (isFailure(x) ? failure(`${prefix}: ${x[errorSym]}`) : x);
}

export type Failures = Array<Failure>;

export function liftResult<A>(xs: Record<string, Result<A>>): Result<Record<string, A>>;
export function liftResult<A>(xs: Array<Result<A>>): Result<Array<A>>;
export function liftResult<A>(
  xs: Record<string, Result<A>> | Array<Result<A>>,
): Result<Record<string, A>> | Result<Array<A>> {
  const failures = Array.isArray(xs) ? xs.filter(isFailure) : Object.values(xs).filter(isFailure);
  if (failures.length > 0) {
    return failure(failures.map(errorMessage).join(', '));
  }
  return xs as any;
}

/**
 * Lift a value that can be 'undefined' to a result, or a function that can return undefined.
 */
export function liftUndefined<A>(v: A | undefined): Result<NonNullable<A>>;
export function liftUndefined<A, F extends (...args: any[]) => A>(v: F): (x: Parameters<F>) => Result<NonNullable<A>>;
export function liftUndefined(valueOrFunction: any): any {
  if (typeof valueOrFunction === 'function') {
    return (...args: any[]) => {
      const value = valueOrFunction(...args);
      return value !== undefined ? value : failure('value is undefined');
    };
  }
  return valueOrFunction !== undefined ? valueOrFunction : failure('value is undefined');
}

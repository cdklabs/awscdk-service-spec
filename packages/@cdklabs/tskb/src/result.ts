// Ensures you must use `fail()` to construct an instance of type Failure
const errorSym = Symbol('error');

export type Result<A> = A | Failure;
export interface Failure { readonly [errorSym]: string };

export interface Fail {
  (error: string): Failure;
  in(prefix: string): Fail;
}

function mkLocate(prefix: string): Fail {
  const ret: Fail = (error: string) => failure(`${prefix}: ${error}`);
  ret.in = (prefix2: string) => mkLocate(`${prefix}: ${prefix2}`);
  return ret;
}

export interface failure extends Fail {}

export function failure(error: string): Failure {
  return { [errorSym]: error };
}
failure.in = (prefix: string) => mkLocate(prefix);

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

export function errorMessage(x: Failure): string {
  return x[errorSym];
}

export function tryCatch<A>(block: () => A): Result<A>;
export function tryCatch<A>(failFn: Fail, block: () => A): Result<A>;
export function tryCatch<A>(failOrBlock: Fail | (() => A), maybeBlock?: () => A): Result<A> {
  const block: () => A = (maybeBlock ?? failOrBlock) as any;
  const f: Fail = (maybeBlock ? failOrBlock : failure) as any;

  try {
    return block();
  } catch (e: any) {
    return f(e.message + '\n' + e.stack);
  }
}

export function using<A, B>(value: Result<A>, block: (x: A) => Result<B>): Result<B> {
  if (isFailure(value)) { return value; }
  return block(value);
}

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
  return <A>(x: Result<A>): Result<A> => isFailure(x) ? failure(`${prefix}: ${x[errorSym]}`) : x;
}

export type Failures = Array<Failure>;

export function liftResult<A>(xs: Record<string, Result<A>>): Result<Record<string, A>>;
export function liftResult<A>(xs: Array<Result<A>>): Result<Array<A>>;
export function liftResult<A>(xs: Record<string, Result<A>> | Array<Result<A>>): Result<Record<string, A>> | Result<Array<A>> {
  const failures = Array.isArray(xs)
    ? xs.filter(isFailure)
    : Object.values(xs).filter(isFailure);
  if (failures.length > 0) {
    return failure(failures.map(errorMessage).join(', '));
  }
  return xs as any;
}
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
    return f(e.message);
  }
}

export function using<A, B>(value: Result<A>, block: (x: A) => Result<B>): Result<B> {
  if (isFailure(value)) { return value; }
  return block(value);
}

export function locateFailure<A>(prefix: string) {
  return (x: Result<A>): Result<A> => isFailure(x) ? failure(`${prefix}: ${x[errorSym]}`) : x;
}

export type Failures = Array<Failure>;
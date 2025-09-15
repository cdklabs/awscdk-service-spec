import { MapDiff, ListDiff, ScalarDiff } from '@aws-cdk/service-spec-types';

export function diffByKey<A, B>(a: A[], b: A[], keyFn: (x: A) => string, updatedDiff: (a: A, b: A) => B | undefined) {
  return diffMap(
    Object.fromEntries(a.map((x) => [keyFn(x), x])),
    Object.fromEntries(b.map((x) => [keyFn(x), x])),
    updatedDiff,
  );
}

export function diffMap<A, B>(
  a: Record<string, A>,
  b: Record<string, A>,
  updatedDiff: (a: A, b: A) => B | undefined,
): MapDiff<A, B> {
  const added = new Set<string>(Object.keys(b));

  const ret: Required<MapDiff<A, B>> = {
    added: {},
    removed: {},
    updated: {},
  };

  for (const [key, value] of Object.entries(a)) {
    if (key in b) {
      const deep = updatedDiff(value, b[key]);
      if (deep) {
        ret.updated[key] = deep;
      }
      added.delete(key);
    } else {
      ret.removed[key] = value;
    }
  }
  for (const key of added) {
    ret.added[key] = b[key];
  }

  return {
    ...(Object.keys(ret.added).length > 0 ? { added: ret.added } : {}),
    ...(Object.keys(ret.removed).length > 0 ? { removed: ret.removed } : {}),
    ...(Object.keys(ret.updated).length > 0 ? { updated: ret.updated } : {}),
  };
}

/**
 * Diff a list by quadratically comparing all elements
 */
export function diffList<A, B>(as: A[], bs: A[], eq: Eq<A>, updatedDiff: (a: A, b: A) => B | undefined): ListDiff<A, B>;
export function diffList<A, B>(as: A[], bs: A[], eq: Eq<A>): ListDiff<A, void>;
export function diffList<A, B>(
  as: A[],
  bs: A[],
  eq: Eq<A>,
  updatedDiff?: (a: A, b: A) => B | undefined,
): ListDiff<A, B> {
  const added: Array<A | undefined> = [...bs];

  const ret: Required<ListDiff<A, B>> = {
    added: [],
    removed: [],
    updated: [],
  };

  for (const a of as) {
    let found = false;
    for (let i = 0; i < added.length; i++) {
      const b = added[i];
      if (b === undefined) {
        continue;
      }

      if (eq(a, b)) {
        found = true;
        const deep = updatedDiff?.(a, b);
        if (deep) {
          ret.updated.push(deep);
        }
        // Mark off
        added[i] = undefined;
        break;
      }
    }

    if (!found) {
      ret.removed.push(a);
    }
  }

  for (const b of added) {
    if (b !== undefined) {
      ret.added.push(b);
    }
  }

  return {
    ...(ret.added.length > 0 ? { added: ret.added } : {}),
    ...(ret.removed.length > 0 ? { removed: ret.removed } : {}),
    ...(ret.updated.length > 0 ? { updated: ret.updated } : {}),
  };
}

export function tripleEq<A>(a: A, b: A): boolean {
  return a === b;
}

export function jsonEq<A>(a: A, b: A): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

export function jsonEqModuloId<A>(a: A, b: A): boolean {
  return JSON.stringify(removeId(a)) === JSON.stringify(removeId(b));
}

export function diffScalar<A extends object, K extends keyof A>(
  a: A,
  b: A,
  k: K,
  defaultValue?: A[K],
): A[K] extends string | number | boolean | undefined ? ScalarDiff<NonNullable<A[K]>> | undefined : void {
  // Complex return type makes it so that the === comparison only works on scalars, and for other types
  // the user must use diffField with a custom equality function
  return diffField(a, b, k, tripleEq, defaultValue) as any;
}

export function diffField<A extends object, K extends keyof A>(
  a: A,
  b: A,
  k: K,
  eq: Eq<A[K]>,
  defaultValue?: A[K],
): ScalarDiff<NonNullable<A[K]>> | undefined {
  if (eq(a[k] ?? defaultValue ?? a[k], b[k] ?? defaultValue ?? b[k])) {
    return undefined;
  }
  return {
    old: removeId(a[k]!),
    new: removeId(b[k]!),
  };
}

/**
 * Return the object if it has any defined fields, otherwise undefined
 */
export function collapseUndefined<A extends object>(x: A): A | undefined {
  for (const key of Object.keys(x)) {
    if ((x as any)[key] === undefined) {
      delete (x as any)[key];
    }
  }
  return Object.keys(x).length > 0 ? x : undefined;
}

export function collapseEmptyDiff<A extends ListDiff<any, any> | MapDiff<any, any>>(x: A): A | undefined {
  return Object.keys(x.added ?? {}).length + Object.keys(x.removed ?? {}).length + Object.keys(x.updated ?? {}).length >
    0
    ? x
    : undefined;
}

export type Eq<A> = (x: A, y: A) => boolean;
export type AllFieldsGiven<A extends object> = { [k in keyof Required<A>]: A[k] };

function removeId(x: any): any {
  if (x && typeof x === 'object') {
    const copy = { ...x };
    delete copy.$id;
    return copy;
  }
  return x;
}

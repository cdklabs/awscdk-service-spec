import { sortedMap, SortedMultiMap } from './sorted-map';

export interface Entity {
  readonly '$id': string;
}

export type Plain<E extends Entity> = Omit<E, '$id'>;

export interface EntityCollection<A extends Entity, Indexes extends keyof A=never> {
  readonly type: 'entities';
  readonly entities: Map<string, A>;
  readonly indexes: {[K in Indexes]: EntityIndex<A, K>};

  add(x: A): void;
  dehydrate(): any;
  hydrateFrom(x: any): void;
}

export interface EntityIndex<A extends Entity, P extends keyof A> {
  readonly lookups: IndexLookups<A[P]>;
  readonly index: SortedMultiMap<A[P], string>;

  add(x: A): void;
}

export type IndexLookups<P> = P extends string ? StringIndexLookups : {};

export interface StringIndexLookups {
  equals(x: string): string[];
}

export function emptyCollection<A extends Entity, I extends keyof A>(): EntityCollection<A, never>;
export function emptyCollection<A extends Entity, I extends keyof A, Ix extends {[K in I]: EntityIndex<A, K>}>(indexes: Ix): EntityCollection<A, I>;
export function emptyCollection<A extends Entity, I extends keyof A, Ix extends {[K in I]: EntityIndex<A, K>}>(ixes?: Ix): EntityCollection<A, I> {
  const entities = new Map<string, A>();
  const indexes = ixes ?? {};

  function add(x: A) {
    entities.set(x.$id, x);
    for (const index of Object.values(indexes)) {
      // FIXME: why can't we type this?
      (index as any).add(x);
    }
  }

  return {
    type: 'entities',
    entities,
    indexes: indexes as any,
    add,
    dehydrate: () => ({
      type: 'entities',
      entities: Array.from(validatePlainObjects(entities).values()),
    }),
    hydrateFrom: (x) => {
      entities.clear();
      for (const e of Object.values(x.entities)) {
        add(e as any);
      }
    },
  };
}

export function emptyIndex<A extends Entity, P extends keyof A>(propName: P, comparator: sortedMap.Comparator<A[P]>): EntityIndex<A, P> {
  const index: SortedMultiMap<A[P], string> = [];
  return {
    add: (x) => sortedMap.add(index, comparator, x[propName], x.$id),
    lookups: {
      equals: (value: A[P]) => sortedMap.findAll(index, comparator, value),
    } as any,
    index,
  };
}

export function isEntityCollection(x: unknown): x is EntityCollection<any> {
  return typeof x === 'object' && !!x && (x as any).type === 'entities';
}

function validatePlainObjects<A extends object>(xs: Map<string, A>): Map<string, A> {
  for (const x of xs.values()) {
    if (x.constructor !== Object) {
      throw new Error(`Entities should be plain-text objects, got instance of ${x.constructor}`);
    }
  }
  return xs;
}

export interface Reference<E extends Entity> {
  readonly $ref: E['$id'];
}

export function ref<E extends Entity>(x: E | string): Reference<E> {
  return typeof x === 'string' ? { $ref: x } : { $ref: x.$id };
}

export function stringCmp(a: string, b: string) {
  return a.localeCompare(b);
}
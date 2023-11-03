import { sortedMap, SortedMultiMap } from './sorted-map';

export interface Entity {
  readonly $id: string;
}

export type Plain<E extends Entity> = Omit<E, '$id'>;

type Indexes<A extends Entity> = { [K in PropertyKey]: EntityIndex<A, any> };

export interface EntityCollection<A extends Entity, I extends Indexes<Entity> = {}> {
  readonly type: 'entities';
  readonly entities: Map<string, A>;
  readonly indexes: I;

  add(x: A): void;
  dehydrate(): any;
  hydrateFrom(x: any): void;

  /**
   * Add indexes to this collection
   *
   * Creating an indexed collection is a two-step operation so that we can specify the
   * Entity type, but infer the index types (TypeScript does not allow both specifying AND
   * inferring generic arguments in a single call).
   */
  index<II extends Indexes<A>>(indexes: II): EntityCollection<A, II>;
}

/**
 * Interface for index objects
 */
export interface EntityIndex<A extends Entity, IndexType> {
  /**
   * The lookups that the indexed field type affords
   *
   * For example, 'equals', 'lessThan', 'prefix', etc.
   */
  readonly lookups: IndexLookups<IndexType>;

  /**
   * The index data store
   */
  readonly index: SortedMultiMap<IndexType, string>;

  /**
   * Add an entity to the index
   */
  add(x: A): void;
}

/**
 * Map a type the types of lookups we can do on that type
 */
export type IndexLookups<P> = [P] extends [string]
  ? StringIndexLookups
  : [P] extends [string | undefined]
  ? OptionalStringIndexLookups
  : {};

/**
 * All the lookups on 'string' types
 *
 * We currently only have 'equals' but we could have more :)
 */
export interface StringIndexLookups {
  equals(x: string): string[];
}

/**
 * All the lookups on 'string | undefined' types
 */
export interface OptionalStringIndexLookups {
  equals(x: string | undefined): string[];
}

export function entityCollection<A extends Entity>(): EntityCollection<A, {}> {
  const entities = new Map<string, A>();
  const _indexes = {};

  function add(x: A) {
    entities.set(x.$id, x);
    for (const index of Object.values(_indexes)) {
      // FIXME: why can't we type this?
      (index as any).add(x);
    }
  }

  return {
    type: 'entities',
    entities,
    indexes: _indexes as any,
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
    index(indexes) {
      // This limitation exists purely because I couldn't type it otherwise.
      // Declaring a return type of `EntityCollection<A, I | II>` would make a lot
      // of our other type inspection code stop working (the union is hard to pick
      // apart). Since adding indexes in multiple goes is not really a use case,
      // the simpler solution is just to type it as if we replaced all indexes
      // and add a runtime check to make sure the types aren't lying.
      if (Object.keys(_indexes).length > 0) {
        throw new Error('You may only call .index() once on a new collection');
      }
      Object.assign(_indexes, indexes);
      return this as any;
    },
  };
}

/**
 * An index that uses the value of an entity's field
 */
export function fieldIndex<A extends Entity, P extends keyof A>(
  propName: P,
  comparator: sortedMap.Comparator<A[P]>,
): EntityIndex<A, A[P]> {
  return calculatedIndex((x) => x[propName], comparator);
}

export function fieldIndexWithDefault<A extends Entity, P extends keyof A>(
  propName: P,
  comparator: sortedMap.Comparator<NonNullable<A[P]>>,
  defaultValue: NonNullable<A[P]>,
): EntityIndex<A, A[P]> {
  return calculatedIndex((x) => x[propName] ?? defaultValue!, comparator);
}

/**
 * An index that is calculated based on a function applied to an entity
 */
export function calculatedIndex<A extends Entity, B>(fn: (x: A) => B, comparator: sortedMap.Comparator<B>) {
  const index: SortedMultiMap<B, string> = [];
  return {
    add: (x: A) => sortedMap.add(index, comparator, fn(x), x.$id),
    lookups: {
      equals: (value: B) => sortedMap.findAll(index, comparator, value),
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

/**
 * Determines whether two strings are equivalent in the current or specified locale.
 */
export function stringCmp(a: string, b: string): number {
  return a.localeCompare(b);
}

/**
 * Determines whether two numbers are equivalent.
 */
export function numberCmp(a: number, b: number): number {
  return a - b;
}

/**
 * Creates a comparator to determine equivalent of two values, using a given comparator, but allows values to be optional.
 *
 * @param frontOrder If `true`, returns so that undefined values are ordered at the front. If `false`, undefined values are ordered at the back.
 */
export function optionalCmp<A>(cmp: (a: A, b: A) => number, frontOrder = true) {
  return (a: A | undefined, b: A | undefined) => {
    if (a == undefined && b != undefined) {
      return frontOrder ? -1 : 1;
    }
    if (a != undefined && b == undefined) {
      return frontOrder ? 1 : -1;
    }
    if (a == undefined && b == undefined) {
      return 0;
    }

    return cmp(a!, b!);
  };
}

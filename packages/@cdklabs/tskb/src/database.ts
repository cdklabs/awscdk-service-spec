import { Entity, EntityCollection, isEntityCollection, Plain, Reference } from './entity';
import {
  AnyRelationshipCollection,
  isRelationshipCollection,
  RelationshipCollection,
  RelAttr,
  RelFrom,
  RelTo,
} from './relationship';

export class Database<S extends object> {
  private readonly schema: S;
  private idCtr = 0;

  constructor(initial: S) {
    this.schema = { ...initial };
  }

  public id() {
    return `${this.idCtr++}`;
  }

  /**
   * Allocate an ID and store
   */
  public allocate<K extends EntityKeys<S>>(key: K, entity: Plain<EntityType<S[K]>>): EntityType<S[K]> {
    return this.store(key, this.e(entity));
  }

  /**
   * Store with a preallocated ID
   */
  public store<K extends EntityKeys<S>>(key: K, entity: EntityType<S[K]>): EntityType<S[K]> {
    const coll: EntityCollection<any> = this.schema[key] as any;
    coll.add(entity);
    return entity as any;
  }

  /**
   * Get an entity by key
   */
  public get<K extends EntityKeys<S>>(key: K, id: string | Reference<EntityType<S[K]>>): EntityType<S[K]> {
    const coll: EntityCollection<any> = this.schema[key] as any;
    const ret = coll.entities.get(typeof id === 'string' ? id : id.$ref);
    if (!ret) {
      throw new Error(`No such ${String(key)}: ${id}`);
    }
    return ret;
  }

  /**
   * All entities of a given type
   */
  public all<K extends EntityKeys<S>>(key: K): Array<EntityType<S[K]>> {
    const coll: EntityCollection<any> = this.schema[key] as any;
    return Array.from(coll.entities.values());
  }

  /**
   * Lookup an entity by index
   */
  public lookup<K extends EntityKeys<S>, I extends keyof EntityType<S[K]> & IndexesOf<S[K]>>(
    key: K,
    index: I,
    lookup: LookupsOf<S[K], I>,
    value: EntityType<S[K]>[I],
  ): RichReadonlyArray<EntityType<S[K]>> {
    const coll: EntityCollection<any> = this.schema[key] as any;
    const ids = (coll.indexes as any)[index].lookups[lookup](value);
    return addOnlyMethod(
      ids.map((id: string) => coll.entities.get(id)),
      `${String(key)} with ${String(index)} ${String(lookup)} ${JSON.stringify(value)}`,
    );
  }

  /**
   * Allocate an ID and store if the entity does not yet exist
   */
  public findOrAllocate<K extends EntityKeys<S>, I extends keyof Plain<EntityType<S[K]>> & IndexesOf<S[K]>>(
    key: K,
    index: I,
    lookup: LookupsOf<S[K], I>,
    entity: Plain<EntityType<S[K]>>,
  ): EntityType<S[K]> {
    const res = this.lookup(key, index, lookup, entity[index]);
    if (res.length) {
      return res.only();
    }
    return this.allocate(key, entity);
  }

  /**
   * Record a relationship between two entities
   *
   * Overload to account for whether we have attributes or not.
   */
  public link<K extends RelWAttrs<S>>(
    key: K,
    from: RelFrom<RelType<S[K]>>,
    to: RelTo<RelType<S[K]>>,
    attributes: RelAttr<RelType<S[K]>>,
  ): void;
  public link<K extends RelWoAttrs<S>>(key: K, from: RelFrom<RelType<S[K]>>, to: RelTo<RelType<S[K]>>): void;
  public link<K extends RelKeys<S>>(
    key: K,
    from: RelFrom<RelType<S[K]>>,
    to: RelTo<RelType<S[K]>>,
    attributes?: RelAttr<RelType<S[K]>>,
  ) {
    const col: AnyRelationshipCollection = this.schema[key] as any;
    col.add(from, to, attributes);
  }

  /**
   * Follow a link
   */
  public follow<K extends RelKeys<S>>(
    key: K,
    from: RelFrom<RelType<S[K]>>,
  ): RichReadonlyArray<Link<RelTo<RelType<S[K]>>, RelAttr<RelType<S[K]>>>> {
    const col: AnyRelationshipCollection = this.schema[key] as any;
    const toLinks = col.forward.get(from.$id) ?? [];
    const ret = toLinks.map((i) => ({ entity: this.get(col.toColl, i.$id), ...removeId(i) } as any));

    return addOnlyMethod(ret, `${String(key)} from ${from}`);
  }

  /**
   * Follow incoming links backwards
   */
  public incoming<K extends RelKeys<S>>(
    key: K,
    to: RelTo<RelType<S[K]>>,
  ): RichReadonlyArray<Link<RelFrom<RelType<S[K]>>, RelAttr<RelType<S[K]>>>> {
    const col: AnyRelationshipCollection = this.schema[key] as any;
    const fromIds = col.backward.get(to.$id) ?? [];
    const ret = fromIds.map((i) => ({ entity: this.get(col.fromColl, i.$id), ...removeId(i) } as any));

    return addOnlyMethod(ret, `${String(key)} to ${to}`);
  }

  public e<E extends Entity>(entity: Plain<E>): E {
    return {
      $id: this.id(),
      ...entity,
    } as any;
  }

  /**
   * Turn the current database collection into something that can be stored.
   */
  public save(): DehydratedDatabase {
    return {
      idCtr: this.idCtr,
      schema: dehydrate(this.schema),
    };

    function dehydrate(x: unknown): any {
      if (isEntityCollection(x)) {
        return x.dehydrate();
      }
      if (isRelationshipCollection(x)) {
        return x.dehydrate();
      }
      if (Array.isArray(x)) {
        return x.map(dehydrate);
      }
      if (!!x && typeof x === 'object') {
        return Object.fromEntries(Object.entries(x).map(([k, v]) => [k, dehydrate(v)]));
      }
      return x;
    }
  }

  public load(db: DehydratedDatabase) {
    this.idCtr = db.idCtr;
    hydrate(this.schema, db.schema);

    function hydrate(proto: unknown, x: unknown): void {
      if (isEntityCollection(proto)) {
        proto.hydrateFrom(x);
      }
      if (isRelationshipCollection(proto)) {
        proto.hydrateFrom(x);
      }
      if (Array.isArray(x)) {
        x.forEach(hydrate);
      }
      if (!!proto && typeof proto === 'object' && !!x && typeof x === 'object') {
        for (const [k, v] of Object.entries(proto)) {
          hydrate(v, (x as any)[k]);
        }
      }
    }
  }
}

interface DehydratedDatabase {
  readonly idCtr: number;
  readonly schema: any;
}

function removeId<A extends object>(x: A): Omit<A, '$id'> {
  const ret = { ...x };
  delete (ret as any).$id;
  return ret;
}

export type Link<E, A> = { readonly entity: E } & A;

type EntityKeys<S> = { [K in keyof S]: S[K] extends EntityCollection<any> ? K : never }[keyof S];
type RelKeys<S> = { [K in keyof S]: S[K] extends AnyRelationshipCollection ? K : never }[keyof S];
type RelWAttrs<S> = { [K in RelKeys<S>]: {} extends RelAttr<RelType<S[K]>> ? never : K }[RelKeys<S>];
type RelWoAttrs<S> = { [K in RelKeys<S>]: {} extends RelAttr<RelType<S[K]>> ? K : never }[RelKeys<S>];

type EntityType<A> = A extends EntityCollection<infer B> ? B : never;

type RelType<A> = A extends RelationshipCollection<infer B, any, any, any> ? B : never;

type IndexesOf<A> = A extends EntityCollection<any, any> ? keyof A['indexes'] : never;

type LookupsOf<A, I extends IndexesOf<A>> = A extends EntityCollection<any, any>
  ? keyof A['indexes'][I]['lookups']
  : never;

export interface RichReadonlyArray<A> extends ReadonlyArray<A> {
  /**
   * Return the first and only element, throwing if there are != 1 elements
   */
  only(): A;
}

function addOnlyMethod<A>(xs: A[], description: string): RichReadonlyArray<A> {
  return Object.defineProperties(xs, {
    only: {
      enumerable: false,
      value: () => {
        if (xs.length !== 1) {
          throw new Error(`Expected exactly 1 ${description}, found ${xs.length}`);
        }
        return xs[0];
      },
    },
  }) as any;
}

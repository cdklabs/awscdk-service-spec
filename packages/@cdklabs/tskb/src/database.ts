import { Entity, EntityCollection, EntityIndex, isEntityCollection, Plain, Reference } from './entity';
import {
  isRelationshipCollection,
  NO_RELATIONSHIPS,
  Relationship,
  relationshipCollection,
  RelationshipCollection,
} from './relationship';

export interface RelationshipsBuilder<ES extends object> {
  relationship<R extends Relationship<any, any, any>>(
    fromKey: KeysFor<ES, EntityCollection<R['from'], any>>,
    toKey: KeysFor<ES, EntityCollection<R['to'], any>>,
  ): RelationshipCollection<R>;
}

export class Database<ES extends object, RS extends object> {
  public static entitiesOnly<ES extends object>(entities: ES): Database<ES, {}> {
    return new Database(entities, NO_RELATIONSHIPS);
  }

  private readonly schema: ES & RS;
  private idCtr = 0;

  constructor(entities: ES, relationships: (x: RelationshipsBuilder<ES>) => RS) {
    this.schema = {
      ...entities,
      ...relationships({
        relationship: (fromKey, toKey) =>
          relationshipCollection(
            (id) => this.get(fromKey, id),
            (id) => this.get(toKey, id),
          ),
      }),
    };
  }

  public id() {
    return `${this.idCtr++}`;
  }

  /**
   * Allocate an ID and store
   */
  public allocate<K extends keyof ES>(key: K, entity: Plain<EntityType<ES[K]>>): EntityType<ES[K]> {
    return this.store(key, this.e(entity));
  }

  /**
   * Store with a preallocated ID
   */
  public store<K extends keyof ES>(key: K, entity: EntityType<ES[K]>): EntityType<ES[K]> {
    const coll: EntityCollection<any> = this.schema[key] as any;
    coll.add(entity);
    return entity as any;
  }

  /**
   * Get an entity by key
   */
  public get<K extends keyof ES>(key: K, id: string | Reference<EntityType<ES[K]>>): EntityType<ES[K]> {
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
  public all<K extends keyof ES>(key: K): Array<EntityType<ES[K]>> {
    const coll: EntityCollection<any> = this.schema[key] as any;
    return Array.from(coll.entities.values());
  }

  /**
   * Lookup an entity by index
   */
  public lookup<K extends keyof ES, I extends IndexNamesOf<ES[K]>>(
    key: K,
    index: I,
    lookup: IndexOf<ES[K], I>['lookups'],
    value: IndexOf<ES[K], I>['valueType'],
  ): RichReadonlyArray<EntityType<ES[K]>> {
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
  public findOrAllocate<K extends keyof ES, I extends keyof Plain<EntityType<ES[K]>> & IndexNamesOf<ES[K]>>(
    key: K,
    index: I,
    lookup: IndexOf<ES[K], I>['lookups'],
    entity: Plain<EntityType<ES[K]>>,
  ): EntityType<ES[K]> {
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
  public link<K extends RelWAttrs<RS>>(
    key: K,
    from: RelType<RS[K]>['from'],
    to: RelType<RS[K]>['to'],
    attributes: RelType<RS[K]>['attr'],
  ): void;
  public link<K extends RelWoAttrs<RS>>(key: K, from: RelType<RS[K]>['from'], to: RelType<RS[K]>['to']): void;
  public link<K extends keyof RS>(
    key: K,
    from: RelType<RS[K]>['from'],
    to: RelType<RS[K]>['to'],
    attributes?: RelType<RS[K]>['attr'],
  ) {
    const col: RelationshipCollection<any> = this.schema[key] as any;
    col.add(from, to, attributes);
  }

  /**
   * Follow a link
   */
  public follow<K extends keyof RS>(
    key: K,
    from: RelType<RS[K]>['from'],
  ): RichReadonlyArray<Link<RelType<RS[K]>['to'], RelType<RS[K]>['attr']>> {
    const col: RelationshipCollection<any> = this.schema[key] as any;
    const toLinks = col.forward.get(from.$id) ?? [];
    const ret = toLinks.map((i) => ({ entity: col.toColl(i.$id), ...removeId(i) } as any));

    return addOnlyMethod(ret, `${String(key)} from ${from}`);
  }

  /**
   * Follow incoming links backwards
   */
  public incoming<K extends keyof RS>(
    key: K,
    to: RelType<RS[K]>['to'],
  ): RichReadonlyArray<Link<RelType<RS[K]>['from'], RelType<RS[K]>['attr']>> {
    const col: RelationshipCollection<any> = this.schema[key] as any;
    const fromIds = col.backward.get(to.$id) ?? [];
    const ret = fromIds.map((i) => ({ entity: col.fromColl(i.$id), ...removeId(i) } as any));

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
        if (x !== undefined) {
          proto.hydrateFrom(x);
        }
      }
      if (isRelationshipCollection(proto)) {
        if (x !== undefined) {
          proto.hydrateFrom(x);
        }
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

type RelWAttrs<RS> = { [K in keyof RS]: {} extends RelType<RS[K]>['attr'] ? never : K }[keyof RS];
type RelWoAttrs<RS> = { [K in keyof RS]: {} extends RelType<RS[K]>['attr'] ? K : never }[keyof RS];

// Necessary because this type might be a union
type IndexNamesOf<A> = A extends EntityCollection<any> ? KeysOfUnion<A['indexes']> : never;

// eslint-disable-next-line prettier/prettier
type IndexOf<EC, I extends IndexNamesOf<EC>> =
  EC extends EntityCollection<any>
  ? EC['indexes'][I] extends EntityIndex<any, infer IndexType>
  ? {
    valueType: IndexType;
    lookups: keyof EC['indexes'][I]['lookups'];
  }
  : never
  : never;

type EntityType<A> = A extends EntityCollection<infer B> ? B : never;

type RelType<A> = A extends RelationshipCollection<infer R> ? R : never;

type ResolveUnion<T> = T extends T ? T : never;

type KeysOfUnion<T> = keyof ResolveUnion<T>;

export type EntitiesOf<DB> = DB extends Database<infer ES, any> ? { [k in keyof ES]: EntityType<ES[k]> } : {};

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

/**
 * Return the keys of an object that map to a particular type
 */
type KeysFor<O extends object, T> = { [k in keyof O]: O[k] extends T ? k : never }[keyof O];

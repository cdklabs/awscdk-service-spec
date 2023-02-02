import { Entity, EntityCollection, Plain } from "./entity";
import { AnyRelationshipCollection, RelationshipCollection, RelAttr, RelFrom, RelTo } from "./relationship";

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
    coll.entities[(entity as any).$id] = entity;
    return entity as any;
  }

  public get<K extends EntityKeys<S>>(key: K, id: string): EntityType<S[K]> {
    const coll: EntityCollection<any> = this.schema[key] as any;
    const ret = coll.entities[id];
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
    return Object.values(coll.entities);
  }

  /**
   * Record a relationship between two entities
   *
   * Overload to account for whether we have attributes or not.
   */
  public link<K extends RelWAttrs<S>>(key: K, from: RelFrom<RelType<S[K]>>, to: RelTo<RelType<S[K]>>, attributes: RelAttr<RelType<S[K]>>): void;
  public link<K extends RelWoAttrs<S>>(key: K, from: RelFrom<RelType<S[K]>>, to: RelTo<RelType<S[K]>>): void;
  public link<K extends RelKeys<S>>(key: K, from: RelFrom<RelType<S[K]>>, to: RelTo<RelType<S[K]>>, attributes?: RelAttr<RelType<S[K]>>) {
    const col: AnyRelationshipCollection = this.schema[key] as any;

    let forward = col.forward[from.$id];
    if (!forward) {
      forward = col.forward[from.$id] = [];
    }
    let backward = col.backward[to.$id];
    if (!backward) {
      backward = col.backward[to.$id] = [];
    }

    forward.push({ $id: to.$id, ...attributes });
    backward.push({ $id: from.$id, ...attributes });
  }

  /**
   * Follow a link
   */
  public follow<K extends RelKeys<S>>(key: K, from: RelFrom<RelType<S[K]>>): Array<ToLink<RelTo<RelType<S[K]>>, RelAttr<RelType<S[K]>>>> {
    const col: AnyRelationshipCollection = this.schema[key] as any;
    const toLinks = col.forward[from.$id] ?? [];
    return toLinks.map(i => ({ to: this.get(col.to, i.$id), ...removeId(i) })) as any;
  }

  /**
   * Follow incoming links backwards
   */
  public incoming<K extends RelKeys<S>>(key: K, to: RelTo<RelType<S[K]>>): Array<FromLink<RelFrom<RelType<S[K]>>, RelAttr<RelType<S[K]>>>> {
    const col: AnyRelationshipCollection = this.schema[key] as any;
    const fromIds = col.backward[to.$id] ?? [];
    return fromIds.map(i => ({ from: this.get(col.from, i.$id), ...removeId(i) })) as any;
  }

  public e<E extends Entity>(entity: Plain<E>): E {
    return {
      '$id': this.id(),
      ...entity,
    } as any;
  }
}

function removeId<A extends object>(x: A): Omit<A, '$id'> {
  const ret = { ...x };
  delete (ret as any).$id;
  return ret;
}

export type ToLink<E, A> = { readonly to: E } & A;
export type FromLink<E, A> = { readonly from: E } & A;

type EntityKeys<S> = { [K in keyof S]: S[K] extends EntityCollection<any> ? K : never }[keyof S];
type RelKeys<S> = { [K in keyof S]: S[K] extends AnyRelationshipCollection ? K : never }[keyof S];
type RelWAttrs<S> = { [K in RelKeys<S>]: {} extends RelAttr<RelType<S[K]>> ? never : K }[RelKeys<S>];
type RelWoAttrs<S> = { [K in RelKeys<S>]: {} extends RelAttr<RelType<S[K]>> ? K : never }[RelKeys<S>];

type EntityType<A> = A extends EntityCollection<infer B> ? B : never;

type RelType<A> = A extends RelationshipCollection<infer B, any, any, any> ? B : never;
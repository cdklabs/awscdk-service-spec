import { Entity, EntityCollection } from './entity';

export interface Relationship<From extends Entity, To extends Entity, Attributes = {}> {
  readonly from: From;
  readonly to: To;
  readonly attr: Attributes;
}

export interface RelationshipCollection<
  R extends Relationship<any, any>,
  S extends object,
  F extends KeyForEntityCollection<S, RelFrom<R>>,
  T extends KeyForEntityCollection<S, RelTo<R>>,
> {
  readonly type: 'rel';
  readonly fromColl: F;
  readonly toColl: T;
  readonly forward: Map<string, Rel<RelAttr<R>>[]>;
  readonly backward: Map<string, Rel<RelAttr<R>>[]>;

  add(from: RelFrom<R>, to: RelTo<R>, attributes: RelAttr<R>): void;
  dehydrate(): any;
  hydrateFrom(x: any): void;
}

export type Rel<Attributes> = { readonly $id: string } & Attributes;

export type RelFrom<R> = R extends Relationship<infer F, any> ? F : never;
export type RelTo<R> = R extends Relationship<any, infer T> ? T : never;
export type RelAttr<R> = R extends Relationship<any, any, infer A> ? A : never;

export type KeyForEntityCollection<S, E extends Entity> = {
  [K in keyof S]: S[K] extends EntityCollection<E> ? K : never;
}[keyof S];

export type AnyRelationshipCollection = RelationshipCollection<any, any, any, any>;

export function emptyRelationship<F extends string, T extends string>(
  fromField: F,
  toField: T,
): RelationshipCollection<any, any, F, T> {
  const forward = new Map<string, Array<Rel<any>>>();
  const backward = new Map<string, Array<Rel<any>>>();

  function add(fromId: string, toId: string, attrs: any) {
    let f = forward.get(fromId);
    if (!f) {
      f = [];
      forward.set(fromId, f);
    }
    let b = backward.get(toId);
    if (!b) {
      b = [];
      backward.set(toId, b);
    }

    f.push({ $id: toId, ...attrs });
    b.push({ $id: fromId, ...attrs });
  }

  return {
    type: 'rel',
    fromColl: fromField,
    toColl: toField,
    forward,
    backward,
    add(from: Entity, to: Entity, attributes: any) {
      add(from.$id, to.$id, attributes);
    },
    dehydrate(): any {
      return {
        type: 'rel',
        forward: Object.fromEntries(forward.entries()),
      };
    },
    hydrateFrom(x: any): void {
      forward.clear();
      backward.clear();

      for (const [fromId, targets] of Object.entries(x.forward)) {
        for (const target of targets as Array<Rel<any>>) {
          add(fromId, target.$id, removeId(target));
        }
      }
    },
  };
}

export function isRelationshipCollection(x: unknown): x is AnyRelationshipCollection {
  return typeof x === 'object' && !!x && (x as any).type === 'rel';
}

function removeId<A extends object>(x: A): Omit<A, '$id'> {
  const ret = { ...x };
  delete (ret as any).$id;
  return ret;
}

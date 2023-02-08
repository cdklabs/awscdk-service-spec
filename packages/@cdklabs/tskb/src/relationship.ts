import { Entity, EntityCollection } from "./entity";

export interface Relationship<From extends Entity, To extends Entity, Attributes={}> {
  readonly from: From;
  readonly to: To;
  readonly attr: Attributes;
}

export interface RelationshipCollection<
  _R extends Relationship<any, any>,
  S extends object,
  F extends KeyForEntityCollection<S, RelFrom<_R>>,
  T extends KeyForEntityCollection<S, RelTo<_R>>
> {
  readonly type: 'rel';
  readonly from: F;
  readonly to: T;
  readonly forward: Record<string, Rel<RelAttr<_R>>[]>;
  readonly backward: Record<string, Rel<RelAttr<_R>>[]>;
};

export type Rel<Attributes> = { readonly $id: string } & Attributes;

export type RelFrom<R> = R extends Relationship<infer F, any> ? F : never;
export type RelTo<R> = R extends Relationship<any, infer T> ? T : never;
export type RelAttr<R> = R extends Relationship<any, any, infer A> ? A : never;

export type KeyForEntityCollection<S, E extends Entity> = { [K in keyof S]: S[K] extends EntityCollection<E> ? K : never }[keyof S];

export type AnyRelationshipCollection = RelationshipCollection<any, any, any, any>;

export function emptyRelationship<F extends string, T extends string>(from: F, to: T): RelationshipCollection<any, any, F, T> {
  return { type: 'rel', from, to, forward: {}, backward: {} };
}

export function isRelationshipCollection(x: unknown): x is AnyRelationshipCollection {
  return typeof x === 'object' && !!x && (x as any).type === 'rel';
}

interface DehydratedRelationshipCollection<R extends Relationship<any, any>> {
  readonly type: 'rel';
  readonly forward: Record<string, Rel<RelAttr<R>>[]>;
}

export function isDehydratedRelationshipCollection(x: unknown): x is DehydratedRelationshipCollection<any> {
  return typeof x === 'object' && !!x && (x as any).type === 'rel';
}

export function dehydrateRelationshipCollection<R extends Relationship<any, any>>(x: RelationshipCollection<R, any, any, any>): DehydratedRelationshipCollection<R> {
  return {
    type: x.type,
    forward: x.forward,
  };
}

export function hydrateRelationshipCollection<
  R extends Relationship<any, any>,
  F extends string,
  T extends string,
>(x: DehydratedRelationshipCollection<R>, proto: RelationshipCollection<any, any, F, T>): RelationshipCollection<R, any, F, T> {
  // Build the backwards map from the forwards map
  const backward: Record<string, Rel<RelAttr<R>>[]> = {};
  for (const [sourceId, rels] of Object.entries(x.forward)) {
    for (const rel of rels) {
      let coll = backward[rel.$id];
      if (!coll) {
        coll = backward[rel.$id] = [];
      }
      coll.push({ ...rel, $id: sourceId });
    }
  }

  return {
    type: 'rel',
    from: proto.from,
    to: proto.to,
    forward: x.forward,
    backward,
  };
}
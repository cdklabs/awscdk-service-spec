export interface Entity {
  readonly '$id': string;
}

export type Plain<E extends Entity> = Omit<E, '$id'>;

export interface EntityCollection<A extends Entity> {
  readonly type: 'entities';
  readonly entities: Record<string, A>;
}

export function emptyCollection<A extends Entity>(): EntityCollection<A> {
  return { type: 'entities', entities: {} };
}

export function isEntityCollection(x: unknown): x is EntityCollection<any> {
  return typeof x === 'object' && !!x && (x as any).type === 'entities';
}

export function isDehydratedEntityCollection(x: unknown): x is DehydratedEntityCollection<any> {
  return typeof x === 'object' && !!x && (x as any).type === 'entities';
}

type DehydratedEntityCollection<A extends Entity> = EntityCollection<A>;

export function dehydrateEntityCollection<A extends Entity>(x: EntityCollection<A>): DehydratedEntityCollection<A> {
  return {
    type: x.type,
    entities: validatePlainObjects(x.entities),
  };
}

export function hydrateEntityCollection<A extends Entity>(x: DehydratedEntityCollection<A>): EntityCollection<A> {
  return x as any;
}

function validatePlainObjects<A extends object>(xs: Record<string, A>): Record<string, A> {
  for (const x of Object.values(xs)) {
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
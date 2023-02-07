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

export interface Reference<E extends Entity> {
  readonly $ref: E['$id'];
}

export function ref<E extends Entity>(x: E | string): Reference<E> {
  return typeof x === 'string' ? { $ref: x } : { $ref: x.$id };
}
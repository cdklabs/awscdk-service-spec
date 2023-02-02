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
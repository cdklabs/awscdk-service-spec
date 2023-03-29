import { Entity, EntityCollection } from './entity';

export interface Relationship<From extends Entity, To extends Entity, Attributes = {}> {
  readonly from: From;
  readonly to: To;
  readonly attr: Attributes;
}

type FromGetter<R extends Relationship<any, any, any>> = (id: string) => R['from'];
type ToGetter<R extends Relationship<any, any, any>> = (id: string) => R['to'];

export interface RelationshipCollection<R extends Relationship<any, any, any>> {
  readonly type: 'rel';
  readonly fromColl: FromGetter<R>;
  readonly toColl: ToGetter<R>;
  readonly forward: Map<string, Rel<R['attr']>[]>;
  readonly backward: Map<string, Rel<R['attr']>[]>;

  add(from: R['from'], to: R['to'], attributes: R['attr']): void;
  dehydrate(): any;
  hydrateFrom(x: any): void;
}

export type Rel<Attributes> = { readonly $id: string } & Attributes;

export type KeyForEntityCollection<S, E extends Entity> = {
  [K in keyof S]: S[K] extends EntityCollection<E> ? K : never;
}[keyof S];

export const NO_RELATIONSHIPS = () => ({});

export function relationshipCollection<R extends Relationship<any, any, any>>(
  fromField: FromGetter<R>,
  toField: ToGetter<R>,
): RelationshipCollection<R> {
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

    // Behaves like a set, only add new relationship if it is structurally distinct
    const forwardRel = { $id: toId, ...attrs };
    const forwardRelStr = JSON.stringify(forwardRel);
    const existingRelationship = f.find((x) => JSON.stringify(x) === forwardRelStr);

    if (!existingRelationship) {
      f.push(forwardRel);
      b.push({ $id: fromId, ...attrs });
    }
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

export function isRelationshipCollection(x: unknown): x is RelationshipCollection<any> {
  return typeof x === 'object' && !!x && (x as any).type === 'rel';
}

function removeId<A extends object>(x: A): Omit<A, '$id'> {
  const ret = { ...x };
  delete (ret as any).$id;
  return ret;
}

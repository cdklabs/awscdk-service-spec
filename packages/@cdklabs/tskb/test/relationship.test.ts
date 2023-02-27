import {
  Database,
  emptyCollection,
  emptyRelationship,
  Entity,
  EntityCollection,
  Relationship,
  RelationshipCollection,
} from '../src';

interface Thing extends Entity {
  readonly name: string;
  readonly value?: string;
}

interface Widget extends Entity {
  readonly color: string;
}

type HasWidget = Relationship<Thing, Widget, { count: number }>;

interface DbSchema {
  readonly thing: EntityCollection<Thing>;
  readonly widget: EntityCollection<Widget>;
  readonly hasWidget: RelationshipCollection<HasWidget, DbSchema, 'thing', 'widget'>;
}

let db: Database<DbSchema>;

function emptyDatabase(): Database<DbSchema> {
  return new Database({
    thing: emptyCollection(),
    widget: emptyCollection(),
    hasWidget: emptyRelationship('thing', 'widget'),
  });
}

beforeEach(() => {
  db = emptyDatabase();
});

describe.each([false, true])('database with some entities (saveAndLoad: %p)', (saveAndLoad) => {
  beforeEach(() => {
    const a = db.allocate('thing', {
      name: 'A',
      value: 'A',
    });

    const b = db.allocate('thing', {
      name: 'B',
      value: 'B',
    });

    db.link('hasWidget', a, db.allocate('widget', { color: 'green' }), { count: 1 });
    db.link('hasWidget', a, db.allocate('widget', { color: 'blue' }), { count: 2 });
    db.link('hasWidget', b, db.allocate('widget', { color: 'purple' }), { count: 5 });

    if (saveAndLoad) {
      const serialized = db.save();
      const fresh = emptyDatabase();
      fresh.load(serialized);
      db = fresh;
    }
  });

  test('follow relationships forward: widgets can be found', () => {
    const a = mustFind('thing', (x) => x.name === 'A');
    expect(db.follow('hasWidget', a)).toEqual([
      {
        to: expect.objectContaining({ color: 'green' }),
        count: 1,
      },
      {
        to: expect.objectContaining({ color: 'blue' }),
        count: 2,
      },
    ]);
  });

  test('follow relationships backward: things can be found', () => {
    const purpleWidget = mustFind('widget', (w) => w.color === 'purple');
    expect(db.incoming('hasWidget', purpleWidget)).toEqual([
      {
        from: expect.objectContaining({ name: 'B' }),
        count: 5,
      },
    ]);
  });
});

function mustFind<K extends Parameters<Database<DbSchema>['all']>[0]>(
  key: K,
  pred: (x: EntityType<DbSchema[K]>) => boolean,
) {
  const x = db.all(key).find(pred);
  if (!x) {
    throw new Error(`Could not find ${key} with ${pred}`);
  }
  return x;
}

type EntityType<A> = A extends EntityCollection<infer B> ? B : never;

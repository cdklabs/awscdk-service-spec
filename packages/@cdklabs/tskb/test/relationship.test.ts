import { Database, entityCollection, Entity, Relationship, EntitiesOf } from '../src';

interface Thing extends Entity {
  readonly name: string;
  readonly value?: string;
}

interface Widget extends Entity {
  readonly color: string;
}

type HasWidget = Relationship<Thing, Widget, { count: number }>;

let db: ReturnType<typeof emptyDatabase>;

function emptyDatabase() {
  return new Database(
    {
      thing: entityCollection<Thing>(),
      widget: entityCollection<Widget>(),
    },
    (r) => ({
      hasWidget: r.relationship<HasWidget>('thing', 'widget'),
    }),
  );
}

beforeEach(() => {
  db = emptyDatabase();
});

test('can dehydrate from a data where the collections are missing without crashing', () => {
  db.load({
    idCtr: 1,
    schema: {},
  });
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

    db.allocate('thing', {
      name: 'C',
      value: 'C',
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
        entity: expect.objectContaining({ color: 'green' }),
        count: 1,
      },
      {
        entity: expect.objectContaining({ color: 'blue' }),
        count: 2,
      },
    ]);
  });

  describe('only() method', () => {
    test('does not throw if there is exactly one thing to find', () => {
      const b = mustFind('thing', (x) => x.name === 'B');
      expect(db.follow('hasWidget', b).only()).toEqual(
        expect.objectContaining({
          entity: expect.objectContaining({ color: 'purple' }),
        }),
      );
    });

    test('throws if there are 0 things to find', () => {
      const c = mustFind('thing', (x) => x.name === 'C');
      expect(() => expect(db.follow('hasWidget', c).only())).toThrow(/found 0/);
    });

    test('throws if there are more than 1 things to find', () => {
      const a = mustFind('thing', (x) => x.name === 'A');
      expect(() => expect(db.follow('hasWidget', a).only())).toThrow(/found 2/);
    });
  });

  test('follow relationships backward: things can be found', () => {
    const purpleWidget = mustFind('widget', (w) => w.color === 'purple');
    expect(db.incoming('hasWidget', purpleWidget)).toEqual([
      {
        entity: expect.objectContaining({ name: 'B' }),
        count: 5,
      },
    ]);
  });

  test('check that entities found via relationships are typed appropriately', () => {
    const purpleWidget = mustFind('widget', (w) => w.color === 'purple');
    const shouldBeAThing: Thing = db.incoming('hasWidget', purpleWidget).only().entity;
    void shouldBeAThing;
  });
});

function mustFind<K extends keyof EntitiesOf<typeof db>>(key: K, pred: (x: EntitiesOf<typeof db>[K]) => boolean) {
  const x = db.all(key).find(pred as any);
  if (!x) {
    throw new Error(`Could not find ${key} with ${pred}`);
  }
  return x;
}

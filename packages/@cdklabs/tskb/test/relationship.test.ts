import { Database, entityCollection, Entity, Relationship, EntitiesOf, relationshipCollection } from '../src';

interface Thing extends Entity {
  readonly name: string;
  readonly value?: string;
}

interface Widget extends Entity {
  readonly color: string;
}

type HasWidget = Relationship<Thing, Widget, { count: number }>;
type HasLabeledWidget = Relationship<Thing, Widget, { label: string; count: number }>;
type LikesWidget = Relationship<Thing, Widget>;

let db: ReturnType<typeof emptyDatabase>;

function emptyDatabase() {
  return new Database(
    {
      thing: entityCollection<Thing>(),
      widget: entityCollection<Widget>(),
    },
    (r) => ({
      hasWidget: r.relationship<HasWidget>('thing', 'widget'),
      hasLabeledWidget: r.relationship<HasLabeledWidget>('thing', 'widget'),
      likesWidget: r.relationship<LikesWidget>('thing', 'widget'),
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

describe('linking the same entities more than once', () => {
  let a: Thing;
  let b: Thing;
  let green: Widget;
  let blue: Widget;

  beforeEach(() => {
    a = db.allocate('thing', { name: 'A' });
    b = db.allocate('thing', { name: 'B' });
    green = db.allocate('widget', { color: 'green' });
    blue = db.allocate('widget', { color: 'blue' });
  });

  test('a link without attributes is recorded once', () => {
    db.link('likesWidget', a, green);
    db.link('likesWidget', a, blue);
    db.link('likesWidget', a, green);

    expect(db.follow('likesWidget', a).map((l) => l.entity)).toEqual([green, blue]);
    expect(db.incoming('likesWidget', green).map((l) => l.entity)).toEqual([a]);
  });

  test('a link with the same attributes is recorded once', () => {
    db.link('hasWidget', a, green, { count: 1 });
    db.link('hasWidget', a, green, { count: 1 });

    expect(db.follow('hasWidget', a)).toEqual([{ entity: green, count: 1 }]);
    expect(db.incoming('hasWidget', green)).toEqual([{ entity: a, count: 1 }]);
  });

  test('links with different attributes are each recorded, in the order they were first added', () => {
    db.link('hasWidget', a, green, { count: 2 });
    db.link('hasWidget', a, green, { count: 1 });
    db.link('hasWidget', a, green, { count: 2 });

    expect(db.follow('hasWidget', a)).toEqual([
      { entity: green, count: 2 },
      { entity: green, count: 1 },
    ]);
    expect(db.incoming('hasWidget', green)).toEqual([
      { entity: a, count: 2 },
      { entity: a, count: 1 },
    ]);
  });

  test('the same target linked from different sources is recorded for each source', () => {
    db.link('likesWidget', a, green);
    db.link('likesWidget', b, green);

    expect(db.follow('likesWidget', b).map((l) => l.entity)).toEqual([green]);
    expect(db.incoming('likesWidget', green).map((l) => l.entity)).toEqual([a, b]);
  });

  test('attributes in a different key order make a different link', () => {
    db.link('hasLabeledWidget', a, green, { label: 'x', count: 1 });
    db.link('hasLabeledWidget', a, green, { count: 1, label: 'x' });
    db.link('hasLabeledWidget', a, green, { count: 1, label: 'x' });

    expect(JSON.stringify(db.save().schema.hasLabeledWidget.forward)).toEqual(
      JSON.stringify({
        [a.$id]: [
          { $id: green.$id, label: 'x', count: 1 },
          { $id: green.$id, count: 1, label: 'x' },
        ],
      }),
    );
    expect(db.incoming('hasLabeledWidget', green)).toHaveLength(2);
  });

  describe('after loading a saved database', () => {
    /**
     * Save and load through JSON, as when the database is written to and read from a file
     */
    function saveAndLoad() {
      const loaded = emptyDatabase();
      loaded.load(JSON.parse(JSON.stringify(db.save())));
      return loaded;
    }

    test('a link that was saved is not recorded again', () => {
      db.link('likesWidget', a, green);
      db.link('hasWidget', a, green, { count: 1 });

      const loaded = saveAndLoad();
      loaded.link('likesWidget', a, green);
      loaded.link('hasWidget', a, green, { count: 1 });
      loaded.link('hasWidget', a, green, { count: 2 });

      expect(loaded.follow('likesWidget', a).map((l) => l.entity)).toEqual([green]);
      expect(loaded.follow('hasWidget', a)).toEqual([
        { entity: green, count: 1 },
        { entity: green, count: 2 },
      ]);
      expect(loaded.incoming('hasWidget', green)).toEqual([
        { entity: a, count: 1 },
        { entity: a, count: 2 },
      ]);
    });

    test('duplicate links in the saved data are loaded once', () => {
      db.link('likesWidget', a, green);
      const saved = JSON.parse(JSON.stringify(db.save()));
      saved.schema.likesWidget.forward[a.$id].push({ $id: green.$id }, { $id: blue.$id }, { $id: green.$id });

      const loaded = emptyDatabase();
      loaded.load(saved);

      expect(loaded.follow('likesWidget', a).map((l) => l.entity)).toEqual([green, blue]);
      expect(loaded.incoming('likesWidget', green).map((l) => l.entity)).toEqual([a]);
    });

    test('loading replaces the links recorded before, so they can be recorded again', () => {
      const withoutLinks = JSON.parse(JSON.stringify(db.save()));
      db.link('likesWidget', a, green);

      db.load(withoutLinks);
      expect(db.follow('likesWidget', a)).toEqual([]);

      db.link('likesWidget', a, green);
      expect(db.follow('likesWidget', a).map((l) => l.entity)).toEqual([green]);
      expect(db.incoming('likesWidget', green).map((l) => l.entity)).toEqual([a]);
    });

    test('saving reproduces the saved data', () => {
      db.link('likesWidget', a, green);
      db.link('likesWidget', b, green);
      db.link('likesWidget', a, blue);
      db.link('hasWidget', a, green, { count: 2 });
      db.link('hasWidget', a, green, { count: 1 });
      db.link('hasLabeledWidget', a, green, { label: 'x', count: 1 });
      db.link('hasLabeledWidget', a, green, { count: 1, label: 'x' });
      const saved = JSON.stringify(db.save());

      const loaded = emptyDatabase();
      loaded.load(JSON.parse(saved));

      expect(JSON.stringify(loaded.save())).toEqual(saved);
    });
  });
});

test('a relationship collection treats links already in its forward map as recorded', () => {
  const thing: Thing = { $id: 'thing', name: 'A' };
  const widget: Widget = { $id: 'widget', color: 'green' };
  const coll = relationshipCollection<HasWidget>(
    () => thing,
    () => widget,
  );
  coll.forward.set(thing.$id, [{ $id: widget.$id, count: 1 }]);

  coll.add(thing, widget, { count: 1 });
  coll.add(thing, widget, { count: 2 });

  expect(coll.forward.get(thing.$id)).toEqual([
    { $id: widget.$id, count: 1 },
    { $id: widget.$id, count: 2 },
  ]);
});

function mustFind<K extends keyof EntitiesOf<typeof db>>(key: K, pred: (x: EntitiesOf<typeof db>[K]) => boolean) {
  const x = db.all(key).find(pred as any);
  if (!x) {
    throw new Error(`Could not find ${key} with ${pred}`);
  }
  return x;
}

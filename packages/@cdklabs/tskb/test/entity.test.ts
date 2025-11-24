import { calculatedIndex, Database, Entity, entityCollection, fieldIndex, optionalCmp, stringCmp } from '../src';

interface Thing extends Entity {
  readonly name: string;
  readonly value?: string;
}

let db: ReturnType<typeof emptyDatabase>;

function emptyDatabase() {
  return Database.entitiesOnly({
    thing: entityCollection<Thing>().index({
      name: fieldIndex('name', stringCmp),
      lowercaseName: calculatedIndex((x) => x.name.toLowerCase(), stringCmp),
      value: fieldIndex('value', optionalCmp(stringCmp)),
    }),
  });
}

beforeEach(() => {
  db = emptyDatabase();
});

describe.each([false, true])('database is filled with one item (saveAndLoad: %p)', (saveAndLoad) => {
  beforeEach(() => {
    db.allocate('thing', {
      name: 'A',
      value: 'A',
    });

    if (saveAndLoad) {
      const serialized = db.save();
      const fresh = emptyDatabase();
      fresh.load(serialized);
      db = fresh;
    }
  });

  test('it can be looked up', () => {
    // THEN
    expect(db.all('thing')).toContainEqual(
      expect.objectContaining({
        name: 'A',
        value: 'A',
      }),
    );
  });

  test('can lookup by index', () => {
    const found = db.lookup('thing', 'name', 'equals', 'A');

    expect(found).toContainEqual(
      expect.objectContaining({
        name: 'A',
        value: 'A',
      }),
    );
  });

  test('can lookup by calculated index', () => {
    const found = db.lookup('thing', 'lowercaseName', 'equals', 'a');

    expect(found).toContainEqual(
      expect.objectContaining({
        name: 'A',
        value: 'A',
      }),
    );
  });
});

test('can dehydrate from a data where the collection is missing without crashing', () => {
  db.load({
    idCtr: 1,
    schema: {},
  });
});

describe.each([false, true])('database is filled with multiple items (saveAndLoad: %p)', (saveAndLoad) => {
  beforeEach(() => {
    db.allocate('thing', {
      name: 'A',
      value: 'Data',
    });
    db.allocate('thing', {
      name: 'B',
    });
    db.allocate('thing', {
      name: 'C',
      value: 'Data',
    });
    db.allocate('thing', {
      name: 'D',
    });

    if (saveAndLoad) {
      const serialized = db.save();
      const fresh = emptyDatabase();
      fresh.load(serialized);
      db = fresh;
    }
  });

  test('can lookup by unset field', () => {
    const found = db.lookup('thing', 'value', 'equals', undefined);

    expect(found).toEqual(
      expect.arrayContaining([
        {
          $id: '1',
          name: 'B',
        },
        {
          $id: '3',
          name: 'D',
        },
      ]),
    );
  });

  test('can lookup by set field', () => {
    const found = db.lookup('thing', 'value', 'equals', 'Data');

    expect(found).toEqual(
      expect.arrayContaining([
        {
          $id: '0',
          name: 'A',
          value: 'Data',
        },
        {
          $id: '2',
          name: 'C',
          value: 'Data',
        },
      ]),
    );
  });
});

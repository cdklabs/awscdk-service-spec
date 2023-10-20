import { DbDiff } from '../src/db-diff';
import { ref } from '@cdklabs/tskb';
import { emptyDatabase, SpecDatabase } from '@aws-cdk/service-spec-types';

let db1: SpecDatabase;
let db2: SpecDatabase;
let diff: DbDiff;
beforeEach(() => {
  db1 = emptyDatabase();
  db2 = emptyDatabase();
  diff = new DbDiff(db1, db2);
});

test('property diff ignores union order', () => {
  const pd = diff.diffProperty(
    { type: { type: 'union', types: [{ type: 'string' }, { type: 'number' }] } },
    { type: { type: 'union', types: [{ type: 'number' }, { type: 'string' }] } },
  );
  expect(pd).toBeUndefined();
});

test('property diff ignores union order, even when using type references', () => {
  const t1 = db1.allocate('typeDefinition', { name: 'MyType', properties: {} });
  const t2 = db2.allocate('typeDefinition', { name: 'MyType', properties: {} });

  const pd = diff.diffProperty(
    { type: { type: 'union', types: [{ type: 'string' }, { type: 'ref', reference: ref(t1) }] } },
    { type: { type: 'union', types: [{ type: 'ref', reference: ref(t2) }, { type: 'string' }] } },
  );
  expect(pd).toBeUndefined();
});

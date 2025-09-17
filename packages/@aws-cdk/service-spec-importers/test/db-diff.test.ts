import { emptyDatabase, SpecDatabase } from '@aws-cdk/service-spec-types';
import { ref } from '@cdklabs/tskb';
import { DbDiff } from '../src/db-diff';

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

test('metrics diff only on statistic and ignore dedup key for diff', () => {
  const m1 = db1.allocate('metric', { namespace: 'NS', name: 'Name', statistic: 'Average', dedupKey: '1' });
  const m2 = db2.allocate('metric', { namespace: 'NS', name: 'Name', statistic: 'Maximum', dedupKey: '2' });

  const md = diff.diffMetrics([m1], [m2]);
  const changes = Object.values(md?.updated || {});
  expect(changes.length).toBe(1);
  expect(changes[0]).toMatchObject({
    statistic: { new: 'Maximum', old: 'Average' },
  });
});

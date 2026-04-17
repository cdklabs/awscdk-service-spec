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
  const m1 = db1.allocate('metric', {
    namespace: 'NS',
    name: 'Name',
    statistic: 'Average',
    previousStatistics: [],
    dedupKey: '1',
  });
  const m2 = db2.allocate('metric', {
    namespace: 'NS',
    name: 'Name',
    statistic: 'Maximum',
    previousStatistics: [],
    dedupKey: '2',
  });

  const md = diff.diffMetrics([m1], [m2]);
  const changes = Object.values(md?.updated || {});
  expect(changes.length).toBe(1);
  expect(changes[0]).toMatchObject({
    statistic: { new: 'Maximum', old: 'Average' },
  });
});

test('metrics diff detects description change', () => {
  const m1 = db1.allocate('metric', {
    namespace: 'NS',
    name: 'Name',
    statistic: 'Average',
    previousStatistics: ['Average'],
    dedupKey: '1',
    description: 'old desc',
  });
  const m2 = db2.allocate('metric', {
    namespace: 'NS',
    name: 'Name',
    statistic: 'Average',
    previousStatistics: ['Average'],
    dedupKey: '2',
    description: 'new desc',
  });

  const md = diff.diffMetrics([m1], [m2]);
  const changes = Object.values(md?.updated || {});
  expect(changes.length).toBe(1);
  expect(changes[0]).toMatchObject({
    description: { old: 'old desc', new: 'new desc' },
  });
});

test('metrics diff detects dimension set added', () => {
  const m1 = db1.allocate('metric', {
    namespace: 'NS',
    name: 'Name',
    statistic: 'Average',
    previousStatistics: ['Average'],
    dedupKey: '1',
  });
  const m2 = db2.allocate('metric', {
    namespace: 'NS',
    name: 'Name',
    statistic: 'Average',
    previousStatistics: ['Average'],
    dedupKey: '2',
  });

  const ds = db2.allocate('dimensionSet', {
    dedupKey: 'ds1',
    name: 'PerInstance',
    dimensions: [{ name: 'InstanceId' }],
  });
  db2.link('usesDimensionSet', m2, ds);

  const md = diff.diffMetrics([m1], [m2]);
  const changes = Object.values(md?.updated || {});
  expect(changes.length).toBe(1);
  expect(changes[0].dimensionSets?.added).toMatchObject({
    PerInstance: expect.objectContaining({ name: 'PerInstance', dimensions: [{ name: 'InstanceId' }] }),
  });
});

test('metrics diff detects dimension set removed', () => {
  const m1 = db1.allocate('metric', {
    namespace: 'NS',
    name: 'Name',
    statistic: 'Average',
    previousStatistics: ['Average'],
    dedupKey: '1',
  });
  const m2 = db2.allocate('metric', {
    namespace: 'NS',
    name: 'Name',
    statistic: 'Average',
    previousStatistics: ['Average'],
    dedupKey: '2',
  });

  const ds = db1.allocate('dimensionSet', {
    dedupKey: 'ds1',
    name: 'PerInstance',
    dimensions: [{ name: 'InstanceId' }],
  });
  db1.link('usesDimensionSet', m1, ds);

  const md = diff.diffMetrics([m1], [m2]);
  const changes = Object.values(md?.updated || {});
  expect(changes.length).toBe(1);
  expect(changes[0].dimensionSets?.removed).toMatchObject({
    PerInstance: expect.objectContaining({ name: 'PerInstance' }),
  });
});

test('metrics diff detects dimension set dimensions changed', () => {
  const m1 = db1.allocate('metric', {
    namespace: 'NS',
    name: 'Name',
    statistic: 'Average',
    previousStatistics: ['Average'],
    dedupKey: '1',
  });
  const m2 = db2.allocate('metric', {
    namespace: 'NS',
    name: 'Name',
    statistic: 'Average',
    previousStatistics: ['Average'],
    dedupKey: '2',
  });

  const ds1 = db1.allocate('dimensionSet', {
    dedupKey: 'ds1',
    name: 'PerInstance',
    dimensions: [{ name: 'InstanceId' }],
  });
  const ds2 = db2.allocate('dimensionSet', {
    dedupKey: 'ds2',
    name: 'PerInstance',
    dimensions: [{ name: 'InstanceId' }, { name: 'AZ' }],
  });
  db1.link('usesDimensionSet', m1, ds1);
  db2.link('usesDimensionSet', m2, ds2);

  const md = diff.diffMetrics([m1], [m2]);
  const changes = Object.values(md?.updated || {});
  expect(changes.length).toBe(1);
  expect(changes[0].dimensionSets?.updated).toMatchObject({
    PerInstance: {
      dimensions: {
        old: [{ name: 'InstanceId' }],
        new: [{ name: 'InstanceId' }, { name: 'AZ' }],
      },
    },
  });
});

test('metrics diff reports no change when dimension sets are identical', () => {
  const m1 = db1.allocate('metric', {
    namespace: 'NS',
    name: 'Name',
    statistic: 'Average',
    previousStatistics: ['Average'],
    dedupKey: '1',
  });
  const m2 = db2.allocate('metric', {
    namespace: 'NS',
    name: 'Name',
    statistic: 'Average',
    previousStatistics: ['Average'],
    dedupKey: '2',
  });

  const ds1 = db1.allocate('dimensionSet', {
    dedupKey: 'ds1',
    name: 'PerInstance',
    dimensions: [{ name: 'InstanceId' }],
  });
  const ds2 = db2.allocate('dimensionSet', {
    dedupKey: 'ds2',
    name: 'PerInstance',
    dimensions: [{ name: 'InstanceId' }],
  });
  db1.link('usesDimensionSet', m1, ds1);
  db2.link('usesDimensionSet', m2, ds2);

  const md = diff.diffMetrics([m1], [m2]);
  expect(md).toBeUndefined();
});

test('event diff ignores different $ref IDs when event type definitions have same name or resource in resourcesField has the same name', () => {
  const eventType1 = db1.allocate('eventTypeDefinition', { name: 'WorkSpacesAccess', properties: {} });
  const eventType2 = db2.allocate('eventTypeDefinition', { name: 'WorkSpacesAccess', properties: {} });

  const resource1 = db1.allocate('resource', {
    cloudFormationType: 'AWS::S3::Bucket',
    attributes: {},
    name: 'Type',
    primaryIdentifier: ['BucketName'],
    properties: {
      MyProp: { type: { type: 'string' } },
    },
  });
  const resource2 = db2.allocate('resource', {
    cloudFormationType: 'AWS::S3::Bucket',
    attributes: {},
    name: 'Type',
    primaryIdentifier: ['BucketName'],
    properties: {
      MyProp: { type: { type: 'string' } },
    },
  });

  const event1 = db1.allocate('event', {
    name: 'aws.workspaces@WorkSpacesAccess',
    description: 'Test event',
    source: 'aws.workspaces',
    detailType: 'WorkSpaces Access',
    rootProperty: ref(eventType1),
    resourcesField: [{ type: ref(eventType1), fieldName: 'workspaceId', resource: ref(resource1) }],
  });

  const event2 = db2.allocate('event', {
    name: 'aws.workspaces@WorkSpacesAccess',
    description: 'Test event',
    source: 'aws.workspaces',
    detailType: 'WorkSpaces Access',
    rootProperty: ref(eventType2),
    resourcesField: [{ type: ref(eventType2), fieldName: 'workspaceId', resource: ref(resource2) }],
  });

  const ed = diff.diffEvent(event1, event2);
  expect(ed).toBeUndefined();
});

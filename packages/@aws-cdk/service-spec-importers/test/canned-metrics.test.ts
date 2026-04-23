import { emptyDatabase } from '@aws-cdk/service-spec-types';
import { importCannedMetrics } from '../src/importers/import-canned-metrics';
import { ProblemReport } from '../src/report';

let db: ReturnType<typeof emptyDatabase>;
let report: ProblemReport;

beforeEach(() => {
  db = emptyDatabase();
  report = new ProblemReport();

  // Put a service & a resource in the database
  const s = db.allocate('service', {
    name: 'aws-some',
    shortName: 'some',
    capitalized: 'AweSome',
    cloudFormationNamespace: 'AWS::Some',
  });
  const r = db.allocate('resource', {
    cloudFormationType: 'AWS::Some::Type',
    attributes: {
      MyAttr: { type: { type: 'string' } },
    },
    name: 'Type',
    properties: {
      MyProp: { type: { type: 'string' } },
    },
  });
  db.link('hasResource', s, r);
});

test('adds corresponding metrics to the database', () => {
  // WHEN
  importCannedMetrics(
    db,
    [
      {
        id: 'AWS::Some',
        metricTemplates: [
          {
            resourceType: 'AWS::Some::Type',
            namespace: 'AWS/Some',
            dimensions: [
              { dimensionName: 'Asgard' },
              { dimensionName: 'Astral Plane' },
              { dimensionName: 'Microverse' },
            ],
            metrics: [
              {
                id: 'AWS::Some::Type:4XXError',
                name: '4XXError',
                defaultStat: 'Sum',
              },
              {
                id: 'AWS::Some::Type:4XXError',
                name: '5XXError',
                defaultStat: 'Max',
              },
            ],
          },
        ],
      },
    ],
    report,
    { 'AWS/Some': { 'Asgard,Astral Plane,Microverse': 'Microverse' } },
  );

  // THEN
  const res = db.lookup('resource', 'cloudFormationType', 'equals', 'AWS::Some::Type')[0];
  const metrics = db.follow('resourceHasMetric', res).map((e) => e.entity);
  expect(metrics.length).toEqual(2);
  expect(metrics).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        namespace: 'AWS/Some',
        name: '4XXError',
        statistic: 'Sum',
      }),
      expect.objectContaining({
        namespace: 'AWS/Some',
        name: '5XXError',
        statistic: 'Max',
      }),
    ]),
  );

  expect(db.follow('usesDimensionSet', metrics[0]).length).toBe(1);
  expect(db.follow('usesDimensionSet', metrics[1]).length).toBe(1);
});

test('deduplicates dimension sets with equal dimensions within a service', () => {
  // GIVEN a second resource in the same service
  const s = db.lookup('service', 'name', 'equals', 'aws-some')[0];
  const r2 = db.allocate('resource', {
    cloudFormationType: 'AWS::Some::Other',
    attributes: {},
    name: 'Other',
    properties: {},
  });
  db.link('hasResource', s, r2);

  // WHEN two resources declare a metric with the same dimensions
  importCannedMetrics(
    db,
    [
      {
        id: 'AWS::Some',
        metricTemplates: [
          {
            resourceType: 'AWS::Some::Type',
            namespace: 'AWS/Some',
            dimensions: [{ dimensionName: 'LoadBalancer' }],
            metrics: [{ id: 'M1', name: 'M1', defaultStat: 'Sum' }],
          },
          {
            resourceType: 'AWS::Some::Other',
            namespace: 'AWS/Some',
            dimensions: [{ dimensionName: 'LoadBalancer' }],
            metrics: [{ id: 'M2', name: 'M2', defaultStat: 'Sum' }],
          },
        ],
      },
    ],
    report,
    { 'AWS/Some': { LoadBalancer: 'LoadBalancer' } },
  );

  // THEN exactly one dimensionSet exists and both metrics link to it
  expect(db.all('dimensionSet').length).toBe(1);

  const r1 = db.lookup('resource', 'cloudFormationType', 'equals', 'AWS::Some::Type')[0];
  const rOther = db.lookup('resource', 'cloudFormationType', 'equals', 'AWS::Some::Other')[0];
  const m1Set = db.follow('usesDimensionSet', db.follow('resourceHasMetric', r1)[0].entity)[0].entity;
  const m2Set = db.follow('usesDimensionSet', db.follow('resourceHasMetric', rOther)[0].entity)[0].entity;
  expect(m1Set).toBe(m2Set);
});

test('does not deduplicate equal dimension sets across different services', () => {
  // GIVEN a second service + resource with the same dimensions
  const s2 = db.allocate('service', {
    name: 'aws-other',
    shortName: 'other',
    capitalized: 'Other',
    cloudFormationNamespace: 'AWS::Other',
  });
  const r2 = db.allocate('resource', {
    cloudFormationType: 'AWS::Other::Type',
    attributes: {},
    name: 'Type',
    properties: {},
  });
  db.link('hasResource', s2, r2);

  // WHEN both services declare identical dimensions
  importCannedMetrics(
    db,
    [
      {
        id: 'AWS::Some',
        metricTemplates: [
          {
            resourceType: 'AWS::Some::Type',
            namespace: 'AWS/Some',
            dimensions: [{ dimensionName: 'LoadBalancer' }],
            metrics: [{ id: 'M', name: 'M', defaultStat: 'Sum' }],
          },
        ],
      },
      {
        id: 'AWS::Other',
        metricTemplates: [
          {
            resourceType: 'AWS::Other::Type',
            namespace: 'AWS/Other',
            dimensions: [{ dimensionName: 'LoadBalancer' }],
            metrics: [{ id: 'M', name: 'M', defaultStat: 'Sum' }],
          },
        ],
      },
    ],
    report,
    {
      'AWS/Some': { LoadBalancer: 'LoadBalancer' },
      'AWS/Other': { LoadBalancer: 'LoadBalancer' },
    },
  );

  // THEN each service gets its own dimensionSet (salt = service.name)
  expect(db.all('dimensionSet').length).toBe(2);
});

test('does not add metrics for unknown resources', () => {
  // WHEN
  importCannedMetrics(
    db,
    [
      {
        id: 'AWS::Some',
        metricTemplates: [
          {
            resourceType: 'AWS::Some::Unknown',
            namespace: 'AWS/Some',
            dimensions: [
              { dimensionName: 'Asgard' },
              { dimensionName: 'Astral Plane' },
              { dimensionName: 'Microverse' },
            ],
            metrics: [
              {
                id: 'AWS::Some::Unknown:4XXError',
                name: '4XXError',
                defaultStat: 'Sum',
              },
              {
                id: 'AWS::Some::Unknown:5XXError',
                name: '5XXError',
                defaultStat: 'Sum',
              },
            ],
          },
        ],
      },
    ],
    report,
    { 'AWS/Some': { 'Asgard,Astral Plane,Microverse': 'Microverse' } },
  );

  // THEN
  const res = db.lookup('resource', 'cloudFormationType', 'equals', 'AWS::Some::Type')[0];
  const metricEdges = db.follow('resourceHasMetric', res);
  expect(metricEdges.length).toEqual(0);
});

test('throws an error when dimension set name is not found', () => {
  expect(() =>
    importCannedMetrics(
      db,
      [
        {
          id: 'AWS::Some',
          metricTemplates: [
            {
              resourceType: 'AWS::Some::Type',
              namespace: 'AWS/Some',
              dimensions: [{ dimensionName: 'UnknownDim' }],
              metrics: [{ id: 'M', name: 'M', defaultStat: 'Sum' }],
            },
          ],
        },
      ],
      report,
      { 'AWS/Some': { SomethingElse: 'SomethingElse' } },
    ),
  ).toThrow("No dimension set name found for namespace 'AWS/Some', dimensions 'UnknownDim'");
});

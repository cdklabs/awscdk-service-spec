import { emptyDatabase } from '@aws-cdk/service-spec';
import { readCannedMetrics } from '../src/canned-metrics';

let db: ReturnType<typeof emptyDatabase>;

beforeEach(() => {
  db = emptyDatabase();

  // Put a service & a resource in the database
  const s = db.allocate('service', {
    name: 'aws-some',
    shortName: 'some',
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
  readCannedMetrics(db, [
    {
      id: 'AWS::Some',
      metricTemplates: [
        {
          resourceType: 'AWS::Some::Type',
          namespace: 'AWS/Some',
          dimensions: [{ dimensionName: 'Asgard' }, { dimensionName: 'Astral Plane' }, { dimensionName: 'Microverse' }],
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
  ]);

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

test('does not add metrics for unknown resources', () => {
  // WHEN
  readCannedMetrics(db, [
    {
      id: 'AWS::Some',
      metricTemplates: [
        {
          resourceType: 'AWS::Some::Unknown',
          namespace: 'AWS/Some',
          dimensions: [{ dimensionName: 'Asgard' }, { dimensionName: 'Astral Plane' }, { dimensionName: 'Microverse' }],
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
  ]);

  // THEN
  const res = db.lookup('resource', 'cloudFormationType', 'equals', 'AWS::Some::Type')[0];
  const metricEdges = db.follow('resourceHasMetric', res);
  expect(metricEdges.length).toEqual(0);
});

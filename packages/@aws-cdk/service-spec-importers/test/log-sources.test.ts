import { emptyDatabase } from '@aws-cdk/service-spec-types';
import { ProblemReport } from '../src';
import { importLogSources } from '../src/importers/import-log-source';

let db: ReturnType<typeof emptyDatabase>;
let report: ProblemReport;
beforeEach(() => {
  db = emptyDatabase();
  report = new ProblemReport();

  db.allocate('resource', {
    cloudFormationType: 'AWS::Some::Type',
    attributes: {},
    name: 'Type',
    properties: {
      MyProp: { type: { type: 'string' } },
    },
  });

  db.allocate('resource', {
    cloudFormationType: 'AWS::Other::Type',
    attributes: {},
    name: 'OtherType',
    properties: {
      MyProp: { type: { type: 'string' } },
    },
  });
});

test('adds log type to resource', () => {
  importLogSources(
    db,
    {
      SomeTypeS3Logs: {
        LogType: 'SOME_LOGS',
        ResourceTypes: ['AWS::Some::Type'],
        Destinations: [
          {
            DestinationType: 'S3',
            PermissionsVersion: 'V2',
          },
        ],
      },
      SomeTypeTracesLogs: {
        LogType: 'TRACES',
        ResourceTypes: ['AWS::Some::Type'],
        Destinations: [
          {
            DestinationType: 'XRAY',
            PermissionsVersion: 'V2',
          },
        ],
      },
    },
    report,
  );

  const res = db.lookup('resource', 'cloudFormationType', 'equals', 'AWS::Some::Type')[0];
  expect(res.vendedLogs?.logType).toEqual(['SOME_LOGS', 'TRACES']);
  expect(res.vendedLogs?.logDestinations).toEqual([
    { destinationType: 'S3', permissionVersion: 'V2' },
    { destinationType: 'XRAY', permissionVersion: 'V2' },
  ]);
});

test('adds multiple log types to resource and does not add duplicate destinations', () => {
  importLogSources(
    db,
    {
      SomeTypeApplicationLogs: {
        LogType: 'APPLICATION_LOGS',
        ResourceTypes: ['AWS::Some::Type'],
        Destinations: [
          {
            DestinationType: 'S3',
            PermissionsVersion: 'V2',
          },
        ],
      },
      SomeTypeEventLogs: {
        LogType: 'EVENT_LOGS',
        ResourceTypes: ['AWS::Some::Type'],
        Destinations: [
          {
            DestinationType: 'S3',
            PermissionsVersion: 'V2',
          },
        ],
      },
    },
    report,
  );

  const res = db.lookup('resource', 'cloudFormationType', 'equals', 'AWS::Some::Type')[0];
  expect(res.vendedLogs?.logType).toEqual(['APPLICATION_LOGS', 'EVENT_LOGS']);
  expect(res.vendedLogs?.logDestinations).toEqual([{ destinationType: 'S3', permissionVersion: 'V2' }]);
});

test('adds log types to multiple resources', () => {
  importLogSources(
    db,
    {
      MultiTypeApplicationLogs: {
        LogType: 'APPLICATION_LOGS',
        ResourceTypes: ['AWS::Some::Type', 'AWS::Other::Type'],
        Destinations: [
          {
            DestinationType: 'S3',
            PermissionsVersion: 'V2',
          },
        ],
      },
    },
    report,
  );

  const someRes = db.lookup('resource', 'cloudFormationType', 'equals', 'AWS::Some::Type')[0];
  expect(someRes.vendedLogs?.logType).toEqual(['APPLICATION_LOGS']);
  expect(someRes.vendedLogs?.logDestinations).toEqual([{ destinationType: 'S3', permissionVersion: 'V2' }]);

  const otherRes = db.lookup('resource', 'cloudFormationType', 'equals', 'AWS::Other::Type')[0];
  expect(otherRes.vendedLogs?.logType).toEqual(['APPLICATION_LOGS']);
  expect(otherRes.vendedLogs?.logDestinations).toEqual([{ destinationType: 'S3', permissionVersion: 'V2' }]);
});

test('does not assign logTypes if resource does not exist in Cloudformation', () => {
  importLogSources(
    db,
    {
      SomeTypeLogs: {
        LogType: 'SOME_LOGS',
        ResourceTypes: ['AWS::Missing::Type'],
        Destinations: [
          {
            DestinationType: 'S3',
            PermissionsVersion: 'V2',
          },
        ],
      },
    },
    report,
  );

  expect(report.totalCount).toEqual(1);
  expect(report);
});

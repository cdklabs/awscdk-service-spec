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
      SomeTypeLogs: {
        LogType: 'SOME_LOGS',
        ResourceTypes: ['AWS::Some::Type'],
      },
    },
    report,
  );

  const res = db.lookup('resource', 'cloudFormationType', 'equals', 'AWS::Some::Type')[0];
  expect(res.logTypes).toEqual(['SOME_LOGS']);
});

test('adds multiple log types to resource', () => {
  importLogSources(
    db,
    {
      SomeTypeApplicationLogs: {
        LogType: 'APPLICATION_LOGS',
        ResourceTypes: ['AWS::Some::Type'],
      },
      SomeTypeEventLogs: {
        LogType: 'EVENT_LOGS',
        ResourceTypes: ['AWS::Some::Type'],
      },
    },
    report,
  );

  const res = db.lookup('resource', 'cloudFormationType', 'equals', 'AWS::Some::Type')[0];
  expect(res.logTypes).toEqual(['APPLICATION_LOGS', 'EVENT_LOGS']);
});

test('adds log types to multiple resources', () => {
  importLogSources(
    db,
    {
      MultiTypeApplicationLogs: {
        LogType: 'APPLICATION_LOGS',
        ResourceTypes: ['AWS::Other::Type', 'AWS::Some::Type'],
      },
    },
    report,
  );

  const someRes = db.lookup('resource', 'cloudFormationType', 'equals', 'AWS::Some::Type')[0];
  expect(someRes.logTypes).toEqual(['APPLICATION_LOGS']);

  const otherRes = db.lookup('resource', 'cloudFormationType', 'equals', 'AWS::Other::Type')[0];
  expect(otherRes.logTypes).toEqual(['APPLICATION_LOGS']);
});

test('does not assign logTypes if resource does not exist in Cloudformation', () => {
  importLogSources(
    db,
    {
      SomeTypeLogs: {
        LogType: 'SOME_LOGS',
        ResourceTypes: ['AWS::Missing::Type'], // this type does not exist
      },
    },
    report,
  );

  expect(report.totalCount).toEqual(1);
  expect(report);
});

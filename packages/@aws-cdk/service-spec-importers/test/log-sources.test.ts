import { emptyDatabase } from '@aws-cdk/service-spec-types';
import { importLogSources } from '../src/importers/import-log-source';

let db: ReturnType<typeof emptyDatabase>;
beforeEach(() => {
  db = emptyDatabase();

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
  importLogSources(db, {
    SomeTypeLogs: {
      LogType: 'SOME_LOGS',
      ResourceType: ['AWS::Some::Type'],
    },
  });

  const res = db.lookup('resource', 'cloudFormationType', 'equals', 'AWS::Some::Type')[0];
  expect(res.logTypes).toEqual(['SOME_LOGS']);
});

test('adds multiple log types to resource', () => {
  importLogSources(db, {
    SomeTypeApplicationLogs: {
      LogType: 'APPLICATION_LOGS',
      ResourceType: ['AWS::Some::Type'],
    },
    SomeTypeEventLogs: {
      LogType: 'EVENT_LOGS',
      ResourceType: ['AWS::Some::Type'],
    },
  });

  const res = db.lookup('resource', 'cloudFormationType', 'equals', 'AWS::Some::Type')[0];
  expect(res.logTypes).toEqual(['APPLICATION_LOGS', 'EVENT_LOGS']);
});

test('adds log types to multiple resources', () => {
  importLogSources(db, {
    MultiTypeApplicationLogs: {
      LogType: 'APPLICATION_LOGS',
      ResourceType: ['AWS::Other::Type', 'AWS::Some::Type'],
    },
  });

  const someRes = db.lookup('resource', 'cloudFormationType', 'equals', 'AWS::Some::Type')[0];
  expect(someRes.logTypes).toEqual(['APPLICATION_LOGS']);

  const otherRes = db.lookup('resource', 'cloudFormationType', 'equals', 'AWS::Other::Type')[0];
  expect(otherRes.logTypes).toEqual(['APPLICATION_LOGS']);
});

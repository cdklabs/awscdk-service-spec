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
    [
      {
        LogType: 'SOME_LOGS',
        ResourceTypes: ['AWS::Some::Type'],
        Destinations: [
          {
            DestinationType: 'S3',
            PermissionsVersion: 'V2',
            OutputFormat: ['json', 'plain'],
          },
        ],
        RecordFields: [
          {
            Field: 'timestamp',
            Mandatory: true,
          },
          {
            Field: 'resource_arn',
            Mandatory: false,
          },
        ],
      },
      {
        LogType: 'TRACES',
        ResourceTypes: ['AWS::Some::Type'],
        Destinations: [
          {
            DestinationType: 'XRAY',
            PermissionsVersion: 'V2',
            OutputFormat: [],
          },
        ],
        RecordFields: [
          {
            Field: 'traces',
            Mandatory: true,
          },
        ],
      },
    ],
    report,
  );

  const res = db.lookup('resource', 'cloudFormationType', 'equals', 'AWS::Some::Type')[0];
  expect(res.vendedLogs).toEqual([
    {
      permissionsVersion: 'V2',
      logType: 'SOME_LOGS',
      destinations: [
        {
          destinationType: 'S3',
          outputFormats: ['json', 'plain'],
        },
      ],
      mandatoryFields: ['timestamp'],
      optionalFields: ['resource_arn'],
    },
    {
      permissionsVersion: 'V2',
      logType: 'TRACES',
      destinations: [
        {
          destinationType: 'XRAY',
          outputFormats: [],
        },
      ],
      mandatoryFields: ['traces'],
    },
  ]);
});

test('adds multiple log types to resource and does not add duplicate destinations', () => {
  importLogSources(
    db,
    [
      {
        LogType: 'APPLICATION_LOGS',
        ResourceTypes: ['AWS::Some::Type'],
        Destinations: [
          {
            DestinationType: 'S3',
            PermissionsVersion: 'V2',
            OutputFormat: ['json', 'w3c'],
          },
        ],
        RecordFields: [
          {
            Field: 'resource_arn',
            Mandatory: true,
          },
        ],
      },
      {
        LogType: 'EVENT_LOGS',
        ResourceTypes: ['AWS::Some::Type'],
        Destinations: [
          {
            DestinationType: 'S3',
            PermissionsVersion: 'V2',
            OutputFormat: ['json', 'w3c', 'parquet'],
          },
        ],
        RecordFields: [
          {
            Field: 'resource_arn',
            Mandatory: true,
          },
        ],
      },
    ],
    report,
  );

  const res = db.lookup('resource', 'cloudFormationType', 'equals', 'AWS::Some::Type')[0];
  expect(res.vendedLogs).toEqual([
    {
      permissionsVersion: 'V2',
      logType: 'APPLICATION_LOGS',
      destinations: [
        {
          destinationType: 'S3',
          outputFormats: ['json', 'w3c'],
        },
      ],
      mandatoryFields: ['resource_arn'],
    },
    {
      permissionsVersion: 'V2',
      logType: 'EVENT_LOGS',
      destinations: [
        {
          destinationType: 'S3',
          outputFormats: ['json', 'w3c', 'parquet'],
        },
      ],
      mandatoryFields: ['resource_arn'],
    },
  ]);
});

test('adds log types to multiple resources', () => {
  importLogSources(
    db,
    [
      {
        LogType: 'APPLICATION_LOGS',
        ResourceTypes: ['AWS::Some::Type', 'AWS::Other::Type'],
        Destinations: [
          {
            DestinationType: 'S3',
            PermissionsVersion: 'V2',
            OutputFormat: ['json', 'plain'],
          },
        ],
        RecordFields: [
          {
            Field: 'event_timestamp',
            Mandatory: true,
          },
        ],
      },
    ],
    report,
  );

  const someRes = db.lookup('resource', 'cloudFormationType', 'equals', 'AWS::Some::Type')[0];
  expect(someRes.vendedLogs).toEqual([
    {
      permissionsVersion: 'V2',
      logType: 'APPLICATION_LOGS',
      destinations: [
        {
          destinationType: 'S3',
          outputFormats: ['json', 'plain'],
        },
      ],
      mandatoryFields: ['event_timestamp'],
    },
  ]);

  const otherRes = db.lookup('resource', 'cloudFormationType', 'equals', 'AWS::Other::Type')[0];
  expect(otherRes.vendedLogs).toEqual([
    {
      permissionsVersion: 'V2',
      logType: 'APPLICATION_LOGS',
      destinations: [
        {
          destinationType: 'S3',
          outputFormats: ['json', 'plain'],
        },
      ],
      mandatoryFields: ['event_timestamp'],
    },
  ]);
});

test('does not assign logTypes if resource does not exist in Cloudformation', () => {
  importLogSources(
    db,
    [
      {
        LogType: 'SOME_LOGS',
        ResourceTypes: ['AWS::Missing::Type'],
        Destinations: [
          {
            DestinationType: 'S3',
            PermissionsVersion: 'V2',
            OutputFormat: [],
          },
        ],
        RecordFields: [],
      },
    ],
    report,
  );

  expect(report.totalCount).toEqual(1);
  expect(report);
});

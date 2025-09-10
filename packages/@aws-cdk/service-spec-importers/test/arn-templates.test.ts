import { emptyDatabase } from '@aws-cdk/service-spec-types';
import { ProblemReport } from '../src';
import { importArnTemplates } from '../src/importers/import-arn-templates';

let db: ReturnType<typeof emptyDatabase>;
let report: ProblemReport;
beforeEach(() => {
  db = emptyDatabase();
  report = new ProblemReport();
});

test('assigns arnTemplate when found', () => {
  db.allocate('resource', {
    cloudFormationType: 'AWS::S3::Bucket',
    attributes: {},
    name: 'Type',
    primaryIdentifier: ['BucketName'],
    properties: {
      MyProp: { type: { type: 'string' } },
    },
  });

  db.allocate('resource', {
    cloudFormationType: 'AWS::SagemakerGeospatial::EarthObservationJob',
    attributes: {},
    name: 'Type',
    properties: {
      MyProp: { type: { type: 'string' } },
    },
  });

  const arnFormatIndex = {
    'AWS::S3::Bucket': 'arn:${Partition}:s3:::${BucketName}',
    'AWS::SSMContacts::Contact': 'arn:${Partition}:ssm-contacts:${Region}:${Account}:contact/${ContactAlias}',
  };

  importArnTemplates(arnFormatIndex, db, report);

  expect(db.all('resource')).toEqual([
    {
      $id: '0',
      attributes: {},
      cloudFormationType: 'AWS::S3::Bucket',
      identifier: {
        $id: '2',
        arnTemplate: 'arn:${Partition}:s3:::${BucketName}',
      },
      primaryIdentifier: ['BucketName'],
      name: 'Type',
      properties: {
        MyProp: {
          type: {
            type: 'string',
          },
        },
      },
    },
    {
      // No arnTemplate here
      $id: '1',
      attributes: {},
      cloudFormationType: 'AWS::SagemakerGeospatial::EarthObservationJob',
      name: 'Type',
      properties: {
        MyProp: {
          type: {
            type: 'string',
          },
        },
      },
    },
  ]);

  expect(report.totalCount).toEqual(1);
  expect(report);
});

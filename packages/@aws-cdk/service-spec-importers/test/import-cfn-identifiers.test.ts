import { emptyDatabase, Resource } from '@aws-cdk/service-spec-types';
import { importCfnPrimaryIdentifierOverrides } from '../src/importers/import-cfn-primaryidentifier-overrides';

let db: ReturnType<typeof emptyDatabase>;
beforeEach(() => {
  db = emptyDatabase();
});

test('exercise the CFN identifier import flow', () => {
  db.allocate('resource', {
    cloudFormationType: 'AWS::S3::Bucket',
    attributes: {},
    name: 'Type',
    primaryIdentifier: ['BucketName'],
    properties: {
      MyProp: { type: { type: 'string' } },
    },
  });

  const overridesDocument = {
    'AWS::S3::Bucket': ['MyProp'],
  };

  importCfnPrimaryIdentifierOverrides(db, overridesDocument);

  const res = db.lookup('resource', 'cloudFormationType', 'equals', 'AWS::S3::Bucket').only();

  expect(res).toMatchObject({
    cfnRefIdentifier: ['MyProp'],
  } satisfies Partial<Resource>);
});

import { emptyDatabase } from '@aws-cdk/service-spec-types';
import { importCloudFormationRegistryResource } from '../src/import-cloudformation-registry';
import { ProblemReport } from '../src/report';

let db: ReturnType<typeof emptyDatabase>;
let report: ProblemReport;
beforeEach(() => {
  db = emptyDatabase();
  report = new ProblemReport();
});

test('include primaryIdentifier in database', () => {
  importCloudFormationRegistryResource({
    db,
    report,
    resource: {
      typeName: 'AWS::Some::Type',
      description: 'resource with PrimaryIdentifier',
      properties: {
        id: {
          type: 'string',
        },
        secondId: {
          type: 'string',
        },
        notId: {
          type: 'string',
        },
      },
      primaryIdentifier: ['/properties/id', '/properties/secondId'],
    },
  });

  // eslint-disable-next-line prettier/prettier
  const primaryIdentifier = db.lookup('resource', 'cloudFormationType', 'equals', 'AWS::Some::Type')[0]?.primaryIdentifier;
  expect(primaryIdentifier).toEqual(['id', 'secondId']);
});

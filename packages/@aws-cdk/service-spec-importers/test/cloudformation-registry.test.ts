import { emptyDatabase } from '@aws-cdk/service-spec-types';
import { importCloudFormationRegistryResource } from '../src/importers/import-cloudformation-registry';
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

test('deprecated properties', () => {
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
      },
      deprecatedProperties: ['/properties/id'],
    },
  });

  // eslint-disable-next-line prettier/prettier
  const resource = db.lookup('resource', 'cloudFormationType', 'equals', 'AWS::Some::Type').only();
  expect(resource.properties.id.deprecated).toBeDefined();
});

test('type definitions in deprecated properties do not fail', () => {
  importCloudFormationRegistryResource({
    db,
    report,
    resource: {
      typeName: 'AWS::Some::Type',
      description: 'resource with PrimaryIdentifier',
      properties: {
        id: { $ref: '#/definitions/Type' },
      },
      definitions: {
        Type: {
          type: 'object',
          properties: {
            id: {
              type: 'string',
            },
          },
        },
      },
      deprecatedProperties: ['/definitions/Type/properties/id'],
    },
  });

  // THEN: no failure
});

test('empty objects are treated as "any"', () => {
  importCloudFormationRegistryResource({
    db,
    report,
    resource: {
      typeName: 'AWS::Some::Type',
      description: 'resource with PrimaryIdentifier',
      properties: {
        id: { type: 'string' },
        data: {},
      },
    },
  });

  // THEN:
  const resource = db.lookup('resource', 'cloudFormationType', 'equals', 'AWS::Some::Type').only();
  expect(resource.properties.data.type).toEqual({ type: 'json' });
});

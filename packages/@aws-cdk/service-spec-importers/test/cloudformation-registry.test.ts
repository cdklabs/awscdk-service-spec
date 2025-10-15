import { emptyDatabase } from '@aws-cdk/service-spec-types';
import { importCloudFormationRegistryResource } from '../src/importers/import-cloudformation-registry';
import { ProblemReport } from '../src/report';
import { CloudFormationRegistryResource } from '../src/types';

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

test('relationshipRef extraction', () => {
  importCloudFormationRegistryResource({
    db,
    report,
    resource: {
      typeName: 'AWS::EC2::VPCEndpoint',
      description:
        'Specifies a VPC endpoint. A VPC endpoint provides a private connection between your VPC and an endpoint service.',
      properties: {
        SecurityGroupIds: {
          uniqueItems: true,
          description:
            'The IDs of the security groups to associate with the endpoint network interfaces. If this parameter is not specified, we use the default security group for the VPC. Security groups are supported only for interface endpoints.',
          insertionOrder: false,
          type: 'array',
          items: {
            anyOf: [
              {
                relationshipRef: {
                  typeName: 'AWS::EC2::SecurityGroup',
                  propertyPath: '/properties/GroupId',
                },
              },
              {
                relationshipRef: {
                  typeName: 'AWS::EC2::SecurityGroup',
                  propertyPath: '/properties/Id',
                },
              },
              {
                relationshipRef: {
                  typeName: 'AWS::EC2::VPC',
                  propertyPath: '/properties/DefaultSecurityGroup',
                },
              },
            ],
            type: 'string',
          },
        },
        SubnetIds: {
          type: 'array',
          items: {
            relationshipRef: {
              typeName: 'AWS::EC2::Subnet',
              propertyPath: '/properties/SubnetId',
            },
            type: 'string',
          },
        },
      },
    } as CloudFormationRegistryResource,
  });

  const resource = db.lookup('resource', 'cloudFormationType', 'equals', 'AWS::EC2::VPCEndpoint').only();

  // // Check array with anyOf relationships
  expect(resource.properties.SecurityGroupIds.relationshipRefs).toEqual([
    { cloudFormationType: 'AWS::EC2::SecurityGroup', propertyName: 'GroupId' },
    { cloudFormationType: 'AWS::EC2::SecurityGroup', propertyName: 'Id' },
    { cloudFormationType: 'AWS::EC2::VPC', propertyName: 'DefaultSecurityGroup' },
  ]);

  // Check simple array relationship
  expect(resource.properties.SubnetIds.relationshipRefs).toEqual([
    { cloudFormationType: 'AWS::EC2::Subnet', propertyName: 'SubnetId' },
  ]);
});

test('nested relationship extraction', () => {
  importCloudFormationRegistryResource({
    db,
    report,
    resource: {
      typeName: 'AWS::SomeService::SomeRsc',
      description: 'Some description',
      properties: {
        MyProp: {
          type: 'object',
          properties: {
            MyNestedProp: {
              type: 'string',
              anyOf: [
                {
                  relationshipRef: {
                    typeName: 'AWS::KMS::Key',
                    propertyPath: '/properties/Arn',
                  },
                },
                {
                  relationshipRef: {
                    typeName: 'AWS::KMS::Key',
                    propertyPath: '/properties/KeyId',
                  },
                },
              ],
            },
            MyOtherNestedProp: {
              type: 'string',
              relationshipRef: {
                typeName: 'AWS::KMS::Key',
                propertyPath: '/properties/Arn',
              },
            },
          },
        },
      },
    } as CloudFormationRegistryResource,
  });

  const resource = db.lookup('resource', 'cloudFormationType', 'equals', 'AWS::SomeService::SomeRsc').only();
  expect(resource.properties.MyProp.relationshipRefs).toBeUndefined();

  // AnyOf
  const propType = resource.properties.MyProp.type;
  expect(propType.type).toBe('ref');
  const type = db.get('typeDefinition', (propType as any).reference.$ref);
  expect(type.properties.MyNestedProp.relationshipRefs).toEqual([
    { cloudFormationType: 'AWS::KMS::Key', propertyName: 'Arn' },
    { cloudFormationType: 'AWS::KMS::Key', propertyName: 'KeyId' },
  ]);

  // Simple
  expect(type.properties.MyOtherNestedProp.relationshipRefs).toEqual([
    { cloudFormationType: 'AWS::KMS::Key', propertyName: 'Arn' },
  ]);
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

test('referring to non-exist type do not fail', () => {
  importCloudFormationRegistryResource({
    db,
    report,
    resource: {
      typeName: 'AWS::Some::Type',
      description: 'resource with property has type non exist',
      properties: {
        id: { $ref: '#/definitions/Type' },
        prop: { $ref: '#/definitions/NotExistType' },
        prop2: { $ref: '#/definitions/Type' },
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
    },
  });

  // THEN:
  const resource = db.lookup('resource', 'cloudFormationType', 'equals', 'AWS::Some::Type').only();
  expect(Object.keys(resource.properties)).toContain('id');
  expect(Object.keys(resource.properties)).toContain('prop2');
  expect(Object.keys(resource.properties)).not.toContain('prop');
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

import { emptyDatabase } from '@aws-cdk/service-spec-types';
import { importOobRelationships } from '../src/importers/import-oob-relationships';
import { ProblemReport } from '../src/report';
import { OobRelationshipData } from '../src/types';

let db: ReturnType<typeof emptyDatabase>;
let report: ProblemReport;

beforeEach(() => {
  db = emptyDatabase();
  report = new ProblemReport();

  const service = db.allocate('service', {
    name: 'aws-test',
    shortName: 'test',
    capitalized: 'Test',
    cloudFormationNamespace: 'AWS::Test',
  });

  const resource = db.allocate('resource', {
    cloudFormationType: 'AWS::Test::Resource',
    name: 'Resource',
    properties: {
      SimpleProperty: { type: { type: 'string' } },
      RoleArn: { type: { type: 'string' } },
    },
    attributes: {},
  });

  db.link('hasResource', service, resource);
});

test('adds relationship to simple property', () => {
  const relationshipData: OobRelationshipData = {
    'AWS::Test::Resource': {
      relationships: {
        RoleArn: [
          {
            cloudformationType: 'AWS::IAM::Role',
            propertyPath: 'Arn',
          },
        ],
      },
    },
  };

  importOobRelationships(db, relationshipData, report);

  const resource = db.lookup('resource', 'cloudFormationType', 'equals', 'AWS::Test::Resource').only();
  expect(resource.properties.RoleArn.relationshipRefs).toEqual([
    {
      cloudFormationType: 'AWS::IAM::Role',
      propertyName: 'Arn',
    },
  ]);
});

test('strips /properties/ prefix from attribute', () => {
  const relationshipData: OobRelationshipData = {
    'AWS::Test::Resource': {
      relationships: {
        RoleArn: [
          {
            cloudformationType: 'AWS::IAM::Role',
            propertyPath: '/properties/Arn',
          },
        ],
      },
    },
  };

  importOobRelationships(db, relationshipData, report);

  const resource = db.lookup('resource', 'cloudFormationType', 'equals', 'AWS::Test::Resource').only();
  expect(resource.properties.RoleArn.relationshipRefs).toEqual([
    {
      cloudFormationType: 'AWS::IAM::Role',
      propertyName: 'Arn',
    },
  ]);
});

test('handles nested properties', () => {
  const typeDef = db.allocate('typeDefinition', {
    name: 'Config',
    properties: {
      VpcId: { type: { type: 'string' } },
    },
  });

  const resource = db.lookup('resource', 'cloudFormationType', 'equals', 'AWS::Test::Resource').only();
  resource.properties.Configuration = {
    type: { type: 'ref', reference: { $ref: typeDef.$id } },
  };
  db.link('usesType', resource, typeDef);

  const relationshipData: OobRelationshipData = {
    'AWS::Test::Resource': {
      relationships: {
        'Configuration/VpcId': [
          {
            cloudformationType: 'AWS::EC2::VPC',
            propertyPath: 'VpcId',
          },
        ],
      },
    },
  };

  importOobRelationships(db, relationshipData, report);

  expect(typeDef.properties.VpcId.relationshipRefs).toEqual([
    {
      cloudFormationType: 'AWS::EC2::VPC',
      propertyName: 'VpcId',
    },
  ]);
});

test('handles array properties', () => {
  const typeDef = db.allocate('typeDefinition', {
    name: 'LoadBalancer',
    properties: {
      TargetGroupArn: { type: { type: 'string' } },
    },
  });

  const resource = db.lookup('resource', 'cloudFormationType', 'equals', 'AWS::Test::Resource').only();
  resource.properties.LoadBalancers = {
    type: {
      type: 'array',
      element: { type: 'ref', reference: { $ref: typeDef.$id } },
    },
  };
  db.link('usesType', resource, typeDef);

  const relationshipData: OobRelationshipData = {
    'AWS::Test::Resource': {
      relationships: {
        'LoadBalancers/TargetGroupArn': [
          {
            cloudformationType: 'AWS::ElasticLoadBalancingV2::TargetGroup',
            propertyPath: 'TargetGroupArn',
          },
        ],
      },
    },
  };

  importOobRelationships(db, relationshipData, report);

  expect(typeDef.properties.TargetGroupArn.relationshipRefs).toEqual([
    {
      cloudFormationType: 'AWS::ElasticLoadBalancingV2::TargetGroup',
      propertyName: 'TargetGroupArn',
    },
  ]);
});

test('deduplicates relationships', () => {
  const relationshipData: OobRelationshipData = {
    'AWS::Test::Resource': {
      relationships: {
        RoleArn: [
          {
            cloudformationType: 'AWS::IAM::Role',
            propertyPath: 'Arn',
          },
          {
            cloudformationType: 'AWS::IAM::Role',
            propertyPath: 'Arn',
          },
        ],
      },
    },
  };

  importOobRelationships(db, relationshipData, report);

  const resource = db.lookup('resource', 'cloudFormationType', 'equals', 'AWS::Test::Resource').only();
  expect(resource.properties.RoleArn.relationshipRefs).toEqual([
    {
      cloudFormationType: 'AWS::IAM::Role',
      propertyName: 'Arn',
    },
  ]);
});

test('handles multiple relationships', () => {
  const relationshipData: OobRelationshipData = {
    'AWS::Test::Resource': {
      relationships: {
        RoleArn: [
          {
            cloudformationType: 'AWS::IAM::Role',
            propertyPath: 'Arn',
          },
          {
            cloudformationType: 'AWS::IAM::Role',
            propertyPath: 'RoleId',
          },
        ],
      },
    },
  };

  importOobRelationships(db, relationshipData, report);

  const resource = db.lookup('resource', 'cloudFormationType', 'equals', 'AWS::Test::Resource').only();
  expect(resource.properties.RoleArn.relationshipRefs).toEqual([
    {
      cloudFormationType: 'AWS::IAM::Role',
      propertyName: 'Arn',
    },
    {
      cloudFormationType: 'AWS::IAM::Role',
      propertyName: 'RoleId',
    },
  ]);
});

test('applies relationship to previousTypes', () => {
  const resource = db.lookup('resource', 'cloudFormationType', 'equals', 'AWS::Test::Resource').only();
  resource.properties.RoleArn.previousTypes = [{ type: 'integer' }];

  const relationshipData: OobRelationshipData = {
    'AWS::Test::Resource': {
      relationships: {
        RoleArn: [
          {
            cloudformationType: 'AWS::IAM::Role',
            propertyPath: 'Arn',
          },
        ],
      },
    },
  };

  importOobRelationships(db, relationshipData, report);

  const updatedResource = db.lookup('resource', 'cloudFormationType', 'equals', 'AWS::Test::Resource').only();
  expect(updatedResource.properties.RoleArn.relationshipRefs).toEqual([
    {
      cloudFormationType: 'AWS::IAM::Role',
      propertyName: 'Arn',
    },
  ]);
});

test.each(['Tags/Value', 'Description', 'Something/Description'])('ignores relationship with %s suffix', (suffix) => {
  const relationshipData: OobRelationshipData = {
    'AWS::Test::Resource': {
      relationships: {
        [suffix]: [
          {
            cloudformationType: 'AWS::IAM::Role',
            propertyPath: '/properties/Arn',
          },
        ],
      },
    },
  };

  importOobRelationships(db, relationshipData, report);

  const resource = db.lookup('resource', 'cloudFormationType', 'equals', 'AWS::Test::Resource').only();
  expect(resource.properties.RoleArn.relationshipRefs).toBeUndefined();
});

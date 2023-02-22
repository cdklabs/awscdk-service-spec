import { emptyDatabase } from '@aws-cdk/service-spec';
import { Failures } from '@cdklabs/tskb';
import { readCloudFormationRegistryResource } from '../src/cloudformation-registry';

let db: ReturnType<typeof emptyDatabase>;
let fails: Failures;
beforeEach(() => {
  db = emptyDatabase();
  fails = [];
});

test('exclude readOnlyProperties from properties', () => {
  readCloudFormationRegistryResource({
    db,
    fails,
    resource: {
      description: 'Test resource',
      typeName: 'AWS::Some::Type',
      properties: {
        Property: { type: 'string' },
        Id: { type: 'string' },
      },
      readOnlyProperties: ['/properties/Id'],
    },
  });

  const propNames = Object.keys(
    db.lookup('resource', 'cloudFormationType', 'equals', 'AWS::Some::Type')[0]?.properties,
  );
  expect(propNames).toEqual(['Property']);
});

test('include readOnlyProperties in attributes', () => {
  readCloudFormationRegistryResource({
    db,
    fails,
    resource: {
      description: 'Test resource',
      typeName: 'AWS::Some::Type',
      properties: {
        Property: { type: 'string' },
        Id: { type: 'string' },
      },
      readOnlyProperties: ['/properties/Id'],
    },
  });

  const attrNames = Object.keys(
    db.lookup('resource', 'cloudFormationType', 'equals', 'AWS::Some::Type')[0]?.attributes,
  );
  expect(attrNames).toEqual(['Id']);
});

test('include legacy attributes in attributes', () => {
  readCloudFormationRegistryResource({
    db,
    fails,
    resource: {
      description: 'Test resource',
      typeName: 'AWS::Some::Type',
      properties: {
        Property: { type: 'string' },
        Id: { type: 'string' },
      },
      readOnlyProperties: ['/properties/Id'],
    },
    specResource: {
      Attributes: {
        Property: { PrimitiveType: 'String' },
      },
    },
  });

  const attrNames = Object.keys(
    db.lookup('resource', 'cloudFormationType', 'equals', 'AWS::Some::Type')[0]?.attributes,
  );
  expect(attrNames.sort()).toEqual(['Id', 'Property']);
});

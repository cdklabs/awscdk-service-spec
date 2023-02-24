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

test('reference types are correctly named', () => {
  readCloudFormationRegistryResource({
    db,
    fails,
    resource: {
      description: 'Test resource',
      typeName: 'AWS::Some::Type',
      definitions: {
        Property: {
          type: 'object',
          additionalProperties: false,
          properties: {
            Name: {
              type: 'string',
            },
          },
          required: ['Name'],
        },
      },
      properties: {
        PropertyList: {
          type: 'array',
          items: {
            $ref: '#/definitions/Property',
          },
        },
        PropertySingular: {
          $ref: '#/definitions/Property',
        },
        Id: { type: 'string' },
      },
      readOnlyProperties: ['/properties/Id'],
    },
  });

  const resource = db.lookup('resource', 'cloudFormationType', 'equals', 'AWS::Some::Type')[0];
  const types = db.follow('usesType', resource);

  expect(types.length).toBe(1);
  expect(types[0].to.name).toBe('Property');
});

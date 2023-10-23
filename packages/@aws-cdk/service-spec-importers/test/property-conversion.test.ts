import { PropertyType, emptyDatabase } from '@aws-cdk/service-spec-types';
import { importCloudFormationRegistryResource } from '../src/importers/import-cloudformation-registry';
import { ProblemReport } from '../src/report';

let db: ReturnType<typeof emptyDatabase>;
let report: ProblemReport;
beforeEach(() => {
  db = emptyDatabase();
  report = new ProblemReport();
});

test('exclude readOnlyProperties from properties', () => {
  importCloudFormationRegistryResource({
    db,
    report,
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

test("don't exclude readOnlyProperties from properties that are also createOnlyProperties", () => {
  importCloudFormationRegistryResource({
    db,
    report,
    resource: {
      description: 'Test resource',
      typeName: 'AWS::Some::Type',
      properties: {
        Id: { type: 'string' },
        ReplacementProperty: { type: 'string' },
      },
      readOnlyProperties: ['/properties/Id', '/properties/ReplacementProperty'],
      createOnlyProperties: ['/properties/ReplacementProperty'],
    },
  });

  const resource = db.lookup('resource', 'cloudFormationType', 'equals', 'AWS::Some::Type')[0];
  const propNames = Object.keys(resource?.properties);
  const attrNames = Object.keys(resource?.attributes);
  expect(propNames).toEqual(['ReplacementProperty']);
  expect(attrNames).toEqual(['Id']);
});

test('include readOnlyProperties in attributes', () => {
  importCloudFormationRegistryResource({
    db,
    report,
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

test('compound readOnlyProperties are included in attributes', () => {
  importCloudFormationRegistryResource({
    db,
    report,
    resource: {
      description: 'Test resource',
      typeName: 'AWS::Some::Type',
      properties: {
        CompoundProp: { $ref: '#/definitions/CompoundProp' },
      },
      definitions: {
        CompoundProp: {
          type: 'object',
          additionalProperties: false,
          properties: {
            Id: { type: 'string' },
            Property: { type: 'string' },
          },
        },
      },
      readOnlyProperties: [
        '/properties/CompoundProp',
        '/properties/CompoundProp/Id',
        '/properties/CompoundProp/Property',
      ],
    },
  });

  const attrNames = Object.keys(
    db.lookup('resource', 'cloudFormationType', 'equals', 'AWS::Some::Type')[0]?.attributes,
  );
  expect(attrNames).toEqual(['CompoundProp', 'CompoundProp.Id', 'CompoundProp.Property']);
});

test('anonymous types are named after their property', () => {
  importCloudFormationRegistryResource({
    db,
    report,
    resource: {
      description: 'Test resource',
      typeName: 'AWS::Some::Type',
      properties: {
        Banana: {
          type: 'object',
          properties: {
            color: { type: 'string' },
          },
          required: ['color'],
        },
      },
    },
  });

  const resource = db.lookup('resource', 'cloudFormationType', 'equals', 'AWS::Some::Type').only();
  const typeNames = db.follow('usesType', resource).map((x) => x.entity.name);
  expect(typeNames).toContain('Banana');
});

test('anonymous types in a collection are named after their property with "Items" appended', () => {
  importCloudFormationRegistryResource({
    db,
    report,
    resource: {
      description: 'Test resource',
      typeName: 'AWS::Some::Type',
      properties: {
        Bananas: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              color: { type: 'string' },
            },
            required: ['color'],
          },
        },
      },
    },
  });

  const resource = db.lookup('resource', 'cloudFormationType', 'equals', 'AWS::Some::Type').only();
  const typeNames = db.follow('usesType', resource).map((x) => x.entity.name);
  expect(typeNames).toContain('BananasItems');
});

test('reference types are correctly named', () => {
  importCloudFormationRegistryResource({
    db,
    report,
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
  expect(types[0].entity.name).toBe('Property');
});

test('read required properties from allOf/anyOf', () => {
  importCloudFormationRegistryResource({
    db,
    report,
    resource: {
      typeName: 'AWS::Test::Resource',
      description: 'Test resource',
      properties: {
        Mutex1: { type: 'string' },
        Mutex2: { type: 'string' },
        InBoth: { type: 'string' },
      },
      additionalProperties: false,
      oneOf: [
        {
          required: ['Mutex1', 'InBoth'],
        },
        {
          required: ['Mutex2', 'InBoth'],
        },
      ],
    },
  });

  const resource = db.lookup('resource', 'cloudFormationType', 'equals', 'AWS::Test::Resource').only();
  const requiredProps = Object.entries(resource.properties)
    .filter(([_, value]) => value.required)
    .map(([name, _]) => name);
  expect(requiredProps).toContain('InBoth');
});

test('only object types get type definitions', () => {
  importCloudFormationRegistryResource({
    db,
    report,
    resource: {
      typeName: 'AWS::Test::Resource',
      description: 'Test resource',
      properties: {
        Prop1: { $ref: '#/definitions/Type1' },
        Prop2: { $ref: '#/definitions/Type2' },
        Prop3: { $ref: '#/definitions/Type3' },
      },
      additionalProperties: false,
      definitions: {
        Type1: { type: 'array', items: { type: 'string' } },
        Type2: { type: 'object' },
        Type3: {
          type: 'object',
          properties: {
            field: { type: 'string' },
          },
          additionalProperties: false,
        },
      },
    },
  });

  const resource = db.lookup('resource', 'cloudFormationType', 'equals', 'AWS::Test::Resource').only();
  const typeNames = db.follow('usesType', resource).map((e) => e.entity.name);
  expect(typeNames).toEqual(['Type3']);
  expect(resource.properties.Prop1.type).toEqual({ type: 'array', element: { type: 'string' } } satisfies PropertyType);
  expect(resource.properties.Prop2.type).toEqual({ type: 'json' });
});

test('import immutability', () => {
  importCloudFormationRegistryResource({
    db,
    report,
    resource: {
      typeName: 'AWS::Test::Resource',
      description: 'Test resource',
      properties: {
        Prop1: { type: 'string' },
        Prop2: { $ref: '#/definitions/Type1' },
        Prop3: {
          type: 'array',
          items: { $ref: '#/definitions/Type2' },
        },
      },
      additionalProperties: false,
      definitions: {
        Type1: {
          type: 'object',
          properties: {
            ImmutableField: { type: 'string' },
          },
          additionalProperties: false,
        },
        Type2: {
          type: 'object',
          properties: {
            ImmutableField: { type: 'string' },
          },
          additionalProperties: false,
        },
      },
      createOnlyProperties: [
        '/properties/Prop1',
        '/properties/Prop2/ImmutableField',
        '/properties/Prop3/*/ImmutableField',
      ],
    },
  });

  const resource = db.lookup('resource', 'cloudFormationType', 'equals', 'AWS::Test::Resource').only();
  const types = db.follow('usesType', resource).map((e) => e.entity);

  expect(resource.properties.Prop1.causesReplacement).toEqual('yes');
  for (const type of types) {
    expect(type.properties.ImmutableField.causesReplacement).toEqual('yes');
  }
});

test('import immutability on tags', () => {
  // Doesn't go on the type definition, but goes onto the resource instead
  importCloudFormationRegistryResource({
    db,
    report,
    resource: {
      typeName: 'AWS::Test::Resource',
      description: 'Test resource',
      properties: {
        Tags: {
          type: 'array',
          items: {
            $ref: '#/definitions/Tag',
          },
        },
      },
      additionalProperties: false,
      definitions: {
        Tag: {
          type: 'object',
          properties: {
            Key: { type: 'string' },
            Value: { type: 'string' },
          },
          required: ['Key', 'Value'],
          additionalProperties: false,
        },
      },
      createOnlyProperties: ['/properties/Tags/*/Key'],
    },
  });

  const resource = db.lookup('resource', 'cloudFormationType', 'equals', 'AWS::Test::Resource').only();
  expect(resource.additionalReplacementProperties).toEqual([['Tags', '*', 'Key']]);
});

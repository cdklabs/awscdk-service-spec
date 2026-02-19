import { PropertyType, emptyDatabase, DefinitionReference, ArrayType, TypeUnion } from '@aws-cdk/service-spec-types';
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

test('anyOf different types that exist in property with object type', async () => {
  importCloudFormationRegistryResource({
    db,
    report,
    resource: {
      typeName: 'AWS::anyOf::Required',
      description: 'Resource Type Description',
      properties: {
        DataSourceConfiguration: {
          description: 'description',
          type: 'object',
          anyOf: [
            {
              description: 'Empty Error object.',
              type: 'object',
              additionalProperties: false,
            },
            {
              description: 'Key Value',
              type: 'object',
              additionalProperties: false,
              properties: {
                Key: {
                  type: 'string',
                },
                Value: {
                  type: 'string',
                  enum: ['v1', 'v2'],
                },
              },
              required: ['Key', 'Value'],
            },
            {
              description: 'Key Value 2',
              type: 'object',
              additionalProperties: false,
              title: 'KV2',
              properties: {
                Key2: {
                  type: 'string',
                },
                Value2: {
                  type: 'string',
                  enum: ['v1', 'v2'],
                },
              },
              required: ['Key2', 'Value2'],
            },
          ],
          additionalProperties: false,
        },
      },
    },
  });

  const resource = db.lookup('resource', 'cloudFormationType', 'equals', 'AWS::anyOf::Required').only();
  expect(Object.keys(resource.properties)).toContain('DataSourceConfiguration');

  const prop = resource.properties?.DataSourceConfiguration;
  expect(prop.type.type).toBe('union');

  expect((prop.type as { types: DefinitionReference[] }).types[0].type).toBe('json');
  const type = db.get('typeDefinition', (prop.type as { types: DefinitionReference[] }).types[1].reference.$ref);
  expect(Object.keys(type.properties).length).toBe(4);
});

test('anyOf different types that exist in patternProperties', async () => {
  importCloudFormationRegistryResource({
    db,
    report,
    resource: {
      typeName: 'AWS::anyOf::Required',
      description: 'Resource Type Description',
      properties: {
        DataSourceConfiguration: {
          description: 'description',
          type: 'object',
          patternProperties: {
            '^[a-zA-Z0-9]+$': {
              anyOf: [
                {
                  type: 'string',
                },
                {
                  type: 'integer',
                },
              ],
            },
          },
          additionalProperties: false,
        },
      },
    },
  });

  const resource = db.lookup('resource', 'cloudFormationType', 'equals', 'AWS::anyOf::Required').only();
  expect(Object.keys(resource.properties)).toContain('DataSourceConfiguration');
});

test('same property but different one of types', async () => {
  importCloudFormationRegistryResource({
    db,
    report,
    resource: {
      typeName: 'AWS::oneOf::Required',
      description: 'Resource Type Description',
      properties: {
        DataSourceConfiguration: {
          description: 'description',
          type: 'object',
          properties: {
            foo: {
              oneOf: [
                {
                  type: 'string',
                },
                {
                  type: 'array',
                },
              ],
            },
          },
          additionalProperties: false,
        },
      },
    },
  });

  const resource = db.lookup('resource', 'cloudFormationType', 'equals', 'AWS::oneOf::Required').only();
  expect(Object.keys(resource.properties)).toContain('DataSourceConfiguration');
  const prop = resource.properties?.DataSourceConfiguration;

  const type = db.get('typeDefinition', (prop.type as DefinitionReference).reference.$ref);
  expect(type.name).toEqual('DataSourceConfiguration');
  expect(type.properties.foo.type.type).toBe('union');
  expect((type.properties.foo.type as TypeUnion<any>).types.length).toBe(2);
});

test('same property name but different types', async () => {
  importCloudFormationRegistryResource({
    db,
    report,
    resource: {
      typeName: 'AWS::oneOf::Required',
      description: 'Resource Type Description',
      properties: {
        DataSourceConfiguration: {
          oneOf: [
            {
              description: 'description',
              type: 'object',
              properties: {
                foo: {
                  type: 'array',
                },
              },
              additionalProperties: false,
            },
            {
              description: 'description',
              type: 'object',
              properties: {
                foo: {
                  type: 'string',
                },
              },
              additionalProperties: false,
            },
          ],
        },
      },
    },
  });

  const resource = db.lookup('resource', 'cloudFormationType', 'equals', 'AWS::oneOf::Required').only();
  expect(Object.keys(resource.properties)).toContain('DataSourceConfiguration');
  const prop = resource.properties?.DataSourceConfiguration;

  const type = db.get('typeDefinition', (prop.type as DefinitionReference).reference.$ref);
  expect(type.name).toEqual('DataSourceConfiguration');
  expect(type.properties.foo.type.type).toBe('array');
});

test('oneOf typed objects with property ref a definition', async () => {
  importCloudFormationRegistryResource({
    db,
    report,
    resource: {
      typeName: 'AWS::oneOf::Required',
      description: 'Resource Type Description',
      definitions: {
        ResourceConfigurationDefinition: {
          oneOf: [
            {
              additionalProperties: false,
              type: 'object',
              title: 'IpResource',
              properties: {
                IpResource: {
                  $ref: '#/definitions/IpResource',
                },
              },
              required: ['IpResource'],
            },
            {
              additionalProperties: false,
              type: 'object',
              title: 'ArnResource',
              properties: {
                ArnResource: {
                  $ref: '#/definitions/ArnResource',
                },
              },
              required: ['ArnResource'],
            },
            {
              additionalProperties: false,
              type: 'object',
              title: 'DnsResource',
              properties: {
                DnsResource: {
                  $ref: '#/definitions/DnsResource',
                },
              },
              required: ['DnsResource'],
            },
          ],
          type: 'object',
        },
        IpResource: {
          minLength: 4,
          type: 'string',
          maxLength: 39,
        },
        PortRange: {
          minLength: 1,
          pattern: '^((\\d{1,5}\\-\\d{1,5})|(\\d+))$',
          type: 'string',
          maxLength: 11,
        },
        DnsResource: {
          additionalProperties: false,
          type: 'object',
          properties: {
            IpAddressType: {
              type: 'string',
              enum: ['IPV4', 'IPV6', 'DUALSTACK'],
            },
            DomainName: {
              minLength: 3,
              type: 'string',
              maxLength: 255,
            },
          },
          required: ['DomainName', 'IpAddressType'],
        },
        ArnResource: {
          pattern: '^arn:[a-z0-9][-.a-z0-9]{0,62}:vpc-lattice:([a-z0-9][-.a-z0-9]{0,62})?:\\d{12}?:[^/].{0,1023}$',
          type: 'string',
          maxLength: 1224,
        },
      },
      properties: {
        ResourceConfigurationDefinition: {
          $ref: '#/definitions/ResourceConfigurationDefinition',
        },
      },
    },
  });

  const resource = db.lookup('resource', 'cloudFormationType', 'equals', 'AWS::oneOf::Required').only();
  expect(Object.keys(resource.properties)).toContain('ResourceConfigurationDefinition');
  const prop = resource.properties?.ResourceConfigurationDefinition;
  expect(prop.type.type).toBe('ref');

  const type = db.get('typeDefinition', (prop.type as DefinitionReference).reference.$ref);
  expect(type.name).toBe('ResourceConfigurationDefinition');
  expect(Object.keys(type.properties).length).toBe(3);
  expect(type.properties.IpResource.required).toBe(undefined);
});

test('oneOf typed objects with one of in properties', async () => {
  importCloudFormationRegistryResource({
    db,
    report,
    resource: {
      typeName: 'AWS::oneOf::Required',
      description: 'Resource Type Description',
      definitions: {
        IpResource: {
          minLength: 4,
          type: 'string',
          maxLength: 39,
        },
        PortRange: {
          minLength: 1,
          pattern: '^((\\d{1,5}\\-\\d{1,5})|(\\d+))$',
          type: 'string',
          maxLength: 11,
        },
        DnsResource: {
          additionalProperties: false,
          type: 'object',
          properties: {
            IpAddressType: {
              type: 'string',
              enum: ['IPV4', 'IPV6', 'DUALSTACK'],
            },
            DomainName: {
              minLength: 3,
              type: 'string',
              maxLength: 255,
            },
          },
          required: ['DomainName', 'IpAddressType'],
        },
        ArnResource: {
          pattern: '^arn:[a-z0-9][-.a-z0-9]{0,62}:vpc-lattice:([a-z0-9][-.a-z0-9]{0,62})?:\\d{12}?:[^/].{0,1023}$',
          type: 'string',
          maxLength: 1224,
        },
      },
      properties: {
        ResourceConfigurationDefinition: {
          oneOf: [
            {
              additionalProperties: false,
              type: 'object',
              title: 'IpResource',
              properties: {
                IpResource: {
                  $ref: '#/definitions/IpResource',
                },
              },
              required: ['IpResource'],
            },
            {
              additionalProperties: false,
              type: 'object',
              title: 'ArnResource',
              properties: {
                ArnResource: {
                  $ref: '#/definitions/ArnResource',
                },
              },
              required: ['ArnResource'],
            },
            {
              additionalProperties: false,
              type: 'object',
              title: 'DnsResource',
              properties: {
                DnsResource: {
                  $ref: '#/definitions/DnsResource',
                },
              },
              required: ['DnsResource'],
            },
          ],
          type: 'object',
        },
      },
    },
  });

  const resource = db.lookup('resource', 'cloudFormationType', 'equals', 'AWS::oneOf::Required').only();
  expect(Object.keys(resource.properties)).toContain('ResourceConfigurationDefinition');
  const prop = resource.properties?.ResourceConfigurationDefinition;
  expect(prop.type.type).toBe('ref');

  const type = db.get('typeDefinition', (prop.type as DefinitionReference).reference.$ref);
  expect(type.name).toBe('ResourceConfigurationDefinition');
  expect(Object.keys(type.properties).length).toBe(3);
  expect(type.properties.IpResource.required).toBe(undefined);
});

test('oneOf typed objects with oneof in definition', async () => {
  importCloudFormationRegistryResource({
    db,
    report,
    resource: {
      typeName: 'AWS::OneOf::Test',
      description: 'desc',
      definitions: {
        CanInterface: {
          type: 'object',
          properties: {
            Name: {
              type: 'string',
              maxLength: 100,
              minLength: 1,
            },
            ProtocolName: {
              type: 'string',
              maxLength: 50,
              minLength: 1,
            },
            ProtocolVersion: {
              type: 'string',
              maxLength: 50,
              minLength: 1,
            },
          },
          required: ['Name'],
          additionalProperties: false,
        },
        CanNetworkInterface: {
          type: 'object',
          properties: {
            InterfaceId: {
              type: 'string',
              maxLength: 50,
              minLength: 1,
            },
            Type: {
              type: 'string',
              enum: ['CAN_INTERFACE'],
            },
            CanInterface: {
              $ref: '#/definitions/CanInterface',
            },
          },
          required: ['InterfaceId', 'Type', 'CanInterface'],
          additionalProperties: false,
        },
        ObdNetworkInterface: {
          type: 'object',
          properties: {
            InterfaceId: {
              type: 'string',
              maxLength: 50,
              minLength: 1,
            },
            Type: {
              type: 'string',
              enum: ['OBD_INTERFACE'],
            },
            ObdInterface: {
              $ref: '#/definitions/ObdInterface',
            },
          },
          required: ['InterfaceId', 'Type', 'ObdInterface'],
          additionalProperties: false,
        },
        ObdInterface: {
          type: 'object',
          properties: {
            Name: {
              type: 'string',
              maxLength: 100,
              minLength: 1,
            },
          },
          required: ['Name'],
          additionalProperties: false,
        },
        CustomDecodingNetworkInterface: {
          type: 'object',
          properties: {
            InterfaceId: {
              type: 'string',
              maxLength: 50,
              minLength: 1,
            },
            Type: {
              type: 'string',
              enum: ['CUSTOM_DECODING_INTERFACE'],
            },
            CustomDecodingInterface: {
              $ref: '#/definitions/CustomDecodingInterface',
            },
          },
          required: ['InterfaceId', 'Type', 'CustomDecodingInterface'],
          additionalProperties: false,
        },
      },
      properties: {
        NetworkInterfaces: {
          insertionOrder: false,
          type: 'array',
          items: {
            oneOf: [
              {
                $ref: '#/definitions/CanNetworkInterface',
              },
              {
                $ref: '#/definitions/ObdNetworkInterface',
              },
              {
                $ref: '#/definitions/CustomDecodingNetworkInterface',
              },
            ],
          },
          maxItems: 5000,
          minItems: 1,
        },
      },
    },
  });

  const resource = db.lookup('resource', 'cloudFormationType', 'equals', 'AWS::OneOf::Test').only();
  expect(Object.keys(resource.properties)).toContain('NetworkInterfaces');
  const prop = resource.properties?.NetworkInterfaces;
  expect(prop.type.type).toBe('array');

  const type = db.get(
    'typeDefinition',
    ((prop.type as ArrayType<any>).element as { types: DefinitionReference[] }).types[0].reference.$ref,
  );
  expect(type.name).toBe('CanNetworkInterface');
  expect(Object.keys(type.properties).length).toBe(3);
  expect(type.properties.InterfaceId.required).toBe(true);
});

test('anyOf containing a list of "required" properties and a required property', async () => {
  importCloudFormationRegistryResource({
    db,
    report,
    resource: {
      typeName: 'AWS::anyOf::Required',
      description: 'Resource Type Description',
      properties: {
        DataSourceConfiguration: {
          description: 'description',
          type: 'object',
          properties: {
            prop1: {
              description: 'prop1.',
              type: 'object',
              properties: {
                subprop1: {
                  type: 'string',
                },
                subprop2: {
                  type: 'integer',
                },
              },
              required: ['subprop1', 'subprop2'],
              additionalProperties: false,
            },
            prop2: {
              description: 'prop2 doc',
              type: 'object',
              properties: {
                subprop1: {
                  type: 'string',
                },
                subprop2: {
                  type: 'integer',
                },
              },
              required: ['subprop1', 'subprop2'],
              additionalProperties: false,
            },
          },
          anyOf: [
            {
              required: ['prop1'],
            },
            {
              required: ['prop2'],
            },
          ],
          additionalProperties: false,
        },
      },
    },
  });

  const resource = db.lookup('resource', 'cloudFormationType', 'equals', 'AWS::anyOf::Required').only();
  const requiredProps = Object.entries(resource.properties)
    .filter(([_, value]) => value.required)
    .map(([name, _]) => name);
  expect(requiredProps.length).toBe(0);
  expect(Object.keys(resource.properties)).toContain('DataSourceConfiguration');
});

test('properties are referring to some Enum type', async () => {
  importCloudFormationRegistryResource({
    db,
    report,
    resource: {
      typeName: 'AWS::anyOf::Required',
      description: 'Resource Type Description',
      definitions: {
        ref1Type: {
          type: 'string',
          enum: ['v1', 'v2'],
        },
      },
      properties: {
        DataSourceConfiguration: {
          description: 'description',
          type: 'object',
          properties: {
            prop1: {
              description: 'prop1.',
              type: 'object',
              properties: {
                subprop1: {
                  type: 'object',
                  $ref: '#/definitions/ref1Type',
                },
                subprop2: {
                  type: 'integer',
                },
              },
              required: ['subprop1', 'subprop2'],
              additionalProperties: false,
            },
            prop2: {
              description: 'prop2 doc',
              type: 'object',
              properties: {
                subprop1: {
                  type: 'object',
                  $ref: '#/definitions/ref1Type',
                },
                subprop2: {
                  type: 'integer',
                },
              },
              required: ['subprop1', 'subprop2'],
              additionalProperties: false,
            },
          },
          additionalProperties: false,
        },
      },
    },
  });

  const resource = db.lookup('resource', 'cloudFormationType', 'equals', 'AWS::anyOf::Required').only();
  const requiredProps = Object.entries(resource.properties)
    .filter(([_, value]) => value.required)
    .map(([name, _]) => name);
  expect(requiredProps.length).toBe(0);
  expect(Object.keys(resource.properties)).toContain('DataSourceConfiguration');
});

test('properties are referring to some Enum type and anyOf', async () => {
  importCloudFormationRegistryResource({
    db,
    report,
    resource: {
      typeName: 'AWS::anyOf::Required',
      description: 'Resource Type Description',
      definitions: {
        ref1Type: {
          type: 'string',
          enum: ['v1', 'v2'],
        },
      },
      properties: {
        DataSourceConfiguration: {
          description: 'description',
          type: 'object',
          properties: {
            prop1: {
              description: 'prop1.',
              type: 'object',
              properties: {
                subprop1: {
                  type: 'object',
                  $ref: '#/definitions/ref1Type',
                },
                subprop2: {
                  type: 'integer',
                },
              },
              required: ['subprop1', 'subprop2'],
              additionalProperties: false,
            },
            prop2: {
              description: 'prop2 doc',
              type: 'object',
              properties: {
                subprop1: {
                  type: 'object',
                  $ref: '#/definitions/ref1Type',
                },
                subprop2: {
                  type: 'integer',
                },
              },
              required: ['subprop1', 'subprop2'],
              additionalProperties: false,
            },
          },
          anyOf: [
            {
              required: ['prop1'],
            },
            {
              required: ['prop2'],
            },
          ],
          additionalProperties: false,
        },
      },
    },
  });

  const resource = db.lookup('resource', 'cloudFormationType', 'equals', 'AWS::anyOf::Required').only();
  const requiredProps = Object.entries(resource.properties)
    .filter(([_, value]) => value.required)
    .map(([name, _]) => name);
  expect(requiredProps.length).toBe(0);
  expect(Object.keys(resource.properties)).toContain('DataSourceConfiguration');
});

test('oneOf containing a list of "required" properties and a required property', async () => {
  importCloudFormationRegistryResource({
    db,
    report,
    resource: {
      typeName: 'AWS::OneOf::Required',
      description: 'Resource Type Description',
      definitions: {
        OneConfiguration: {
          type: 'object',
          properties: {
            Foo: { type: 'string' },
          },
        },
        AnotherConfiguration: {
          type: 'object',
          properties: {
            Bar: { type: 'string' },
          },
        },
        SomeConfigurationProp: {
          type: 'object',
          description: 'does something useful',
          properties: {
            Type: {
              $ref: '#/definitions/SomeType',
            },
            OneConfiguration: {
              $ref: '#/definitions/OneConfiguration',
            },
            AnotherConfiguration: {
              $ref: '#/definitions/AnotherConfiguration',
            },
          },
          required: ['Type'],
          oneOf: [{ required: ['OneConfiguration'] }, { required: ['AnotherConfiguration'] }],
          additionalProperties: false,
        },
        SomeType: {
          type: 'string',
          description: 'which config to use',
          enum: ['ONE', 'ANOTHERONE'],
        },
      },
      properties: {
        DataSourceConfiguration: {
          $ref: '#/definitions/SomeConfigurationProp',
        },
      },
    },
  });

  const resource = db.lookup('resource', 'cloudFormationType', 'equals', 'AWS::OneOf::Required').only();
  const requiredProps = Object.entries(resource.properties)
    .filter(([_, value]) => value.required)
    .map(([name, _]) => name);
  expect(requiredProps.length).toBe(0);
  expect(Object.keys(resource.properties)).toContain('DataSourceConfiguration');
});

test('mix of oneOf and anyOf in one property', async () => {
  importCloudFormationRegistryResource({
    db,
    report,
    resource: {
      typeName: 'AWS::OneOf::Required',
      description: 'Resource Type Description',
      properties: {
        DataSourceConfiguration: {
          type: 'object',
          properties: {
            prop1: {
              type: 'string',
            },
            prop2: {
              type: 'object',
              properties: {
                prop2prop1: {
                  type: 'string',
                },
                prop2prop2: {
                  type: 'string',
                },
                prop2prop3: {
                  type: 'string',
                },
              },
              oneOf: [
                {
                  required: ['prop2prop1'],
                },
                {
                  required: ['prop2prop2'],
                },
                {
                  required: ['prop2prop3'],
                },
              ],
            },
            prop3: {
              type: 'number',
            },
          },
          anyOf: [
            {
              required: ['prop1', 'prop2'],
            },
            {
              required: ['prop1', 'prop3'],
            },
          ],
        },
      },
    },
  });

  const resource = db.lookup('resource', 'cloudFormationType', 'equals', 'AWS::OneOf::Required').only();
  expect(Object.keys(resource.properties)).toContain('DataSourceConfiguration');
  expect(db.all('typeDefinition').length).toBe(2);
});

test('oneOf with only a reference', () => {
  importCloudFormationRegistryResource({
    db,
    report,
    resource: {
      typeName: 'AWS::OneOf::RefOnly',
      description: 'Resource Type Description',
      definitions: {
        OneOfRef1: {
          type: 'object',
          properties: {
            Foo: { type: 'string' },
          },
        },
        OneOfRef2: {
          type: 'object',
          properties: {
            Bar: { type: 'string' },
          },
        },
      },
      properties: {
        OneOfRef: {
          insertionOrder: false,
          type: 'array',
          items: {
            oneOf: [
              {
                $ref: '#/definitions/OneOfRef1',
              },
              {
                $ref: '#/definitions/OneOfRef2',
              },
            ],
          },
          maxItems: 500,
          minItems: 1,
        },
      },
    },
  });

  const resource = db.lookup('resource', 'cloudFormationType', 'equals', 'AWS::OneOf::RefOnly').only();
  const requiredProps = Object.entries(resource.properties)
    .filter(([_, value]) => value.required)
    .map(([name, _]) => name);
  expect(Object.keys(resource.properties)).toContain('OneOfRef');
  expect(requiredProps.length).toBe(0);
});

test('oneOf with only a type definition', () => {
  importCloudFormationRegistryResource({
    db,
    report,
    resource: {
      typeName: 'AWS::Foo::Bar',
      description: 'Definition of AWS::Foo::Bar Resource Type',
      definitions: {
        FooOrBar: {
          oneOf: [
            {
              additionalProperties: false,
              type: 'object',
              properties: {
                Foo: {
                  type: 'boolean',
                },
              },
            },
            {
              additionalProperties: false,
              type: 'object',
              properties: {
                Bar: {
                  type: 'boolean',
                },
              },
            },
          ],
        },
      },
      properties: {
        FooOrBar: {
          minItems: 1,
          maxItems: 1,
          insertionOrder: false,
          type: 'array',
          items: {
            $ref: '#/definitions/FooOrBar',
          },
        },
      },
      additionalProperties: false,
    },
  });

  const resource = db.lookup('resource', 'cloudFormationType', 'equals', 'AWS::Foo::Bar').only();
  const requiredProps = Object.entries(resource.properties)
    .filter(([_, value]) => value.required)
    .map(([name, _]) => name);
  expect(Object.keys(resource.properties)).toContain('FooOrBar');
  expect(requiredProps.length).toBe(0);
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

test('string enum values are preserved as allowedValues', () => {
  importCloudFormationRegistryResource({
    db,
    report,
    resource: {
      description: 'Test resource',
      typeName: 'AWS::Some::Type',
      properties: {
        Status: { type: 'string', enum: ['Enabled', 'Disabled'] },
        Name: { type: 'string' },
      },
    },
  });

  const resource = db.lookup('resource', 'cloudFormationType', 'equals', 'AWS::Some::Type').only();
  expect(resource.properties.Status.type).toEqual({ type: 'string', allowedValues: ['Enabled', 'Disabled'] });
  expect(resource.properties.Name.type).toEqual({ type: 'string' });
});

test('integer enum values are preserved as allowedValues', () => {
  importCloudFormationRegistryResource({
    db,
    report,
    resource: {
      description: 'Test resource',
      typeName: 'AWS::Some::Type',
      properties: {
        Port: { type: 'integer', enum: [80, 443] },
      },
    },
  });

  const resource = db.lookup('resource', 'cloudFormationType', 'equals', 'AWS::Some::Type').only();
  expect(resource.properties.Port.type).toEqual({ type: 'integer', allowedValues: [80, 443] });
});

test('allowedValues are merged when re-importing a string property', () => {
  // First import without enum
  importCloudFormationRegistryResource({
    db,
    report,
    resource: {
      description: 'Test resource',
      typeName: 'AWS::Some::Type',
      properties: {
        Status: { type: 'string' },
      },
    },
  });

  // Second import with enum
  importCloudFormationRegistryResource({
    db,
    report,
    resource: {
      description: 'Test resource',
      typeName: 'AWS::Some::Type',
      properties: {
        Status: { type: 'string', enum: ['Enabled', 'Disabled'] },
      },
    },
  });

  const resource = db.lookup('resource', 'cloudFormationType', 'equals', 'AWS::Some::Type').only();
  expect(resource.properties.Status.type).toEqual({ type: 'string', allowedValues: ['Enabled', 'Disabled'] });
  expect(resource.properties.Status.previousTypes).toBeUndefined();
});

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

test('oneOf with only a type definition', () => {
  importCloudFormationRegistryResource({
    db,
    report,
    resource: {
      typeName: 'AWS::OneOf::TypeOnly',
      description: 'Resource Type Description',
      definitions: {},
      properties: {
        TypeOnly: {
          type: 'object',
          properties: {
            TypeOneOf1: {
              type: 'object',
              oneOf: [
                {
                  type: 'object',
                  properties: {
                    Foo: { type: 'string' },
                  },
                },
                {
                  type: 'object',
                  properties: {
                    Bar: { type: 'string' },
                  },
                },
              ],
            },
          },
          additionalProperties: false,
        },
      },
    },
  });

  const resource = db.lookup('resource', 'cloudFormationType', 'equals', 'AWS::OneOf::TypeOnly').only();
  const requiredProps = Object.entries(resource.properties)
    .filter(([_, value]) => value.required)
    .map(([name, _]) => name);
  expect(Object.keys(resource.properties)).toContain('TypeOnly');
  expect(requiredProps.length).toBe(0);
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
  //expect(Object.keys(resource.properties)).toContain('OneOfRef');
  expect(requiredProps.length).toBe(0);
});

test('schemas with arrays as types do not break', () => {
  importCloudFormationRegistryResource({
    db,
    report,
    resource: {
      typeName: 'AWS::IoTFleetWise::Campaign',
      description: 'Definition of AWS::IoTFleetWise::Campaign Resource Type',
      definitions: {
        Compression: {
          type: 'string',
          enum: ['OFF', 'SNAPPY'],
          default: 'OFF',
        },
        DataDestinationConfig: {
          oneOf: [
            {
              additionalProperties: false,
              type: 'object',
              title: 'S3Config',
              properties: {
                S3Config: {
                  $ref: '#/definitions/S3Config',
                },
              },
              required: ['S3Config'],
            },
            {
              additionalProperties: false,
              type: 'object',
              title: 'TimestreamConfig',
              properties: {
                TimestreamConfig: {
                  $ref: '#/definitions/TimestreamConfig',
                },
              },
              required: ['TimestreamConfig'],
            },
          ],
        },
        S3Config: {
          additionalProperties: false,
          type: 'object',
          properties: {
            BucketArn: {
              maxLength: 100,
              type: 'string',
              pattern: '^arn:(aws[a-zA-Z0-9-]*):s3:::.+$',
              minLength: 16,
            },
            DataFormat: {
              $ref: '#/definitions/DataFormat',
            },
            StorageCompressionFormat: {
              $ref: '#/definitions/StorageCompressionFormat',
            },
            Prefix: {
              maxLength: 512,
              type: 'string',
              pattern: "^[a-zA-Z0-9-_:./!*'()]+$",
              minLength: 1,
            },
          },
          required: ['BucketArn'],
        },
        TimestreamConfig: {
          additionalProperties: false,
          type: 'object',
          properties: {
            TimestreamTableArn: {
              maxLength: 2048,
              type: 'string',
              pattern:
                '^arn:(aws[a-zA-Z0-9-]*):timestream:[a-zA-Z0-9-]+:[0-9]{12}:database\\/[a-zA-Z0-9_.-]+\\/table\\/[a-zA-Z0-9_.-]+$',
              minLength: 20,
            },
            ExecutionRoleArn: {
              maxLength: 2048,
              type: 'string',
              pattern:
                '^arn:(aws[a-zA-Z0-9-]*):iam::(\\d{12})?:(role((\\u002F)|(\\u002F[\\u0021-\\u007F]+\\u002F))[\\w+=,.@-]+)$',
              minLength: 20,
            },
          },
          required: ['TimestreamTableArn', 'ExecutionRoleArn'],
        },
        DataFormat: {
          type: 'string',
          enum: ['JSON', 'PARQUET'],
        },
        StorageCompressionFormat: {
          type: 'string',
          enum: ['NONE', 'GZIP'],
        },
      },
      properties: {
        Description: {
          minLength: 1,
          pattern: '^[^\\u0000-\\u001F\\u007F]+$',
          type: 'string',
          maxLength: 2048,
        },
        DataDestinationConfigs: {
          minItems: 1,
          maxItems: 1,
          insertionOrder: false,
          type: 'array',
          items: {
            $ref: '#/definitions/DataDestinationConfig',
          },
        },
      },
      additionalProperties: false,
    },
  });

  const resource = db.lookup('resource', 'cloudFormationType', 'equals', 'AWS::IoTFleetWise::Campaign').only();
  const requiredProps = Object.entries(resource.properties)
    .filter(([_, value]) => value.required)
    .map(([name, _]) => name);
  //report.write('foobar');
  expect(Object.keys(resource.properties)).toContain('DataDestinationConfigs');
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

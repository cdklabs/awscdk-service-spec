import { emptyDatabase, Property, PropertyType } from '@aws-cdk/service-spec-types';
import {
  importCloudFormationRegistryResource,
  LoadCloudFormationRegistryResourceOptions,
} from '../src/importers/import-cloudformation-registry';
import { ResourceSpecImporter } from '../src/importers/import-resource-spec';
import { ProblemReport } from '../src/report';
import { resourcespec } from '../src/types';

let db: ReturnType<typeof emptyDatabase>;
let report: ProblemReport;
beforeEach(() => {
  db = emptyDatabase();
  report = new ProblemReport();
});

const RESOURCE = 'AWS::Some::Type';

test('importing two different properties shows up both', () => {
  const resource = importBoth({
    spec: {
      Properties: {
        Prop1: { PrimitiveType: 'String', UpdateType: 'Mutable' },
      },
    },
    registry: {
      properties: {
        Prop2: { type: 'string' },
      },
    },
  });

  expect(Object.keys(resource.properties)).toEqual(['Prop1', 'Prop2']);
});

test('importing properties of compatible types leave them unchanged', () => {
  const resource = importBoth({
    spec: {
      Properties: {
        Prop1: { PrimitiveType: 'String', UpdateType: 'Mutable' },
      },
    },
    registry: {
      properties: {
        Prop1: { type: 'string' },
      },
    },
  });

  expect(resource.properties.Prop1.type).toEqual({ type: 'string' } satisfies PropertyType);
});

test('importing attributes of compatible types leave them unchanged', () => {
  const resource = importBoth({
    spec: {
      Attributes: {
        Attr1: { PrimitiveType: 'String' },
      },
    },
    registry: {
      properties: {
        Attr1: { type: 'string' },
      },
      readOnlyProperties: ['/properties/Attr1'],
    },
  });

  expect(resource.attributes.Attr1.type).toEqual({ type: 'string' } satisfies PropertyType);
});

test('importing properties of incompatible types leads to previousTypes', () => {
  const resource = importBoth({
    spec: {
      Properties: {
        Prop1: { PrimitiveType: 'Integer', UpdateType: 'Mutable' },
      },
    },
    registry: {
      properties: {
        Prop1: { type: 'string' },
      },
    },
  });

  expect(resource.properties.Prop1).toEqual(
    expect.objectContaining({
      type: { type: 'string' },
      previousTypes: [{ type: 'integer' }],
    } satisfies Partial<Property>),
  );
});

test('typing first as Json and then String leaves just String and nothing else', () => {
  // This behavior is an attempt to automatically discriminate between legitimate type evolution
  // and schema bugfixes (only for very specific cases).
  const resource = importBoth({
    spec: {
      Properties: {
        Prop1: { PrimitiveType: 'Json', UpdateType: 'Mutable' },
      },
    },
    registry: {
      properties: {
        Prop1: { type: 'string' },
      },
    },
  });

  expect(resource.properties.Prop1).toEqual(
    expect.objectContaining({
      type: { type: 'string' },
    } satisfies Partial<Property>),
  );
  expect(resource.properties.Prop1).not.toEqual(
    expect.objectContaining({
      previousTypes: expect.anything(),
    } satisfies Partial<Property>),
  );
});

test('importing string on top of date-time does nothing', () => {
  const resource = importBoth({
    spec: {
      Properties: {
        Prop1: { PrimitiveType: 'Timestamp', UpdateType: 'Mutable' },
      },
    },
    registry: {
      properties: {
        Prop1: { type: 'string' },
      },
    },
  });

  expect(resource.properties.Prop1).toEqual(
    expect.objectContaining({
      type: { type: 'date-time' },
    } satisfies Partial<Property>),
  );
});

test('importing attributes of incompatible types leads to previousTypes', () => {
  const resource = importBoth({
    spec: {
      Attributes: {
        Attr1: { PrimitiveType: 'Integer' },
      },
    },
    registry: {
      properties: {
        Attr1: { type: 'string' },
      },
      readOnlyProperties: ['/properties/Attr1'],
    },
  });

  expect(resource.attributes.Attr1).toEqual(
    expect.objectContaining({
      type: { type: 'string' },
      previousTypes: [{ type: 'integer' }],
    } satisfies Partial<Property>),
  );
});

test('required property can be made optional', () => {
  const resource = importBoth({
    spec: {
      Properties: {
        Prop1: { PrimitiveType: 'Integer', Required: true, UpdateType: 'Mutable' },
      },
    },
    registry: {
      properties: {
        Prop1: { type: 'string' },
      },
    },
  });

  expect(resource.properties.Prop1.required).toBeUndefined();
});

test('a prop+attr of the same name will not be overwritten', () => {
  const resource = importBoth({
    spec: {
      Properties: {
        Something: { PrimitiveType: 'String', UpdateType: 'Mutable' },
      },
      Attributes: {
        Something: { PrimitiveType: 'Integer' },
      },
    },
    registry: {
      properties: {
        Something: { type: 'object' },
      },
      readOnlyProperties: ['/properties/Something'],
    },
  });

  expect({ attribute: resource.attributes.Something }).toEqual({
    attribute: expect.objectContaining({
      type: { type: 'json' },
      previousTypes: [{ type: 'integer' }],
    }),
  });

  expect({ property: resource.properties.Something }).toEqual({
    property: expect.objectContaining({
      type: { type: 'string' },
    }),
  });
});

function importBoth(options: {
  spec: resourcespec.ResourceType;
  specTypes?: Record<string, resourcespec.PropertyType>;
  registry: Partial<LoadCloudFormationRegistryResourceOptions['resource']>;
}) {
  ResourceSpecImporter.importTypes({
    db,
    specification: {
      ResourceSpecificationVersion: '0',
      ResourceTypes: {
        [RESOURCE]: options.spec,
      },
      PropertyTypes: Object.fromEntries(
        Object.entries(options.specTypes ?? {}).map(([name, decl]) => [`${RESOURCE}.${name}`, decl]),
      ),
    },
  });
  importCloudFormationRegistryResource({
    db,
    report,
    resource: {
      description: 'Test resource',
      typeName: 'AWS::Some::Type',
      properties: {},
      ...options.registry,
    },
  });

  return db.lookup('resource', 'cloudFormationType', 'equals', 'AWS::Some::Type').only();
}

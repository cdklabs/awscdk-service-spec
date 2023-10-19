import { ProblemReport, resourcespec } from '@aws-cdk/service-spec-sources';
import { emptyDatabase, Property, PropertyType } from '@aws-cdk/service-spec-types';
import {
  importCloudFormationRegistryResource,
  LoadCloudFormationRegistryResourceOptions,
} from '../src/import-cloudformation-registry';
import { ResourceSpecImporter } from '../src/import-resource-spec';

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
      type: { type: 'string' },
      previousTypes: [{ type: 'date-time' }],
    } satisfies Partial<Property>),
  );
});

test('importing attributes of incompatible types leads to previousTypes', () => {
  const resource = importBoth({
    spec: {
      Attributes: {
        Attr1: { PrimitiveType: 'Timestamp' },
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
      previousTypes: [{ type: 'date-time' }],
    } satisfies Partial<Property>),
  );
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

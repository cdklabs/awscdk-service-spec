import { emptyDatabase, PropertyType, Resource, RichPropertyType, SpecDatabase } from '@aws-cdk/service-spec-types';
import { importCloudFormationRegistryResource } from '../src/importers/import-cloudformation-registry';
import { ResourceSpecImporter } from '../src/importers/import-resource-spec';
import { ProblemReport } from '../src/report';
import { CloudFormationRegistryResource, jsonschema, resourcespec } from '../src/types';

const RESOURCE = 'AWS::Some::Type';

let db: SpecDatabase;
beforeEach(() => {
  db = emptyDatabase();
});

test('a property takes the struct that CloudFormation renamed its struct to', () => {
  importLegacySpec({
    properties: { Settings: { Type: 'SettingsRequest', UpdateType: 'Mutable' } },
    types: { SettingsRequest: { Properties: { Url: { PrimitiveType: 'String', UpdateType: 'Mutable' } } } },
  });
  importRegistry({
    properties: { Settings: { $ref: '#/definitions/Settings' } },
    definitions: { Settings: object({ Url: { type: 'string' }, Port: { type: 'integer' } }) },
  });

  expect(history(resource().properties.Settings)).toEqual(['Settings']);
  expect(fieldNames('Settings')).toEqual(['Port', 'Url']);
});

test('two properties take the struct that CloudFormation merged their structs into', () => {
  importLegacySpec({
    properties: {
      First: { Type: 'FirstSettings', UpdateType: 'Mutable' },
      Second: { Type: 'SecondSettings', UpdateType: 'Mutable' },
    },
    types: {
      FirstSettings: { Properties: { Url: { PrimitiveType: 'String', UpdateType: 'Mutable' } } },
      SecondSettings: { Properties: { Name: { PrimitiveType: 'String', UpdateType: 'Mutable' } } },
    },
  });
  importRegistry({
    properties: { First: { $ref: '#/definitions/Settings' }, Second: { $ref: '#/definitions/Settings' } },
    definitions: { Settings: object({ Url: { type: 'string' }, Name: { type: 'string' } }) },
  });

  expect(history(resource().properties.First)).toEqual(['Settings']);
  expect(history(resource().properties.Second)).toEqual(['Settings']);
});

test('a renamed struct inside a list or a map is replaced', () => {
  importLegacySpec({
    properties: {
      Destinations: { Type: 'List', ItemType: 'DestinationRequest', UpdateType: 'Mutable' },
      Routes: { Type: 'Map', ItemType: 'RouteRequest', UpdateType: 'Mutable' },
    },
    types: {
      DestinationRequest: { Properties: { StreamName: { PrimitiveType: 'String', UpdateType: 'Mutable' } } },
      RouteRequest: { Properties: { Cidr: { PrimitiveType: 'String', UpdateType: 'Mutable' } } },
    },
  });
  importRegistry({
    properties: {
      Destinations: { type: 'array', items: { $ref: '#/definitions/Destination' } },
      Routes: { type: 'object', additionalProperties: { $ref: '#/definitions/Route' } },
    },
    definitions: {
      Destination: object({ StreamName: { type: 'string' }, Network: { type: 'string' } }),
      Route: object({ Cidr: { type: 'string' } }),
    },
  });

  expect(history(resource().properties.Destinations)).toEqual(['Array<Destination>']);
  expect(history(resource().properties.Routes)).toEqual(['Map<string, Route>']);
});

test('a field of a nested struct takes the struct that CloudFormation renamed its struct to', () => {
  importLegacySpec({
    properties: { Input: { Type: 'InputSettings', UpdateType: 'Mutable' } },
    types: {
      InputSettings: { Properties: { Filter: { Type: 'FilterSettingsRequest', UpdateType: 'Mutable' } } },
      FilterSettingsRequest: { Properties: { Level: { PrimitiveType: 'String', UpdateType: 'Mutable' } } },
    },
  });
  importRegistry({
    properties: { Input: { $ref: '#/definitions/InputSettings' } },
    definitions: {
      InputSettings: object({ Filter: { $ref: '#/definitions/FilterSettings' } }),
      FilterSettings: object({ Level: { type: 'string' }, Strength: { type: 'string' } }),
    },
  });

  expect(history(typeDefinition('InputSettings').properties.Filter)).toEqual(['FilterSettings']);
});

test('a struct of the legacy spec that CloudFormation renamed is no longer rendered', () => {
  importLegacySpec({
    properties: { Destinations: { Type: 'List', ItemType: 'DestinationRequest', UpdateType: 'Mutable' } },
    types: {
      DestinationRequest: { Properties: { Route: { Type: 'RouteRequest', UpdateType: 'Mutable' } } },
      RouteRequest: { Properties: { Cidr: { PrimitiveType: 'String', UpdateType: 'Mutable' } } },
    },
  });
  importRegistry({
    properties: { Destinations: { type: 'array', items: { $ref: '#/definitions/Destination' } } },
    definitions: {
      Destination: object({ Route: { $ref: '#/definitions/Route' } }),
      Route: object({ Cidr: { type: 'string' } }),
    },
  });

  expect(typeDefinition('DestinationRequest').mustRenderForBwCompat).toBeFalsy();
  expect(typeDefinition('RouteRequest').mustRenderForBwCompat).toBeFalsy();
  expect(referencedTypeNames()).toEqual(['Destination', 'Route']);
});

test('a struct that the legacy spec renders for backwards compatibility is no longer rendered once CloudFormation renames it', () => {
  // None of the legacy properties uses PodProperties, so the legacy spec renders it and the types it uses anyway
  importLegacySpec({
    properties: {},
    types: {
      PodProperties: { Properties: { Metadata: { Type: 'Metadata', UpdateType: 'Mutable' } } },
      Metadata: {
        Properties: {
          Labels: { Type: 'Labels', UpdateType: 'Mutable' },
          Owner: { Type: 'Owner', UpdateType: 'Mutable' },
        },
      },
      Labels: { Properties: { Name: { PrimitiveType: 'String', UpdateType: 'Mutable' } } },
      Owner: { Properties: { Name: { PrimitiveType: 'String', UpdateType: 'Mutable' } } },
      Unrelated: { Properties: { Owner: { Type: 'Owner', UpdateType: 'Mutable' } } },
    },
  });
  importRegistry({
    properties: { PodProperties: { $ref: '#/definitions/PodProperties' } },
    definitions: {
      PodProperties: object({ Metadata: { $ref: '#/definitions/EksMetadata' } }),
      EksMetadata: object({ Labels: { type: 'string' }, Namespace: { type: 'string' } }),
    },
  });

  expect(typeDefinition('Metadata').mustRenderForBwCompat).toBeFalsy();
  expect(typeDefinition('Labels').mustRenderForBwCompat).toBeFalsy();
  // Still used: PodProperties by a property, Unrelated for backwards compatibility, and Owner by Unrelated
  expect(typeDefinition('PodProperties').mustRenderForBwCompat).toBe(true);
  expect(typeDefinition('Unrelated').mustRenderForBwCompat).toBe(true);
  expect(typeDefinition('Owner').mustRenderForBwCompat).toBe(true);
});

test('other type changes keep the oldest type first', () => {
  importLegacySpec({
    properties: {
      Policy: { PrimitiveType: 'Json', UpdateType: 'Mutable' },
      Settings: { Type: 'Settings', UpdateType: 'Mutable' },
      Count: { PrimitiveType: 'Integer', UpdateType: 'Mutable' },
      Choice: { Type: 'ChoiceRequest', UpdateType: 'Mutable' },
      Single: { Type: 'SingleRequest', UpdateType: 'Mutable' },
    },
    types: {
      Settings: { Properties: { Url: { PrimitiveType: 'String', UpdateType: 'Mutable' } } },
      ChoiceRequest: { Properties: { Url: { PrimitiveType: 'String', UpdateType: 'Mutable' } } },
      SingleRequest: { Properties: { Url: { PrimitiveType: 'String', UpdateType: 'Mutable' } } },
    },
  });
  importRegistry({
    properties: {
      Policy: { $ref: '#/definitions/Policy' },
      Settings: {},
      Count: { type: 'number' },
      Choice: { oneOf: [{ $ref: '#/definitions/Choice' }, { type: 'string' }] },
      Single: { type: 'array', items: { $ref: '#/definitions/Single' } },
    },
    definitions: {
      Policy: object({ Statement: { type: 'string' } }),
      Choice: object({ Url: { type: 'string' } }),
      Single: object({ Url: { type: 'string' } }),
    },
  });

  const props = resource().properties;
  expect(history(props.Policy)).toEqual(['json', 'Policy']);
  expect(history(props.Settings)).toEqual(['Settings', 'json']);
  expect(history(props.Count)).toEqual(['integer', 'number']);
  expect(history(props.Choice)).toEqual(['ChoiceRequest', 'Choice | string']);
  expect(history(props.Single)).toEqual(['SingleRequest', 'Array<Single>']);
});

describe('when regions disagree on the struct of a property', () => {
  const legacy = {
    properties: { Settings: { Type: 'SettingsRequest', UpdateType: 'Mutable' as const } },
    types: { SettingsRequest: { Properties: { Url: { PrimitiveType: 'String', UpdateType: 'Mutable' as const } } } },
  };
  const renamed: Partial<CloudFormationRegistryResource> = {
    properties: { Settings: { $ref: '#/definitions/Settings' } },
    definitions: { Settings: object({ Url: { type: 'string' }, Port: { type: 'integer' } }) },
  };
  const notRenamed: Partial<CloudFormationRegistryResource> = {
    properties: { Settings: { $ref: '#/definitions/SettingsRequest' } },
    definitions: { SettingsRequest: object({ Url: { type: 'string' } }) },
  };

  test('the struct of the region imported last wins when the first region renamed it', () => {
    importLegacySpec(legacy);
    importRegistry(renamed, 'us-east-1');
    importRegistry(notRenamed, 'us-west-2');

    expect(history(resource().properties.Settings)).toEqual(['SettingsRequest']);
  });

  test('the struct of the region imported last wins when the last region renamed it', () => {
    importLegacySpec(legacy);
    importRegistry(notRenamed, 'us-east-1');
    importRegistry(renamed, 'us-west-2');

    expect(history(resource().properties.Settings)).toEqual(['Settings']);
  });
});

function importLegacySpec(options: {
  properties: Record<string, resourcespec.Property>;
  types: Record<string, resourcespec.PropertyType>;
}) {
  ResourceSpecImporter.importTypes({
    db,
    specification: {
      ResourceSpecificationVersion: '0',
      ResourceTypes: { [RESOURCE]: { Properties: options.properties } },
      PropertyTypes: Object.fromEntries(
        Object.entries(options.types).map(([name, decl]) => [`${RESOURCE}.${name}`, decl]),
      ),
    },
  });
}

function importRegistry(schema: Partial<CloudFormationRegistryResource>, region?: string) {
  importCloudFormationRegistryResource({
    db,
    report: new ProblemReport(),
    region,
    resource: {
      typeName: RESOURCE,
      description: 'Test resource',
      properties: {},
      ...schema,
    } as CloudFormationRegistryResource,
  });
}

function object(properties: jsonschema.ObjectProperties): jsonschema.RecordLikeObject {
  return { type: 'object', properties, additionalProperties: false };
}

function resource(): Resource {
  return db.lookup('resource', 'cloudFormationType', 'equals', RESOURCE).only();
}

function typeDefinition(name: string) {
  return db
    .follow('usesType', resource())
    .map((r) => r.entity)
    .filter((t) => t.name === name)[0];
}

function fieldNames(typeName: string) {
  return Object.keys(typeDefinition(typeName).properties).sort();
}

/**
 * The type history of a property, oldest first, with type definitions by name
 */
function history(prop: { type: PropertyType; previousTypes?: PropertyType[] }) {
  return [...(prop.previousTypes ?? []), prop.type].map((t) => new RichPropertyType(t).stringify(db, false));
}

/**
 * The names of the type definitions that any type history of the resource refers to, directly or through fields
 */
function referencedTypeNames() {
  const seen = new Set<string>();
  const visit = (type: PropertyType) => {
    switch (type.type) {
      case 'array':
      case 'map':
        return visit(type.element);
      case 'union':
        return type.types.forEach(visit);
      case 'ref':
        const typeDef = db.get('typeDefinition', type.reference);
        if (!seen.has(typeDef.name)) {
          seen.add(typeDef.name);
          Object.values(typeDef.properties).forEach(visitHistory);
        }
        return;
    }
  };
  const visitHistory = (prop: { type: PropertyType; previousTypes?: PropertyType[] }) =>
    [...(prop.previousTypes ?? []), prop.type].forEach(visit);
  Object.values(resource().properties).forEach(visitHistory);
  return [...seen].sort();
}

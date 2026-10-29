import { emptyDatabase, SpecDatabase } from '@aws-cdk/service-spec-types';
import { importCloudFormationRegistryResource } from '../src/importers/import-cloudformation-registry';
import { ResourceSpecImporter } from '../src/importers/import-resource-spec';
import { compareL1, formatL1Changes } from '../src/l1-changes';
import { ProblemReport } from '../src/report';
import { CloudFormationRegistryResource, jsonschema, resourcespec } from '../src/types';

const RESOURCE = 'AWS::Some::Type';

let base: SpecDatabase;
let head: SpecDatabase;
beforeEach(() => {
  base = emptyDatabase();
  head = emptyDatabase();
});

test('a struct rename is reported with its field differences', () => {
  importRegistry(base, {
    properties: { Destinations: { type: 'array', items: { $ref: '#/definitions/DestinationRequest' } } },
    definitions: { DestinationRequest: object({ StreamName: { type: 'string' }, Old: { type: 'string' } }) },
  });
  importRegistry(head, {
    properties: { Destinations: { type: 'array', items: { $ref: '#/definitions/Destination' } } },
    definitions: {
      Destination: object({ StreamName: { type: 'string' }, Network: { type: 'string' } }, ['StreamName']),
    },
  });

  const changes = compareL1(base, head);

  expect(changes.renames).toEqual([
    {
      resource: RESOURCE,
      from: 'DestinationRequest',
      to: 'Destination',
      positions: ['property Destinations'],
      fieldChanges: ['Network added', 'Old removed', 'StreamName now required'],
    },
  ]);
  expect(changes.removedFields).toEqual([]);
  expect(changes.requiredness).toEqual([]);
  expect(changes.other).toEqual([]);
});

test('two structs merged into one are reported as a merge', () => {
  importRegistry(base, {
    properties: { Settings: { $ref: '#/definitions/Settings' } },
    definitions: {
      Settings: object({ Burn: { $ref: '#/definitions/BurnSettings' }, Dvb: { $ref: '#/definitions/DvbSettings' } }),
      BurnSettings: object({ Font: { type: 'string' } }),
      DvbSettings: object({ Font: { type: 'string' }, Rows: { type: 'integer' } }),
    },
  });
  importRegistry(head, {
    properties: { Settings: { $ref: '#/definitions/Settings' } },
    definitions: {
      Settings: object({
        Burn: { $ref: '#/definitions/BurnDvbSettings' },
        Dvb: { $ref: '#/definitions/BurnDvbSettings' },
      }),
      BurnDvbSettings: object({ Font: { type: 'string' }, Rows: { type: 'integer' } }),
    },
  });

  const changes = compareL1(base, head);

  expect(changes.renames.map((r) => [r.from, r.to, r.positions, r.fieldChanges])).toEqual([
    ['BurnSettings', 'BurnDvbSettings', ['field Settings.Burn'], ['Rows added']],
    ['DvbSettings', 'BurnDvbSettings', ['field Settings.Dvb'], []],
  ]);
  expect(formatL1Changes(changes)).toContain(
    [
      `  ${RESOURCE}`,
      '    BurnSettings, DvbSettings -> BurnDvbSettings (merge; field Settings.Burn, field Settings.Dvb)',
      '      from BurnSettings: Rows added',
    ].join('\n'),
  );
});

test('removed fields, requiredness changes and other changes are reported by resource', () => {
  importRegistry(base, {
    properties: {
      Settings: { $ref: '#/definitions/Settings' },
      Name: { type: 'string' },
      Policy: {},
      Gone: { type: 'string' },
    },
    definitions: { Settings: object({ Url: { type: 'string' }, Removed: { type: 'string' } }) },
  });
  importRegistry(head, {
    properties: { Settings: { $ref: '#/definitions/Settings' }, Name: { type: 'string' }, Policy: { type: 'string' } },
    definitions: { Settings: object({ Url: { type: 'string' } }, ['Url']) },
    required: ['Name'],
  });

  const changes = compareL1(base, head);

  expect(changes.renames).toEqual([]);
  expect(changes.removedFields.map((c) => c.element)).toEqual(['field Settings.Removed']);
  expect(changes.requiredness.map((c) => `${c.element}: ${c.description}`)).toEqual([
    'field Settings.Url: now required',
    'property Name: now required',
  ]);
  expect(changes.other.map((c) => `${c.element}: ${c.description}`)).toEqual([
    'property Gone: removed',
    'property Policy: type changed from json to string',
  ]);
  expect(formatL1Changes(changes)).toEqual(
    [
      'L1 changes from the base database (what CDK renders): 0 renamed or merged structs, 1 removed fields, 2 requiredness changes, 2 other changes, 0 additions',
      '',
      'Removed fields:',
      `  ${RESOURCE}`,
      '    field Settings.Removed',
      '',
      'Requiredness changes:',
      `  ${RESOURCE}`,
      '    field Settings.Url: now required',
      '    property Name: now required',
      '',
      'Other changes:',
      `  ${RESOURCE}`,
      '    property Gone: removed',
      '    property Policy: type changed from json to string',
    ].join('\n'),
  );
});

test('a struct that is no longer rendered and not renamed is reported as removed', () => {
  importRegistry(base, {
    properties: { Settings: { $ref: '#/definitions/Settings' } },
    definitions: { Settings: object({ Url: { type: 'string' } }) },
  });
  importRegistry(head, { properties: { Settings: { type: 'string' } } });

  const changes = compareL1(base, head);

  expect(changes.other.map((c) => `${c.element}: ${c.description}`)).toEqual([
    'property Settings: type changed from Settings to string',
    'struct Settings: no longer rendered',
  ]);
});

test('a property renders its oldest type, and the later types of its history as extra structs', () => {
  importLegacySpec(base, {
    properties: { Settings: { Type: 'SettingsRequest', UpdateType: 'Mutable' } },
    types: { SettingsRequest: { Properties: { Url: { PrimitiveType: 'String', UpdateType: 'Mutable' } } } },
  });
  const registry: Partial<CloudFormationRegistryResource> = {
    properties: { Settings: { type: 'array', items: { $ref: '#/definitions/Settings' } } },
    definitions: { Settings: object({ Url: { type: 'string' }, Port: { type: 'integer' } }) },
  };
  importRegistry(base, registry);
  importRegistry(head, registry);

  // The base L1 has `settings: SettingsRequestProperty`, and also renders `SettingsProperty`
  expect(compareL1(base, head)).toEqual({
    renames: [],
    removedFields: [],
    requiredness: [],
    other: [
      {
        resource: RESOURCE,
        element: 'property Settings',
        description: 'type changed from SettingsRequest to Array<Settings>',
      },
      { resource: RESOURCE, element: 'struct SettingsRequest', description: 'no longer rendered' },
    ],
    additions: 0,
  });
});

test('a struct field renders its oldest type, and the structs of its later types are not rendered', () => {
  importLegacySpec(base, {
    properties: { Pod: { Type: 'Pod', UpdateType: 'Mutable' } },
    types: {
      Pod: { Properties: { Filter: { Type: 'FilterRequest', UpdateType: 'Mutable' } } },
      FilterRequest: { Properties: { Name: { PrimitiveType: 'String', UpdateType: 'Mutable' } } },
    },
  });
  const registry: Partial<CloudFormationRegistryResource> = {
    properties: { Pod: { $ref: '#/definitions/Pod' } },
    definitions: {
      Pod: object({ Filter: { type: 'array', items: { $ref: '#/definitions/Filter' } } }),
      Filter: object({ Name: { type: 'string' }, Values: { type: 'array', items: { type: 'string' } } }),
    },
  };
  importRegistry(base, registry);
  importRegistry(head, registry);

  // The base L1 has `filter: FilterRequestProperty` and does not render `FilterProperty`
  expect(compareL1(base, head)).toEqual({
    renames: [],
    removedFields: [],
    requiredness: [],
    other: [
      {
        resource: RESOURCE,
        element: 'field Pod.Filter',
        description: 'type changed from FilterRequest to Array<Filter>',
      },
      { resource: RESOURCE, element: 'struct FilterRequest', description: 'no longer rendered' },
    ],
    additions: 1,
  });
});

test('an attribute renders its oldest type', () => {
  importLegacySpec(base, { properties: {}, attributes: { Revision: { PrimitiveType: 'Integer' } }, types: {} });
  const registry: Partial<CloudFormationRegistryResource> = {
    properties: { Revision: { type: 'string' } },
    readOnlyProperties: ['/properties/Revision'],
  };
  importRegistry(base, registry);
  importRegistry(head, registry);

  // The base L1 has `attrRevision: number`
  expect(compareL1(base, head)).toEqual({
    renames: [],
    removedFields: [],
    requiredness: [],
    other: [{ resource: RESOURCE, element: 'attribute Revision', description: 'type changed from number to string' }],
    additions: 0,
  });
});

test('a struct that the legacy spec flags to render for backwards compatibility is rendered', () => {
  importLegacySpec(base, {
    properties: { Name: { PrimitiveType: 'String', UpdateType: 'Mutable' } },
    types: { Unused: { Properties: { Url: { PrimitiveType: 'String', UpdateType: 'Mutable' } } } },
  });
  importLegacySpec(head, { properties: { Name: { PrimitiveType: 'String', UpdateType: 'Mutable' } }, types: {} });

  expect(compareL1(base, head)).toEqual({
    renames: [],
    removedFields: [],
    requiredness: [],
    other: [{ resource: RESOURCE, element: 'struct Unused', description: 'no longer rendered' }],
    additions: 0,
  });
});

test('additions are counted and a database compared with itself has no changes', () => {
  importRegistry(base, { properties: { Name: { type: 'string' } } });
  importRegistry(head, {
    properties: { Name: { type: 'string' }, Settings: { $ref: '#/definitions/Settings' } },
    definitions: { Settings: object({ Url: { type: 'string' } }) },
  });

  expect(compareL1(base, head).additions).toBe(2);
  expect(formatL1Changes(compareL1(base, base))).toEqual(
    'L1 changes from the base database (what CDK renders): 0 renamed or merged structs, 0 removed fields, 0 requiredness changes, 0 other changes, 0 additions',
  );
});

function importRegistry(db: SpecDatabase, schema: Partial<CloudFormationRegistryResource>) {
  importCloudFormationRegistryResource({
    db,
    report: new ProblemReport(),
    resource: {
      typeName: RESOURCE,
      description: 'Test resource',
      properties: {},
      ...schema,
    } as CloudFormationRegistryResource,
  });
}

function importLegacySpec(
  db: SpecDatabase,
  options: {
    properties: Record<string, resourcespec.Property>;
    attributes?: Record<string, resourcespec.Attribute>;
    types: Record<string, resourcespec.PropertyType>;
  },
) {
  ResourceSpecImporter.importTypes({
    db,
    specification: {
      ResourceSpecificationVersion: '0',
      ResourceTypes: { [RESOURCE]: { Properties: options.properties, Attributes: options.attributes } },
      PropertyTypes: Object.fromEntries(
        Object.entries(options.types).map(([name, decl]) => [`${RESOURCE}.${name}`, decl]),
      ),
    },
  });
}

function object(properties: jsonschema.ObjectProperties, required?: string[]): jsonschema.RecordLikeObject {
  return { type: 'object', properties, required, additionalProperties: false };
}

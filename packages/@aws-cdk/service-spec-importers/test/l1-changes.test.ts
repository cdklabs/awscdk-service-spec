import { emptyDatabase, SpecDatabase } from '@aws-cdk/service-spec-types';
import { importLegacySpec, importRegistry, object, ref, RESOURCE, str } from './utils';
import { compareL1, formatL1Changes } from '../src/l1-changes';
import { GeneratedPackage, L1View, renderType } from '../src/l1-view';
import { CloudFormationRegistryResource, jsonschema } from '../src/types';

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
  expect(changes.removed).toEqual([]);
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
    ['BurnSettings', 'BurnDvbSettings', ['property Settings.Burn'], ['Rows added']],
    ['DvbSettings', 'BurnDvbSettings', ['property Settings.Dvb'], []],
  ]);
  expect(formatL1Changes(changes)).toContain(
    [
      `  ${RESOURCE}`,
      '    BurnSettings, DvbSettings -> BurnDvbSettings (merge; property Settings.Burn, property Settings.Dvb)',
      '      from BurnSettings: Rows added',
    ].join('\n'),
  );
});

test('a renamed struct is placed at every path the L1 renders it, as the type history gate names positions', () => {
  const outers = (inner: string) => ({
    properties: { First: ref('Outer'), Second: ref('Outer') },
    definitions: { Outer: object({ Inner: ref(inner) }), [inner]: object({ Url: str() }) },
  });
  importRegistry(base, outers('InnerRequest'));
  importRegistry(head, outers('Inner'));

  expect(compareL1(base, head).renames.map((r) => `${r.from} -> ${r.to} at ${r.positions.join(', ')}`)).toEqual([
    'InnerRequest -> Inner at property First.Inner, property Second.Inner',
  ]);
});

test('a struct renamed below a struct the L1 renders only as a struct of its own keeps its field position', () => {
  // The base L1 has `settings: SettingsRequestProperty`, and also renders `SettingsProperty`, which no path reaches
  const history = (target: SpecDatabase, inner: string) => {
    importLegacySpec(target, {
      properties: { Settings: { Type: 'SettingsRequest', UpdateType: 'Mutable' } },
      types: { SettingsRequest: { Properties: { Url: { PrimitiveType: 'String', UpdateType: 'Mutable' } } } },
    });
    importRegistry(target, {
      properties: { Settings: ref('Settings') },
      definitions: { Settings: object({ Url: str(), Inner: ref(inner) }), [inner]: object({ Name: str() }) },
    });
  };
  history(base, 'InnerRequest');
  history(head, 'Inner');

  expect(compareL1(base, head).renames.map((r) => `${r.from} -> ${r.to} at ${r.positions.join(', ')}`)).toEqual([
    'InnerRequest -> Inner at field Settings.Inner',
  ]);
});

test('removals, requiredness changes and other changes are reported by resource', () => {
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
  expect(changes.removed.map((c) => c.element)).toEqual(['field Settings.Removed', 'property Gone']);
  expect(changes.requiredness.map((c) => `${c.element}: ${c.description}`)).toEqual([
    'field Settings.Url: now required',
    'property Name: now required',
  ]);
  expect(changes.other.map((c) => `${c.element}: ${c.description}`)).toEqual([
    'property Policy: type changed from json to string',
  ]);
  expect(formatL1Changes(changes)).toEqual(
    [
      'L1 changes from the base database (what CDK renders): 0 renamed or merged structs, 2 removed, 2 requiredness changes, 1 other changes, 0 additions',
      '',
      'Removed:',
      `  ${RESOURCE}`,
      '    field Settings.Removed',
      '    property Gone',
      '',
      'Requiredness changes:',
      `  ${RESOURCE}`,
      '    field Settings.Url: now required',
      '    property Name: now required',
      '',
      'Other changes:',
      `  ${RESOURCE}`,
      '    property Policy: type changed from json to string',
    ].join('\n'),
  );
});

test('removed resources and attributes are listed by name', () => {
  importRegistry(base, {
    properties: { Name: { type: 'string' }, Arn: { type: 'string' } },
    readOnlyProperties: ['/properties/Arn'],
  });
  importRegistry(base, { properties: { Name: { type: 'string' } } }, 'AWS::Some::Gone');
  importRegistry(head, { properties: { Name: { type: 'string' } } });

  const changes = compareL1(base, head);

  expect(changes.removed.map((c) => `${c.resource} ${c.element}`)).toEqual([
    'AWS::Some::Gone resource',
    `${RESOURCE} attribute Arn`,
  ]);
  expect(formatL1Changes(changes)).toContain(
    ['Removed:', '  AWS::Some::Gone', '    resource', `  ${RESOURCE}`, '    attribute Arn'].join('\n'),
  );
});

test('changes are ordered by resource, then by name, with case compared last', () => {
  for (const resource of ['AWS::IVS::Channel', 'AWS::IoT::Thing']) {
    importRegistry(
      base,
      {
        properties: {
          ReplicaSpecification: str(),
          Replicas: str(),
          Set: ref('SetRequest'),
          Address: ref('AddressRequest'),
        },
        definitions: { SetRequest: object({ Name: str() }), AddressRequest: object({ Name: str() }) },
      },
      resource,
    );
    importRegistry(
      head,
      {
        properties: { Set: ref('IPSet'), Address: ref('IpAddress') },
        definitions: { IPSet: object({ Name: str() }), IpAddress: object({ Name: str() }) },
      },
      resource,
    );
  }

  const changes = compareL1(base, head);

  expect(changes.removed.map((c) => `${c.resource} ${c.element}`)).toEqual([
    'AWS::IoT::Thing property Replicas',
    'AWS::IoT::Thing property ReplicaSpecification',
    'AWS::IVS::Channel property Replicas',
    'AWS::IVS::Channel property ReplicaSpecification',
  ]);
  expect(changes.renames.map((r) => `${r.resource} ${r.to}`)).toEqual([
    'AWS::IoT::Thing IpAddress',
    'AWS::IoT::Thing IPSet',
    'AWS::IVS::Channel IpAddress',
    'AWS::IVS::Channel IPSet',
  ]);
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
  ]);
  expect(changes.removed.map((c) => `${c.element}: ${c.description}`)).toEqual(['struct Settings: no longer rendered']);
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
    removed: [{ resource: RESOURCE, element: 'struct SettingsRequest', description: 'no longer rendered' }],
    requiredness: [],
    other: [
      {
        resource: RESOURCE,
        element: 'property Settings',
        description: 'type changed from SettingsRequest to Array<Settings>',
      },
    ],
    addedFields: [],
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
    removed: [{ resource: RESOURCE, element: 'struct FilterRequest', description: 'no longer rendered' }],
    requiredness: [],
    other: [
      {
        resource: RESOURCE,
        element: 'field Pod.Filter',
        description: 'type changed from FilterRequest to Array<Filter>',
      },
    ],
    addedFields: [],
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
    removed: [],
    requiredness: [],
    other: [{ resource: RESOURCE, element: 'attribute Revision', description: 'type changed from number to string' }],
    addedFields: [],
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
    removed: [{ resource: RESOURCE, element: 'struct Unused', description: 'no longer rendered' }],
    requiredness: [],
    other: [],
    addedFields: [],
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
    'L1 changes from the base database (what CDK renders): 0 renamed or merged structs, 0 removed, 0 requiredness changes, 0 other changes, 0 additions',
  );
});

test('fields added to a struct that keeps its name are listed by name', () => {
  importRegistry(base, {
    properties: { Settings: { $ref: '#/definitions/Settings' } },
    definitions: { Settings: object({ Url: { type: 'string' } }) },
  });
  importRegistry(head, {
    properties: { Settings: { $ref: '#/definitions/Settings' }, Name: { type: 'string' } },
    definitions: { Settings: object({ Url: { type: 'string' }, Port: { type: 'integer' } }) },
  });

  const changes = compareL1(base, head);

  expect(changes.addedFields).toEqual([{ resource: RESOURCE, element: 'field Settings.Port', description: 'added' }]);
  expect(changes.additions).toBe(2);
  expect(formatL1Changes(changes)).toEqual(
    [
      'L1 changes from the base database (what CDK renders): 0 renamed or merged structs, 0 removed, 0 requiredness changes, 0 other changes, 2 additions',
      '',
      'Added fields:',
      `  ${RESOURCE}`,
      '    field Settings.Port',
    ].join('\n'),
  );
});

describe('tag properties render as the CDK code generator renders them', () => {
  // In the CDK code generator's table of legacy (ITaggable) resources, with tags in `Tags`
  const LEGACY = 'AWS::SQS::Queue';
  // Also in that table; imported here without tag information
  const LEGACY_UNTAGGED = 'AWS::OpsWorks::Layer';

  const tagList = (struct: string, fields = ['Key', 'Value'], required: string[] = []) => ({
    properties: { Tags: { type: 'array', items: ref(struct) } as jsonschema.Schema },
    definitions: { [struct]: object(Object.fromEntries(fields.map((f) => [f, str()])), required) },
    required: ['Tags'],
  });
  const settingsTags = (versionTwo: boolean): Partial<CloudFormationRegistryResource> =>
    versionTwo
      ? {
          properties: { Tags: { anyOf: [ref('SettingsV2'), str()] } as jsonschema.Schema },
          definitions: { SettingsV2: object({ Url: str(), Mode: str() }) },
        }
      : { properties: { Tags: ref('Settings') }, definitions: { Settings: object({ Url: str() }) } };
  const untagged = (schema: Partial<CloudFormationRegistryResource>) => ({ ...schema, tagging: { taggable: false } });

  /** Each import adds its types to the type history, so the schemas go oldest first */
  const importVersions = (
    target: SpecDatabase,
    typeName: string,
    ...versions: Array<Partial<CloudFormationRegistryResource>>
  ) => {
    for (const version of versions) {
      importRegistry(target, version, typeName);
    }
  };

  /** The tag property and the structs that a package renders */
  const rendered = (target: SpecDatabase, pkg: GeneratedPackage, typeName = RESOURCE) => {
    const l1 = new L1View(target, target.lookup('resource', 'cloudFormationType', 'equals', typeName).only(), pkg);
    return {
      tags: renderType(target, l1.properties.Tags.type),
      required: l1.properties.Tags.required,
      structs: [...l1.structs.keys()].sort(),
    };
  };

  test('a modern tag property renders the newest type of its history, and the mixins also the oldest one', () => {
    importVersions(head, RESOURCE, tagList('TagEntry'), tagList('Tag'));

    expect(head.lookup('resource', 'cloudFormationType', 'equals', RESOURCE).only().tagInformation).toBeDefined();
    expect(rendered(head, 'aws-cdk-lib')).toEqual({ tags: 'Array<tag>', required: false, structs: [] });
    expect(rendered(head, 'cfn-property-mixins')).toEqual({
      tags: 'Array<tag>',
      required: false,
      structs: ['TagEntry'],
    });
  });

  test('a legacy tag property renders the oldest type of its history, and no package renders its later types', () => {
    importVersions(head, LEGACY, tagList('TagEntry'), tagList('TagEntryV2', ['Key', 'Value', 'Owner']));

    for (const pkg of ['aws-cdk-lib', 'cfn-property-mixins'] as const) {
      expect(rendered(head, pkg, LEGACY)).toEqual({ tags: 'Array<TagEntry>', required: false, structs: ['TagEntry'] });
    }
  });

  test('a resource in the legacy table has a legacy tag property without tag information', () => {
    importVersions(
      head,
      LEGACY_UNTAGGED,
      untagged(tagList('TagEntry')),
      untagged(tagList('TagEntryV2', ['Key', 'Value', 'Owner'])),
    );

    expect(
      head.lookup('resource', 'cloudFormationType', 'equals', LEGACY_UNTAGGED).only().tagInformation,
    ).toBeUndefined();
    for (const pkg of ['aws-cdk-lib', 'cfn-property-mixins'] as const) {
      expect(rendered(head, pkg, LEGACY_UNTAGGED)).toEqual({
        tags: 'Array<TagEntry>',
        required: false,
        structs: ['TagEntry'],
      });
    }
  });

  test('a modern tag struct that CloudFormation renamed renders under its new name, and the mixins keep the old one', () => {
    importVersions(head, RESOURCE, tagList('PolicyTag'), tagList('PolicyTagV2'));

    expect(rendered(head, 'aws-cdk-lib')).toEqual({
      tags: 'Array<PolicyTagV2>',
      required: false,
      structs: ['PolicyTagV2'],
    });
    expect(rendered(head, 'cfn-property-mixins').structs).toEqual(['PolicyTag', 'PolicyTagV2']);
  });

  test('a modern tag property whose type CloudFormation changed renders the new type', () => {
    importVersions(head, RESOURCE, settingsTags(false), settingsTags(true));

    expect(rendered(head, 'aws-cdk-lib')).toEqual({
      tags: 'SettingsV2 | string',
      required: false,
      structs: ['SettingsV2'],
    });
    expect(rendered(head, 'cfn-property-mixins').structs).toEqual(['Settings', 'SettingsV2']);
  });

  test('the report shows a modern tag struct that CloudFormation renamed', () => {
    importRegistry(base, tagList('PolicyTag'));
    importVersions(head, RESOURCE, tagList('PolicyTag'), tagList('PolicyTagV2'));

    const changes = compareL1(base, head);

    expect(changes.renames.map((r) => `${r.from} -> ${r.to} at ${r.positions.join(', ')}`)).toEqual([
      'PolicyTag -> PolicyTagV2 at property Tags',
    ]);
    expect([...changes.removed, ...changes.requiredness, ...changes.other]).toEqual([]);
    expect(formatL1Changes(changes)).toContain(`  ${RESOURCE}\n    PolicyTag -> PolicyTagV2 (property Tags)`);
  });

  test('the report shows a type change of a modern tag property, and the struct aws-cdk-lib no longer renders', () => {
    importRegistry(base, settingsTags(false));
    importVersions(head, RESOURCE, settingsTags(false), settingsTags(true));

    const changes = compareL1(base, head);

    expect(changes.other.map((c) => `${c.element}: ${c.description}`)).toEqual([
      'property Tags: type changed from Settings to SettingsV2 | string',
    ]);
    expect(changes.removed.map((c) => `${c.element}: ${c.description}`)).toEqual([
      'struct Settings: no longer rendered',
    ]);
    expect(changes.renames).toEqual([]);
  });

  test('the report shows a field added to a struct only the mixins render, which render every field optional', () => {
    importVersions(base, RESOURCE, tagList('TagEntry'), tagList('Tag'));
    importVersions(head, RESOURCE, tagList('TagEntry', ['Key', 'Value', 'Owner'], ['Key']), tagList('Tag'));

    const changes = compareL1(base, head);

    expect(changes.addedFields.map((c) => c.element)).toEqual(['field TagEntry.Owner']);
    expect([...changes.renames, ...changes.removed, ...changes.requiredness, ...changes.other]).toEqual([]);
  });

  test('the report leaves out the structs that no package renders', () => {
    importVersions(
      base,
      LEGACY_UNTAGGED,
      untagged(tagList('TagEntry')),
      untagged(tagList('TagEntryV2', ['Key', 'Value'])),
    );
    importVersions(
      head,
      LEGACY_UNTAGGED,
      untagged(tagList('TagEntry')),
      untagged(tagList('TagEntryV2', ['Key', 'Value', 'Owner'], ['Key'])),
    );

    expect(compareL1(base, head)).toEqual({
      renames: [],
      removed: [],
      requiredness: [],
      other: [],
      addedFields: [],
      additions: 0,
    });
  });
});

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { emptyDatabase, Property, RichProperty, RichPropertyType, SpecDatabase } from '@aws-cdk/service-spec-types';
import { DatabaseBuilder } from '../src/db-builder';
import { importCloudFormationRegistryResource } from '../src/importers/import-cloudformation-registry';
import { importTypeHistory } from '../src/importers/import-type-history';
import { compareL1, L1Change } from '../src/l1-compat';
import { ProblemReport } from '../src/report';
import { CloudFormationRegistryResource, jsonschema } from '../src/types';

const RESOURCE = 'AWS::Some::Type';

let released: SpecDatabase;
let db: SpecDatabase;
beforeEach(() => {
  released = emptyDatabase();
  db = emptyDatabase();
});

test('a released type stays the oldest type when the current schema renames it', () => {
  importRegistry(released, {
    properties: { Settings: { $ref: '#/definitions/SettingsRequest' } },
    definitions: { SettingsRequest: object({ Url: { type: 'string' } }) },
  });
  importRegistry(db, {
    properties: { Settings: { $ref: '#/definitions/Settings' } },
    definitions: { Settings: object({ Url: { type: 'string' } }, ['Url']) },
  });

  importTypeHistory(db, released);

  expect(history(resource(db).properties.Settings)).toEqual(['SettingsRequest', 'Settings']);
  // The released type keeps its released requiredness, the current type keeps the current one
  expect(fields('SettingsRequest')).toEqual({ Url: 'string' });
  expect(fields('Settings')).toEqual({ Url: 'string (required)' });
});

test('a released field is kept when a newer type of the same property still has it', () => {
  importRegistry(released, {
    properties: { Destinations: { type: 'array', items: { $ref: '#/definitions/DestinationRequest' } } },
    definitions: {
      DestinationRequest: object({ StreamName: { type: 'string' }, Network: { type: 'string' } }),
    },
  });
  // The current build knows the old type with fewer fields, and a newer type with all of them
  importRegistry(db, {
    properties: { Destinations: { type: 'array', items: { $ref: '#/definitions/DestinationRequest' } } },
    definitions: { DestinationRequest: object({ StreamName: { type: 'string' } }) },
  });
  importRegistry(db, {
    properties: { Destinations: { type: 'array', items: { $ref: '#/definitions/Destination' } } },
    definitions: {
      Destination: object({ StreamName: { type: 'string' }, Network: { type: 'string' }, Ip: { type: 'string' } }),
    },
  });

  importTypeHistory(db, released);

  expect(history(resource(db).properties.Destinations)).toEqual(['Array<DestinationRequest>', 'Array<Destination>']);
  expect(fields('DestinationRequest')).toEqual({ StreamName: 'string', Network: 'string' });
});

test('a released field that no current type has is not resurrected', () => {
  importRegistry(released, {
    properties: { Settings: { $ref: '#/definitions/SettingsRequest' } },
    definitions: { SettingsRequest: object({ Url: { type: 'string' }, Removed: { type: 'string' } }) },
  });
  importRegistry(db, {
    properties: { Settings: { $ref: '#/definitions/Settings' } },
    definitions: { Settings: object({ Url: { type: 'string' } }) },
  });

  importTypeHistory(db, released);

  expect(fields('SettingsRequest')).toEqual({ Url: 'string' });
});

test('a released property or resource that CloudFormation removed is not resurrected', () => {
  importRegistry(released, {
    properties: { Kept: { type: 'string' }, Removed: { type: 'string' } },
  });
  importRegistry(released, { typeName: 'AWS::Some::Removed', properties: { Name: { type: 'string' } } });
  importRegistry(db, { properties: { Kept: { type: 'string' } } });

  importTypeHistory(db, released);

  expect(Object.keys(resource(db).properties)).toEqual(['Kept']);
  expect(db.lookup('resource', 'cloudFormationType', 'equals', 'AWS::Some::Removed')).toHaveLength(0);
});

test('a released type whose fields are all gone does not replace the current type', () => {
  importRegistry(released, {
    properties: { Settings: { $ref: '#/definitions/OldSettings' } },
    definitions: { OldSettings: object({ Removed: { type: 'string' } }) },
  });
  importRegistry(db, {
    properties: { Settings: { $ref: '#/definitions/Settings' } },
    definitions: { Settings: object({ Url: { type: 'string' } }) },
  });

  importTypeHistory(db, released);

  expect(history(resource(db).properties.Settings)).toEqual(['Settings']);
  expect(typeNames()).toEqual(['Settings']);
});

test('a released field whose released type did not survive takes the current type of that field', () => {
  importRegistry(released, {
    properties: { Settings: { $ref: '#/definitions/SettingsRequest' } },
    definitions: {
      SettingsRequest: object({ Source: { $ref: '#/definitions/OldSource' } }),
      OldSource: object({ Removed: { type: 'string' } }),
    },
  });
  importRegistry(db, {
    properties: { Settings: { $ref: '#/definitions/Settings' } },
    definitions: {
      Settings: object({ Source: { $ref: '#/definitions/Source' } }),
      Source: object({ Url: { type: 'string' } }),
    },
  });

  importTypeHistory(db, released);

  expect(fields('SettingsRequest')).toEqual({ Source: 'Source' });
  expect(typeNames()).toEqual(['Settings', 'SettingsRequest', 'Source']);
});

test('a released type shared by two properties keeps a field that one of their current types still has', () => {
  importRegistry(released, {
    properties: {
      First: { $ref: '#/definitions/Shared' },
      Second: { $ref: '#/definitions/Shared' },
    },
    definitions: {
      Shared: object({ Url: { type: 'string' }, OnlyFirst: { type: 'string' }, Removed: { type: 'string' } }),
    },
  });
  importRegistry(db, {
    properties: {
      First: { $ref: '#/definitions/FirstSettings' },
      Second: { $ref: '#/definitions/SecondSettings' },
    },
    definitions: {
      FirstSettings: object({ Url: { type: 'string' }, OnlyFirst: { type: 'string' } }),
      SecondSettings: object({ Url: { type: 'string' }, OnlySecond: { type: 'string' } }),
    },
  });

  const changes = importTypeHistory(db, released);

  expect(history(resource(db).properties.First)).toEqual(['Shared', 'FirstSettings']);
  expect(history(resource(db).properties.Second)).toEqual(['Shared', 'SecondSettings']);
  expect(fields('Shared')).toEqual({ Url: 'string', OnlyFirst: 'string' });
  expect(descriptions(changes)).toEqual([
    'cloudformation-change field Shared.OnlyFirst: kept from the released type, but no current type at property Second has it',
  ]);
});

test('a released type shared by two properties stays only where a current type shares a field with it', () => {
  importRegistry(released, {
    properties: { First: { $ref: '#/definitions/Shared' }, Second: { $ref: '#/definitions/Shared' } },
    definitions: { Shared: object({ OnlyFirst: { type: 'string' } }) },
  });
  importRegistry(db, {
    properties: { First: { $ref: '#/definitions/FirstSettings' }, Second: { $ref: '#/definitions/SecondSettings' } },
    definitions: {
      FirstSettings: object({ OnlyFirst: { type: 'string' } }),
      SecondSettings: object({ OnlySecond: { type: 'string' } }),
    },
  });

  const importChanges = importTypeHistory(db, released);
  const changes = compareL1(released, db);

  expect(history(resource(db).properties.First)).toEqual(['Shared', 'FirstSettings']);
  expect(history(resource(db).properties.Second)).toEqual(['SecondSettings']);
  expect(importChanges).toEqual([]);
  expect(descriptions(changes.filter((c) => c.kind !== 'addition'))).toEqual([
    'cloudformation-change property Second: type changed from Shared to SecondSettings',
  ]);
});

test('a field that a shared type keeps for one property is reported at a property whose current type of the same name lacks it', () => {
  importRegistry(released, {
    properties: { First: { $ref: '#/definitions/Shared' }, Second: { $ref: '#/definitions/Shared' } },
    definitions: { Shared: object({ Url: { type: 'string' }, OnlyFirst: { type: 'string' } }) },
  });
  importRegistry(db, {
    properties: { First: { $ref: '#/definitions/FirstSettings' }, Second: { $ref: '#/definitions/Shared' } },
    definitions: {
      FirstSettings: object({ Url: { type: 'string' }, OnlyFirst: { type: 'string' } }),
      Shared: object({ Url: { type: 'string' } }),
    },
  });

  const changes = importTypeHistory(db, released);

  expect(fields('Shared')).toEqual({ Url: 'string', OnlyFirst: 'string' });
  expect(descriptions(changes)).toEqual([
    'cloudformation-change field Shared.OnlyFirst: kept from the released type, but no current type at property Second has it',
  ]);
});

test('the build report and the build log list a field that a released type keeps at a position whose current types lack it', async () => {
  importRegistry(released, {
    properties: { First: { $ref: '#/definitions/Shared' }, Second: { $ref: '#/definitions/Shared' } },
    definitions: { Shared: object({ Url: { type: 'string' }, OnlyFirst: { type: 'string' } }) },
  });
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'released-db-'));
  const log = jest.spyOn(console, 'log').mockImplementation(() => {});
  const expected = `CloudFormation change in ${RESOURCE} field Shared.OnlyFirst: kept from the released type, but no current type at property Second has it`;
  try {
    const releasedFile = path.join(dir, 'db.json');
    fs.writeFileSync(releasedFile, JSON.stringify(released.save()));
    const reportDir = path.join(dir, 'report');

    const { report } = await new DatabaseBuilder(db, {})
      .addSourceImporter(async (target) =>
        importRegistry(target, {
          properties: { First: { $ref: '#/definitions/FirstSettings' }, Second: { $ref: '#/definitions/Shared' } },
          definitions: {
            FirstSettings: object({ Url: { type: 'string' }, OnlyFirst: { type: 'string' } }),
            Shared: object({ Url: { type: 'string' } }),
          },
        }),
      )
      .importTypeHistory(releasedFile)
      .build();
    await report.write(reportDir);

    expect(report.counts['l1-compatibility']).toBe(1);
    expect(fs.readFileSync(path.join(reportDir, 'AWS_Some.txt'), 'utf-8')).toContain(expected);
    expect(log.mock.calls).toEqual([[expected]]);
  } finally {
    log.mockRestore();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test.each([
  [
    'a property',
    { properties: { Actions: { type: 'array', items: { type: 'object' } } } },
    { properties: { Actions: { type: 'array', items: { type: 'string' } } } },
    (target: SpecDatabase) => resource(target).properties.Actions,
    ['property Actions: type changed from Array<json> to Array<string>'],
  ],
  [
    'an attribute',
    { properties: { Count: { type: 'string' } }, readOnlyProperties: ['/properties/Count'] },
    { properties: { Count: { type: 'integer' } }, readOnlyProperties: ['/properties/Count'] },
    (target: SpecDatabase) => resource(target).attributes.Count,
    ['attribute Count: type changed from string to number'],
  ],
  [
    'a nested field',
    {
      properties: { Settings: { $ref: '#/definitions/Settings' } },
      definitions: { Settings: object({ Port: { type: 'string' } }) },
    },
    {
      properties: { Settings: { $ref: '#/definitions/Settings' } },
      definitions: { Settings: object({ Port: { type: 'integer' } }) },
    },
    (target: SpecDatabase) => resourceTypeDefinition(target, 'Settings').properties.Port,
    ['field Settings.Port: type changed from string to number'],
  ],
  [
    'a nested field that became a type definition',
    {
      properties: { Settings: { $ref: '#/definitions/Settings' } },
      definitions: { Settings: object({ Target: { type: 'string' } }) },
    },
    {
      properties: { Settings: { $ref: '#/definitions/Settings' } },
      definitions: {
        Settings: object({ Target: { $ref: '#/definitions/TargetConfig' } }),
        TargetConfig: object({ Arn: { type: 'string' } }),
      },
    },
    (target: SpecDatabase) => resourceTypeDefinition(target, 'Settings').properties.Target,
    ['field Settings.Target: type changed from string to TargetConfig'],
  ],
  [
    'a property that became an array of the same type',
    {
      properties: { Settings: { $ref: '#/definitions/Settings' } },
      definitions: { Settings: object({ Url: { type: 'string' } }) },
    },
    {
      properties: { Settings: { type: 'array', items: { $ref: '#/definitions/Settings' } } },
      definitions: { Settings: object({ Url: { type: 'string' } }) },
    },
    (target: SpecDatabase) => resource(target).properties.Settings,
    ['property Settings: type changed from Settings to Array<Settings>'],
  ],
  [
    'a property that became one value of the type of its array',
    {
      properties: { Settings: { type: 'array', items: { $ref: '#/definitions/Settings' } } },
      definitions: { Settings: object({ Url: { type: 'string' } }) },
    },
    {
      properties: { Settings: { $ref: '#/definitions/Settings' } },
      definitions: { Settings: object({ Url: { type: 'string' } }) },
    },
    (target: SpecDatabase) => resource(target).properties.Settings,
    ['property Settings: type changed from Array<Settings> to Settings'],
  ],
  [
    'a nested field that became an array of the same type',
    {
      properties: { Settings: { $ref: '#/definitions/Settings' } },
      definitions: {
        Settings: object({ Source: { $ref: '#/definitions/Source' } }),
        Source: object({ Url: { type: 'string' } }),
      },
    },
    {
      properties: { Settings: { $ref: '#/definitions/Settings' } },
      definitions: {
        Settings: object({ Source: { type: 'array', items: { $ref: '#/definitions/Source' } } }),
        Source: object({ Url: { type: 'string' } }),
      },
    },
    (target: SpecDatabase) => resourceTypeDefinition(target, 'Settings').properties.Source,
    ['field Settings.Source: type changed from Source to Array<Source>'],
  ],
  [
    'a property that became a union with the same type',
    {
      properties: { Settings: { $ref: '#/definitions/Settings' } },
      definitions: { Settings: object({ Url: { type: 'string' } }) },
    },
    {
      properties: { Settings: { oneOf: [{ $ref: '#/definitions/Settings' }, { type: 'string' }] } },
      definitions: { Settings: object({ Url: { type: 'string' } }) },
    },
    (target: SpecDatabase) => resource(target).properties.Settings,
    ['property Settings: type changed from Settings to Settings | string'],
  ],
  [
    'a property that changed to an unrelated type while the released type is still used elsewhere',
    {
      properties: { Settings: { $ref: '#/definitions/Foo' }, Other: { $ref: '#/definitions/Foo' } },
      definitions: { Foo: object({ A: { type: 'string' } }) },
    },
    {
      properties: { Settings: { $ref: '#/definitions/Bar' }, Other: { $ref: '#/definitions/Foo' } },
      definitions: { Foo: object({ A: { type: 'string' } }), Bar: object({ B: { type: 'string' } }) },
    },
    (target: SpecDatabase) => resource(target).properties.Settings,
    ['property Settings: type changed from Foo to Bar'],
  ],
  [
    'a property whose renamed type became an array',
    {
      properties: { Settings: { $ref: '#/definitions/SettingsRequest' } },
      definitions: { SettingsRequest: object({ Url: { type: 'string' } }) },
    },
    {
      properties: { Settings: { type: 'array', items: { $ref: '#/definitions/Settings' } } },
      definitions: { Settings: object({ Url: { type: 'string' } }) },
    },
    (target: SpecDatabase) => resource(target).properties.Settings,
    [
      'property Settings: type changed from SettingsRequest to Array<Settings>',
      'type SettingsRequest: removed (fields: Url)',
    ],
  ],
  [
    'a property whose renamed type became part of a union',
    {
      properties: { Settings: { $ref: '#/definitions/SettingsRequest' } },
      definitions: { SettingsRequest: object({ Url: { type: 'string' } }) },
    },
    {
      properties: { Settings: { oneOf: [{ $ref: '#/definitions/Settings' }, { type: 'string' }] } },
      definitions: { Settings: object({ Url: { type: 'string' } }) },
    },
    (target: SpecDatabase) => resource(target).properties.Settings,
    [
      'property Settings: type changed from SettingsRequest to Settings | string',
      'type SettingsRequest: removed (fields: Url)',
    ],
  ],
  [
    'a property whose union has a renamed member and an unrelated new member',
    {
      properties: { Target: { oneOf: [{ $ref: '#/definitions/OldA' }, { $ref: '#/definitions/B' }] } },
      definitions: { OldA: object({ X: { type: 'string' } }), B: object({ Y: { type: 'string' } }) },
    },
    {
      properties: { Target: { oneOf: [{ $ref: '#/definitions/A' }, { $ref: '#/definitions/C' }] } },
      definitions: { A: object({ X: { type: 'string' } }), C: object({ Z: { type: 'string' } }) },
    },
    (target: SpecDatabase) => resource(target).properties.Target,
    [
      'property Target: type changed from B | OldA to A | C',
      'type B: removed (fields: Y)',
      'type OldA: removed (fields: X)',
    ],
  ],
] as Array<[string, Partial<CloudFormationRegistryResource>, Partial<CloudFormationRegistryResource>, FieldAt, string[]]>)(
  'a type that CloudFormation changed at %s follows CloudFormation and the check reports it',
  (_, releasedSchema, currentSchema, field, expectedChanges) => {
    importRegistry(released, releasedSchema);
    importRegistry(db, currentSchema);
    const expectedHistory = history(field(db));
    const expectedTypes = typeNames();

    importTypeHistory(db, released);
    const changes = compareL1(released, db);

    expect(history(field(db))).toEqual(expectedHistory);
    expect(typeNames()).toEqual(expectedTypes);
    expect(descriptions(changes.filter((c) => c.kind !== 'addition'))).toEqual(
      expectedChanges.map((change) => `cloudformation-change ${change}`),
    );
  },
);

test('a field of a renamed released type follows a type change of the same field in the current type', () => {
  importRegistry(released, {
    properties: { Settings: { $ref: '#/definitions/SettingsRequest' } },
    definitions: { SettingsRequest: object({ Url: { type: 'string' }, Port: { type: 'string' } }) },
  });
  importRegistry(db, {
    properties: { Settings: { $ref: '#/definitions/Settings' } },
    definitions: { Settings: object({ Url: { type: 'string' }, Port: { type: 'integer' } }) },
  });

  importTypeHistory(db, released);
  const changes = compareL1(released, db);

  expect(fields('SettingsRequest')).toEqual({ Url: 'string', Port: 'integer' });
  expect(descriptions(changes.filter((c) => c.kind !== 'addition'))).toEqual([
    'cloudformation-change field SettingsRequest.Port: type changed from string to number',
  ]);
});

test('a released type stays first while the current history still contains it', () => {
  importRegistry(released, { properties: { Count: { type: 'integer' } } });
  importRegistry(released, { properties: { Count: { type: 'string' } } });
  importRegistry(db, { properties: { Count: { type: 'string' } } });
  importRegistry(db, { properties: { Count: { type: 'integer' } } });

  importTypeHistory(db, released);

  expect(history(resource(db).properties.Count)).toEqual(['integer', 'string']);
});

test('a released type stays only where a current type renamed or merged it', () => {
  // The released type is still in use elsewhere, but CloudFormation replaced it with a primitive type at Target
  importRegistry(released, {
    properties: { Target: { $ref: '#/definitions/TargetConfig' }, Other: { $ref: '#/definitions/TargetConfig' } },
    definitions: { TargetConfig: object({ Arn: { type: 'string' } }) },
  });
  importRegistry(db, {
    properties: { Target: { type: 'string' }, Other: { $ref: '#/definitions/TargetConfig' } },
    definitions: { TargetConfig: object({ Arn: { type: 'string' } }) },
  });

  importTypeHistory(db, released);
  const changes = compareL1(released, db);

  expect(history(resource(db).properties.Target)).toEqual(['string']);
  expect(history(resource(db).properties.Other)).toEqual(['TargetConfig']);
  expect(descriptions(changes)).toEqual([
    'cloudformation-change property Target: type changed from TargetConfig to string',
  ]);
});

test('released type history is kept for nested fields and attributes', () => {
  importRegistry(released, {
    properties: {
      Settings: { $ref: '#/definitions/Settings' },
      Status: { $ref: '#/definitions/StatusResponse' },
    },
    definitions: {
      Settings: object({ Source: { $ref: '#/definitions/SourceRequest' } }),
      SourceRequest: object({ Url: { type: 'string' } }),
      StatusResponse: object({ State: { type: 'string' } }),
    },
    readOnlyProperties: ['/properties/Status'],
  });
  importRegistry(db, {
    properties: {
      Settings: { $ref: '#/definitions/Settings' },
      Status: { $ref: '#/definitions/Status' },
    },
    definitions: {
      Settings: object({ Source: { $ref: '#/definitions/Source' } }),
      Source: object({ Url: { type: 'string' } }),
      Status: object({ State: { type: 'string' } }),
    },
    readOnlyProperties: ['/properties/Status'],
  });

  importTypeHistory(db, released);

  expect(history(typeDefinition('Settings').properties.Source)).toEqual(['SourceRequest', 'Source']);
  expect(history(resource(db).attributes.Status)).toEqual(['StatusResponse', 'Status']);
  expect(fields('StatusResponse')).toEqual({ State: 'string' });
});

test('a released newer type of a property stays in its history', () => {
  // The released build saw a rename that CloudFormation has since reverted
  importRegistry(released, {
    properties: { Configuration: { $ref: '#/definitions/Configuration' } },
    definitions: { Configuration: object({ Metric: { type: 'string' } }) },
  });
  importRegistry(released, {
    properties: { Configuration: { $ref: '#/definitions/MetricConfiguration' } },
    definitions: { MetricConfiguration: object({ Metric: { type: 'string' } }) },
  });
  importRegistry(db, {
    properties: { Configuration: { $ref: '#/definitions/Configuration' } },
    definitions: { Configuration: object({ Metric: { type: 'string' } }) },
  });

  importTypeHistory(db, released);

  expect(history(resource(db).properties.Configuration)).toEqual(['Configuration', 'MetricConfiguration']);
});

test('a released union keeps its place in the history only if all its types survive', () => {
  importRegistry(released, {
    properties: {
      Kept: { oneOf: [{ $ref: '#/definitions/OldChoice' }, { type: 'string' }] },
      Dropped: { oneOf: [{ $ref: '#/definitions/OldGone' }, { type: 'string' }] },
    },
    definitions: { OldChoice: object({ A: { type: 'string' } }), OldGone: object({ Removed: { type: 'string' } }) },
  });
  importRegistry(db, {
    properties: {
      Kept: { oneOf: [{ $ref: '#/definitions/Choice' }, { type: 'string' }] },
      Dropped: { oneOf: [{ $ref: '#/definitions/Gone' }, { type: 'string' }] },
    },
    definitions: { Choice: object({ A: { type: 'string' } }), Gone: object({ Other: { type: 'string' } }) },
  });

  importTypeHistory(db, released);

  expect(history(resource(db).properties.Kept)).toEqual(['OldChoice | string', 'Choice | string']);
  expect(history(resource(db).properties.Dropped)).toEqual(['Gone | string']);
});

test('a released union keeps a renamed member while another member keeps its name but not its fields', () => {
  importRegistry(released, {
    properties: { Target: { oneOf: [{ $ref: '#/definitions/OldChoice' }, { $ref: '#/definitions/Settings' }] } },
    definitions: { OldChoice: object({ A: { type: 'string' } }), Settings: object({ X: { type: 'string' } }) },
  });
  importRegistry(db, {
    properties: { Target: { oneOf: [{ $ref: '#/definitions/Choice' }, { $ref: '#/definitions/Settings' }] } },
    definitions: { Choice: object({ A: { type: 'string' } }), Settings: object({ Y: { type: 'string' } }) },
  });

  importTypeHistory(db, released);
  const changes = compareL1(released, db);

  expect(history(resource(db).properties.Target)).toEqual(['OldChoice | Settings', 'Choice | Settings']);
  expect(descriptions(changes.filter((c) => c.kind !== 'addition'))).toEqual([
    'cloudformation-change field Settings.X: removed from every current type',
  ]);
});

test('a released type that must be rendered for backwards compatibility keeps that flag', () => {
  importRegistry(released, {
    properties: { Settings: { $ref: '#/definitions/Settings' } },
    definitions: { Settings: object({ Url: { type: 'string' } }) },
  });
  resourceTypeDefinition(released, 'Settings').mustRenderForBwCompat = true;
  importRegistry(db, {
    properties: { Settings: { $ref: '#/definitions/Settings' } },
    definitions: { Settings: object({ Url: { type: 'string' } }) },
  });

  importTypeHistory(db, released);

  expect(typeDefinition('Settings').mustRenderForBwCompat).toBe(true);
});

test('a type that both databases have keeps the details of the current sources', () => {
  importRegistry(released, { properties: { Mode: { type: 'string', enum: ['BATCH', 'SERIAL'] } } });
  importRegistry(db, { properties: { Mode: { type: 'string' } } });

  importTypeHistory(db, released);

  expect(resource(db).properties.Mode).toEqual({ type: { type: 'string' } });
});

test('a nested read-only field and its attribute stay the same object', () => {
  const schema: Partial<CloudFormationRegistryResource> = {
    properties: { Endpoint: { $ref: '#/definitions/Endpoint' } },
    definitions: { Endpoint: object({ Name: { type: 'string' }, Address: { type: 'string' } }) },
    readOnlyProperties: ['/properties/Endpoint/Address'],
  };
  importRegistry(released, schema);
  importRegistry(db, schema);

  importTypeHistory(db, released);

  expect(resource(db).attributes['Endpoint.Address']).toBe(typeDefinition('Endpoint').properties.Address);
});

test('a released database that cannot be read fails the build', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'released-db-'));
  try {
    const pointer = path.join(dir, 'db.json.gz');
    fs.writeFileSync(pointer, 'version https://git-lfs.github.com/spec/v1\noid sha256:0\nsize 1\n');

    await expect(new DatabaseBuilder(db, {}).importTypeHistory(pointer).build()).rejects.toThrow(
      `Could not load the released database ${pointer} (if it is a Git LFS pointer, run 'git lfs pull')`,
    );
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test.each([
  ['the old schema first', ['old', 'new']],
  ['the renamed schema first', ['new', 'old']],
])('the released type stays the oldest type with %s', (_, order) => {
  importRegistry(released, oldSettingsSchema());
  for (const [i, which] of order.entries()) {
    importRegistry(db, which === 'old' ? oldSettingsSchema() : newSettingsSchema(), `region-${i}`);
  }

  importTypeHistory(db, released);

  expect(history(resource(db).properties.Settings)).toEqual(['SettingsRequest', 'Settings']);
  expect(fields('SettingsRequest')).toEqual({ Url: 'string' });
});

function oldSettingsSchema(): Partial<CloudFormationRegistryResource> {
  return {
    properties: { Settings: { $ref: '#/definitions/SettingsRequest' } },
    definitions: { SettingsRequest: object({ Url: { type: 'string' } }) },
  };
}

function newSettingsSchema(): Partial<CloudFormationRegistryResource> {
  return {
    properties: { Settings: { $ref: '#/definitions/Settings' } },
    definitions: { Settings: object({ Url: { type: 'string' } }, ['Url']) },
  };
}

function importRegistry(target: SpecDatabase, schema: Partial<CloudFormationRegistryResource>, region?: string) {
  importCloudFormationRegistryResource({
    db: target,
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

function object(properties: jsonschema.ObjectProperties, required?: string[]): jsonschema.RecordLikeObject {
  return { type: 'object', properties, required, additionalProperties: false };
}

function resource(target: SpecDatabase, typeName = RESOURCE) {
  return target.lookup('resource', 'cloudFormationType', 'equals', typeName).only();
}

function resourceTypeDefinition(target: SpecDatabase, name: string) {
  const found = target
    .follow('usesType', resource(target))
    .map((x) => x.entity)
    .filter((t) => t.name === name);
  expect(found).toHaveLength(1);
  return found[0];
}

function typeDefinition(name: string) {
  return resourceTypeDefinition(db, name);
}

function typeNames() {
  return db
    .follow('usesType', resource(db))
    .map((x) => x.entity.name)
    .sort();
}

function history(prop: Pick<Property, 'type' | 'previousTypes'>) {
  return new RichProperty(prop as Property).types().map((t) => new RichPropertyType(t).stringify(db, false));
}

type FieldAt = (target: SpecDatabase) => Pick<Property, 'type' | 'previousTypes'>;

function descriptions(changes: L1Change[]) {
  return changes.map((c) => `${c.kind} ${c.element}: ${c.description}`).sort();
}

function fields(typeName: string) {
  return Object.fromEntries(
    Object.entries(typeDefinition(typeName).properties).map(([name, prop]) => [
      name,
      `${history(prop).join(', ')}${prop.required ? ' (required)' : ''}`,
    ]),
  );
}

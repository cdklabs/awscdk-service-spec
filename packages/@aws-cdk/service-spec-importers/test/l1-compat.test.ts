import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { emptyDatabase, SpecDatabase } from '@aws-cdk/service-spec-types';
import { DatabaseBuilder } from '../src/db-builder';
import { importCloudFormationRegistryResource } from '../src/importers/import-cloudformation-registry';
import { importTypeHistory } from '../src/importers/import-type-history';
import { compareL1, formatL1Changes, L1Change, L1ChangeKind } from '../src/l1-compat';
import { ProblemReport } from '../src/report';
import { CloudFormationRegistryResource, jsonschema } from '../src/types';

const RESOURCE = 'AWS::Some::Type';

let released: SpecDatabase;
let current: SpecDatabase;
beforeEach(() => {
  released = emptyDatabase();
  current = emptyDatabase();
});

test('a renamed type whose fields still exist is a rename loss', () => {
  importRegistry(released, {
    properties: { Settings: { $ref: '#/definitions/SettingsRequest' } },
    definitions: { SettingsRequest: object({ Url: { type: 'string' } }) },
  });
  importRegistry(current, {
    properties: { Settings: { $ref: '#/definitions/Settings' } },
    definitions: { Settings: object({ Url: { type: 'string' } }) },
  });

  const changes = compareL1(released, current);

  expect(elements(changes, 'loss')).toEqual(['property Settings', 'type SettingsRequest']);
  expect(elements(changes, 'cloudformation-change')).toEqual([]);
});

test('a field that moved to a newer type of the same property is a merge loss', () => {
  importRegistry(released, {
    properties: { Destinations: { type: 'array', items: { $ref: '#/definitions/DestinationRequest' } } },
    definitions: { DestinationRequest: object({ StreamName: { type: 'string' }, Network: { type: 'string' } }) },
  });
  importRegistry(current, {
    properties: { Destinations: { type: 'array', items: { $ref: '#/definitions/DestinationRequest' } } },
    definitions: { DestinationRequest: object({ StreamName: { type: 'string' } }) },
  });
  importRegistry(current, {
    properties: { Destinations: { type: 'array', items: { $ref: '#/definitions/Destination' } } },
    definitions: { Destination: object({ StreamName: { type: 'string' }, Network: { type: 'string' } }) },
  });

  const changes = compareL1(released, current);

  expect(elements(changes, 'loss')).toEqual(['field DestinationRequest.Network']);
  expect(elements(changes, 'cloudformation-change')).toEqual([]);
  expect(elements(changes, 'addition')).toEqual(['type Destination']);
});

test('a field that no current type has any more is a CloudFormation change', () => {
  importRegistry(released, {
    properties: { Settings: { $ref: '#/definitions/Settings' } },
    definitions: { Settings: object({ Url: { type: 'string' }, Removed: { type: 'string' } }) },
  });
  importRegistry(current, {
    properties: { Settings: { $ref: '#/definitions/Settings' } },
    definitions: { Settings: object({ Url: { type: 'string' } }) },
  });

  const changes = compareL1(released, current);

  expect(elements(changes, 'loss')).toEqual([]);
  expect(elements(changes, 'cloudformation-change')).toEqual(['field Settings.Removed']);
});

test('a change from json to string and requiredness changes are CloudFormation changes', () => {
  importRegistry(released, {
    properties: { Policy: {}, Name: { type: 'string' }, Description: { type: 'string' } },
    required: ['Description'],
  });
  importRegistry(current, {
    properties: { Policy: { type: 'string' }, Name: { type: 'string' }, Description: { type: 'string' } },
    required: ['Name'],
  });

  const changes = compareL1(released, current);

  expect(elements(changes, 'loss')).toEqual([]);
  expect(descriptions(changes, 'cloudformation-change')).toEqual([
    'property Description: is no longer required',
    'property Name: is now required',
    'property Policy: type changed from json to string',
  ]);
});

test('a type that became a primitive type is a CloudFormation change', () => {
  importRegistry(released, {
    properties: { Settings: { $ref: '#/definitions/Settings' } },
    definitions: { Settings: object({ Url: { type: 'string' } }) },
  });
  importRegistry(current, { properties: { Settings: { type: 'string' } } });

  const changes = compareL1(released, current);

  expect(elements(changes, 'loss')).toEqual([]);
  expect(elements(changes, 'cloudformation-change')).toEqual(['property Settings', 'type Settings']);
});

test('a type shared by two properties loses a field that a newer type at one of its positions still has', () => {
  importRegistry(released, {
    properties: { First: { $ref: '#/definitions/Shared' }, Second: { $ref: '#/definitions/Shared' } },
    definitions: {
      Shared: object({ Other: { type: 'string' }, OnlyFirst: { type: 'string' }, Removed: { type: 'string' } }),
    },
  });
  importRegistry(current, {
    properties: { First: { $ref: '#/definitions/Shared' }, Second: { $ref: '#/definitions/Shared' } },
    definitions: { Shared: object({ Other: { type: 'string' } }) },
  });
  importRegistry(current, {
    properties: { First: { $ref: '#/definitions/FirstSettings' } },
    definitions: { FirstSettings: object({ Other: { type: 'string' }, OnlyFirst: { type: 'string' } }) },
  });

  const changes = compareL1(released, current);

  expect(elements(changes, 'loss')).toEqual(['field Shared.OnlyFirst']);
  expect(elements(changes, 'cloudformation-change')).toEqual(['field Shared.Removed']);
});

test('a newer type of a property that is no longer rendered is a loss while its fields still exist', () => {
  importRegistry(released, {
    properties: { Configuration: { $ref: '#/definitions/Configuration' } },
    definitions: { Configuration: object({ Metric: { type: 'string' } }) },
  });
  importRegistry(released, {
    properties: { Configuration: { $ref: '#/definitions/MetricConfiguration' } },
    definitions: { MetricConfiguration: object({ Metric: { type: 'string' } }) },
  });
  importRegistry(current, {
    properties: { Configuration: { $ref: '#/definitions/Configuration' } },
    definitions: { Configuration: object({ Metric: { type: 'string' } }) },
  });

  const changes = compareL1(released, current);

  expect(elements(changes, 'loss')).toEqual(['type MetricConfiguration']);
});

test('a renamed attribute type is a rename loss', () => {
  importRegistry(released, {
    properties: { Status: { $ref: '#/definitions/StatusResponse' } },
    definitions: { StatusResponse: object({ State: { type: 'string' } }) },
    readOnlyProperties: ['/properties/Status'],
  });
  importRegistry(current, {
    properties: { Status: { $ref: '#/definitions/Status' } },
    definitions: { Status: object({ State: { type: 'string' } }) },
    readOnlyProperties: ['/properties/Status'],
  });

  const changes = compareL1(released, current);

  expect(elements(changes, 'loss')).toEqual(['attribute Status', 'type StatusResponse']);
});

test('a renamed type inside a union or a map is a rename loss, and integer to number is no change', () => {
  importRegistry(released, {
    properties: {
      Choice: { oneOf: [{ $ref: '#/definitions/OldChoice' }, { type: 'string' }] },
      Lookup: { type: 'object', additionalProperties: { $ref: '#/definitions/OldEntry' } },
      Count: { type: 'integer' },
    },
    definitions: { OldChoice: object({ A: { type: 'string' } }), OldEntry: object({ B: { type: 'string' } }) },
  });
  importRegistry(current, {
    properties: {
      Choice: { oneOf: [{ $ref: '#/definitions/Choice' }, { type: 'string' }] },
      Lookup: { type: 'object', additionalProperties: { $ref: '#/definitions/Entry' } },
      Count: { type: 'number' },
    },
    definitions: { Choice: object({ A: { type: 'string' } }), Entry: object({ B: { type: 'string' } }) },
  });

  const changes = compareL1(released, current);

  expect(descriptions(changes, 'loss')).toEqual([
    'property Choice: type changed from OldChoice | string to Choice | string, but the fields of the released type A still exist in Choice',
    'property Lookup: type changed from Map<string, OldEntry> to Map<string, Entry>, but the fields of the released type B still exist in Entry',
    'type OldChoice: no longer rendered, but its fields A still exist in Choice',
    'type OldEntry: no longer rendered, but its fields B still exist in Entry',
  ]);
  expect(elements(changes, 'cloudformation-change')).toEqual([]);
});

test('a type that must be rendered for backwards compatibility is compared even when nothing uses it', () => {
  importRegistry(released, {
    properties: { Settings: { $ref: '#/definitions/Settings' } },
    definitions: { Settings: object({ Url: { type: 'string' } }) },
  });
  const unused = released.allocate('typeDefinition', { name: 'Unused', properties: {}, mustRenderForBwCompat: true });
  released.link('usesType', released.lookup('resource', 'cloudFormationType', 'equals', RESOURCE).only(), unused);
  importRegistry(current, {
    properties: { Settings: { $ref: '#/definitions/Settings' } },
    definitions: { Settings: object({ Url: { type: 'string' } }) },
  });

  const changes = compareL1(released, current);

  expect(elements(changes, 'cloudformation-change')).toEqual(['type Unused']);
});

test('removed resources and properties are CloudFormation changes', () => {
  importRegistry(released, { properties: { Kept: { type: 'string' }, Removed: { type: 'string' } } });
  importRegistry(released, { typeName: 'AWS::Some::Removed', properties: { Name: { type: 'string' } } });
  importRegistry(current, { properties: { Kept: { type: 'string' } } });

  const changes = compareL1(released, current);

  expect(changes.filter((c) => c.kind !== 'addition')).toEqual([
    expect.objectContaining({ kind: 'cloudformation-change', resource: 'AWS::Some::Removed', element: 'resource' }),
    expect.objectContaining({ kind: 'cloudformation-change', resource: RESOURCE, element: 'property Removed' }),
  ]);
});

test('additions are neither losses nor CloudFormation changes', () => {
  importRegistry(released, {
    properties: { Settings: { $ref: '#/definitions/Settings' } },
    definitions: { Settings: object({ Url: { type: 'string' } }) },
  });
  importRegistry(current, {
    properties: { Settings: { $ref: '#/definitions/Settings' }, Extra: { type: 'string' } },
    definitions: { Settings: object({ Url: { type: 'string' }, Added: { type: 'string' } }) },
  });
  importRegistry(current, { typeName: 'AWS::Some::New', properties: { Name: { type: 'string' } } });

  const changes = compareL1(released, current);

  expect(changes.map((c) => `${c.kind} ${c.resource} ${c.element}`)).toEqual([
    'addition AWS::Some::New resource',
    `addition ${RESOURCE} field Settings.Added`,
    `addition ${RESOURCE} property Extra`,
  ]);
});

test('a database built on the released type history has no losses', () => {
  importRegistry(released, {
    properties: {
      Settings: { $ref: '#/definitions/SettingsRequest' },
      Destinations: { type: 'array', items: { $ref: '#/definitions/DestinationRequest' } },
    },
    definitions: {
      SettingsRequest: object({ Url: { type: 'string' } }),
      DestinationRequest: object({ StreamName: { type: 'string' }, Network: { type: 'string' } }),
    },
  });
  importRegistry(current, {
    properties: {
      Settings: { $ref: '#/definitions/Settings' },
      Destinations: { type: 'array', items: { $ref: '#/definitions/DestinationRequest' } },
    },
    definitions: {
      Settings: object({ Url: { type: 'string' } }),
      DestinationRequest: object({ StreamName: { type: 'string' } }),
    },
  });
  importRegistry(current, {
    properties: { Destinations: { type: 'array', items: { $ref: '#/definitions/Destination' } } },
    definitions: { Destination: object({ StreamName: { type: 'string' }, Network: { type: 'string' } }) },
  });

  importTypeHistory(current, released);
  const changes = compareL1(released, current);

  expect(elements(changes, 'loss')).toEqual([]);
  expect(elements(changes, 'cloudformation-change')).toEqual([]);
});

test('the report lists losses and CloudFormation changes by resource and counts additions', () => {
  const report = formatL1Changes([
    { kind: 'loss', resource: RESOURCE, element: 'type Old', description: 'no longer rendered' },
    { kind: 'cloudformation-change', resource: RESOURCE, element: 'property Name', description: 'is now required' },
    { kind: 'addition', resource: RESOURCE, element: 'property New', description: 'added' },
  ]);

  expect(report).toEqual(
    [
      'L1 compatibility with the released database: FAIL (1 rename or merge losses, 1 CloudFormation changes, 1 additions)',
      '',
      'Rename or merge losses (these fail the check; the build lost released type history):',
      `  ${RESOURCE}`,
      '    type Old: no longer rendered',
      '',
      'CloudFormation changes (reported only):',
      `  ${RESOURCE}`,
      '    property Name: is now required',
    ].join('\n'),
  );
});

test('the build report lists losses and CloudFormation changes against the released database', async () => {
  importRegistry(released, {
    properties: { Settings: { $ref: '#/definitions/SettingsRequest' }, Removed: { type: 'string' } },
    definitions: { SettingsRequest: object({ Url: { type: 'string' } }) },
  });
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'released-db-'));
  try {
    const releasedFile = path.join(dir, 'db.json');
    fs.writeFileSync(releasedFile, JSON.stringify(released.save()));
    const reportDir = path.join(dir, 'report');

    const { report } = await new DatabaseBuilder(current, {})
      .addSourceImporter(async (db) =>
        importRegistry(db, {
          properties: { Settings: { $ref: '#/definitions/Settings' }, Added: { type: 'string' } },
          definitions: { Settings: object({ Url: { type: 'string' } }) },
        }),
      )
      .reportL1Compatibility(releasedFile)
      .build();
    await report.write(reportDir);

    expect(report.counts['l1-compatibility']).toBe(3);
    expect(fs.readFileSync(path.join(reportDir, 'AWS_Some.txt'), 'utf-8')).toContain(
      `CloudFormation change in ${RESOURCE} property Removed: removed`,
    );
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('a database compared with itself has no changes', () => {
  importRegistry(released, {
    properties: { Settings: { $ref: '#/definitions/Settings' } },
    definitions: { Settings: object({ Url: { type: 'string' } }) },
  });

  expect(compareL1(released, released)).toEqual([]);
});

function importRegistry(target: SpecDatabase, schema: Partial<CloudFormationRegistryResource>) {
  importCloudFormationRegistryResource({
    db: target,
    report: new ProblemReport(),
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

function elements(changes: L1Change[], kind: L1ChangeKind) {
  return changes
    .filter((c) => c.kind === kind)
    .map((c) => c.element)
    .sort();
}

function descriptions(changes: L1Change[], kind: L1ChangeKind) {
  return changes
    .filter((c) => c.kind === kind)
    .map((c) => `${c.element}: ${c.description}`)
    .sort();
}

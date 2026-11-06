import { createHash } from 'node:crypto';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { gzipSync } from 'node:zlib';
import { emptyDatabase, SpecDatabase } from '@aws-cdk/service-spec-types';
import { DatabaseBuilder } from '../src/db-builder';
import { importCloudFormationRegistryResource } from '../src/importers/import-cloudformation-registry';
import { ProblemReport } from '../src/report';
import { typeGate } from '../src/type-gate';
import { CloudFormationRegistryResource, jsonschema } from '../src/types';

const RESOURCE = 'AWS::Some::Type';

let dir: string;
let options: { snapshot: string; pins: string; mappings: string };
beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'type-history-build-'));
  options = {
    snapshot: path.join(dir, 'db.json.gz'),
    pins: path.join(dir, 'released-database.json'),
    mappings: path.join(dir, 'type-mappings.json'),
  };

  // The released Checks.C renders Check, but its newest type is already CustomCheck
  const released = emptyDatabase();
  importRegistry(released, checks('Check'));
  importRegistry(released, checks('CustomCheck'));
  const bytes = gzipSync(JSON.stringify(released.save()));
  fs.writeFileSync(options.snapshot, bytes);
  writePins(createHash('sha256').update(bytes).digest('hex'));
  fs.writeFileSync(options.mappings, '[]');
});
afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true });
});

test('the gate fails on an undecided case, and the build applies the printed entry once it is added', async () => {
  const first = await build();
  const gate = typeGate(first.typeHistory!.result, { mappingFile: options.mappings, baselineVersion: '1.2.3' });
  expect(gate.failed).toBe(true);
  const printed = gate.entries
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.startsWith('{'))
    .map((line) => JSON.parse(line));
  const split = printed.find((e) => e.kind === 'split');
  expect(split).toEqual({
    resource: RESOURCE,
    oldType: 'Check',
    newTypes: ['CustomCheck'],
    kind: 'split',
    reason: '<why this mapping is right>',
    pr: '<link to the pull request that adds this entry>',
  });

  fs.writeFileSync(
    options.mappings,
    JSON.stringify([
      { ...split, reason: 'Only C has a Configuration', pr: 'https://github.com/cdklabs/awscdk-service-spec/pull/1' },
    ]),
  );
  const second = await build();

  const result = second.typeHistory!.result;
  expect(typeGate(result, { mappingFile: options.mappings, baselineVersion: '1.2.3' }).failed).toBe(false);
  expect(result.applied.map((a) => `${a.entry.kind} ${a.positions.join(', ')}`)).toEqual(['split property Checks.C']);
  const types = second.db.follow(
    'usesType',
    second.db.lookup('resource', 'cloudFormationType', 'equals', RESOURCE).only(),
  );
  const checksType = types.find((t) => t.entity.name === 'Checks')!.entity;
  expect(second.db.get('typeDefinition', (checksType.properties.C.type as any).reference).name).toEqual('CustomCheck');
  expect(second.typeHistory!.released.pins.version).toEqual('1.2.3');
});

test('a malformed mapping entry fails the build, naming it', async () => {
  fs.writeFileSync(options.mappings, JSON.stringify([{ resource: RESOURCE, oldType: 'Check', kind: 'split' }]));

  await expect(build()).rejects.toThrow(`Invalid entry 1 in ${options.mappings} (${RESOURCE} Check): newTypes must be`);
});

test('a snapshot without the pinned sha256 fails the build', async () => {
  writePins('0'.repeat(64));

  await expect(build()).rejects.toThrow(`but ${options.pins} pins ${'0'.repeat(64)}`);
});

function build() {
  return new DatabaseBuilder(emptyDatabase(), {})
    .addSourceImporter(async (db) => importRegistry(db, checks('CustomCheck')))
    .importTypeHistory(options)
    .build();
}

function checks(cType: string): Partial<CloudFormationRegistryResource> {
  return {
    properties: { Checks: { $ref: '#/definitions/Checks' } },
    definitions: {
      Checks: object({
        A: { $ref: '#/definitions/Check' },
        B: { $ref: '#/definitions/Check' },
        C: { $ref: `#/definitions/${cType}` },
      }),
      Check: object({ Enabled: { type: 'boolean' } }),
      CustomCheck: object({ Enabled: { type: 'boolean' }, Configuration: { type: 'string' } }),
    },
  };
}

function writePins(sha256: string) {
  fs.writeFileSync(options.pins, JSON.stringify({ version: '1.2.3', integrity: 'sha512-c29tZSBieXRlcw==', sha256 }));
}

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

function object(properties: jsonschema.ObjectProperties): jsonschema.RecordLikeObject {
  return { type: 'object', properties, additionalProperties: false };
}

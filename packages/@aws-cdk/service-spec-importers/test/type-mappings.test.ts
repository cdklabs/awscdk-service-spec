import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { loadTypeMappings } from '../src/type-mappings';

const VALID = {
  resource: 'AWS::IoT::AccountAuditConfiguration',
  oldType: 'AuditCheckConfiguration',
  newTypes: ['DeviceCertExpirationAuditCheckConfiguration'],
  kind: 'split',
  reason: 'Only this check has a Configuration',
  pr: 'https://github.com/cdklabs/awscdk-service-spec/pull/1',
};

let dir: string;
let file: string;
beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'type-mappings-'));
  file = path.join(dir, 'type-mappings.json');
});
afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true });
});

test('valid entries load', async () => {
  fs.writeFileSync(
    file,
    JSON.stringify([VALID, { ...VALID, resource: 'AWS::Batch::JobDefinition', kind: 'keep-old' }]),
  );

  expect((await loadTypeMappings(file)).map((m) => `${m.resource} ${m.kind}`)).toEqual([
    'AWS::IoT::AccountAuditConfiguration split',
    'AWS::Batch::JobDefinition keep-old',
  ]);
});

test.each([
  [
    'an unknown kind',
    { kind: 'splt' },
    'kind must be one of rename, merge, split, replace, keep-old, follow-cloudformation',
  ],
  ['a missing reason', { reason: undefined }, 'reason must say why the mapping is right'],
  ['a placeholder reason', { reason: '<why this mapping is right>' }, 'reason must say why the mapping is right'],
  ['a link that is not a pull request', { pr: '<pull request link>' }, 'pr must link the pull request'],
  ['a resource that is not a CloudFormation type', { resource: 'IoT' }, 'resource must be a CloudFormation type'],
  ['new types that are not a list', { newTypes: 'DeviceCertExpirationAuditCheckConfiguration' }, 'newTypes must be'],
  ['two new types for a rename', { kind: 'rename', newTypes: ['A', 'B'] }, 'a rename names exactly one new type'],
  ['an unknown field', { newType: 'A' }, 'unknown field newType'],
])('an entry with %s fails, naming the entry', async (_, change, message) => {
  fs.writeFileSync(
    file,
    JSON.stringify([
      { ...VALID, resource: 'AWS::Batch::JobDefinition' },
      { ...VALID, ...change },
    ]),
  );

  const loading = loadTypeMappings(file);
  await expect(loading).rejects.toThrow(`Invalid entry 2 in ${file}`);
  await expect(loadTypeMappings(file)).rejects.toThrow(message);
});

test('two entries for the same released type fail', async () => {
  fs.writeFileSync(file, JSON.stringify([VALID, { ...VALID, kind: 'keep-old' }]));

  await expect(loadTypeMappings(file)).rejects.toThrow(
    `Invalid entry 2 in ${file} (AWS::IoT::AccountAuditConfiguration AuditCheckConfiguration): entry 1 already maps this type`,
  );
});

test('a file that is not a list of entries fails', async () => {
  fs.writeFileSync(file, JSON.stringify({ entries: [] }));

  await expect(loadTypeMappings(file)).rejects.toThrow(`${file} must hold a JSON list of entries`);
});

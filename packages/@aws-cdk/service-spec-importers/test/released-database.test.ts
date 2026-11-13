import { createHash } from 'node:crypto';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { gzipSync } from 'node:zlib';
import { emptyDatabase } from '@aws-cdk/service-spec-types';
import { loadReleasedDatabase } from '../src/released-database';

let dir: string;
let snapshot: string;
let pins: string;
beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'released-db-'));
  snapshot = path.join(dir, 'db.json.gz');
  pins = path.join(dir, 'pins.json');
});
afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true });
});

test('a snapshot with the pinned sha256 loads', async () => {
  const bytes = databaseBytes('AWS::Some::Type');
  fs.writeFileSync(snapshot, bytes);
  writePins({ sha256: sha256(bytes) });

  const released = await loadReleasedDatabase(snapshot, pins);

  expect(released.pins.version).toEqual('1.2.3');
  expect(released.db.all('resource').map((r) => r.cloudFormationType)).toEqual(['AWS::Some::Type']);
});

test('a snapshot whose sha256 differs from the pin fails, naming the fix', async () => {
  const pinned = databaseBytes('AWS::Some::Type');
  const other = databaseBytes('AWS::Other::Type');
  fs.writeFileSync(snapshot, other);
  writePins({ sha256: sha256(pinned) });

  await expect(loadReleasedDatabase(snapshot, pins)).rejects.toThrow(
    `${snapshot} has sha256 ${sha256(other)}, but ${pins} pins ${sha256(pinned)}`,
  );
  await expect(loadReleasedDatabase(snapshot, pins)).rejects.toThrow('npx projen update-source:released-database');
});

test('a Git LFS pointer fails, naming the fix', async () => {
  fs.writeFileSync(snapshot, 'version https://git-lfs.github.com/spec/v1\noid sha256:0\nsize 1\n');
  writePins({ sha256: sha256(databaseBytes('AWS::Some::Type')) });

  await expect(loadReleasedDatabase(snapshot, pins)).rejects.toThrow(
    `${snapshot} is a Git LFS pointer, not the database: run 'git lfs pull'`,
  );
});

test.each([
  ['a missing sha256', { version: '1.2.3', integrity: 'sha512-abc' }],
  ['a sha256 that is not hex', { version: '1.2.3', integrity: 'sha512-abc', sha256: 'xyz' }],
  ['a version that is not a version', { version: 'latest', integrity: 'sha512-abc', sha256: 'a'.repeat(64) }],
  ['an integrity that is not sha512', { version: '1.2.3', integrity: 'md5-abc', sha256: 'a'.repeat(64) }],
])('a pin file with %s fails, naming the file', async (_, content) => {
  fs.writeFileSync(snapshot, databaseBytes('AWS::Some::Type'));
  fs.writeFileSync(pins, JSON.stringify(content));

  await expect(loadReleasedDatabase(snapshot, pins)).rejects.toThrow(`Invalid pin file ${pins}`);
});

function databaseBytes(resourceType: string) {
  const db = emptyDatabase();
  db.allocate('resource', {
    cloudFormationType: resourceType,
    name: 'Type',
    attributes: {},
    properties: {},
  });
  return gzipSync(JSON.stringify(db.save()));
}

function writePins(override: { sha256: string }) {
  fs.writeFileSync(
    pins,
    JSON.stringify({ version: '1.2.3', integrity: 'sha512-c29tZSBieXRlcw==', ...override }, undefined, 2),
  );
}

function sha256(bytes: Buffer) {
  return createHash('sha256').update(bytes).digest('hex');
}

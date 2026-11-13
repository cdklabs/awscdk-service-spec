import { createHash } from 'node:crypto';
import { promises as fs } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { emptyDatabase, SpecDatabase } from '@aws-cdk/service-spec-types';

/**
 * The pins of the released database that a build uses as its baseline
 */
export interface ReleasedDatabasePins {
  /** The @aws-cdk/aws-service-spec version */
  readonly version: string;
  /** The npm `dist.integrity` of that version's tarball */
  readonly integrity: string;
  /** The sha256 of that version's `db.json.gz` */
  readonly sha256: string;
}

export interface ReleasedDatabase {
  readonly db: SpecDatabase;
  readonly pins: ReleasedDatabasePins;
}

const LFS_POINTER = 'version https://git-lfs.github.com/spec/v1';

/**
 * Load a released database snapshot, refusing it unless it has the sha256 of the pin file
 */
export async function loadReleasedDatabase(snapshotPath: string, pinsPath: string): Promise<ReleasedDatabase> {
  const pins = await readReleasedDatabasePins(pinsPath);
  const bytes = await fs.readFile(snapshotPath);

  if (bytes.subarray(0, LFS_POINTER.length).toString('utf-8') === LFS_POINTER) {
    throw new Error(`${snapshotPath} is a Git LFS pointer, not the database: run 'git lfs pull'`);
  }
  const actual = createHash('sha256').update(bytes).digest('hex');
  if (actual !== pins.sha256) {
    throw new Error(
      [
        `${snapshotPath} has sha256 ${actual}, but ${pinsPath} pins ${pins.sha256}.`,
        `Restore the snapshot with 'git lfs pull', or, to move to another release, set the version, integrity and sha256 in ${pinsPath} together and run 'npx projen' and 'npx projen update-source:released-database'.`,
      ].join(' '),
    );
  }

  const db = emptyDatabase();
  db.load(JSON.parse(gunzipSync(bytes).toString('utf-8')));
  return { db, pins };
}

/**
 * Read and check a pin file
 */
export async function readReleasedDatabasePins(pinsPath: string): Promise<ReleasedDatabasePins> {
  const invalid = (why: string) => new Error(`Invalid pin file ${pinsPath}: ${why}`);

  let pins: any;
  try {
    pins = JSON.parse(await fs.readFile(pinsPath, 'utf-8'));
  } catch (e: any) {
    throw invalid(e.message);
  }
  if (typeof pins !== 'object' || pins === null) {
    throw invalid('expected an object with version, integrity and sha256');
  }
  if (typeof pins.version !== 'string' || !/^\d+\.\d+\.\d+$/.test(pins.version)) {
    throw invalid(`version must be a version like 1.2.3, got ${JSON.stringify(pins.version)}`);
  }
  if (typeof pins.integrity !== 'string' || !/^sha512-[A-Za-z0-9+/]+={0,2}$/.test(pins.integrity)) {
    throw invalid(`integrity must be an npm sha512 integrity, got ${JSON.stringify(pins.integrity)}`);
  }
  if (typeof pins.sha256 !== 'string' || !/^[0-9a-f]{64}$/.test(pins.sha256)) {
    throw invalid(`sha256 must be 64 lowercase hex digits, got ${JSON.stringify(pins.sha256)}`);
  }
  return { version: pins.version, integrity: pins.integrity, sha256: pins.sha256 };
}

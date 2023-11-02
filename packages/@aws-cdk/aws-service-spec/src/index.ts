import { promises as fs, readFileSync } from 'node:fs';
import * as path from 'node:path';
import { gunzipSync } from 'node:zlib';
import { emptyDatabase, SpecDatabase } from '@aws-cdk/service-spec-types';

const DB_COMPRESSED = 'db.json.gz';
const DB_PATH = path.join(__dirname, '..', DB_COMPRESSED);

/**
 * Load the provided built-in database
 */
export async function loadAwsServiceSpec(): Promise<SpecDatabase> {
  return loadBufferIntoDatabase(await fs.readFile(DB_PATH));
}

/**
 * Synchronously load the provided built-in database
 */
export function loadAwsServiceSpecSync(): SpecDatabase {
  return loadBufferIntoDatabase(readFileSync(DB_PATH));
}

function loadBufferIntoDatabase(spec: Buffer): SpecDatabase {
  const db = emptyDatabase();
  db.load(JSON.parse(gunzipSync(spec).toString('utf-8')));
  return db;
}

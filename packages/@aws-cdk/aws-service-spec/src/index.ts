import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import { gunzipSync } from 'node:zlib';
import { emptyDatabase, SpecDatabase } from '@aws-cdk/service-spec-types';

const DB_COMPRESSED = 'db.json.gz';

/**
 * Load the provided built-in database
 */
export async function loadAwsServiceSpec(): Promise<SpecDatabase> {
  const spec = await fs.readFile(path.join(__dirname, '..', DB_COMPRESSED));
  const db = emptyDatabase();
  db.load(JSON.parse(gunzipSync(spec).toString('utf-8')));
  return db;
}

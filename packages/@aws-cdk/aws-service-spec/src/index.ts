import { promises as fs } from 'fs';
import path from 'path';
import { gunzipSync } from 'zlib';
import { emptyDatabase, SpecDatabase } from '@aws-cdk/service-spec';

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

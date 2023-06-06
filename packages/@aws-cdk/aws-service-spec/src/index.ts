import { promises as fs } from 'fs';
import path from 'path';
import { emptyDatabase, SpecDatabase } from '@aws-cdk/service-spec';

/**
 * Load the provided built-in database
 */
export async function loadAwsServiceSpec(): Promise<SpecDatabase> {
  const spec = await fs.readFile(path.join(__dirname, '..', 'db.json'), { encoding: 'utf-8' });
  const db = emptyDatabase();
  db.load(JSON.parse(spec));
  return db;
}

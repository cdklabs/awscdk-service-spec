import { emptyDatabase } from '@aws-cdk/service-spec';
import fs from 'fs-extra';

const pathToDb = require.resolve('@aws-cdk/service-spec-build/db.json');

export async function loadDatabase() {
  const spec = fs.readJson(pathToDb);
  const db = emptyDatabase();
  db.load(await spec);
  return db;
}

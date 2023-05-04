import { SpecDatabase, emptyDatabase } from '@aws-cdk/service-spec';
import * as fs from 'fs-extra';

const pathToDb = require.resolve('@aws-cdk/service-spec-build/db.json');

export async function loadDatabase() {
  const spec = fs.readJson(pathToDb);
  const db = emptyDatabase();
  db.load(await spec);
  return db;
}

export function getAllServices(db: SpecDatabase) {
  return db.all('service');
}

export function getServicesByCloudFormationNamespace(db: SpecDatabase, services?: string[]) {
  if (!services) {
    return getAllServices(db);
  }

  return services.flatMap((name) => db.lookup('service', 'cloudFormationNamespace', 'equals', name));
}

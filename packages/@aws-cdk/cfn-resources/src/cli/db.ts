import { buildDatabase } from '@aws-cdk/service-spec-build';
import { SchemaValidation } from '@aws-cdk/service-spec-sources';

export async function loadDatabase() {
  const { db } = await buildDatabase({
    validateJsonSchema: SchemaValidation.NONE,
  });

  return db;
}

import { emptyDatabase } from '@aws-cdk/service-spec';
import * as sources from '@aws-cdk/service-spec-sources';
import { SchemaValidation } from '@aws-cdk/service-spec-sources';
import { Failures } from '@cdklabs/tskb';
import { loadCloudFormationRegistryResource } from './cloudformation-registry';

export interface BuildDatabaseOptions {
  readonly validateJsonSchema?: SchemaValidation;
}

export async function buildDatabase(options: BuildDatabaseOptions = {}) {
  const db = emptyDatabase();
  const fails: Failures = [];

  for (const resources of await sources.loadDefaultCloudFormationRegistryResources(options.validateJsonSchema)) {
    fails.push(...resources.failures);

    const region = db.allocate('region', {
      name: resources.regionName,
    });

    for (const resource of resources.resources) {
      loadCloudFormationRegistryResource(db, region, resource, fails);
    }
  }

  return { db, fails };
}

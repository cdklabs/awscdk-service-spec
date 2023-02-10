import { emptyDatabase } from '@aws-cdk/service-spec';
import * as sources from '@aws-cdk/service-spec-sources';
import { Failures } from '@cdklabs/tskb';
import { loadCloudFormationRegistryResource } from './cloudformation-registry';

export async function buildDatabase() {
  const db = emptyDatabase();
  const fails: Failures = [];

  for (const resources of await sources.loadDefaultCloudFormationRegistryResources()) {
    const region = db.allocate('region', {
      name: resources.regionName,
    });

    for (const resource of Object.values(resources)) {
      loadCloudFormationRegistryResource(db, region, resource, fails);
    }
  }

  return { db, fails };
}
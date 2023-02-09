import { emptyDatabase } from '@aws-cdk/service-spec';
import * as sources from '@aws-cdk/service-spec-sources';
import { loadCloudFormationRegistryResource } from './cloudformation-registry';
import { Failures } from '@cdklabs/tskb';

export function buildDatabase() {
  const db = emptyDatabase();
  const fails: Failures = [];

  for (const [key, resources] of Object.entries(sources.CloudFormationSchema)) {
    const regionName = key.replace(/_/g, '-'); // us_east_1 -> us-east-1

    const region = db.allocate('region', {
      name: regionName,
    });

    for (const resource of Object.values(resources)) {
      loadCloudFormationRegistryResource(db, region, resource, fails);
    }
  }

  return { db, fails };
}
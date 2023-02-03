import { emptyDatabase } from '@aws-cdk/service-spec';
import * as sources from '@aws-cdk/service-spec-sources';
import { loadCloudFormationRegistryResource } from './cloudformation-registry';

export function buildDatabase() {
  const db = emptyDatabase();

  for (const [key, resources] of Object.entries(sources.CloudFormationSchema)) {
    const regionName = key.replace(/_/g, '-'); // us_east_1 -> us-east-1

    const region = db.allocate('region', {
      name: regionName,
    });

    for (const resource of Object.values(resources)) {
      loadCloudFormationRegistryResource(db, region, resource);
    }
  }

  const svc = db.allocate('service', {
    name: '',
    shortName: '',
  });
  const res = db.allocate('resource', {
    attributes: {},
    cloudFormationType: '',
    name: '',
    properties: {},
  });

  const xs = db.follow('hasResource', svc);
  console.log(xs[0]);
  const ys = db.incoming('hasResource', res);
  console.log(ys[0]);

  return db;
}

buildDatabase();
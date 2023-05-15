import { SpecDatabase } from '@aws-cdk/service-spec';
import { StatefulResources } from '@aws-cdk/service-spec-sources';

export function importStatefulResources(db: SpecDatabase, stateful: StatefulResources) {
  for (const [typeName, _] of Object.entries(stateful.ResourceTypes)) {
    for (const res of db.lookup('resource', 'cloudFormationType', 'equals', typeName)) {
      res.isStateful = true;
    }
  }
}

import { SpecDatabase } from '@aws-cdk/service-spec-types';
import { StatefulResources } from '../types';

export function importStatefulResources(db: SpecDatabase, stateful: StatefulResources) {
  for (const [typeName, _] of Object.entries(stateful.ResourceTypes)) {
    for (const res of db.lookup('resource', 'cloudFormationType', 'equals', typeName)) {
      res.isStateful = true;
    }
  }
}

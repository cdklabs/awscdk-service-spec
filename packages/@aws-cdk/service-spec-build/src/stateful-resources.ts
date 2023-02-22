import { SpecDatabase } from '@aws-cdk/service-spec';
import { StatefulResources } from '@aws-cdk/service-spec-sources';
import { Failures } from '@cdklabs/tskb';

export function readStatefulResources(db: SpecDatabase, stateful: StatefulResources, fails: Failures) {
  Array.isArray(fails);

  for (const [typeName, attrs] of Object.entries(stateful.ResourceTypes)) {
    for (const res of db.lookup('resource', 'cloudFormationType', 'equals', typeName)) {
      res.isStateful = true;

      Array.isArray(attrs);
    }
  }
}

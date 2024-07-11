import { SpecDatabase } from '@aws-cdk/service-spec-types';
import { GetAttAllowList } from '../types';

/**
 * From the given allowlist, turn the given properties into attributes
 */
export function importGetAttAllowList(db: SpecDatabase, allowList: GetAttAllowList) {
  for (const [resourceType, propNames] of Object.entries(allowList)) {
    const resource = db.lookup('resource', 'cloudFormationType', 'equals', resourceType).only();

    for (const propName of propNames) {
      if (resource.attributes[propName]) {
        // Already exists
        continue;
      }

      if (!resource.properties[propName]) {
        // No such property
        continue;
      }

      resource.attributes[propName] = {
        documentation: resource.properties[propName].documentation,
        type: resource.properties[propName].type,
      };
    }
  }
}

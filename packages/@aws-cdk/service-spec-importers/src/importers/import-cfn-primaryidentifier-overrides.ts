import { SpecDatabase } from '@aws-cdk/service-spec-types';
import { CfnPrimaryIdentifierOverrides } from '../types';

/**
 * For the given resources, update the primary identifiers of these resources
 */
export function importCfnPrimaryIdentifierOverrides(db: SpecDatabase, allowList: CfnPrimaryIdentifierOverrides) {
  const errors = new Array<string>();

  for (const [resourceType, propNames] of Object.entries(allowList)) {
    try {
      const resource = db.lookup('resource', 'cloudFormationType', 'equals', resourceType).only();

      for (const propName of propNames) {
        if (!resource.attributes[propName] && !resource.properties[propName]) {
          errors.push(`No such property in CFN Primary Identifiers Override file: ${resourceType}.${propName}`);
        }

        resource.cfnRefIdentifier = propNames;
      }
    } catch (e: any) {
      errors.push(e.message);
    }
  }

  if (errors.length > 0) {
    throw new Error(errors.join('\n'));
  }
}

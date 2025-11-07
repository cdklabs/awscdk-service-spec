import { JsonLens, makeCompositePatcher } from '../patching';

export const patchOobRelationships = makeCompositePatcher();

/**
 * Removes relationships from one CloudFormation service to another
 * within JSON arrays matching the given service path.
 *
 * @param resource - Resource whose relationships are inspected (i.e AWS::Lambda::Function)
 * @param propertyPath - Property path / name to remvove the relationships from (i.e Code/S3Bucket)
 * @param targetResource - Target resource of the relationship (i.e AWS::S3::Bucket)
 * @param targetProperty - Property path of the relationship (i.e /properties/BucketName)
 */

export function removeRelationship({
  resource,
  propertyPath,
  targetResource,
  targetProperty,
  reason,
}: {
  resource: string;
  propertyPath: string;
  targetResource: string;
  targetProperty: string;
  reason: string;
}) {
  return (lens: JsonLens) => {
    if (!lens.isJsonArray()) return;
    if (lens.jsonPointer !== `/${resource}/relationships/${lens.escapeKey(propertyPath)}`) return;

    const filtered = lens.value.filter(
      (e) => !(hasRelationship(e) && e.cloudformationType === targetResource && e.propertyPath === targetProperty),
    );
    if (lens.value.length !== filtered.length) {
      lens.replaceValue(reason, filtered);
    }
  };
}

interface HasRelationship {
  cloudformationType: string;
  propertyPath: string;
}

function hasRelationship(e: any): e is HasRelationship {
  return (
    typeof e === 'object' &&
    e !== null &&
    'cloudformationType' in e &&
    typeof (e as any).cloudformationType === 'string' &&
    'propertyPath' in e &&
    typeof (e as any).propertyPath === 'string'
  );
}

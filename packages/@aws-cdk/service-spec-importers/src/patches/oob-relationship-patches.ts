import { JsonLens, makeCompositePatcher } from '../patching';

export const patchOobRelationships = makeCompositePatcher(
  removeAllRelationships({
    resource: 'AWS::CloudWatch::Alarm',
    propertyPath: 'Dimensions/Value',
    reason: 'Dimension Value is too generic to have meaningful relationships',
  }),
  removeAllRelationships({
    resource: 'AWS::CloudWatch::Alarm',
    propertyPath: 'Metrics/MetricStat/Metric/Dimensions/Value',
    reason: 'Dimension Value is too generic to have meaningful relationships',
  }),
  removeRelationship({
    resource: 'AWS::ApiGateway::Stage',
    propertyPath: 'RestApiId',
    targetResource: 'AWS::Logs::LogGroup',
    targetProperty: '/properties/LogGroupName',
    reason: 'RestApiId should not reference LogGroup.LogGroupName',
  }),
  removeRelationship({
    resource: 'AWS::S3::Bucket',
    propertyPath: 'BucketName',
    targetResource: 'AWS::S3::BucketPolicy',
    targetProperty: '/properties/Bucket',
    reason: 'BucketName should not reference BucketPolicy.Bucket',
  }),
);

/**
 * Removes all relationships from a property path by replacing the array with an empty array.
 *
 * @param resource - Resource whose relationships are inspected (i.e AWS::Lambda::Function)
 * @param propertyPath - Property path / name to remove all relationships from (i.e Code/S3Bucket)
 * @param reason - Reason for removing the relationships
 */
export function removeAllRelationships({
  resource,
  propertyPath,
  reason,
}: {
  resource: string;
  propertyPath: string;
  reason: string;
}) {
  return (lens: JsonLens) => {
    if (!lens.isJsonArray()) return;
    if (lens.jsonPointer !== `/${resource}/relationships/${lens.escapeKey(propertyPath)}`) return;

    // Replace the array with an empty array to remove all relationships
    if (lens.value.length > 0) {
      lens.replaceValue(reason, []);
    }
  };
}

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

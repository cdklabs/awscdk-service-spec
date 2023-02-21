import { jsonschema } from './JsonSchema';

/**
 * Root class of a CloudFormation Resource Registry Schema
 *
 * @see https://docs.aws.amazon.com/cloudformation-cli/latest/userguide/resource-type-schema.html
 */
export interface CloudFormationRegistryResource extends ImplicitJsonSchemaRecord {
  readonly $schema?: string;
  readonly $comment?: string;

  readonly typeName: string;
  readonly sourceUrl?: string;
  readonly documentationUrl?: string;
  readonly description: string;

  /**
   * JSON pointers for properties that will cause a resource replacement if they are changed
   */
  readonly createOnlyProperties?: string[];

  /**
   * JSON pointers for properties that *may* cause a resource replacement if they are changed
   */
  readonly conditionalCreateOnlyProperties?: string[];

  /**
   * JSON pointers for properties that can only be read, not updated.
   *
   * This is typically used for generated identifiers and such.
   */
  readonly readOnlyProperties?: string[];

  /**
   * JSON pointers for properties that can only be written, never read.
   *
   * This is typically used for secrets.
   */
  readonly writeOnlyProperties?: string[];

  /**
   * The properties that make up the primary identifier of the resource.
   *
   * This is the value that is returned by `{ Ref }`. If there is more than one property
   * they are joined using the symbol `"|"`.
   */
  readonly primaryIdentifier?: string[];

  /**
   * Reusable schema type definitions used in this schema.
   */
  readonly definitions?: Record<string, jsonschema.Schema>; // FIXME: Kaizen changed this from ConcreteSchema to fix 1 isue.
  readonly handlers?: Handlers;
  readonly tagging?: ResourceTagging;
  readonly taggable?: boolean;

  /**
   * Not sure what this is
   */
  readonly additionalIdentifiers?: string[][];
  readonly replacementStrategy?: ReplacementStrategy;

  readonly deprecatedProperties?: string[];

  /**
   * How to construct a console link for a resource
   */
  readonly resourceLink?: ResourceLink;

  /**
   * Functions to apply to properties
   *
   * Example:
   *
   * ```
   * "propertyTransform" : {
   *   "/properties/DBClusterIdentifier" : "$lowercase(DBClusterIdentifier)",
   *   "/properties/DBClusterSnapshotIdentifier" : "$lowercase(DBClusterSnapshotIdentifier)",
   *   "/properties/MasterUserSecret/KmsKeyId" : "$join([\"arn:(aws)[-]{0,1}[a-z]{0,2}[-]{0,1}[a-z]{0,3}:kms:[a-z]{2}[-]{1}[a-z]{3,10}[-]{0,1}[a-z]{0,10}[-]{1}[1-3]{1}:[0-9]{12}[:]{1}key\\/\", KmsKeyId])",
   *   "/properties/KmsKeyId" : "$join([\"arn:(aws)[-]{0,1}[a-z]{0,2}[-]{0,1}[a-z]{0,3}:kms:[a-z]{2}[-]{1}[a-z]{3,10}[-]{0,1}[a-z]{0,10}[-]{1}[1-3]{1}:[0-9]{12}[:]{1}key\\/\", KmsKeyId])",
   *   "/properties/PerformanceInsightsKMSKeyId" : "$join([\"arn:(aws)[-]{0,1}[a-z]{0,2}[-]{0,1}[a-z]{0,3}:kms:[a-z]{2}[-]{1}[a-z]{3,10}[-]{0,1}[a-z]{0,10}[-]{1}[1-3]{1}:[0-9]{12}[:]{1}key\\/\", PerformanceInsightsKMSKeyId])"
   * },
   * ```
   */
  readonly propertyTransform?: Record<string, string>;
}

export type ReplacementStrategy = 'delete_then_create';

export interface Handlers {
  readonly create?: Handler;
  readonly read?: Handler;
  readonly update?: Handler;
  readonly delete?: Handler;
  readonly list?: Handler;
}

export interface Handler {
  readonly permissions: string[];
  readonly timeoutInMinutes?: number;
}

export type ImplicitJsonSchemaRecord = Omit<jsonschema.RecordLikeObject, 'type'>;

export interface ResourceTagging {
  readonly taggable?: boolean;
  readonly tagOnCreate?: boolean;
  readonly tagUpdatable?: boolean;
  readonly cloudFormationSystemTags?: boolean;
  readonly tagProperty?: string;
}


export interface ResourceLink {
  /**
   * Example:
   *
   * ```
   * /cloudwatch/home?region=${awsRegion}#logsV2:log-groups/log-group/${LogGroupName}/edit-metric-filter/${MetricName}
   * ```
   */
  readonly templateUri: string;

  /**
   * Example:
   *
   * `{ MetricName: '/MetricName', 'LogGroupName': '/LogGroupName' }`
   */
  readonly mappings?: Record<string, string>;
}

/**
 * Turn a JSON pointer into a property name
 *
 * Turns `"/properties/hello"`, which the CloudFormation Registry Schema uses -> `"hello"`.
 */
export function simplePropNameFromJsonPtr(propRef: string) {
  const prefix = '/properties/';
  if (!propRef.startsWith(prefix)) {
    throw new Error(`'${propRef}' should start with '${prefix}'`);
  }
  return propRef.substring(prefix.length);
}
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

  /**
   * Whether the resource is taggable
   *
   * @deprecated use 'tagging' instead
   * @default true
   */
  readonly taggable?: boolean;

  /**
   * Extended tagging settings
   */
  readonly tagging?: ResourceTagging;

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

  /**
   * Technically this should have been canonicalized out, but that will complicate a lot of the rest of the code.
   *
   * So we allow embedded oneOfs/anyOfs, only at the top level.
   */
  readonly oneOf?: CommonTypeCombinatorFields[];
  readonly anyOf?: CommonTypeCombinatorFields[];
}

/**
 * Type combinator fields we commonly see at the resource level
 *
 * (They can be nested)
 */
export interface CommonTypeCombinatorFields {
  readonly required?: string[];
  readonly type?: string;
  readonly oneOf?: CommonTypeCombinatorFields[];
  readonly anyOf?: CommonTypeCombinatorFields[];
  readonly allOf?: CommonTypeCombinatorFields[];
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
  /**
   * Whether the resource is taggable
   *
   * @default true
   */
  readonly taggable?: boolean;

  /**
   * Whether this resource type supports tagging resources upon creation.
   *
   * @default true
   */
  readonly tagOnCreate?: boolean;

  /**
   * Whether this resource type supports updating tags during resource update operations.
   *
   * @default true
   */
  readonly tagUpdatable?: boolean;

  /**
   * Whether this resource type supports CloudFormation system tags.
   * @default true
   */
  readonly cloudFormationSystemTags?: boolean;

  /**
   * A reference to where you have defined the Tags property in this resource type schema.
   *
   * @default '/properties/Tags'
   */
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

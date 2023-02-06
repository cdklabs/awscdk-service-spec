import { jsonschema } from "./JsonSchema";

export interface CloudFormationRegistryResource extends ImplicitJsonSchemaObject {
  readonly $schema?: string;
  readonly $comment?: string;

  readonly typeName: string;
  readonly sourceUrl?: string;
  readonly documentationUrl?: string;
  readonly description: string;
  readonly createOnlyProperties?: string[];
  /**
   * FIXME: wut?
   */
  readonly conditionalCreateOnlyProperties?: string[];
  readonly readOnlyProperties?: string[];
  readonly writeOnlyProperties?: string[];
  readonly primaryIdentifier?: string[];
  readonly definitions?: Record<string, jsonschema.Schema>;
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

export type ImplicitJsonSchemaObject = Omit<jsonschema.Object, 'type'>;

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
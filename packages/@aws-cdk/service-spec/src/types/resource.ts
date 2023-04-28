import { Entity, evolutionInvariant, impliesU, Invariant, Reference, Relationship } from '@cdklabs/tskb';

export const Invariants: Invariant[] = [];

export interface Partition extends Entity {
  readonly partition: string;
}

export type HasRegion = Relationship<Partition, Region, { isPrimary?: boolean }>;

export interface Service extends Entity {
  /**
   * The full name of the service including the group prefix, lowercased and hyphenated.
   *
   * E.g. `AWS::DynamoDB` -> `aws-dynamodb`
   *
   * @example aws-dynamodb
   */
  readonly name: string;
  /**
   * Only the service part of the name, lowercased.
   *
   * E.g. `AWS::DynamoDB` -> `dynamodb`
   *
   * @example dynamodb
   */
  readonly shortName: string;
  /**
   * The shortname of the service in capitalized form
   *
   * E.g. `AWS::DynamoDB` -> `DynamoDB`
   *
   * @example dynamodb
   */
  readonly capitalized: string;
  /**
   * The complete cloudformation style namespace of the service
   *
   * E.g. `AWS::DynamoDB`
   *
   * @example dynamodb
   */
  readonly cloudFormationNamespace: string;
}

export interface Region extends Entity {
  readonly name: string;
  readonly description?: string;
}

export interface Documentation extends Entity {
  readonly markdown: string;
}

export interface Resource extends Entity {
  readonly name: string;
  readonly cloudFormationType: string;
  documentation?: string;
  readonly properties: ResourceProperties;
  readonly attributes: Record<string, Attribute>;
  readonly validations?: unknown;
  identifier?: ResourceIdentifier;
  isStateful?: boolean;

  /**
   * The name of the property that contains the tags
   *
   * Undefined if the resource is not taggable.
   */
  tagPropertyName?: string;

  /**
   * Whether changes to this resource need to be scrutinized
   *
   * @default ResourceScrutinyType.NONE
   */
  scrutinizable?: ResourceScrutinyType;
}

export type ResourceProperties = Record<string, Property>;

export interface TypeDefinition extends Entity {
  readonly name: string;
  documentation?: string;
  readonly properties: ResourceProperties;
}

export interface Property {
  documentation?: string;
  required?: boolean;
  type: PropertyType;
  wasOnceJson?: boolean;

  /**
   * A string representation the default value of this property
   *
   * This value is not directly functional; it describes how the underlying resource
   * will behave if the value is not specified.
   *
   * @default - Default unknown
   */
  defaultValue?: string;

  /**
   * Whether this property is deprecated
   *
   * @default - Not deprecated
   */
  deprecated?: Deprecation;

  /**
   * Whether changes to this property needs to be scrutinized specially
   *
   * @default PropertyScrutinyType.NONE
   */
  scrutinizable?: PropertyScrutinyType;
}

export interface Attribute {
  documentation?: string;
  type: PropertyType;
}

export enum Deprecation {
  /**
   * Not deprecated
   */
  NONE = 'NONE',

  /**
   * Warn about use
   */
  WARN = 'WARN',

  /**
   * Do not emit the value at all
   *
   * (Handle properties that were incorrectly added to the spec)
   */
  IGNORE = 'IGNORE',
}

// FIXME: Should properties & attributes be entities or not?

Invariants.push(
  evolutionInvariant<Property>('wasOnceJson may never be switched off', (prev, cur) =>
    impliesU(prev.wasOnceJson, cur.wasOnceJson),
  ),
);

export type PropertyType =
  | PrimitiveType
  | TagType
  | DefinitionReference
  | ArrayType<PropertyType>
  | MapType<PropertyType>
  | TypeUnion<PropertyType>;

export type PrimitiveType = StringType | NumberType | BooleanType | JsonType | DateTimeType | NullType;

export function isPrimitiveType(x: PropertyType): x is PrimitiveType {
  return (x as any).type;
}

export interface TagType {
  readonly type: 'tag';
  /**
   * Used to instruct cdk.TagManager how to handle tags
   */
  readonly variant: TagVariant;
  /**
   * The original type of the property.
   * Some tag variants use the original type definition.
   */
  readonly original: PropertyType;
}

export type TagVariant = 'standard' | 'asg' | 'map';

export interface StringType {
  readonly type: 'string';
}

export interface NumberType {
  readonly type: 'number';
}

export interface BooleanType {
  readonly type: 'boolean';
}

export interface JsonType {
  readonly type: 'json';
}

export interface NullType {
  readonly type: 'null';
}

export interface DateTimeType {
  readonly type: 'date-time';
}

export interface DefinitionReference {
  readonly type: 'ref';
  readonly reference: Reference<TypeDefinition>;
}

export interface ArrayType<E> {
  readonly type: 'array';
  readonly element: E;
}

export interface MapType<E> {
  readonly type: 'map';
  readonly element: E;
}

export interface TypeUnion<E> {
  readonly type: 'union';
  readonly types: E[];
}

export type HasResource = Relationship<Service, Resource>;
export type RegionHasResource = Relationship<Region, Resource>;
export type RegionHasService = Relationship<Region, Service>;
export type ResourceDoc = Relationship<Resource, Documentation>;

export type ServiceInRegion = Relationship<Region, Service>;
export type ResourceInRegion = Relationship<Region, Resource>;

export type UsesType = Relationship<Resource, TypeDefinition>;

export interface ResourceIdentifier extends Entity {
  readonly arnTemplate?: string;
  readonly primaryIdentifier?: string[];
}

/**
 * Mark a resource as a resource that needs additional scrutiy when added, removed or changed
 *
 * Used to mark resources that represent security policies.
 */
export enum ResourceScrutinyType {
  /**
   * No additional scrutiny
   */
  None = 'None',

  /**
   * An externally attached policy document to a resource
   *
   * (Common for SQS, SNS, S3, ...)
   */
  ResourcePolicyResource = 'ResourcePolicyResource',

  /**
   * This is an IAM policy on an identity resource
   *
   * (Basically saying: this is AWS::IAM::Policy)
   */
  IdentityPolicyResource = 'IdentityPolicyResource',

  /**
   * This is a Lambda Permission policy
   */
  LambdaPermission = 'LambdaPermission',

  /**
   * An ingress rule object
   */
  IngressRuleResource = 'IngressRuleResource',

  /**
   * A set of egress rules
   */
  EgressRuleResource = 'EgressRuleResource',
}

/**
 * Mark a property as a property that needs additional scrutiny when it changes
 *
 * Used to mark sensitive properties that have security-related implications.
 */
export enum PropertyScrutinyType {
  /**
   * No additional scrutiny
   */
  None = 'None',

  /**
   * This is an IAM policy directly on a resource
   */
  InlineResourcePolicy = 'InlineResourcePolicy',

  /**
   * Either an AssumeRolePolicyDocument or a dictionary of policy documents
   */
  InlineIdentityPolicies = 'InlineIdentityPolicies',

  /**
   * A list of managed policies (on an identity resource)
   */
  ManagedPolicies = 'ManagedPolicies',

  /**
   * A set of ingress rules (on a security group)
   */
  IngressRules = 'IngressRules',

  /**
   * A set of egress rules (on a security group)
   */
  EgressRules = 'EgressRules',
}

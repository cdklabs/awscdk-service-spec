import { Entity, Relationship } from '@cdklabs/tskb';
import { ArrayType, MapType, GenericPropertyType, GenericDefinitionReference } from './common';
import { SpecDatabase } from './database';
import { sortKeyComparator } from '../util/sorting';

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
  /**
   * If set, this CloudFormation Transform is required by the resource
   */
  cloudFormationTransform?: string;
  documentation?: string;
  primaryIdentifier?: string[];
  readonly properties: ResourceProperties;
  readonly attributes: Record<string, Attribute>;
  readonly validations?: unknown;
  arnTemplate?: string;
  isStateful?: boolean;
  vendedLogs?: VendedLog;
  vendedLogsConfig?: VendedLogs[];

  /**
   * Information about the taggability of this resource
   *
   * Undefined if the resource is not taggable.
   */
  tagInformation?: TagInformation;

  /**
   * Whether changes to this resource need to be scrutinized
   *
   * @default ResourceScrutinyType.NONE
   */
  scrutinizable?: ResourceScrutinyType;

  /**
   * Additional paths to properties that also cause replacement.
   *
   * This is to indicate that certain property paths into this resource
   * will cause replacement; only replacements that cannot be represented
   * by tagging the property in a type definition will be included here
   * (for example, because the tagged property would be in a predefined
   * type like `tag`).
   *
   * All properties in this list should be treated as `causesReplacement: 'yes'`.
   *
   * @default -
   */
  additionalReplacementProperties?: string[][];
}

export type ResourceProperties = Record<string, Property>;

export interface TypeDefinition extends Entity {
  readonly name: string;
  documentation?: string;
  readonly properties: ResourceProperties;

  /**
   * If true, render this type even if it is unused.
   */
  mustRenderForBwCompat?: boolean;
}

export interface Property {
  /**
   * Description of the property
   */
  documentation?: string;

  /**
   * Is this property required
   *
   * @default false
   */
  required?: boolean;

  /**
   * The current type of this property
   */
  type: PropertyType;

  /**
   * An ordered list of previous types of this property in ascending order
   *
   * Does not include the current type, use `type` for this.
   */
  previousTypes?: PropertyType[];

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

  /**
   * Whether the containing resource will be replaced if this property is changed
   *
   * @default 'no'
   */
  causesReplacement?: 'yes' | 'no' | 'maybe';

  /**
   * Relationship references to other CloudFormation resources
   */
  relationshipRefs?: RelationshipRef[];
}

export class RichTypedField {
  constructor(private readonly field: Pick<Property, 'type' | 'previousTypes'>) {
    if (field === undefined) {
      throw new Error('Field is undefined');
    }
  }

  public types(): PropertyType[] {
    return [...(this.field.previousTypes ?? []), this.field.type];
  }

  /**
   * Update the type of this property with a new type
   *
   * Only if it's not in the set of types already.
   *
   * Returns true if the type was updated.
   */
  public updateType(type: PropertyType): boolean {
    const richType = new RichPropertyType(type);

    // Only add this type if we don't already have it. We are only doing comparisons where 'integer' and 'number'
    // are treated the same, for all other types we need strict equality. We used to use 'assignableTo' as a
    // condition, but these types will be rendered in both co- and contravariant positions, and so we really can't
    // do much better than full equality.
    if (this.types().some((t) => richType.equals(t))) {
      // Nothing to do, type is already in there.
      return false;
    }

    // Special case: if the new type is `string` and the old type is `date-time`, we assume this is
    // the same type but we dropped some formatting information. No need to make this a separate type.
    if (type.type === 'string' && this.types().some((t) => t.type === 'date-time')) {
      return false;
    }

    // Special case: if the new type is `string` and the old type is `json`, we assume this is a correction
    // of a bug; the old type was incorrectly typed as Json, and we're now correcting this. Since this was a
    // bug, we don't need to keep the old type: it was never accurate.
    //
    // We could be more broad, and only maintain type history if we go from
    // `json` -> `named type`, or `named type` -> `named type`.  For now I'm
    // wary of destroying too much information; we'll just do the fix specifically
    // for `json` -> `string`.
    if (type.type === 'string' && this.field.type.type === 'json') {
      this.field.type = type;
      return true;
    }

    if (!this.field.previousTypes) {
      this.field.previousTypes = [];
    }
    this.field.previousTypes.push(this.field.type);
    this.field.type = type;
    return true;
  }
}

export class RichProperty extends RichTypedField {
  constructor(property: Property) {
    super(property);
  }
}

export class RichAttribute extends RichTypedField {
  constructor(attr: Attribute) {
    super(attr);
  }
}

export interface Attribute {
  documentation?: string;
  type: PropertyType;
  /**
   * An ordered list of previous types of this property in ascending order
   *
   * Does not include the current type, use `type` for this.
   */
  previousTypes?: PropertyType[];
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

export function isCollectionType(x: PropertyType): x is ArrayType<any> | MapType<any> {
  return x.type === 'array' || x.type === 'map';
}

export interface TagInformation {
  /**
   * Name of the property that holds the tags
   */
  readonly tagPropertyName: string;

  /**
   * Used to instruct cdk.TagManager how to handle tags
   */
  readonly variant: TagVariant;
}

export type TagVariant = 'standard' | 'asg' | 'map';

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

  /**
   * AWS::SSO::Assignment
   *
   * IAM Identity Center (formerly known as SSO)
   */
  SsoAssignmentResource = 'SsoAssignmentResource',

  /**
   * AWS::SSO::InstanceAccessControlAttributeConfiguration
   *
   * IAM Identity Center (formerly known as SSO)
   */
  SsoInstanceACAConfigResource = 'SsoInstanceACAConfigResource',

  /**
   * AWS::SSO::PermissionSet
   *
   * IAM Identity Center (formerly known as SSO)
   */
  SsoPermissionSet = 'SsoPermissionSet',
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

/**
 * Represents a relationship reference to another CloudFormation resource
 */
export interface RelationshipRef {
  /**
   * The CloudFormation resource type this property references
   */
  readonly cloudFormationType: string;

  /**
   * The property name within the referenced resource (e.g., "Id")
   */
  readonly propertyName: string;
}

export type DestinationService = 'S3' | 'CWL' | 'FH' | 'XRAY';

/**
 * Represents the types of logs a Cloudformation Resource can produce and what destinations can consume them
 */
export interface VendedLog {
  /**
   * What version of permissions the destination supports V1 | V2
   */
  readonly permissionsVersion: string;
  /**
   * List of the types of logs a Cloudformation resource can produce
   */
  readonly logTypes: string[];
  /**
   * List of the destinations the can consume those logs
   */
  readonly destinations: DestinationService[];
}

/**
 * Represents a delivery destination that a Cloudformation resource can send logs to
 */
export interface DeliveryDestination {
  /**
   * The type of service that is ingesting the logs, can be S3 | FH | CWL | XRAY
   */
  readonly destinationType: string;
  /**
   * Format of the logs that are send to this destination, can be json | plain | w3c | raw | parquet
   */
  readonly outputFormat?: string;
}

/**
 * Represents a type of log that a Cloudformation Resource can produce and what destinations can consume them
 */
export interface VendedLogs {
  /**
   * What version of permissions the destination supports V1 | V2
   */
  readonly permissionsVersion: string;
  /**
   * Type of log a Cloudformation resource can produce
   */
  readonly logType: string;
  /**
   * List of the destinations the can consume those logs
   */
  readonly destinations: DeliveryDestination[];
}

export class RichPropertyType {
  constructor(private readonly type: PropertyType) {}

  public equals(rhs: PropertyType): boolean {
    switch (this.type.type) {
      case 'integer':
      case 'boolean':
      case 'date-time':
      case 'json':
      case 'null':
      case 'number':
      case 'string':
      case 'tag':
        return rhs.type === this.type.type;
      case 'array':
      case 'map':
        return rhs.type === this.type.type && new RichPropertyType(this.type.element).equals(rhs.element);
      case 'ref':
        return rhs.type === 'ref' && this.type.reference.$ref === rhs.reference.$ref;
      case 'union':
        const lhsKey = this.sortKey();
        const rhsKey = new RichPropertyType(rhs).sortKey();
        return lhsKey.length === rhsKey.length && lhsKey.every((l, i) => l === rhsKey[i]);
    }
  }

  /**
   * Whether the current type is JavaScript-equal to the RHS type
   *
   * Same as normal equality, but consider `integer` and `number` the same types.
   */
  public javascriptEquals(rhs: PropertyType): boolean {
    switch (this.type.type) {
      case 'number':
      case 'integer':
        // Widening
        return rhs.type === 'integer' || rhs.type === 'number';

      case 'array':
      case 'map':
        return rhs.type === this.type.type && new RichPropertyType(this.type.element).javascriptEquals(rhs.element);

      case 'union':
        if (rhs.type !== 'union') {
          return false;
        }
        // Every type in this union needs to be equal one type in RHS
        return this.type.types.every((t1) => rhs.types.some((t2) => new RichPropertyType(t1).javascriptEquals(t2)));

      default:
        // For anything else, need strict equality
        return this.equals(rhs);
    }
  }

  /**
   * Whether the current type is assignable to the RHS type.
   *
   * This is means every type member of the LHS must be present in the RHS type
   */
  public assignableTo(rhs: PropertyType): boolean {
    const extractMembers = (type: PropertyType): PropertyType[] => (type.type == 'union' ? type.types : [type]);
    const asRichType = (type: PropertyType): RichPropertyType => new RichPropertyType(type);

    const rhsMembers = extractMembers(rhs);
    for (const lhsMember of extractMembers(this.type).map(asRichType)) {
      if (!rhsMembers.some((type) => lhsMember.equals(type))) {
        return false;
      }
    }

    return true;
  }

  /**
   * Return a version of this type, but with all type unions in a regularized order
   */
  public normalize(db: SpecDatabase): RichPropertyType {
    switch (this.type.type) {
      case 'array':
      case 'map':
        return new RichPropertyType({
          type: this.type.type,
          element: new RichPropertyType(this.type.element).normalize(db).type,
        });
      case 'union':
        const types = this.type.types
          .map((t) => new RichPropertyType(t).normalize(db))
          .map((t) => [t, t.sortKey(db)] as const);
        types.sort(sortKeyComparator(([_, sortKey]) => sortKey));
        return new RichPropertyType({
          type: 'union',
          types: types.map(([t, _]) => t.type),
        });
      default:
        return this;
    }
  }

  public stringify(db: SpecDatabase, withId = true): string {
    switch (this.type.type) {
      case 'integer':
      case 'boolean':
      case 'date-time':
      case 'json':
      case 'null':
      case 'number':
      case 'string':
      case 'tag':
        return this.type.type;
      case 'array':
        return `Array<${new RichPropertyType(this.type.element).stringify(db, withId)}>`;
      case 'map':
        return `Map<string, ${new RichPropertyType(this.type.element).stringify(db, withId)}>`;
      case 'ref':
        const type = db.get('typeDefinition', this.type.reference);
        return withId ? `${type.name}(${this.type.reference.$ref})` : type.name;
      case 'union':
        return this.type.types.map((t) => new RichPropertyType(t).stringify(db, withId)).join(' | ');
    }
  }

  /**
   * Return a sortable key based on this type
   *
   * If a database is given, type definitions will be sorted based on type name,
   * otherwise on identifier
   */
  public sortKey(db?: SpecDatabase): string[] {
    switch (this.type.type) {
      case 'integer':
      case 'boolean':
      case 'date-time':
      case 'json':
      case 'null':
      case 'number':
      case 'string':
      case 'tag':
        return ['0', this.type.type];
      case 'array':
      case 'map':
        return ['1', this.type.type, ...new RichPropertyType(this.type.element).sortKey(db)];
      case 'ref':
        return ['2', this.type.type, db?.get('typeDefinition', this.type.reference)?.name ?? this.type.reference.$ref];
      case 'union':
        const typeKeys = this.type.types.map((t) => new RichPropertyType(t).sortKey(db));
        typeKeys.sort(sortKeyComparator((x) => x));
        return ['3', this.type.type, ...typeKeys.flatMap((x) => x)];
    }
  }
}

export type PropertyType = GenericPropertyType<TypeDefinition>;
export type DefinitionReference = GenericDefinitionReference<TypeDefinition>;

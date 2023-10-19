import { Entity, Reference, Relationship } from '@cdklabs/tskb';
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
  readonly properties: ResourceProperties;
  readonly attributes: Record<string, Attribute>;
  readonly validations?: unknown;
  identifier?: ResourceIdentifier;
  isStateful?: boolean;

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

export type PropertyType =
  | PrimitiveType
  | DefinitionReference
  | BuiltinTagType
  | ArrayType<PropertyType>
  | MapType<PropertyType>
  | TypeUnion<PropertyType>;

export type PrimitiveType =
  | StringType
  | NumberType
  | IntegerType
  | BooleanType
  | JsonType
  | DateTimeType
  | NullType
  | BuiltinTagType;

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

export interface StringType {
  readonly type: 'string';
}
export interface BuiltinTagType {
  readonly type: 'tag';
}

export interface NumberType {
  readonly type: 'number';
}

export interface IntegerType {
  readonly type: 'integer';
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

/**
 * The "legacy" tag type (used in the old resource spec)
 */
export interface BuiltinTagType {
  readonly type: 'tag';
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

  public sortKey(): string[] {
    switch (this.type.type) {
      case 'integer':
      case 'boolean':
      case 'date-time':
      case 'json':
      case 'null':
      case 'number':
      case 'string':
      case 'tag':
        return [this.type.type];
      case 'array':
      case 'map':
        return [this.type.type, ...new RichPropertyType(this.type.element).sortKey()];
      case 'ref':
        return [this.type.type, this.type.reference.$ref];
      case 'union':
        const typeKeys = this.type.types.map((t) => new RichPropertyType(t).sortKey());
        typeKeys.sort(sortKeyComparator((x) => x));
        return [this.type.type, ...typeKeys.flatMap((x) => x)];
    }
  }
}

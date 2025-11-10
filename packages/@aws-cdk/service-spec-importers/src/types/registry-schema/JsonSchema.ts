import { CommonTypeCombinatorFields } from './CloudFormationRegistrySchema';

export namespace jsonschema {
  export type Schema = SingletonSchema | OneOf<Schema> | AnyOf<Schema> | AllOf<Schema>;

  export type SingletonSchema = Reference | ConcreteSingletonSchema;

  export type ConcreteSchema =
    | ConcreteSingletonSchema
    | OneOf<ConcreteSchema>
    | AnyOf<ConcreteSchema>
    | AllOf<ConcreteSchema>;

  export type ConcreteSingletonSchema = Object | String | SchemaArray | Boolean | Number | Null | AnyType;

  export type AnyType = true | EmptyObject;

  export type EmptyObject = Record<string, never>;

  export function isAnyType(x: Schema | CommonTypeCombinatorFields): x is AnyType {
    return x === true || isEmptyObject(x);
  }

  function isEmptyObject(x: any) {
    return x && typeof x === 'object' && !Array.isArray(x) && Object.keys(x).length === 0;
  }

  function isTypeDefined(x: any) {
    return 'type' in x && !('$ref' in x);
  }

  export interface Annotatable {
    readonly $comment?: string;
    readonly description?: string;
    readonly title?: string;
  }

  export interface Reference extends Annotatable {
    readonly type?: 'object';
    readonly $ref: string;

    /**
     * From json-schema.org:
     * ---------------------------
     * In Draft 4-7, $ref behaves a differently to the latest spec.
     * When an object contains a $ref property, the object is considered a reference, not a schema.
     * Therefore, any other properties you put in that object will not be treated as JSON Schema keywords and will be ignored by the validator.
     * $ref can only be used where a schema is expected.
     * ---------------------------
     *
     * In this project we are dealing with Draft 7.
     * Therefor $ref SHOULD NOT have any other properties.
     * If it does, they should be patched out.
     *
     * Either way, we MUST NOT but a generic map type here (like `[k: string]: unknown;).
     * This would break all useful type-checking and lead to mistakes.
     */
  }

  export type CombiningSchema<X> = UnionSchema<X> | AllOf<X>;

  export type UnionSchema<X> = AnyOf<X> | OneOf<X>;

  export function isUnionSchema(x: jsonschema.Schema): x is UnionSchema<jsonschema.Schema>;
  export function isUnionSchema(x: jsonschema.ConcreteSchema): x is UnionSchema<jsonschema.ConcreteSchema>;
  export function isUnionSchema(x: jsonschema.Schema): x is UnionSchema<jsonschema.Schema> {
    return jsonschema.isAnyOf(x) || jsonschema.isOneOf(x);
  }

  export function isCombining(x: ConcreteSchema): x is CombiningSchema<ConcreteSchema> {
    return isOneOf(x) || isAnyOf(x) || isAllOf(x);
  }

  export function isConcreteSingleton(x: ConcreteSchema): x is ConcreteSingletonSchema {
    return !isCombining(x);
  }

  export function isObject(x: ConcreteSchema): x is Object {
    return isConcreteSingleton(x) && !isAnyType(x) && x.type === 'object';
  }

  export type Object = MapLikeObject | RecordLikeObject;

  export interface AnyOf<S> extends Annotatable {
    readonly anyOf: Array<S>;
  }

  /**
   * Determines whether or not the provided schema represents an `anyOf` type operator.
   */
  export function isAnyOf(x: Schema | CommonTypeCombinatorFields): x is AnyOf<any> {
    if (x && !isAnyType(x) && 'anyOf' in x) {
      for (const elem of x.anyOf!) {
        if (
          elem &&
          !isAnyType(elem) &&
          (isTypeDefined(elem) || isReference(elem) || isAnyOf(elem) || isOneOf(elem) || containsRelationship(elem))
        ) {
          return true;
        }
      }
    }
    return false;
  }

  export interface OneOf<S> extends Annotatable {
    readonly oneOf: Array<S>;
  }

  export function innerSchemas<E extends Schema>(x: CombiningSchema<E>): E[] {
    if (isOneOf(x)) {
      return x.oneOf;
    } else if (isAnyOf(x)) {
      return x.anyOf;
    } else {
      return x.allOf;
    }
  }

  /**
   * Determines whether or not the provided schema represents a `oneOf` type operator.
   */
  export function isOneOf(x: Schema | CommonTypeCombinatorFields): x is OneOf<any> {
    if (x && !isAnyType(x) && 'oneOf' in x) {
      for (const elem of x.oneOf!) {
        if (
          !isAnyType(elem) &&
          (isTypeDefined(elem) || isReference(elem) || isAnyOf(elem) || isOneOf(elem) || containsRelationship(elem))
        ) {
          return true;
        }
      }
    }
    return false;
  }

  export interface AllOf<S> extends Annotatable {
    readonly allOf: Array<S>;
  }

  /**
   * Determines whether or not the provided schema represents an `allOf` type operator.
   */
  export function isAllOf(x: Schema): x is AllOf<any> {
    return !isAnyType(x) && 'allOf' in x;
  }

  export interface MapLikeObject extends Annotatable {
    readonly type: 'object';
    /**
     * additionalProperties validates all keys that aren't otherwise validated by properties or patternProperties
     *
     * @default true
     */
    readonly additionalProperties?: false | Schema;
    readonly patternProperties?: Record<string, Schema>;
    readonly minProperties?: number;
    readonly maxProperties?: number;

    /**
     * Required keys in a map
     *
     * Doesn't really make a whole lot of sense, but this is used to support mixed map/record types.
     */
    readonly required?: string[];
  }

  export interface Null extends Annotatable {
    readonly type: 'null';
  }

  export type ObjectProperties = Record<string, Schema>;

  export interface RecordLikeObject extends Annotatable {
    readonly type: 'object';
    readonly properties: ObjectProperties;
    readonly required?: string[];
    readonly oneOf?: (CommonTypeCombinatorFields | RecordLikeObject)[];
    readonly anyOf?: (CommonTypeCombinatorFields | RecordLikeObject)[];
    /**
     * FIXME: should be required but some service teams have omitted it.
     */
    readonly additionalProperties?: false;

    /**
     * FIXME: these are weird but oh hey?
     */
    readonly minProperties?: number;
    readonly maxProperties?: number;
  }

  export function isRecordLikeObject(x: Object): x is RecordLikeObject {
    const ret = !!(x as RecordLikeObject).properties;

    // Do a sanity check of our understanding
    if ((ret && (x as MapLikeObject).additionalProperties) || (x as MapLikeObject).patternProperties) {
      throw new Error(
        `object with properties should not have additionalProperties or patternProperties: ${JSON.stringify(x)}`,
      );
    }

    return ret;
  }

  export function isMapLikeObject(x: Object): x is MapLikeObject {
    return !(x as RecordLikeObject).properties;
  }

  /**
   * Relationship as defined in the CloudFormation Registry Schema.
   * Represents how resource property relationships are specified in the source schema files.
   */
  export interface RelationshipRefSchema {
    /** The cloudFormationType (e.g. 'AWS::S3::Bucket') */
    readonly typeName: string;
    /** The property path (e.g. '/properties/BucketName') */
    readonly propertyPath: string;
  }

  /**
   * Determines if a schema is a relationshipRef
   */
  export function isRelationshipRef(x: any): x is RelationshipRefSchema {
    return (
      x &&
      'typeName' in x &&
      typeof x.typeName === 'string' &&
      'propertyPath' in x &&
      typeof x.propertyPath === 'string'
    );
  }

  /**
   * Determines if a schema contains a relationshipRef
   * This function handles the two following cases:
   * { type: 'string', relationshipRef: {...} } -> occurs when there a single relationship for a property
   * { relationshipRef: {...} } -> occurs when there are multiple relationships as the source data looks like this:
   * { type: 'string', anyOf: [ { relationshipRef: {...} }, ...]} (the type is not present along relationshipRef)
   */
  export function containsRelationship(x: any): boolean {
    return x && typeof x === 'object' && 'relationshipRef' in x && isRelationshipRef(x.relationshipRef);
  }

  export interface String extends Annotatable {
    readonly type: 'string';
    readonly default?: string;
    readonly minLength?: number;
    readonly maxLength?: number;
    readonly pattern?: string;
    readonly const?: string;
    readonly enum?: string[];
    readonly format?: 'date-time' | 'uri' | 'timestamp';
    readonly examples?: string[];
    readonly relationshipRef?: RelationshipRefSchema;
  }

  export function isString(x: ConcreteSchema): x is String {
    return isConcreteSingleton(x) && !isAnyType(x) && x.type === 'string';
  }

  export interface Number extends Annotatable {
    readonly type: 'number' | 'integer';
    readonly default?: number;
    readonly enum?: number[];
    readonly minimum?: number;
    readonly maximum?: number;
    readonly format?: 'int64' | 'double';
    readonly multipleOf?: number;
  }

  export interface SchemaArray extends Annotatable {
    readonly type: 'array';
    readonly items?: Schema;
    readonly uniqueItems?: boolean;

    /**
     * Whether to treat the order as significant
     *
     * In other words, does this array model a "sequence" or a "multiset".
     *
     * - `true` (default): order is significant, the array is a sequence.
     * - `false`: order is insignificant, the array is a set.
     */
    readonly insertionOrder?: boolean;
    readonly maxItems?: number;
    readonly minItems?: number;
    // /**
    //  * FIXME: exists but is not valid json schema.
    //  */
    // readonly maxLength?: number;
    // /**
    //  * FIXME: exists but is not valid json schema.
    //  */
    // readonly minLength?: number;
    readonly default?: any[];
    readonly examples?: any[];

    /**
     * Does this array describe full reality?
     *
     * - If `Standard`, real elements must be exactly equal to the given array.
     * - If `AttributeList`, the real array may be a superset of the given array.
     *
     * @see https://github.com/aws-cloudformation/cloudformation-resource-schema#arraytype
     */
    readonly arrayType?: 'AttributeList' | 'Standard';
  }

  export function isArray(x: ConcreteSchema): x is SchemaArray {
    return isConcreteSingleton(x) && !isAnyType(x) && x.type === 'array';
  }

  export interface Boolean extends Annotatable {
    readonly type: 'boolean';
    readonly default?: boolean;
  }

  export const RESOLVED_REFERENCE_SYMBOL = Symbol('resolved-reference');
  export type IsResolved = {
    /**
     * If the sub-schema was resolved from a reference, the full reference is in here
     */
    readonly [RESOLVED_REFERENCE_SYMBOL]: string | undefined;
  };

  export type ResolvedSchema = (Exclude<ConcreteSchema, AnyType> & IsResolved) | AnyType;

  export function isResolvedSchema(x: Schema): x is ResolvedSchema {
    return !isAnyType(x) && RESOLVED_REFERENCE_SYMBOL in x;
  }

  /**
   * Returns the full reference if the given sub-schema was resolved from a reference
   */
  export function setResolvedReference(x: ConcreteSchema, ref: string | undefined = undefined): ResolvedSchema {
    (x as any)[RESOLVED_REFERENCE_SYMBOL] = ref;

    return x as ResolvedSchema;
  }

  /**
   * Returns the full reference if the given sub-schema was resolved from a reference
   */
  export function resolvedReference(x: jsonschema.Schema): string | undefined {
    if (isAnyType(x) || !isResolvedSchema(x)) {
      return undefined;
    }
    return x[RESOLVED_REFERENCE_SYMBOL];
  }

  /**
   * Returns the reference name (the last part of it), if the given sub-schema was resolved from a reference
   */
  export function resolvedReferenceName(x: jsonschema.Schema): string | undefined {
    return resolvedReference(x)?.split('/').at(-1);
  }

  /**
   * Make a resolver function that will resolve `$ref` entries with respect to the given document root.
   */
  export function makeResolver(root: any) {
    const resolve = (ref: Schema, weird?: boolean): ResolvedSchema => {
      console.log(`weird: ${weird}`);
      // Don't resolve again if schema is already resolved
      if (isResolvedSchema(ref)) {
        return ref;
      }

      if (!isReference(ref)) {
        // If this is a oneOf or anyOf, make sure the types inside the oneOf or anyOf get resolve
        if (isOneOf(ref)) {
          return setResolvedReference({
            oneOf: ref.oneOf.map((x) => resolve(x)),
          });
        } else if (isAnyOf(ref)) {
          return setResolvedReference({
            anyOf: ref.anyOf.map((x) => resolve(x)),
          });
        } else if (isAllOf(ref)) {
          return setResolvedReference({
            allOf: ref.allOf.map((x) => resolve(x)),
          });
        } else if (isArray(ref) && ref.items) {
          return setResolvedReference({
            ...ref,
            items: resolve(ref.items),
          });
        } else {
          return isAnyType(ref) ? ref : setResolvedReference(ref);
        }
      }

      const path = ref.$ref;
      if (!path.startsWith('#/')) {
        throw new Error(`Can only resolve references inside the same file, got '${path}'`);
      }

      const parts = path.substring(2).split('/');
      let current;
      if (weird == true) {
        current = root.Content;
        console.log('WEIRD');
      }
      current = root;
      let lastKey: string | undefined;
      while (true) {
        if (parts.length === 0) {
          break;
        }
        lastKey = parts.shift()!;
        current = current[lastKey];
      }
      if (current === undefined) {
        throw new Error(`Invalid $ref: ${path}`);
      }

      // Some funny people have decided to reference a reference, so we might
      // need to recurse here.
      if (isReference(current)) {
        return resolve(current);
      }
      return setResolvedReference(current, path);
    };

    return resolve;
  }

  /**
   * The type of a resolver function
   */
  export type Resolver = ReturnType<typeof makeResolver>;

  export function isReference(x: Schema | CommonTypeCombinatorFields): x is Reference {
    if (x === undefined) {
      debugger;
    }
    return !isAnyType(x) && '$ref' in x;
  }

  export interface TopLevelFields {
    readonly $id?: string;

    /**
     * Reusable schema type definitions used in this schema.
     */
    readonly definitions?: Record<string, jsonschema.Schema>; // FIXME: Kaizen changed this from ConcreteSchema to fix 1 isue.
  }

  export type SchemaFile = jsonschema.RecordLikeObject & jsonschema.TopLevelFields;
}

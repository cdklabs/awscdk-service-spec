export namespace jsonschema {
  export type Schema = Reference | OneOf<Schema> | AnyOf<Schema> | AllOf<Schema> | ConcreteSingletonSchema;

  export type ConcreteSchema =
    | ConcreteSingletonSchema
    | OneOf<ConcreteSchema>
    | AnyOf<ConcreteSchema>
    | AllOf<ConcreteSchema>;

  export type ConcreteSingletonSchema = Object | String | SchemaArray | Boolean | Number | Null | AnyType;

  export type AnyType = true;

  export interface Annotatable {
    readonly $comment?: string;
    readonly description?: string;
    readonly title?: string;
  }

  export interface Reference extends Annotatable {
    readonly $ref: string;
    // A ref may have any number of other fields (I think they are supposed to combine with the referencee)
    [k: string]: unknown;
  }

  export function isAnyType(x: Schema): x is AnyType {
    return x === true;
  }

  export type CombiningSchema<X> = OneOf<X> | AnyOf<X> | AllOf<X>;

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

  export function isAnyOf(x: Schema): x is AnyOf<any> {
    return !isAnyType(x) && 'anyOf' in x;
  }

  export interface OneOf<S> extends Annotatable {
    readonly oneOf: Array<S>;
  }

  export function isOneOf(x: Schema): x is OneOf<any> {
    return !isAnyType(x) && 'oneOf' in x;
  }

  export interface AllOf<S> extends Annotatable {
    readonly allOf: Array<S>;
  }

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

  export interface Boolean extends Annotatable {
    readonly type: 'boolean';
    readonly default?: boolean;
  }

  export interface ResolvedSchema {
    /**
     * The resolved reference
     */
    readonly schema: ConcreteSchema;

    /**
     * The last part of the path of the reference we resolved, if any
     */
    readonly referenceName?: string;
  }

  /**
   * Make a resolver function that will resolve `$ref` entries with respect to the given document root.
   */
  export function makeResolver(root: any) {
    const resolve = (ref: Schema): ResolvedSchema => {
      if (!isReference(ref)) {
        // If this is a oneOf or anyOf, make sure the types inside the oneOf or anyOf get resolved
        if (isOneOf(ref)) {
          return {
            schema: {
              oneOf: ref.oneOf.map((x) => resolve(x).schema),
            },
          };
        } else if (isAnyOf(ref)) {
          return {
            schema: {
              anyOf: ref.anyOf.map((x) => resolve(x).schema),
            },
          };
        } else if (isAllOf(ref)) {
          return {
            schema: {
              allOf: ref.allOf.map((x) => resolve(x).schema),
            },
          };
        } else {
          return { schema: ref };
        }
      }

      const path = ref.$ref;
      if (!path.startsWith('#/')) {
        throw new Error(`Can only resolve references inside the same file, got '${path}'`);
      }

      const parts = path.substring(2).split('/');
      let current = root;
      let lastKey: string | undefined;
      while (true) {
        if (parts.length === 0) {
          break;
        }
        lastKey = parts.shift()!;
        current = current[lastKey];
      }

      // Some funny people have decided to reference a reference, so we might
      // need to recurse here.
      return isReference(current) ? resolve(current) : { schema: current, referenceName: lastKey };
    };
    return resolve;
  }

  /**
   * The type of a resolver function
   */
  export type Resolver = ReturnType<typeof makeResolver>;

  export function isReference(x: Schema): x is Reference {
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

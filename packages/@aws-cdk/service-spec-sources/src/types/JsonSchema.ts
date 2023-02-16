export namespace jsonschema {

  export type Schema = Reference | ConcreteSchema;

  export type ConcreteSchema = Object | UnionType | OneOf | AnyOf | String | SchemaArray | Boolean | Number;
  export interface Annotatable {
    readonly $comment?: string;
    readonly description?: string;
  }

  export interface Reference extends Annotatable {
    readonly '$ref': string;
    readonly [other: string]: unknown;
  }

  export type Object = MapLikeObject | RecordLikeObject;

  export interface AnyOf extends Annotatable {
    readonly anyOf: Array<Schema>;
    readonly additionalProperties?: false;
  }

  export function isAnyOf(x: Schema): x is AnyOf {
    return 'anyOf' in x;
  }
  export interface OneOf extends Annotatable {
    readonly oneOf: Array<Schema>;
    readonly additionalProperties?: false;
  }

  export function isOneOf(x: Schema): x is OneOf {
    return 'oneOf' in x;
  }

  export interface MapLikeObject extends Annotatable {
    readonly type: 'object';
    /**
     * Simplification:
     *
     * { additionalProperties: X }
     *       <===>
     * { patternProperties: { ".*": X }}
     */
    readonly additionalProperties?: false | Schema;
    readonly patternProperties?: Record<string, Schema>;
    readonly minProperties?: number;
    readonly maxProperties?: number;
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
    readonly oneOf?: Array<{ required?: string[], type?: string }>;
    readonly anyOf?: Array<{ required?: string[], type?: string }>;
  }

  export function isRecordLikeObject(x: Object): x is RecordLikeObject {
    const ret = !!(x as RecordLikeObject).properties;

    // Do a sanity check of our understanding
    if (ret && (x as MapLikeObject).additionalProperties || (x as MapLikeObject).patternProperties) {
      throw new Error(`object with properties should not have additionalProperties or patternProperties: ${JSON.stringify(x)}`);
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
    readonly enum?: string[];
    readonly format?: 'date-time';
    readonly examples?: string[];
  }

  export interface Number extends Annotatable {
    readonly type: 'number' | 'integer';
    readonly default?: number;
    readonly enum?: number[];
    readonly minimum?: number;
    readonly maximum?: number;
  }

  export interface SchemaArray extends Annotatable {
    readonly type: 'array';
    readonly items: Schema;
    readonly uniqueItems?: boolean;

    /**
     * Whether to treat the order as significant
     *
     * In other words, does this array model a "sequence" or a "set".
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
  }

  export interface Boolean extends Annotatable {
    readonly type: 'boolean';
    readonly default?: boolean;
  }

  export interface UnionType extends Annotatable {
    readonly type: string[];
  }

  export function isUnionType(x: Schema): boolean {
    return typeof (x as unknown as UnionType).type !== 'string';
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
  export function resolveReference(root: any) {
    return (ref: Schema): ResolvedSchema => {
      if (!isReference(ref)) { return { schema: ref }; }

      const path = ref.$ref;
      if (!path.startsWith('#/')) {
        throw new Error(`Can only resolve references inside the same file, got '${path}'`);
      }

      const parts = path.substring(2).split('/');
      let current = root;
      while (true) {
        const name = parts.shift();
        if (!name) { break; }
        current = current[name];
      }
      return { schema: current, referenceName: parts[parts.length - 1] };
    };
  }

  /**
   * The type of a resolver function
   */
  export type Resolver = ReturnType<typeof resolveReference>;

  export function isReference(x: Schema): x is Reference {
    return '$ref' in x;
  }

}
export namespace jsonschema {

  export type Schema = Reference | ConcreteSchema;

  export type ConcreteSchema = Object | String | SchemaArray | Boolean | Number;

  export interface Reference {
    readonly '$ref': string;
  }

  export interface Annotatable {
    readonly $comment?: string;
    readonly description?: string;
  }

  export type Object = MapLikeObject | RecordLikeObject;

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
  }

  export type ObjectProperties = Record<string, Schema>;

  export interface RecordLikeObject extends Annotatable {
    readonly type: 'object';
    readonly properties: ObjectProperties;
    readonly required?: string[];
    readonly additionalProperties?: false | Schema;
    readonly patternProperties?: Record<string, Schema>;
    readonly title?: string;
    readonly anyOf?: Array<Partial<Object>>;
    readonly allOf?: Array<Partial<Object>>;
    readonly oneOf?: Array<Partial<Object>>;
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
    readonly format?: 'date-time' | 'timestamp' | 'int64' | 'double' | 'uri' | '(^arn:[a-z\\d-]+:rekognition:[a-z\\d-]+:\\d{12}:collection\\/([a-zA-Z0-9_.\\-]+){1,255})';
    readonly anyOf?: Array<Partial<String>>;
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
    readonly insertionOrder?: boolean;
    readonly minLength?: number;
    readonly maxLength?: number;
  }

  export interface Boolean extends Annotatable {
    readonly type: 'boolean';
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
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

  export type ObjectProperties = Record<string, Schema>;

  export interface Object extends Annotatable {
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

  export function resolveReference(root: any) {
    return (ref: Schema): ResolvedSchema => {
      if (!isReference(ref)) { return { schema: ref }; }

      const path = ref.$ref;
      if (!path.startsWith('#/')) {
        throw new Error(`Can only resolve references inside the same file, got '${path}'`);
      }

      const parts = path.split('/');
      let current = root;
      while (true) {
        const name = parts.shift();
        if (!name) { break; }
        current = current[name];
      }
      return { schema: current, referenceName: parts[parts.length - 1] };
    };
  }

  function isReference(x: Schema): x is Reference {
    return '$ref' in x;
  }
}
export namespace jsonschema {

  export type Schema = Reference | ConcreteSchema;

  export type ConcreteSchema = Object | String | Array | Boolean;

  export interface Reference {
    readonly '$ref': string;
  }

  export type ObjectProperties = ArbitraryMap<Schema>;

  export interface Object {
    readonly type: 'object';
    readonly description?: string;
    readonly properties: ObjectProperties;
    readonly required?: string[];
    readonly additionalProperties?: false | Schema;
    readonly patternProperties?: ArbitraryMap<Schema>;
  }

  export interface String {
    readonly type: 'string';
    readonly default?: string;
    readonly description?: string;
    readonly minLength?: number;
    readonly maxLength?: number;
    readonly pattern?: string;
    readonly enum?: string;
    readonly format?: 'date-time';
  }

  export interface Array {
    readonly type: 'array';
    readonly items: Schema;
    readonly description?: string;
    readonly uniqueItems?: boolean;
    readonly insertionOrder?: boolean;
  }

  export interface Boolean {
    readonly type: 'boolean';
    readonly items: Schema;
    readonly description?: string;
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

/**
 * A map with an annotation so that `typescript-json-schema` will allow arbitrary properties
 */
export type ArbitraryMap<A> = Record<string, A>;

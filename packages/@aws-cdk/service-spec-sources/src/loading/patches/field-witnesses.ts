import { jsonschema } from '../../types';

/**
 * A type that requires it to contain all keys from another type
 *
 * Forcing developers to type out a Javascript expression and having TypeScript
 * check that it is complete is the only way to get a list of keys defined in a type.
 */
export type TypeKeyWitness<T extends object> = { [K in keyof T]-?: true };

export const STRING_KEY_WITNESS: TypeKeyWitness<jsonschema.String> = {
  type: true,
  $comment: true,
  default: true,
  description: true,
  enum: true,
  examples: true,
  format: true,
  maxLength: true,
  minLength: true,
  pattern: true,
  title: true,
};

export const OBJECT_KEY_WITNESS: TypeKeyWitness<jsonschema.Object> = {
  type: true,
  $comment: true,
  description: true,
  additionalProperties: true,
  maxProperties: true,
  minProperties: true,
  patternProperties: true,
  properties: true,
  required: true,
  title: true,
};

export const ARRAY_KEY_WITNESS: TypeKeyWitness<jsonschema.SchemaArray> = {
  type: true,
  $comment: true,
  description: true,
  default: true,
  examples: true,
  insertionOrder: true,
  items: true,
  maxItems: true,
  minItems: true,
  title: true,
  uniqueItems: true,
};

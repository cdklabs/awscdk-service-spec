import { Entity, Reference } from '@cdklabs/tskb';

export type GenericPropertyType<T extends Entity> =
  | PrimitiveType
  | GenericDefinitionReference<T>
  | BuiltinTagType
  | ArrayType<GenericPropertyType<T>>
  | MapType<GenericPropertyType<T>>
  | TypeUnion<GenericPropertyType<T>>;

export type PrimitiveType =
  | StringType
  | NumberType
  | IntegerType
  | BooleanType
  | JsonType
  | DateTimeType
  | NullType
  | BuiltinTagType;

export interface StringType {
  readonly type: 'string';
}
/**
 * The "legacy" tag type (used in the old resource spec)
 */
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

export interface DateTimeType {
  readonly type: 'date-time';
}

export interface NullType {
  readonly type: 'null';
}

/**
 *
 * T is the entity type for compound objects.
 *
 * For example: TypeDefinition, EventTypeDefinition.
 */
export interface GenericDefinitionReference<T extends Entity> {
  readonly type: 'ref';
  readonly reference: Reference<T>;
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

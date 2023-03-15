import { Entity, evolutionInvariant, impliesU, Invariant, Reference, Relationship } from '@cdklabs/tskb';

export const Invariants: Invariant[] = [];

export interface Partition extends Entity {
  readonly partition: string;
}

export type HasRegion = Relationship<Partition, Region, { isPrimary?: boolean }>;

export interface Service extends Entity {
  readonly shortName: string;
  readonly name: string;
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
  documentation?: string;
  readonly properties: ResourceProperties;
  readonly attributes: Record<string, Attribute>;
  readonly validations?: unknown;
  identifier?: ResourceIdentifier;
  isStateful?: boolean;

  /**
   * The name of the property that contains the tags
   *
   * Undefined if the resource is not taggable.
   */
  tagPropertyName?: string;

  /**
   * What type of tags
   */
  tagType?: TagType;
}

export type TagType = 'standard' | 'asg' | 'map';

export type ResourceProperties = Record<string, Property>;

export interface TypeDefinition extends Entity {
  readonly name: string;
  documentation?: string;
  readonly properties: ResourceProperties;
}

export interface Property {
  documentation?: string;
  required?: boolean;
  type: PropertyType;
  wasOnceJson?: boolean;
  defaultValue?: string;
  deprecated?: Deprecation;
}

export interface Attribute {
  documentation?: string;
  type: PropertyType;
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

// FIXME: Should properties & attributes be entities or not?

Invariants.push(
  evolutionInvariant<Property>('wasOnceJson may never be switched off', (prev, cur) =>
    impliesU(prev.wasOnceJson, cur.wasOnceJson),
  ),
);

export type PropertyType =
  | PrimitiveType
  | BuiltInType
  | DefinitionReference
  | ArrayType<PropertyType>
  | MapType<PropertyType>;

export type PrimitiveType = StringType | NumberType | BooleanType | JsonType | NullType;

export function isPrimitiveType(x: PropertyType): x is PrimitiveType {
  return (x as any).type;
}

export interface BuiltInType {
  readonly type: 'builtIn';
  readonly builtInType: 'tag';
}

export interface StringType {
  readonly type: 'string';
}

export interface NumberType {
  readonly type: 'number';
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

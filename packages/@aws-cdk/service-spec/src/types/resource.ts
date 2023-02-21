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
  readonly documentation?: string;
  readonly properties: ResourceProperties;
  readonly attributes: Record<string, Attribute>;
  readonly validations?: unknown;
  readonly identifier?: ResourceIdentifier;
  isStateful?: boolean;
}

export type ResourceProperties = Record<string, Property>;

export interface TypeDefinition extends Entity {
  readonly name: string;
  readonly documentation?: string;
  readonly properties: ResourceProperties;
}

export interface Property {
  readonly documentation?: string;
  readonly required?: boolean;
  readonly type: PropertyType;
  readonly wasOnceJson?: boolean;
}

export interface Attribute {
  readonly documentation?: string;
  readonly type: PropertyType;
}

// FIXME: Should properties & attributes be entities or not?

Invariants.push(evolutionInvariant<Property>(
  'wasOnceJson may never be switched off',
  (prev, cur) => impliesU(prev.wasOnceJson, cur.wasOnceJson),
));


export type PropertyType = PrimitiveType | DefinitionReference | ArrayType<PropertyType> | MapType<PropertyType>;

export type PrimitiveType = StringType | NumberType | BooleanType | JsonType;

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
export type ResourceDoc = Relationship<Resource, Documentation>;

export type ServiceInRegion = Relationship<Region, Service>;
export type ResourceInRegion = Relationship<Region, Resource>;

export type UsesType = Relationship<Resource, TypeDefinition>;


export interface ResourceIdentifier extends Entity {
  readonly arnTemplate?: string;
  readonly primaryIdentifier?: string[];
}
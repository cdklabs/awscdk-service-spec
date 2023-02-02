import { Entity, Relationship } from '@cdklabs/tskb';

export interface Service extends Entity {
  readonly shortName: string;
  readonly name: string;
}

export interface Region extends Entity {
  readonly name: string;
  readonly description: string;
}

export interface Resource extends Entity {
  readonly name: string;
  readonly documentation: string;
  readonly cloudFormationType: string;
  readonly properties: Record<string, ResourceProperty>;
  readonly attributes: Record<string, ResourceProperty>;
  readonly validations?: unknown;
  readonly identifier?: ResourceIdentifier;
  readonly isStateful?: boolean;
}

export type HasResource = Relationship<Service, Resource>;
export type HasResourceWAttrs = Relationship<Service, Resource, { attr: number }>;

export type ServiceInRegion = Relationship<Region, Service>;
export type ResourceInRegion = Relationship<Region, Resource>;


export interface ResourceProperty extends Entity {
  readonly name: string;
  readonly documentation: string;
}

export interface ResourceIdentifier extends Entity {
  readonly arnTemplate?: string;
  readonly primaryIdentifier?: string[];
}
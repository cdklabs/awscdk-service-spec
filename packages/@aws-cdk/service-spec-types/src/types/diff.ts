import { Attribute, Property, PropertyType, Resource, Service, TypeDefinition } from './resource';

export interface SpecDatabaseDiff {
  readonly services: ListDiff<Service, UpdatedService>;
  readonly resources: ListDiff<Resource, UpdatedResource>;
  readonly typeDefinitions: ListDiff<TypeDefinition, UpdatedTypeDefinition>;
}

export interface ListDiff<E, ED> {
  readonly added: E[];
  readonly removed: E[];
  readonly updated: ED[];
}

export interface MapDiff<E, ED> {
  readonly added: Record<string, E>;
  readonly removed: Record<string, E>;
  readonly updated: Record<string, ED>;
}

interface UpdatedService {
  readonly name?: ScalarDiff<Service['name']>;
  readonly shortName?: ScalarDiff<Service['shortName']>;
  readonly capitalized?: ScalarDiff<Service['capitalized']>;
  readonly cloudFormationNamespace?: ScalarDiff<Service['cloudFormationNamespace']>;
}

interface UpdatedResource {
  readonly name?: ScalarDiff<string>;
  readonly cloudFormationType?: ScalarDiff<string>;
  readonly cloudFormationTransform?: ScalarDiff<string>;
  readonly documentation?: ScalarDiff<string>;
  readonly properties?: MapDiff<Property, UpdatedProperty>;
  readonly attributes?: MapDiff<Attribute, UpdatedAttribute>;
  readonly identifier?: ScalarDiff<Resource['identifier']>;
  readonly isStateful?: ScalarDiff<boolean>;
  readonly tagInformation?: ScalarDiff<Resource['tagInformation']>;
  readonly scrutinizable?: ScalarDiff<Resource['scrutinizable']>;
}

interface UpdatedProperty {
  readonly documentation?: ScalarDiff<Property['documentation']>;
  readonly required?: ScalarDiff<boolean>;
  readonly type?: ScalarDiff<PropertyType>;
  readonly previousTypes?: ListDiff<PropertyType, void>;
  readonly defaultValue?: ScalarDiff<string>;
  readonly deprecated?: ScalarDiff<Property['deprecated']>;
  readonly scrutinizable?: ScalarDiff<Property['scrutinizable']>;
}

interface UpdatedAttribute {
  readonly documentation?: string;
  readonly type?: ScalarDiff<PropertyType>;
  readonly previousTypes?: ListDiff<PropertyType, void>;
}

interface UpdatedTypeDefinition {
  readonly name?: ScalarDiff<string>;
  readonly documentation?: ScalarDiff<string>;
  readonly properties?: MapDiff<Property, UpdatedProperty>;
  readonly mustRenderForBwCompat?: ScalarDiff<boolean>;
}

interface ScalarDiff<A> {
  readonly old?: A;
  readonly new?: A;
}

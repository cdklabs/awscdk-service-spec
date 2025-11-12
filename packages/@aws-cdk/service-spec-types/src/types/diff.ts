import { Metric } from './metrics';
import { Attribute, Property, Resource, Service, TypeDefinition } from './resource';

export interface SpecDatabaseDiff {
  services: MapDiff<Service, UpdatedService>;
}

export interface ListDiff<E, ED> {
  readonly added?: E[];
  readonly removed?: E[];
  readonly updated?: ED[];
}

export interface MapDiff<E, ED> {
  readonly added?: Record<string, E>;
  readonly removed?: Record<string, E>;
  readonly updated?: Record<string, ED>;
}

export interface UpdatedService {
  readonly name?: ScalarDiff<Service['name']>;
  readonly shortName?: ScalarDiff<Service['shortName']>;
  readonly capitalized?: ScalarDiff<Service['capitalized']>;
  readonly cloudFormationNamespace?: ScalarDiff<Service['cloudFormationNamespace']>;
  readonly resourceDiff?: MapDiff<Resource, UpdatedResource>;
  readonly metrics?: MapDiff<Metric, ChangedMetric>;
}

export interface ChangedMetric {
  readonly statistic?: ScalarDiff<string>;
}

export interface UpdatedResource {
  readonly name?: ScalarDiff<string>;
  readonly cloudFormationType?: ScalarDiff<string>;
  readonly cloudFormationTransform?: ScalarDiff<string>;
  readonly documentation?: ScalarDiff<string>;
  readonly properties?: MapDiff<Property, UpdatedProperty>;
  readonly attributes?: MapDiff<Attribute, UpdatedAttribute>;
  readonly arnTemplate?: ScalarDiff<string>;
  readonly isStateful?: ScalarDiff<boolean>;
  readonly tagInformation?: ScalarDiff<Resource['tagInformation']>;
  readonly scrutinizable?: ScalarDiff<Resource['scrutinizable']>;
  readonly typeDefinitionDiff?: MapDiff<TypeDefinition, UpdatedTypeDefinition>;
  readonly primaryIdentifier?: ListDiff<string, void>;
  readonly logTypes?: ListDiff<string, void>;
  readonly metrics?: MapDiff<Metric, ChangedMetric>;
}

export interface UpdatedProperty {
  readonly old: Property;
  readonly new: Property;
}

export interface UpdatedAttribute {
  readonly old: Attribute;
  readonly new: Attribute;
}

export interface UpdatedTypeDefinition {
  readonly name?: ScalarDiff<string>;
  readonly documentation?: ScalarDiff<string>;
  readonly properties?: MapDiff<Property, UpdatedProperty>;
  readonly mustRenderForBwCompat?: ScalarDiff<boolean>;
}

export interface ScalarDiff<A> {
  readonly old?: A;
  readonly new?: A;
}
